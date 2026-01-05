/**
 * ========================================================================
 * SISTEMA UNIFICADO DE MANEJO DE FECHAS Y TIMEZONES
 * ========================================================================
 * 
 * PRINCIPIOS:
 * 1. La BD guarda timestamps como "timestamp without time zone" (DateTime en Prisma)
 * 2. Internamente, Prisma/PostgreSQL almacena todo en UTC
 * 3. Europe/Madrid es la zona horaria de referencia del negocio
 * 4. NUNCA hacer ajustes manuales de +1h/-1h
 * 
 * FLUJO:
 * - INPUT (API): String → parseToMadridDate() → Date object → BD
 * - BD: timestamp UTC (invisible para nosotros)
 * - OUTPUT (API): Date object de Prisma → formatForAPI() → String ISO sin Z
 * - EMAILS: Date object de Prisma → formatForEmail() → String legible
 * 
 * ========================================================================
 */

const MADRID_TIMEZONE = 'Europe/Madrid';

/**
 * Convierte una fecha del sistema (con timezone del servidor) a Date que representa
 * la misma hora "wall clock" en Madrid
 * 
 * Ejemplo: Si el servidor está en UTC y recibe "2026-01-05T09:00:00"
 * queremos que se guarde como "09:00 hora de Madrid" en la BD
 * 
 * @param dateInput - Date object del sistema o string ISO
 * @returns Date object ajustado a timezone de Madrid
 */
export function toMadridDate(dateInput: Date | string): Date {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    // Obtener la representación en Madrid
    const madridString = date.toLocaleString('en-US', { 
        timeZone: MADRID_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    // Parse: "01/05/2026, 09:00:00" → componentes
    const match = madridString.match(/(\d{2})\/(\d{2})\/(\d{4}), (\d{2}):(\d{2}):(\d{2})/);
    if (!match) {
        throw new Error(`Error parsing date to Madrid timezone: ${madridString}`);
    }
    
    const [, month, day, year, hour, minute, second] = match;
    
    // Crear Date object en timezone local del servidor con los componentes de Madrid
    // Esto asegura que cuando se guarde en BD, represente la hora correcta de Madrid
    return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
    );
}

/**
 * Parsea un string de fecha/hora (de la API) interpretándolo como hora de Madrid
 * 
 * Casos:
 * - "2026-01-05T09:00:00" → 09:00 Madrid
 * - "2026-01-05T09:00:00Z" → Se interpreta como UTC, se convierte a Madrid
 * - "2026-01-05T09:00:00+01:00" → Se respeta el offset
 * - "2026-01-05" → 00:00 Madrid
 * 
 * @param dateString - String de fecha en cualquier formato ISO
 * @returns Date object listo para guardar en BD
 */
export function parseToMadridDate(dateString: string): Date {
    // Si ya tiene timezone info (Z o +/-HH:mm), usar new Date() que lo maneja bien
    if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
        return new Date(dateString);
    }
    
    // Si es solo fecha (YYYY-MM-DD), agregar hora 00:00
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        dateString = `${dateString}T00:00:00`;
    }
    
    // Parsear componentes del string ISO local
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/);
    if (!match) {
        throw new Error(`Invalid date string format: ${dateString}`);
    }
    
    const [, year, month, day, hour, minute, second, millisecond] = match;
    
    // Crear un Date object "naive" con esos componentes
    const naiveDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
        millisecond ? parseInt(millisecond.padEnd(3, '0')) : 0
    );
    
    // Convertir a Madrid timezone
    return toMadridDate(naiveDate);
}

/**
 * Formatea un Date object de Prisma para enviar a la API
 * 
 * Prisma devuelve Date objects que JavaScript interpreta según el timezone del servidor
 * Necesitamos formatear explícitamente en timezone de Madrid
 * 
 * @param date - Date object de Prisma
 * @returns String ISO sin Z (formato local): "2026-01-05T09:00:00.000"
 */
