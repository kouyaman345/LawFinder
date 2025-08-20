#!/usr/bin/env tsx

/**
 * 参照データの再構築（フィルタリング版）
 * 既存の検出エンジンを使い、明らかな誤検出のみを除外
 */

import { PrismaClient } from '@prisma/client';
import { ImprovedReferenceDetector } from '../src/domain/services/ImprovedReferenceDetector';
import neo4j from 'neo4j-driver';

const prisma = new PrismaClient();

class FilteredReferenceBuilder {
  private detector: ImprovedReferenceDetector;
  private lawTitleMap: Map<string, string> = new Map();
  
  // 主要法令の確実なマッピング
  private readonly KNOWN_LAW_MAPPINGS: Record<string, string> = {
    '民法': '129AC0000000089',
    '刑法': '140AC0000000045',
    '商法': '132AC0000000048',
    '会社法': '417AC0000000086',
    '労働基準法': '322AC0000000049',
    '民事訴訟法': '408AC0000000109',
    '刑事訴訟法': '323AC0000000131',
    '憲法': '321CO0000000000',
    '日本国憲法': '321CO0000000000',
    '行政手続法': '405AC0000000088',
    '地方自治法': '322AC0000000067',
  };

  constructor() {
    this.detector = new ImprovedReferenceDetector();
  }

  async initialize() {
    // 法令タイトルマップを構築
    const laws = await prisma.lawMaster.findMany({
      select: { id: true, title: true }
    });
    
    for (const law of laws) {
      if (law.title) {
        this.lawTitleMap.set(law.id, law.title);
      }
    }
    
    console.log(`✅ ${laws.length}件の法令情報を読み込みました`);
  }

  processReferences(content: string, sourceLawId: string): any[] {
    // 既存の検出エンジンを使用
    const detectedRefs = this.detector.detectAllReferences(content);
    const processedRefs = [];
    
    for (const ref of detectedRefs) {
      // フィルタリング: 明らかな誤検出を除外
      if (this.shouldExclude(ref)) {
        continue;
      }
      
      // targetLawIdの改善
      let targetLawId = ref.targetLawId;
      
      // 外部参照の場合、法令名からIDを特定
      if (ref.type === 'external' && ref.targetLaw) {
        targetLawId = this.findLawIdByName(ref.targetLaw) || targetLawId;
      }
      
      // 内部参照、相対参照、構造参照は同一法令
      if (ref.type === 'internal' || ref.type === 'relative' || ref.type === 'structural') {
        targetLawId = sourceLawId;
      }
      
      processedRefs.push({
        ...ref,
        targetLawId: targetLawId || sourceLawId,
        sourceLawId: sourceLawId
      });
    }
    
    return processedRefs;
  }

  private shouldExclude(ref: any): boolean {
    const text = ref.text || '';
    
    // 1. 単独の見出し（括弧のみ）を除外
    if (text.match(/^（[^）]+）$/) && !text.includes('法') && !text.includes('第')) {
      return true;
    }
    
    // 2. 「○○の方法」「○○の手続」などの一般的な見出しを除外
    if (text.match(/^（.*(の方法|の手続|の基準|の要件|の期間|の期限)）$/)) {
      return true;
    }
    
    // 3. 法令名を含まない短い括弧内テキスト
    if (text.match(/^（[^法]{1,10}）$/) && !text.includes('第')) {
      return true;
    }
    
    // 4. 数字のみの参照
    if (text.match(/^[0-9]+$/)) {
      return true;
    }
    
    return false;
  }

  private findLawIdByName(lawName: string): string | null {
    // 既知のマッピング
    if (this.KNOWN_LAW_MAPPINGS[lawName]) {
      return this.KNOWN_LAW_MAPPINGS[lawName];
    }
    
    // タイトルから検索
    for (const [id, title] of this.lawTitleMap.entries()) {
      if (title === lawName || title.includes(lawName) || lawName.includes(title)) {
        return id;
      }
    }
    
    return null;
  }
}

