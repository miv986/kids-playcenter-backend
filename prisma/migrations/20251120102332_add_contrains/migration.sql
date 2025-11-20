-- AlterTable
ALTER TABLE "BirthdayBooking" ADD COLUMN     "originalSlotDate" TIMESTAMP(3),
ADD COLUMN     "originalSlotEndTime" TIMESTAMP(3),
ADD COLUMN     "originalSlotStartTime" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "BirthdayBooking_status_idx" ON "BirthdayBooking"("status");

-- CreateIndex
CREATE INDEX "BirthdayBooking_guestEmail_idx" ON "BirthdayBooking"("guestEmail");

-- CreateIndex
CREATE INDEX "BirthdayBooking_createdAt_idx" ON "BirthdayBooking"("createdAt");

-- CreateIndex
CREATE INDEX "BirthdaySlot_date_idx" ON "BirthdaySlot"("date");

-- CreateIndex
CREATE INDEX "BirthdaySlot_startTime_endTime_idx" ON "BirthdaySlot"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "BirthdaySlot_status_idx" ON "BirthdaySlot"("status");

-- CreateIndex
CREATE INDEX "DaycareBooking_userId_status_idx" ON "DaycareBooking"("userId", "status");

-- CreateIndex
CREATE INDEX "DaycareBooking_startTime_endTime_idx" ON "DaycareBooking"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "DaycareBooking_status_idx" ON "DaycareBooking"("status");

-- CreateIndex
CREATE INDEX "DaycareBooking_createdAt_idx" ON "DaycareBooking"("createdAt");

-- CreateIndex
CREATE INDEX "DaycareSlot_date_hour_idx" ON "DaycareSlot"("date", "hour");

-- CreateIndex
CREATE INDEX "DaycareSlot_date_status_idx" ON "DaycareSlot"("date", "status");

-- CreateIndex
CREATE INDEX "DaycareSlot_openHour_closeHour_idx" ON "DaycareSlot"("openHour", "closeHour");

-- CreateIndex
CREATE INDEX "DaycareSlot_status_idx" ON "DaycareSlot"("status");
