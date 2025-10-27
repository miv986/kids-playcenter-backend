/*
  Warnings:

  - You are about to drop the `Booking` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- DropTable
DROP TABLE "Booking";

-- CreateTable
CREATE TABLE "DaycareBooking" (
    "id" SERIAL NOT NULL,
    "comments" TEXT,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "DaycareBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DaycareSlot" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "openHour" INTEGER NOT NULL,
    "closeHour" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "availableSpots" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DaycareSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_DaycareSlotBookings" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_DaycareSlotBookings_AB_unique" ON "_DaycareSlotBookings"("A", "B");

-- CreateIndex
CREATE INDEX "_DaycareSlotBookings_B_index" ON "_DaycareSlotBookings"("B");

-- AddForeignKey
ALTER TABLE "DaycareBooking" ADD CONSTRAINT "DaycareBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DaycareSlotBookings" ADD CONSTRAINT "_DaycareSlotBookings_A_fkey" FOREIGN KEY ("A") REFERENCES "DaycareBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DaycareSlotBookings" ADD CONSTRAINT "_DaycareSlotBookings_B_fkey" FOREIGN KEY ("B") REFERENCES "DaycareSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
