import { PrismaClient } from "@prisma/client";
import express from "express";
import { authenticateUser } from "../middleware/auth";
import { endOfDay, format, parse, startOfDay } from "date-fns";
import { validateSlotConflict } from "../utils/validateSlot";

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
    const start = new Date(startTime);
    const end = new Date(endTime);


    console.log("FECHAS QUE ENVIAMOS AL BACK:", dateDay, " ", start, " ", end);

    try {
        await validateSlotConflict({ date: dateDay, start, end });


        const slot = await prisma.birthdaySlot.create({
            data: {
                date: dateDay,
                startTime: start,
                endTime: end,
                status: status || "OPEN"
            }
        });
        res.json(slot);
    } catch (err: any) {
        if (err.message?.startsWith("Ya existe") || err.message?.startsWith("El slot") || err.message?.includes("hora de fin")) {
            return res.status(400).json({ error: err.message });
        }
        console.error("Error creando slot:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Listar todos los slots
router.get("/", async (req: any, res) => {


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

// ✅ Listar todos los slots disponibles
router.get("/availableSlots", async (req: any, res) => {

    try {
        const slots = await prisma.birthdaySlot.findMany({
            where: {
                OR: [
                    { status: 'OPEN' },
                    { status: 'CLOSED' }
                ]
            },

        });
        res.json(slots);
    } catch (err) {
        console.error("Error listando slots disponibles:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});


// ✅ Consultar slots de un día concreto
router.get("/getSlotsByDay/:date", async (req: any, res) => {

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
    const dateDay = date ? new Date(date) : current.date;
    const start = startTime ? new Date(startTime) : current.startTime;
    const end = endTime ? new Date(endTime) : current.endTime;


    // 5️⃣ Actualizar
    try {
        await validateSlotConflict({ id: Number(id), date: dateDay, start, end });

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
    } catch (err: any) {
        if (err.message?.startsWith("Ya existe") || err.message?.startsWith("El slot") || err.message?.includes("hora de fin")) {
            return res.status(400).json({ error: err.message });
        }
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
