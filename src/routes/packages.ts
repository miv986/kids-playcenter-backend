import express from "express";
import { authenticateUser } from "../middleware/auth";
import { PrismaClient } from "@prisma/client";
import { validateDTO } from "../middleware/validation";
import { UpdatePackageDTO } from "../dtos/UpdatePackageDTO";
import { secureLogger } from "../utils/logger";

const prisma = new PrismaClient();
const router = express.Router();

// GET /api/packages - Obtener todos los packs (público)
router.get("/", async (req: any, res) => {
  try {
    const packages = await prisma.birthdayPackage.findMany({
      where: { isActive: true },
      orderBy: { priceValue: 'asc' }
    });
    res.json(packages);
  } catch (err) {
    secureLogger.error("Error obteniendo paquetes");
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /api/packages/all - Obtener todos los packs (admin)
router.get("/all", authenticateUser, async (req: any, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  try {
    const packages = await prisma.birthdayPackage.findMany({
      orderBy: { priceValue: 'asc' }
    });
    res.json(packages);
  } catch (err) {
    secureLogger.error("Error obteniendo paquetes");
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /api/packages/:type - Actualizar un pack (admin)
router.put("/:type", authenticateUser, validateDTO(UpdatePackageDTO), async (req: any, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { type } = req.params;

  try {
    const updatedPackage = await prisma.birthdayPackage.update({
      where: { type },
      data: req.body
    });
    res.json(updatedPackage);
  } catch (err) {
    secureLogger.error("Error actualizando paquete", { adminId: req.user.id, type });
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;

