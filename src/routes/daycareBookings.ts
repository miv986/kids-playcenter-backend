import express from "express";
import { authenticateUser } from "../middleware/auth";
import { validateDTO } from "../middleware/validation";
import { CreateDaycareBookingDTO } from "../dtos/CreateDaycareBookingDTO";
import { UpdateDaycareBookingDTO } from "../dtos/UpdateDaycareBookingDTO";
import { sendTemplatedEmail } from "../service/mailing";
import { getDaycareBookingConfirmedEmail, getDaycareBookingStatusChangedEmail } from "../service/emailTemplates";
import prisma from "../utils/prisma";

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

        // ✅ Validar que la fecha no sea pasada (solo para usuarios, admin puede reservar fechas pasadas)
        const { getStartOfDay, isToday, isPastDateTime } = await import("../utils/dateHelpers");
        const date = getStartOfDay(start);
        
        if (req.user.role !== 'ADMIN') {
            const now = getStartOfDay();
            
            if (date < now) {
                return res.status(400).json({ error: "No se pueden reservar slots con fechas pasadas." });
            }
            // Validar también que la hora de inicio no sea pasada si es hoy
            if (isToday(start) && isPastDateTime(start)) {
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

        const startHour = start.getHours();
        const endHour = end.getHours();

        // Buscar slots de ese día dentro del rango horario
        const slots = await prisma.daycareSlot.findMany({
            where: {
                date,
                hour: { gte: startHour, lt: endHour }, // Ej: 17 <= h < 19
                availableSpots: { gte: spotsToDiscount }, // Cada slot debe tener plazas suficientes para todos los niños
            },
        });

        if (slots.length !== endHour - startHour) {
            return res
                .status(400)
                .json({ error: `No hay ${spotsToDiscount} plazas suficientes en los slots para ${spotsToDiscount} niño(s).` });
        }

        // Verificar si el usuario ya tiene una reserva en alguno de estos slots
        const slotIds = slots.map(s => s.id);
        const existingBooking = await prisma.daycareBooking.findFirst({
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
            include: {
                slots: true
            }
        });

        if (existingBooking) {
            return res.status(400).json({
                error: "Ya tienes una reserva activa para ese día/horario. Por favor, modifica o cancela tu reserva existente."
            });
        }

        const booking = await prisma.$transaction(async (tx) => {
            // Crear la reserva
            const newBooking = await tx.daycareBooking.create({
                data: {
                    comments,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    userId: user_id,
                    status: "CONFIRMED",
                    slots: {
                        connect: slots.map((s) => ({ id: s.id })) //vincula slots
                    },
                    children: {
                        connect: childrenIds.map((id: number) => ({ id })) //vincula hijos
                    },
                },
                include: { 
                    children: true,
                    user: true
                },
            });

            // Descontar plazas de cada slot por cada niño
            for (const s of slots) {
                await tx.daycareSlot.update({
                    where: { id: s.id },
                    data: { availableSpots: { decrement: spotsToDiscount } },
                });
            }
            return newBooking;
        });

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

        return res.status(201).json({
            message: "✅ Reserva creada correctamente.",
            booking: booking,
        });
    } catch (err: any) {
        console.error("Error al crear reserva:", err);
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
        return res.status(500).json({ error: "Error interno del servidor." });
    } 
}
);

