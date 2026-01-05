import express from "express";
import { authenticateUser } from "../middleware/auth";
import { validateDTO } from "../middleware/validation";
import { CreateDaycareBookingDTO } from "../dtos/CreateDaycareBookingDTO";
import { CreateManualDaycareBookingDTO } from "../dtos/CreateManualDaycareBookingDTO";
import { UpdateDaycareBookingDTO } from "../dtos/UpdateDaycareBookingDTO";
import { sendTemplatedEmail } from "../service/mailing";
import { getDaycareBookingConfirmedEmail, getDaycareBookingStatusChangedEmail } from "../service/emailTemplates";
import prisma from "../utils/prisma";
import { executeWithRetry } from "../utils/transactionRetry";
import { getStartOfDay, getEndOfDay, getDateRange, isToday, isPastDateTime, getLocalDateString, getLocalHour, parseDateString } from "../utils/dateHelpers";
// ✅ NUEVO: Importar funciones de timezone unificado
import { 
    formatForAPI, 
    parseToMadridDate, 
    isPastMadrid, 
    isTodayMadrid, 
    getStartOfDayMadrid, 
    getHourMadrid,
    formatDateOnlyMadrid 
} from "../utils/timezone";

const router = express.Router();


// DAYCARE BOOKINGS

//CREAR RESERVA DAYCARE
router.post("/", authenticateUser, validateDTO(CreateDaycareBookingDTO), async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN' && req.user.role !== "USER") {
        return res.status(403).json({ error: 'Forbidden' });
    }


    try {
        const { comments, startTime, endTime, slotId, childrenIds } = req.body;
        const user_id = req.user.id;  // Obtener user_id del token verificado

        // ✅ Validaciones básicas
        if (!childrenIds || !Array.isArray(childrenIds) || childrenIds.length === 0) {
            return res.status(400).json({ error: "Debes seleccionar al menos un niño para la reserva." });
        }

        if (!startTime || !endTime) {
            return res.status(400).json({ error: "Debes proporcionar fecha y hora de inicio y fin." });
        }

        // ✅ Parsear fechas usando timezone unificado (Europe/Madrid)
        const start = parseToMadridDate(startTime);
        const end = parseToMadridDate(endTime);

        // ✅ Validar que las fechas sean válidas
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: "Fechas inválidas. Por favor, verifica las fechas proporcionadas." });
        }

        // ✅ Validar que la hora de inicio sea anterior a la de fin
        if (start >= end) {
            return res.status(400).json({ error: "La hora de inicio debe ser anterior a la hora de fin." });
        }

        // Extraer la fecha usando timezone de Madrid
        const dateString = formatDateOnlyMadrid(start);
        const { start: startOfDay, end: endOfDay } = getDateRange(dateString);
        const date = getStartOfDayMadrid(start);
        
        if (req.user.role !== 'ADMIN') {
            const now = getStartOfDayMadrid();
            
            if (date < now) {
                return res.status(400).json({ error: "No se pueden reservar slots con fechas pasadas." });
            }
            // Validar también que la hora de inicio no sea pasada si es hoy
            if (isTodayMadrid(start) && isPastMadrid(start)) {
                return res.status(400).json({ error: "No se pueden reservar slots con horarios pasados." });
            }

            // ✅ Validar que los niños pertenezcan al usuario
            const userChildren = await prisma.user.findMany({
                where: {
                    id: { in: childrenIds },
                    tutorId: user_id,
                    role: 'CHILD'
                }
            });

            if (userChildren.length !== childrenIds.length) {
                return res.status(403).json({ error: "Algunos de los niños seleccionados no pertenecen a tu cuenta." });
            }
        }

        const spotsToDiscount = childrenIds.length;

        // ✅ Calcular horas usando utilidades para consistencia
        // Si viene slotId, usarlo como referencia para evitar problemas de zona horaria
        let startHour: number;
        let endHour: number;
        let expectedSlotsCount: number;

        if (slotId) {
            // Usar el slotId para obtener el slot y calcular el rango desde la BD
            const referenceSlot = await prisma.daycareSlot.findUnique({
                where: { id: slotId }
            });

            if (!referenceSlot) {
                return res.status(404).json({ error: "Slot no encontrado." });
            }

            // Calcular el rango desde el slot de referencia (usa el hour real de la BD)
            startHour = referenceSlot.hour;
            // Calcular endHour basado en la diferencia entre startTime y endTime
            const timeDiffMs = end.getTime() - start.getTime();
            const timeDiffHours = Math.floor(timeDiffMs / (1000 * 60 * 60));
            endHour = startHour + timeDiffHours;
            expectedSlotsCount = timeDiffHours;
        } else {
            // Calcular desde startTime y endTime usando utilidades para consistencia
            startHour = getHourMadrid(start);
            endHour = getHourMadrid(end);
            expectedSlotsCount = endHour - startHour;
        }

        // ✅ CRÍTICO: Mover toda la validación DENTRO de la transacción para prevenir race conditions
        // Usar isolationLevel: 'Serializable' para máxima seguridad
        // Usar retry logic para manejar conflictos de serialización automáticamente
        const booking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // ✅ Validar slots DENTRO de la transacción (previene race conditions)
            // Filtrar por rango de horas para encontrar los slots exactos necesarios
            const allSlotsByDate = await tx.daycareSlot.findMany({
                where: {
                    date: {
                        gte: startOfDay,
                        lte: endOfDay
                    },
                    // Filtrar por rango de horas: desde startHour hasta endHour (exclusivo)
                    hour: {
                        gte: startHour,
                        lt: endHour
                    }
                },
            });

            // Filtrar por status
            const allSlots = allSlotsByDate.filter(s => s.status === "OPEN");

            if (allSlots.length !== expectedSlotsCount) {
                const allSlotsByStatus = allSlotsByDate.filter(s => s.status !== 'OPEN');
                
                // Si hay slots pero no están OPEN, informar
                if (allSlotsByDate.length > 0 && allSlots.length < allSlotsByDate.length) {
                    const closedSlots = allSlotsByStatus;
                    throw new Error(`Los slots para el horario seleccionado no están disponibles (estado: ${closedSlots.map(s => s.status).join(', ')}).`);
                }
                
                throw new Error(`No hay slots disponibles para el horario seleccionado el día ${dateString}. Faltan ${expectedSlotsCount - allSlots.length} slot(s).`);
            }

            // ✅ Validar plazas disponibles DENTRO de la transacción
            const slotsWithSpots = allSlots.filter(slot => slot.availableSpots >= spotsToDiscount);
            
            if (slotsWithSpots.length !== expectedSlotsCount) {
                const slotsWithoutSpots = allSlots.filter(slot => slot.availableSpots < spotsToDiscount);
                const hoursWithoutSpots = slotsWithoutSpots.map(s => s.hour).join(", ");
                throw new Error(`No hay suficientes plazas disponibles. Se necesitan ${spotsToDiscount} plaza(s) pero los slots de las ${hoursWithoutSpots}:00 no tienen suficientes plazas disponibles.`);
            }

            const slots = slotsWithSpots;

            // ✅ Validar reserva existente DENTRO de la transacción (previene duplicados)
            const slotIds = slots.map(s => s.id);
            const existingBooking = await tx.daycareBooking.findFirst({
                where: {
                    userId: user_id,
                    slots: {
                        some: {
                            id: { in: slotIds }
                        }
                    },
                    status: {
                        not: 'CANCELLED'
                    }
                },
            });

            if (existingBooking) {
                throw new Error("Ya tienes una reserva activa para ese día/horario. Por favor, modifica o cancela tu reserva existente.");
            }

            // ✅ Crear la reserva y descontar plazas atómicamente
            const newBooking = await tx.daycareBooking.create({
                data: {
                    comments,
                    startTime: start,
                    endTime: end,
                    userId: user_id,
                    status: "CONFIRMED",
                    slots: {
                        connect: slots.map((s) => ({ id: s.id }))
                    },
                    children: {
                        connect: childrenIds.map((id: number) => ({ id }))
                    },
                },
                include: { 
                    children: true,
                    user: true
                },
            });

            // Descontar plazas de cada slot por cada niño
            // ✅ Validar que availableSpots no vaya a negativo y no exceda capacidad
            for (const s of slots) {
                const updatedSlot = await tx.daycareSlot.update({
                    where: { id: s.id },
                    data: { availableSpots: { decrement: spotsToDiscount } },
                });
                
                // Verificar que no haya ido a negativo (aunque debería estar validado antes)
                if (updatedSlot.availableSpots < 0) {
                    throw new Error(`Error: Las plazas disponibles no pueden ser negativas. Slot ${s.id} tiene ${updatedSlot.availableSpots} plazas.`);
                }
                
                // ✅ Validar que no exceda capacidad
                if (updatedSlot.availableSpots > updatedSlot.capacity) {
                    throw new Error(`Error: Las plazas disponibles (${updatedSlot.availableSpots}) no pueden exceder la capacidad (${updatedSlot.capacity}). Slot ${s.id}.`);
                }
            }
            
            return newBooking;
        }, {
            isolationLevel: 'Serializable', // Máxima protección contra race conditions
            timeout: 10000 // 10 segundos timeout
        }));

        // Enviar email de confirmación
        if (booking.user?.email) {
            try {
                const emailData = getDaycareBookingConfirmedEmail(
                    booking.user.name,
                    {
                        id: booking.id,
                        startTime: booking.startTime,
                        endTime: booking.endTime,
                        children: booking.children,
                        status: booking.status
                    }
                );
                
                await sendTemplatedEmail(
                    booking.user.email,
                    "Reserva de ludoteca confirmada - Somriures & Colors",
                    emailData
                );
                console.log(`✅ Email de confirmación de reserva enviado a ${booking.user.email}`);
            } catch (emailError) {
                console.error("Error enviando email de confirmación:", emailError);
                // No fallar la creación si falla el email
            }
        }

        // Formatear fechas para evitar problemas de timezone
        return res.status(201).json({
            message: "✅ Reserva creada correctamente.",
            booking: {
                ...booking,
                startTime: formatForAPI(booking.startTime),
                endTime: formatForAPI(booking.endTime),
            },
        });
    } catch (err: any) {
        console.error("Error al crear reserva:", err);
        
        // Manejar errores de validación lanzados dentro de la transacción
        if (err.message) {
            if (err.message.includes("No hay slots disponibles") || 
                err.message.includes("no están disponibles") ||
                err.message.includes("No hay suficientes plazas") ||
                err.message.includes("Ya tienes una reserva activa") ||
                err.message.includes("no pueden ser negativas")) {
                return res.status(400).json({ error: err.message });
            }
        }
        
        // Manejar errores específicos de Prisma
        if (err.code === 'P2002') {
            return res.status(400).json({ error: "Ya existe una reserva con estos datos." });
        }
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Uno de los recursos no fue encontrado." });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ error: "Referencia inválida. Verifica los IDs proporcionados." });
        }
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La reserva no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
        }
        
        return res.status(500).json({ error: "Error interno del servidor." });
    } 
}
);

