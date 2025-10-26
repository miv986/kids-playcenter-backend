-- CreateTable
CREATE TABLE "_DaycareBookingChildren" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_DaycareBookingChildren_AB_unique" ON "_DaycareBookingChildren"("A", "B");

-- CreateIndex
CREATE INDEX "_DaycareBookingChildren_B_index" ON "_DaycareBookingChildren"("B");

-- AddForeignKey
ALTER TABLE "_DaycareBookingChildren" ADD CONSTRAINT "_DaycareBookingChildren_A_fkey" FOREIGN KEY ("A") REFERENCES "DaycareBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DaycareBookingChildren" ADD CONSTRAINT "_DaycareBookingChildren_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
