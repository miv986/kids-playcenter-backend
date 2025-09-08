import cors from 'cors';

const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://kids-playcenter-web-project-72o0m43vp.vercel.app',
    'https://kids-playcenter-web-project.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

export const corsMiddleware = cors(corsOptions);