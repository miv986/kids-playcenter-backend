import express from "express";
import { authenticateUser, optionalAuthenticate } from "../middleware/auth";
import { getFutureSlotsFilter } from "../utils/slotFilters";
import { getDateRange, validateNotPastDate, validateNotPastTodayDateTime, getStartOfDay, getEndOfDay, parseDateString } from "../utils/dateHelpers";
import { validateMeetingSlotConflict } from "../utils/validateSlot";
import prisma from "../utils/prisma";

const router = express.Router();

// ✅ Crear slot (ADMIN)
router.post("/", authenticateUser, async (req: any, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden" });
    }

    const { date, startTime, endTime, capacity, status } = req.body;

    // ✅ Parsear fechas - new Date() interpreta correctamente ISO strings y timestamps
    const dateDay = new Date(date);
    const start = new Date(startTime);
    const end = new Date(endTime);

    // ✅ Validar que las fechas sean válidas
    if (isNaN(dateDay.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Fechas inválidas. Por favor, verifica las fechas proporcionadas." });
    }

    // ✅ Normalizar la fecha a inicio de día en hora local (sin hora)
    const normalizedDateDay = getStartOfDay(dateDay);

    // ✅ Validar que la hora de inicio sea anterior a la de fin
    if (start >= end) {
        return res.status(400).json({ error: "La hora de inicio debe ser anterior a la hora de fin." });
    }

    // ✅ Validar capacidad
    if (!capacity || isNaN(Number(capacity)) || capacity <= 0) {
        return res.status(400).json({ error: "La capacidad debe ser un número positivo." });
    }

    // ✅ Validar que la fecha no sea anterior a hoy (usando helpers estandarizados)
    try {
        validateNotPastDate(normalizedDateDay, "No se pueden crear slots con fechas pasadas.");
        validateNotPastTodayDateTime(normalizedDateDay, start, "No se pueden crear slots con horarios pasados.");
    } catch (validationError: any) {
        return res.status(400).json({ error: validationError.message });
    }

    try {
        await validateMeetingSlotConflict({ date: normalizedDateDay, start, end });

        const slot = await prisma.meetingSlot.create({
            data: {
                date: normalizedDateDay,
                startTime: start,
                endTime: end,
                capacity: Number(capacity),
                availableSpots: Number(capacity),
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
        if (startDate && endDate) {
            const { start: startOfRange } = getDateRange(startDate as string);
            const endOfRange = getEndOfDay(parseDateString(endDate as string));
            
            andConditions.push({
                date: {
                    gte: startOfRange,
                    lte: endOfRange,
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

        const slots = await prisma.meetingSlot.findMany({
            where: whereClause,
            include: { 
                bookings: {
                    where: {
                        status: {
                            not: 'CANCELLED'
                        }
                    }
                }
            }
        });
        res.json(slots);
    } catch (err) {
        console.error("Error listando slots:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Listar todos los slots disponibles
// Filtra slots pasados y solo muestra slots OPEN con plazas disponibles (endpoint público)
router.get("/availableSlots", async (req: any, res) => {
    try {
        const now = new Date();

        // ✅ Solo slots OPEN con plazas disponibles
        const whereClause: any = {
            status: 'OPEN',
            availableSpots: {
                gt: 0
            },
            AND: [getFutureSlotsFilter(now)]
        };

        const slots = await prisma.meetingSlot.findMany({
            where: whereClause,
            include: { 
                bookings: {
                    where: {
                        status: {
                            not: 'CANCELLED'
                        }
                    }
                }
            }
        });
        res.json(slots);
    } catch (err) {
        console.error("Error listando slots disponibles:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// ✅ Consultar slots de un día concreto
// Filtra slots pasados para usuarios finales
router.get("/getSlotsByDay/:date", optionalAuthenticate, async (req: any, res) => {
    const { date } = req.params;

    if (!date) {
        return res.status(400).json({ error: "Debes proporcionar un parámetro ?date=YYYY-MM-DD" });
    }

    // ✅ Validar formato de fecha
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Formato de fecha inválido. Use YYYY-MM-DD." });
    }

    // Crear rango en hora local (estandarizado)
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

        const slots = await prisma.meetingSlot.findMany({
            where: whereClause,
            orderBy: { startTime: "asc" },
            include: { 
                bookings: {
                    where: {
                        status: {
                            not: 'CANCELLED'
                        }
                    }
                }
            }
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

    const { date, startTime, endTime, capacity, status } = req.body;

    // 1️⃣ Obtenemos el slot actual
    const current = await prisma.meetingSlot.findUnique({
        where: { id: slotId },
        include: {
            bookings: {
                where: {
                    status: {
                        not: 'CANCELLED'
                    }
                }
            }
        }
    });

    if (!current) {
        return res.status(404).json({ error: "Slot no encontrado" });
    }

    // 2️⃣ Parsear nuevos valores (si existen) o mantener los actuales
    const dateDay = date ? new Date(date) : current.date;
    const start = startTime ? new Date(startTime) : current.startTime;
    const end = endTime ? new Date(endTime) : current.endTime;
    const newCapacity = capacity ? Number(capacity) : current.capacity;

    // ✅ Validar que las fechas sean válidas
    if (isNaN(dateDay.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ error: "Fechas inválidas. Por favor, verifica las fechas proporcionadas." });
    }

    // ✅ Normalizar la fecha a inicio de día en hora local (sin hora)
    const normalizedDateDay = getStartOfDay(dateDay);

    // ✅ Validar que la hora de inicio sea anterior a la de fin
    if (start >= end) {
        return res.status(400).json({ error: "La hora de inicio debe ser anterior a la hora de fin." });
    }

    // ✅ Validar capacidad
    if (newCapacity <= 0) {
        return res.status(400).json({ error: "La capacidad debe ser un número positivo." });
    }

    // ✅ Validar que la nueva capacidad no sea menor que las reservas activas
    const activeBookingsCount = current.bookings.length;
    if (newCapacity < activeBookingsCount) {
        return res.status(400).json({ error: `La capacidad no puede ser menor que el número de reservas activas (${activeBookingsCount}).` });
    }

    // ✅ Validar que la fecha no sea anterior a hoy (usando helpers estandarizados)
    try {
        validateNotPastDate(normalizedDateDay, "No se pueden actualizar slots a fechas pasadas.");
        validateNotPastTodayDateTime(normalizedDateDay, start, "No se pueden actualizar slots a horarios pasados.");
    } catch (validationError: any) {
        return res.status(400).json({ error: validationError.message });
    }

    // Calcular nuevos availableSpots
    const newAvailableSpots = newCapacity - activeBookingsCount;

    // 5️⃣ Actualizar
    try {
        await validateMeetingSlotConflict({ id: slotId, date: normalizedDateDay, start, end });

        const updated = await prisma.meetingSlot.update({
            where: { id: slotId },
            data: {
                date: normalizedDateDay,
                startTime: start,
                endTime: end,
                capacity: newCapacity,
                availableSpots: newAvailableSpots,
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
        const slot = await prisma.meetingSlot.findUnique({
            where: { id: slotId },
            include: {
                bookings: {
                    where: {
                        status: {
                            not: 'CANCELLED'
                        }
                    }
                }
            }
        });

        if (!slot) {
            return res.status(404).json({ error: "Slot no encontrado." });
        }

        if (slot.bookings.length > 0) {
            return res.status(400).json({ error: "No se puede eliminar un slot que tiene reservas activas." });
        }

        await prisma.meetingSlot.delete({
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

