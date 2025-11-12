import prisma from "./prisma";
// utils/validateSlot.ts


export async function validateSlotConflict({ id, date, start, end }: { id?: number, date: Date, start: Date, end: Date }) {
  // Normalizar fechas
  date.setUTCHours(0, 0, 0, 0);
  start.setMilliseconds(0);
  end.setMilliseconds(0);

  // Validar rango
  if (end <= start) {
    throw new Error("La hora de fin debe ser posterior a la de inicio");
  }

  // Buscar exacto
  const exactSlot = await prisma.birthdaySlot.findFirst({
    where: {
      ...(id && { id: { not: id } }),
      date,
      startTime: start,
      endTime: end,
    },
  });
  if (exactSlot) {
    throw new Error("Ya existe un slot con esa fecha y horario exacto");
  }

  // Buscar solapado
  const overlapping = await prisma.birthdaySlot.findFirst({
    where: {
      ...(id && { id: { not: id } }),
      date,
      startTime: { lte: end },
      endTime: { gte: start },
    },
  });
  if (overlapping) {
    throw new Error("El slot se solapa con otro existente");
  }
}
