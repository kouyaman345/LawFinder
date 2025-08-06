/*
  Warnings:

  - Added the required column `updatedAt` to the `Reference` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Reference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromArticleId" TEXT NOT NULL,
    "toArticleId" TEXT,
    "toLawId" TEXT,
    "referenceText" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceSubType" TEXT,
    "targetArticleNumber" TEXT,
    "targetArticleNumberEnd" TEXT,
    "targetParagraphNumber" INTEGER,
    "targetItemNumber" TEXT,
    "targetLawName" TEXT,
    "relativeDirection" TEXT,
    "relativeCount" INTEGER,
    "structureType" TEXT,
    "sourceParagraphNumber" INTEGER,
    "sourceItemNumber" TEXT,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Reference_fromArticleId_fkey" FOREIGN KEY ("fromArticleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reference_toArticleId_fkey" FOREIGN KEY ("toArticleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Reference" ("confidence", "fromArticleId", "id", "referenceText", "referenceType", "toArticleId", "toLawId") SELECT "confidence", "fromArticleId", "id", "referenceText", "referenceType", "toArticleId", "toLawId" FROM "Reference";
DROP TABLE "Reference";
ALTER TABLE "new_Reference" RENAME TO "Reference";
CREATE INDEX "Reference_fromArticleId_idx" ON "Reference"("fromArticleId");
CREATE INDEX "Reference_toArticleId_idx" ON "Reference"("toArticleId");
CREATE INDEX "Reference_toLawId_idx" ON "Reference"("toLawId");
CREATE INDEX "Reference_referenceType_idx" ON "Reference"("referenceType");
CREATE INDEX "Reference_referenceSubType_idx" ON "Reference"("referenceSubType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
