import { PrismaClient } from "@prisma/client";
import express from "express";
const prisma = new PrismaClient();

const router = express.Router();
//
// USERS
//
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({})
    res.status(201).json(users);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});


export default router;
