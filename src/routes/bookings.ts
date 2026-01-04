import express from "express";
import { authenticateUser, optionalAuthenticate } from "../middleware/auth";
import { validateDTO } from "../middleware/validation";
import { CreateBirthdayBookingDTO } from "../dtos/CreateBirthdayBookingDTO";
import { sendTemplatedEmail } from "../service/mailing";
import { getBirthdayBookingCreatedEmail, getBirthdayBookingConfirmedEmail, getBirthdayBookingCancelledEmail, getBirthdayBookingCancelledEmailWithoutSlot, getBirthdayBookingCancelledEmailMinimal, getBirthdayBookingModifiedEmail } from "../service/emailTemplates";
import prisma from "../utils/prisma";
import { executeWithRetry } from "../utils/transactionRetry";
import { getDateRange, getEndOfDay, parseDateString } from "../utils/dateHelpers";
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
        const addedBooking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
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
        }, {
            isolationLevel: 'Serializable', // Máxima protección contra race conditions
            timeout: 10000 // 10 segundos timeout
        }));

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
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La reserva no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
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
        // Buscar reservas que tengan slot en esa fecha O que no tengan slot (reservas canceladas)
        // Para las canceladas sin slot, usamos la fecha de creación como referencia aproximada
        const bookings = await prisma.birthdayBooking.findMany({
            where: {
                OR: [
                    // Reservas con slot en la fecha especificada
                    {
                        slot: {
                            startTime: { gte: startOfDay, lte: endOfDay }
                        }
                    },
                    // Reservas sin slot (canceladas) creadas en esa fecha (para mantenerlas visibles)
                    {
                        AND: [
                            { slotId: null },
                            {
                                createdAt: {
                                    gte: startOfDay,
                                    lte: endOfDay
                                }
                            }
                        ]
                    }
                ]
            },
            include: { slot: true },
            orderBy: { createdAt: 'desc' }
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
        const updatedBooking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
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

            // Si se cancela, guardar la fecha original del slot y desconectar el slot
            if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && existingBooking.slot) {
                updateData.slotId = null;
                // Guardar la fecha original del slot para histórico
                updateData.originalSlotDate = existingBooking.slot.date;
                updateData.originalSlotStartTime = existingBooking.slot.startTime;
                updateData.originalSlotEndTime = existingBooking.slot.endTime;
            } else if (status === 'CANCELLED' && previousSlotId) {
                updateData.slotId = null;
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
        }, {
            isolationLevel: 'Serializable', // Máxima protección contra race conditions
            timeout: 10000 // 10 segundos timeout
        }));

        // Enviar email de modificación si se modificó algo y no se canceló
        if (status !== 'CANCELLED' && previousStatus !== 'CANCELLED' && existingBooking.guestEmail) {
            // Verificar si realmente hubo cambios (excepto status que no cambió a CANCELLED)
            const hasChanges = guest !== undefined || number_of_kids !== undefined || 
                              phone !== undefined || comments !== undefined || 
                              (slotId && Number(slotId) !== previousSlotId);
            
            if (hasChanges) {
                try {
                    const slot = updatedBooking.slot || existingBooking.slot;
                    if (slot) {
                        const emailData = getBirthdayBookingModifiedEmail(existingBooking.guest, {
                            id: updatedBooking.id,
                            date: slot.date,
                            startTime: slot.startTime,
                            endTime: slot.endTime,
                            packageType: updatedBooking.packageType,
                            number_of_kids: updatedBooking.number_of_kids,
                            contact_number: updatedBooking.contact_number,
                            status: updatedBooking.status
                        });

                        await sendTemplatedEmail(
                            existingBooking.guestEmail,
                            "Reserva de cumpleaños modificada - Somriures & Colors",
                            emailData
                        );
                        console.log(`✅ Email de modificación enviado a ${existingBooking.guestEmail}`);
                    }
                } catch (emailError) {
                    console.error("Error enviando email de modificación:", emailError);
                    // No fallar la actualización si falla el email
                }
            }
        }

        res.json(updatedBooking);
    } catch (err: any) {
        console.error("Error actualizando reserva de cumpleaños:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2002') {
            return res.status(400).json({ error: "Conflicto con otra reserva." });
        }
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La modificación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
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

        // Validar que la reserva tenga slot asociado (excepto si se está cancelando)
        if (!existingBooking.slot && status !== 'CANCELLED') {
            return res.status(400).json({ 
                error: "Esta reserva no tiene slot asociado. Solo se puede cancelar." 
            });
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
            
            // Permitir slots con reservas canceladas o sin reserva
            if (slot.booking && slot.booking.id !== bookingId && slot.booking.status !== 'CANCELLED') {
                return res.status(400).json({ error: "Este slot ya está reservado" });
            }
            
            // Permitir slots OPEN o slots con reservas canceladas
            if (slot.status !== "OPEN" && (!slot.booking || slot.booking.status !== 'CANCELLED')) {
                return res.status(400).json({ error: "Este slot no está disponible" });
            }
        }

        // Guardar información del slot y reserva antes de cancelar (para el email)
        let slotInfoForEmail: { date: Date; startTime: Date; endTime: Date; name: string, number_of_kids: number, contact_number: string } | null = null;
        if (status === 'CANCELLED' && previousStatus !== 'CANCELLED') {
            if (existingBooking.slot) {
                // Si hay slot, guardar toda la información del slot
                slotInfoForEmail = {
                    date: existingBooking.slot.date,
                    startTime: existingBooking.slot.startTime,
                    endTime: existingBooking.slot.endTime,
                    name: existingBooking.guest,
                    number_of_kids: existingBooking.number_of_kids,
                    contact_number: existingBooking.contact_number
                };
            } else {
                // Si no hay slot, usar fecha de creación como referencia
                slotInfoForEmail = {
                    date: new Date(existingBooking.createdAt || new Date()),
                    startTime: new Date(existingBooking.createdAt || new Date()),
                    endTime: new Date(existingBooking.createdAt || new Date()),
                    name: existingBooking.guest,
                    number_of_kids: existingBooking.number_of_kids,
                    contact_number: existingBooking.contact_number
                };
            }
        }

        const updatedBooking = await executeWithRetry(() => prisma.$transaction(async (tx) => {
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

            // Si se cancela, guardar la fecha original del slot y desconectar el slot
            if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && existingBooking.slot) {
                updateData.slotId = null;
                // Guardar la fecha original del slot para histórico
                updateData.originalSlotDate = existingBooking.slot.date;
                updateData.originalSlotStartTime = existingBooking.slot.startTime;
                updateData.originalSlotEndTime = existingBooking.slot.endTime;
            } else if (status === 'CANCELLED' && previousSlotId) {
                updateData.slotId = null;
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
        }, {
            isolationLevel: 'Serializable', // Máxima protección contra race conditions
            timeout: 10000 // 10 segundos timeout
        }));

        // Enviar email de cancelación DESPUÉS de cancelar (usando datos guardados)
        if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && existingBooking.guestEmail) {
            try {
                let emailData;
                
                if (slotInfoForEmail) {
                    // Usar la información del slot guardada antes de cancelar (siempre tiene la fecha original)
                    if (existingBooking.slot) {
                        // Si tenía slot original, usar la función del template
                        emailData = getBirthdayBookingCancelledEmail(existingBooking.guest, {
                            id: updatedBooking.id,
                            date: slotInfoForEmail.date,
                            startTime: slotInfoForEmail.startTime,
                            endTime: slotInfoForEmail.endTime,
                            number_of_kids: existingBooking.number_of_kids
                        });
                    } else {
                        // Si no tenía slot, usar la función del template sin slot
                        emailData = getBirthdayBookingCancelledEmailWithoutSlot(
                            existingBooking.guest,
                            updatedBooking.id,
                            slotInfoForEmail
                        );
                    }
                } else {
                    // Email básico de cancelación sin información (caso extremo)
                    emailData = getBirthdayBookingCancelledEmailMinimal(
                        existingBooking.guest,
                        updatedBooking.id
                    );
                }

                await sendTemplatedEmail(
                    existingBooking.guestEmail,
                    "Reserva de cumpleaños cancelada - Somriures & Colors",
                    emailData
                );
                console.log(`✅ Email de cancelación enviado a ${existingBooking.guestEmail}`);
            } catch (emailError) {
                console.error("Error enviando email de cancelación:", emailError);
                // No fallar la actualización si falla el email
            }
        }

        // Enviar email de confirmación
        if (status === 'CONFIRMED' && previousStatus !== 'CONFIRMED' && existingBooking.guestEmail) {
            try {
                // Usar existingBooking.slot si updatedBooking.slot es null (por seguridad)
                const slot = updatedBooking.slot || existingBooking.slot;
                if (!slot) {
                    console.error(`⚠️ No se puede enviar email de confirmación: reserva ${updatedBooking.id} no tiene slot asociado`);
                } else {
                    const emailData = getBirthdayBookingConfirmedEmail(existingBooking.guest, {
                        id: updatedBooking.id,
                        date: slot.date,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        number_of_kids: updatedBooking.number_of_kids,
                        contact_number: updatedBooking.contact_number
                    });

                    await sendTemplatedEmail(
                        existingBooking.guestEmail,
                        "¡Tu reserva de cumpleaños ha sido confirmada!",
                        emailData
                    );
                    console.log(`✅ Email de confirmación enviado a ${existingBooking.guestEmail}`);
                }
            } catch (emailError) {
                console.error("Error enviando email de confirmación:", emailError);
                // No fallar la actualización si falla el email
            }
        }

        // Enviar email de modificación si se cambió el slot pero no se canceló ni confirmó
        if (status !== 'CANCELLED' && previousStatus !== 'CANCELLED' && 
            status !== 'CONFIRMED' && previousStatus !== 'CONFIRMED' &&
            slotId && Number(slotId) !== previousSlotId && existingBooking.guestEmail) {
            try {
                const slot = updatedBooking.slot || existingBooking.slot;
                if (slot) {
                    const emailData = getBirthdayBookingModifiedEmail(existingBooking.guest, {
                        id: updatedBooking.id,
                        date: slot.date,
                        startTime: slot.startTime,
                        endTime: slot.endTime,
                        packageType: updatedBooking.packageType,
                        number_of_kids: updatedBooking.number_of_kids,
                        contact_number: updatedBooking.contact_number,
                        status: updatedBooking.status
                    });

                    await sendTemplatedEmail(
                        existingBooking.guestEmail,
                        "Reserva de cumpleaños modificada - Somriures & Colors",
                        emailData
                    );
                    console.log(`✅ Email de modificación enviado a ${existingBooking.guestEmail}`);
                }
            } catch (emailError) {
                console.error("Error enviando email de modificación:", emailError);
                // No fallar la actualización si falla el email
            }
        }

        res.json(updatedBooking);
    } catch (err: any) {
        console.error("Error actualizando estado de reserva:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La actualización no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
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
        // ✅ Usar transacción para buscar, liberar el slot y eliminar
        await executeWithRetry(() => prisma.$transaction(async (tx) => {
            // Buscar la reserva dentro de la transacción para asegurar que existe
            const existingBooking = await tx.birthdayBooking.findUnique({
                where: { id: bookingId },
                include: { slot: true }
            });

            if (!existingBooking) {
                throw new Error("Reserva no encontrada");
            }

            // Liberar el slot si existe (verificar solo por slotId, no por slot)
            if (existingBooking.slotId) {
                // Liberar el slot (volver a OPEN)
                await tx.birthdaySlot.update({
                    where: { id: existingBooking.slotId },
                    data: { status: 'OPEN' }
                });
            }

            // Eliminar la reserva
            await tx.birthdayBooking.delete({
                where: { id: bookingId }
            });
        }, {
            isolationLevel: 'Serializable', // Máxima protección contra race conditions
            timeout: 10000 // 10 segundos timeout
        }));

        res.json({ message: "Reserva eliminada correctamente" });
    } catch (err: any) {
        console.error("Error eliminando reserva de cumpleaños:", err);
        if (err.message === "Reserva no encontrada" || err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2034') {
            // Transacción falló por conflicto de serialización
            return res.status(409).json({ 
                error: "La eliminación no pudo completarse debido a un conflicto. Por favor, intenta de nuevo." 
            });
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
        const { startDate, endDate } = req.query;
        
        const whereClause: any = {};
        
        // Filtrar por rango de fechas si se proporciona
        // Si no se proporciona, usar rango por defecto: 12 meses atrás y 12 meses adelante
        if (startDate && endDate) {
            const { start: startOfRange } = getDateRange(startDate as string);
            const endOfRange = getEndOfDay(parseDateString(endDate as string));
            
            // BirthdayBooking puede tener slot opcional (slotId Int?)
            whereClause.OR = [
                // Reservas con slot en el rango
                {
                    slot: {
                        startTime: {
                            gte: startOfRange,
                            lte: endOfRange,
                        }
                    }
                },
                // Reservas sin slot pero con createdAt en el rango
                {
                    AND: [
                        { slotId: null },
                        {
                            createdAt: {
                                gte: startOfRange,
                                lte: endOfRange,
                            }
                        }
                    ]
                }
            ];
        } else {
            // Rango por defecto: 12 meses atrás y 12 meses adelante
            const { getStartOfDay } = await import("../utils/dateHelpers");
            const today = getStartOfDay();
            const twelveMonthsAgo = new Date(today);
            twelveMonthsAgo.setMonth(today.getMonth() - 12);
            const twelveMonthsAhead = new Date(today);
            twelveMonthsAhead.setMonth(today.getMonth() + 12);
            
            // BirthdayBooking puede tener slot opcional (slotId Int?)
            whereClause.OR = [
                // Reservas con slot en el rango
                {
                    slot: {
                        startTime: {
                            gte: twelveMonthsAgo,
                            lte: twelveMonthsAhead,
                        }
                    }
                },
                // Reservas sin slot pero con createdAt en el rango
                {
                    AND: [
                        { slotId: null },
                        {
                            createdAt: {
                                gte: twelveMonthsAgo,
                                lte: twelveMonthsAhead,
                            }
                        }
                    ]
                }
            ];
        }
        
        const birthdayBookings = await prisma.birthdayBooking.findMany({
            where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
            include: { slot: true },
            orderBy: [
                { createdAt: "asc" }
            ]
        });
        res.json(birthdayBookings);
    } catch (err) {
        console.error("Error en GET /bookings/getBirthdayBookings:", err);
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
