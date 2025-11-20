/*
  Warnings:

  - You are about to drop the column `originalSlotDate` on the `BirthdayBooking` table. All the data in the column will be lost.
  - You are about to drop the column `originalSlotEndTime` on the `BirthdayBooking` table. All the data in the column will be lost.
  - You are about to drop the column `originalSlotStartTime` on the `BirthdayBooking` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BirthdayBooking" DROP COLUMN "originalSlotDate",
DROP COLUMN "originalSlotEndTime",
DROP COLUMN "originalSlotStartTime";
