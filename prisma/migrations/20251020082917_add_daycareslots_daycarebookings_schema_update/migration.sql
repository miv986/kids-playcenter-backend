/*
  Warnings:

  - You are about to drop the column `closeHour` on the `DaycareSlot` table. All the data in the column will be lost.
  - You are about to drop the column `openHour` on the `DaycareSlot` table. All the data in the column will be lost.
  - Added the required column `hour` to the `DaycareSlot` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "DaycareSlot" DROP COLUMN "closeHour",
DROP COLUMN "openHour",
ADD COLUMN     "hour" INTEGER NOT NULL;
