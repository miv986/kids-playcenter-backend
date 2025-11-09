import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors';
import { securityHeaders, generalRateLimiter } from './middleware/security';
import { secureLogger } from './utils/logger';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import apiBookings from './routes/bookings';
import apiBirthdaySlots from './routes/birthdaySlots';
import apiDaycareSlots from './routes/daycareSlots';
import apiDaycareBookings from './routes/daycareBookings';
import apiPackages from './routes/packages';
import { PrismaClient } from '@prisma/client';

const client = new PrismaClient();




// Configurar variables de entorno
dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

// Security middleware (debe ir primero)
app.use(securityHeaders);

// CORS
app.use(corsMiddleware);

// Body parser
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Rate limiting general
app.use(generalRateLimiter);

// Logging middleware seguro (no expone datos sensibles)
app.use((req, res, next) => {
  const sanitizedUrl = req.url.replace(/token=[^&]*/gi, 'token=[REDACTED]')
                                .replace(/email=[^&]*/gi, 'email=[REDACTED]');
  secureLogger.info(`${req.method} ${sanitizedUrl}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// Rutas
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', apiBookings)
app.use('/api/birthdaySlots', apiBirthdaySlots)
app.use('/api/daycareSlots', apiDaycareSlots)
app.use('/api/daycareBookings', apiDaycareBookings)
app.use('/api/packages', apiPackages)

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'Kids Playcenter Backend',
    version: '1.0.0',
    endpoints: {
      api: '/api',
      auth: '/api/auth',
      apiBookings: '/api/bookings',
      apiBirthdaySlots: '/api/birthdaySlots',
      apiDaycareSlots: '/api/daycareSlots',
      apiDaycareBookings: '/api/daycareBookings',
      apiPackages: '/api/packages',

    },
  });
});

// Manejo de errores global (seguro)
app.use((err: any, req: any, res: any, next: any) => {
  // Log seguro (no expone stack traces completos en producción)
  secureLogger.error('Error en servidor', {
    message: err.message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Respuesta segura (no expone información interna)
  const isDevelopment = process.env.NODE_ENV === 'development';
  res.status(err.status || 500).json({
    error: 'Something went wrong!',
    ...(isDevelopment && { 
      message: err.message,
      // Solo en desarrollo: información adicional
    })
  });
});

// Manejo de rutas no encontradas (sin exponer la ruta completa)
app.use((req, res) => {
  secureLogger.warn('Ruta no encontrada', { method: req.method, path: req.path });
  res.status(404).json({
    error: 'Route not found'
  });
});

// Iniciar servidor
app.listen(PORT, async () => {
  secureLogger.info(`🚀 Server running on port ${PORT}`);
  secureLogger.info(`📱 CORS enabled`);
  secureLogger.info(`📡 API endpoints: /api`);
  secureLogger.info(`🔒 Security headers enabled`);
  secureLogger.info(`⏱️ Rate limiting enabled`);
  
  // Inicializar trabajos programados (cron jobs)
  try {
    const { initializeScheduledJobs } = await import("./jobs/bookingScheduler");
    initializeScheduledJobs();
  } catch (error) {
    secureLogger.error("Error inicializando trabajos programados", error);
  }
});