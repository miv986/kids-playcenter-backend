/*
  Warnings:

  - Made the column `nameCa` on table `BirthdayPackage` required. This step will fail if there are existing NULL values in that column.
  - Made the column `nameEs` on table `BirthdayPackage` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "BirthdayPackage" ALTER COLUMN "nameCa" SET NOT NULL,
ALTER COLUMN "nameEs" SET NOT NULL;
