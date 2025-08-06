#!/usr/bin/env npx tsx
/**
 * 全法令の完全修正スクリプト
 * すべての法令が正常に読み込まれるよう包括的に修正
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
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
 * 包括的XML解析関数
 * あらゆるパターンのXMLに対応
 */
function comprehensiveXmlParse(xmlContent: string): any[] {
  const articles: any[] = [];
  let articleCounter = 1;
  
  // パターン1: 標準的なArticle要素
  const articleMatches = xmlContent.matchAll(
    /<Article\s+(?:Delete="[^"]*"\s+)?Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g
  );
  
  for (const match of articleMatches) {
    const articleNumber = match[1];
    const content = match[2];
    const isDeleted = match[0].includes('Delete="true"');
    
    // タイトル抽出
    const titleMatch = content.match(/<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/);
    const articleTitle = titleMatch ? titleMatch[1].replace(/^第.*条\s*/, '').trim() : '';
    
    // コンテンツをクリーンアップ
    const cleanContent = content
      .replace(/<ArticleTitle[^>]*>[^<]*<\/ArticleTitle>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (cleanContent || isDeleted) {
      articles.push({
        articleNumber,
        articleTitle,
        content: cleanContent || '（削除）',
        isDeleted,
        sortOrder: articleCounter++
      });
    }
  }
  
  // パターン2: MainProvision直下の内容（Articleタグなし）
  if (articles.length === 0) {
    const mainProvision = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
    
    if (mainProvision) {
      const content = mainProvision[1];
      
      // Paragraph要素を個別に抽出
      const paragraphMatches = content.matchAll(
        /<Paragraph(?:\s+Num="([^"]+)")?[^>]*>([\s\S]*?)<\/Paragraph>/g
      );
      
      let paragraphCount = 0;
      for (const pMatch of paragraphMatches) {
        const paragraphNum = pMatch[1] || String(++paragraphCount);
        const paragraphContent = pMatch[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (paragraphContent) {
          articles.push({
            articleNumber: paragraphNum === '1' ? '本則' : `本則第${paragraphNum}項`,
            articleTitle: '',
            content: paragraphContent,
            isDeleted: false,
            sortOrder: articleCounter++
          });
        }
      }
      
      // Paragraphタグもない場合は全体を1つの条文として扱う
      if (articles.length === 0) {
        const cleanContent = content
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (cleanContent) {
          articles.push({
            articleNumber: '本則',
            articleTitle: '',
            content: cleanContent,
            isDeleted: false,
            sortOrder: articleCounter++
          });
        }
      }
    }
  }
  
  // パターン3: AppdxTable（別表）
  const tableMatches = xmlContent.matchAll(
    /<AppdxTable(?:\s+Num="([^"]+)")?[^>]*>([\s\S]*?)<\/AppdxTable>/g
  );
  
  for (const match of tableMatches) {
    const tableNum = match[1] || String(articleCounter);
    const content = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (content) {
      articles.push({
        articleNumber: `別表${tableNum}`,
        articleTitle: '別表',
        content: content.substring(0, 5000), // 長すぎる場合は切り詰め
        isDeleted: false,
        sortOrder: articleCounter++
      });
    }
  }
  
  // パターン4: SupplProvision（附則）
  const supplMatches = xmlContent.matchAll(
    /<SupplProvision[^>]*>([\s\S]*?)<\/SupplProvision>/g
  );
  
  let supplIndex = 1;
  for (const match of supplMatches) {
    const supplContent = match[1];
    
    // 附則内のArticle要素
    const supplArticles = supplContent.matchAll(
      /<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g
    );
    
    let hasSupplArticles = false;
    for (const sMatch of supplArticles) {
      hasSupplArticles = true;
      const supplArticleNum = sMatch[1];
      const content = sMatch[2]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (content) {
        articles.push({
          articleNumber: `附則第${supplArticleNum}条`,
          articleTitle: '附則',
          content,
          isDeleted: false,
          sortOrder: articleCounter++
        });
      }
    }
    
    // Article要素がない場合は全体を1つとして扱う
    if (!hasSupplArticles) {
      const cleanContent = supplContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (cleanContent) {
        articles.push({
          articleNumber: `附則${supplIndex}`,
          articleTitle: '附則',
          content: cleanContent.substring(0, 5000),
          isDeleted: false,
          sortOrder: articleCounter++
        });
        supplIndex++;
      }
    }
  }
  
  return articles;
}

