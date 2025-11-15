import express from "express";
import { authenticateUser, optionalAuthenticate } from "../middleware/auth";
import { validateDTO } from "../middleware/validation";
import { CreateBirthdayBookingDTO } from "../dtos/CreateBirthdayBookingDTO";
import { sendTemplatedEmail } from "../service/mailing";
import { getBirthdayBookingCreatedEmail, getBirthdayBookingConfirmedEmail, getBirthdayBookingCancelledEmail } from "../service/emailTemplates";
import prisma from "../utils/prisma";
const router = express.Router();

//
// BOOKINGS CUMPLEAÑOS
//

//CREAR RESERVA CUMPLEAÑOS
router.post("/createBirthdayBooking", optionalAuthenticate, validateDTO(CreateBirthdayBookingDTO), async (req: any, res: any) => {
    const { guest, guestEmail, number_of_kids, contact_number, comments, slotId, packageType } = req.body;

    // ✅ Si el usuario está logueado, usar su email; si no, requerir email en el body
    let finalGuestEmail = guestEmail;
    if (req.user && req.user.email) {
        finalGuestEmail = req.user.email;
    } else if (!guestEmail || guestEmail.trim() === '') {
        return res.status(400).json({ error: "Debes proporcionar un email o estar logueado." });
    }

    // ✅ Validaciones básicas antes de la transacción
    if (!slotId || isNaN(Number(slotId))) {
        return res.status(400).json({ error: "ID de slot inválido." });
    }

    if (!number_of_kids || number_of_kids <= 0) {
        return res.status(400).json({ error: "El número de niños debe ser mayor a 0." });
    }

    if (!guest || guest.trim() === '') {
        return res.status(400).json({ error: "Debes proporcionar el nombre del invitado." });
    }

    if (!contact_number || contact_number.trim() === '') {
        return res.status(400).json({ error: "Debes proporcionar un número de contacto." });
    }

    // ✅ Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(finalGuestEmail.trim())) {
        return res.status(400).json({ error: "El formato del email no es válido." });
    }

    try {
        // ✅ Usar transacción para prevenir race conditions - verificar y crear atómicamente
        const addedBooking = await prisma.$transaction(async (tx) => {
            // Verificar slot dentro de la transacción para evitar race conditions
            const slot = await tx.birthdaySlot.findUnique({
                where: { id: Number(slotId) },
                include: { booking: true }
            });

            if (!slot) {
                throw new Error("Slot no encontrado");
            }

            // Verificar si hay una reserva activa (no cancelada) en este slot
            if (slot.booking && slot.booking.status !== 'CANCELLED') {
                throw new Error("Este slot ya está reservado");
            }

            if (slot.status !== "OPEN") {
                throw new Error("Este slot no está disponible");
            }

            // ✅ Validar que la fecha del slot no sea pasada (usando helpers estandarizados)
            const { getStartOfDay, isToday, isPastDateTime } = await import("../utils/dateHelpers");
            const slotDate = new Date(slot.startTime);
            const slotDateOnly = getStartOfDay(slotDate);
            const nowDateOnly = getStartOfDay();

            if (slotDateOnly < nowDateOnly) {
                throw new Error("No se pueden reservar slots con fechas pasadas.");
            }

            // Si es hoy, validar que la hora no sea pasada
            if (isToday(slotDate) && isPastDateTime(slot.startTime)) {
                throw new Error("No se pueden reservar slots con horarios pasados.");
            }

            // Crear la reserva
            const booking = await tx.birthdayBooking.create({
                data: {
                    guest: guest.trim(),
                    guestEmail: finalGuestEmail.trim(),
                    number_of_kids: number_of_kids,
                    contact_number: contact_number.trim(),
                    comments: comments?.trim(),
                    packageType: packageType || 'ALEGRIA',
                    slot: { connect: { id: Number(slotId) } }
                } as any,
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
        if (finalGuestEmail) {
            try {
                const emailData = getBirthdayBookingCreatedEmail(guest, {
                    id: addedBooking.id,
                    date: addedBooking.slot.date,
                    startTime: addedBooking.slot.startTime,
                    endTime: addedBooking.slot.endTime,
                    number_of_kids: number_of_kids,
                    contact_number: contact_number
                });

                await sendTemplatedEmail(
                    finalGuestEmail,
                    "Reserva de cumpleaños recibida - Somriures & Colors",
                    emailData
                );
                console.log(`✅ Email de confirmación de reserva enviado a ${finalGuestEmail}`);
            } catch (emailError) {
                console.error("Error enviando email de confirmación:", emailError);
                // No fallar la creación si falla el email
            }
        }

        res.status(201).json(addedBooking);
    } catch (err: any) {
        console.error("Error creando reserva de cumpleaños:", err);
        // Manejar errores específicos de Prisma y errores de validación
        if (err.message) {
            if (err.message.includes("Slot no encontrado") || err.message.includes("ya está reservado") || 
                err.message.includes("no está disponible") || err.message.includes("fechas pasadas") ||
                err.message.includes("horarios pasados")) {
                return res.status(400).json({ error: err.message });
            }
        }
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

        res.json(booking);
    } catch (err) {
        console.error("Error en GET /bookings/:id:", err);
        res.status(500).json({ error: "Internal server error" });
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

    // Crear rango en hora local (estandarizado)
    const { getDateRange } = await import("../utils/dateHelpers");
    const { start: startOfDay, end: endOfDay } = getDateRange(date);

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

        res.json(bookings);
    } catch (err) {
        console.error("Error en GET /bookings/by-date/:date:", err);
        res.status(500).json({ error: "Internal server error" });
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

    const { guest, number_of_kids, phone, comments, status, slotId } = req.body;

    // ✅ Validaciones de datos
    if (number_of_kids !== undefined && (isNaN(Number(number_of_kids)) || number_of_kids <= 0)) {
        return res.status(400).json({ error: "El número de niños debe ser mayor a 0." });
    }

    try {
        // Verificar que la reserva existe y obtener el slot actual
        const existingBooking = await prisma.birthdayBooking.findUnique({
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

            const slot = await prisma.birthdaySlot.findUnique({
                where: { id: Number(slotId) },
                include: { booking: true }
            });
            if (!slot) return res.status(404).json({ error: "Slot no encontrado" });
            
            // Permitir slots con reservas canceladas o sin reserva
            if (slot.booking && slot.booking.id !== bookingId && slot.booking.status !== 'CANCELLED') {
                return res.status(400).json({ error: "Este slot ya está reservado" });
            }
            
            // Permitir slots OPEN o slots que ya pertenecen a esta reserva
            if (slot.status !== "OPEN" && slot.id !== previousSlotId) {
                // Si el slot tiene una reserva cancelada, permitir reutilizarlo
                if (!slot.booking || slot.booking.status !== 'CANCELLED') {
                    return res.status(400).json({ error: "Este slot no está disponible" });
                }
            }
        }

        // Usar transacción para asegurar atomicidad
        const updatedBooking = await prisma.$transaction(async (tx) => {
            // Si la reserva se cancela, liberar el slot y desconectarlo
            if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && previousSlotId) {
                // Liberar el slot (volver a OPEN)
                await tx.birthdaySlot.update({
                    where: { id: previousSlotId },
                    data: { status: 'OPEN' }
                });
            }

            // Si se cambió el slot (y no se está cancelando), liberar el anterior y cerrar el nuevo
            if (slotId && previousSlotId && Number(slotId) !== previousSlotId && status !== 'CANCELLED') {
                // Liberar el slot anterior (volver a OPEN)
                await tx.birthdaySlot.update({
                    where: { id: previousSlotId },
                    data: { status: 'OPEN' }
                });

                // Cerrar el nuevo slot
                await tx.birthdaySlot.update({
                    where: { id: Number(slotId) },
                    data: { status: 'CLOSED' }
                });
            }

            // Actualizar la reserva
            const updateData: any = {
                guest,
                number_of_kids,
                contact_number: phone,
                comments,
                status,
            };

            // Si se cancela, desconectar el slot
            if (status === 'CANCELLED' && previousSlotId) {
                updateData.slot = { disconnect: true };
            } 
            // Si se cambia el slot y no se cancela, conectar el nuevo
            else if (slotId && status !== 'CANCELLED') {
                updateData.slot = { connect: { id: Number(slotId) } };
            }

            const booking = await tx.birthdayBooking.update({
                where: { id: bookingId },
                data: updateData,
                include: {
                    slot: true
                }
            });

            return booking;
        });

        res.json(updatedBooking);
    } catch (err: any) {
        console.error("Error actualizando reserva de cumpleaños:", err);
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
        const previousSlotId = existingBooking.slotId;

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
            
            // Permitir slots con reservas canceladas o sin reserva
            if (slot.booking && slot.booking.id !== bookingId && slot.booking.status !== 'CANCELLED') {
                return res.status(400).json({ error: "Este slot ya está reservado" });
            }
            
            // Permitir slots OPEN o slots con reservas canceladas
            if (slot.status !== "OPEN" && (!slot.booking || slot.booking.status !== 'CANCELLED')) {
                return res.status(400).json({ error: "Este slot no está disponible" });
            }
        }

        const updatedBooking = await prisma.$transaction(async (tx) => {
            // Si la reserva se cancela, liberar el slot y desconectarlo
            if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && previousSlotId) {
                // Liberar el slot (volver a OPEN)
                await tx.birthdaySlot.update({
                    where: { id: previousSlotId },
                    data: { status: 'OPEN' }
                });
            }

            // Si se cambió el slot (y no se está cancelando), liberar el anterior y cerrar el nuevo
            if (slotId && previousSlotId && Number(slotId) !== previousSlotId && status !== 'CANCELLED') {
                await tx.birthdaySlot.update({
                    where: { id: previousSlotId },
                    data: { status: 'OPEN' }
                });

                await tx.birthdaySlot.update({
                    where: { id: Number(slotId) },
                    data: { status: 'CLOSED' }
                });
            }

            // Preparar datos de actualización
            const updateData: any = {
                status,
            };

            // Si se cancela, desconectar el slot
            if (status === 'CANCELLED' && previousSlotId) {
                updateData.slot = { disconnect: true };
            } 
            // Si se cambia el slot y no se cancela, conectar el nuevo
            else if (slotId && status !== 'CANCELLED') {
                updateData.slot = { connect: { id: Number(slotId) } };
            }

            const booking = await tx.birthdayBooking.update({
                where: { id: bookingId },
                data: updateData,
                include: {
                    slot: true
                }
            });

            return booking;
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
                        number_of_kids: updatedBooking.number_of_kids,
                        contact_number: updatedBooking.contact_number
                    });

                    await sendTemplatedEmail(
                        existingBooking.guestEmail,
                        "¡Tu reserva de cumpleaños ha sido confirmada!",
                        emailData
                    );
                    console.log(`✅ Email de confirmación enviado a ${existingBooking.guestEmail}`);
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
                    console.log(`✅ Email de cancelación enviado a ${existingBooking.guestEmail}`);
                }
            } catch (emailError) {
                console.error("Error enviando email de cambio de estado:", emailError);
                // No fallar la actualización si falla el email
            }
        }

        res.json(updatedBooking);
    } catch (err: any) {
        console.error("Error actualizando estado de reserva:", err);
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

        // ✅ Usar transacción para liberar el slot antes de eliminar
        await prisma.$transaction(async (tx) => {
            // Primero liberar y desconectar el slot si existe
            if (existingBooking.slot) {
                // Liberar el slot (volver a OPEN)
                await tx.birthdaySlot.update({
                    where: { id: existingBooking.slot.id },
                    data: { status: 'OPEN' }
                });

                // Desconectar el slot de la reserva antes de eliminar
                await tx.birthdayBooking.update({
                    where: { id: bookingId },
                    data: {
                        slot: { disconnect: true }
                    }
                });
            }

            // Luego eliminar la reserva
            await tx.birthdayBooking.delete({
                where: { id: bookingId }
            });
        });

        res.json({ message: "Reserva eliminada correctamente" });
    } catch (err: any) {
        console.error("Error eliminando reserva de cumpleaños:", err);
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
        res.json(birthdayBookings);
    } catch (err) {
        console.error("Error en GET /bookings:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});



router.get('/my', authenticateUser, async (req: any, res) => {
    try {
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const bookings = await prisma.daycareBooking.findMany({
            where: { userId: user_id },
        });
        res.json(bookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


export default router;
