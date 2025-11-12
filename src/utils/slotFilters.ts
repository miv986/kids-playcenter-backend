// utils/slotFilters.ts
// Funciones helper para filtrar slots de cumpleaños

import { getNow, getStartOfDay } from "./dateHelpers";

/**
 * Crea un filtro para excluir slots pasados
 * @param now - Fecha/hora actual (opcional, por defecto usa getNow())
 * @returns Objeto de filtro para Prisma
 */
export function getFutureSlotsFilter(now: Date = getNow()) {
    const todayStart = getStartOfDay(now);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    return {
        OR: [
            {
                startTime: { gt: now } // Slots futuros
            },
            {
                AND: [
                    { 
                        startTime: {
                            gte: todayStart,
                            lt: tomorrowStart
                        }
                    }, // Hoy
                    { startTime: { gte: now } } // Pero con hora no pasada
                ]
            }
        ]
    };
}

