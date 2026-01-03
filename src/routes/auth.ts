import express from "express";
import bcrypt from "bcrypt";
import jwt, { JwtPayload } from "jsonwebtoken";
import prisma from "../utils/prisma";

const router = express.Router();
import crypto from "crypto";
import { sendTemplatedEmail } from "../service/mailing";
import { getVerificationEmail, getPasswordResetEmail } from "../service/emailTemplates";
import { validateDTO } from "../middleware/validation";
import { RegisterDTO } from "../dtos/RegisterDTO";
import { authenticateUser } from "../middleware/auth";

// Función para generar JWT
const generateToken = (userId: number, role: string) => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "2h" });
  const refreshToken = jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET!, { expiresIn: "7days" });
  return { accessToken, refreshToken };
};

// Función para filtrar campos sensibles del usuario - Solo enviar lo esencial
const sanitizeUser = (user: any) => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
};

router.get("/me", authenticateUser, async (req: any, res) => {
  const safeUser = sanitizeUser(req.user);
  res.json(safeUser);
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar usuario en DB
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    if (user.role !== "ADMIN" && user.role !== "USER") {
      return res.status(403).json({ error: "Este tipo de usuario no puede iniciar sesión" });
    }
    
    // Validar que el email esté verificado
    if (!user.isEmailVerified) {
      return res.status(403).json({ error: "Debes verificar tu correo electrónico antes de iniciar sesión" });
    }
    
    // Validar que tenga password
    if (!user.password) {
      return res.status(403).json({ error: "Usuario no tiene contraseña configurada" });
    }
    // Verificar contraseña
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    // Generar token
    const { accessToken, refreshToken } = generateToken(user.id, user.role);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    // Enviar el refresh token como cookie HTTP-only
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const safeUser = sanitizeUser(user);
    res.json({ user: safeUser, accessToken });
  } catch (err) {
    console.error("Error en login:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/verify-email", async (req: any, res: any) => {
  const { token, email } = req.query;

  // Obtener la URL del frontend
  const frontendUrl = process.env.NODE_ENV === 'development' 
    ? "http://localhost:3000"
    : process.env.FRONTEND_URL || process.env.WEBSITE_URL || "https://somriuresicolors.es";
  const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');

  // Detectar si es una petición de API (fetch con Accept: application/json)
  const acceptHeader = req.headers['accept'] || '';
  const isApiRequest = acceptHeader.includes('application/json') && 
                       !acceptHeader.includes('text/html') && 
                       !acceptHeader.includes('*/*');

  if (!token || !email) {
    if (isApiRequest) {
      return res.status(400).json({ error: "Token o email faltante" });
    }
    return res.redirect(`${cleanFrontendUrl}/verify-email?error=${encodeURIComponent("Token o email faltante")}`);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: String(email) },
    });

    if (!user) {
      if (isApiRequest) {
        return res.status(404).json({ error: "Usuario no encontrado" });
      }
      return res.redirect(`${cleanFrontendUrl}/verify-email?error=${encodeURIComponent("Usuario no encontrado")}`);
    }
    
    if (user.isEmailVerified) {
      if (isApiRequest) {
        return res.status(400).json({ error: "Email ya verificado" });
      }
      return res.redirect(`${cleanFrontendUrl}/verify-email?error=${encodeURIComponent("Email ya verificado")}`);
    }
    
    if (user.emailVerifyToken !== token) {
      if (isApiRequest) {
        return res.status(400).json({ error: "Token inválido" });
      }
      return res.redirect(`${cleanFrontendUrl}/verify-email?error=${encodeURIComponent("Token inválido")}`);
    }

    // Actualizar usuario como verificado y borrar token
    await prisma.user.update({
      where: { email: String(email) },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
      },
    });

    if (isApiRequest) {
      return res.status(200).json({ success: true, message: "Email verificado correctamente" });
    }
    
    return res.redirect(302, `${cleanFrontendUrl}/verify-email?success=true`);
  } catch (err: any) {
    if (isApiRequest) {
      return res.status(500).json({ error: err.message || "Error al verificar el email" });
    }
    return res.redirect(`${cleanFrontendUrl}/verify-email?error=${encodeURIComponent(err.message || "Error al verificar el email")}`);
  }
});

