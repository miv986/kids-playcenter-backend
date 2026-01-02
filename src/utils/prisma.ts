import { PrismaClient } from '@prisma/client';

// Singleton pattern con lazy initialization y retry
let prisma: PrismaClient | null = null;
let isConnected = false;
let connectionPromise: Promise<void> | null = null;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Inicializa y conecta Prisma con retry logic
 */
export async function initializePrisma(maxRetries = 10, delayMs = 2000): Promise<void> {
  // Si ya hay una conexión en progreso, esperar a que termine
  if (connectionPromise) {
    return connectionPromise;
  }

  // Si ya está conectado, retornar
  if (isConnected && prisma) {
    return;
  }

  connectionPromise = (async () => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔌 Conectando a base de datos (intento ${attempt}/${maxRetries})...`);

        // Crear instancia si no existe
        if (!prisma) {
          if (process.env.NODE_ENV === 'production') {
            prisma = new PrismaClient();
          } else {
            if (!global.__prisma) {
              global.__prisma = new PrismaClient();
            }
            prisma = global.__prisma;
          }
        }

        // Verificar conexión
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;

        console.log('✅ Prisma conectado correctamente');
        isConnected = true;
        return;

      } catch (error: any) {
        console.error(`❌ Error conectando Prisma: ${error.message}`);

        if (attempt < maxRetries) {
          console.log(`⏳ Reintentando en ${delayMs / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          console.error('❌ No se pudo conectar a la base de datos después de todos los reintentos');
          throw new Error('Database connection failed after all retries');
        }
      } finally {
        if (!isConnected) {
          connectionPromise = null;
        }
      }
    }
  })();

  return connectionPromise;
}

/**
 * Obtiene la instancia de Prisma (debe llamarse después de initializePrisma)
 */
export function getPrisma(): PrismaClient {
  if (!prisma || !isConnected) {
    throw new Error('Prisma no está inicializado. Llama a initializePrisma() primero.');
  }
  return prisma;
}

/**
 * Desconecta Prisma limpiamente
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    isConnected = false;
    connectionPromise = null;
    console.log('🔌 Prisma desconectado');
  }
}

/**
 * Verifica si Prisma está conectado
 */
export function isPrismaConnected(): boolean {
  return isConnected && prisma !== null;
}

// Export por defecto - permite importar sin error, pero lanza error al usar
// Esto permite que las rutas se importen sin problemas, pero fallan si intentan usar Prisma antes de inicializar
const handler = {
  get(_target: any, prop: string) {
    if (!isConnected || !prisma) {
      // Si es una propiedad especial de Prisma (como $connect, $disconnect), permitir acceso
      // pero lanzar error para propiedades de modelo
      if (prop.startsWith('$')) {
        throw new Error(
          `❌ Prisma no está inicializado. ` +
          `Llama a initializePrisma() antes de usar ${prop}.`
        );
      }
      throw new Error(
        `❌ Intentando usar Prisma antes de inicializar. ` +
        `Propiedad accedida: ${prop}. ` +
        `Asegúrate de llamar a initializePrisma() antes de usar prisma.`
      );
    }
    return (prisma as any)[prop];
  }
};

export default new Proxy({}, handler) as PrismaClient;

