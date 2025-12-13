-- AlterEnum
ALTER TYPE "Package" ADD VALUE 'OTRO';

-- AlterTable
ALTER TABLE "BirthdayPackage" ALTER COLUMN "price" DROP NOT NULL,
ALTER COLUMN "priceValue" DROP NOT NULL;
