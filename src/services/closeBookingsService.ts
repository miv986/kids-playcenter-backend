import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Cierra reservas pasadas y envía notificaciones a los usuarios
 */
export async function closePastBookingsAndNotify() {
    try {
        const now = new Date();
        
        // Buscar reservas pasadas que no estén ya CLOSED o CANCELLED
        const pastBookings = await prisma.daycareBooking.findMany({
            where: {
                endTime: { lt: now },
                status: { 
                    notIn: ['CLOSED', 'CANCELLED']
                }
            },
            include: {
                user: true,
                slots: true,
                children: true
            }
        });

        if (pastBookings.length === 0) {
            console.log("📋 No hay reservas pasadas para cerrar.");
            return { closed: 0, notified: 0 };
        }

        console.log(`📦 Encontradas ${pastBookings.length} reserva(s) pasada(s) para cerrar.`);

        // Procesar cada reserva
        for (const booking of pastBookings) {
            try {
                // Marcar como CLOSED
                await prisma.daycareBooking.update({
                    where: { id: booking.id },
                    data: { status: 'CLOSED' }
                });

                // No se envía email cuando se cierra una reserva
            } catch (error) {
                console.error(`❌ Error procesando reserva #${booking.id}:`, error);
                // Continuar con la siguiente reserva
            }
        }

        console.log(`✅ Proceso completado: ${pastBookings.length} reserva(s) cerrada(s).`);
        
        return { 
            closed: pastBookings.length, 
            notified: 0 
        };
    } catch (error) {
        console.error("❌ Error en closePastBookingsAndNotify:", error);
        throw error;
    }
}

