#!/usr/bin/env tsx

/**
 * 拡張位置情報付き参照データをNeo4jに同期
 * EnhancedReference型に対応
 */

import neo4j, { Driver, Session } from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';
import { logger } from '../src/lib/logger';
import * as fs from 'fs';
import * as path from 'path';
import { normalizeArticleNumber, toNumericFormat, toDisplayFormat } from '../src/utils/article-normalizer';

const prisma = new PrismaClient();

interface EnhancedReferenceData {
  id: string;
  sourceLawId: string;
  sourceArticle: string;
  targetLawId: string;
  targetArticle: string;
  referenceText: string;
  referenceType: string;
  confidence: number;
  detectionMethod: string;
  
  // 拡張位置情報
  sourceStartPos?: number;
  sourceEndPos?: number;
  sourceLineNumber?: number;
  sourceParagraphNumber?: number;
  sourceItemNumber?: string;
  targetParagraphNumber?: number;
  targetItemNumber?: string;
  
  // 範囲参照
  rangeStart?: string;
  rangeEnd?: string;
}

class EnhancedNeo4jSync {
  private driver: Driver;
  private session: Session;
  
  constructor() {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'lawfinder123';
    
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    this.session = this.driver.session();
  }
  
  /**
   * 接続テスト
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.session.run('RETURN 1');
      console.log(chalk.green('✅ Neo4j接続成功'));
      return true;
    } catch (error) {
      console.error(chalk.red('❌ Neo4j接続失敗:'), error);
      return false;
    }
  }
  
  /**
   * スキーマのセットアップ
   */
  async setupSchema() {
    console.log(chalk.cyan('📐 スキーマ設定中...'));
    
    // インデックスと制約の作成（Community Editionに対応）
    const constraints = [
      // 法令ノード
      `CREATE CONSTRAINT law_id_unique IF NOT EXISTS
       FOR (l:Law) REQUIRE l.id IS UNIQUE`
    ];
    
    const indexes = [
      // ノード用インデックス
      `CREATE INDEX article_composite_index IF NOT EXISTS
       FOR (a:Article) ON (a.lawId, a.number)`,
      
      `CREATE INDEX paragraph_composite_index IF NOT EXISTS
       FOR (p:Paragraph) ON (p.lawId, p.articleNumber, p.number)`,
      
      `CREATE INDEX item_composite_index IF NOT EXISTS
       FOR (i:Item) ON (i.lawId, i.articleNumber, i.paragraphNumber, i.number)`,
      
      // 参照エッジ用インデックス
      `CREATE INDEX reference_type_index IF NOT EXISTS
       FOR ()-[r:REFERENCES]-() ON (r.type)`,
      
      `CREATE INDEX reference_confidence_index IF NOT EXISTS
       FOR ()-[r:REFERENCES]-() ON (r.confidence)`,
      
      `CREATE INDEX reference_position_index IF NOT EXISTS
       FOR ()-[r:REFERENCES]-() ON (r.sourceStartPos)`
    ];
    
    // 制約を実行
    for (const constraint of constraints) {
      try {
        await this.session.run(constraint);
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          console.error(chalk.yellow(`⚠️ 制約作成エラー: ${error.message}`));
        }
      }
    }
    
    // インデックスを実行
    for (const index of indexes) {
      try {
        await this.session.run(index);
      } catch (error: any) {
        if (!error.message.includes('already exists')) {
          console.error(chalk.yellow(`⚠️ インデックス作成エラー: ${error.message}`));
        }
      }
    }
    
