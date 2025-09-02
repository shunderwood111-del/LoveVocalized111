-- CreateTable
CREATE TABLE "public"."CustomerEntitlement" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "songsPerYear" INTEGER NOT NULL,
    "revisionsPerSong" INTEGER NOT NULL,
    "commercial" BOOLEAN NOT NULL,
    "renewsAt" TIMESTAMP(3),
    "songsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SongJob" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "externalJob" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "prompt" TEXT,
    "resultUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SongJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerEntitlement_customerId_key" ON "public"."CustomerEntitlement"("customerId");

-- CreateIndex
CREATE INDEX "CustomerEntitlement_customerId_idx" ON "public"."CustomerEntitlement"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "SongJob_externalJob_key" ON "public"."SongJob"("externalJob");

-- CreateIndex
CREATE INDEX "SongJob_customerId_idx" ON "public"."SongJob"("customerId");
