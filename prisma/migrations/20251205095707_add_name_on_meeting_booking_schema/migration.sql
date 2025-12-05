/*
  Warnings:

  - Added the required column `name` to the `MeetingBooking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MeetingBooking" ADD COLUMN     "name" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "MeetingBooking_name_idx" ON "MeetingBooking"("name");
