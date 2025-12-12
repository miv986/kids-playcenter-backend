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
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import apiBookings from './routes/bookings';
import apiBirthdaySlots from './routes/birthdaySlots';
import apiDaycareSlots from './routes/daycareSlots';
import apiDaycareBookings from './routes/daycareBookings';
import apiMeetingSlots from './routes/meetingSlots';
import apiMeetingBookings from './routes/meetingBookings';
import apiPackages from './routes/packages';

const app = express();

const PORT = process.env.PORT || 4000;

// CORS
app.use(corsMiddleware);

// Body parser
app.use(cookieParser());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Rutas
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', apiBookings)
app.use('/api/birthdaySlots', apiBirthdaySlots)
app.use('/api/daycareSlots', apiDaycareSlots)
app.use('/api/daycareBookings', apiDaycareBookings)
app.use('/api/meetingSlots', apiMeetingSlots)
app.use('/api/meetingBookings', apiMeetingBookings)
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

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found'
  });
});

/**
 * Función para arrancar el servidor
 */
export async function startServer() {
  const PORT = process.env.PORT || 4000;

  app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);

    // Inicializar trabajos programados (cron jobs)
    try {
      const { initializeScheduledJobs } = await import('./jobs/bookingScheduler');
      initializeScheduledJobs();
    } catch (error) {
      console.error('Error inicializando trabajos programados', error);
    }
  });
}

export default app;