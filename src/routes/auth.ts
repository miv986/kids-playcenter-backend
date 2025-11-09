import express from "express";
import bcrypt from "bcrypt";
import jwt, { JwtPayload } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { authRateLimiter, strictRateLimiter } from "../middleware/security";
import { secureLogger } from "../utils/logger";

const router = express.Router();
const prisma = new PrismaClient();
import crypto from "crypto";
import { sendTemplatedEmail } from "../service/mailing";
import { getVerificationEmail } from "../service/emailTemplates";
import { validateDTO } from "../middleware/validation";
import { RegisterDTO } from "../dtos/RegisterDTO";
import { authenticateUser } from "../middleware/auth";

// Función para generar JWT
const generateToken = (userId: number, role: string) => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "15minutes" });
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
router.post("/login", authRateLimiter, async (req, res) => {
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
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 días
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
    secureLogger.error("Error en login", { email: req.body.email });
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/verify-email", async (req: any, res: any) => {
  const { token, email } = req.query;

  if (!token || !email) return res.status(400).send("Token o email faltante");

  try {
    const user = await prisma.user.findUnique({
      where: { email: String(email) },
    });

    if (!user) return res.status(404).send("Usuario no encontrado");
    if (user.isEmailVerified) return res.status(400).send("Email ya verificado");
    if (user.emailVerifyToken !== token) return res.status(400).send("Token inválido");

    // Actualizar usuario como verificado y borrar token
    await prisma.user.update({
      where: { email: String(email) },
      data: {
        isEmailVerified: true,
        emailVerifyToken: null,
      },
    });

    res.status(200).send("Email verificado correctamente");
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

// POST /api/auth/register
router.post("/register", authRateLimiter, validateDTO(RegisterDTO), async (req, res) => {
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

    // Construir el enlace de verificación - debe apuntar al BACKEND, no al frontend
    // En desarrollo, usar localhost automáticamente
    let backendUrl: string;
    
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
        // En desarrollo, usar localhost por defecto (a menos que se especifique BACKEND_URL)
        backendUrl = process.env.BACKEND_URL || "http://localhost:4000";
    } else {
        // En producción, usar BACKEND_URL o API_URL
        backendUrl = process.env.BACKEND_URL 
            || process.env.API_URL 
            || (process.env.HOST && process.env.HOST.includes('/api') ? process.env.HOST.replace('/api', '') : null)
            || process.env.HOST
            || "http://localhost:4000";
    }
    
    if (!process.env.BACKEND_URL && process.env.NODE_ENV === 'production') {
        secureLogger.warn("BACKEND_URL no está configurado en producción");
    }

    // Asegurar que el backend URL no termine con / y construir el enlace completo
    const cleanBackendUrl = backendUrl.replace(/\/$/, '');
    const verifyLink = `${cleanBackendUrl}/api/auth/verify-email?token=${emailVerifyToken}&email=${encodeURIComponent(email)}`;
    
    secureLogger.debug("Enlace de verificación generado", { environment: process.env.NODE_ENV || 'development' });

    // Enviar email de verificación usando plantilla
    try {
        const emailData = getVerificationEmail(name, verifyLink);
        await sendTemplatedEmail(
            email,
            "Verifica tu correo electrónico - Somriures & Colors",
            emailData
        );
        secureLogger.info(`Email de verificación enviado`, { email });
    } catch (emailError) {
        secureLogger.error("Error enviando email de verificación", { email });
        // No fallar el registro si falla el email
    }

    // Generar token
    const { accessToken, refreshToken } = generateToken(user.id, user.role);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 días
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
    secureLogger.error("Error en registro", { email: req.body.email });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: "Missing refresh token" });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { userId: number };

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
      { expiresIn: "15minutes" }
    );

    res.json({ accessToken });
  } catch (err) {
    secureLogger.warn("Error en refresh token");
    res.status(401).json({ error: "Invalid or expired refresh token" });
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
