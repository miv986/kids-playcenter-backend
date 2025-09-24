/*
  Warnings:

  - You are about to drop the column `guestId` on the `BirthdayBooking` table. All the data in the column will be lost.
  - Added the required column `guestEmail` to the `BirthdayBooking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BirthdayBooking" DROP COLUMN "guestId",
ADD COLUMN     "guestEmail" TEXT NOT NULL;
