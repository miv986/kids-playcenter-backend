import cors from 'cors';

const corsOptions = {
  origin: [
    'http://localhost:3000',
    'https://kids-playcenter-web-project-lve7r3ojw.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};

export const corsMiddleware = cors(corsOptions);