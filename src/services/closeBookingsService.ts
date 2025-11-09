import { PrismaClient } from "@prisma/client";
import { sendTemplatedEmail } from "../service/mailing";
import { getDaycareBookingStatusChangedEmail } from "../service/emailTemplates";

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

        let notifiedCount = 0;

        // Procesar cada reserva
        for (const booking of pastBookings) {
            try {
                // Marcar como CLOSED
                await prisma.daycareBooking.update({
                    where: { id: booking.id },
                    data: { status: 'CLOSED' }
                });

                // Enviar notificación por email si el usuario tiene email
                if (booking.user.email) {
                    try {
                        const previousStatus = booking.status; // Estado antes de cerrar
                        
                        const emailData = getDaycareBookingStatusChangedEmail(
                            booking.user.name,
                            {
                                id: booking.id,
                                startTime: booking.startTime,
                                endTime: booking.endTime,
                                children: booking.children,
                                status: 'CLOSED'
                            },
                            previousStatus
                        );

                        await sendTemplatedEmail(
                            booking.user.email,
                            "Reserva de ludoteca cerrada - Somriures & Colors",
                            emailData
                        );
                        notifiedCount++;
                        console.log(`✅ Notificación enviada a ${booking.user.email} para reserva #${booking.id}`);
                    } catch (emailError) {
                        console.error(`❌ Error enviando email a ${booking.user.email} para reserva #${booking.id}:`, emailError);
                        // Continuar aunque falle el email
                    }
                } else {
                    console.log(`⚠️ Usuario ${booking.user.name} no tiene email, no se envió notificación para reserva #${booking.id}`);
                }
            } catch (error) {
                console.error(`❌ Error procesando reserva #${booking.id}:`, error);
                // Continuar con la siguiente reserva
            }
        }

        console.log(`✅ Proceso completado: ${pastBookings.length} reserva(s) cerrada(s), ${notifiedCount} notificación(es) enviada(s).`);
        
        return { 
            closed: pastBookings.length, 
            notified: notifiedCount 
        };
    } catch (error) {
        console.error("❌ Error en closePastBookingsAndNotify:", error);
        throw error;
    }
}

