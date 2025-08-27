-- CreateTable
CREATE TABLE "CustomerEntitlement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "songsPerYear" INTEGER NOT NULL,
    "revisionsPerSong" INTEGER NOT NULL,
    "commercial" BOOLEAN NOT NULL,
    "renewsAt" DATETIME,
    "songsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEntitlement_customerId_key" ON "CustomerEntitlement"("customerId");