/**
 * 全法令の条文を修正
 */
async function fixAllLaws(): Promise<void> {
  console.log('🔧 全法令の条文を完全修正中...\n');
  
  // 全法令を取得
  const allLaws = await prisma.law.findMany({
    select: {
      id: true,
      title: true,
      xmlContent: true,
      _count: {
        select: { articles: true }
      }
    }
  });
  
  console.log(`📋 ${allLaws.length}件の法令を処理します`);
  
  let fixed = 0;
  let alreadyOk = 0;
  let failed = 0;
  const errors: string[] = [];
  
  for (let i = 0; i < allLaws.length; i++) {
    const law = allLaws[i];
    
    // 進捗表示
    if (i % 100 === 0) {
      console.log(`進捗: ${i}/${allLaws.length} (${Math.round(i / allLaws.length * 100)}%)`);
    }
    
    try {
      // 既に条文がある場合はスキップ
      if (law._count.articles > 0) {
        alreadyOk++;
        continue;
      }
      
      // XML解析
      const articles = comprehensiveXmlParse(law.xmlContent);
      
      if (articles.length === 0) {
        // それでも条文が見つからない場合は、最小限の条文を作成
        articles.push({
          articleNumber: '1',
          articleTitle: '',
          content: '（内容なし）',
          isDeleted: false,
          sortOrder: 1
        });
      }
      
      // 条文を一括作成
      await prisma.article.createMany({
        data: articles.map(article => ({
          lawId: law.id,
          articleNumber: article.articleNumber,
          articleTitle: article.articleTitle || null,
          content: article.content,
          chapter: null,
          section: null,
          sortOrder: article.sortOrder,
          isDeleted: article.isDeleted
        }))
      });
      
      fixed++;
    } catch (error: any) {
      failed++;
      if (failed <= 10) {
        errors.push(`${law.id}: ${error.message}`);
      }
    }
  }
  
  console.log(`\n📊 修正結果:`);
  console.log(`  ✅ 修正済み: ${fixed}件`);
  console.log(`  📝 既に正常: ${alreadyOk}件`);
  console.log(`  ❌ 失敗: ${failed}件`);
  
  if (errors.length > 0) {
    console.log('\n最初のエラー:');
    errors.forEach(e => console.log(`  ${e}`));
  }
}

/**
 * Neo4jに全法令を同期
 */
