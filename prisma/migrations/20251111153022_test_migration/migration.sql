/*
  Warnings:

  - You are about to drop the column `features` on the `BirthdayPackage` table. All the data in the column will be lost.

*/
-- AlterTable (safe: only if columns are NOT NULL)
DO $$ 
BEGIN
    -- Make packageType and slotId nullable if they are NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'BirthdayBooking' 
        AND column_name = 'packageType' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE "BirthdayBooking" ALTER COLUMN "packageType" DROP NOT NULL;
    END IF;
    
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'BirthdayBooking' 
        AND column_name = 'slotId' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE "BirthdayBooking" ALTER COLUMN "slotId" DROP NOT NULL;
    END IF;
END $$;

-- AlterTable (safe: only drop features if it exists)
DO $$ 
BEGIN
    -- Drop features column only if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'BirthdayPackage' 
        AND column_name = 'features'
    ) THEN
        ALTER TABLE "BirthdayPackage" DROP COLUMN "features";
    END IF;
    
    -- Add new columns only if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'BirthdayPackage' 
        AND column_name = 'featuresEs'
    ) THEN
        ALTER TABLE "BirthdayPackage" ADD COLUMN "featuresEs" TEXT[];
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'BirthdayPackage' 
        AND column_name = 'featuresVa'
    ) THEN
        ALTER TABLE "BirthdayPackage" ADD COLUMN "featuresVa" TEXT[];
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'BirthdayPackage' 
        AND column_name = 'perChildTextEs'
    ) THEN
        ALTER TABLE "BirthdayPackage" ADD COLUMN "perChildTextEs" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'BirthdayPackage' 
        AND column_name = 'perChildTextVa'
    ) THEN
        ALTER TABLE "BirthdayPackage" ADD COLUMN "perChildTextVa" TEXT;
    END IF;
END $$;