//CREAR RESERVA DAYCARE MANUAL (ADMIN)
router.post("/manual", authenticateUser, validateDTO(CreateManualDaycareBookingDTO), async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Solo los administradores pueden crear reservas manuales.' });
    }

    try {
        const { comments, startTime, endTime, slotId, numberOfChildren, clientName, childName, parent1Name, parent1Phone, parent2Name, parent2Phone } = req.body;

        if (!startTime || !endTime) {
            return res.status(400).json({ error: "Debes proporcionar fecha y hora de inicio y fin." });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: "Fechas inválidas. Por favor, verifica las fechas proporcionadas." });
        }

        if (start >= end) {
            return res.status(400).json({ error: "La hora de inicio debe ser anterior a la hora de fin." });
        }

        const dateString = getLocalDateString(start);
        const { start: startOfDay, end: endOfDay } = getDateRange(dateString);
        const spotsToDiscount = numberOfChildren;

        let startHour: number;
        let endHour: number;
        let expectedSlotsCount: number;

        if (slotId) {
            const referenceSlot = await prisma.daycareSlot.findUnique({
                where: { id: slotId }
            });

            if (!referenceSlot) {
                return res.status(404).json({ error: "Slot no encontrado." });
            }

            startHour = referenceSlot.hour;
            const timeDiffMs = end.getTime() - start.getTime();
            const timeDiffHours = Math.floor(timeDiffMs / (1000 * 60 * 60));
            endHour = startHour + timeDiffHours;
            expectedSlotsCount = timeDiffHours;
        } else {
            startHour = getHourMadrid(start);
            endHour = getHourMadrid(end);
            expectedSlotsCount = endHour - startHour;
        }

        const booking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // Validar slots DENTRO de la transacción
            const allSlotsByDate = await tx.daycareSlot.findMany({
                where: {
                    date: {
                        gte: startOfDay,
                        lte: endOfDay
                    },
                    hour: {
                        gte: startHour,
                        lt: endHour
                    }
                },
            });

            const allSlots = allSlotsByDate.filter(s => s.status === "OPEN");

            if (allSlots.length !== expectedSlotsCount) {
                const allSlotsByStatus = allSlotsByDate.filter(s => s.status !== 'OPEN');
                
                if (allSlotsByDate.length > 0 && allSlots.length < allSlotsByDate.length) {
                    const closedSlots = allSlotsByStatus;
                    throw new Error(`Los slots para el horario seleccionado no están disponibles (estado: ${closedSlots.map(s => s.status).join(', ')}).`);
                }
                
                throw new Error(`No hay slots disponibles para el horario seleccionado el día ${dateString}. Faltan ${expectedSlotsCount - allSlots.length} slot(s).`);
            }

            // Validar plazas disponibles
            const slotsWithSpots = allSlots.filter(slot => slot.availableSpots >= spotsToDiscount);
            
            if (slotsWithSpots.length !== expectedSlotsCount) {
                const slotsWithoutSpots = allSlots.filter(slot => slot.availableSpots < spotsToDiscount);
                const hoursWithoutSpots = slotsWithoutSpots.map(s => s.hour).join(", ");
                throw new Error(`No hay suficientes plazas disponibles. Se necesitan ${spotsToDiscount} plaza(s) pero los slots de las ${hoursWithoutSpots}:00 no tienen suficientes plazas disponibles.`);
            }

            const slots = slotsWithSpots;
            const slotIds = slots.map(s => s.id);

            // Validar que no haya reserva duplicada para estos slots (solo para manuales)
            const existingBooking = await tx.daycareBooking.findFirst({
                where: {
                    isManual: true,
                    slots: {
                        some: {
                            id: { in: slotIds }
                        }
                    },
                    status: {
                        not: 'CANCELLED'
                    }
                },
            });

            if (existingBooking) {
                throw new Error("Ya existe una reserva manual para ese horario. Verifica los slots disponibles.");
            }

            // Crear la reserva manual
            const newBooking = await tx.daycareBooking.create({
                data: {
                    comments,
                    startTime: start,
                    endTime: end,
                    userId: null, // Sin usuario
                    status: "CONFIRMED",
                    isManual: true,
                    manualClientName: clientName,
                    manualNumberOfChildren: numberOfChildren,
                    manualChildName: childName || null,
                    manualParent1Name: parent1Name || null,
                    manualParent1Phone: parent1Phone || null,
                    manualParent2Name: parent2Name || null,
                    manualParent2Phone: parent2Phone || null,
                    slots: {
                        connect: slots.map((s) => ({ id: s.id }))
                    },
                },
                include: { 
                    slots: true
                },
            });

            // Descontar plazas de cada slot
            for (const s of slots) {
                const updatedSlot = await tx.daycareSlot.update({
                    where: { id: s.id },
                    data: { availableSpots: { decrement: spotsToDiscount } },
                });
                
                if (updatedSlot.availableSpots < 0) {
                    throw new Error(`Error: Las plazas disponibles no pueden ser negativas. Slot ${s.id} tiene ${updatedSlot.availableSpots} plazas.`);
                }
                
                if (updatedSlot.availableSpots > updatedSlot.capacity) {
                    throw new Error(`Error: Las plazas disponibles (${updatedSlot.availableSpots}) no pueden exceder la capacidad (${updatedSlot.capacity}). Slot ${s.id}.`);
                }
            }
            
            return newBooking;
        }, {
            isolationLevel: 'Serializable',
            timeout: 10000
        }));

        // Formatear fechas para evitar problemas de timezone
        return res.status(201).json({
            message: "✅ Reserva manual creada correctamente.",
            booking: {
                ...booking,
                startTime: formatForAPI(booking.startTime),
                endTime: formatForAPI(booking.endTime),
            },
        });
    } catch (err: any) {
        console.error("Error al crear reserva manual:", err);
        
        if (err.message) {
            if (err.message.includes("No hay slots disponibles") || 
                err.message.includes("no están disponibles") ||
                err.message.includes("No hay suficientes plazas") ||
                err.message.includes("Ya existe una reserva manual") ||
                err.message.includes("no pueden ser negativas")) {
                return res.status(400).json({ error: err.message });
            }
        }
        
        if (err.code === 'P2002') {
            return res.status(400).json({ error: "Ya existe una reserva con estos datos." });
        }
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Uno de los recursos no fue encontrado." });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ error: "Referencia inválida. Verifica los IDs proporcionados." });
        }
        if (err.code === 'P2034') {
            return res.status(409).json({ 
                error: "La reserva no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
        }
        
        return res.status(500).json({ error: "Error interno del servidor." });
    } 
});

