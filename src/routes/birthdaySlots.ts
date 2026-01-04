import express from "express";
import { authenticateUser, optionalAuthenticate } from "../middleware/auth";
import { endOfDay, format, parse, startOfDay } from "date-fns";
import { validateSlotConflict } from "../utils/validateSlot";
import { getFutureSlotsFilter } from "../utils/slotFilters";
import prisma from "../utils/prisma";
import { getDateRange, getEndOfDay, parseDateString } from "../utils/dateHelpers";

const router = express.Router();


// ✅ Crear slot (ADMIN)
router.post("/", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { date, startTime, endTime, status } = req.body;

    const dateDay = new Date(date);
    const start = new Date(startTime);
    const end = new Date(endTime);

    // ✅ Validar que las fechas sean válidas
    if (isNaN(dateDay.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Fechas inválidas. Por favor, verifica las fechas proporcionadas." });
    }

    // ✅ Validar que la fecha no sea anterior a hoy (usando helpers estandarizados)
    const { getStartOfDay, isToday, isPastDateTime } = await import("../utils/dateHelpers");
    const dateDayOnly = getStartOfDay(dateDay);
    const nowDateOnly = getStartOfDay();

    if (dateDayOnly < nowDateOnly) {
        return res.status(400).json({ error: "No se pueden crear slots con fechas pasadas." });
    }

    // ✅ Si es hoy, validar que la hora de inicio no sea pasada
    if (isToday(dateDay) && isPastDateTime(start)) {
        return res.status(400).json({ error: "No se pueden crear slots con horarios pasados." });
    }

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
// Si es admin, devuelve todos. Si es usuario final o no autenticado, filtra slots pasados
// Parámetros opcionales: startDate, endDate (YYYY-MM-DD) para filtrar por rango
router.get("/", optionalAuthenticate, async (req: any, res) => {
    try {
        const isAdmin = req.user?.role === "ADMIN";
        const now = new Date();
        const { startDate, endDate } = req.query;

        const whereClause: any = {};
        const andConditions: any[] = [];
        
        // Filtrar por rango de fechas si se proporciona
        // Si no se proporciona, usar rango por defecto: 12 meses atrás y 12 meses adelante
        if (startDate && endDate) {
            const { start: startOfRange } = getDateRange(startDate as string);
            const endOfRange = getEndOfDay(parseDateString(endDate as string));
            
            andConditions.push({
                date: {
                    gte: startOfRange,
                    lte: endOfRange,
                }
            });
        } else {
            // Rango por defecto: 12 meses atrás y 12 meses adelante
            const { getStartOfDay } = await import("../utils/dateHelpers");
            const today = getStartOfDay();
            const twelveMonthsAgo = new Date(today);
            twelveMonthsAgo.setMonth(today.getMonth() - 12);
            const twelveMonthsAhead = new Date(today);
            twelveMonthsAhead.setMonth(today.getMonth() + 12);
            
            andConditions.push({
                date: {
                    gte: twelveMonthsAgo,
                    lte: twelveMonthsAhead,
                }
            });
        }
        
        // ✅ Filtrar slots pasados solo para usuarios finales o no autenticados (no admin)
        if (!isAdmin) {
            andConditions.push(getFutureSlotsFilter(now));
        }
        
        // Combinar todas las condiciones
        if (andConditions.length > 0) {
            if (andConditions.length === 1) {
                Object.assign(whereClause, andConditions[0]);
            } else {
                whereClause.AND = andConditions;
            }
        }

        const slots = await prisma.birthdaySlot.findMany({
            where: whereClause,
            include: { booking: true }, // para ver si ya tienen reserva
            orderBy: [
                { date: "asc" },
                { startTime: "asc" }
            ]
        });
        res.json(slots);
    } catch (err) {
        console.error("Error listando slots:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Listar todos los slots disponibles
// Filtra slots pasados y solo muestra slots OPEN sin reservas activas (endpoint público)
router.get("/availableSlots", async (req: any, res) => {
    try {
        const now = new Date();

        // ✅ Solo slots OPEN y sin reservas activas
        const whereClause: any = {
            status: 'OPEN',
            OR: [
                { booking: null }, // Sin reserva
                { booking: { status: 'CANCELLED' } } // O con reserva cancelada
            ],
            AND: [getFutureSlotsFilter(now)]
        };

        const slots = await prisma.birthdaySlot.findMany({
            where: whereClause,
            include: { booking: true },
            orderBy: [
                { date: "asc" },
                { startTime: "asc" }
            ]
        });
        res.json(slots);
    } catch (err) {
        console.error("Error listando slots disponibles:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});


// ✅ Consultar slots de un día concreto
// Filtra slots pasados para usuarios finales
router.get("/getSlotsByDay/:date", authenticateUser, async (req: any, res) => {
    const { date } = req.params;

    if (!date) {
        return res.status(400).json({ error: "Debes proporcionar un parámetro ?date=YYYY-MM-DD" });
    }

    // ✅ Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Formato de fecha inválido. Use YYYY-MM-DD." });
    }

    // Crear rango en hora local (estandarizado)
    const { getDateRange } = await import("../utils/dateHelpers");
    const { start: startOfDay, end: endOfDay } = getDateRange(date);

    try {
        const isAdmin = req.user?.role === "ADMIN";
        const now = new Date();

        const whereClause: any = {
            startTime: {
                gte: startOfDay,
                lte: endOfDay
            }
        };

        // ✅ Filtrar slots pasados solo para usuarios finales (no admin)
        if (!isAdmin) {
            whereClause.AND = [getFutureSlotsFilter(now)];
        }

        // 2️⃣ Buscar slots que caigan dentro de ese día
        const slots = await prisma.birthdaySlot.findMany({
            where: whereClause,
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
    const slotId = Number(id);

    // ✅ Validar que el ID sea válido
    if (isNaN(slotId) || slotId <= 0) {
        return res.status(400).json({ error: "ID de slot inválido." });
    }

    const { date, startTime, endTime, status } = req.body;

    // 1️⃣ Obtenemos el slot actual
    const current = await prisma.birthdaySlot.findUnique({
        where: { id: slotId }
    });

    if (!current) {
        return res.status(404).json({ error: "Slot no encontrado" });
    }



    // 2️⃣ Parsear nuevos valores (si existen) o mantener los actuales
    const dateDay = date ? new Date(date) : current.date;
    const start = startTime ? new Date(startTime) : current.startTime;
    const end = endTime ? new Date(endTime) : current.endTime;

    // ✅ Validar que las fechas sean válidas
    if (isNaN(dateDay.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Fechas inválidas. Por favor, verifica las fechas proporcionadas." });
    }

    // ✅ Validar que la hora de inicio sea anterior a la de fin
    if (start >= end) {
        return res.status(400).json({ error: "La hora de inicio debe ser anterior a la hora de fin." });
    }

    // ✅ Validar que la fecha no sea anterior a hoy (usando helpers estandarizados)
    const { getStartOfDay, isToday, isPastDateTime } = await import("../utils/dateHelpers");
    const dateDayOnly = getStartOfDay(dateDay);
    const nowDateOnly = getStartOfDay();

    if (dateDayOnly < nowDateOnly) {
        return res.status(400).json({ error: "No se pueden actualizar slots a fechas pasadas." });
    }

    // ✅ Si es hoy, validar que la hora de inicio no sea pasada
    if (isToday(dateDay) && isPastDateTime(start)) {
        return res.status(400).json({ error: "No se pueden actualizar slots a horarios pasados." });
    }

    // 5️⃣ Actualizar
    try {
        await validateSlotConflict({ id: slotId, date: dateDay, start, end });

        const updated = await prisma.birthdaySlot.update({
            where: { id: slotId },
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
    const slotId = Number(id);

    // ✅ Validar que el ID sea válido
    if (isNaN(slotId) || slotId <= 0) {
        return res.status(400).json({ error: "ID de slot inválido." });
    }

    try {
        // ✅ Verificar que el slot existe y no tiene reservas activas
        const slot = await prisma.birthdaySlot.findUnique({
            where: { id: slotId },
            include: { booking: true }
        });

        if (!slot) {
            return res.status(404).json({ error: "Slot no encontrado." });
        }

        if (slot.booking) {
            return res.status(400).json({ error: "No se puede eliminar un slot que tiene una reserva activa." });
        }

        await prisma.birthdaySlot.delete({
            where: { id: slotId }
        });
        res.json({ message: "Slot eliminado correctamente" });
    } catch (err: any) {
        console.error("Error eliminando slot:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Slot no encontrado." });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

export default router;
