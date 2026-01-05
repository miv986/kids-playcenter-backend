import * as cron from "node-cron";
import { closePastBookingsAndNotify } from "../services/closeBookingsService";
import { isPrismaConnected } from "../utils/prisma";

/**
 * Wrapper seguro que verifica conexión antes de ejecutar
 */
async function safeExecuteJob(jobName: string, jobFn: () => Promise<any>) {
    if (!isPrismaConnected()) {
        console.warn(`⚠️ ${jobName}: Prisma no está conectado, saltando ejecución`);
        return;
    }

    try {
        console.log(`🔄 ${jobName}...`);
        const result = await jobFn();
        console.log(`✅ ${jobName} completado: ${result.closed} reservas cerradas, ${result.notified} notificaciones enviadas.`);
    } catch (error: any) {
        console.error(`❌ Error en ${jobName}:`, error.message);
        // No lanzamos el error, solo lo logueamos
    }
}

/**
 * Inicializa los trabajos programados (cron jobs)
 * SOLO debe llamarse cuando Prisma esté conectado
 */
export async function initializeScheduledJobs() {
    console.log("⏰ Inicializando trabajos programados...");

    // Verificar que Prisma está conectado
    if (!isPrismaConnected()) {
        console.warn('⚠️ Cron jobs no iniciados: Prisma no conectado');
        return;
    }

    // Ejecutar cada hora para cerrar reservas pasadas
    // Formato: minuto hora día mes día-semana
    // '0 * * * *' = cada hora en el minuto 0
    cron.schedule("0 * * * *", async () => {
        await safeExecuteJob(
            "Cierre automático de reservas (programado cada hora)",
            closePastBookingsAndNotify
        );
    }, {
        timezone: "Europe/Madrid"
    });

    console.log("✅ Trabajos programados inicializados:");
    console.log("   - Cierre automático de reservas: Cada hora (Europe/Madrid)");

    // Ejecutar inmediatamente al iniciar para cerrar reservas ya caducadas
    // Pero esperar un poco para asegurar que todo está estable
    setTimeout(async () => {
        await safeExecuteJob(
            "Cierre inicial de reservas caducadas",
            closePastBookingsAndNotify
        );
    }, 5000); // Esperar 5 segundos tras arrancar
}

