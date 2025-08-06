#!/usr/bin/env npx tsx
/**
 * 編・本則・附則の階層構造を更新
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * 包括的な階層構造を解析
 */
function parseCompleteStructure(xmlContent: string): Map<string, any> {
  const articleMap = new Map<string, any>();
  
  // 現在の階層情報
  let currentDivision = '本則'; // デフォルトは本則
  let currentPart = '';
  let currentChapter = '';
  let currentSection = '';
  let currentSubsection = '';
  
  // 本則の処理
  const mainProvisionMatch = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
  if (mainProvisionMatch) {
    const mainContent = mainProvisionMatch[1];
    currentDivision = '本則';
    
    // 本則内の編を処理
    const partMatches = mainContent.matchAll(
      /<Part\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Part>/g
    );
    
    for (const partMatch of partMatches) {
      const partNum = partMatch[1];
      const partContent = partMatch[2];
      
      // 編タイトル
      const partTitleMatch = partContent.match(/<PartTitle>([^<]+)<\/PartTitle>/);
      currentPart = partTitleMatch ? partTitleMatch[1] : `第${partNum}編`;
      
      processContent(partContent, currentDivision, currentPart);
    }
    
    // 編外の内容も処理
    const nonPartContent = mainContent.replace(/<Part[^>]*>[\s\S]*?<\/Part>/g, '');
    if (nonPartContent.includes('<Chapter') || nonPartContent.includes('<Article')) {
      currentPart = '';
      processContent(nonPartContent, currentDivision, currentPart);
    }
  }
  
  // 附則の処理
  const supplProvisionMatches = xmlContent.matchAll(
    /<SupplProvision[^>]*>([\s\S]*?)<\/SupplProvision>/g
  );
  
  let supplNum = 1;
  for (const supplMatch of supplProvisionMatches) {
    const supplContent = supplMatch[1];
    currentDivision = `附則${supplNum}`;
    currentPart = '';
    currentChapter = '';
    currentSection = '';
    
    // 附則のタイトルを取得
    const supplTitleMatch = supplContent.match(/<SupplProvisionLabel>([^<]+)<\/SupplProvisionLabel>/);
    if (supplTitleMatch) {
      currentDivision = supplTitleMatch[1];
    }
    
    processContent(supplContent, currentDivision, '');
    supplNum++;
  }
  
  function processContent(content: string, division: string, part: string) {
    // 章の処理
    const chapterMatches = content.matchAll(
      /<Chapter\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Chapter>/g
    );
    
    for (const chapterMatch of chapterMatches) {
      const chapterNum = chapterMatch[1];
      const chapterContent = chapterMatch[2];
      
      const chapterTitleMatch = chapterContent.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
      const currentChapter = chapterTitleMatch ? chapterTitleMatch[1] : `第${chapterNum}章`;
      
      // 節の処理
      const sectionMatches = chapterContent.matchAll(
        /<Section\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Section>/g
      );
      
      for (const sectionMatch of sectionMatches) {
        const sectionNum = sectionMatch[1];
        const sectionContent = sectionMatch[2];
        
        const sectionTitleMatch = sectionContent.match(/<SectionTitle>([^<]+)<\/SectionTitle>/);
        const currentSection = sectionTitleMatch ? sectionTitleMatch[1] : `第${sectionNum}節`;
        
        // 款の処理
        const subsectionMatches = sectionContent.matchAll(
          /<Subsection\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Subsection>/g
        );
        
        for (const subsectionMatch of subsectionMatches) {
          const subsectionNum = subsectionMatch[1];
          const subsectionContent = subsectionMatch[2];
          
          const subsectionTitleMatch = subsectionContent.match(/<SubsectionTitle>([^<]+)<\/SubsectionTitle>/);
          const currentSubsection = subsectionTitleMatch ? subsectionTitleMatch[1] : `第${subsectionNum}款`;
          
          processArticles(subsectionContent, division, part, currentChapter, currentSection, currentSubsection);
        }
        
        // 款外の条文
        const sectionArticlesOnly = sectionContent.replace(/<Subsection[^>]*>[\s\S]*?<\/Subsection>/g, '');
        processArticles(sectionArticlesOnly, division, part, currentChapter, currentSection, '');
      }
      
      // 節外の条文
      const chapterArticlesOnly = chapterContent.replace(/<Section[^>]*>[\s\S]*?<\/Section>/g, '');
      processArticles(chapterArticlesOnly, division, part, currentChapter, '', '');
    }
    
    // 章外の条文
    const contentArticlesOnly = content.replace(/<Chapter[^>]*>[\s\S]*?<\/Chapter>/g, '');
    processArticles(contentArticlesOnly, division, part, '', '', '');
  }
  
  function processArticles(
    content: string,
    division: string,
    part: string,
    chapter: string,
    section: string,
    subsection: string
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
      
      articleMap.set(articleNum, {
        caption: articleCaption,
        division: division,
        part: part,
        chapter: chapter,
        section: section,
        subsection: subsection
      });
    }
  }
  
  return articleMap;
}

/**
 * 法令の編・章・節構造を更新
 */
async function updateLawStructure(lawId: string) {
  const law = await prisma.law.findUnique({
    where: { id: lawId },
    include: { articles: true }
  });
  
  if (!law) {
    console.log(`法令 ${lawId} が見つかりません`);
    return;
  }
  
  const structure = parseCompleteStructure(law.xmlContent);
  console.log(`${law.title}の構造: ${structure.size}件の条文構造を検出`);
  
  let updated = 0;
  for (const article of law.articles) {
    const info = structure.get(article.articleNumber);
    
    if (info) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          articleTitle: info.caption || article.articleTitle,
          division: info.division || null,
          part: info.part || null,
          chapter: info.chapter || null,
          section: info.section || null,
          subsection: info.subsection || null
        }
      });
      updated++;
    }
  }
  
  console.log(`  ✅ ${updated}条文の構造を更新`);
  
  // 構造の統計を表示
  const stats = await prisma.article.groupBy({
    by: ['division', 'part'],
    where: { lawId },
    _count: true
  });
  
  console.log('\n構造統計:');
  stats.forEach(stat => {
    const division = stat.division || '(区分なし)';
    const part = stat.part || '(編なし)';
    console.log(`  ${division} - ${part}: ${stat._count}条文`);
  });
}

/**
 * メイン処理
 */
async function main() {
  try {
    console.log('🔧 編・本則・附則構造を更新中...\n');
    
    // 民法を更新
    await updateLawStructure('129AC0000000089');
    
    // 他の主要法令も更新
    const majorLaws = [
      '140AC0000000045', // 刑法
      '132AC0000000048', // 商法
      '417AC0000000086', // 会社法
      '322AC0000000049'  // 労働基準法
    ];
    
    for (const lawId of majorLaws) {
      await updateLawStructure(lawId);
    }
    
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\n✅ 構造更新完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });