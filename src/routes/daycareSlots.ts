import { PrismaClient } from "@prisma/client";
import express from "express";
import { authenticateUser } from "../middleware/auth";

const prisma = new PrismaClient();
const router = express.Router();


/**
 * POST /admin/generate-daycare-slots
 * Crea automáticamente slots para las próximas 2 semanas (lunes a jueves).
 */
router.post("/generate-daycare-slots", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const DAYS_TO_GENERATE = 14;
    const { openHour, closeHour, capacity } = req.body;

    if (!openHour || !closeHour) {
      return res.status(400).json({ error: "Faltan los campos openHour o closeHour." });
    }

    const [openH, openM] = openHour.split(":").map(Number);
    const [closeH, closeM] = closeHour.split(":").map(Number);

    const today = new Date();
    const createdSlots = [];

    for (let dayOffset = 0; dayOffset < DAYS_TO_GENERATE; dayOffset++) {
      const date = new Date(today);
      date.setDate(today.getDate() + dayOffset);

      // 1 = lunes ... 4 = jueves
      const weekday = date.getDay();
      if (weekday >= 1 && weekday <= 4) {
        for (let hour = openH; hour < closeH; hour++) {
          const existingSlot = await prisma.daycareSlot.findFirst({
            where: {
              date: new Date(date.toDateString()),
              hour,
            },
          });

          if (!existingSlot) {
            const openDate = new Date(date);
            openDate.setHours(hour, 0, 0, 0);

            const closeDate = new Date(date);
            closeDate.setHours(hour + 1, 0, 0, 0);

            const newSlot = await prisma.daycareSlot.create({
              data: {
                date: new Date(date.toDateString()),
                hour,
                openHour: openDate,
                closeHour: closeDate,
                capacity,
                availableSpots: capacity,
                status: "OPEN",
              },
            });

            createdSlots.push(newSlot);
          }
        }
      }
    }

    return res.status(201).json({
      message: `✅ ${createdSlots.length} slots creados correctamente (lunes a jueves, próximas 2 semanas).`,
      created: createdSlots,
    });
  } catch (err) {
    console.error("Error generando slots:", err);
    return res.status(500).json({ error: "Error generando los slots de ludoteca." });
  }
});



/**
 * PUT /daycare-slots/:id
 * Edita un slot existente (capacidad, plazas libres, estado, etc.)
 */
router.put("/daycare-slots/:id", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const slotId = Number(req.params.id);
    const { capacity, availableSpots, status, openHour, closeHour } = req.body;

    const existingSlot = await prisma.daycareSlot.findUnique({
      where: { id: slotId },
    });

    if (!existingSlot) {
      return res.status(404).json({ error: "Slot no encontrado." });
    }

    const dataToUpdate: any = {
      capacity: capacity ?? existingSlot.capacity,
      availableSpots: availableSpots ?? existingSlot.availableSpots,
      status: status ?? existingSlot.status,
    };

    // 🕒 Si vienen openHour/closeHour como "HH:mm", conviértelos
    if (openHour) {
      const [h, m] = openHour.split(":").map(Number);
      const d = new Date(existingSlot.date);
      d.setHours(h, m, 0, 0);
      dataToUpdate.openHour = d;
    }
    if (closeHour) {
      const [h, m] = closeHour.split(":").map(Number);
      const d = new Date(existingSlot.date);
      d.setHours(h, m, 0, 0);
      dataToUpdate.closeHour = d;
    }

    const updatedSlot = await prisma.daycareSlot.update({
      where: { id: slotId },
      data: dataToUpdate,
    });

    return res.json({
      message: "✅ Slot actualizado correctamente",
      slot: updatedSlot,
    });
  } catch (error) {
    console.error("Error al editar slot:", error);
    return res.status(500).json({ error: "Error al editar el slot." });
  } finally {
    await prisma.$disconnect();
  }
});

/**
 * PUT /admin/daycare-slots
 * Actualiza varios slots a la vez (por fecha, rango de horas, etc.)
 * Body esperado:
 * {
 *   "date": "2025-10-23",
 *   "startHour": 17,
 *   "endHour": 20,
 *   "capacity": 25
 * }
 */
router.put("/daycare-slots", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { date, startHour, endHour, capacity, status } = req.body;

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const updated = await prisma.daycareSlot.updateMany({
      where: {
        date: targetDate,
        hour: { gte: startHour, lt: endHour },
      },
      data: {
        ...(capacity && { capacity }),
        ...(status && { status }),
        ...(capacity && { availableSpots: capacity }), // opcional: reiniciar plazas
      },
    });

    return res.json({
      message: `✅ ${updated.count} slots actualizados correctamente.`,
    });
  } catch (error) {
    console.error("Error al editar slots:", error);
    return res.status(500).json({ error: "Error al editar los slots." });
  }
});
/**
 * GET /daycare-slots/available?date=2025-10-19
 * Devuelve todos los slots disponibles (OPEN y con plazas > 0) para un día
 */
