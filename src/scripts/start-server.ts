import { execSync } from 'child_process';
import { spawn } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runMigrations(maxRetries = 3, delay = 5000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Intentando ejecutar migraciones (intento ${attempt}/${maxRetries})...`);
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        env: process.env 
      });
      console.log('✅ Migraciones aplicadas correctamente');
      return true;
    } catch (error: any) {
      console.error(`❌ Error en intento ${attempt}:`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Esperando ${delay / 1000}s antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('❌ Falló después de todos los reintentos');
        return false;
      }
    }
  }
  return false;
}

async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Conexión a la base de datos exitosa');
    return true;
  } catch (error: any) {
    console.error('❌ Error conectando a la base de datos:', error.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function start() {
  console.log('🚀 Iniciando servidor...');
  
  // Verificar conexión a la base de datos primero
  const dbConnected = await checkDatabaseConnection();
  if (!dbConnected) {
    console.error('❌ No se pudo conectar a la base de datos. Abortando inicio.');
    process.exit(1);
  }

  // Intentar ejecutar migraciones
  const migrationsSuccess = await runMigrations();
  if (!migrationsSuccess) {
    console.warn('⚠️  Las migraciones fallaron, pero el servidor intentará iniciar de todas formas.');
    console.warn('⚠️  Verifica el estado de la base de datos manualmente.');
  }

  // Iniciar el servidor
  console.log('🚀 Iniciando aplicación Node.js...');
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
    if (code !== null && code !== 0) {
      console.error(`❌ Servidor terminó con código ${code}`);
      process.exit(code);
    }
  });

  // Manejo de señales para shutdown graceful
  const gracefulShutdown = async (signal: NodeJS.Signals) => {
    console.log(`📴 Recibida señal ${signal}, cerrando conexiones...`);
    try {
      await prisma.$disconnect();
      serverProcess.kill(signal);
      setTimeout(() => {
        console.log('⚠️  Forzando cierre...');
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

