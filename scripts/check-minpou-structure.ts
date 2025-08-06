#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkMinpouStructure() {
  const articles = await prisma.article.findMany({
    where: { lawId: '129AC0000000089' },
    select: {
      articleNumber: true,
      articleTitle: true,
      chapter: true,
      section: true
    },
    orderBy: { sortOrder: 'asc' }
  });
  
  // 章でグループ化
  const chapterMap = new Map<string, any[]>();
  const chapters: string[] = [];
  
  articles.forEach(article => {
    const chapter = article.chapter || 'その他';
    if (!chapterMap.has(chapter)) {
      chapterMap.set(chapter, []);
      chapters.push(chapter);
    }
    chapterMap.get(chapter)!.push(article);
  });
  
  console.log('民法の章構造:');
  console.log(`総条文数: ${articles.length}`);
  console.log(`章の数: ${chapters.length}`);
  
  // 最初の5章を表示
  chapters.slice(0, 5).forEach(chapter => {
    const arts = chapterMap.get(chapter)!;
    console.log(`\n${chapter}: ${arts.length}条文`);
    arts.slice(0, 3).forEach(a => {
      console.log(`  第${a.articleNumber}条: ${a.articleTitle || '(タイトルなし)'}`);
      if (a.section) {
        console.log(`    節: ${a.section}`);
      }
    });
  });
  
  await prisma.$disconnect();
}

checkMinpouStructure();