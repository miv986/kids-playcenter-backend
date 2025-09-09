import { Prisma, PrismaClient, Role } from "@prisma/client";
import express from "express";
import { authenticateUser } from "../middleware/auth";
import { CreateChildDTO } from "../dtos/CreateChildDTO";
import { validateDTO } from "../middleware/validation";
const prisma = new PrismaClient();

const router = express.Router();
//
// USERS - CREAR HIJOS - ACTUALIZAR - ELIMINAR 
//
router.post('/addChild', authenticateUser, validateDTO(CreateChildDTO), async (req: any, res) => {
  try {

    const { name, surname, dateOfBirth, notes, medicalNotes, allergies, emergency_contact_name_1, emergency_phone_1 } = req.body;
    console.log(req, "REQ");
    const user_id = req.user.id;
    if (!user_id) {
      return res.status(401).json({ error: "Tutor no autenticado" });
    }
    const child = await prisma.user.create({
      data: {
        name: name,
        surname: surname,
        dateOfBirth: new Date(`${dateOfBirth}T00:00:00.000Z`),
        notes: notes,
        medicalNotes: medicalNotes,
        allergies: allergies,
        emergency_contact_name_1: emergency_contact_name_1,
        emergency_phone_1: emergency_phone_1,
        role: Role.CHILD,
        isEmailVerified: true,
        tutorId: user_id,

      } as Prisma.UserUncheckedCreateInput
    });
    res.status(201).json(child);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });

  }
});

// GET /api/children
router.get("/children", authenticateUser, async (req: any, res) => {
  const tutor_id = req.user.id;

  try {
    // Buscar todos los niños asociados a este tutor
    const children = await prisma.user.findMany({
      where: {
        tutorId: tutor_id,
        role: "CHILD", // aseguramos que solo traiga hijos
      },
      orderBy: {
        name: "asc", // opcional, orden alfabético
      },
      select: {
        id: true,
        name: true,
        surname: true,
        dateOfBirth: true,
        notes: true,
        medicalNotes: true,
        allergies: true,
        emergency_contact_name_1: true,
        emergency_phone_1: true,
        emergency_contact_name_2: true,
        emergency_phone_2: true,
      },
    });

    return res.status(200).json({ children });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: (error as Error).message });
  }
});


router.put("/updateChild/:childId", authenticateUser, async (req: any, res) => {
  const user_id = req.user.id;
  const child_id = parseInt(req.params.childId);

  if (isNaN(child_id)) {
    return res.status(400).json({ error: "childId inválido" });
  }
  try {

    const child = await prisma.user.findFirst({
      where: {
        tutorId: user_id,
        id: child_id
      },
    });

    if (!child) {
      return res.status(404).json({ error: "Child no encontrado o no autorizado" });
    }

    const { name, surname, notes, medicalNotes, allergies, emergency_contact_name_1, emergency_phone_1, emergency_contact_name_2, emergency_phone_2 } = req.body;

    const updateChild = await prisma.user.update({
      where: { id: child.id },
      data: {
        name: name,
        surname: surname,
        notes: notes,
        medicalNotes: medicalNotes,
        allergies: allergies,
        emergency_contact_name_1: emergency_contact_name_1,
        emergency_phone_1: emergency_phone_1,
        emergency_contact_name_2: emergency_contact_name_2,
        emergency_phone_2: emergency_phone_2,

      }
    });
    res.status(200).json(updateChild);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }

});

router.delete("/deleteChild/:childId", authenticateUser, async (req: any, res) => {
  const user_id = req.user.id;
  const user_role = req.user.role;
  const child_id = parseInt(req.params.childId);

  if (isNaN(child_id)) {
    return res.status(400).json({ error: "childId inválido" });
  }

  // Solo ADMIN puede borrar
  if (user_role !== "ADMIN") {
    return res.status(403).json({ error: "No autorizado: solo ADMIN puede borrar hijos" });
  }

  try {
    // Verificar que el child exista
    const child = await prisma.user.findUnique({
      where: { id: child_id },
    });

    if (!child || child.role !== "CHILD") {
      return res.status(404).json({ error: "Child no encontrado" });
    }

    // Borrar el child
    await prisma.user.delete({
      where: { id: child_id },
    });

    return res.status(200).json({ message: "Child eliminado correctamente" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: (error as Error).message });
  }
});


// GET /api/admin/tutor/:tutorId
router.get("/admin/tutor/:tutorId", authenticateUser, async (req: any, res) => {
  // Verificar que sea ADMIN
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "No autorizado" });
  }

  const tutorId = parseInt(req.params.tutorId);

  try {
    const tutorWithChildren = await prisma.user.findUnique({
      where: { id: tutorId },
      select: {
        id: true,
        name: true,
        surname: true,
        email: true,
        phone_number: true,
        children: {
          select: {
            id: true,
            name: true,
            surname: true,
            dateOfBirth: true,
            notes: true,
            medicalNotes: true,
            allergies: true,
            emergency_contact_name_1: true,
            emergency_phone_1: true,
            emergency_contact_name_2: true,
            emergency_phone_2: true,
          },
        },
      },
    });

    if (!tutorWithChildren) {
      return res.status(404).json({ error: "Tutor no encontrado" });
    }

    res.status(200).json(tutorWithChildren);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});


export default router;