async function rebuildReferences() {
  console.log('='.repeat(80));
  console.log('🔄 参照データの再構築（フィルタリング版）');
  console.log('='.repeat(80));
  
  const builder = new FilteredReferenceBuilder();
  await builder.initialize();
  
  try {
    // 既存データをクリア
    console.log('\n🗑️ 既存の参照データをクリア...');
    await prisma.reference.deleteMany();
    console.log('✅ クリア完了');
    
    // 法令データを処理
    const laws = await prisma.lawMaster.findMany();
    console.log(`\n📊 処理対象: ${laws.length}法令`);
    
    let totalReferences = 0;
    let externalCount = 0;
    let internalCount = 0;
    let processedLaws = 0;
    const batchSize = 500;
    const references: any[] = [];
    
    for (const law of laws) {
      processedLaws++;
      
      // 条文を取得
      const articles = await prisma.article.findMany({
        where: {
          versionId: {
            startsWith: law.id
          }
        },
        orderBy: { sortOrder: 'asc' },
        take: 500
      });
      
      // 各条文から参照を検出
      for (const article of articles) {
        const detectedRefs = builder.processReferences(article.content, law.id);
        
        for (const ref of detectedRefs) {
          // 自己参照でない外部参照をカウント
          if (ref.type === 'external' && ref.targetLawId && ref.targetLawId !== law.id) {
            externalCount++;
          } else if (ref.type === 'internal' || ref.targetLawId === law.id) {
            internalCount++;
          }
          
          references.push({
            sourceVersionId: article.versionId,
            sourceLawId: law.id,
            sourceArticle: article.articleNumber,
            targetVersionId: null,
            targetLawId: ref.targetLawId,
            targetArticle: ref.targetArticle,
            referenceType: ref.type,
            referenceText: ref.text,
            confidence: ref.confidence || 0.8,
            metadata: ref.metadata || {}
          });
          
          // バッチ処理
          if (references.length >= batchSize) {
            await prisma.reference.createMany({
              data: references,
              skipDuplicates: true
            });
            totalReferences += references.length;
            references.length = 0;
          }
        }
      }
      
      // 進捗表示
      if (processedLaws % 100 === 0) {
        console.log(`[${processedLaws}/${laws.length}] 処理中... (総: ${totalReferences}, 外部: ${externalCount}, 内部: ${internalCount})`);
      }
    }
    
    // 残りを処理
    if (references.length > 0) {
      await prisma.reference.createMany({
        data: references,
        skipDuplicates: true
      });
      totalReferences += references.length;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ 参照データ再構築完了');
    console.log(`  総参照数: ${totalReferences}`);
    console.log(`  外部参照: ${externalCount}`);
    console.log(`  内部参照: ${internalCount}`);
    console.log('='.repeat(80));
    
    // 統計確認
    const stats = await prisma.reference.groupBy({
      by: ['referenceType'],
      _count: true,
      orderBy: { _count: { referenceType: 'desc' } }
    });
    
    console.log('\n📊 参照タイプ別統計:');
    stats.forEach(stat => {
      console.log(`  ${stat.referenceType}: ${stat._count}件`);
    });
    
    // 最も参照されている法令TOP10
    const topTargets = await prisma.$queryRaw`
      SELECT t."targetLawId", COUNT(*) as count
      FROM "Reference" t
      WHERE t."targetLawId" IS NOT NULL
        AND t."targetLawId" <> t."sourceLawId"
      GROUP BY t."targetLawId"
      ORDER BY count DESC
      LIMIT 10
    ` as any[];
    
    console.log('\n📝 最も参照されている法令TOP10:');
    for (const target of topTargets) {
      const law = await prisma.lawMaster.findUnique({
        where: { id: target.targetLawId },
        select: { title: true }
      });
      console.log(`  ${law?.title || target.targetLawId}: ${target.count}件`);
    }
    
    // 問題の法令をチェック
    const problemCheck = await prisma.reference.count({
      where: { 
        targetLawId: '507M60400000008',
        sourceLawId: { not: '507M60400000008' }
      }
    });
    
    console.log(`\n✅ 507M60400000008への外部参照: ${problemCheck}件`);
    
  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Neo4jへの同期
async function syncToNeo4j() {
  console.log('\n🔄 Neo4jへの同期開始...');
  
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'lawfinder123')
  );
  
  const session = driver.session();
  
  try {
    // Neo4jをクリア
    await session.run('MATCH (n) DETACH DELETE n');
    console.log('✅ Neo4jクリア完了');
    
    // 法令ノードを作成
    const laws = await prisma.lawMaster.findMany();
    console.log(`📝 ${laws.length}件の法令ノードを作成中...`);
    
    const nodeBatch = [];
    for (const law of laws) {
      nodeBatch.push({
        id: law.id,
        title: law.title || law.id,
        lawNumber: law.lawNumber || law.id
      });
      
      if (nodeBatch.length >= 100) {
        await session.run(`
          UNWIND $laws as law
          CREATE (n:Law {
            id: law.id,
            title: law.title,
            lawNumber: law.lawNumber
          })
        `, { laws: nodeBatch });
        nodeBatch.length = 0;
      }
    }
    
    if (nodeBatch.length > 0) {
      await session.run(`
        UNWIND $laws as law
        CREATE (n:Law {
          id: law.id,
          title: law.title,
          lawNumber: law.lawNumber
        })
      `, { laws: nodeBatch });
    }
    
    // 参照関係を追加
    const references = await prisma.reference.findMany();
    console.log(`🔗 ${references.length}件の参照関係を作成中...`);
    
    const refBatch = [];
    for (const ref of references) {
      const isExternal = ref.targetLawId && ref.targetLawId !== ref.sourceLawId;
      
      refBatch.push({
        sourceId: ref.sourceLawId,
        targetId: ref.targetLawId || ref.sourceLawId,
        type: ref.referenceType,
        text: ref.referenceText,
        isExternal: isExternal
      });
      
      if (refBatch.length >= 500) {
        await session.run(`
          UNWIND $refs as ref
          MATCH (source:Law {id: ref.sourceId})
          MATCH (target:Law {id: ref.targetId})
          CREATE (source)-[r:REFERENCES {
            type: ref.type,
            text: ref.text,
            isExternal: ref.isExternal
          }]->(target)
        `, { refs: refBatch });
        refBatch.length = 0;
      }
    }
    
    if (refBatch.length > 0) {
      await session.run(`
        UNWIND $refs as ref
        MATCH (source:Law {id: ref.sourceId})
        MATCH (target:Law {id: ref.targetId})
        CREATE (source)-[r:REFERENCES {
          type: ref.type,
          text: ref.text,
          isExternal: ref.isExternal
        }]->(target)
      `, { refs: refBatch });
    }
    
    console.log('✅ Neo4j同期完了');
    
  } finally {
    await session.close();
    await driver.close();
  }
}

// メイン処理
async function main() {
  await rebuildReferences();
  await syncToNeo4j();
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 すべての処理が完了しました！');
  console.log('\n🌐 Neo4j Browser: http://localhost:7474');
  console.log('   認証: neo4j / lawfinder123');
  console.log('\n📊 推奨クエリ:');
  console.log('   MATCH (a:Law)-[r:REFERENCES {isExternal: true}]->(b:Law)');
  console.log('   WHERE a.id <> b.id');
  console.log('   RETURN a, r, b LIMIT 100');
  console.log('='.repeat(80));
}

main().catch(console.error);