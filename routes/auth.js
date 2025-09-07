import express from "express";
import { supabase } from "../config/supabase.js";

const router = express.Router();

// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        res.json({ user: data.user, session: data.session });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;

// POST /api/register
router.post("/register", async (req, res) => {
    try {
        const { email, password, name } = req.body;

        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name },
                emailRedirectTo: process.env.FRONTEND_URL || "http://localhost:3000",
            },
        });

        if (error) return res.status(400).json({ error: error.message });

        res.json({ user: data.user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// POST /api/logout
router.post("/logout", async (req, res) => {
    try {
        // El logout en Supabase con token se suele manejar en el cliente,
        // pero si quieres invalidar sesión aquí puedes hacerlo.
        res.json({ message: "Logout endpoint (manejado en frontend)" });
    } catch (err) {
        res.status(500).json({ error: "Internal server error" });
    }
});
