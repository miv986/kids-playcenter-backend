import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Crear los 3 packs de cumpleaños por defecto
  const packages = [
    {
      name: 'Pack Alegría',
      type: 'ALEGRIA' as const,
      duration: '2 horas',
      price: '15€',
      priceValue: 15,
      features: [
        'Acceso a zona de juegos',
        'Actividades supervisadas',
        'Material incluido',
        'Merienda saludable'
      ],
      isPopular: false,
      isActive: true,
    },
    {
      name: 'Pack Fiesta',
      type: 'FIESTA' as const,
      duration: '3 horas',
      price: '25€',
      priceValue: 25,
      features: [
        'Todo lo del Pack Alegría',
        'Animación especializada',
        'Taller de manualidades',
        'Decoración temática',
        'Fotografías del evento'
      ],
      isPopular: true,
      isActive: true,
    },
    {
      name: 'Pack Especial',
      type: 'ESPECIAL' as const,
      duration: '4 horas',
      price: '35€',
      priceValue: 35,
      features: [
        'Todo lo del Pack Fiesta',
        'Espectáculo de magia',
        'Tarta personalizada',
        'Regalos sorpresa',
        'Servicio de limpieza',
        'Coordinador personal'
      ],
      isPopular: false,
      isActive: true,
    },
  ];

  for (const pkg of packages) {
    await prisma.birthdayPackage.upsert({
      where: { type: pkg.type },
      update: pkg,
      create: pkg,
    });
  }

  console.log('✅ Packs de cumpleaños creados exitosamente');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

