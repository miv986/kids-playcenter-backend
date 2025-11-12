/**
 * Valida que todas las variables de entorno críticas estén configuradas
 * Se ejecuta al iniciar el servidor para evitar errores en runtime
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const requiredEnvVars: EnvVar[] = [
  {
    name: 'DATABASE_URL',
    required: true,
    description: 'URL de conexión a PostgreSQL (Prisma)'
  },
  {
    name: 'JWT_SECRET',
    required: true,
    description: 'Secreto para firmar tokens JWT de acceso'
  },
  {
    name: 'JWT_REFRESH_SECRET',
    required: true,
    description: 'Secreto para firmar tokens JWT de refresco'
  },
  {
    name: 'RESEND_API',
    required: true,
    description: 'API key de Resend para envío de emails'
  },
  {
    name: 'FROM_EMAIL',
    required: true,
    description: 'Email del remitente para emails automáticos'
  }
];

const optionalEnvVars: EnvVar[] = [
  {
    name: 'PORT',
    required: false,
    description: 'Puerto del servidor (default: 4000)'
  },
  {
    name: 'NODE_ENV',
    required: false,
    description: 'Entorno de ejecución (development/production)'
  },
  {
    name: 'BACKEND_URL',
    required: false,
    description: 'URL del backend para enlaces de verificación'
  },
  {
    name: 'FRONTEND_URL',
    required: false,
    description: 'URL del frontend para enlaces en emails'
  },
  {
    name: 'FROM_NAME',
    required: false,
    description: 'Nombre del remitente para emails'
  },
  {
    name: 'CRON_SECRET_TOKEN',
    required: false,
    description: 'Token secreto para endpoint de cron externo (opcional)'
  }
];

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Validar variables requeridas
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar.name]) {
      missing.push(`${envVar.name}: ${envVar.description}`);
    }
  }

  // Mostrar advertencias para variables opcionales importantes solo en producción
  const importantOptional = ['FRONTEND_URL', 'FROM_NAME'];
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    for (const envVar of optionalEnvVars) {
      if (!process.env[envVar.name] && importantOptional.includes(envVar.name)) {
        warnings.push(`${envVar.name}: ${envVar.description} (recomendado)`);
      }
    }
  }

  // Si faltan variables críticas, lanzar error
  if (missing.length > 0) {
    console.error('\n❌ ERROR: Variables de entorno faltantes:\n');
    missing.forEach((msg) => console.error(`   - ${msg}`));
    console.error('\n💡 Asegúrate de configurar estas variables en tu archivo .env\n');
    process.exit(1);
  }

  // Mostrar advertencias si hay variables opcionales importantes faltantes
  if (warnings.length > 0) {
    console.warn('\n⚠️  ADVERTENCIA: Variables de entorno recomendadas no configuradas:\n');
    warnings.forEach((msg) => console.warn(`   - ${msg}`));
    console.warn('');
  }

  // Validar formato de algunas variables
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  ADVERTENCIA: JWT_SECRET debería tener al menos 32 caracteres para mayor seguridad');
  }

  if (process.env.JWT_REFRESH_SECRET && process.env.JWT_REFRESH_SECRET.length < 32) {
    console.warn('⚠️  ADVERTENCIA: JWT_REFRESH_SECRET debería tener al menos 32 caracteres para mayor seguridad');
  }

  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.startsWith('postgresql://')) {
    console.warn('⚠️  ADVERTENCIA: DATABASE_URL no parece ser una URL de PostgreSQL válida');
  }

  console.log('✅ Variables de entorno validadas correctamente\n');
}

