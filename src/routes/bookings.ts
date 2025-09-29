import express from "express";
import { authenticateUser } from "../middleware/auth";
import { PrismaClient } from "@prisma/client";
import { validateDTO } from "../middleware/validation";
import { CreateBirthdayBookingDTO } from "../dtos/CreateBirthdayBookingDTO";
const prisma = new PrismaClient();
const router = express.Router();

//
// BOOKINGS
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
    try {
        const addedBookings = await prisma.birthdayBooking.create({
            data: {
                guest: guest,
                guestEmail,
                number_of_kids: number_of_kids,
                contact_number,
                comments,
                packageType,
                slot: { connect: { id: slotId } }

            }
        })
        res.json(addedBookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// GET BirthdayBooking por ID
router.get("/getBirthdayBooking/:id", authenticateUser, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;

    try {
        const booking = await prisma.birthdayBooking.findUnique({
            where: { id: Number(id) },
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
    const [year, month, day] = date.split("-").map(Number);

    // Crear rango en UTC
    const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    console.log("🔍 Buscando entre (UTC):", startOfDay, "y", endOfDay);

    try {
        const bookings = await prisma.birthdayBooking.findMany({
            where: {
                slot: {
                    startTime: { gte: startOfDay, lte: endOfDay } // <-- usar startTime
                }
            },
            include: { slot: true }
        });

        console.log("📦 Reservas encontradas:", bookings.length);
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
    const { guest, number_of_kids, phone, pack, comments, status, slotId } = req.body;

    try {
        // Validar slot si se quiere cambiar
        if (slotId) {
            const slot = await prisma.birthdaySlot.findUnique({
                where: { id: slotId },
                include: { booking: true }
            });
            if (!slot) return res.status(404).json({ error: "Slot no encontrado" });
            if (slot.booking && slot.booking.id !== Number(id)) {
                return res.status(400).json({ error: "Este slot ya está reservado" });
            }
            if (slot.status !== "OPEN") return res.status(400).json({ error: "Este slot no está disponible" });
        }

        const updatedBooking = await prisma.birthdayBooking.update({
            where: { id: Number(id) },
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

        res.json(updatedBooking);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});
// UPDATE BirthdayBooking Status
router.put("/updateBirthdayBookingStatus/:id", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { status, slotId } = req.body;

    try {
        // Validar slot si se quiere cambiar
        if (slotId) {
            const slot = await prisma.birthdaySlot.findUnique({
                where: { id: slotId },
                include: { booking: true }
            });
            if (!slot) return res.status(404).json({ error: "Slot no encontrado" });
            if (slot.booking && slot.booking.id !== Number(id)) {
                return res.status(400).json({ error: "Este slot ya está reservado" });
            }
            if (slot.status !== "OPEN") return res.status(400).json({ error: "Este slot no está disponible" });
        }

        const updatedBooking = await prisma.birthdayBooking.update({
            where: { id: Number(id) },
            data: {
                status,
                ...(slotId && { slot: { connect: { id: slotId } } }) // solo si cambias slot
            }
        });

        res.json(updatedBooking);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// DELETE BirthdayBooking
router.delete("deleteBirthdayBooking/:id", authenticateUser, async (req: any, res: any) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { id } = req.params;

    try {
        await prisma.birthdayBooking.delete({
            where: { id: Number(id) }
        });
        res.json({ message: "Reserva eliminada correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
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
        res.json(birthdayBookings); // devolvemos todas las reservas de cumpleaños
    } catch (err) {
        console.error("Error en GET /bookings:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

//CREAR RESERVA DAYCARE
router.post("/", authenticateUser, validateDTO(CreateBirthdayBookingDTO), async (req: any, res: any) => {
    try {
        const { number_of_kids, phone, pack, comments } = req.body;
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const addedBookings = await prisma.booking.create({
            data: {
                number_of_kinds: number_of_kids,
                contact_number: phone,
                type_of_package: pack,
                comments,
                userId: user_id,
            }
        })
        res.json(addedBookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});
//LISTAR RESERVAS
router.get("/", authenticateUser, async (req: any, res) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    try {
        const userBookings = await prisma.booking.findMany({
            include: { user: true },
        });
        res.json(userBookings); // devolvemos todas las reservas
    } catch (err) {
        console.error("Error en GET /bookings:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

//MODIFICAR RESERVA DAYCARE
router.post("/", authenticateUser, validateDTO(CreateBirthdayBookingDTO), async (req: any, res: any) => {
    try {
        const { number_of_kids, phone, pack, comments, status } = req.body;
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const addedBookings = await prisma.booking.create({
            data: {
                number_of_kinds: number_of_kids,
                contact_number: phone,
                type_of_package: pack,
                comments,
                userId: user_id,
            }
        })
        res.json(addedBookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});


router.get('/my', authenticateUser, async (req: any, res) => {
    try {
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const bookings = await prisma.booking.findMany({
            where: { userId: user_id },
        });
        res.json(bookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});


export default router;