// LISTAR RESERVAS DAYCARE (admin ve todo, user ve solo las suyas)
// Parámetros opcionales: startDate, endDate (YYYY-MM-DD) para filtrar por rango
router.get("/", authenticateUser, async (req: any, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const where: any = req.user.role === "ADMIN"
            ? {} // admin ve todas
            : { userId: req.user.id }; // user solo las suyas
        
        // Filtrar por rango de fechas si se proporciona
        // Si no se proporciona, usar rango por defecto: 12 meses atrás y 12 meses adelante
        if (startDate && endDate) {
            const { start: startOfRange } = getDateRange(startDate as string);
            const endOfRange = getEndOfDay(parseDateString(endDate as string));
            
            where.startTime = {
                gte: startOfRange,
                lte: endOfRange,
            };
        } else {
            // Rango por defecto: 12 meses atrás y 12 meses adelante
            const today = getStartOfDay();
            const twelveMonthsAgo = new Date(today);
            twelveMonthsAgo.setMonth(today.getMonth() - 12);
            const twelveMonthsAhead = new Date(today);
            twelveMonthsAhead.setMonth(today.getMonth() + 12);
            
            where.startTime = {
                gte: twelveMonthsAgo,
                lte: twelveMonthsAhead,
            };
        }

        const bookings = await prisma.daycareBooking.findMany({
            where,
            include: { user: { include: { children: true } }, slots: true, children: true },
            orderBy: [
                { startTime: "asc" }
            ],
        });

        // ✅ Formatear fechas usando timezone unificado (Europe/Madrid)
        const formattedBookings = bookings.map(booking => {
            return {
                ...booking,
                startTime: formatForAPI(booking.startTime),
                endTime: formatForAPI(booking.endTime),
                createdAt: formatForAPI(booking.createdAt),
                updatedAt: formatForAPI(booking.updatedAt),
            };
        });

        res.json(formattedBookings);
    } catch (err) {
        console.error("Error al listar reservas:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});


//MODIFICAR RESERVA DAYCARE
router.put("/:id", authenticateUser, validateDTO(UpdateDaycareBookingDTO), async (req: any, res: any) => {
    // ✅ Verificación de rol
    if (req.user.role !== "ADMIN" && req.user.role !== "USER") {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const bookingId = Number(req.params.id);

        // 🔍 Buscar la reserva
        const existingBooking = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { user: { include: { children: true } }, slots: true, children: true },
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        // ✅ No permitir modificar reservas con estado CLOSED
        if (existingBooking.status === 'CLOSED') {
            return res.status(400).json({ error: "No se puede modificar una reserva cerrada (CLOSED)." });
        }

        const { comments, startTime, endTime, slotId, childrenIds, numberOfChildren, clientName, childName, parent1Name, parent1Phone, parent2Name, parent2Phone } = req.body;
        const userId = req.user.id;

        // ✅ Validaciones básicas
        // Las reservas manuales no requieren childrenIds
        if (!existingBooking.isManual) {
            if (!childrenIds || !Array.isArray(childrenIds) || childrenIds.length === 0) {
                return res.status(400).json({ error: "Debes seleccionar al menos un niño para la reserva." });
            }
        }

        if (!startTime || !endTime) {
            return res.status(400).json({ error: "Debes proporcionar fecha y hora de inicio y fin." });
        }

        // 🔢 Determinar nuevos slots que abarca la nueva franja
        const start = new Date(startTime);
        const end = new Date(endTime);

        // ✅ Validar que las fechas sean válidas
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: "Fechas inválidas. Por favor, verifica las fechas proporcionadas." });
        }

        // ✅ Validar que la hora de inicio sea anterior a la de fin
        if (start >= end) {
            return res.status(400).json({ error: "La hora de inicio debe ser anterior a la hora de fin." });
        }

        // Extraer la fecha local correctamente usando utilidades
        const dateString = getLocalDateString(start);
        const { start: startOfDay, end: endOfDay } = getDateRange(dateString);
        const date = getStartOfDay(start);

        // ✅ Validar permisos: solo admin puede editar reservas manuales
        if (existingBooking.isManual && req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: "Solo los administradores pueden modificar reservas manuales." });
        }

        if (req.user.role !== 'ADMIN') {
            const now = getStartOfDay();
            if (date < now) {
                return res.status(400).json({ error: "No se pueden modificar reservas a fechas pasadas." });
            }
            // Validar también que la hora de inicio no sea pasada si es hoy
            if (isToday(start) && isPastDateTime(start)) {
                return res.status(400).json({ error: "No se pueden modificar reservas a horarios pasados." });
            }

            // ✅ Validar que el usuario solo pueda modificar sus propias reservas
            if (existingBooking.userId !== userId) {
                return res.status(403).json({ error: "No tienes permiso para modificar esta reserva." });
            }

            // ✅ Validar que los niños pertenezcan al usuario
            const userChildren = await prisma.user.findMany({
                where: {
                    id: { in: childrenIds },
                    tutorId: userId,
                    role: 'CHILD'
                }
            });

            if (userChildren.length !== childrenIds.length) {
                return res.status(403).json({ error: "Algunos de los niños seleccionados no pertenecen a tu cuenta." });
            }
        }

        // ✅ Calcular horas usando utilidades para consistencia
        // Si viene slotId, usarlo como referencia para evitar problemas de zona horaria (igual que en creación)
        let startHour: number;
        let endHour: number;
        let expectedSlotsCount: number;

        if (slotId) {
            // Usar el slotId para obtener el slot y calcular el rango desde la BD
            const referenceSlot = await prisma.daycareSlot.findUnique({
                where: { id: slotId }
            });

            if (!referenceSlot) {
                return res.status(404).json({ error: "Slot no encontrado." });
            }

            // Calcular el rango desde el slot de referencia (usa el hour real de la BD)
            startHour = referenceSlot.hour;
            // Calcular endHour basado en la diferencia entre startTime y endTime
            const timeDiffMs = end.getTime() - start.getTime();
            const timeDiffHours = Math.floor(timeDiffMs / (1000 * 60 * 60));
            endHour = startHour + timeDiffHours;
            expectedSlotsCount = timeDiffHours;
        } else {
            // Calcular desde startTime y endTime usando utilidades para consistencia
            startHour = getHourMadrid(start);
            endHour = getHourMadrid(end);
            expectedSlotsCount = endHour - startHour;
        }
        
        const spotsNeeded = existingBooking.isManual
            ? (existingBooking.manualNumberOfChildren || 0)
            : (childrenIds?.length || 0);

        // ✅ CRÍTICO: Mover toda la validación DENTRO de la transacción para prevenir race conditions
        // Usar retry logic para manejar conflictos de serialización automáticamente
        const updatedBooking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // ✅ Validar slots nuevos DENTRO de la transacción (previene race conditions)
            // Filtrar por rango de horas para encontrar los slots exactos necesarios
            const allNewSlotsByDate = await tx.daycareSlot.findMany({
                where: {
                    date: {
                        gte: startOfDay,
                        lte: endOfDay
                    },
                    // Filtrar por rango de horas: desde startHour hasta endHour (exclusivo)
                    hour: {
                        gte: startHour,
                        lt: endHour
                    }
                },
            });

            // Filtrar por status
            const allNewSlots = allNewSlotsByDate.filter(s => s.status === "OPEN");

            if (allNewSlots.length !== expectedSlotsCount) {
                const allNewSlotsByStatus = allNewSlotsByDate.filter(s => s.status !== 'OPEN');
                
                // Si hay slots pero no están OPEN, informar
                if (allNewSlotsByDate.length > 0 && allNewSlots.length < allNewSlotsByDate.length) {
                    const closedSlots = allNewSlotsByStatus;
                    throw new Error(`Los slots para el horario seleccionado no están disponibles (estado: ${closedSlots.map(s => s.status).join(', ')}).`);
                }
                
                throw new Error(`No hay slots disponibles para el horario seleccionado el día ${dateString}. Faltan ${expectedSlotsCount - allNewSlots.length} slot(s).`);
            }

            // ✅ Validar plazas disponibles DENTRO de la transacción
            const newSlotsWithSpots = allNewSlots.filter(slot => slot.availableSpots >= spotsNeeded);
            
            if (newSlotsWithSpots.length !== expectedSlotsCount) {
                const slotsWithoutSpots = allNewSlots.filter(slot => slot.availableSpots < spotsNeeded);
                const hoursWithoutSpots = slotsWithoutSpots.map(s => s.hour).join(", ");
                throw new Error(`No hay suficientes plazas disponibles. Se necesitan ${spotsNeeded} plaza(s) pero los slots de las ${hoursWithoutSpots}:00 no tienen suficientes plazas disponibles.`);
            }

            const newSlots = newSlotsWithSpots;

            // ✅ Validar reserva existente DENTRO de la transacción (previene duplicados)
            // Excluir la reserva actual que se está modificando
            const newSlotIds = newSlots.map(s => s.id);
            const existingBookingForNewSlots = await tx.daycareBooking.findFirst({
                where: {
                    userId: userId,
                    id: { not: bookingId }, // Excluir la reserva actual
                    slots: {
                        some: {
                            id: { in: newSlotIds }
                        }
                    },
                    status: {
                        not: 'CANCELLED'
                    }
                },
            });

            if (existingBookingForNewSlots) {
                throw new Error("Ya tienes una reserva activa para ese día/horario. Por favor, modifica o cancela tu reserva existente.");
            }

            // 🟢 Devolver plazas de slots antiguos
            // ✅ Validar que no exceda capacidad después de incrementar
            const oldChildrenCount = existingBooking.isManual 
                ? (existingBooking.manualNumberOfChildren || 0)
                : existingBooking.children.length;
            for (const oldSlot of existingBooking.slots) {
                const updatedOldSlot = await tx.daycareSlot.update({
                    where: { id: oldSlot.id },
                    data: { availableSpots: { increment: oldChildrenCount } },
                });
                
                // Validar que no exceda capacidad
                if (updatedOldSlot.availableSpots > updatedOldSlot.capacity) {
                    // Ajustar a capacidad máxima
                    await tx.daycareSlot.update({
                        where: { id: oldSlot.id },
                        data: { availableSpots: updatedOldSlot.capacity }
                    });
                    if (process.env.NODE_ENV === 'development') {
                        console.warn(`Slot ${oldSlot.id}: availableSpots ajustado a capacity (${updatedOldSlot.capacity})`);
                    }
                }
            }

            // 🔴 Restar plazas de los nuevos slots
            // ✅ Validar que availableSpots no vaya a negativo y no exceda capacidad
            const newChildrenCount = existingBooking.isManual
                ? (existingBooking.manualNumberOfChildren || 0)
                : (childrenIds?.length || 0);
            for (const newSlot of newSlots) {
                const updatedSlot = await tx.daycareSlot.update({
                    where: { id: newSlot.id },
                    data: { availableSpots: { decrement: newChildrenCount } },
                });
                
                // Verificar que no haya ido a negativo
                if (updatedSlot.availableSpots < 0) {
                    throw new Error(`Error: Las plazas disponibles no pueden ser negativas. Slot ${newSlot.id} tiene ${updatedSlot.availableSpots} plazas.`);
                }
                
                // ✅ Validar que no exceda capacidad
                if (updatedSlot.availableSpots > updatedSlot.capacity) {
                    throw new Error(`Error: Las plazas disponibles (${updatedSlot.availableSpots}) no pueden exceder la capacidad (${updatedSlot.capacity}). Slot ${newSlot.id}.`);
                }
            }

            // 🔁 Actualizar la reserva
            const updateData: any = {
                comments,
                startTime: start,
                endTime: end,
                slots: {
                    set: [], // desconecta todos los antiguos
                    connect: newSlots.map((s) => ({ id: s.id })), // conecta los nuevos
                },
            };

            // Solo actualizar userId si no es reserva manual
            if (!existingBooking.isManual) {
                updateData.userId = userId;
                updateData.children = {
                    set: [], // desconecta todos los antiguos
                    connect: childrenIds.map((id: number) => ({ id })), // conecta los nuevos
                };
            } else {
                // Actualizar campos manuales si se proporcionan
                if (numberOfChildren !== undefined) {
                    updateData.manualNumberOfChildren = numberOfChildren;
                }
                if (clientName !== undefined) {
                    updateData.manualClientName = clientName;
                }
                if (childName !== undefined) {
                    updateData.manualChildName = childName;
                }
                if (parent1Name !== undefined) {
                    updateData.manualParent1Name = parent1Name;
                }
                if (parent1Phone !== undefined) {
                    updateData.manualParent1Phone = parent1Phone;
                }
                if (parent2Name !== undefined) {
                    updateData.manualParent2Name = parent2Name;
                }
                if (parent2Phone !== undefined) {
                    updateData.manualParent2Phone = parent2Phone;
                }
            }

            const booking = await tx.daycareBooking.update({
                where: { id: bookingId },
                data: updateData,
                include: { user: { include: { children: true } }, slots: true, children: true },
            });

            return booking;
        }, {
            isolationLevel: 'Serializable', // Máxima protección contra race conditions
            timeout: 10000 // 10 segundos timeout
        }));

        // Recargar el booking con todas las relaciones para asegurar que el user esté cargado
        const bookingWithUser = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { 
                user: { include: { children: true } }, 
                slots: true, 
                children: true 
            },
        });
        
        if (bookingWithUser?.user?.email) {
            try {
                const emailData = getDaycareBookingConfirmedEmail(
                    bookingWithUser.user.name,
                    {
                        id: bookingWithUser.id,
                        startTime: bookingWithUser.startTime,
                        endTime: bookingWithUser.endTime,
                        children: bookingWithUser.children,
                        status: bookingWithUser.status
                    }
                );
                
                await sendTemplatedEmail(
                    bookingWithUser.user.email,
                    "Reserva de ludoteca modificada - Somriures & Colors",
                    emailData
                );
                console.log(`✅ Email de modificación de reserva enviado a ${bookingWithUser.user.email}`);
            } catch (emailError) {
                console.error("Error enviando email de modificación:", emailError);
                // No fallar la modificación si falla el email
            }
        } else {
            console.warn(`⚠️ No se puede enviar email de modificación: user o email no disponible. Booking ID: ${bookingId}`);
        }

        // Formatear fechas para evitar problemas de timezone
        const bookingToReturn = bookingWithUser || updatedBooking;
        return res.json({
            message: "✅ Reserva modificada correctamente.",
            booking: {
                ...bookingToReturn,
                startTime: formatForAPI(bookingToReturn.startTime),
                endTime: formatForAPI(bookingToReturn.endTime),
                createdAt: formatForAPI(bookingToReturn.createdAt),
                updatedAt: formatForAPI(bookingToReturn.updatedAt),
            },
        });
    } catch (err: any) {
        console.error("Error al modificar reserva:", err);
        
        // Manejar errores de validación lanzados dentro de la transacción
        if (err.message) {
            if (err.message.includes("No hay slots disponibles") || 
                err.message.includes("no están disponibles") ||
                err.message.includes("No hay suficientes plazas") ||
                err.message.includes("no pueden ser negativas")) {
                return res.status(400).json({ error: err.message });
            }
        }
        
        // Manejar errores específicos de Prisma
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva o recursos relacionados no encontrados." });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ error: "Referencia inválida. Verifica los IDs proporcionados." });
        }
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La modificación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
        }
        
        return res.status(500).json({ error: "Error interno del servidor." });
    } 
}
);



