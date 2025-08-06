#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function analyzeStructure() {
  const law = await prisma.law.findUnique({
    where: { id: '129AC0000000089' },
    include: {
      articles: {
        select: {
          articleNumber: true,
          division: true,
          part: true,
          chapter: true,
          section: true
        },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  
  if (!law) return;
  
  // 階層構造の分析
  let inDivision = 0;
  let inPart = 0;
  let inChapter = 0;
  let inSection = 0;
  let orphaned = 0;
  
  law.articles.forEach(a => {
    if (a.division) inDivision++;
    if (a.part) inPart++;
    if (a.chapter) inChapter++;
    if (a.section) inSection++;
    if (!a.division && !a.part && !a.chapter && !a.section) orphaned++;
  });
  
  console.log('条文の階層構造分析:');
  console.log(`総条文数: ${law.articles.length}`);
  console.log(`divisionに属する: ${inDivision}`);
  console.log(`partに属する: ${inPart}`);
  console.log(`chapterに属する: ${inChapter}`);
  console.log(`sectionに属する: ${inSection}`);
  console.log(`どこにも属さない: ${orphaned}`);
  
  // divisionはあるがchapterがない条文を確認
  const divisionOnlyArticles = law.articles.filter(a => 
    a.division && !a.chapter
  );
  
  console.log(`\ndivisionはあるがchapterがない: ${divisionOnlyArticles.length}条文`);
  if (divisionOnlyArticles.length > 0) {
    console.log('例:');
    divisionOnlyArticles.slice(0, 5).forEach(a => {
      console.log(`  第${a.articleNumber}条: division=${a.division}, part=${a.part}`);
    });
  }
  
  await prisma.$disconnect();
}

analyzeStructure();