    console.log(chalk.green('✅ スキーマ設定完了'));
  }
  
  /**
   * 法令ノードの作成または更新
   */
  async upsertLawNode(lawId: string, lawName?: string) {
    const query = `
      MERGE (l:Law {id: $lawId})
      SET l.name = coalesce($lawName, l.name, $lawId)
      RETURN l
    `;
    
    await this.session.run(query, { lawId, lawName });
  }
  
  /**
   * 条文ノードの作成または更新
   */
  async upsertArticleNode(lawId: string, articleNumber: string) {
    // 条文番号を正規化
    const normalized = toNumericFormat(articleNumber);
    const display = toDisplayFormat(articleNumber);
    
    const query = `
      MERGE (a:Article {lawId: $lawId, number: $normalized})
      SET a.displayNumber = $display,
          a.originalNumber = $original
      RETURN a
    `;
    
    await this.session.run(query, { 
      lawId, 
      normalized,
      display,
      original: articleNumber
    });
    
    // 法令との関係を作成
    const relationQuery = `
      MATCH (l:Law {id: $lawId})
      MATCH (a:Article {lawId: $lawId, number: $normalized})
      MERGE (l)-[:HAS_ARTICLE]->(a)
    `;
    
    await this.session.run(relationQuery, { lawId, normalized });
  }
  
  /**
   * 項ノードの作成または更新
   */
  async upsertParagraphNode(
    lawId: string, 
    articleNumber: string, 
    paragraphNumber: number
  ) {
    const query = `
      MERGE (p:Paragraph {
        lawId: $lawId, 
        articleNumber: $articleNumber, 
        number: $paragraphNumber
      })
      RETURN p
    `;
    
    await this.session.run(query, { lawId, articleNumber, paragraphNumber });
    
    // 条文との関係を作成
    const relationQuery = `
      MATCH (a:Article {lawId: $lawId, number: $articleNumber})
      MATCH (p:Paragraph {
        lawId: $lawId, 
        articleNumber: $articleNumber, 
        number: $paragraphNumber
      })
      MERGE (a)-[:HAS_PARAGRAPH]->(p)
    `;
    
    await this.session.run(relationQuery, { lawId, articleNumber, paragraphNumber });
  }
  
  /**
   * 拡張参照エッジの作成
   */
  async createEnhancedReference(ref: EnhancedReferenceData) {
    // ソースとターゲットのノードを作成
    await this.upsertLawNode(ref.sourceLawId, null);
    await this.upsertLawNode(ref.targetLawId, null);
    await this.upsertArticleNode(ref.sourceLawId, ref.sourceArticle);
    await this.upsertArticleNode(ref.targetLawId, ref.targetArticle);
    
    // 項がある場合は項ノードも作成
    let sourceNode = 'a1';
    let targetNode = 'a2';
    
    if (ref.sourceParagraphNumber) {
      await this.upsertParagraphNode(
        ref.sourceLawId, 
        ref.sourceArticle, 
        ref.sourceParagraphNumber
      );
      sourceNode = 'p1';
    }
    
    if (ref.targetParagraphNumber) {
      await this.upsertParagraphNode(
        ref.targetLawId,
        ref.targetArticle,
        ref.targetParagraphNumber
      );
      targetNode = 'p2';
    }
    
    // 参照エッジの作成クエリ
    let matchQuery = '';
    let createQuery = '';
    
    if (sourceNode === 'p1' && targetNode === 'p2') {
      // 項から項への参照
      matchQuery = `
        MATCH (p1:Paragraph {
          lawId: $sourceLawId,
          articleNumber: $sourceArticle,
          number: $sourceParagraphNumber
        })
        MATCH (p2:Paragraph {
          lawId: $targetLawId,
          articleNumber: $targetArticle,
          number: $targetParagraphNumber
        })
      `;
      createQuery = `(p1)-[r:REFERENCES]->(p2)`;
    } else if (sourceNode === 'p1') {
      // 項から条文への参照
      matchQuery = `
        MATCH (p1:Paragraph {
          lawId: $sourceLawId,
          articleNumber: $sourceArticle,
          number: $sourceParagraphNumber
        })
        MATCH (a2:Article {lawId: $targetLawId, number: $targetArticle})
      `;
      createQuery = `(p1)-[r:REFERENCES]->(a2)`;
    } else if (targetNode === 'p2') {
      // 条文から項への参照
      matchQuery = `
        MATCH (a1:Article {lawId: $sourceLawId, number: $sourceArticle})
        MATCH (p2:Paragraph {
          lawId: $targetLawId,
          articleNumber: $targetArticle,
          number: $targetParagraphNumber
        })
      `;
      createQuery = `(a1)-[r:REFERENCES]->(p2)`;
    } else {
      // 条文から条文への参照
      matchQuery = `
        MATCH (a1:Article {lawId: $sourceLawId, number: $sourceArticle})
        MATCH (a2:Article {lawId: $targetLawId, number: $targetArticle})
      `;
      createQuery = `(a1)-[r:REFERENCES]->(a2)`;
    }
    
    const query = `
      ${matchQuery}
      CREATE ${createQuery}
      SET r.id = $id,
          r.type = $referenceType,
          r.confidence = $confidence,
          r.detectionMethod = $detectionMethod,
          r.sourceText = $referenceText,
          r.sourceStartPos = coalesce($sourceStartPos, 0),
          r.sourceEndPos = coalesce($sourceEndPos, 0),
          r.sourceLineNumber = coalesce($sourceLineNumber, 0),
          r.sourceItemNumber = coalesce($sourceItemNumber, ''),
          r.targetItemNumber = coalesce($targetItemNumber, ''),
          r.detectedAt = datetime(),
          r.enhanced = true
      RETURN r
    `;
    
    try {
      await this.session.run(query, {
        id: ref.id,
        sourceLawId: ref.sourceLawId,
        sourceArticle: ref.sourceArticle,
        sourceParagraphNumber: ref.sourceParagraphNumber || null,
        targetLawId: ref.targetLawId,
        targetArticle: ref.targetArticle,
        targetParagraphNumber: ref.targetParagraphNumber || null,
        referenceType: ref.referenceType,
        confidence: ref.confidence,
        detectionMethod: ref.detectionMethod,
        referenceText: ref.referenceText,
        sourceStartPos: ref.sourceStartPos || null,
        sourceEndPos: ref.sourceEndPos || null,
        sourceLineNumber: ref.sourceLineNumber || null,
        sourceItemNumber: ref.sourceItemNumber || null,
        targetItemNumber: ref.targetItemNumber || null
      });
    } catch (error: any) {
      if (!error.message.includes('already exists')) {
        console.error(chalk.red(`参照作成エラー: ${error.message}`));
      }
    }
  }
  
  /**
   * PostgreSQLから拡張参照データを取得してNeo4jに同期
   */
  async syncFromPostgreSQL() {
    console.log(chalk.cyan('📊 PostgreSQLからデータ取得中...'));
    
    // 参照データを取得
    const references = await prisma.$queryRaw<any[]>`
      SELECT 
        id,
        "sourceLawId",
        "sourceArticle",
        "targetLawId",
        "targetArticle",
        "referenceText",
        "referenceType",
        confidence,
        "detectionMethod"
      FROM "Reference"
      LIMIT 1000
    `;
    
    console.log(chalk.blue(`📝 ${references.length}件の参照を処理中...`));
    
    let processed = 0;
    let errors = 0;
    
    for (const ref of references) {
      try {
        await this.createEnhancedReference({
          ...ref,
          // ダミーの拡張情報（実際のデータがない場合）
          sourceStartPos: 0,
          sourceEndPos: ref.referenceText?.length || 0,
          sourceLineNumber: 0
        });
        processed++;
        
        if (processed % 100 === 0) {
          console.log(chalk.gray(`  処理済み: ${processed}/${references.length}`));
        }
      } catch (error) {
        errors++;
        console.error(chalk.red(`エラー (${ref.id}):`), error);
      }
    }
    
    console.log(chalk.green(`✅ 同期完了: ${processed}件成功, ${errors}件エラー`));
  }
  
  /**
   * 統計情報の表示
   */
  async showStatistics() {
    console.log(chalk.cyan('\n📈 Neo4j統計情報'));
    
    const stats = await this.session.run(`
      MATCH (l:Law)
      OPTIONAL MATCH (l)-[:HAS_ARTICLE]->(a:Article)
      OPTIONAL MATCH (a)-[:HAS_PARAGRAPH]->(p:Paragraph)
      OPTIONAL MATCH ()-[r:REFERENCES]->()
      WHERE r.enhanced = true
      RETURN 
        count(DISTINCT l) as lawCount,
        count(DISTINCT a) as articleCount,
        count(DISTINCT p) as paragraphCount,
        count(DISTINCT r) as enhancedRefCount
    `);
    
    const result = stats.records[0];
    console.table({
      '法令数': result.get('lawCount').toNumber(),
      '条文数': result.get('articleCount').toNumber(),
      '項数': result.get('paragraphCount').toNumber(),
      '拡張参照数': result.get('enhancedRefCount').toNumber()
    });
    
    // 位置情報を持つ参照の統計
    const positionStats = await this.session.run(`
      MATCH ()-[r:REFERENCES]->()
      WHERE r.sourceStartPos IS NOT NULL
      RETURN count(r) as positionRefCount
    `);
    
    console.log(chalk.yellow(
      `\n位置情報付き参照: ${positionStats.records[0].get('positionRefCount').toNumber()}件`
    ));
  }
  
  /**
   * クリーンアップ
   */
  async close() {
    await this.session.close();
    await this.driver.close();
  }
}

