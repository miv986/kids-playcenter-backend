import { Prisma, PrismaClient, Role } from "@prisma/client";
import express from "express";
import { authenticateUser } from "../middleware/auth";
import { CreateChildDTO } from "../dtos/CreateChildDTO";
import { validateDTO } from "../middleware/validation";
import { CreateChildNoteDTO } from "../dtos/CreateChildNoteDTO";
import prisma from "../utils/prisma";

const router = express.Router();
//
// USERS - CREAR HIJOS - ACTUALIZAR - ELIMINAR 
//
router.post('/addChild', authenticateUser, validateDTO(CreateChildDTO), async (req: any, res) => {
  try {

    const { name, surname, dateOfBirth, notes, medicalNotes, allergies, emergency_contact_name_1, emergency_phone_1, emergency_contact_name_2, emergency_phone_2 } = req.body;
    
    // ✅ Validaciones básicas
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "El nombre es requerido." });
    }
    if (!surname || !surname.trim()) {
      return res.status(400).json({ error: "El apellido es requerido." });
    }
    if (!dateOfBirth) {
      return res.status(400).json({ error: "La fecha de nacimiento es requerida." });
    }

    const user_id = req.user.id;
    if (!user_id) {
      return res.status(401).json({ error: "Tutor no autenticado" });
    }

    // ✅ Validar que la fecha de nacimiento sea válida
    const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
    if (isNaN(birthDate.getTime())) {
      return res.status(400).json({ error: "Fecha de nacimiento inválida." });
    }

    // ✅ Validar que la fecha de nacimiento no sea futura
    if (birthDate > new Date()) {
      return res.status(400).json({ error: "La fecha de nacimiento no puede ser futura." });
    }

    const child = await prisma.user.create({
      data: {
        name: name.trim(),
        surname: surname.trim(),
        dateOfBirth: birthDate,
        notes: notes,
        medicalNotes: medicalNotes,
        allergies: allergies,
        emergency_contact_name_1: emergency_contact_name_1,
        emergency_phone_1: emergency_phone_1,
        emergency_contact_name_2: emergency_contact_name_2,
        emergency_phone_2: emergency_phone_2,
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
    res.status(500).json({ error: (error as Error).message });
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


// GET /api/admin/tutors - Listar tutores con búsqueda y paginación (ADMIN)
router.get("/admin/tutors", authenticateUser, async (req: any, res) => {
  // Verificar que sea ADMIN
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const { search, page = "1", limit = "10" } = req.query;
    const searchQuery = search ? search.toLowerCase().trim() : "";
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Construir condiciones de búsqueda
    let whereClause: any = { 
      role: "USER",
      children: {
        some: {}
      }
    };

    if (searchQuery) {
      whereClause.OR = [
        { name: { contains: searchQuery, mode: "insensitive" } },
        { surname: { contains: searchQuery, mode: "insensitive" } },
        { email: { contains: searchQuery, mode: "insensitive" } },
        {
          children: {
            some: {
              OR: [
                { name: { contains: searchQuery, mode: "insensitive" } },
                { surname: { contains: searchQuery, mode: "insensitive" } }
              ]
            }
          }
        }
      ];
    }

    const [tutors, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
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
            orderBy: { name: "asc" }
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: limitNum
      }),
      prisma.user.count({ where: whereClause })
    ]);

    res.status(200).json({
      tutors,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});

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
//
// CHILD NOTES - ADMIN PUEDE DEJAR NOTAS A PADRES SOBRE SUS HIJOS
//

// PUT /api/admin/tutor/child/:childId - Actualizar notas de un hijo (ADMIN)
router.put("/admin/tutor/child/:childId", authenticateUser, async (req: any, res) => {
  // Verificar que sea ADMIN
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "No autorizado" });
  }

  const childId = parseInt(req.params.childId);

  try {
    const child = await prisma.user.findUnique({
      where: { id: childId, role: "CHILD" }
    });

    if (!child) {
      return res.status(404).json({ error: "Hijo no encontrado" });
    }

    const { notes, medicalNotes, allergies } = req.body;

    const updatedChild = await prisma.user.update({
      where: { id: childId },
      data: {
        notes: notes !== undefined ? notes : child.notes,
        medicalNotes: medicalNotes !== undefined ? medicalNotes : child.medicalNotes,
        allergies: allergies !== undefined ? allergies : child.allergies,
      }
    });

    res.status(200).json(updatedChild);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});