export function formatForAPI(date: Date): string {
    // Obtener componentes en timezone de Madrid
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: MADRID_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
    
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find(p => p.type === type)?.value || '00';
    
    // Obtener milisegundos manualmente (no está disponible en formatToParts)
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${ms}`;
}

/**
 * Formatea un Date object para mostrar en emails (legible para humanos)
 * 
 * @param date - Date object de Prisma
 * @param locale - 'es' o 'ca'
 * @returns String formateado: "lunes, 5 de enero de 2026"
 */
export function formatDateForEmail(date: Date, locale: 'es' | 'ca' = 'es'): string {
    const localeCode = locale === 'ca' ? 'ca-ES' : 'es-ES';
    
    return date.toLocaleDateString(localeCode, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: MADRID_TIMEZONE
    });
}

/**
 * Formatea una hora para mostrar en emails
 * 
 * @param date - Date object de Prisma
 * @returns String formateado: "09:00 (CET)" o "09:00 (CEST)"
 */
export function formatTimeForEmail(date: Date): string {
    const formatter = new Intl.DateTimeFormat('es-ES', {
        timeZone: MADRID_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZoneName: 'short'
    });
    
    return formatter.format(date);
}

/**
 * Obtiene el inicio del día (00:00:00.000) en timezone de Madrid
 * 
 * @param date - Date opcional (default: hoy)
 * @returns Date object representando 00:00 en Madrid
 */
export function getStartOfDayMadrid(date?: Date): Date {
    const d = date || new Date();
    
    // Obtener fecha en Madrid
    const madridString = d.toLocaleString('en-US', { 
        timeZone: MADRID_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: false
    });
    
    const match = madridString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) throw new Error('Error parsing date');
    
    const [, month, day, year] = match;
    
    // Crear Date a las 00:00 en timezone local del servidor
    return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        0, 0, 0, 0
    );
}

/**
 * Obtiene el fin del día (23:59:59.999) en timezone de Madrid
 * 
 * @param date - Date opcional (default: hoy)
 * @returns Date object representando 23:59:59.999 en Madrid
 */
export function getEndOfDayMadrid(date?: Date): Date {
    const d = date || new Date();
    
    // Obtener fecha en Madrid
    const madridString = d.toLocaleString('en-US', { 
        timeZone: MADRID_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour12: false
    });
    
    const match = madridString.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) throw new Error('Error parsing date');
    
    const [, month, day, year] = match;
    
    // Crear Date a las 23:59:59.999 en timezone local del servidor
    return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        23, 59, 59, 999
    );
}

/**
 * Verifica si una fecha/hora ya pasó (en timezone de Madrid)
 * 
 * @param date - Date object a verificar
 * @returns true si la fecha ya pasó
 */
export function isPastMadrid(date: Date): boolean {
    const now = new Date();
    
    // Comparar timestamps directamente (ambos en UTC internamente)
    return date.getTime() < now.getTime();
}

/**
 * Verifica si una fecha es hoy (en timezone de Madrid)
 * 
 * @param date - Date object a verificar
 * @returns true si es hoy
 */
export function isTodayMadrid(date: Date): boolean {
    const todayStart = getStartOfDayMadrid();
    const todayEnd = getEndOfDayMadrid();
    const timestamp = date.getTime();
    
    return timestamp >= todayStart.getTime() && timestamp <= todayEnd.getTime();
}

/**
 * Crea un rango de fechas para un día específico (00:00 - 23:59:59.999) en Madrid
 * 
 * @param dateString - String YYYY-MM-DD
 * @returns Objeto con start y end Date objects
 */
export function getDateRangeMadrid(dateString: string): { start: Date; end: Date } {
    const date = parseToMadridDate(dateString);
    return {
        start: getStartOfDayMadrid(date),
        end: getEndOfDayMadrid(date)
    };
}

/**
 * Formatea una fecha como string YYYY-MM-DD en timezone de Madrid
 * 
 * @param date - Date object
 * @returns String "YYYY-MM-DD"
 */
export function formatDateOnlyMadrid(date: Date): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: MADRID_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    return formatter.format(date);
}

/**
 * Extrae solo la hora (0-23) en timezone de Madrid
 * 
 * @param date - Date object
 * @returns Número de hora (0-23)
 */
export function getHourMadrid(date: Date): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: MADRID_TIMEZONE,
        hour: '2-digit',
        hour12: false
    });
    
    return parseInt(formatter.format(date));
}

