import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors';
import apiRoutes from './routes/api';
import authRoutes from './routes/auth';
import apiBookings from './routes/bookings';
import apiBirthdaySlots from './routes/birthdaySlots';
import { PrismaClient } from '@prisma/client';
const client = new PrismaClient();




// Configurar variables de entorno
dotenv.config();

const app = express();

const PORT = process.env.PORT || 4000;

// Middleware
app.use(corsMiddleware);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Rutas
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', apiBookings)
app.use('/api/birthdaySlots', apiBirthdaySlots)

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
    },
  });
});

// Manejo de errores global
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Error:', err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Iniciar servidor
app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 CORS enabled for: http://localhost:3000`);
  console.log(`📡 API endpoints: http://localhost:${PORT}/api`);
});