// LISTAR RESERVAS DAYCARE (admin ve todo, user ve solo las suyas)
router.get("/", authenticateUser, async (req: any, res) => {
    try {
        const where =
            req.user.role === "ADMIN"
                ? {} // admin ve todas
                : { userId: req.user.id }; // user solo las suyas

        const bookings = await prisma.daycareBooking.findMany({
            where,
            include: { user: { include: { children: true } }, slots: true, children: true },
            orderBy: { startTime: "asc" },
        });

        res.json(bookings);
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

        const { comments, startTime, endTime, childrenIds } = req.body;
        const userId = req.user.id;

        // ✅ Validaciones básicas
        if (!childrenIds || !Array.isArray(childrenIds) || childrenIds.length === 0) {
            return res.status(400).json({ error: "Debes seleccionar al menos un niño para la reserva." });
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

        // ✅ Validar que la fecha no sea pasada (solo para usuarios, admin puede modificar a fechas pasadas)
        const { getStartOfDay, isToday, isPastDateTime } = await import("../utils/dateHelpers");
        const date = getStartOfDay(start);

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

        const startHour = start.getHours();
        const endHour = end.getHours();

        const newSlots = await prisma.daycareSlot.findMany({
            where: {
                date,
                hour: { gte: startHour, lt: endHour },
                availableSpots: { gte: childrenIds.length }, // Cada slot debe tener plazas suficientes para todos los niños
            },
        });

        if (newSlots.length !== endHour - startHour) {
            return res
                .status(400)
                .json({ error: `No hay ${childrenIds.length} plazas suficientes en los slots para ${childrenIds.length} niño(s).` });
        }

        // 🧩 Transacción segura para revertir si algo falla
        const updatedBooking = await prisma.$transaction(async (tx) => {
            // 🟢 Devolver plazas de slots antiguos
            const oldChildrenCount = existingBooking.children.length;
            for (const oldSlot of existingBooking.slots) {
                await tx.daycareSlot.update({
                    where: { id: oldSlot.id },
                    data: { availableSpots: { increment: oldChildrenCount } },
                });
            }

            // 🔴 Restar plazas de los nuevos slots
            const newChildrenCount = childrenIds.length;
            for (const newSlot of newSlots) {
                await tx.daycareSlot.update({
                    where: { id: newSlot.id },
                    data: { availableSpots: { decrement: newChildrenCount } },
                });
            }

            // 🔁 Actualizar la reserva
            const booking = await tx.daycareBooking.update({
                where: { id: bookingId },
                data: {
                    comments,
                    startTime: new Date(startTime),
                    endTime: new Date(endTime),
                    userId,
                    slots: {
                        set: [], // desconecta todos los antiguos
                        connect: newSlots.map((s) => ({ id: s.id })), // conecta los nuevos
                    },
                    children: {
                        set: [], // desconecta todos los antiguos
                        connect: childrenIds.map((id: number) => ({ id })), // conecta los nuevos
                    },
                },
                include: { user: { include: { children: true } }, slots: true, children: true },
            });

            return booking;
        });

        return res.json({
            message: "✅ Reserva modificada correctamente.",
            booking: updatedBooking,
        });
    } catch (err: any) {
        console.error("Error al modificar reserva:", err);
        // Manejar errores específicos de Prisma
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva o recursos relacionados no encontrados." });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ error: "Referencia inválida. Verifica los IDs proporcionados." });
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
            await prisma.$transaction(async (tx) => {
                await tx.daycareBooking.update({
                    where: { id: bookingId },
                    data: { status: 'CANCELLED' }
                });
                
                // Liberar plazas de los slots
                for (const slot of existingBooking.slots) {
                    await tx.daycareSlot.update({
                        where: { id: slot.id },
                        data: { availableSpots: { increment: existingBooking.children.length } }
                    });
                }
            });
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
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
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

        // Solo se puede marcar asistencia si la reserva está confirmada y no cancelada
        if (booking.status === 'CANCELLED') {
            return res.status(400).json({ error: "No se puede marcar asistencia de una reserva cancelada." });
        }

        const updatedBooking = await prisma.daycareBooking.update({
            where: { id: bookingId },
            data: { attendanceStatus },
            include: { user: { include: { children: true } }, slots: true, children: true },
        });

        return res.json({
            message: `✅ Asistencia marcada como ${attendanceStatus === 'ATTENDED' ? 'asistió' : attendanceStatus === 'NOT_ATTENDED' ? 'no asistió' : 'pendiente'}.`,
            booking: updatedBooking,
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

        // 🧩 Ejecutar todo en una transacción
        await prisma.$transaction(async (tx) => {
            // 1️⃣ Liberar plazas de todos los slots asociados
            const childrenCount = booking.children.length;
            for (const slot of booking.slots) {
                await tx.daycareSlot.update({
                    where: { id: slot.id },
                    data: { availableSpots: { increment: childrenCount } },
                });
            }

            // 2️⃣ Eliminar la reserva
            await tx.daycareBooking.delete({
                where: { id: bookingId },
            });
        });

        res.json({ message: "✅ Reserva eliminada correctamente y plazas liberadas." });
    } catch (err: any) {
        console.error("Error al eliminar reserva:", err);
        if (err.code === 'P2025') {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        if (err.code === 'P2003') {
            return res.status(400).json({ error: "No se puede eliminar la reserva debido a referencias existentes." });
        }
        res.status(500).json({ error: "Error interno del servidor." });
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