import express from "express";
import bcrypt from "bcrypt";
import jwt, { JwtPayload } from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const router = express.Router();
const prisma = new PrismaClient();
import crypto from "crypto";
import { sendEmail } from "../service/mailing";
import { validateDTO } from "../middleware/validation";
import { RegisterDTO } from "../dtos/RegisterDTO";
import { authenticateUser } from "../middleware/auth";

// Función para generar JWT
const generateToken = (userId: number, role: string) => {
  const accessToken = jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "15minutes" });
  const refreshToken = jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET!, { expiresIn: "7days" });
  return { accessToken, refreshToken };
};

router.get("/me", authenticateUser, async (req: any, res) => {
  res.json(req.user);
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

    res.json({ user, accessToken });
  } catch (err) {
    console.error(err);
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

    const verifyLink = `${process.env.HOST}/api/auth/verify-email?token=${emailVerifyToken}&email=${encodeURIComponent(email)}`;

    sendEmail(email, "Verifica tu email", `
            <p>Hola ${name},</p>
            <p>Gracias por registrarte. Por favor confirma tu email haciendo click en el enlace:</p>
            <a href="${verifyLink}">Verificar email</a>

            <script>
      // Esto se ejecutará cuando la página de verificación cargue en el navegador
      setTimeout(() => {
        window.close(); // intenta cerrar la ventana
      }, 2000); // 2000ms = 2 segundos
    </script>
        `)

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

    res.status(201).json({ user, accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server errork" });
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
    console.error(err);
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
