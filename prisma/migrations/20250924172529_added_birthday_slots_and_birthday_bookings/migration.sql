-- CreateEnum
CREATE TYPE "Status" AS ENUM ('PENDING', 'CANCELLED', 'CONFIRMED', 'CLOSED', 'OPEN');

-- CreateEnum
CREATE TYPE "Package" AS ENUM ('ALEGRIA', 'FIESTA', 'ESPECIAL');

-- CreateTable
CREATE TABLE "BirthdayBooking" (
    "id" SERIAL NOT NULL,
    "guestId" INTEGER NOT NULL,
    "guest" TEXT NOT NULL,
    "number_of_kids" INTEGER NOT NULL,
    "contact_number" TEXT NOT NULL,
    "comments" TEXT,
    "packageType" "Package" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "slotId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdayBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BirthdaySlot" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'CLOSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdaySlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayBooking_slotId_key" ON "BirthdayBooking"("slotId");

-- AddForeignKey
ALTER TABLE "BirthdayBooking" ADD CONSTRAINT "BirthdayBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BirthdaySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
