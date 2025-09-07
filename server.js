import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { corsMiddleware } from './middleware/cors.js';
import healthRoutes from './routes/health.js';
import apiRoutes from './routes/api.js';
import authRoutes from './routes/auth.js';
import apiBookings from './routes/bookings.js';

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
app.use('/health', healthRoutes);
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/bookings', apiBookings)

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    message: 'Express.js Backend with Supabase',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      api: '/api',
      auth: '/api/auth',
      apiBookings: '/api/bookings',
    },
    supabase: {
      url: process.env.SUPABASE_URL ? 'configured' : 'not configured',
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'not configured'
    }
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
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
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 CORS enabled for: http://localhost:3000`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📡 API endpoints: http://localhost:${PORT}/api`);
});