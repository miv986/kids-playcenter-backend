import express from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateUser } from "../middleware/auth";
import { validateDTO } from "../middleware/validation";
import { CreateDaycareBookingDTO } from "../dtos/CreateDaycareBookingDTO";


const prisma = new PrismaClient();
const router = express.Router();


// DAYCARE BOOKINGS

//CREAR RESERVA DAYCARE
router.post("/", authenticateUser, validateDTO(CreateDaycareBookingDTO), async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN' && req.user.role !== "USER") {
        return res.status(403).json({ error: 'Forbidden' });
    }


    try {
        const { comments, startTime, endTime, slotId } = req.body;
        const user_id = req.user.id;  // Obtener user_id del token verificado

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
                availableSpots: { gt: 0 },
            },
        });

        if (slots.length !== endHour - startHour) {
            return res
                .status(400)
                .json({ error: "No hay plazas suficientes para todo el tramo." });
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

                },
            });

            // Descontar 1 plaza de cada slot
            for (const s of slots) {
                await tx.daycareSlot.update({
                    where: { id: s.id },
                    data: { availableSpots: { decrement: 1 } },
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
            include: { user: true, slots: true },
            orderBy: { startTime: "asc" },
        });

        res.json(bookings);
    } catch (err) {
        console.error("Error al listar reservas:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});


//MODIFICAR RESERVA DAYCARE
router.put("/:id", authenticateUser, validateDTO(CreateDaycareBookingDTO), async (req: any, res: any) => {
    // ✅ Verificación de rol
    if (req.user.role !== "ADMIN" && req.user.role !== "USER") {
        return res.status(403).json({ error: "Forbidden" });
    }
    try {
        const bookingId = Number(req.params.id);

        // 🔍 Buscar la reserva
        const existingBooking = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { slots: true },
        });

        if (!existingBooking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        const { comments, startTime, endTime } = req.body;
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
                availableSpots: { gt: 0 },
            },
        });

        if (newSlots.length !== endHour - startHour) {
            return res
                .status(400)
                .json({ error: "No hay plazas suficientes para todo el nuevo tramo." });
        }

        // 🧩 Transacción segura para revertir si algo falla
        const updatedBooking = await prisma.$transaction(async (tx) => {
            // 🟢 Devolver plazas de slots antiguos
            for (const oldSlot of existingBooking.slots) {
                await tx.daycareSlot.update({
                    where: { id: oldSlot.id },
                    data: { availableSpots: { increment: 1 } },
                });
            }

            // 🔴 Restar plazas de los nuevos slots
            for (const newSlot of newSlots) {
                await tx.daycareSlot.update({
                    where: { id: newSlot.id },
                    data: { availableSpots: { decrement: 1 } },
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
                },
                include: { slots: true },
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



// ELIMINAR RESERVA DAYCARE
router.delete("/deletedDaycareBooking/:id", authenticateUser, async (req: any, res: any) => {
    try {
        // ✅ Permitir solo ADMIN o USER
        if (req.user.role !== "ADMIN" && req.user.role !== "USER") {
            return res.status(403).json({ error: "Forbidden" });
        }

        const { id } = req.params;
        const bookingId = Number(id);

        // 🔍 Buscar la reserva con sus slots
        const booking = await prisma.daycareBooking.findUnique({
            where: { id: bookingId },
            include: { slots: true },
        });

        if (!booking) {
            return res.status(404).json({ error: "Reserva no encontrada." });
        }

        // 🧩 Ejecutar todo en una transacción
        await prisma.$transaction(async (tx) => {
            // 1️⃣ Liberar plazas de todos los slots asociados
            for (const slot of booking.slots) {
                await tx.daycareSlot.update({
                    where: { id: slot.id },
                    data: { availableSpots: { increment: 1 } },
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