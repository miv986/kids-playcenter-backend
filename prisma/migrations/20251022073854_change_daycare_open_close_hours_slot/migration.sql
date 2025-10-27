/*
  Warnings:

  - Added the required column `closeHour` to the `DaycareSlot` table without a default value. This is not possible if the table is not empty.
  - Added the required column `openHour` to the `DaycareSlot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DaycareSlot" ADD COLUMN     "closeHour" INTEGER NOT NULL,
ADD COLUMN     "openHour" INTEGER NOT NULL;
