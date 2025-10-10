-- DropForeignKey
ALTER TABLE "BirthdayBooking" DROP CONSTRAINT "BirthdayBooking_slotId_fkey";

-- AddForeignKey
ALTER TABLE "BirthdayBooking" ADD CONSTRAINT "BirthdayBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BirthdaySlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
