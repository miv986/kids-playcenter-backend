-- DropForeignKey
ALTER TABLE "DaycareBooking" DROP CONSTRAINT "DaycareBooking_userId_fkey";

-- AlterTable
ALTER TABLE "DaycareBooking" ADD COLUMN     "isManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualClientName" TEXT,
ADD COLUMN     "manualNumberOfChildren" INTEGER,
ALTER COLUMN "userId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "DaycareBooking_isManual_idx" ON "DaycareBooking"("isManual");

-- AddForeignKey
ALTER TABLE "DaycareBooking" ADD CONSTRAINT "DaycareBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
