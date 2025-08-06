#!/usr/bin/env npx tsx
/**
 * 条文タイトルと章節構造を修正
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * 改良版XML解析：ArticleCaptionとChapter/Section構造を正しく取得
 */
function parseArticleStructure(xmlContent: string): Map<string, any> {
  const articleMap = new Map<string, any>();
  
  // 編・章・節の階層を保持
  let currentPart = '';
  let currentChapter = '';
  let currentSection = '';
  let currentSubsection = '';
  
  // 編（Part）の検出
  const partMatches = xmlContent.matchAll(
    /<Part\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Part>/g
  );
  
  for (const partMatch of partMatches) {
    const partNum = partMatch[1];
    const partContent = partMatch[2];
    
    // 編タイトル
    const partTitleMatch = partContent.match(/<PartTitle>([^<]+)<\/PartTitle>/);
    currentPart = partTitleMatch ? partTitleMatch[1] : `第${partNum}編`;
    
    // 編内の章を処理
    processChapters(partContent, currentPart);
  }
  
  // 編外の章も処理
  processChapters(xmlContent, '');
  
  function processChapters(content: string, partName: string) {
    const chapterMatches = content.matchAll(
      /<Chapter\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Chapter>/g
    );
    
    for (const chapterMatch of chapterMatches) {
      const chapterNum = chapterMatch[1];
      const chapterContent = chapterMatch[2];
      
      // 章タイトル
      const chapterTitleMatch = chapterContent.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
      currentChapter = chapterTitleMatch ? chapterTitleMatch[1] : `第${chapterNum}章`;
      
      // 章内の節を処理
      processSections(chapterContent, partName, currentChapter);
      
      // 節外の条文も処理
      processArticles(chapterContent, partName, currentChapter, '');
    }
  }
  
  function processSections(content: string, partName: string, chapterName: string) {
    const sectionMatches = content.matchAll(
      /<Section\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Section>/g
    );
    
    for (const sectionMatch of sectionMatches) {
      const sectionNum = sectionMatch[1];
      const sectionContent = sectionMatch[2];
      
      // 節タイトル
      const sectionTitleMatch = sectionContent.match(/<SectionTitle>([^<]+)<\/SectionTitle>/);
      currentSection = sectionTitleMatch ? sectionTitleMatch[1] : `第${sectionNum}節`;
      
      // 節内の款を処理
      const subsectionMatches = sectionContent.matchAll(
        /<Subsection\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Subsection>/g
      );
      
      for (const subsectionMatch of subsectionMatches) {
        const subsectionNum = subsectionMatch[1];
        const subsectionContent = subsectionMatch[2];
        
        const subsectionTitleMatch = subsectionContent.match(/<SubsectionTitle>([^<]+)<\/SubsectionTitle>/);
        currentSubsection = subsectionTitleMatch ? subsectionTitleMatch[1] : `第${subsectionNum}款`;
        
        processArticles(subsectionContent, partName, chapterName, currentSection, currentSubsection);
      }
      
      // 款外の条文も処理
      processArticles(sectionContent, partName, chapterName, currentSection);
    }
  }
  
  function processArticles(
    content: string, 
    partName: string, 
    chapterName: string, 
    sectionName: string,
    subsectionName: string = ''
  ) {
    const articleMatches = content.matchAll(
      /<Article\s+(?:Delete="[^"]*"\s+)?(?:Hide="[^"]*"\s+)?Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g
    );
    
    for (const match of articleMatches) {
      const articleNum = match[1];
      const articleContent = match[2];
      
      // ArticleCaption（条文の見出し）を取得
      const captionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleCaption = captionMatch ? captionMatch[1].replace(/[（）]/g, '') : '';
      
      // ArticleTitle（第○条）を取得
      const titleMatch = articleContent.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
      const articleTitle = titleMatch ? titleMatch[1] : '';
      
      articleMap.set(articleNum, {
        caption: articleCaption,
        title: articleTitle,
        part: partName,
        chapter: chapterName,
        section: sectionName,
        subsection: subsectionName
      });
    }
  }
  
  return articleMap;
}

/**
 * 全法令の条文タイトルと構造を修正
 */
async function fixAllArticleTitles() {
  console.log('🔧 条文タイトルと章節構造を修正中...\n');
  
  const laws = await prisma.law.findMany({
    select: {
      id: true,
      title: true,
      xmlContent: true
    }
  });
  
  console.log(`📚 ${laws.length}件の法令を処理します`);
  
  let updatedCount = 0;
  let processedLaws = 0;
  
  for (const law of laws) {
    if (processedLaws % 100 === 0) {
      console.log(`進捗: ${processedLaws}/${laws.length}`);
    }
    processedLaws++;
    
    try {
      const articleStructure = parseArticleStructure(law.xmlContent);
      
      if (articleStructure.size === 0) continue;
      
      // この法令の全条文を取得
      const articles = await prisma.article.findMany({
        where: { lawId: law.id }
      });
      
      // 各条文を更新
      for (const article of articles) {
        const structure = articleStructure.get(article.articleNumber);
        
        if (structure) {
          await prisma.article.update({
            where: { id: article.id },
            data: {
              articleTitle: structure.caption || article.articleTitle,
              chapter: structure.chapter || article.chapter,
              section: structure.section || article.section
            }
          });
          updatedCount++;
        }
      }
      
    } catch (error) {
      // エラーは無視して続行
    }
  }
  
  console.log(`\n✅ ${updatedCount}条文のタイトルと構造を更新しました`);
}

/**
 * 民法を優先的に修正
 */
async function fixMinpouFirst() {
  console.log('📋 民法を優先的に修正中...\n');
  
  const minpou = await prisma.law.findUnique({
    where: { id: '129AC0000000089' },
    include: { articles: true }
  });
  
  if (!minpou) {
    console.log('民法が見つかりません');
    return;
  }
  
  const articleStructure = parseArticleStructure(minpou.xmlContent);
  console.log(`民法の条文構造: ${articleStructure.size}件`);
  
  let updated = 0;
  for (const article of minpou.articles) {
    const structure = articleStructure.get(article.articleNumber);
    
    if (structure) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          articleTitle: structure.caption || null,
          chapter: structure.chapter || null,
          section: structure.section || null
        }
      });
      updated++;
      
      if (updated <= 5) {
        console.log(`  第${article.articleNumber}条: ${structure.caption || '(見出しなし)'}`);
        console.log(`    章: ${structure.chapter}`);
        console.log(`    節: ${structure.section}`);
      }
    }
  }
  
  console.log(`\n✅ 民法の${updated}条文を更新しました`);
}

async function main() {
  try {
    // まず民法を修正
    await fixMinpouFirst();
    
    // 次に全法令を修正
    console.log('\n📚 全法令の条文タイトルを修正中...');
    await fixAllArticleTitles();
    
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✅ 修正完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });