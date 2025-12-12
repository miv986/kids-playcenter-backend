import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/**
 * Configuración de Helmet para headers de seguridad
 */
export const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://kids-playcenter-web-project-72o0m43vp.vercel.app", "https://somriuresicolors.es"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Permitir recursos externos si es necesario
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
});

/**
 * Rate limiting para autenticación (login, register, refresh)
 * Previene ataques de fuerza bruta
 */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 15, // Máximo 15 intentos por IP
    message: {
        error: 'Demasiados intentos. Por favor, intenta de nuevo en 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // En desarrollo, permitir más intentos
        return process.env.NODE_ENV === 'development';
    }
});

/**
 * Rate limiting general para todas las rutas
 */
export const generalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // Máximo 300 requests por IP
    message: {
        error: 'Demasiadas peticiones. Por favor, intenta de nuevo más tarde.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        return process.env.NODE_ENV === 'development';
    }
});

/**
 * Rate limiting estricto para operaciones sensibles (crear, actualizar, eliminar)
 */
export const strictRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Máximo 100 operaciones por IP
    message: {
        error: 'Demasiadas operaciones. Por favor, intenta de nuevo en 15 minutos.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

