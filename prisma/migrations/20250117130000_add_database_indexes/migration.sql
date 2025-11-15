-- Add indexes to improve query performance

-- DaycareSlot indexes
CREATE INDEX IF NOT EXISTS "DaycareSlot_date_hour_idx" ON "DaycareSlot"("date", "hour");
CREATE INDEX IF NOT EXISTS "DaycareSlot_date_status_idx" ON "DaycareSlot"("date", "status");
CREATE INDEX IF NOT EXISTS "DaycareSlot_openHour_closeHour_idx" ON "DaycareSlot"("openHour", "closeHour");
CREATE INDEX IF NOT EXISTS "DaycareSlot_status_idx" ON "DaycareSlot"("status");

-- DaycareBooking indexes
CREATE INDEX IF NOT EXISTS "DaycareBooking_userId_status_idx" ON "DaycareBooking"("userId", "status");
CREATE INDEX IF NOT EXISTS "DaycareBooking_startTime_endTime_idx" ON "DaycareBooking"("startTime", "endTime");
CREATE INDEX IF NOT EXISTS "DaycareBooking_status_idx" ON "DaycareBooking"("status");
CREATE INDEX IF NOT EXISTS "DaycareBooking_createdAt_idx" ON "DaycareBooking"("createdAt");

-- BirthdaySlot indexes
CREATE INDEX IF NOT EXISTS "BirthdaySlot_date_idx" ON "BirthdaySlot"("date");
CREATE INDEX IF NOT EXISTS "BirthdaySlot_startTime_endTime_idx" ON "BirthdaySlot"("startTime", "endTime");
CREATE INDEX IF NOT EXISTS "BirthdaySlot_status_idx" ON "BirthdaySlot"("status");

-- BirthdayBooking indexes
CREATE INDEX IF NOT EXISTS "BirthdayBooking_status_idx" ON "BirthdayBooking"("status");
CREATE INDEX IF NOT EXISTS "BirthdayBooking_guestEmail_idx" ON "BirthdayBooking"("guestEmail");
CREATE INDEX IF NOT EXISTS "BirthdayBooking_createdAt_idx" ON "BirthdayBooking"("createdAt");

