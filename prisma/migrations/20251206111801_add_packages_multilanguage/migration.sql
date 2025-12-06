/*
  Warnings:

  - You are about to drop the column `duration` on the `BirthdayPackage` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `BirthdayPackage` table. All the data in the column will be lost.
  - Added the required column `nameCa` to the `BirthdayPackage` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nameEs` to the `BirthdayPackage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BirthdayPackage" DROP COLUMN "duration",
DROP COLUMN "name",
ADD COLUMN     "durationCa" TEXT,
ADD COLUMN     "durationEs" TEXT,
ADD COLUMN     "nameCa" TEXT NOT NULL,
ADD COLUMN     "nameEs" TEXT NOT NULL;
