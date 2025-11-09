/**
 * Sistema de logging seguro que no expone información sensible
 */

interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

const LOG_LEVEL: LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

/**
 * Campos sensibles que nunca deben aparecer en logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'apikey',
  'authorization',
  'auth',
  'cookie',
  'creditCard',
  'cvv',
  'ssn',
  'emailVerifyToken',
  'refreshToken',
  'accessToken'
];

/**
 * Sanitiza un objeto eliminando campos sensibles
 */
function sanitizeData(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  const sanitized: any = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Si el campo es sensible, reemplazarlo con [REDACTED]
    if (SENSITIVE_FIELDS.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Logger seguro que no expone información sensible
 */
export const secureLogger = {
  error: (message: string, data?: any) => {
    const sanitized = data ? sanitizeData(data) : undefined;
    console.error(`[ERROR] ${message}`, sanitized || '');
  },

  warn: (message: string, data?: any) => {
    const sanitized = data ? sanitizeData(data) : undefined;
    console.warn(`[WARN] ${message}`, sanitized || '');
  },

  info: (message: string, data?: any) => {
    const sanitized = data ? sanitizeData(data) : undefined;
    console.log(`[INFO] ${message}`, sanitized || '');
  },

  debug: (message: string, data?: any) => {
    if (process.env.NODE_ENV === 'development') {
      const sanitized = data ? sanitizeData(data) : undefined;
      console.log(`[DEBUG] ${message}`, sanitized || '');
    }
  }
};