// CANCELAR RESERVA DAYCARE (USER y ADMIN)
router.put("/:id/cancel", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== "ADMIN" && req.user.role !== "USER") {
        return res.status(403).json({ error: "Forbidden" });
    }
    
    try {
        const bookingId = Number(req.params.id);

        // ✅ Validar que el ID sea válido
        if (isNaN(bookingId) || bookingId <= 0) {
            return res.status(400).json({ error: "ID de reserva inválido." });
        }
        
        const existingBooking = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { 
                slots: true, 
                children: true,
                user: true
            }
        });
        
        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        // ✅ No permitir cancelar reservas con estado CLOSED
        if (existingBooking.status === 'CLOSED') {
            return res.status(400).json({ error: "No se puede cancelar una reserva cerrada (CLOSED)." });
        }

        // ✅ Validar que el usuario solo pueda cancelar sus propias reservas (a menos que sea admin)
        if (req.user.role !== 'ADMIN' && existingBooking.userId !== req.user.id) {
            return res.status(403).json({ error: "No tienes permiso para cancelar esta reserva." });
        }
        
        const previousStatus = existingBooking.status;
        
        // Solo cancelar si no está ya cancelada
        if (existingBooking.status !== 'CANCELLED') {
            await executeWithRetry(() => prisma.$transaction(async (tx) => {
                await tx.daycareBooking.update({
                    where: { id: bookingId },
                    data: { status: 'CANCELLED' }
                });
                
                // Liberar plazas de los slots
                // ✅ Validar que no exceda capacidad después de incrementar
                for (const slot of existingBooking.slots) {
                    const updatedSlot = await tx.daycareSlot.update({
                        where: { id: slot.id },
                        data: { availableSpots: { increment: existingBooking.children.length } }
                    });
                    
                    // Validar que no exceda capacidad
                    if (updatedSlot.availableSpots > updatedSlot.capacity) {
                        // Ajustar a capacidad máxima
                        await tx.daycareSlot.update({
                            where: { id: slot.id },
                            data: { availableSpots: updatedSlot.capacity }
                        });
                        if (process.env.NODE_ENV === 'development') {
                            console.warn(`Slot ${slot.id}: availableSpots ajustado a capacity (${updatedSlot.capacity})`);
                        }
                    }
                }
            }, {
                isolationLevel: 'Serializable', // Máxima protección contra race conditions
                timeout: 10000 // 10 segundos timeout
            }));
        }
        
        // Enviar email de cancelación
        if (existingBooking.user?.email && previousStatus !== 'CANCELLED') {
            try {
                const emailData = getDaycareBookingStatusChangedEmail(
                    existingBooking.user.name,
                    {
                        id: existingBooking.id,
                        startTime: existingBooking.startTime,
                        endTime: existingBooking.endTime,
                        children: existingBooking.children,
                        status: 'CANCELLED'
                    },
                    previousStatus
                );
                
                await sendTemplatedEmail(
                    existingBooking.user.email,
                    "Reserva de ludoteca cancelada - Somriures & Colors",
                    emailData
                );
                console.log(`✅ Email de cancelación enviado a ${existingBooking.user.email}`);
            } catch (emailError) {
                console.error("Error enviando email de cancelación:", emailError);
                // No fallar la cancelación si falla el email
            }
        }
        
        return res.json({ message: "✅ Reserva cancelada correctamente" });
    } catch (err: any) {
        console.error("Error al cancelar reserva:", err);
        
        // Manejar errores específicos de Prisma
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ error: "Referencia inválida. Verifica los IDs proporcionados." });
        }
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La cancelación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
        }
        
        return res.status(500).json({ error: "Error interno del servidor." });
    }
});

