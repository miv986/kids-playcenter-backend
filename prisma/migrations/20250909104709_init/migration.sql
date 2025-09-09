-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'CHILD';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emergency_phone_1" TEXT,
ADD COLUMN     "emergency_phone_2" TEXT,
ADD COLUMN     "tutorId" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
