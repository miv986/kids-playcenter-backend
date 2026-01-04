/**
 * Utilidades para manejo consistente de fechas
 * Estandariza el uso de timezone (hora local Europe/Madrid)
 */

/**
 * Obtiene la fecha/hora actual en hora local
 */
export function getNow(): Date {
  return new Date();
}

/**
 * Crea una fecha de inicio de día (00:00:00) en hora local
 * @param date - Fecha base (opcional, por defecto hoy)
 */
export function getStartOfDay(date?: Date): Date {
  const d = date || new Date();
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Crea una fecha de fin de día (23:59:59.999) en hora local
 * @param date - Fecha base (opcional, por defecto hoy)
 */
export function getEndOfDay(date?: Date): Date {
  const d = date || new Date();
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Crea una fecha desde un string YYYY-MM-DD en hora local
 * @param dateString - String en formato YYYY-MM-DD
 */
export function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0);
}

/**
 * Crea un rango de fechas (inicio y fin de día) desde un string YYYY-MM-DD en hora local
 * @param dateString - String en formato YYYY-MM-DD
 */
export function getDateRange(dateString: string): { start: Date; end: Date } {
  const date = parseDateString(dateString);
  return {
    start: getStartOfDay(date),
    end: getEndOfDay(date)
  };
}

/**
 * Verifica si una fecha es pasada (solo comparando día, sin hora)
 * @param date - Fecha a verificar
 */
export function isPastDate(date: Date): boolean {
  const today = getStartOfDay();
  const checkDate = getStartOfDay(date);
  return checkDate < today;
}

/**
 * Verifica si una fecha es hoy (solo comparando día, sin hora)
 * @param date - Fecha a verificar
 */
export function isToday(date: Date): boolean {
  const today = getStartOfDay();
  const checkDate = getStartOfDay(date);
  return checkDate.getTime() === today.getTime();
}

/**
 * Verifica si una fecha/hora es pasada (incluyendo hora)
 * @param dateTime - Fecha/hora a verificar
 */
export function isPastDateTime(dateTime: Date): boolean {
  const now = getNow();
  return dateTime < now;
}

/**
 * Valida que una fecha no sea pasada (solo día)
 * Lanza error si la fecha es pasada
 * @param date - Fecha a validar
 * @param errorMessage - Mensaje de error personalizado
 */
export function validateNotPastDate(date: Date, errorMessage?: string): void {
  if (isPastDate(date)) {
    throw new Error(errorMessage || "No se pueden usar fechas pasadas.");
  }
}

/**
 * Valida que una fecha/hora no sea pasada (incluyendo hora)
 * Lanza error si la fecha/hora es pasada
 * @param dateTime - Fecha/hora a validar
 * @param errorMessage - Mensaje de error personalizado
 */
export function validateNotPastDateTime(dateTime: Date, errorMessage?: string): void {
  if (isPastDateTime(dateTime)) {
    throw new Error(errorMessage || "No se pueden usar fechas/horas pasadas.");
  }
}

/**
 * Valida que una fecha no sea pasada si es hoy y la hora es pasada
 * @param date - Fecha a validar
 * @param dateTime - Fecha/hora a validar (para comparar hora)
 * @param errorMessage - Mensaje de error personalizado
 */
export function validateNotPastTodayDateTime(date: Date, dateTime: Date, errorMessage?: string): void {
  if (isToday(date) && isPastDateTime(dateTime)) {
    throw new Error(errorMessage || "No se pueden usar horarios pasados para hoy.");
  }
}

/**
 * Extrae la hora local de una fecha de manera consistente
 * @param date - Fecha de la cual extraer la hora
 * @returns Hora en formato local (0-23)
 */
export function getLocalHour(date: Date): number {
  return date.getHours();
}

/**
 * Extrae la fecha local como string YYYY-MM-DD de manera consistente
 * @param date - Fecha de la cual extraer la fecha
 * @returns String en formato YYYY-MM-DD
 */
export function getLocalDateString(date: Date): string {
  const localYear = date.getFullYear();
  const localMonth = date.getMonth() + 1;
  const localDay = date.getDate();
  return `${localYear}-${String(localMonth).padStart(2, '0')}-${String(localDay).padStart(2, '0')}`;
}

/**
 * Parsea una fecha ISO string interpretándola como fecha local
 * Si viene con 'Z' (UTC), extrae los componentes UTC y crea un Date local con esos componentes
 * Esto asegura que se guarde la hora correcta independientemente de la zona horaria del servidor
 * @param isoString - String ISO (ej: "2026-01-05T08:00:00.000Z" que representa 09:00 hora local)
 * @returns Date object con la hora local correcta
 */
export function parseISODateAsLocal(isoString: string): Date {
  // Si el string tiene 'Z', es UTC - extraer componentes UTC y crear Date local
  if (isoString.endsWith('Z')) {
    const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/);
    if (match) {
      const [, year, month, day, hour, minute, second, millisecond] = match;
      // Crear Date UTC primero
      const utcDate = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second),
        millisecond ? parseInt(millisecond.padEnd(3, '0')) : 0
      ));
      // Extraer componentes locales del Date UTC convertido
      return new Date(
        utcDate.getFullYear(),
        utcDate.getMonth(),
        utcDate.getDate(),
        utcDate.getHours(),
        utcDate.getMinutes(),
        utcDate.getSeconds(),
        utcDate.getMilliseconds()
      );
    }
  }
  
  // Si tiene timezone offset, usar new Date() que lo maneja automáticamente
  if (/[+-]\d{2}:\d{2}$/.test(isoString)) {
    return new Date(isoString);
  }
  
  // Si no tiene 'Z' ni offset, interpretar como hora local directamente
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) {
    return new Date(isoString);
  }
  
  const [, year, month, day, hour, minute, second, millisecond] = match;
  // Crear fecha local directamente
  return new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second),
    millisecond ? parseInt(millisecond.padEnd(3, '0')) : 0
  );
}

/**
 * Formatea una fecha como ISO string local (sin Z, sin conversión UTC)
 * Usa el mismo método que los slots: usar getHours() directamente del Date object
 * Cuando Prisma devuelve un Date, JavaScript ya convierte el timestamp UTC a hora local
 * @param date - Fecha a formatear (viene de Prisma como Date object)
 * @returns String ISO en formato local (ej: "2026-01-05T10:00:00.000")
 */
export function formatDateAsLocalISO(date: Date): string {
  // Usar el mismo método que los slots: getHours() directamente del Date object
  // JavaScript convierte automáticamente el timestamp UTC de Prisma a hora local del sistema
  const localDate = date instanceof Date ? date : new Date(date);
  
  // Extraer componentes locales directamente (igual que los slots hacen con getHours())
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  const hours = String(localDate.getHours()).padStart(2, '0');
  const minutes = String(localDate.getMinutes()).padStart(2, '0');
  const seconds = String(localDate.getSeconds()).padStart(2, '0');
  const milliseconds = String(localDate.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

