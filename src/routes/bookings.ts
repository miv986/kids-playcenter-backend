import express from "express";
import { authenticateUser } from "../middleware/auth";
const router = express.Router();
import { PrismaClient } from "@prisma/client";
import { validateDTO } from "../middleware/validation";
import { CreateBookingDTO } from "../dtos/CreateBookingDTO";
const prisma = new PrismaClient();

//
// BOOKINGS
//

//CREAR RESERVA
router.post("/", authenticateUser, validateDTO(CreateBookingDTO), async (req: any, res: any) => {
    try {
        const { number_of_kids, phone, pack, comments } = req.body;
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const addedBookings = await prisma.booking.create({
            data: {
                number_of_kinds: number_of_kids,
                contact_number: phone,
                type_of_package: pack,
                comments,
                userId: user_id
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
    try {
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const userBookings = await prisma.booking.findMany({
            where: {
                userId: user_id
            }
        })
        res.json(userBookings); // devolvemos todas las reservas
    } catch (err) {
        console.error("Error en GET /bookings:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;