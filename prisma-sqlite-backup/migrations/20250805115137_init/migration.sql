-- CreateTable
CREATE TABLE "Law" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "lawType" TEXT,
    "lawNumber" TEXT,
    "promulgationDate" DATETIME,
    "effectiveDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "metadata" JSONB,
    "enactStatements" JSONB,
    "amendmentHistory" JSONB
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lawId" TEXT NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "articleTitle" TEXT,
    "content" TEXT NOT NULL,
    CONSTRAINT "Article_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "Law" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Paragraph" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "articleId" TEXT NOT NULL,
    "paragraphNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Paragraph_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paragraphId" TEXT NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    CONSTRAINT "Item_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "Paragraph" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromArticleId" TEXT NOT NULL,
    "toArticleId" TEXT,
    "toLawId" TEXT,
    "referenceText" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "confidence" REAL,
    CONSTRAINT "Reference_fromArticleId_fkey" FOREIGN KEY ("fromArticleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reference_toArticleId_fkey" FOREIGN KEY ("toArticleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Law_title_idx" ON "Law"("title");

-- CreateIndex
CREATE INDEX "Law_lawNumber_idx" ON "Law"("lawNumber");

-- CreateIndex
CREATE INDEX "Article_lawId_idx" ON "Article"("lawId");

-- CreateIndex
CREATE UNIQUE INDEX "Article_lawId_articleNumber_key" ON "Article"("lawId", "articleNumber");

-- CreateIndex
CREATE INDEX "Paragraph_articleId_idx" ON "Paragraph"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "Paragraph_articleId_paragraphNumber_key" ON "Paragraph"("articleId", "paragraphNumber");

-- CreateIndex
CREATE INDEX "Item_paragraphId_idx" ON "Item"("paragraphId");

-- CreateIndex
CREATE UNIQUE INDEX "Item_paragraphId_itemNumber_key" ON "Item"("paragraphId", "itemNumber");

-- CreateIndex
CREATE INDEX "Reference_fromArticleId_idx" ON "Reference"("fromArticleId");

-- CreateIndex
CREATE INDEX "Reference_toArticleId_idx" ON "Reference"("toArticleId");

-- CreateIndex
CREATE INDEX "Reference_toLawId_idx" ON "Reference"("toLawId");
