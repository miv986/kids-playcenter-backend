import express from "express";
import { supabase } from "../config/supabase.js";
import { authenticateUser } from "../middleware/auth.js";

const router = express.Router();

//
// BOOKINGS
//
router.post("/", authenticateUser, async (req, res) => {
    try {
        const { number_of_kids, phone, pack, comments } = req.body;
        const user_id = req.user.id;  // Obtener user_id del token verificado
        const { data, error } = await supabase
            .from("bookings")
            .insert([{ 
                user_id,
                number_of_kids, 
                phone, 
                package: pack, 
                comments 
            }])
            .select();

        if (error) return res.status(400).json({ error: error.message });

        res.json(data[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;