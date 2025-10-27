-- CreateTable
CREATE TABLE "ChildNote" (
    "id" SERIAL NOT NULL,
    "childId" INTEGER NOT NULL,
    "adminId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "images" TEXT[],
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChildNote_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChildNote" ADD CONSTRAINT "ChildNote_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildNote" ADD CONSTRAINT "ChildNote_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
