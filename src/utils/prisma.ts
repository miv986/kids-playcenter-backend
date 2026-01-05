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

/**
 * Verifica si un error es de conexión de base de datos
 */
function isConnectionError(error: any): boolean {
  if (!error) return false;
  
  // Códigos de error de Prisma relacionados con conexión
  const connectionErrorCodes = [
    'P1001', // Can't reach database server
    'P1008', // Operations timed out
    'P1017', // Server has closed the connection
    'P1030', // Database server error
  ];
  
  if (error.code && connectionErrorCodes.includes(error.code)) {
    return true;
  }
  
  // Errores de mensaje relacionados con conexión
  const connectionMessages = [
    'connection',
    'connect',
    'timeout',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'database server',
    'connection closed',
  ];
  
  const errorMessage = (error.message || '').toLowerCase();
  return connectionMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Intenta reconectar si hay un error de conexión
 */
async function attemptReconnect(): Promise<boolean> {
  if (connectionPromise) {
    // Ya hay una reconexión en progreso
    try {
      await connectionPromise;
      return isConnected;
    } catch {
      return false;
    }
  }
  
  if (isConnected) {
    return true;
  }
  
  // Intentar reconectar con menos reintentos para no bloquear
  try {
    await initializePrisma(3, 2000);
    return isConnected;
  } catch {
    return false;
  }
}

// Wrapper para métodos de Prisma que detecta errores de conexión y reintenta
function wrapPrismaMethod(prismaInstance: PrismaClient, method: any) {
  return async (...args: any[]) => {
    try {
      return await method.apply(prismaInstance, args);
    } catch (error: any) {
      // Si es un error de conexión, intentar reconectar
      if (isConnectionError(error)) {
        console.warn('⚠️ Error de conexión detectado, intentando reconectar...');
        isConnected = false;
        
        const reconnected = await attemptReconnect();
        if (reconnected && prisma) {
          // Reintentar la operación una vez
          try {
            return await method.apply(prisma, args);
          } catch (retryError: any) {
            throw retryError;
          }
        }
        // Si no se pudo reconectar, lanzar error controlado
        throw new Error('Database not available. Please try again later.');
      }
      throw error;
    }
  };
}

// Export por defecto - permite importar sin error, pero maneja errores de conexión
// Wrapper que detecta errores de conexión y reintenta automáticamente
const handler = {
  get(_target: any, prop: string) {
    // Si no hay prisma o no está conectado, devolver un objeto proxy que intente reconectar
    if (!prisma || !isConnected) {
      return new Proxy({}, {
        get: (_modelTarget: any, modelProp: string) => {
          // Devolver función que intente reconectar y luego ejecutar
          return async (...args: any[]) => {
            // Intentar reconectar primero
            if (!prisma || !isConnected) {
              const reconnected = await attemptReconnect();
              if (!reconnected || !prisma) {
                throw new Error('Database not available. Please try again later.');
              }
            }
            
            // Obtener el modelo y el método
            const model = (prisma as any)[prop];
            if (!model) {
              throw new Error(`Model ${prop} not found`);
            }
            
            const method = model[modelProp];
            if (typeof method !== 'function') {
              throw new Error(`Method ${modelProp} is not available on ${prop}`);
            }
            
            return wrapPrismaMethod(prisma, method)(...args);
          };
        }
      });
    }
    
    const originalValue = (prisma as any)[prop];
    
    // Si es un modelo (objeto con métodos como findMany, create, etc.)
    if (originalValue && typeof originalValue === 'object' && !Array.isArray(originalValue) && !(originalValue instanceof Date)) {
      return new Proxy(originalValue, {
        get: (modelTarget: any, modelProp: string) => {
          const method = modelTarget[modelProp];
          if (typeof method === 'function') {
            return wrapPrismaMethod(prisma!, method);
          }
          return method;
        }
      });
    }
    
    // Si es una función directa (como $connect, $disconnect, $queryRaw)
    if (typeof originalValue === 'function') {
      return wrapPrismaMethod(prisma, originalValue);
    }
    
    return originalValue;
  }
};

export default new Proxy({}, handler) as PrismaClient;

