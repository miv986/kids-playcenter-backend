// start-server.ts
import { execSync, spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Espera a que la base de datos esté disponible
 */
async function waitForDatabase(maxRetries = 20, delay = 3000): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔍 Verificando base de datos (intento ${attempt}/${maxRetries})...`);
      await prisma.$queryRaw`SELECT 1`;
      console.log("✅ Base de datos lista");
      return;
    } catch (err: any) {
      console.error(`❌ Base de datos no disponible: ${err.message}`);
      if (attempt < maxRetries) {
        console.log(`⏳ Reintentando en ${delay / 1000}s...`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        console.error("❌ La base de datos no respondió después de varios intentos");
        return; // NO matamos el proceso directamente
      }
    }
  }
}

/**
 * Ejecuta migraciones con reintentos
 */
async function runMigrations(maxRetries = 3, delay = 5000): Promise<boolean> {
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
 * Arranca el servidor real (dist/server.js)
 */
async function start() {
  console.log('🚀 Iniciando servidor...');

  await waitForDatabase();

  const migrationsSuccess = await runMigrations();
  if (!migrationsSuccess) {
    console.warn('⚠️ Las migraciones fallaron, pero el servidor intentará iniciar de todas formas.');
  }

  console.log('🚀 Lanzando aplicación Node...');
  
  const serverProcess = spawn('node', ['dist/server.js'], {
    stdio: 'inherit',
    env: process.env,
    shell: false
  });

  serverProcess.on('error', (error: any) => {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  });

  serverProcess.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`❌ El servidor terminó con código ${code}`);
      process.exit(code);
    }
  });

  // Shutdown controlado
  const gracefulShutdown = async (signal: NodeJS.Signals) => {
    console.log(`📴 Recibida señal ${signal}, apagando...`);
    try {
      await prisma.$disconnect();
      serverProcess.kill(signal);
      setTimeout(() => {
        console.log('⚠️ Forzando cierre...');
        process.exit(0);
      }, 10000);
    } catch (error) {
      console.error('Error durante shutdown:', error);
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
