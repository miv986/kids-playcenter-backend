import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateUser } from "../middleware/auth";
import { validateDTO } from "../middleware/validation";
import { CreateDaycareBookingDTO } from "../dtos/CreateDaycareBookingDTO";
import { UpdateDaycareBookingDTO } from "../dtos/UpdateDaycareBookingDTO";


const prisma = new PrismaClient();
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
        const spotsToDiscount = childrenIds.length;

        // 🔍 Determinar qué slots abarca
        const start = new Date(startTime);
        const end = new Date(endTime);
        const date = new Date(start);
        date.setHours(0, 0, 0, 0);

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
                include: { children: true },
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

        return res.status(201).json({
            message: "✅ Reserva creada correctamente.",
            booking: booking,
        });
    } catch (err) {
        console.error("Error al crear reserva:", err);
        return res.status(500).json({ error: "Internal server error." });
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

        console.log("📋 Bookings en backend:", JSON.stringify(bookings, null, 2));

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

        const { comments, startTime, endTime, childrenIds } = req.body;
        const userId = req.user.id;

        // 🔢 Determinar nuevos slots que abarca la nueva franja
        const start = new Date(startTime);
        const end = new Date(endTime);
        const date = new Date(start);
        date.setHours(0, 0, 0, 0);

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
    } catch (err) {
        console.error("Error al modificar reserva:", err);
        return res.status(500).json({ error: "Internal server error." });
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
        
        const existingBooking = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { slots: true, children: true }
        });
        
        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }
        
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
        
        return res.json({ message: "✅ Reserva cancelada correctamente" });
    } catch (err) {
        console.error("Error al cancelar reserva:", err);
        return res.status(500).json({ error: "Internal server error" });
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
    } catch (err) {
        console.error("Error al eliminar reserva:", err);
        res.status(500).json({ error: "Internal server error" });
    } 
});



export default router;