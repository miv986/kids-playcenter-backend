import { PrismaClient } from '@prisma/client';

// Singleton pattern para PrismaClient
// Evita crear múltiples instancias y problemas de conexión
let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // En desarrollo, reutilizar la instancia para evitar múltiples conexiones durante hot-reload
  if (!global.__prisma) {
    global.__prisma = new PrismaClient();
  }
  prisma = global.__prisma;
}

export default prisma;

