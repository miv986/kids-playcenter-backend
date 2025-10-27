/*
  Warnings:

  - Changed the type of `closeHour` on the `DaycareSlot` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `openHour` on the `DaycareSlot` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "DaycareSlot" DROP COLUMN "closeHour",
ADD COLUMN     "closeHour" TIMESTAMP(3) NOT NULL,
DROP COLUMN "openHour",
ADD COLUMN     "openHour" TIMESTAMP(3) NOT NULL;