// MARCAR ASISTENCIA DE RESERVA DAYCARE (SOLO ADMIN)
router.put("/:id/attendance", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden. Solo los administradores pueden marcar asistencia." });
    }

    try {
        const bookingId = Number(req.params.id);

        // ✅ Validar que el ID sea válido
        if (isNaN(bookingId) || bookingId <= 0) {
            return res.status(400).json({ error: "ID de reserva inválido." });
        }

        const { attendanceStatus } = req.body;

        if (!attendanceStatus || !['ATTENDED', 'NOT_ATTENDED', 'PENDING'].includes(attendanceStatus)) {
            return res.status(400).json({ error: "Estado de asistencia inválido. Debe ser ATTENDED, NOT_ATTENDED o PENDING." });
        }

        const booking = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { user: { include: { children: true } }, slots: true, children: true },
        });

        if (!booking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        const updatedBooking = await prisma.daycareBooking.update({
            where: { id: bookingId },
            data: { attendanceStatus },
            include: { user: { include: { children: true } }, slots: true, children: true },
        });

        // ✅ Formatear fechas usando timezone unificado
        return res.json({
            message: `✅ Asistencia marcada como ${attendanceStatus === 'ATTENDED' ? 'asistió' : attendanceStatus === 'NOT_ATTENDED' ? 'no asistió' : 'pendiente'}.`,
            booking: {
                ...updatedBooking,
                startTime: formatForAPI(updatedBooking.startTime),
                endTime: formatForAPI(updatedBooking.endTime),
                createdAt: formatForAPI(updatedBooking.createdAt),
                updatedAt: formatForAPI(updatedBooking.updatedAt),
            },
        });
    } catch (err: any) {
        console.error("Error al marcar asistencia:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        return res.status(500).json({ error: "Error interno del servidor." });
    }
});

