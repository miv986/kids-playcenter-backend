/**
 * Utilidades para sanitizar datos y prevenir filtrado de información
 */

/**
 * Sanitiza un objeto eliminando campos sensibles antes de enviarlo al cliente
 */
export function sanitizeResponse(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponse(item));
  }

  const sanitized: any = {};
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'apiKey',
    'emailVerifyToken',
    'refreshToken',
    'accessToken',
    'jwtSecret',
    'resendApi'
  ];

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    // Omitir campos sensibles
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      continue; // No incluir el campo en la respuesta
    }

    // Sanitizar objetos anidados
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
      sanitized[key] = sanitizeResponse(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Sanitiza un string para prevenir XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') {
    return input;
  }
  
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

/**
 * Valida y sanitiza un email
 */
export function sanitizeEmail(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const sanitized = email.trim().toLowerCase();
  
  if (!emailRegex.test(sanitized)) {
    return null;
  }
  
  // Limitar longitud
  if (sanitized.length > 254) {
    return null;
  }
  
  return sanitized;
}

/**
 * Valida y sanitiza un número de teléfono
 */
export function sanitizePhone(phone: string): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  
  // Eliminar caracteres no numéricos excepto +, espacios y guiones
  const sanitized = phone.replace(/[^\d+\s-]/g, '').trim();
  
  if (sanitized.length < 9 || sanitized.length > 20) {
    return null;
  }
  
  return sanitized;
}

