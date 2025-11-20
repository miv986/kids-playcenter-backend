-- Add constraint to prevent availableSpots from exceeding capacity
-- This ensures data integrity at the database level

-- First, fix any existing values where availableSpots > capacity (set to capacity)
UPDATE "DaycareSlot" 
SET "availableSpots" = "capacity" 
WHERE "availableSpots" > "capacity";

-- Add constraint to prevent future values where availableSpots > capacity
ALTER TABLE "DaycareSlot" 
ADD CONSTRAINT "availableSpots_not_exceed_capacity" 
CHECK ("availableSpots" <= "capacity");