// ELIMINAR RESERVA DAYCARE (SOLO ADMIN)
router.delete("/deletedDaycareBooking/:id", authenticateUser, async (req: any, res: any) => {
    try {
        // ✅ Permitir solo ADMIN
        if (req.user.role !== "ADMIN") {
            return res.status(403).json({ error: "Forbidden. Solo los administradores pueden eliminar reservas." });
        }

        const { id } = req.params;
        const bookingId = Number(id);

        // ✅ Validar que el ID sea válido
        if (isNaN(bookingId) || bookingId <= 0) {
            return res.status(400).json({ error: "ID de reserva inválido." });
        }

        // 🔍 Buscar la reserva con sus slots
        const booking = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { user: { include: { children: true } }, slots: true, children: true },
        });

        if (!booking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        // Guardar información de la reserva antes de eliminarla para enviar email
        const previousStatus = booking.status;
        const bookingInfo = {
            id: booking.id,
            startTime: booking.startTime,
            endTime: booking.endTime,
            children: booking.children,
            status: booking.status,
            user: booking.user
        };

        // 🧩 Ejecutar todo en una transacción
        // Usar retry logic para manejar conflictos de serialización automáticamente
        await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // 1️⃣ Liberar plazas de todos los slots asociados SOLO si la reserva NO está cancelada
            // (Si está cancelada, las plazas ya fueron liberadas al cancelar)
            if (booking.status !== 'CANCELLED') {
                const childrenCount = booking.children.length;
                for (const slot of booking.slots) {
                    const updatedSlot = await tx.daycareSlot.update({
                        where: { id: slot.id },
                        data: { availableSpots: { increment: childrenCount } },
                    });
                    
                    // Validar que no exceda capacidad
                    if (updatedSlot.availableSpots > updatedSlot.capacity) {
                        // Ajustar a capacidad máxima
                        await tx.daycareSlot.update({
                            where: { id: slot.id },
                            data: { availableSpots: updatedSlot.capacity }
                        });
                        if (process.env.NODE_ENV === 'development') {
                            console.warn(`Slot ${slot.id}: availableSpots ajustado a capacity (${updatedSlot.capacity})`);
                        }
                    }
                }
            }

            // 2️⃣ Desconectar relaciones many-to-many antes de eliminar
            // Prisma debería manejarlo automáticamente, pero en producción con constraints estrictos
            // puede fallar si hay referencias activas. Desconectar explícitamente es más seguro.
            await tx.daycareBooking.update({
                where: { id: bookingId },
                data: {
                    slots: {
                        set: []
                    },
                    children: {
                        set: []
                    }
                }
            });

            // 3️⃣ Eliminar la reserva
            await tx.daycareBooking.delete({
                where: { id: bookingId },
            });
        }, {
            isolationLevel: 'ReadCommitted', // Menos estricto que Serializable, evita deadlocks
            timeout: 10000 // 10 segundos timeout
        }));

        // Enviar email de eliminación solo si la reserva NO estaba cancelada
        if (bookingInfo.user?.email && previousStatus !== 'CANCELLED') {
            try {
                const emailData = getDaycareBookingStatusChangedEmail(
                    bookingInfo.user.name,
                    {
                        id: bookingInfo.id,
                        startTime: bookingInfo.startTime,
                        endTime: bookingInfo.endTime,
                        children: bookingInfo.children,
                        status: 'CANCELLED' // Se marca como cancelada en el email
                    },
                    previousStatus
                );
                
                console.log(`✅ Email de eliminación enviado a ${bookingInfo.user.email}`);
            } catch (emailError) {
                console.error("Error enviando email de eliminación:", emailError);
                // No fallar la eliminación si falla el email
            }
        }

        res.json({ message: "✅ Reserva eliminada correctamente y plazas liberadas." });
    } catch (err: any) {
        console.error("Error al eliminar reserva:", err);
        console.error("Error completo:", JSON.stringify(err, null, 2));
        console.error("Error code:", err.code);
        console.error("Error message:", err.message);
        console.error("Error meta:", err.meta);
        
        // Manejar errores específicos de Prisma
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ 
                error: "No se puede eliminar la reserva debido a referencias existentes.",
                details: err.meta?.field_name ? `Campo: ${err.meta.field_name}` : undefined
            });
        }
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La eliminación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
        }
        if (err.code === 'P1008') {
            // Timeout de transacción
            return res.status(408).json({ 
                error: "La operación tardó demasiado. Por favor, intenta de nuevo." 
            });
        }
        
        res.status(500).json({ 
            error: "Error interno del servidor.",
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    } 
});



