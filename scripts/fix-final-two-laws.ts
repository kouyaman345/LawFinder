#!/usr/bin/env npx tsx
/**
 * 最後の2つの空法令を修正
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * 特定の2法令を修正
 */
async function fixFinalTwoLaws() {
  console.log('🔧 最後の2つの空法令を修正中...\n');
  
  const targetLawIds = ['129AC0000000005', '429M60000742002'];
  
  for (const lawId of targetLawIds) {
    console.log(`\n📋 法令 ${lawId} の処理中...`);
    
    try {
      // 既存の条文を削除（重複エラー回避のため）
      const deleteResult = await prisma.article.deleteMany({
        where: { lawId }
      });
      
      if (deleteResult.count > 0) {
        console.log(`  既存の${deleteResult.count}条文を削除`);
      }
      
      // 法令データを取得
      const law = await prisma.law.findUnique({
        where: { id: lawId }
      });
      
      if (!law) {
        console.log(`  ❌ 法令が見つかりません`);
        continue;
      }
      
      // XMLを解析
      const articles = parseXmlWithDebug(law.xmlContent, lawId);
      
      if (articles.length === 0) {
        console.log(`  ⚠️ 条文が見つかりません`);
        continue;
      }
      
      console.log(`  📝 ${articles.length}条文を作成中...`);
      
      // 条文を1つずつ作成（エラー箇所を特定しやすくするため）
      let created = 0;
      let failed = 0;
      
      for (const article of articles) {
        try {
          await prisma.article.create({
            data: {
              lawId,
              articleNumber: article.articleNumber,
              articleTitle: article.articleTitle || null,
              content: article.content,
              chapter: article.chapter || null,
              section: article.section || null,
              sortOrder: article.sortOrder,
              isDeleted: article.isDeleted
            }
          });
          created++;
        } catch (error: any) {
          console.log(`    ❌ 条文${article.articleNumber}: ${error.message}`);
          failed++;
        }
      }
      
      console.log(`  ✅ 結果: 成功=${created}, 失敗=${failed}`);
      
      // タイトルを更新
      if (law.title === 'タイトル不明') {
        const titleMatch = law.xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
        if (titleMatch) {
          await prisma.law.update({
            where: { id: lawId },
            data: { title: titleMatch[1] }
          });
          console.log(`  📝 タイトル更新: ${titleMatch[1]}`);
        }
      }
      
    } catch (error: any) {
      console.log(`  ❌ エラー: ${error.message}`);
    }
  }
}

/**
 * デバッグ情報付きXML解析
 */
function parseXmlWithDebug(xmlContent: string, lawId: string): any[] {
  const articles: any[] = [];
  let sortOrder = 1;
  
  console.log(`  XML長さ: ${xmlContent.length}文字`);
  
  // 章・節の情報を保持
  let currentChapter = '';
  let currentSection = '';
  
  // 章を検出
  const chapterMatches = xmlContent.matchAll(
    /<Chapter\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Chapter>/g
  );
  
  for (const chapterMatch of chapterMatches) {
    const chapterNum = chapterMatch[1];
    const chapterContent = chapterMatch[2];
    
    // 章タイトル
    const chapterTitleMatch = chapterContent.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
    currentChapter = chapterTitleMatch ? chapterTitleMatch[1] : `第${chapterNum}章`;
    
    // 章内の条文
    const articleMatches = chapterContent.matchAll(
      /<Article\s+(?:Delete="([^"]*?)"\s+)?(?:Hide="[^"]*?"\s+)?Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g
    );
    
    for (const match of articleMatches) {
      const isDeleted = match[1] === 'true';
      const articleNumber = match[2];
      const content = match[3];
      
      const titleMatch = content.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
      const articleTitle = titleMatch ? titleMatch[1].replace(/^第.*条\s*/, '').trim() : '';
      
      const cleanContent = content
        .replace(/<ArticleTitle[^>]*>[^<]*<\/ArticleTitle>/g, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      articles.push({
        articleNumber,
        articleTitle,
        content: cleanContent || (isDeleted ? '（削除）' : '（内容なし）'),
        chapter: currentChapter,
        section: currentSection,
        isDeleted,
        sortOrder: sortOrder++
      });
    }
  }
  
  // 章外の条文も取得
  const standAloneArticles = xmlContent.matchAll(
    /<Article\s+(?:Delete="([^"]*?)"\s+)?(?:Hide="[^"]*?"\s+)?Num="([^"]+)"[^>]*>(?![\\s\\S]*<\/Chapter>)([\s\S]*?)<\/Article>/g
  );
  
  for (const match of standAloneArticles) {
    const isDeleted = match[1] === 'true';
    const articleNumber = match[2];
    const content = match[3];
    
    // 既に処理済みか確認
    if (articles.some(a => a.articleNumber === articleNumber)) {
      continue;
    }
    
    const titleMatch = content.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
    const articleTitle = titleMatch ? titleMatch[1].replace(/^第.*条\s*/, '').trim() : '';
    
    const cleanContent = content
      .replace(/<ArticleTitle[^>]*>[^<]*<\/ArticleTitle>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    articles.push({
      articleNumber,
      articleTitle,
      content: cleanContent || (isDeleted ? '（削除）' : '（内容なし）'),
      chapter: '',
      section: '',
      isDeleted,
      sortOrder: sortOrder++
    });
  }
  
  console.log(`  検出された条文数: ${articles.length}`);
  
  // デバッグ: 最初の3条文を表示
  if (articles.length > 0) {
    console.log('  最初の条文:');
    articles.slice(0, 3).forEach(a => {
      console.log(`    - 第${a.articleNumber}条: ${a.articleTitle || '(タイトルなし)'}`);
    });
  }
  
  return articles;
}

/**
 * メイン処理
 */
async function main() {
  try {
    await fixFinalTwoLaws();
    
    // 最終確認
    const emptyLawsCount = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM "Law" l
      WHERE NOT EXISTS (
        SELECT 1 FROM "Article" a WHERE a."lawId" = l.id
      )
    `;
    
    console.log(`\n📊 最終結果: 空法令数 = ${emptyLawsCount[0].count}`);
    
    if (Number(emptyLawsCount[0].count) === 0) {
      console.log('✅ すべての法令に条文が存在します！');
    }
    
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