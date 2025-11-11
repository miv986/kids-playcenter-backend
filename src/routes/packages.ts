import express from "express";
import { authenticateUser } from "../middleware/auth";
import { PrismaClient } from "@prisma/client";
import { validateDTO } from "../middleware/validation";
import { UpdatePackageDTO } from "../dtos/UpdatePackageDTO";

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
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /api/packages/:type - Actualizar un pack (admin)
router.put("/:type", authenticateUser, validateDTO(UpdatePackageDTO), async (req: any, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { type } = req.params;

  try {
    // Filtrar solo los campos permitidos para actualizar
    const allowedFields = ['name', 'duration', 'price', 'priceValue', 'featuresEs', 'featuresVa', 'perChildTextEs', 'perChildTextVa', 'isPopular', 'isActive'];
    const updateData: any = {};
    
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    const updatedPackage = await prisma.birthdayPackage.update({
      where: { type },
      data: updateData
    });
    res.json(updatedPackage);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

