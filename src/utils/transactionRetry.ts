/**
 * Utility function to execute Prisma transactions with automatic retry on serialization conflicts
 * Uses exponential backoff for retries
 * 
 * Logs retry attempts and final failures for monitoring
 */

export async function executeWithRetry<T>(
    transactionFn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 100
): Promise<T> {
    let lastError: any;
    const startTime = Date.now();
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await transactionFn();
            const duration = Date.now() - startTime;
            
            // Log successful transaction (only in development or if it took multiple retries)
            if (attempt > 0 && process.env.NODE_ENV === 'development') {
                console.log(`[TRANSACTION] Completada después de ${attempt + 1} intento(s) en ${duration}ms`);
            }
            
            return result;
        } catch (err: any) {
            lastError = err;
            
            // Solo reintentar en conflictos de serialización (P2034)
            if (err.code === 'P2034' && attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt); // Backoff exponencial: 100ms, 200ms, 400ms
                
                // Log retry attempt
                if (process.env.NODE_ENV === 'development') {
                    console.warn(`[RETRY] Intento ${attempt + 1}/${maxRetries} falló con P2034 (conflicto de serialización). Reintentando en ${delay}ms...`);
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            
            // Log final failure
            const duration = Date.now() - startTime;
            if (process.env.NODE_ENV === 'development') {
                console.error(`[TRANSACTION] Falló después de ${attempt + 1} intento(s) en ${duration}ms. Error:`, err.code || err.message);
            }
            
            // Si no es P2034 o es el último intento, lanzar el error
            throw err;
        }
    }
    
    throw lastError;
}
