-- CreateTable
CREATE TABLE "public"."Reference" (
    "id" TEXT NOT NULL,
    "sourceLawId" TEXT NOT NULL,
    "sourceArticle" TEXT NOT NULL,
    "targetLawId" TEXT,
    "targetArticle" TEXT,
    "referenceType" TEXT NOT NULL,
    "referenceText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reference_sourceLawId_sourceArticle_idx" ON "public"."Reference"("sourceLawId", "sourceArticle");

-- CreateIndex
CREATE INDEX "Reference_targetLawId_targetArticle_idx" ON "public"."Reference"("targetLawId", "targetArticle");

-- CreateIndex
CREATE INDEX "Reference_referenceType_idx" ON "public"."Reference"("referenceType");
