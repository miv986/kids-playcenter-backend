-- CreateTable
CREATE TABLE "MeetingSlot" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "availableSpots" INTEGER NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingBooking" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "comments" TEXT,
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "slotId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingSlot_date_idx" ON "MeetingSlot"("date");

-- CreateIndex
CREATE INDEX "MeetingSlot_startTime_endTime_idx" ON "MeetingSlot"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "MeetingSlot_status_idx" ON "MeetingSlot"("status");

-- CreateIndex
CREATE INDEX "MeetingBooking_status_idx" ON "MeetingBooking"("status");

-- CreateIndex
CREATE INDEX "MeetingBooking_email_idx" ON "MeetingBooking"("email");

-- CreateIndex
CREATE INDEX "MeetingBooking_createdAt_idx" ON "MeetingBooking"("createdAt");

-- CreateIndex
CREATE INDEX "MeetingBooking_slotId_idx" ON "MeetingBooking"("slotId");

-- AddForeignKey
ALTER TABLE "MeetingBooking" ADD CONSTRAINT "MeetingBooking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "MeetingSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
