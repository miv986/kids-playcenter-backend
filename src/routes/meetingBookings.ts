import express from "express";
import { authenticateUser, optionalAuthenticate } from "../middleware/auth";
import { validateDTO } from "../middleware/validation";
import { CreateMeetingBookingDTO } from "../dtos/CreateMeetingBookingDTO";
import { getStartOfDay, isToday, isPastDateTime, getDateRange, getEndOfDay, parseDateString, validateNotPastDate, validateNotPastTodayDateTime } from "../utils/dateHelpers";
import { sendTemplatedEmail } from "../service/mailing";
import { getMeetingBookingCreatedEmail, getMeetingBookingModifiedEmail, getMeetingBookingCancelledEmail } from "../service/emailTemplates";
import prisma from "../utils/prisma";
import { executeWithRetry } from "../utils/transactionRetry";

const router = express.Router();

// CREAR RESERVA MEETING
router.post("/", optionalAuthenticate, validateDTO(CreateMeetingBookingDTO), async (req: any, res: any) => {
    const { email, phone, comments, slotId, name } = req.body;

    // ✅ Si el usuario está logueado, usar su email; si no, requerir email en el body
    let finalEmail = email;
    let finalName = name;

    if (req.user && req.user.name) {
        finalName = req.user.name;
    } else if (!name || name.trim() === '') {
        return res.status(400).json({ error: "Debes proporcionar un nombre o estar logueado." });
    }
    if (req.user && req.user.email) {
        finalEmail = req.user.email;
    } else if (!email || email.trim() === '') {
        return res.status(400).json({ error: "Debes proporcionar un email o estar logueado." });
    }

    // ✅ Validaciones básicas antes de la transacción
    if (!slotId || isNaN(Number(slotId))) {
        return res.status(400).json({ error: "ID de slot inválido." });
    }

    // ✅ Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalEmail.trim())) {
        return res.status(400).json({ error: "El formato del email no es válido." });
    }

    try {
        // ✅ Usar transacción para prevenir race conditions - verificar y crear atómicamente
        const addedBooking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // Verificar slot dentro de la transacción para evitar race conditions
            const slot = await tx.meetingSlot.findUnique({
                where: { id: Number(slotId) },
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
                throw new Error("Slot no encontrado");
            }

            if (slot.status !== "OPEN") {
                throw new Error("Este slot no está disponible");
            }

            // ✅ Validar que hay plazas disponibles
            if (slot.availableSpots <= 0) {
                throw new Error("No hay plazas disponibles en este slot");
            }

            // ✅ Validar que la fecha del slot no sea pasada (usando helpers estandarizados)
            // slot.startTime ya es un Date desde la BD, usar directamente
            try {
                validateNotPastDate(slot.startTime, "No se pueden reservar slots con fechas pasadas.");
                validateNotPastTodayDateTime(slot.startTime, slot.startTime, "No se pueden reservar slots con horarios pasados.");
            } catch (validationError: any) {
                throw new Error(validationError.message);
            }

            // Crear la reserva
            const booking = await tx.meetingBooking.create({
                data: {
                    email: finalEmail.trim(),
                    name: finalName.trim(),
                    phone: phone?.trim() || null,
                    comments: comments?.trim() || null,
                    slot: { connect: { id: Number(slotId) } },
                    status: 'CONFIRMED'
                },
                include: {
                    slot: true
                }
            });

            // Actualizar availableSpots del slot
            await tx.meetingSlot.update({
                where: { id: Number(slotId) },
                data: {
                    availableSpots: {
                        decrement: 1
                    }
                }
            });

            return booking;
        }, {
            isolationLevel: 'Serializable',
            timeout: 10000
        }));

        // Enviar email de confirmación de reserva creada
        if (finalEmail) {
            try {
                const emailData = getMeetingBookingCreatedEmail(finalEmail, finalName, {
                    id: addedBooking.id,
                    date: addedBooking.slot.date,
                    startTime: addedBooking.slot.startTime,
                    endTime: addedBooking.slot.endTime,
                    phone: addedBooking.phone,
                    comments: addedBooking.comments,
                });

                await sendTemplatedEmail(
                    finalEmail,
                    "Reserva de visita/tutoría recibida - Somriures & Colors",
                    emailData
                );
                console.log(`✅ Email de confirmación de reserva enviado a ${finalEmail}`);
            } catch (emailError) {
                console.error("Error enviando email de confirmación:", emailError);
                // No fallar la creación si falla el email
            }
        }

        res.json(addedBooking);
    } catch (err: any) {
        console.error("Error creando reserva de meeting:", err);
        if (err.message?.includes("no encontrado") || err.message?.includes("no está disponible") ||
            err.message?.includes("plazas disponibles") || err.message?.includes("fechas pasadas") ||
            err.message?.includes("horarios pasados")) {
            return res.status(400).json({ error: err.message });
        }
        if (err.code === 'P2034') {
            return res.status(409).json({
                error: "La reserva no pudo completarse debido a un conflicto. Por favor, intenta de nuevo."
            });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// LISTAR TODAS LAS RESERVAS (ADMIN)
// Parámetros opcionales: startDate, endDate (YYYY-MM-DD) para filtrar por rango
router.get("/", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        const { startDate, endDate } = req.query;
        
        const whereClause: any = {};
        
        // Filtrar por rango de fechas si se proporciona
        // Si no se proporciona, usar rango por defecto: 12 meses atrás y 12 meses adelante
        if (startDate && endDate) {
            const { start: startOfRange } = getDateRange(startDate as string);
            const endOfRange = getEndOfDay(parseDateString(endDate as string));
            
            // MeetingBooking siempre tiene slot (slotId es obligatorio)
            whereClause.slot = {
                startTime: {
                    gte: startOfRange,
                    lte: endOfRange,
                }
            };
        } else {
            // Rango por defecto: 12 meses atrás y 12 meses adelante
            const today = getStartOfDay();
            const twelveMonthsAgo = new Date(today);
            twelveMonthsAgo.setMonth(today.getMonth() - 12);
            const twelveMonthsAhead = new Date(today);
            twelveMonthsAhead.setMonth(today.getMonth() + 12);
            
            // MeetingBooking siempre tiene slot (slotId es obligatorio)
            whereClause.slot = {
                startTime: {
                    gte: twelveMonthsAgo,
                    lte: twelveMonthsAhead,
                }
            };
        }
        
        const bookings = await prisma.meetingBooking.findMany({
            where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
            include: {
                slot: true
            },
            orderBy: [
                { createdAt: "asc" }
            ]
        });
        res.json(bookings);
    } catch (err) {
        console.error("Error listando reservas de meeting:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// OBTENER RESERVAS POR FECHA (ADMIN)
router.get("/by-date/:date", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { date } = req.params; // "YYYY-MM-DD"

    // ✅ Validar formato de fecha
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Formato de fecha inválido. Use YYYY-MM-DD." });
    }

    const [year, month, day] = date.split("-").map(Number);

    // ✅ Validar que los valores sean válidos
    if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        return res.status(400).json({ error: "Fecha inválida." });
    }

    // Crear rango en hora local (estandarizado)
    const { start: startOfDay, end: endOfDay } = getDateRange(date);

    // ✅ Validar que las fechas sean válidas
    if (isNaN(startOfDay.getTime()) || isNaN(endOfDay.getTime())) {
        return res.status(400).json({ error: "Fecha inválida." });
    }

    try {
        const bookings = await prisma.meetingBooking.findMany({
            where: {
                slot: {
                    startTime: { gte: startOfDay, lte: endOfDay }
                }
            },
            include: { slot: true },
            orderBy: { createdAt: 'desc' }
        });

        res.json(bookings);
    } catch (err) {
        console.error("Error en GET /meetingBookings/by-date/:date:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// UPDATE MeetingBooking
router.put("/:id", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const bookingId = Number(id);

    // ✅ Validar que el ID sea válido
    if (isNaN(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: "ID de reserva inválido." });
    }

    const { email, name, phone, comments, status, slotId } = req.body;

    try {
        // Verificar que la reserva existe y obtener el slot actual
        const existingBooking = await prisma.meetingBooking.findUnique({
            where: { id: bookingId },
            include: { slot: true }
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        const previousSlotId = existingBooking.slotId;
        const previousStatus = existingBooking.status;

        // Validar slot si se quiere cambiar
        if (slotId) {
            if (isNaN(Number(slotId)) || Number(slotId) <= 0) {
                return res.status(400).json({ error: "ID de slot inválido." });
            }

            const slot = await prisma.meetingSlot.findUnique({
                where: { id: Number(slotId) },
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
            if (!slot) return res.status(404).json({ error: "Slot no encontrado" });

            if (slot.status !== "OPEN") {
                return res.status(400).json({ error: "Este slot no está disponible" });
            }

            // Validar que hay plazas disponibles (si no es el mismo slot)
            if (Number(slotId) !== previousSlotId && slot.availableSpots <= 0) {
                return res.status(400).json({ error: "No hay plazas disponibles en este slot" });
            }
        }

        // Usar transacción para asegurar atomicidad
        const updatedBooking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // Si la reserva se cancela, incrementar availableSpots del slot
            if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && previousSlotId) {
                await tx.meetingSlot.update({
                    where: { id: previousSlotId },
                    data: {
                        availableSpots: {
                            increment: 1
                        }
                    }
                });
            }

            // Si se cambió el slot (y no se está cancelando), actualizar availableSpots
            if (slotId && previousSlotId && Number(slotId) !== previousSlotId && status !== 'CANCELLED') {
                // Incrementar availableSpots del slot anterior
                await tx.meetingSlot.update({
                    where: { id: previousSlotId },
                    data: {
                        availableSpots: {
                            increment: 1
                        }
                    }
                });

                // Decrementar availableSpots del nuevo slot
                await tx.meetingSlot.update({
                    where: { id: Number(slotId) },
                    data: {
                        availableSpots: {
                            decrement: 1
                        }
                    }
                });
            }

            // Si se reactiva una reserva cancelada, decrementar availableSpots
            if (status !== 'CANCELLED' && previousStatus === 'CANCELLED' && previousSlotId) {
                await tx.meetingSlot.update({
                    where: { id: previousSlotId },
                    data: {
                        availableSpots: {
                            decrement: 1
                        }
                    }
                });
            }

            // Actualizar la reserva
            const updateData: any = {};
            if (email !== undefined) updateData.email = email.trim();
            if (name !== undefined) updateData.name = name.trim();
            if (phone !== undefined) updateData.phone = phone?.trim() || null;
            if (comments !== undefined) updateData.comments = comments?.trim() || null;
            if (status !== undefined) updateData.status = status;

            // Si se cambia el slot y no se cancela, conectar el nuevo
            if (slotId && status !== 'CANCELLED') {
                updateData.slot = { connect: { id: Number(slotId) } };
            }

            const booking = await tx.meetingBooking.update({
                where: { id: bookingId },
                data: updateData,
                include: {
                    slot: true
                }
            });

            return booking;
        }, {
            isolationLevel: 'Serializable',
            timeout: 10000
        }));

        // Enviar email de modificación o cancelación
        const bookingEmail = existingBooking.email;
        if (bookingEmail) {
            try {
                const slot = updatedBooking.slot || existingBooking.slot;
                if (slot) {
                    // Si se canceló, enviar email de cancelación
                    if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
                        const emailData = getMeetingBookingCancelledEmail(bookingEmail, existingBooking.name, {
                            id: updatedBooking.id,
                            date: slot.date,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            phone: updatedBooking.phone,
                            comments: updatedBooking.comments
                        });

                        await sendTemplatedEmail(
                            bookingEmail,
                            "Reserva de visita/tutoría cancelada - Somriures & Colors",
                            emailData
                        );
                        console.log(`✅ Email de cancelación enviado a ${bookingEmail}`);
                    }
                    // Si se modificó (pero no se canceló), enviar email de modificación
                    else if (status !== 'CANCELLED' && previousStatus !== 'CANCELLED') {
                        // Verificar si realmente hubo cambios
                        const hasChanges = email !== undefined || phone !== undefined ||
                            comments !== undefined ||
                            (slotId && Number(slotId) !== previousSlotId);

                        if (hasChanges) {
                            const emailData = getMeetingBookingModifiedEmail(bookingEmail, existingBooking.name, {
                                id: updatedBooking.id,
                                date: slot.date,
                                startTime: slot.startTime,
                                endTime: slot.endTime,
                                phone: updatedBooking.phone,
                                comments: updatedBooking.comments,
                                status: updatedBooking.status
                            });

                            await sendTemplatedEmail(
                                bookingEmail,
                                "Reserva de visita/tutoría modificada - Somriures & Colors",
                                emailData
                            );
                            console.log(`✅ Email de modificación enviado a ${bookingEmail}`);
                        }
                    }
                }
            } catch (emailError) {
                console.error("Error enviando email:", emailError);
                // No fallar la actualización si falla el email
            }
        }

        res.json(updatedBooking);
    } catch (err: any) {
        console.error("Error actualizando reserva de meeting:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2002') {
            return res.status(400).json({ error: "Conflicto con otra reserva." });
        }
        if (err.code === 'P2034') {
            return res.status(409).json({
                error: "La modificación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo."
            });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// UPDATE MeetingBooking Status
router.put("/status/:id", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const bookingId = Number(id);

    // ✅ Validar que el ID sea válido
    if (isNaN(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: "ID de reserva inválido." });
    }

    const { status } = req.body;

    // ✅ Validar estado si se proporciona
    if (status && !['PENDING', 'CONFIRMED', 'CANCELLED'].includes(status)) {
        return res.status(400).json({ error: "Estado inválido." });
    }

    try {
        // Verificar que la reserva existe
        const existingBooking = await prisma.meetingBooking.findUnique({
            where: { id: bookingId },
            include: {
                slot: true
            }
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        const previousStatus = existingBooking.status;
        const previousSlotId = existingBooking.slotId;

        // Validar que la reserva tenga slot asociado (excepto si se está cancelando)
        if (!existingBooking.slot && status !== 'CANCELLED') {
            return res.status(400).json({
                error: "Esta reserva no tiene slot asociado. Solo se puede cancelar."
            });
        }

        const updatedBooking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // Si la reserva se cancela, incrementar availableSpots del slot
            if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && previousSlotId) {
                await tx.meetingSlot.update({
                    where: { id: previousSlotId },
                    data: {
                        availableSpots: {
                            increment: 1
                        }
                    }
                });
            }

            // Si se reactiva una reserva cancelada, decrementar availableSpots
            if (status !== 'CANCELLED' && previousStatus === 'CANCELLED' && previousSlotId) {
                await tx.meetingSlot.update({
                    where: { id: previousSlotId },
                    data: {
                        availableSpots: {
                            decrement: 1
                        }
                    }
                });
            }

            const booking = await tx.meetingBooking.update({
                where: { id: bookingId },
                data: { status },
                include: {
                    slot: true
                }
            });

            return booking;
        }, {
            isolationLevel: 'Serializable',
            timeout: 10000
        }));

        // Enviar email de cambio de estado
        const bookingEmail = existingBooking.email;
        if (bookingEmail && status) {
            try {
                const slot = updatedBooking.slot || existingBooking.slot;
                if (slot) {
                    // Si se canceló, enviar email de cancelación
                    if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
                        const emailData = getMeetingBookingCancelledEmail(bookingEmail, existingBooking.name, {
                            id: updatedBooking.id,
                            date: slot.date,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            phone: updatedBooking.phone,
                            comments: updatedBooking.comments
                        });

                        await sendTemplatedEmail(
                            bookingEmail,
                            "Reserva de visita/tutoría cancelada - Somriures & Colors",
                            emailData
                        );
                        console.log(`✅ Email de cancelación enviado a ${bookingEmail}`);
                    }
                    // Si se modificó el estado (pero no se canceló), enviar email de modificación
                    else if (status !== 'CANCELLED' && previousStatus !== status) {
                        const emailData = getMeetingBookingModifiedEmail(bookingEmail, existingBooking.name, {
                            id: updatedBooking.id,
                            date: slot.date,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            phone: updatedBooking.phone,
                            comments: updatedBooking.comments,
                            status: updatedBooking.status
                        });

                        await sendTemplatedEmail(
                            bookingEmail,
                            "Reserva de visita/tutoría modificada - Somriures & Colors",
                            emailData
                        );
                        console.log(`✅ Email de cambio de estado enviado a ${bookingEmail}`);
                    }
                }
            } catch (emailError) {
                console.error("Error enviando email:", emailError);
                // No fallar la actualización si falla el email
            }
        }

        res.json(updatedBooking);
    } catch (err: any) {
        console.error("Error actualizando estado de reserva de meeting:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2034') {
            return res.status(409).json({
                error: "La modificación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo."
            });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// DELETE MeetingBooking
router.delete("/:id", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const bookingId = Number(id);

    // ✅ Validar que el ID sea válido
    if (isNaN(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: "ID de reserva inválido." });
    }

    try {
        // Verificar que la reserva existe
        const existingBooking = await prisma.meetingBooking.findUnique({
            where: { id: bookingId },
            include: { slot: true }
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        const slotId = existingBooking.slotId;

        // Usar transacción para asegurar atomicidad
        await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // Si la reserva no está cancelada y tiene slot, incrementar availableSpots
            if (existingBooking.status !== 'CANCELLED' && slotId) {
                await tx.meetingSlot.update({
                    where: { id: slotId },
                    data: {
                        availableSpots: {
                            increment: 1
                        }
                    }
                });
            }

            // Eliminar la reserva
            await tx.meetingBooking.delete({
                where: { id: bookingId }
            });
        }, {
            isolationLevel: 'Serializable',
            timeout: 10000
        }));

        // Enviar email de cancelación si la reserva no estaba cancelada y tenía slot
        const bookingEmail = existingBooking.email;
        if (bookingEmail && existingBooking.status !== 'CANCELLED' && existingBooking.slot) {
            try {
                const emailData = getMeetingBookingCancelledEmail(bookingEmail, existingBooking.name, {
                    id: existingBooking.id,
                    date: existingBooking.slot.date,
                    startTime: existingBooking.slot.startTime,
                    endTime: existingBooking.slot.endTime,
                    phone: existingBooking.phone,
                    comments: existingBooking.comments
                });

                await sendTemplatedEmail(
                    bookingEmail,
                    "Reserva de visita/tutoría cancelada - Somriures & Colors",
                    emailData
                );
                console.log(`✅ Email de cancelación enviado a ${bookingEmail}`);
            } catch (emailError) {
                console.error("Error enviando email:", emailError);
                // No fallar la eliminación si falla el email
            }
        }

        res.json({ message: "Reserva eliminada correctamente" });
    } catch (err: any) {
        console.error("Error eliminando reserva de meeting:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2034') {
            return res.status(409).json({
                error: "La eliminación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo."
            });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

export default router;

