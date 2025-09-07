import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
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
  return jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: "1h" });
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

    // Verificar contraseña
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: "Invalid credentials" });

    // Generar token
    const token = generateToken(user.id, user.role);

    res.json({ user, token });
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
    const token = generateToken(user.id, user.role);

    res.status(201).json({ user, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server errork" });
  }
});

// POST /api/auth/logout
router.post("/logout", async (_req, res) => {
  try {
    // Con JWT no necesitamos invalidar sesión en servidor a menos que implementes blacklist
    res.json({ message: "Logout endpoint (manejado en frontend)" });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
