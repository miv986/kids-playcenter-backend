# Sistema de Cierre Automático de Reservas

## Descripción
Sistema automatizado que cierra reservas pasadas y envía notificaciones por email a los usuarios.

## Configuración

### 1. Variables de Entorno

Añade al archivo `.env`:

```env
# Token secreto para ejecución automática (opcional, solo si usas endpoint externo)
CRON_SECRET_TOKEN=tu_token_secreto_muy_seguro_aqui

# Configuración de email (ya debería estar configurado)
RESEND_API=tu_api_key_de_resend
```

### 2. Instalación

Las dependencias ya están instaladas:
- `node-cron`: Para programar tareas automáticas
- `@types/node-cron`: Tipos TypeScript

## Funcionamiento

### Automatización Interna (Recomendado)

El sistema se ejecuta automáticamente cada día a las **2:00 AM (hora de Madrid)** usando `node-cron`.

- **Frecuencia**: Diaria a las 2:00 AM
- **Zona horaria**: Europe/Madrid
- **Acción**: 
  1. Busca reservas con `endTime` pasado
  2. Marca como `CLOSED` las que no estén ya cerradas o canceladas
  3. Envía email de notificación a cada usuario (si tiene email)

### Cambiar Frecuencia

Para ejecutar cada hora en lugar de diario, edita `src/jobs/bookingScheduler.ts`:

```typescript
// Descomentar esta sección y comentar la diaria
cron.schedule("0 * * * *", async () => {
    // ... código ...
}, {
    scheduled: true,
    timezone: "Europe/Madrid"
});
```

**Patrones de cron:**
- `"0 2 * * *"` = Cada día a las 2:00 AM
- `"0 * * * *"` = Cada hora
- `"0 */6 * * *"` = Cada 6 horas
- `"0 0 * * 0"` = Cada domingo a medianoche

## Endpoints

### 1. Ejecución Manual (Admin)
```
POST /api/daycareBookings/close-past-bookings
Headers: Authorization: Bearer <token>
```

Solo disponible para administradores. Útil para ejecutar manualmente desde el panel de admin.

### 2. Ejecución Automática Externa (Opcional)
```
POST /api/daycareBookings/close-past-bookings-auto
Headers: x-cron-secret: <CRON_SECRET_TOKEN>
```

Útil si prefieres usar un servicio externo (como cron de servidor o GitHub Actions) en lugar del scheduler interno.

## Notificaciones por Email

### Contenido del Email

El email incluye:
- Saludo personalizado con el nombre del usuario
- Detalles de la reserva (fecha, horario, niños)
- Mensaje de agradecimiento
- Diseño responsive y profesional

### Usuarios sin Email

Si un usuario no tiene email registrado:
- La reserva se cierra igualmente
- Se registra en los logs: `⚠️ Usuario [nombre] no tiene email`
- No se envía notificación

## Logs

El sistema registra:
- ✅ Reservas cerradas exitosamente
- ✅ Emails enviados
- ⚠️ Usuarios sin email
- ❌ Errores en el proceso

Ejemplo de log:
```
📦 Encontradas 3 reserva(s) pasada(s) para cerrar.
✅ Notificación enviada a usuario@email.com para reserva #123
✅ Notificación enviada a otro@email.com para reserva #124
⚠️ Usuario Juan Pérez no tiene email, no se envió notificación para reserva #125
✅ Proceso completado: 3 reserva(s) cerrada(s), 2 notificación(es) enviada(s).
```

## Verificación

Para verificar que funciona:

1. **Revisar logs del servidor** al iniciar:
   ```
   ⏰ Inicializando trabajos programados...
   ✅ Trabajos programados inicializados:
      - Cierre automático de reservas: Diario a las 2:00 AM (Europe/Madrid)
   ```

2. **Ejecutar manualmente** (como admin):
   ```bash
   POST /api/daycareBookings/close-past-bookings
   ```

3. **Revisar emails** en la bandeja de entrada de los usuarios

## Troubleshooting

### El scheduler no se ejecuta
- Verifica que el servidor esté corriendo
- Revisa los logs del servidor
- Verifica la zona horaria en `bookingScheduler.ts`

### Los emails no se envían
- Verifica `RESEND_API` en `.env`
- Revisa los logs para errores específicos
- Verifica que los usuarios tengan email registrado

### Error: "Cannot find module 'node-cron'"
- Ejecuta: `npm install node-cron @types/node-cron`

## Personalización

### Cambiar horario de ejecución
Edita `src/jobs/bookingScheduler.ts` línea 13:
```typescript
cron.schedule("0 2 * * *", ...) // Cambiar "0 2" por la hora deseada
```

### Cambiar zona horaria
Edita `src/jobs/bookingScheduler.ts` línea 23:
```typescript
timezone: "Europe/Madrid" // Cambiar por tu zona horaria
```

### Personalizar template de email
Edita `src/services/closeBookingsService.ts` línea 54-90

