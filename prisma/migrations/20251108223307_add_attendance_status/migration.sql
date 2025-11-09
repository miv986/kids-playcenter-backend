-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'ATTENDED', 'NOT_ATTENDED');

-- AlterTable
ALTER TABLE "DaycareBooking" ADD COLUMN     "attendanceStatus" "AttendanceStatus" NOT NULL DEFAULT 'PENDING';
