import * as cron from "node-cron";
import { closePastBookingsAndNotify } from "../services/closeBookingsService";

/**
 * Inicializa los trabajos programados (cron jobs)
 */
export function initializeScheduledJobs() {
    console.log("⏰ Inicializando trabajos programados...");

    // Ejecutar cada hora para cerrar reservas pasadas
    // Formato: minuto hora día mes día-semana
    // '0 * * * *' = cada hora en el minuto 0
    cron.schedule("0 * * * *", async () => {
        console.log("🔄 Ejecutando cierre automático de reservas pasadas (cada hora)...");
        try {
            const result = await closePastBookingsAndNotify();
            console.log(`✅ Cierre automático completado: ${result.closed} reservas cerradas, ${result.notified} notificaciones enviadas.`);
        } catch (error) {
            console.error("❌ Error en cierre automático de reservas:", error);
        }
    }, {
        timezone: "Europe/Madrid" // Ajustar según tu zona horaria
    });

    console.log("✅ Trabajos programados inicializados:");
    console.log("   - Cierre automático de reservas: Cada hora (Europe/Madrid)");
    
    // Ejecutar inmediatamente al iniciar para cerrar reservas ya caducadas
    console.log("🔄 Ejecutando cierre inicial de reservas caducadas...");
    closePastBookingsAndNotify()
        .then(result => {
            console.log(`✅ Cierre inicial completado: ${result.closed} reservas cerradas, ${result.notified} notificaciones enviadas.`);
        })
        .catch(error => {
            console.error("❌ Error en cierre inicial de reservas:", error);
        });
}

