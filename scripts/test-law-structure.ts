#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 章節構造を構築する関数（ページと同じロジック）
function buildStructure(articles: any[]) {
  const structure = {
    parts: [] as any[],
    chapters: [] as any[],
    sections: [] as any[]
  };
  
  // 編・章・節の情報を収集
  const chaptersMap = new Map<string, { sections: Set<string>; articles: Set<string> }>();
  const sectionsMap = new Map<string, Set<string>>();
  
  articles.forEach(article => {
    const chapter = article.chapter;
    const section = article.section;
    
    if (chapter) {
      if (!chaptersMap.has(chapter)) {
        chaptersMap.set(chapter, { sections: new Set(), articles: new Set() });
      }
      
      if (section) {
        chaptersMap.get(chapter)!.sections.add(section);
        if (!sectionsMap.has(section)) {
          sectionsMap.set(section, new Set());
        }
        sectionsMap.get(section)!.add(article.articleNumber);
      } else {
        chaptersMap.get(chapter)!.articles.add(article.articleNumber);
      }
    }
  });
  
  // 章データを構築
  let chapterNum = 1;
  chaptersMap.forEach((data, chapterTitle) => {
    const sectionNums: string[] = [];
    data.sections.forEach(sectionTitle => {
      // 節番号を探す
      let sNum = 1;
      for (const [title, _] of sectionsMap) {
        if (title === sectionTitle) {
          sectionNums.push(String(sNum));
          break;
        }
        sNum++;
      }
    });
    
    structure.chapters.push({
      num: String(chapterNum),
      title: chapterTitle,
      sections: sectionNums,
      articles: Array.from(data.articles)
    });
    chapterNum++;
  });
  
  // 節データを構築
  let sectionNum = 1;
  sectionsMap.forEach((articleNums, sectionTitle) => {
    structure.sections.push({
      num: String(sectionNum),
      title: sectionTitle,
      articles: Array.from(articleNums)
    });
    sectionNum++;
  });
  
  return structure;
}

async function testLawStructure() {
  const law = await prisma.law.findUnique({
    where: { id: '129AC0000000089' },
    include: {
      articles: {
        select: {
          articleNumber: true,
          articleTitle: true,
          division: true,
          part: true,
          chapter: true,
          section: true
        },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  
  if (!law) {
    console.log('法令が見つかりません');
    return;
  }
  
  // 階層構造の統計を表示
  const divisionCount = new Set(law.articles.map(a => a.division).filter(Boolean)).size;
  const partCount = new Set(law.articles.map(a => a.part).filter(Boolean)).size;
  const chapterCount = new Set(law.articles.map(a => a.chapter).filter(Boolean)).size;
  const sectionCount = new Set(law.articles.map(a => a.section).filter(Boolean)).size;
  
  console.log('民法の構造:');
  console.log(`総条文数: ${law.articles.length}`);
  console.log(`区分（本則/附則）の数: ${divisionCount}`);
  console.log(`編の数: ${partCount}`);
  console.log(`章の数: ${chapterCount}`);
  console.log(`節の数: ${sectionCount}`);
  
  // 区分ごとの統計
  const divisions = new Map<string, { parts: Set<string>, chapters: Set<string>, articles: number }>();
  
  law.articles.forEach(article => {
    const div = article.division || '本則';
    if (!divisions.has(div)) {
      divisions.set(div, { parts: new Set(), chapters: new Set(), articles: 0 });
    }
    const divData = divisions.get(div)!;
    if (article.part) divData.parts.add(article.part);
    if (article.chapter) divData.chapters.add(article.chapter);
    divData.articles++;
  });
  
  console.log('\n区分ごとの詳細:');
  divisions.forEach((data, divName) => {
    console.log(`\n【${divName}】`);
    console.log(`  編: ${data.parts.size}個`);
    console.log(`  章: ${data.chapters.size}個`);
    console.log(`  条文: ${data.articles}個`);
    if (data.parts.size > 0) {
      console.log(`  編一覧: ${Array.from(data.parts).slice(0, 3).join(', ')}...`);
    }
  });
  
  // 最初の編の詳細
  const firstPart = law.articles.find(a => a.part)?.part;
  if (firstPart) {
    const partArticles = law.articles.filter(a => a.part === firstPart);
    const partChapters = new Set(partArticles.map(a => a.chapter).filter(Boolean));
    
    console.log(`\n【${firstPart}の詳細】`);
    console.log(`  章の数: ${partChapters.size}`);
    console.log(`  条文数: ${partArticles.length}`);
    if (partChapters.size > 0) {
      console.log(`  章一覧: ${Array.from(partChapters).slice(0, 3).join(', ')}...`);
    }
  }
  
  const structure = buildStructure(law.articles);
  
  await prisma.$disconnect();
}

testLawStructure();