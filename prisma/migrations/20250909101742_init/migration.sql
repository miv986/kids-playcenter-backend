-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allergies" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "emergency_contact_name_1" TEXT,
ADD COLUMN     "emergency_contact_name_2" TEXT,
ADD COLUMN     "medicalNotes" TEXT,
ADD COLUMN     "notes" TEXT;
