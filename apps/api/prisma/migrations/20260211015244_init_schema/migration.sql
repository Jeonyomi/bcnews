-- CreateTable
CREATE TABLE "NewsBrief" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "contentMd" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cron',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StablecoinTransfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chainId" INTEGER NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "blockTimestamp" DATETIME NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amountRaw" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "isMint" BOOLEAN NOT NULL,
    "isBurn" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StablecoinMetricHourly" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bucketStart" DATETIME NOT NULL,
    "chainId" INTEGER NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "supply" TEXT,
    "mintAmount" TEXT NOT NULL DEFAULT '0',
    "burnAmount" TEXT NOT NULL DEFAULT '0',
    "transferAmount" TEXT NOT NULL DEFAULT '0',
    "transferCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueSenders" INTEGER NOT NULL DEFAULT 0,
    "uniqueReceivers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "IndexCursor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chainId" INTEGER NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "lastFinalizedBlock" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "summary" TEXT,
    "runAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "NewsBrief_createdAt_idx" ON "NewsBrief"("createdAt");

-- CreateIndex
CREATE INDEX "StablecoinTransfer_chainId_tokenAddress_blockNumber_idx" ON "StablecoinTransfer"("chainId", "tokenAddress", "blockNumber");

-- CreateIndex
CREATE INDEX "StablecoinTransfer_blockTimestamp_idx" ON "StablecoinTransfer"("blockTimestamp");

-- CreateIndex
CREATE UNIQUE INDEX "StablecoinTransfer_chainId_txHash_logIndex_key" ON "StablecoinTransfer"("chainId", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "StablecoinMetricHourly_chainId_tokenAddress_bucketStart_idx" ON "StablecoinMetricHourly"("chainId", "tokenAddress", "bucketStart");

-- CreateIndex
CREATE UNIQUE INDEX "StablecoinMetricHourly_bucketStart_chainId_tokenAddress_key" ON "StablecoinMetricHourly"("bucketStart", "chainId", "tokenAddress");

-- CreateIndex
CREATE UNIQUE INDEX "IndexCursor_chainId_tokenAddress_key" ON "IndexCursor"("chainId", "tokenAddress");

-- CreateIndex
CREATE INDEX "JobRun_name_runAt_idx" ON "JobRun"("name", "runAt");
