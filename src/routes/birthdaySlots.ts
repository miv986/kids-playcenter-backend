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

    console.log("FECHAS QUE LLEGAN AL BACK:", date, " ", startTime, " ", endTime);

    const dateDay = new Date(date);
    dateDay.setHours(0, 0, 0, 0);
    const start = new Date(startTime);
    const end = new Date(endTime);

    console.log("FECHAS QUE ENVIAMOS AL BACK:", dateDay, " ", start, " ", end);


    console.log()

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



// ✅ Consultar slots de un día concreto
router.get("/getSlotsByDay/:date", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { date } = req.params;
    console.log("Fecha recibida en backend", date);
    const [year, month, day] = date.split("-").map(Number);


    if (!date) {
        return res.status(400).json({ error: "Debes proporcionar un parámetro ?date=dd-MM-yyyy" });
    }

    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    try {

        // 2️⃣ Buscar slots que caigan dentro de ese día
        const slots = await prisma.birthdaySlot.findMany({
            where: {
                startTime: {
                    gte: startOfDay,
                    lte: endOfDay
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
    const dateDay = date ? (() => { const d = new Date(date); d.setUTCHours(0, 0, 0, 0); return d; })() : current.date;

    const start = startTime ? new Date(startTime) : current.startTime;
    const end = endTime ? new Date(endTime) : current.endTime;


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
