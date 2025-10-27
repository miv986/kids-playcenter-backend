-- CreateTable
CREATE TABLE "BirthdayPackage" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "Package" NOT NULL,
    "duration" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "priceValue" INTEGER NOT NULL,
    "features" TEXT[],
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdayPackage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayPackage_type_key" ON "BirthdayPackage"("type");