router.get("/available/date/:date", async (req, res) => {
  const { date } = req.params;
  const [year, month, day] = date.split("-").map(Number);

  if (!date) {
    return res.status(400).json({ error: "Falta el parámetro 'date' (YYYY-MM-DD)" });
  }

  // Convertir string de fecha a rango del día (00:00 a 23:59)
  const startOfDay = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const endOfDay = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  try {

    // Buscar slots de ese día que estén abiertos y tengan plazas
    const availableSlots = await prisma.daycareSlot.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: "OPEN",
        availableSpots: { gt: 0 },
      },
      orderBy: { openHour: "asc" },
      select: {
        id: true,
        hour: true,
        openHour: true,
        closeHour: true,
        availableSpots: true,
        capacity: true,
        status: true,
      },
    });

    const formatted = availableSlots.map((slot) => ({
      id: slot.id,
      date: date, // agregar la fecha
      hour: slot.hour,
      openHour: slot.openHour,
      closeHour: slot.closeHour,
      availableSpots: slot.availableSpots,
      capacity: slot.capacity,
      status: slot.status,
      label: `${new Date(slot.openHour).getHours()}:00 - ${new Date(slot.closeHour).getHours()}:00`,
    }));


    // Si no hay resultados
    if (availableSlots.length === 0) {
      return res.json({ date, availableSlots: [] });
    }

    return res.json({ date, availableSlots: formatted });
  } catch (err) {
    console.error("Error al obtener slots disponibles:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ✅ Listar todos los slots disponibles
router.get("/", async (req: any, res) => {

  try {
    const slots = await prisma.daycareSlot.findMany({
      include: { bookings: true },

    });
    res.json(slots);
  } catch (err) {
    console.error("Error listando slots disponibles:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * DELETE /admin/daycare-slots/:id
 * Elimina un slot individual (por ID)
 */
router.delete("/daycare-slots/:id", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const slotId = Number(req.params.id);

    // Buscar si existe
    const slot = await prisma.daycareSlot.findUnique({
      where: { id: slotId },
      include: { bookings: true },
    });

    if (!slot) {
      return res.status(404).json({ error: "Slot no encontrado." });
    }

    // 🚫 Si tiene reservas activas, puedes decidir no borrarlo
    if (slot.bookings.length > 0) {
      return res.status(400).json({
        error: "No se puede eliminar el slot porque tiene reservas activas.",
      });
    }

    await prisma.daycareSlot.delete({ where: { id: slotId } });

    return res.json({ message: "✅ Slot eliminado correctamente." });
  } catch (error) {
    console.error("Error al eliminar slot:", error);
    return res.status(500).json({ error: "Error al eliminar el slot." });
  }
});

/**
 * DELETE /admin/daycare-slots
 * Elimina varios slots por fecha o rango horario.
 * Body esperado:
 * {
 *   "date": "2025-10-23",
 *   "startHour": 17,
 *   "endHour": 20
 * }
 */
router.delete("/daycare-slots", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { date, startHour, endHour } = req.body;
    if (!date) {
      return res.status(400).json({ error: "Se requiere la fecha del slot." });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // Buscar los slots que coincidan
    const slots = await prisma.daycareSlot.findMany({
      where: {
        date: targetDate,
        ...(startHour && endHour
          ? { hour: { gte: startHour, lt: endHour } }
          : {}),
      },
      include: { bookings: true },
    });

    if (slots.length === 0) {
      return res.status(404).json({ error: "No se encontraron slots." });
    }

    // Comprobar si alguno tiene reservas activas
    const hasBookings = slots.some((s) => s.bookings.length > 0);
    if (hasBookings) {
      return res.status(400).json({
        error:
          "No se pueden eliminar todos los slots porque algunos tienen reservas activas.",
      });
    }

    const result = await prisma.daycareSlot.deleteMany({
      where: {
        date: targetDate,
        ...(startHour && endHour
          ? { hour: { gte: startHour, lt: endHour } }
          : {}),
      },
    });

    return res.json({
      message: `✅ ${result.count} slots eliminados correctamente.`,
    });
  } catch (error) {
    console.error("Error al eliminar slots:", error);
    return res.status(500).json({ error: "Error al eliminar los slots." });
  }
});


export default router;