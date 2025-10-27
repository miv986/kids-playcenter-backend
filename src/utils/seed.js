"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Crear los 3 packs de cumpleaños por defecto
        const packages = [
            {
                name: 'Pack Alegría',
                type: 'ALEGRIA',
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
                type: 'FIESTA',
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
                type: 'ESPECIAL',
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
            yield prisma.birthdayPackage.upsert({
                where: { type: pkg.type },
                update: pkg,
                create: pkg,
            });
        }
        console.log('✅ Packs de cumpleaños creados exitosamente');
    });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.$disconnect();
}));
