import express from "express";
import { authenticateUser } from "../middleware/auth";
import { PrismaClient } from "@prisma/client";
import { validateDTO } from "../middleware/validation";
import { CreateBirthdayBookingDTO } from "../dtos/CreateBirthdayBookingDTO";
import { sendTemplatedEmail } from "../service/mailing";
import { getBirthdayBookingCreatedEmail, getBirthdayBookingConfirmedEmail, getBirthdayBookingCancelledEmail } from "../service/emailTemplates";
import { secureLogger } from "../utils/logger";
import { sanitizeResponse } from "../utils/sanitize";
const prisma = new PrismaClient();
const router = express.Router();

//
// BOOKINGS CUMPLEAÑOS
//

//CREAR RESERVA CUMPLEAÑOS
router.post("/createBirthdayBooking", validateDTO(CreateBirthdayBookingDTO), async (req: any, res: any) => {
    const { guest, guestEmail, number_of_kids, contact_number, packageType, comments, slotId } = req.body;
    const slot = await prisma.birthdaySlot.findUnique({
        where: { id: slotId },
        include: { booking: true } // para verificar si ya tiene reserva
    });

    if (!slot) {
        return res.status(404).json({ error: "Slot no encontrado" });
    }

    if (slot.booking) {
        return res.status(400).json({ error: "Este slot ya está reservado" });
    }

    if (slot.status !== "OPEN") {
        return res.status(400).json({ error: "Este slot no está disponible" });
    }

    // ✅ Validaciones adicionales
    if (!number_of_kids || number_of_kids <= 0) {
        return res.status(400).json({ error: "El número de niños debe ser mayor a 0." });
    }

    if (!guest || guest.trim() === '') {
        return res.status(400).json({ error: "Debes proporcionar el nombre del invitado." });
    }

    if (!contact_number || contact_number.trim() === '') {
        return res.status(400).json({ error: "Debes proporcionar un número de contacto." });
    }

    // ✅ Validar que la fecha del slot no sea pasada
    const now = new Date();
    const slotDate = new Date(slot.startTime);
    const slotDateOnly = new Date(slotDate);
    slotDateOnly.setHours(0, 0, 0, 0);
    const nowDateOnly = new Date(now);
    nowDateOnly.setHours(0, 0, 0, 0);
    
    if (slotDateOnly < nowDateOnly) {
        return res.status(400).json({ error: "No se pueden reservar slots con fechas pasadas." });
    }
    
    // Si es hoy, validar que la hora no sea pasada
    if (slotDateOnly.getTime() === nowDateOnly.getTime() && slotDate < now) {
        return res.status(400).json({ error: "No se pueden reservar slots con horarios pasados." });
    }

    // ✅ Validar que slotId sea un número válido
    if (!slotId || isNaN(Number(slotId))) {
        return res.status(400).json({ error: "ID de slot inválido." });
    }

    // ✅ Validar que las fechas sean válidas
    if (isNaN(slotDate.getTime())) {
        return res.status(400).json({ error: "Fecha del slot inválida." });
    }

    try {
        // ✅ Usar transacción para garantizar atomicidad
        const addedBooking = await prisma.$transaction(async (tx) => {
            // Crear la reserva
            const booking = await tx.birthdayBooking.create({
                data: {
                    guest: guest.trim(),
                    guestEmail: guestEmail?.trim(),
                    number_of_kids: number_of_kids,
                    contact_number: contact_number.trim(),
                    comments: comments?.trim(),
                    packageType: packageType,
                    slot: { connect: { id: Number(slotId) } }
                },
                include: {
                    slot: true
                }
            });

            // Actualizar el slot a CLOSED
            await tx.birthdaySlot.update({
                where: { id: Number(slotId) },
                data: { status: "CLOSED" },
            });

            return booking;
        });

        // Enviar email de confirmación de reserva creada
        if (guestEmail) {
            try {
                const emailData = getBirthdayBookingCreatedEmail(guest, {
                    id: addedBooking.id,
                    date: addedBooking.slot.date,
                    startTime: addedBooking.slot.startTime,
                    endTime: addedBooking.slot.endTime,
                    packageType: packageType,
                    number_of_kids: number_of_kids,
                    contact_number: contact_number
                });
                
                await sendTemplatedEmail(
                    guestEmail,
                    "Reserva de cumpleaños recibida - Somriures & Colors",
                    emailData
                );
                secureLogger.info("Email de confirmación de reserva enviado", { guestEmail });
            } catch (emailError) {
                secureLogger.error("Error enviando email de confirmación", { guestEmail });
                // No fallar la creación si falla el email
            }
        }

        res.status(201).json(sanitizeResponse(addedBooking));
    } catch (err: any) {
        secureLogger.error("Error creando reserva de cumpleaños", { slotId });
        // Manejar errores específicos de Prisma
        if (err.code === 'P2002') {
            return res.status(400).json({ error: "Este slot ya está reservado." });
        }
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Slot no encontrado." });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// GET BirthdayBooking por ID
router.get("/getBirthdayBooking/:id", authenticateUser, async (req: any, res) => {
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
        const booking = await prisma.birthdayBooking.findUnique({
            where: { id: bookingId },
            include: { slot: true }
        });

        if (!booking) {
            return res.status(404).json({ error: "Reserva no encontrada" });
        }

        res.json(sanitizeResponse(booking));
    } catch (err) {
        secureLogger.error("Error obteniendo reserva de cumpleaños", { bookingId });
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// GET BirthdayBookings por fecha
router.get("/getBirthdayBooking/by-date/:date", authenticateUser, async (req: any, res) => {
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

    // Crear rango en UTC
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    // ✅ Validar que las fechas sean válidas
    if (isNaN(startOfDay.getTime()) || isNaN(endOfDay.getTime())) {
        return res.status(400).json({ error: "Fecha inválida." });
    }

    try {
        const bookings = await prisma.birthdayBooking.findMany({
            where: {
                slot: {
                    startTime: { gte: startOfDay, lte: endOfDay }
                }
            },
            include: { slot: true }
        });

        res.json(sanitizeResponse(bookings));
    } catch (err) {
        secureLogger.error("Error obteniendo reservas por fecha", { date });
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// UPDATE BirthdayBooking
router.put("/updateBirthdayBooking/:id", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const bookingId = Number(id);

    // ✅ Validar que el ID sea válido
    if (isNaN(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: "ID de reserva inválido." });
    }

    const { guest, number_of_kids, phone, pack, comments, status, slotId } = req.body;

    // ✅ Validaciones de datos
    if (number_of_kids !== undefined && (isNaN(Number(number_of_kids)) || number_of_kids <= 0)) {
        return res.status(400).json({ error: "El número de niños debe ser mayor a 0." });
    }

    try {
        // Verificar que la reserva existe
        const existingBooking = await prisma.birthdayBooking.findUnique({
            where: { id: bookingId }
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        // Validar slot si se quiere cambiar
        if (slotId) {
            if (isNaN(Number(slotId)) || Number(slotId) <= 0) {
                return res.status(400).json({ error: "ID de slot inválido." });
            }

            const slot = await prisma.birthdaySlot.findUnique({
                where: { id: Number(slotId) },
                include: { booking: true }
            });
            if (!slot) return res.status(404).json({ error: "Slot no encontrado" });
            if (slot.booking && slot.booking.id !== bookingId) {
                return res.status(400).json({ error: "Este slot ya está reservado" });
            }
            if (slot.status !== "OPEN") return res.status(400).json({ error: "Este slot no está disponible" });
        }

        const updatedBooking = await prisma.birthdayBooking.update({
            where: { id: bookingId },
            data: {
                guest,
                number_of_kids,
                contact_number: phone,
                comments,
                packageType: pack,
                status,
                ...(slotId && { slot: { connect: { id: slotId } } }) // solo si cambias slot
            }
        });

        res.json(sanitizeResponse(updatedBooking));
    } catch (err: any) {
        secureLogger.error("Error actualizando reserva de cumpleaños", { bookingId });
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2002') {
            return res.status(400).json({ error: "Conflicto con otra reserva." });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});
// UPDATE BirthdayBooking Status
router.put("/updateBirthdayBookingStatus/:id", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const bookingId = Number(id);

    // ✅ Validar que el ID sea válido
    if (isNaN(bookingId) || bookingId <= 0) {
        return res.status(400).json({ error: "ID de reserva inválido." });
    }

    const { status, slotId } = req.body;

    // ✅ Validar estado si se proporciona
    if (status && !['PENDING', 'CONFIRMED', 'CANCELLED'].includes(status)) {
        return res.status(400).json({ error: "Estado inválido." });
    }

    try {
        // Verificar que la reserva existe
        const existingBooking = await prisma.birthdayBooking.findUnique({
            where: { id: bookingId },
            include: {
                slot: true
            }
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        const previousStatus = existingBooking.status;

        // Validar slot si se quiere cambiar
        if (slotId) {
            if (isNaN(Number(slotId)) || Number(slotId) <= 0) {
                return res.status(400).json({ error: "ID de slot inválido." });
            }

            const slot = await prisma.birthdaySlot.findUnique({
                where: { id: Number(slotId) },
                include: { booking: true }
            });
            if (!slot) return res.status(404).json({ error: "Slot no encontrado" });
            if (slot.booking && slot.booking.id !== bookingId) {
                return res.status(400).json({ error: "Este slot ya está reservado" });
            }
            if (slot.status !== "OPEN") return res.status(400).json({ error: "Este slot no está disponible" });
        }

        const updatedBooking = await prisma.birthdayBooking.update({
            where: { id: bookingId },
            data: {
                status,
                ...(slotId && { slot: { connect: { id: slotId } } }) // solo si cambias slot
            },
            include: {
                slot: true
            }
        });

        // Enviar email según el cambio de estado
        if (existingBooking.guestEmail && status && status !== previousStatus) {
            try {
                if (status === 'CONFIRMED') {
                    const emailData = getBirthdayBookingConfirmedEmail(existingBooking.guest, {
                        id: updatedBooking.id,
                        date: updatedBooking.slot.date,
                        startTime: updatedBooking.slot.startTime,
                        endTime: updatedBooking.slot.endTime,
                        packageType: updatedBooking.packageType,
                        number_of_kids: updatedBooking.number_of_kids,
                        contact_number: updatedBooking.contact_number
                    });
                    
                    await sendTemplatedEmail(
                        existingBooking.guestEmail,
                        "¡Tu reserva de cumpleaños ha sido confirmada! 🎉",
                        emailData
                    );
                    secureLogger.info("Email de confirmación enviado", { guestEmail: existingBooking.guestEmail });
                } else if (status === 'CANCELLED') {
                    const emailData = getBirthdayBookingCancelledEmail(existingBooking.guest, {
                        id: updatedBooking.id,
                        date: updatedBooking.slot.date,
                        startTime: updatedBooking.slot.startTime,
                        endTime: updatedBooking.slot.endTime
                    });
                    
                    await sendTemplatedEmail(
                        existingBooking.guestEmail,
                        "Reserva de cumpleaños cancelada - Somriures & Colors",
                        emailData
                    );
                    secureLogger.info("Email de cancelación enviado", { guestEmail: existingBooking.guestEmail });
                }
            } catch (emailError) {
                secureLogger.error("Error enviando email de cambio de estado", { guestEmail: existingBooking.guestEmail });
                // No fallar la actualización si falla el email
            }
        }

        res.json(sanitizeResponse(updatedBooking));
    } catch (err: any) {
        secureLogger.error("Error actualizando estado de reserva", { bookingId });
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

// DELETE BirthdayBooking
router.delete("/deleteBirthdayBooking/:id", authenticateUser, async (req: any, res: any) => {
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
        // ✅ Verificar que la reserva existe antes de eliminar
        const existingBooking = await prisma.birthdayBooking.findUnique({
            where: { id: bookingId },
            include: { slot: true }
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        // ✅ Usar transacción para actualizar el slot si es necesario
        await prisma.$transaction(async (tx) => {
            // Eliminar la reserva
            await tx.birthdayBooking.delete({
                where: { id: bookingId }
            });

            // Liberar el slot (volver a OPEN si estaba CLOSED)
            if (existingBooking.slot && existingBooking.slot.status === 'CLOSED') {
                await tx.birthdaySlot.update({
                    where: { id: existingBooking.slot.id },
                    data: { status: 'OPEN' }
                });
            }
        });

        res.json({ message: "Reserva eliminada correctamente" });
    } catch (err: any) {
        secureLogger.error("Error eliminando reserva de cumpleaños", { bookingId });
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        res.status(500).json({ error: "Error interno del servidor." });
    }
});

//LISTAR RESERVAS BIRTHDAY
router.get("/getBirthdayBookings", authenticateUser, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const birthdayBookings = await prisma.birthdayBooking.findMany({
            include: { slot: true }
        });
        res.json(sanitizeResponse(birthdayBookings));
    } catch (err) {
        secureLogger.error("Error obteniendo reservas de cumpleaños");
        res.status(500).json({ error: "Error interno del servidor" });
    }
});



router.get('/my', authenticateUser, async (req: any, res) => {
    try {
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const bookings = await prisma.daycareBooking.findMany({
            where: { userId: user_id },
        });
        res.json(sanitizeResponse(bookings));
    } catch (err) {
        secureLogger.error("Error obteniendo reservas del usuario", { userId: req.user.id });
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});


export default router;
