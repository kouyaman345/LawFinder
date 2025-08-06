#!/usr/bin/env npx tsx
/**
 * インポート問題の修正スクリプト
 * 1. XML構造の多様性に対応（Article/Paragraph両方をサポート）
 * 2. Neo4jトランザクションを小さく分割
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'lawfinder123'
  )
);

/**
 * 改良版XML解析：Article/Paragraph両方に対応
 */
function parseXmlContent(xmlContent: string): any[] {
  const articles: any[] = [];
  
  // パターン1: Article要素がある場合
  const articleMatches = xmlContent.matchAll(
    /<Article\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Article>/g
  );
  
  for (const match of articleMatches) {
    const articleNumber = match[1];
    const content = match[2];
    
    // タイトルを抽出
    const titleMatch = content.match(/<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/);
    const articleTitle = titleMatch ? titleMatch[1].replace(/^第.*条\s*/, '') : '';
    
    articles.push({
      articleNumber,
      articleTitle,
      content: content.replace(/<[^>]+>/g, ' ').trim(),
      isDeleted: content.includes('Delete="true"')
    });
  }
  
  // パターン2: MainProvision直下のParagraphの場合（Articleタグがない）
  if (articles.length === 0 && xmlContent.includes('<MainProvision>')) {
    const mainProvision = xmlContent.match(/<MainProvision>([\s\S]*?)<\/MainProvision>/);
    
    if (mainProvision) {
      // 単一条文として扱う
      const content = mainProvision[1];
      const cleanContent = content.replace(/<[^>]+>/g, ' ').trim();
      
      if (cleanContent.length > 0) {
        articles.push({
          articleNumber: '1', // 本則を第1条として扱う
          articleTitle: '本則',
          content: cleanContent,
          isDeleted: false
        });
      }
    }
  }
  
  // パターン3: SupplProvision（附則）
  const supplMatches = xmlContent.matchAll(
    /<SupplProvision[^>]*>([\s\S]*?)<\/SupplProvision>/g
  );
  
  let supplIndex = 1;
  for (const match of supplMatches) {
    const content = match[1];
    const cleanContent = content.replace(/<[^>]+>/g, ' ').trim();
    
    if (cleanContent.length > 0) {
      articles.push({
        articleNumber: `附則${supplIndex}`,
        articleTitle: '附則',
        content: cleanContent,
        isDeleted: false
      });
      supplIndex++;
    }
  }
  
  return articles;
}

/**
 * 条文が0件の法令を修正
 */
async function fixEmptyLaws(): Promise<void> {
  console.log('🔧 条文が0件の法令を修正中...\n');
  
  // 条文が0件の法令を取得
  const emptyLaws = await prisma.$queryRaw<any[]>`
    SELECT l.id, l."xmlContent"
    FROM "Law" l
    LEFT JOIN "Article" a ON l.id = a."lawId"
    WHERE a.id IS NULL
    LIMIT 100
  `;
  
  console.log(`📋 ${emptyLaws.length}件の法令を修正します`);
  
  let fixed = 0;
  let failed = 0;
  
  for (const law of emptyLaws) {
    try {
      const articles = parseXmlContent(law.xmlContent);
      
      if (articles.length > 0) {
        // 条文を追加
        for (let i = 0; i < articles.length; i++) {
          const article = articles[i];
          
          await prisma.article.create({
            data: {
              lawId: law.id,
              articleNumber: article.articleNumber,
              articleTitle: article.articleTitle || null,
              content: article.content,
              chapter: null,
              section: null,
              sortOrder: i,
              isDeleted: article.isDeleted
            }
          });
        }
        
        fixed++;
        console.log(`✅ ${law.id}: ${articles.length}条文を追加`);
      }
    } catch (error: any) {
      failed++;
      console.log(`❌ ${law.id}: ${error.message}`);
    }
  }
  
  console.log(`\n📊 修正結果: 成功=${fixed}, 失敗=${failed}`);
}

/**
 * Neo4j同期を小さいバッチで実行
 */
async function fixNeo4jSync(): Promise<void> {
  console.log('\n🔧 Neo4j同期を修正中...\n');
  
  // Neo4jに存在しない法令を取得
  const session = driver.session();
  
  try {
    // PostgreSQLの法令IDリスト
    const pgLaws = await prisma.law.findMany({
      select: { id: true },
      take: 100
    });
    
    // Neo4jの法令IDリスト
    const neo4jResult = await session.run('MATCH (l:Law) RETURN l.id as id');
    const neo4jLawIds = new Set(neo4jResult.records.map(r => r.get('id')));
    
    // 差分を特定
    const missingLaws = pgLaws.filter(l => !neo4jLawIds.has(l.id));
    
    console.log(`📋 ${missingLaws.length}件の法令をNeo4jに追加します`);
    
    for (const law of missingLaws) {
      const fullLaw = await prisma.law.findUnique({
        where: { id: law.id },
        include: { articles: true }
      });
      
      if (!fullLaw) continue;
      
      // 個別のセッションで処理（トランザクションを小さく）
      const lawSession = driver.session();
      
      try {
        // 法令ノードを作成
        await lawSession.run(
          `MERGE (l:Law {id: $id})
           SET l.title = $title,
               l.status = $status`,
          {
            id: fullLaw.id,
            title: fullLaw.title,
            status: fullLaw.status
          }
        );
        
        // 条文ノードを作成（10件ずつ）
        for (let i = 0; i < fullLaw.articles.length; i += 10) {
          const articleBatch = fullLaw.articles.slice(i, i + 10);
          
          for (const article of articleBatch) {
            const articleId = `${fullLaw.id}_${article.articleNumber}`;
            
            await lawSession.run(
              `MERGE (a:Article {id: $id})
               SET a.lawId = $lawId,
                   a.number = $number,
                   a.title = $title
               WITH a
               MATCH (l:Law {id: $lawId})
               MERGE (l)-[:HAS_ARTICLE]->(a)`,
              {
                id: articleId,
                lawId: fullLaw.id,
                number: article.articleNumber,
                title: article.articleTitle || ''
              }
            );
          }
        }
        
        console.log(`✅ ${fullLaw.id}: ${fullLaw.articles.length}条文を同期`);
      } catch (error: any) {
        console.log(`❌ ${fullLaw.id}: ${error.message}`);
      } finally {
        await lawSession.close();
      }
    }
  } finally {
    await session.close();
  }
}

/**
 * メイン処理
 */
async function main() {
  try {
    console.log('🚀 インポート問題の修正を開始します\n');
    
    // 1. 条文が0件の法令を修正
    await fixEmptyLaws();
    
    // 2. Neo4j同期を修正
    await fixNeo4jSync();
    
    // 統計を表示
    const stats = await prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(DISTINCT l.id) as total_laws,
        COUNT(DISTINCT a.id) as total_articles,
        COUNT(DISTINCT CASE WHEN a.id IS NULL THEN l.id END) as empty_laws
      FROM "Law" l
      LEFT JOIN "Article" a ON l.id = a."lawId"
    `;
    
    console.log('\n📊 最終統計:');
    console.log(`  総法令数: ${stats[0].total_laws}`);
    console.log(`  総条文数: ${stats[0].total_articles}`);
    console.log(`  空の法令: ${stats[0].empty_laws}`);
    
  } finally {
    await prisma.$disconnect();
    await driver.close();
  }
}

main()
  .then(() => {
    console.log('\n✅ 修正完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });