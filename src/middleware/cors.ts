import cors from 'cors';

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://kids-playcenter-web-project-72o0m43vp.vercel.app',
      'https://kids-playcenter-web-project.vercel.app',
      'https://somriuresicolors.es',
      'https://www.somriuresicolors.es'
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET','POST','PUT','DELETE','PATCH'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
};


export const corsMiddleware = cors(corsOptions);