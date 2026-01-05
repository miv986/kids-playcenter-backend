// start-server.ts
import { execSync } from 'child_process';
import { initializePrisma, disconnectPrisma } from '../utils/prisma';
console.log('DATABASE_URL AT START:', process.env.DATABASE_URL);


/**
 * Ejecuta migraciones con reintentos
 */
async function runMigrations(maxRetries = 5, delay = 5000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Ejecutando migraciones (intento ${attempt}/${maxRetries})...`);
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: process.env
      });
      console.log('✅ Migraciones aplicadas correctamente');
      return true;
    } catch (error: any) {
      console.error(`❌ Error en migraciones: ${error.message}`);

      if (attempt < maxRetries) {
        console.log(`⏳ Reintentando en ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ Falló después de todos los reintentos');
        return false;
      }
    }
  }
  return false;
}

/**
 * Arranca el servidor
 */
async function start() {
  console.log('🚀 Iniciando servidor Kids Playcenter...');

  // 1. Iniciar conexión a la DB en background (NO bloquear arranque)
  console.log('🔌 Iniciando conexión a la base de datos (background)...');

  initializePrisma(100, 5000).catch((error: any) => {
    console.error('🚨 Prisma sigue intentando conectar en background:', error.message);
  });

  // 2. Ejecutar migraciones
  const migrationsSuccess = await runMigrations();
  if (!migrationsSuccess) {
    console.warn('⚠️ Las migraciones fallaron, pero el servidor intentará iniciar de todas formas.');
    // En producción, podrías querer salir aquí: process.exit(1);
  }

  // 3. Importar y arrancar el servidor (que ya tiene su propia lógica de startup)
  console.log('🚀 Arrancando servidor HTTP...');
  const { startServer } = await import('../server');

  // startServer() ya maneja:
  // - Registro de rutas
  // - Inicio de cron jobs
  // - Escucha en el puerto
  await startServer();

  // 4. Manejo de señales de shutdown
  const gracefulShutdown = async (signal: NodeJS.Signals) => {
    console.log(`📴 Recibida señal ${signal}, apagando gracefully...`);
    try {
      await disconnectPrisma();
      console.log('✅ Shutdown completado');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error durante shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

start().catch((error) => {
  console.error('❌ Error fatal al iniciar:', error);
  process.exit(1);
});
