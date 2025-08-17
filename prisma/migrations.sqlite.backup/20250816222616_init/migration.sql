-- CreateTable
CREATE TABLE "Law" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "lawType" TEXT,
    "lawNumber" TEXT,
    "promulgationDate" DATETIME,
    "effectiveDate" DATETIME,
    "xmlContent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '現行',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lawId" TEXT NOT NULL,
    "articleNumber" TEXT NOT NULL,
    "articleTitle" TEXT,
    "content" TEXT NOT NULL,
    "part" TEXT,
    "chapter" TEXT,
    "section" TEXT,
    "subsection" TEXT,
    "division" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
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

-- CreateIndex
CREATE INDEX "Law_title_idx" ON "Law"("title");

-- CreateIndex
CREATE INDEX "Law_lawNumber_idx" ON "Law"("lawNumber");

-- CreateIndex
CREATE INDEX "Law_status_idx" ON "Law"("status");

-- CreateIndex
CREATE INDEX "Article_lawId_sortOrder_idx" ON "Article"("lawId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Article_lawId_articleNumber_key" ON "Article"("lawId", "articleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Paragraph_articleId_paragraphNumber_key" ON "Paragraph"("articleId", "paragraphNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Item_paragraphId_itemNumber_key" ON "Item"("paragraphId", "itemNumber");
