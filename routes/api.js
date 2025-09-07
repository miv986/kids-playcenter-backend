import express from "express";
import { supabase } from "../config/supabase.js";

const router = express.Router();
//
// USERS
//
router.post("/users", async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        error: "Email and name are required",
      });
    }

    const { data, error } = await supabase
      .from("users")
      .insert([{ email, name }])
      .select();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ data });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});


export default router;
