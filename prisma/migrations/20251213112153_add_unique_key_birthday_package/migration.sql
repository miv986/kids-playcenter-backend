/*
  Warnings:

  - A unique constraint covering the columns `[type]` on the table `BirthdayPackage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "BirthdayPackage_type_key" ON "BirthdayPackage"("type");
