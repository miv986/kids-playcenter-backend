import express from "express";
import { authenticateUser, optionalAuthenticate } from "../middleware/auth";
import prisma from "../utils/prisma";

const router = express.Router();


/**
 * POST /admin/generate-daycare-slots
 * Crea slots para 2 semanas específicas a partir de una fecha dada (lunes a jueves).
 */
router.post("/generate-daycare-slots", authenticateUser, async (req: any, res) => {
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { startDate, openHour, closeHour, capacity } = req.body;

    if (!startDate || !openHour || !closeHour) {
      return res.status(400).json({ error: "Faltan los campos startDate, openHour o closeHour." });
    }

    // ✅ Validar formato de horas
    if (!/^\d{2}:\d{2}$/.test(openHour) || !/^\d{2}:\d{2}$/.test(closeHour)) {
      return res.status(400).json({ error: "Formato de hora inválido. Use HH:mm." });
    }

    const [openH, openM] = openHour.split(":").map(Number);
    const [closeH, closeM] = closeHour.split(":").map(Number);

    // ✅ Validar que las horas sean válidas
    if (isNaN(openH) || isNaN(openM) || openH < 0 || openH > 23 || openM < 0 || openM > 59) {
      return res.status(400).json({ error: "Hora de apertura inválida." });
    }
    if (isNaN(closeH) || isNaN(closeM) || closeH < 0 || closeH > 23 || closeM < 0 || closeM > 59) {
      return res.status(400).json({ error: "Hora de cierre inválida." });
    }
    if (openH >= closeH) {
      return res.status(400).json({ error: "La hora de apertura debe ser anterior a la hora de cierre." });
    }

    // ✅ Validar capacidad
    if (!capacity || isNaN(Number(capacity)) || capacity <= 0) {
      return res.status(400).json({ error: "La capacidad debe ser un número positivo." });
    }

    // Convertir la fecha de inicio
    const baseDate = new Date(startDate);
    if (isNaN(baseDate.getTime())) {
      return res.status(400).json({ error: "Formato de fecha inválido. Use YYYY-MM-DD" });
    }

    const createdSlots = [];
    const errors = [];
    let lastProcessedDate: Date | null = null;
    
    // Obtener el día de la semana de la fecha de inicio (0 = domingo, 1 = lunes, ..., 6 = sábado)
    const startWeekday = baseDate.getDay();
    
    // Calcular el lunes de la semana de inicio
    // Si es domingo (0), retroceder 6 días; si es lunes (1), retroceder 0 días, etc.
    const daysToMonday = startWeekday === 0 ? -6 : 1 - startWeekday;
    const mondayOfFirstWeek = new Date(baseDate);
    mondayOfFirstWeek.setDate(baseDate.getDate() + daysToMonday);
    mondayOfFirstWeek.setHours(0, 0, 0, 0);
    
    // Fase 1: Generar lunes a jueves de la semana de inicio
    let currentDate = new Date(mondayOfFirstWeek);
    for (let day = 1; day <= 4; day++) {
      const date = new Date(currentDate);
      lastProcessedDate = new Date(date);
      
      for (let hour = openH; hour < closeH; hour++) {
        try {
          // Verificar si ya existe un slot para esta fecha y hora
          const existingSlot = await prisma.daycareSlot.findFirst({
            where: {
              date: {
                gte: new Date(date.toDateString()),
                lt: new Date(new Date(date).setDate(date.getDate() + 1))
              },
              hour: hour,
            },
          });

          if (existingSlot) {
            errors.push(`Slot ya existe para ${date.toDateString()} a las ${hour}:00`);
            continue;
          }

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
        } catch (error) {
          console.error(`Error creando slot para ${date.toDateString()} ${hour}:00:`, error);
          errors.push(`Error creando slot para ${date.toDateString()} ${hour}:00`);
        }
      }
      
      // Avanzar al siguiente día
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Fase 2: Generar lunes a jueves de la semana siguiente
    // Avanzar al lunes de la siguiente semana (sumar 7 días desde el lunes actual)
    currentDate.setDate(mondayOfFirstWeek.getDate() + 7);
    
    for (let day = 1; day <= 4; day++) {
      const date = new Date(currentDate);
      lastProcessedDate = new Date(date);
      
      for (let hour = openH; hour < closeH; hour++) {
        try {
          // Verificar si ya existe un slot para esta fecha y hora
          const existingSlot = await prisma.daycareSlot.findFirst({
            where: {
              date: {
                gte: new Date(date.toDateString()),
                lt: new Date(new Date(date).setDate(date.getDate() + 1))
              },
              hour: hour,
            },
          });

          if (existingSlot) {
            errors.push(`Slot ya existe para ${date.toDateString()} a las ${hour}:00`);
            continue;
          }

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
        } catch (error) {
          console.error(`Error creando slot para ${date.toDateString()} ${hour}:00:`, error);
          errors.push(`Error creando slot para ${date.toDateString()} ${hour}:00`);
        }
      }
      
      // Avanzar al siguiente día
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return res.status(201).json({
      message: `✅ ${createdSlots.length} slots creados correctamente.`,
      created: createdSlots,
      errors: errors.length > 0 ? errors : undefined,
      summary: {
        startDate: baseDate.toDateString(),
        endDate: lastProcessedDate ? lastProcessedDate.toDateString() : baseDate.toDateString(),
        totalCreated: createdSlots.length,
        totalErrors: errors.length
      }
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

    // ✅ Validar que el ID sea válido
    if (isNaN(slotId) || slotId <= 0) {
      return res.status(400).json({ error: "ID de slot inválido." });
    }

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
      if (!/^\d{2}:\d{2}$/.test(openHour)) {
        return res.status(400).json({ error: "Formato de hora inválido. Use HH:mm." });
      }
      const [h, m] = openHour.split(":").map(Number);
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return res.status(400).json({ error: "Hora inválida." });
      }
      const d = new Date(existingSlot.date);
      d.setHours(h, m, 0, 0);
      dataToUpdate.openHour = d;
      dataToUpdate.hour = h; // Actualizar el campo hour con la hora de inicio
    }
    if (closeHour) {
      if (!/^\d{2}:\d{2}$/.test(closeHour)) {
        return res.status(400).json({ error: "Formato de hora inválido. Use HH:mm." });
      }
      const [h, m] = closeHour.split(":").map(Number);
      if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
        return res.status(400).json({ error: "Hora inválida." });
      }
      const d = new Date(existingSlot.date);
      d.setHours(h, m, 0, 0);
      dataToUpdate.closeHour = d;
      // No actualizar hour aquí porque debe ser la hora de inicio, no la de cierre
    }

    // ✅ Validar que availableSpots no sea mayor que capacity
    if (availableSpots !== undefined && capacity !== undefined) {
      if (availableSpots > capacity) {
        return res.status(400).json({ error: "Las plazas disponibles no pueden ser mayores que la capacidad." });
      }
    }
    if (availableSpots !== undefined && existingSlot.capacity && availableSpots > existingSlot.capacity) {
      return res.status(400).json({ error: "Las plazas disponibles no pueden ser mayores que la capacidad." });
    }
    if (capacity !== undefined && existingSlot.availableSpots && existingSlot.availableSpots > capacity) {
      return res.status(400).json({ error: "La capacidad no puede ser menor que las plazas disponibles actuales." });
    }

    const updatedSlot = await prisma.daycareSlot.update({
      where: { id: slotId },
      data: dataToUpdate,
    });

    // Formatear las horas a "HH:mm" para el frontend
    const formattedSlot = {
      ...updatedSlot,
      openHour: updatedSlot.openHour ? 
        `${updatedSlot.openHour.getHours().toString().padStart(2, '0')}:${updatedSlot.openHour.getMinutes().toString().padStart(2, '0')}` : 
        null,
      closeHour: updatedSlot.closeHour ? 
        `${updatedSlot.closeHour.getHours().toString().padStart(2, '0')}:${updatedSlot.closeHour.getMinutes().toString().padStart(2, '0')}` : 
        null,
    };

    return res.json({
      message: "✅ Slot actualizado correctamente",
      slot: formattedSlot,
    });
  } catch (error: any) {
    console.error("Error al editar slot:", error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: "Slot no encontrado." });
    }
    return res.status(500).json({ error: "Error interno del servidor." });
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

    // ✅ Validaciones
    if (!date) {
      return res.status(400).json({ error: "La fecha es requerida." });
    }

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    // ✅ Validar que la fecha sea válida
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: "Fecha inválida." });
    }

    // ✅ Validar horas
    if (startHour !== undefined && (isNaN(Number(startHour)) || startHour < 0 || startHour > 23)) {
      return res.status(400).json({ error: "Hora de inicio inválida." });
    }
    if (endHour !== undefined && (isNaN(Number(endHour)) || endHour < 0 || endHour > 23)) {
      return res.status(400).json({ error: "Hora de fin inválida." });
    }
    if (startHour !== undefined && endHour !== undefined && startHour >= endHour) {
      return res.status(400).json({ error: "La hora de inicio debe ser anterior a la hora de fin." });
    }

    // ✅ Validar capacidad
    if (capacity !== undefined && (isNaN(Number(capacity)) || capacity <= 0)) {
      return res.status(400).json({ error: "La capacidad debe ser un número positivo." });
    }

    const updated = await prisma.daycareSlot.updateMany({
      where: {
        date: targetDate,
        ...(startHour !== undefined && endHour !== undefined && { hour: { gte: startHour, lt: endHour } }),
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
 * Filtra slots pasados para usuarios finales
 */
router.get("/available/date/:date", async (req, res) => {
  const { date } = req.params;
  const [year, month, day] = date.split("-").map(Number);

  if (!date) {
    return res.status(400).json({ error: "Falta el parámetro 'date' (YYYY-MM-DD)" });
  }

  // Convertir string de fecha a rango del día (00:00 a 23:59) - usar fecha local (estandarizado)
  const { getDateRange, getStartOfDay } = await import("../utils/dateHelpers");
  const { start: startOfDay, end: endOfDay } = getDateRange(date);

  try {
    const now = getStartOfDay();
    const todayStart = now;

    // Buscar slots de ese día que estén abiertos y tengan plazas
    // ✅ Siempre filtrar slots pasados (endpoint público)
    const availableSlots = await prisma.daycareSlot.findMany({
      where: {
        date: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: "OPEN",
        availableSpots: { gt: 0 },
        // ✅ Filtrar slots pasados: fechas futuras o de hoy con hora no pasada
        AND: [
          {
            OR: [
              {
                date: { gt: todayStart } // Fechas futuras
              },
              {
                AND: [
                  { date: todayStart }, // Hoy
                  { openHour: { gte: now } } // Pero con hora no pasada
                ]
              }
            ]
          }
        ]
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
      openHour: `${new Date(slot.openHour).getHours().toString().padStart(2, '0')}:${new Date(slot.openHour).getMinutes().toString().padStart(2, '0')}`,
      closeHour: `${new Date(slot.closeHour).getHours().toString().padStart(2, '0')}:${new Date(slot.closeHour).getMinutes().toString().padStart(2, '0')}`,
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
// Si es admin, devuelve todos. Si es usuario final o no autenticado, filtra slots pasados
// Parámetros opcionales: startDate, endDate (YYYY-MM-DD) para filtrar por rango
// Parámetros opcionales: availableOnly=true para filtrar solo slots OPEN con plazas > 0
router.get("/", optionalAuthenticate, async (req: any, res) => {
  try {
    const isAdmin = req.user?.role === "ADMIN";
    const { getNow, getStartOfDay, getDateRange, getEndOfDay, parseDateString } = await import("../utils/dateHelpers");
    const now = getNow();
    const todayStart = getStartOfDay();
    const { startDate, endDate, availableOnly } = req.query;

    const whereClause: any = {};
    const andConditions: any[] = [];
    
    // Filtrar por rango de fechas si se proporciona
    if (startDate && endDate) {
      const { start: startOfRange } = getDateRange(startDate as string);
      const endOfRange = getEndOfDay(parseDateString(endDate as string));
      
      andConditions.push({
        date: {
          gte: startOfRange,
          lte: endOfRange,
        }
      });
    }
    
    // Si availableOnly=true, filtrar solo slots OPEN con plazas disponibles
    if (availableOnly === 'true') {
      andConditions.push({
        status: "OPEN",
        availableSpots: { gt: 0 }
      });
    }
    
    // ✅ Filtrar slots pasados solo para usuarios finales o no autenticados (no admin)
    if (!isAdmin) {
      andConditions.push({
        OR: [
          {
            date: { gt: todayStart } // Fechas futuras
          },
          {
            AND: [
              { date: todayStart }, // Hoy
              { openHour: { gte: now } } // Pero con hora no pasada
            ]
          }
        ]
      });
    }
    
    // Combinar todas las condiciones
    if (andConditions.length > 0) {
      if (andConditions.length === 1) {
        Object.assign(whereClause, andConditions[0]);
      } else {
        whereClause.AND = andConditions;
      }
    }

    const slots = await prisma.daycareSlot.findMany({
      where: whereClause,
      include: { bookings: true },
      orderBy: startDate && endDate ? [
        { date: "asc" },
        { openHour: "asc" }
      ] : undefined,
    });

    // Formatear las horas a "HH:mm" y agregar fecha formateada si es necesario
    const formattedSlots = slots.map(slot => {
      const slotDate = new Date(slot.date);
      const dateStr = `${slotDate.getFullYear()}-${(slotDate.getMonth() + 1).toString().padStart(2, '0')}-${slotDate.getDate().toString().padStart(2, '0')}`;
      
      return {
        ...slot,
        date: dateStr, // Agregar fecha formateada
        openHour: `${new Date(slot.openHour).getHours().toString().padStart(2, '0')}:${new Date(slot.openHour).getMinutes().toString().padStart(2, '0')}`,
        closeHour: `${new Date(slot.closeHour).getHours().toString().padStart(2, '0')}:${new Date(slot.closeHour).getMinutes().toString().padStart(2, '0')}`,
      };
    });

    // Si se solicita availableOnly con rango, devolver en formato compatible
    if (availableOnly === 'true' && startDate && endDate) {
      return res.json({ availableSlots: formattedSlots });
    }

    res.json(formattedSlots);
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

    // ✅ Validar que el ID sea válido
    if (isNaN(slotId) || slotId <= 0) {
      return res.status(400).json({ error: "ID de slot inválido." });
    }

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