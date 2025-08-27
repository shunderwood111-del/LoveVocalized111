-- CreateTable
CREATE TABLE "SongJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "externalJob" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "resultUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SongJob_externalJob_key" ON "SongJob"("externalJob");

-- CreateIndex
CREATE INDEX "SongJob_customerId_idx" ON "SongJob"("customerId");

-- CreateIndex
CREATE INDEX "CustomerEntitlement_customerId_idx" ON "CustomerEntitlement"("customerId");
