// Configurar variables de entorno PRIMERO, antes de cualquier import que las necesite
import dotenv from 'dotenv';
dotenv.config();

// Validar variables de entorno críticas antes de continuar
import { validateEnv } from './utils/validateEnv';
validateEnv();

import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './middleware/cors';

// NO importar rutas aquí - se importarán después de inicializar Prisma
const app = express();


// CORS
app.use(corsMiddleware);
app.options('*', corsMiddleware); // habilitar preflight requests para todas las rutas
// Body parser
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Las rutas se registrarán dinámicamente después de inicializar Prisma

// Health check endpoint - verifica que la DB esté conectada
app.get('/health', async (req, res) => {
  try {
    const { isPrismaConnected, getPrisma } = await import('./utils/prisma');
    
    if (!isPrismaConnected()) {
      return res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        message: 'Database not connected'
      });
    }

    // Verificar que podemos hacer queries
    const prisma = getPrisma();
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'error',
      message: error.message
    });
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'Kids Playcenter Backend',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      auth: '/api/auth',
      apiBookings: '/api/bookings',
      apiBirthdaySlots: '/api/birthdaySlots',
      apiDaycareSlots: '/api/daycareSlots',
      apiDaycareBookings: '/api/daycareBookings',
      apiMeetingSlots: '/api/meetingSlots',
      apiMeetingBookings: '/api/meetingBookings',
      apiPackages: '/api/packages',

    },
  });
});

// Manejo de errores global
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

/**
 * Registra todas las rutas después de que Prisma esté listo
 */
async function registerRoutes() {
  console.log('📋 Registrando rutas...');
  
  const apiRoutes = (await import('./routes/api')).default;
  const authRoutes = (await import('./routes/auth')).default;
  const apiBookings = (await import('./routes/bookings')).default;
  const apiBirthdaySlots = (await import('./routes/birthdaySlots')).default;
  const apiDaycareSlots = (await import('./routes/daycareSlots')).default;
  const apiDaycareBookings = (await import('./routes/daycareBookings')).default;
  const apiMeetingSlots = (await import('./routes/meetingSlots')).default;
  const apiMeetingBookings = (await import('./routes/meetingBookings')).default;
  const apiPackages = (await import('./routes/packages')).default;

  app.use('/api', apiRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/bookings', apiBookings);
  app.use('/api/birthdaySlots', apiBirthdaySlots);
  app.use('/api/daycareSlots', apiDaycareSlots);
  app.use('/api/daycareBookings', apiDaycareBookings);
  app.use('/api/meetingSlots', apiMeetingSlots);
  app.use('/api/meetingBookings', apiMeetingBookings);
  app.use('/api/packages', apiPackages);
  
  // Manejo de rutas no encontradas - DEBE ir DESPUÉS de todas las rutas
  app.use((req, res) => {
    res.status(404).json({
      error: 'Route not found'
    });
  });
  
  console.log('✅ Rutas registradas correctamente');
}

/**
 * Función para arrancar el servidor
 * Asume que Prisma ya fue inicializado por start-server.ts
 */
export async function startServer() {
  const PORT = process.env.PORT || 4000;

  // Verificar que Prisma esté conectado
  const { isPrismaConnected } = await import('./utils/prisma');
  if (!isPrismaConnected()) {
    console.warn('⚠️ ADVERTENCIA: Prisma no está conectado. Intentando conectar...');
    const { initializePrisma } = await import('./utils/prisma');
    try {
      await initializePrisma(10, 2000);
    } catch (error) {
      console.error('❌ No se pudo conectar a la base de datos. El servidor no puede arrancar.');
      throw error;
    }
  }

  // Registrar rutas DESPUÉS de verificar Prisma
  await registerRoutes();

  // Arrancar servidor HTTP - retornar Promise para que start-server.ts pueda esperar
  return new Promise<void>((resolve) => {
    app.listen(PORT, async () => {
      console.log(`🚀 Server running on port ${PORT}`);

      // Inicializar trabajos programados DESPUÉS de que todo esté listo
      try {
        const { initializeScheduledJobs } = await import('./jobs/bookingScheduler');
        await initializeScheduledJobs();
      } catch (error) {
        console.error('⚠️ Error inicializando trabajos programados:', error);
        // No matamos el servidor por esto
      }
      
      resolve();
    });
  });
}

// Ejecutar servidor si este archivo es el entry point (para desarrollo)
if (require.main === module) {
  (async () => {
    console.log('⚠️ Iniciando en modo directo (desarrollo). Para producción, usa start-server.ts');
    
    const { initializePrisma } = await import('./utils/prisma');
    await initializePrisma(20, 3000);
    
    await startServer();
  })().catch((error) => {
    console.error('❌ Error fatal al iniciar servidor:', error);
    process.exit(1);
  });
}

export default app;