// MARCAR RESERVAS PASADAS COMO CLOSED (ADMIN o automático)
// Endpoint con autenticación para ejecución manual por admin
router.post("/close-past-bookings", authenticateUser, async (req: any, res: any) => {
    // ✅ Solo admin puede ejecutar manualmente
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Forbidden. Solo los administradores pueden ejecutar esta acción." });
    }

    try {
        const { closePastBookingsAndNotify } = await import("../services/closeBookingsService");
        const result = await closePastBookingsAndNotify();

        return res.json({
            message: `✅ ${result.closed} reserva(s) pasada(s) marcada(s) como CLOSED. ${result.notified} notificación(es) enviada(s).`,
            closed: result.closed,
            notified: result.notified
        });
    } catch (err: any) {
        console.error("Error cerrando reservas pasadas:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
});

// Endpoint sin autenticación para ejecución automática por cron job
// Protegido por token secreto en el header
router.post("/close-past-bookings-auto", async (req: any, res: any) => {
    const secretToken = req.headers['x-cron-secret'];
    const expectedToken = process.env.CRON_SECRET_TOKEN;

    if (!expectedToken || secretToken !== expectedToken) {
        return res.status(401).json({ error: "Unauthorized. Token inválido." });
    }

    try {
        const { closePastBookingsAndNotify } = await import("../services/closeBookingsService");
        const result = await closePastBookingsAndNotify();

        return res.json({
            message: `✅ ${result.closed} reserva(s) pasada(s) marcada(s) como CLOSED. ${result.notified} notificación(es) enviada(s).`,
            closed: result.closed,
            notified: result.notified
        });
    } catch (err: any) {
        console.error("Error cerrando reservas pasadas:", err);
        return res.status(500).json({ error: "Error interno del servidor." });
    }
});

export default router;