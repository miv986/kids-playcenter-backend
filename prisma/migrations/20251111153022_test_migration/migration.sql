/*
  Warnings:

  - You are about to drop the column `features` on the `BirthdayPackage` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BirthdayBooking" ALTER COLUMN "packageType" DROP NOT NULL,
ALTER COLUMN "slotId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "BirthdayPackage" DROP COLUMN "features",
ADD COLUMN     "featuresEs" TEXT[],
ADD COLUMN     "featuresVa" TEXT[],
ADD COLUMN     "perChildTextEs" TEXT,
ADD COLUMN     "perChildTextVa" TEXT;