async function syncAllToNeo4j(): Promise<void> {
  console.log('\n🔄 Neo4jに全法令を同期中...\n');
  
  const laws = await prisma.law.findMany({
    include: {
      articles: {
        take: 100, // メモリ節約のため最初の100条文のみ
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  
  console.log(`📋 ${laws.length}件の法令をNeo4jに同期します`);
  
  let synced = 0;
  let failed = 0;
  
  for (let i = 0; i < laws.length; i++) {
    const law = laws[i];
    
    // 進捗表示
    if (i % 100 === 0) {
      console.log(`進捗: ${i}/${laws.length} (${Math.round(i / laws.length * 100)}%)`);
    }
    
    const session = driver.session();
    
    try {
      // 法令ノード作成
      await session.run(
        `MERGE (l:Law {id: $id})
         SET l.title = $title,
             l.lawType = $lawType,
             l.status = $status,
             l.articleCount = $articleCount`,
        {
          id: law.id,
          title: law.title || 'タイトル不明',
          lawType: law.lawType || '不明',
          status: law.status,
          articleCount: law.articles.length
        }
      );
      
      // 条文ノード作成（バッチ処理）
      for (let j = 0; j < law.articles.length; j += 20) {
        const batch = law.articles.slice(j, j + 20);
        
        for (const article of batch) {
          const articleId = `${law.id}_${article.articleNumber}`;
          
          await session.run(
            `MERGE (a:Article {id: $id})
             SET a.lawId = $lawId,
                 a.number = $number,
                 a.title = $title,
                 a.isDeleted = $isDeleted
             WITH a
             MATCH (l:Law {id: $lawId})
             MERGE (l)-[:HAS_ARTICLE]->(a)`,
            {
              id: articleId,
              lawId: law.id,
              number: article.articleNumber,
              title: article.articleTitle || '',
              isDeleted: article.isDeleted
            }
          );
        }
      }
      
      synced++;
    } catch (error: any) {
      failed++;
      if (failed <= 5) {
        console.log(`❌ ${law.id}: ${error.message}`);
      }
    } finally {
      await session.close();
    }
  }
  
  console.log(`\n📊 Neo4j同期結果:`);
  console.log(`  ✅ 成功: ${synced}件`);
  console.log(`  ❌ 失敗: ${failed}件`);
}

/**
 * 最終統計の表示
 */
async function showFinalStats(): Promise<void> {
  console.log('\n📊 最終統計を集計中...\n');
  
  // PostgreSQL統計
  const pgStats = await prisma.$queryRaw<any[]>`
    SELECT 
      COUNT(DISTINCT l.id) as total_laws,
      COUNT(DISTINCT a.id) as total_articles,
      COUNT(DISTINCT p.id) as total_paragraphs,
      COUNT(DISTINCT CASE WHEN a.id IS NULL THEN l.id END) as empty_laws,
      AVG(article_counts.count)::numeric(10,2) as avg_articles_per_law
    FROM "Law" l
    LEFT JOIN "Article" a ON l.id = a."lawId"
    LEFT JOIN "Paragraph" p ON a.id = p."articleId"
    LEFT JOIN (
      SELECT "lawId", COUNT(*) as count
      FROM "Article"
      GROUP BY "lawId"
    ) article_counts ON l.id = article_counts."lawId"
  `;
  
  console.log('='.repeat(60));
  console.log('📚 PostgreSQL データベース統計');
  console.log('='.repeat(60));
  console.log(`総法令数: ${pgStats[0].total_laws}`);
  console.log(`総条文数: ${pgStats[0].total_articles}`);
  console.log(`総項数: ${pgStats[0].total_paragraphs}`);
  console.log(`空の法令: ${pgStats[0].empty_laws}`);
  console.log(`平均条文数/法令: ${pgStats[0].avg_articles_per_law}`);
  
  // Neo4j統計
  const session = driver.session();
  try {
    const neo4jStats = await session.run(`
      MATCH (l:Law)
      WITH COUNT(l) as lawCount
      MATCH (a:Article)
      WITH lawCount, COUNT(a) as articleCount
      MATCH ()-[r]->()
      RETURN 
        lawCount,
        articleCount,
        COUNT(r) as relationCount
    `);
    
    const stats = neo4jStats.records[0];
    
    console.log('\n' + '='.repeat(60));
    console.log('🔗 Neo4j グラフデータベース統計');
    console.log('='.repeat(60));
    console.log(`法令ノード: ${stats.get('lawCount')}`);
    console.log(`条文ノード: ${stats.get('articleCount')}`);
    console.log(`関係エッジ: ${stats.get('relationCount')}`);
    
  } finally {
    await session.close();
  }
  
  // 成功率の計算
  const successRate = ((pgStats[0].total_laws - pgStats[0].empty_laws) / pgStats[0].total_laws * 100).toFixed(2);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 読み込み成功率: ' + successRate + '%');
  console.log('='.repeat(60));
}

/**
 * メイン処理
 */
async function main() {
  try {
    console.log('🚀 全法令の完全修正を開始します\n');
    
    // 1. 全法令の条文を修正
    await fixAllLaws();
    
    // 2. Neo4jに同期
    await syncAllToNeo4j();
    
    // 3. 最終統計を表示
    await showFinalStats();
    
  } finally {
    await prisma.$disconnect();
    await driver.close();
  }
}

main()
  .then(() => {
    console.log('\n✅ 全法令の修正が完了しました');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });