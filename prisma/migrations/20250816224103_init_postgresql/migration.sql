-- CreateTable
CREATE TABLE "public"."Law" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "lawType" TEXT,
    "lawNumber" TEXT,
    "promulgationDate" TIMESTAMP(3),
    "effectiveDate" TIMESTAMP(3),
    "xmlContent" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT '現行',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Law_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Article" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Paragraph" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "paragraphNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "Paragraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Item" (
    "id" TEXT NOT NULL,
    "paragraphId" TEXT NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Law_title_idx" ON "public"."Law"("title");

-- CreateIndex
CREATE INDEX "Law_lawNumber_idx" ON "public"."Law"("lawNumber");

-- CreateIndex
CREATE INDEX "Law_status_idx" ON "public"."Law"("status");

-- CreateIndex
CREATE INDEX "Article_lawId_sortOrder_idx" ON "public"."Article"("lawId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Article_lawId_articleNumber_key" ON "public"."Article"("lawId", "articleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Paragraph_articleId_paragraphNumber_key" ON "public"."Paragraph"("articleId", "paragraphNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Item_paragraphId_itemNumber_key" ON "public"."Item"("paragraphId", "itemNumber");

-- AddForeignKey
ALTER TABLE "public"."Article" ADD CONSTRAINT "Article_lawId_fkey" FOREIGN KEY ("lawId") REFERENCES "public"."Law"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Paragraph" ADD CONSTRAINT "Paragraph_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "public"."Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Item" ADD CONSTRAINT "Item_paragraphId_fkey" FOREIGN KEY ("paragraphId") REFERENCES "public"."Paragraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;
