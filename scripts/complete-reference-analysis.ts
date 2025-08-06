#!/usr/bin/env npx tsx
/**
 * 全法令の参照関係を完全分析
 */

import { PrismaClient } from '@prisma/client';
import neo4j from 'neo4j-driver';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
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

const detector = new ComprehensiveReferenceDetector();

interface ReferenceStats {
  totalLaws: number;
  totalArticles: number;
  totalReferences: number;
  referenceTypes: Record<string, number>;
  topReferencedLaws: Array<{ lawId: string; title: string; count: number }>;
  topReferencingLaws: Array<{ lawId: string; title: string; count: number }>;
}

/**
 * 全法令の参照関係を分析
 */
async function analyzeAllReferences(): Promise<ReferenceStats> {
  console.log('🔍 全法令の参照関係を分析中...\n');
  
  const stats: ReferenceStats = {
    totalLaws: 0,
    totalArticles: 0,
    totalReferences: 0,
    referenceTypes: {},
    topReferencedLaws: [],
    topReferencingLaws: []
  };
  
  // 全法令を取得
  const laws = await prisma.law.findMany({
    include: {
      articles: {
        where: { isDeleted: false },
        orderBy: { sortOrder: 'asc' }
      }
    }
  });
  
  stats.totalLaws = laws.length;
  console.log(`📚 ${stats.totalLaws}件の法令を処理します\n`);
  
  const lawReferenceCount: Record<string, number> = {};
  const lawReferencingCount: Record<string, number> = {};
  
  // バッチ処理
  for (let i = 0; i < laws.length; i++) {
    const law = laws[i];
    
    if (i % 100 === 0) {
      console.log(`進捗: ${i}/${laws.length} (${Math.round(i / laws.length * 100)}%)`);
    }
    
    let lawRefCount = 0;
    
    for (const article of law.articles) {
      stats.totalArticles++;
      
      // 参照を検出
      const references = detector.detectAllReferences(article.content);
      
      for (const ref of references) {
        stats.totalReferences++;
        stats.referenceTypes[ref.type] = (stats.referenceTypes[ref.type] || 0) + 1;
        
        // 外部参照の場合、参照先法令をカウント
        if (ref.type === 'external' && ref.targetLaw) {
          lawReferenceCount[ref.targetLaw] = (lawReferenceCount[ref.targetLaw] || 0) + 1;
          lawRefCount++;
        }
      }
    }
    
    if (lawRefCount > 0) {
      lawReferencingCount[law.id] = lawRefCount;
    }
  }
  
  // トップ10を集計
  const referencedEntries = Object.entries(lawReferenceCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  const referencingEntries = Object.entries(lawReferencingCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  
  // 法令タイトルを取得
  for (const [lawName, count] of referencedEntries) {
    const law = laws.find(l => l.title.includes(lawName));
    stats.topReferencedLaws.push({
      lawId: law?.id || lawName,
      title: law?.title || lawName,
      count
    });
  }
  
  for (const [lawId, count] of referencingEntries) {
    const law = laws.find(l => l.id === lawId);
    stats.topReferencingLaws.push({
      lawId,
      title: law?.title || 'タイトル不明',
      count
    });
  }
  
  return stats;
}

/**
 * Neo4jに参照関係を保存
 */
async function saveReferencesToNeo4j(limit: number = 1000): Promise<void> {
  console.log('\n🔄 Neo4jに参照関係を保存中...\n');
  
  const laws = await prisma.law.findMany({
    include: {
      articles: {
        where: { isDeleted: false },
        take: 10 // メモリ節約
      }
    },
    take: limit
  });
  
  let savedCount = 0;
  let errorCount = 0;
  
  for (const law of laws) {
    const session = driver.session();
    
    try {
      for (const article of law.articles) {
        const references = detector.detectAllReferences(article.content);
        const sourceId = `${law.id}_${article.articleNumber}`;
        
        for (const ref of references) {
          try {
            if (ref.type === 'internal' && ref.targetArticle) {
              // 内部参照
              await session.run(`
                MATCH (source:Article {id: $sourceId})
                MERGE (target:Article {lawId: $lawId, number: $targetNumber})
                MERGE (source)-[r:INTERNAL_REF {
                  confidence: $confidence,
                  text: $text
                }]->(target)
              `, {
                sourceId,
                lawId: law.id,
                targetNumber: ref.targetArticle,
                confidence: ref.confidence,
                text: ref.text.substring(0, 200)
              });
              savedCount++;
              
            } else if (ref.type === 'external' && ref.targetLaw) {
              // 外部参照
              await session.run(`
                MATCH (source:Article {id: $sourceId})
                MERGE (targetLaw:Law {title: $targetLawTitle})
                MERGE (source)-[r:EXTERNAL_REF {
                  targetLaw: $targetLaw,
                  targetArticle: $targetArticle,
                  text: $text
                }]->(targetLaw)
              `, {
                sourceId,
                targetLaw: ref.targetLaw,
                targetLawTitle: ref.targetLaw,
                targetArticle: ref.targetArticle || '',
                text: ref.text.substring(0, 200)
              });
              savedCount++;
              
            } else if (ref.type === 'relative') {
              // 相対参照
              await session.run(`
                MATCH (source:Article {id: $sourceId})
                MERGE (source)-[r:RELATIVE_REF {
                  direction: $direction,
                  distance: $distance,
                  text: $text
                }]->(source)
              `, {
                sourceId,
                direction: ref.relativeType || 'previous',
                distance: ref.relativeDistance || 1,
                text: ref.text.substring(0, 200)
              });
              savedCount++;
            }
            
            if (savedCount % 100 === 0) {
              console.log(`  保存済み: ${savedCount}件`);
            }
          } catch (error) {
            errorCount++;
          }
        }
      }
    } finally {
      await session.close();
    }
  }
  
  console.log(`\n✅ 参照関係の保存完了: ${savedCount}件（エラー: ${errorCount}件）`);
}

/**
 * 分析結果を表示
 */
function displayStats(stats: ReferenceStats): void {
  console.log('\n' + '='.repeat(60));
  console.log('📊 参照関係分析結果');
  console.log('='.repeat(60));
  
  console.log(`\n📈 基本統計:`);
  console.log(`  総法令数: ${stats.totalLaws.toLocaleString()}`);
  console.log(`  総条文数: ${stats.totalArticles.toLocaleString()}`);
  console.log(`  総参照数: ${stats.totalReferences.toLocaleString()}`);
  console.log(`  平均参照数/条文: ${(stats.totalReferences / stats.totalArticles).toFixed(2)}`);
  
  console.log(`\n📋 参照タイプ別統計:`);
  const sortedTypes = Object.entries(stats.referenceTypes)
    .sort((a, b) => b[1] - a[1]);
  
  for (const [type, count] of sortedTypes) {
    const percentage = ((count / stats.totalReferences) * 100).toFixed(1);
    console.log(`  ${type}: ${count.toLocaleString()}件 (${percentage}%)`);
  }
  
  console.log(`\n🏆 最も参照されている法令トップ10:`);
  stats.topReferencedLaws.forEach((law, i) => {
    console.log(`  ${i + 1}. ${law.title}: ${law.count}回`);
  });
  
  console.log(`\n📚 最も多く参照している法令トップ10:`);
  stats.topReferencingLaws.forEach((law, i) => {
    console.log(`  ${i + 1}. ${law.title}: ${law.count}件`);
  });
}

/**
 * メイン処理
 */
async function main() {
  try {
    // 1. 参照関係を分析
    const stats = await analyzeAllReferences();
    
    // 2. 結果を表示
    displayStats(stats);
    
    // 3. Neo4jに保存（最初の1000法令のみ）
    await saveReferencesToNeo4j(1000);
    
    // 4. Neo4j統計
    const session = driver.session();
    try {
      const neo4jStats = await session.run(`
        MATCH ()-[r]->()
        WHERE type(r) IN ['INTERNAL_REF', 'EXTERNAL_REF', 'RELATIVE_REF']
        RETURN type(r) as refType, COUNT(r) as count
        ORDER BY count DESC
      `);
      
      console.log('\n📊 Neo4jグラフ統計:');
      neo4jStats.records.forEach(record => {
        console.log(`  ${record.get('refType')}: ${record.get('count')}件`);
      });
    } finally {
      await session.close();
    }
    
  } finally {
    await prisma.$disconnect();
    await driver.close();
  }
}

main()
  .then(() => {
    console.log('\n✅ 参照分析完了');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ エラー:', error);
    process.exit(1);
  });