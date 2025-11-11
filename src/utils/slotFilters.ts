// utils/slotFilters.ts
// Funciones helper para filtrar slots de cumpleaños

/**
 * Crea un filtro para excluir slots pasados
 * @param now - Fecha/hora actual
 * @returns Objeto de filtro para Prisma
 */
export function getFutureSlotsFilter(now: Date = new Date()) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
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
                            lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
                        }
                    }, // Hoy
                    { startTime: { gte: now } } // Pero con hora no pasada
                ]
            }
        ]
    };
}

