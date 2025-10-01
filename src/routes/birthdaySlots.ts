import { PrismaClient } from "@prisma/client";
import express from "express";
import { authenticateUser } from "../middleware/auth";
import { endOfDay, format, parse, startOfDay } from "date-fns";

const prisma = new PrismaClient();
const router = express.Router();


// ✅ Crear slot (ADMIN)
router.post("/", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { date, startTime, endTime, status } = req.body;

    const dateDay = parse(`${date}`, "dd-MM-yyyy", new Date());
    const start = parse(`${date} ${startTime}`, "dd-MM-yyyy HH:mm", new Date());
    const end = parse(`${date} ${endTime}`, "dd-MM-yyyy HH:mm", new Date());

    if (end <= start) {
        return res.status(400).json({ error: "La hora de fin debe ser posterior a la de inicio" });
    }


    // 1️⃣ Ver si ya existe slot con mismos datos
    const exactSlot = await prisma.birthdaySlot.findFirst({
        where: {
            date: dateDay,
            startTime: start,
            endTime: end
        }
    });

    if (exactSlot) {
        return res.status(400).json({ error: "Ya existe un slot con esa fecha y horario exacto" });
    }

    // 2️⃣ Ver si hay solapamiento con otro slot del mismo día
    const overlappingSlot = await prisma.birthdaySlot.findFirst({
        where: {
            date: dateDay,
            OR: [
                {
                    // caso A: empieza dentro de otro slot
                    AND: [
                        { startTime: { lte: start } },
                        { endTime: { gt: start } }
                    ]
                },
                {
                    // caso B: termina dentro de otro slot
                    AND: [
                        { startTime: { lt: end } },
                        { endTime: { gte: end } }
                    ]
                },
                {
                    // caso C: engloba totalmente otro slot
                    AND: [
                        { startTime: { gte: start } },
                        { endTime: { lte: end } }
                    ]
                }
            ]
        }
    });

    if (overlappingSlot) {
        return res.status(400).json({ error: "El slot se solapa con otro existente" });
    }


    try {
        const slot = await prisma.birthdaySlot.create({
            data: {
                date: dateDay,
                startTime: start,
                endTime: end,
                status: status || "OPEN"
            }
        });
        res.json(slot);
    } catch (err) {
        console.error("Error creando slot:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Listar todos los slots
router.get("/", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    try {
        const slots = await prisma.birthdaySlot.findMany({
            include: { booking: true } // para ver si ya tienen reserva
        });
        res.json(slots);
    } catch (err) {
        console.error("Error listando slots:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Ver slot por ID
router.get("/:id", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { id } = req.params;

    try {
        const slot = await prisma.birthdaySlot.findUnique({
            where: { id: Number(id) },
            include: { booking: true }
        });

        if (!slot) return res.status(404).json({ error: "Slot no encontrado" });

        res.json(slot);
    } catch (err) {
        console.error("Error obteniendo slot:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Consultar slots de un día concreto
router.get("/getSlotsByDay", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: "Debes proporcionar un parámetro ?date=dd-MM-yyyy" });
    }

    try {
        // 1️⃣ Parsear la fecha del query
        const parsedDate = parse(date as string, "dd-MM-yyyy", new Date());
        const dayStart = startOfDay(parsedDate);
        const dayEnd = endOfDay(parsedDate);

        // 2️⃣ Buscar slots que caigan dentro de ese día
        const slots = await prisma.birthdaySlot.findMany({
            where: {
                date: {
                    gte: dayStart,
                    lte: dayEnd
                }
            },
            orderBy: { startTime: "asc" },
            include: { booking: true } // si quieres ver reservas asociadas
        });

        res.json(slots);
    } catch (err) {
        console.error("Error obteniendo slots:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Actualizar slot (ADMIN)
router.put("/:id", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { id } = req.params;
    const { date, startTime, endTime, status } = req.body;

    // 1️⃣ Obtenemos el slot actual
    const current = await prisma.birthdaySlot.findUnique({
        where: { id: Number(id) }
    });

    if (!current) {
        return res.status(404).json({ error: "Slot no encontrado" });
    }

    // 2️⃣ Parsear nuevos valores (si existen) o mantener los actuales
    const dateDay = date ? parse(`${date}`, "dd-MM-yyyy", new Date()) : current.date;

    const start = startTime
        ? parse(`${date || format(current.date, "dd-MM-yyyy")} ${startTime}`, "dd-MM-yyyy HH:mm", new Date())
        : current.startTime;

    const end = endTime
        ? parse(`${date || format(current.date, "dd-MM-yyyy")} ${endTime}`, "dd-MM-yyyy HH:mm", new Date())
        : current.endTime;

    if (end <= start) {
        return res.status(400).json({ error: "La hora de fin debe ser posterior a la de inicio" });
    }

    // 3️⃣ Ver si ya existe un slot exacto con misma fecha/hora (pero que no sea este mismo)
    const exactSlot = await prisma.birthdaySlot.findFirst({
        where: {
            id: { not: Number(id) },
            date: dateDay,
            startTime: start,
            endTime: end
        }
    });

    if (exactSlot) {
        return res.status(400).json({ error: "Ya existe un slot con esa fecha y horario exacto" });
    }

    // 4️⃣ Ver si se solapa con otro slot del mismo día (excepto este mismo)
    const overlappingSlot = await prisma.birthdaySlot.findFirst({
        where: {
            id: { not: Number(id) },
            date: dateDay,
            OR: [
                {
                    AND: [{ startTime: { lte: start } }, { endTime: { gt: start } }]
                },
                {
                    AND: [{ startTime: { lt: end } }, { endTime: { gte: end } }]
                },
                {
                    AND: [{ startTime: { gte: start } }, { endTime: { lte: end } }]
                }
            ]
        }
    });

    if (overlappingSlot) {
        return res.status(400).json({ error: "El slot se solapa con otro existente" });
    }

    // 5️⃣ Actualizar
    try {
        const updated = await prisma.birthdaySlot.update({
            where: { id: Number(id) },
            data: {
                date: dateDay,
                startTime: start,
                endTime: end,
                ...(status && { status })
            }
        });
        res.json(updated);
    } catch (err) {
        console.error("Error actualizando slot:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});


// ✅ Eliminar slot
router.delete("/:id", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { id } = req.params;

    try {
        await prisma.birthdaySlot.delete({
            where: { id: Number(id) }
        });
        res.json({ message: "Slot eliminado correctamente" });
    } catch (err) {
        console.error("Error eliminando slot:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
