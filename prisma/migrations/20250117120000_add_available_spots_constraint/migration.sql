-- Add constraint to prevent negative availableSpots
-- This ensures data integrity at the database level

-- First, fix any existing negative values (set to 0)
UPDATE "DaycareSlot" SET "availableSpots" = 0 WHERE "availableSpots" < 0;

-- Add constraint to prevent future negative values
ALTER TABLE "DaycareSlot" 
ADD CONSTRAINT "availableSpots_non_negative" 
CHECK ("availableSpots" >= 0);

