#!/usr/bin/env npx tsx
/**
 * 参照関係グラフ構築スクリプト
 * PostgreSQLの法令データから参照を検出してNeo4jにグラフを構築
 */

import { PrismaClient } from '../src/generated/prisma-pg';
import neo4j from 'neo4j-driver';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

const prisma = new PrismaClient();
const detector = new ComprehensiveReferenceDetector();

const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'lawfinder123'
  )
);

interface BuildStats {
  laws: number;
  articles: number;
  references: number;
  internalRefs: number;
  externalRefs: number;
  relativeRefs: number;
  startTime: number;
}

async function buildReferenceGraph() {
  console.log('🚀 参照関係グラフの構築を開始します...\n');
  
  const stats: BuildStats = {
    laws: 0,
    articles: 0,
    references: 0,
    internalRefs: 0,
    externalRefs: 0,
    relativeRefs: 0,
    startTime: performance.now()
  };

  const session = driver.session();

  try {
    // 1. Neo4jスキーマの初期化
    console.log('📝 Neo4jスキーマを初期化中...');
    await initializeSchema(session);

    // 2. 既存データのクリア
    console.log('🗑️  既存のグラフをクリア中...');
    await session.run('MATCH (n) DETACH DELETE n');

    // 3. 法令データの取得
    console.log('📚 法令データを取得中...');
    const laws = await prisma.law.findMany({
      include: {
        articles: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    console.log(`  ${laws.length}法令、${laws.reduce((sum, l) => sum + l.articles.length, 0)}条文を処理します\n`);

    // 4. 各法令を処理
    for (const law of laws) {
      console.log(`\n📖 ${law.title}（${law.id}）を処理中...`);
      stats.laws++;

      // 法令ノード作成
      await session.run(
        `CREATE (l:Law {
          id: $id,
          title: $title,
          shortTitle: $shortTitle,
          lawType: $lawType,
          status: $status
        })`,
        {
          id: law.id,
          title: law.title,
          shortTitle: extractShortTitle(law.title),
          lawType: law.lawType || '法律',
          status: law.status
        }
      );

      // 条文ノードと参照関係の作成
      let lawReferences = 0;
      for (const article of law.articles) {
        stats.articles++;
        
        // 条文ノード作成
        await session.run(
          `MATCH (l:Law {id: $lawId})
           CREATE (a:Article {
             id: $id,
             lawId: $lawId,
             number: $number,
             title: $title,
             chapter: $chapter,
             section: $section,
             isDeleted: $isDeleted
           })
           CREATE (l)-[:HAS_ARTICLE]->(a)`,
          {
            id: `${law.id}_${article.articleNumber}`,
            lawId: law.id,
            number: article.articleNumber,
            title: article.articleTitle || '',
            chapter: article.chapter || '',
            section: article.section || '',
            isDeleted: article.isDeleted
          }
        );

        // 参照検出と関係作成
        const references = detector.detectAllReferences(article.content);
        lawReferences += references.length;
        
        for (const ref of references) {
          await createReference(session, law.id, article.articleNumber, ref, stats);
        }
      }

      console.log(`  ✅ ${law.articles.length}条、${lawReferences}参照を処理`);
    }

    // 5. 統計表示
    const elapsed = (performance.now() - stats.startTime) / 1000;
    console.log('\n' + '='.repeat(60));
    console.log('📊 グラフ構築完了');
    console.log('='.repeat(60));
    console.log(`法令数: ${stats.laws}`);
    console.log(`条文数: ${stats.articles}`);
    console.log(`総参照数: ${stats.references}`);
    console.log(`  内部参照: ${stats.internalRefs}`);
    console.log(`  外部参照: ${stats.externalRefs}`);
    console.log(`  相対参照: ${stats.relativeRefs}`);
    console.log(`処理時間: ${elapsed.toFixed(2)}秒`);
    console.log('='.repeat(60));

  } finally {
    await session.close();
  }
}

async function initializeSchema(session: any) {
  const constraints = [
    'CREATE CONSTRAINT law_id IF NOT EXISTS FOR (l:Law) REQUIRE l.id IS UNIQUE',
    'CREATE CONSTRAINT article_id IF NOT EXISTS FOR (a:Article) REQUIRE a.id IS UNIQUE',
    'CREATE INDEX law_title IF NOT EXISTS FOR (l:Law) ON (l.title)',
    'CREATE INDEX article_number IF NOT EXISTS FOR (a:Article) ON (a.number)'
  ];

  for (const constraint of constraints) {
    try {
      await session.run(constraint);
    } catch (e) {
      // 既に存在する場合は無視
    }
  }
}

async function createReference(session: any, lawId: string, articleNumber: string, ref: any, stats: BuildStats) {
  const sourceId = `${lawId}_${articleNumber}`;
  
  try {
    switch (ref.type) {
      case 'internal':
        // 同一法令内の参照
        if (ref.targetArticle) {
          const targetId = `${lawId}_${ref.targetArticle}`;
          await session.run(
            `MATCH (source:Article {id: $sourceId})
             MATCH (target:Article {id: $targetId})
             CREATE (source)-[:REFERS_TO {
               type: 'internal',
               text: $text,
               confidence: $confidence
             }]->(target)`,
            {
              sourceId,
              targetId,
              text: ref.text,
              confidence: ref.confidence
            }
          );
          stats.internalRefs++;
        }
        break;

      case 'external':
        // 他法令への参照
        if (ref.targetLaw) {
          await session.run(
            `MATCH (source:Article {id: $sourceId})
             MERGE (targetLaw:Law {title: $lawName})
             CREATE (source)-[:REFERS_TO_LAW {
               type: 'external',
               lawName: $lawName,
               articleNumber: $articleNumber,
               text: $text,
               confidence: $confidence
             }]->(targetLaw)`,
            {
              sourceId,
              lawName: ref.targetLaw,
              articleNumber: ref.targetArticle || '',
              text: ref.text,
              confidence: ref.confidence
            }
          );
          stats.externalRefs++;
        }
        break;

      case 'relative':
        // 相対参照（前条、次条など）
        if (ref.relativeType && ref.relativeDistance) {
          await session.run(
            `MATCH (source:Article {id: $sourceId})
             MATCH (source)<-[:HAS_ARTICLE]-(l:Law)-[:HAS_ARTICLE]->(target:Article)
             WHERE target.lawId = source.lawId
             WITH source, target, toInteger(split(source.number, '_')[0]) as sourceNum, 
                  toInteger(split(target.number, '_')[0]) as targetNum
             WHERE CASE $direction
               WHEN 'previous' THEN targetNum = sourceNum - $distance
               WHEN 'next' THEN targetNum = sourceNum + $distance
               ELSE false
             END
             CREATE (source)-[:RELATIVE_REF {
               direction: $direction,
               distance: $distance,
               text: $text
             }]->(target)`,
            {
              sourceId,
              direction: ref.relativeType,
              distance: ref.relativeDistance,
              text: ref.text
            }
          );
          stats.relativeRefs++;
        }
        break;
    }
    
    stats.references++;
  } catch (error) {
    // エラーは無視（参照先が見つからない場合など）
  }
}

function extractShortTitle(fullTitle: string): string {
  const match = fullTitle.match(/（([^）]+)）/);
  if (match) return match[1];
  
  const lawMatch = fullTitle.match(/([^（]+法)/);
  if (lawMatch) return lawMatch[1];
  
  return fullTitle;
}

// 実行
buildReferenceGraph()
  .then(async () => {
    // グラフ統計の取得
    const session = driver.session();
    try {
      const result = await session.run(`
        MATCH (l:Law)
        OPTIONAL MATCH (l)-[:HAS_ARTICLE]->(a:Article)
        OPTIONAL MATCH (a)-[r]->()
        RETURN count(DISTINCT l) as laws,
               count(DISTINCT a) as articles,
               count(r) as relationships
      `);
      
      const record = result.records[0];
      console.log('\n📈 Neo4jグラフ統計:');
      console.log(`  法令ノード: ${record.get('laws')}`);
      console.log(`  条文ノード: ${record.get('articles')}`);
      console.log(`  参照エッジ: ${record.get('relationships')}`);
      
    } finally {
      await session.close();
    }
    
    console.log('\n✅ 参照関係グラフの構築が完了しました！');
    console.log('   Neo4j Browser: http://localhost:7474');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ エラー:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await driver.close();
  });