/**
 * メイン実行
 */
async function main() {
  console.log(chalk.cyan('🚀 拡張参照データのNeo4j同期開始\n'));
  
  const sync = new EnhancedNeo4jSync();
  
  try {
    // 接続テスト
    const connected = await sync.testConnection();
    if (!connected) {
      throw new Error('Neo4j接続に失敗しました');
    }
    
    // スキーマセットアップ
    await sync.setupSchema();
    
    // データ同期
    const args = process.argv.slice(2);
    if (args.includes('--from-db')) {
      // PostgreSQLから同期
      await sync.syncFromPostgreSQL();
    } else if (args.includes('--from-file')) {
      // JSONファイルから同期（未実装）
      console.log(chalk.yellow('⚠️ ファイルからの同期は未実装です'));
    } else {
      // テストデータを投入
      console.log(chalk.cyan('📝 テストデータを投入中...'));
      
      const testRef: EnhancedReferenceData = {
        id: 'test-ref-001',
        sourceLawId: '129AC0000000089',
        sourceArticle: '第90条',
        targetLawId: '132AC0000000048',
        targetArticle: '第1条',
        referenceText: '民法第90条の規定により',
        referenceType: 'external',
        confidence: 0.95,
        detectionMethod: 'pattern',
        sourceStartPos: 150,
        sourceEndPos: 165,
        sourceLineNumber: 5,
        sourceParagraphNumber: 2,
        targetParagraphNumber: 1
      };
      
      await sync.createEnhancedReference(testRef);
      console.log(chalk.green('✅ テストデータ投入完了'));
    }
    
    // 統計表示
    await sync.showStatistics();
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error);
    process.exit(1);
  } finally {
    await sync.close();
    await prisma.$disconnect();
  }
}

// 実行
if (require.main === module) {
  main();
}

export { EnhancedNeo4jSync, EnhancedReferenceData };