// POST /api/auth/register
router.post("/register", validateDTO(RegisterDTO), async (req, res) => {
  try {
    const { email, password, name, surname, phone_number } = req.body;
    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: "User already exists" });

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 10);
    const emailVerifyToken = crypto.randomBytes(32).toString("hex");

    // Crear usuario
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        surname,
        phone_number,
        emailVerifyToken,
        isEmailVerified: false,
        role: "USER",
      },
    });

    // Construir el enlace de verificación
    const backendUrl = process.env.NODE_ENV === 'development'
      ? "http://localhost:4000"
      : process.env.BACKEND_URL 
          || process.env.API_URL 
          || (process.env.HOST && process.env.HOST.includes('/api') ? process.env.HOST.replace('/api', '') : null)
          || process.env.HOST
          || "http://localhost:4000";
    
    const cleanBackendUrl = backendUrl.replace(/\/$/, '');
    const verifyLink = `${cleanBackendUrl}/api/auth/verify-email?token=${emailVerifyToken}&email=${encodeURIComponent(email)}`;

    // Enviar email de verificación usando plantilla
    try {
        const emailData = getVerificationEmail(name, verifyLink);
        await sendTemplatedEmail(
            email,
            "Verifica tu correo electrónico - Somriures & Colors",
            emailData
        );
        console.log(`✅ Email de verificación enviado a ${email}`);
    } catch (emailError) {
        console.error("Error enviando email de verificación:", emailError);
        // No fallar el registro si falla el email
    }

    // Generar token
    const { accessToken, refreshToken } = generateToken(user.id, user.role);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días
      },
    });

    // Enviar el refresh token como cookie HTTP-only
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const safeUser = sanitizeUser(user);
    res.status(201).json({ user: safeUser, accessToken });
  } catch (err) {
    console.error("Error en registro:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: "Missing refresh token" });

  // Verificar que el secret esté configurado
  if (!process.env.JWT_REFRESH_SECRET) {
    console.error("JWT_REFRESH_SECRET no está configurado");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET) as { userId: number };

    // Verificar en DB que el refresh token existe y no expiró
    const storedToken = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!storedToken || storedToken.expiresAt < new Date()) {
      return res.status(401).json({ error: "Refresh token expired or invalid" });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Generar nuevo access token
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: "2h" }
    );

    res.json({ accessToken });
  } catch (err: any) {
    if (err.name === "JsonWebTokenError") {
      if (err.message === "invalid signature") {
        console.error("Error en refresh token: invalid signature - El secret puede haber cambiado o el token fue firmado con un secret diferente");
        // Si el token tiene firma inválida, puede ser que el secret cambió
        // Eliminar el token de la DB para forzar nuevo login
        await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {});
        return res.status(401).json({ error: "Token inválido. Por favor, inicia sesión nuevamente" });
      }
      console.error("Error en refresh token (JWT):", err.message);
    } else if (err.name === "TokenExpiredError") {
      console.warn("Refresh token expirado");
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } }).catch(() => {});
      return res.status(401).json({ error: "Token expirado. Por favor, inicia sesión nuevamente" });
    } else {
      console.error("Error en refresh token:", err);
    }
    res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});



// POST /api/auth/forgot-password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email es requerido" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    
    // Por seguridad, siempre devolvemos éxito aunque el email no exista
    if (!user) {
      return res.json({ message: "Si el email existe, recibirás un enlace de recuperación" });
    }

    if (user.role !== "ADMIN" && user.role !== "USER") {
      return res.json({ message: "Si el email existe, recibirás un enlace de recuperación" });
    }

    // Generar token de recuperación
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.user.update({
      where: { email },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpires: resetExpires,
      },
    });

    // Construir el enlace de recuperación
    const frontendUrl = process.env.NODE_ENV === 'development'
      ? "http://localhost:3000"
      : process.env.FRONTEND_URL || process.env.WEBSITE_URL || "https://somriuresicolors.es";
    
    const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');
    const resetLink = `${cleanFrontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // Enviar email de recuperación
    try {
      const emailData = getPasswordResetEmail(user.name, resetLink);
      await sendTemplatedEmail(
        email,
        "Recuperación de contraseña - Somriures & Colors",
        emailData
      );
      console.log(`✅ Email de recuperación de contraseña enviado a ${email}`);
    } catch (emailError) {
      console.error("Error enviando email de recuperación:", emailError);
      // No fallar si falla el email
    }

    res.json({ message: "Si el email existe, recibirás un enlace de recuperación" });
  } catch (err) {
    console.error("Error en forgot-password:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { token, email, password } = req.body;

    if (!token || !email || !password) {
      return res.status(400).json({ error: "Token, email y contraseña son requeridos" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (!user.passwordResetToken || user.passwordResetToken !== token) {
      return res.status(400).json({ error: "Token inválido" });
    }

    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      return res.status(400).json({ error: "El token ha expirado. Solicita uno nuevo" });
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Actualizar contraseña y limpiar token
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      },
    });

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (err) {
    console.error("Error en reset-password:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (_req, res) => {
  try {
    const refreshToken = _req.cookies.refreshToken;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      res.clearCookie("refreshToken");
    }    // Con JWT no necesitamos invalidar sesión en servidor a menos que implementes blacklist
    res.json({ message: "Logout out successfully" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