// POST /api/childNote - Crear una nota del admin para un niño (SOLO ADMIN)
router.post("/childNote", authenticateUser, validateDTO(CreateChildNoteDTO), async (req: any, res) => {
  // Verificar que sea ADMIN
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "No autorizado" });
  }

  try {
    const { childId, content, images } = req.body;
    const adminId = req.user.id;

    // Verificar que el niño existe
    const child = await prisma.user.findUnique({
      where: { id: childId, role: "CHILD" }
    });

    if (!child) {
      return res.status(404).json({ error: "Niño no encontrado" });
    }

    const note = await prisma.childNote.create({
      data: {
        childId,
        adminId,
        content,
        images: images || [],
        noteDate: new Date()
      },
      include: {
        child: {
          select: {
            id: true,
            name: true,
            surname: true
          }
        },
        admin: {
          select: {
            id: true,
            name: true,
            surname: true
          }
        }
      }
    });

    res.status(201).json(note);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// GET /api/childNote/child/:childId - Obtener notas de un niño específico
router.get("/childNote/child/:childId", authenticateUser, async (req: any, res) => {
  const childId = parseInt(req.params.childId);

  try {
    const child = await prisma.user.findUnique({
      where: { id: childId, role: "CHILD" }
    });

    if (!child) {
      return res.status(404).json({ error: "Niño no encontrado" });
    }

    // Si es el tutor del niño, puede ver las notas
    if (req.user.role === "ADMIN" || child.tutorId === req.user.id) {
      const notes = await prisma.childNote.findMany({
        where: { childId },
        include: {
          child: {
            select: {
              id: true,
              name: true,
              surname: true
            }
          },
          admin: {
            select: {
              id: true,
              name: true,
              surname: true
            }
          }
        },
        orderBy: {
          noteDate: "desc"
        }
      });

      return res.status(200).json(notes);
    }

    return res.status(403).json({ error: "No autorizado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/childNote/:noteId/read - Marcar nota como leída
router.put("/childNote/:noteId/read", authenticateUser, async (req: any, res) => {
  const noteId = parseInt(req.params.noteId);

  try {
    const note = await prisma.childNote.findUnique({
      where: { id: noteId },
      include: {
        child: true
      }
    });

    if (!note) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }

    // Solo el tutor puede marcar como leída
    if (note.child.tutorId !== req.user.id) {
      return res.status(403).json({ error: "No autorizado" });
    }

    const updatedNote = await prisma.childNote.update({
      where: { id: noteId },
      data: { isRead: true },
      include: {
        child: {
          select: {
            id: true,
            name: true,
            surname: true
          }
        },
        admin: {
          select: {
            id: true,
            name: true,
            surname: true
          }
        }
      }
    });

    res.status(200).json(updatedNote);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /api/childNote/:noteId - Actualizar una nota (SOLO ADMIN, solo el que la creó)
router.put("/childNote/:noteId", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "No autorizado" });
  }

  const noteId = parseInt(req.params.noteId);
  const { content, images } = req.body;

  try {
    // Verificar que la nota existe y pertenece al admin actual
    const note = await prisma.childNote.findUnique({
      where: { id: noteId }
    });

    if (!note) {
      return res.status(404).json({ error: "Nota no encontrada" });
    }

    if (note.adminId !== req.user.id) {
      return res.status(403).json({ error: "Solo puedes editar tus propias notas" });
    }

    const updatedNote = await prisma.childNote.update({
      where: { id: noteId },
      data: {
        content,
        images: images || []
      },
      include: {
        child: {
          select: {
            id: true,
            name: true,
            surname: true
          }
        },
        admin: {
          select: {
            id: true,
            name: true,
            surname: true
          }
        }
      }
    });

    res.status(200).json(updatedNote);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});

// DELETE /api/childNote/:noteId - Eliminar una nota (SOLO ADMIN)
router.delete("/childNote/:noteId", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "No autorizado" });
  }

  const noteId = parseInt(req.params.noteId);

  try {
    await prisma.childNote.delete({
      where: { id: noteId }
    });

    res.status(200).json({ message: "Nota eliminada correctamente" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
