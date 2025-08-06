#!/usr/bin/env npx tsx
/**
 * PostgreSQLからNeo4jへの参照関係抽出・構築スクリプト
 * 
 * PostgreSQLの法令データを解析し、以下をNeo4jに構築：
 * 1. 軽量な法令・条文ノード（IDと基本情報のみ）
 * 2. 検出した参照関係のグラフ構造
 * 
 * 注: これは「同期」ではなく、マスターデータ（PostgreSQL）から
 *     グラフデータ（Neo4j）を生成する変換処理です
 */

import { PrismaClient } from '@prisma/client';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
import * as dotenv from 'dotenv';
import { performance } from 'perf_hooks';

dotenv.config();

// 設定
const CONFIG = {
  BATCH_SIZE: 100,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  NEO4J_URI: process.env.NEO4J_URI || 'bolt://localhost:7687',
  NEO4J_USER: process.env.NEO4J_USER || 'neo4j',
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || 'password',
  POSTGRESQL_URL: process.env.POSTGRESQL_URL || 'postgresql://user:password@localhost:5432/lawfinder'
};

class ReferenceGraphBuilder {
  private prisma: PrismaClient;
  private neo4jDriver: Driver;
  private referenceDetector: ComprehensiveReferenceDetector;
  private stats = {
    lawsProcessed: 0,
    articlesProcessed: 0,
    referencesCreated: 0,
    errors: 0,
    startTime: 0
  };

  constructor() {
    this.prisma = new PrismaClient();
    this.neo4jDriver = neo4j.driver(
      CONFIG.NEO4J_URI,
      neo4j.auth.basic(CONFIG.NEO4J_USER, CONFIG.NEO4J_PASSWORD)
    );
    this.referenceDetector = new ComprehensiveReferenceDetector();
  }

  /**
   * メイン処理：参照関係グラフの構築
   */
  async build(lawId?: string): Promise<void> {
    console.log('🔄 参照関係グラフの構築を開始します...');
    this.stats.startTime = performance.now();

    try {
      // Neo4jスキーマの初期化
      await this.initializeNeo4jSchema();

      if (lawId) {
        // 特定の法令の参照関係を構築
        await this.buildSingleLaw(lawId);
      } else {
        // 全法令の参照関係を構築
        await this.buildAllLaws();
      }

      // 統計情報の表示
      this.printStats();
    } catch (error) {
      console.error('❌ グラフ構築エラー:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Neo4jスキーマの初期化
   */
  private async initializeNeo4jSchema(): Promise<void> {
    const session = this.neo4jDriver.session();
    try {
      console.log('📝 Neo4jスキーマを初期化中...');
      
      // インデックスと制約の作成（エラーを無視）
      const constraints = [
        'CREATE CONSTRAINT law_id_unique IF NOT EXISTS FOR (l:Law) REQUIRE l.id IS UNIQUE',
        'CREATE CONSTRAINT article_id_unique IF NOT EXISTS FOR (a:Article) REQUIRE a.id IS UNIQUE',
        'CREATE INDEX law_title IF NOT EXISTS FOR (l:Law) ON (l.title)',
        'CREATE INDEX article_law_number IF NOT EXISTS FOR (a:Article) ON (a.lawId, a.number)'
      ];

      for (const constraint of constraints) {
        try {
          await session.run(constraint);
        } catch (error: any) {
          // インデックスが既に存在する場合は無視
          if (!error.message?.includes('already exists')) {
            throw error;
          }
        }
      }
      
      console.log('✅ スキーマ初期化完了');
    } finally {
      await session.close();
    }
  }

  /**
   * 全法令の参照関係構築
   */
  private async buildAllLaws(): Promise<void> {
    const laws = await this.prisma.law.findMany({
      where: { status: '現行' },
      orderBy: { id: 'asc' }
    });

    console.log(`📚 ${laws.length}件の法令から参照関係を構築します`);

    for (let i = 0; i < laws.length; i += CONFIG.BATCH_SIZE) {
      const batch = laws.slice(i, i + CONFIG.BATCH_SIZE);
      await Promise.all(batch.map(law => this.buildLawReferences(law)));
      
      const progress = Math.min(i + CONFIG.BATCH_SIZE, laws.length);
      console.log(`進捗: ${progress}/${laws.length} (${Math.round(progress/laws.length*100)}%)`);
    }
  }

  /**
   * 特定法令の参照関係構築
   */
  private async buildSingleLaw(lawId: string): Promise<void> {
    const law = await this.prisma.law.findUnique({
      where: { id: lawId }
    });

    if (!law) {
      throw new Error(`法令が見つかりません: ${lawId}`);
    }

    await this.buildLawReferences(law);
  }

  /**
   * 法令の参照関係をNeo4jに構築
   */
  private async buildLawReferences(law: any): Promise<void> {
    const session = this.neo4jDriver.session();
    
    try {
      // トランザクション開始
      const tx = session.beginTransaction();
      
      try {
        // 1. 法令ノードの作成/更新
        await tx.run(
          `MERGE (l:Law {id: $id})
           SET l.title = $title,
               l.shortTitle = $shortTitle,
               l.lawType = $lawType,
               l.status = $status,
               l.effectiveDate = $effectiveDate,
               l.lastUpdated = datetime()`,
          {
            id: law.id,
            title: law.title,
            shortTitle: this.extractShortTitle(law.title),
            lawType: law.lawType || '法律',
            status: law.status,
            effectiveDate: law.effectiveDate ? law.effectiveDate.toISOString() : null
          }
        );

        // 2. 条文データの取得と同期
        const articles = await this.prisma.article.findMany({
          where: { lawId: law.id },
          orderBy: { sortOrder: 'asc' }
        });

        for (const article of articles) {
          await this.createArticleNode(tx, article);
        }

        // 3. 参照関係の検出と作成
        await this.detectAndCreateReferences(tx, law, articles);

        await tx.commit();
        this.stats.lawsProcessed++;
        
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } finally {
      await session.close();
    }
  }

  /**
   * 条文ノードの作成（軽量版）
   */
  private async createArticleNode(tx: any, article: any): Promise<void> {
    await tx.run(
      `MERGE (a:Article {id: $id})
       SET a.lawId = $lawId,
           a.number = $number,
           a.numberInt = $numberInt,
           a.title = $title,
           a.chapter = $chapter,
           a.section = $section,
           a.isDeleted = $isDeleted
       WITH a
       MATCH (l:Law {id: $lawId})
       MERGE (l)-[:HAS_ARTICLE]->(a)`,
      {
        id: `${article.lawId}_${article.articleNumber}`,
        lawId: article.lawId,
        number: article.articleNumber,
        numberInt: this.parseArticleNumber(article.articleNumber),
        title: article.articleTitle || '',
        chapter: article.chapter || '',
        section: article.section || '',
        isDeleted: article.isDeleted
      }
    );
    
    this.stats.articlesProcessed++;
  }

  /**
   * 参照関係の検出と作成
   */
  private async detectAndCreateReferences(tx: any, law: any, articles: any[]): Promise<void> {
    for (const article of articles) {
      if (article.isDeleted) continue;

      // 参照の検出
      const references = this.referenceDetector.detectAllReferences(article.content);
      
      for (const ref of references) {
        await this.createReference(tx, article, ref);
      }
    }
  }

  /**
   * 参照関係の作成
   */
  private async createReference(tx: any, sourceArticle: any, reference: any): Promise<void> {
    const sourceId = `${sourceArticle.lawId}_${sourceArticle.articleNumber}`;
    
    switch (reference.type) {
      case 'internal':
        // 同一法令内の参照
        const targetId = `${sourceArticle.lawId}_${reference.targetArticle}`;
        await tx.run(
          `MATCH (source:Article {id: $sourceId})
           MATCH (target:Article {id: $targetId})
           MERGE (source)-[r:REFERS_TO {
             type: 'internal',
             text: $text,
             confidence: $confidence,
             context: $context
           }]->(target)`,
          {
            sourceId,
            targetId,
            text: reference.text,
            confidence: reference.confidence || 1.0,
            context: reference.context || ''
          }
        );
        break;

      case 'external':
        // 他法令への参照
        await tx.run(
          `MATCH (source:Article {id: $sourceId})
           MATCH (targetLaw:Law {title: $lawName})
           MERGE (source)-[r:REFERS_TO_LAW {
             type: 'external',
             lawName: $lawName,
             articleNumber: $articleNumber,
             text: $text,
             confidence: $confidence
           }]->(targetLaw)`,
          {
            sourceId,
            lawName: reference.targetLaw,
            articleNumber: reference.targetArticle || '',
            text: reference.text,
            confidence: reference.confidence || 0.8
          }
        );
        break;

      case 'relative':
        // 相対参照（前条、次条等）
        const distance = reference.relativeDistance || 1;
        const direction = reference.relativeType || 'previous';
        
        await tx.run(
          `MATCH (source:Article {id: $sourceId})
           MATCH (source)<-[:HAS_ARTICLE]-(l:Law)-[:HAS_ARTICLE]->(target:Article)
           WHERE target.numberInt = source.numberInt ${direction === 'previous' ? '-' : '+'} $distance
           MERGE (source)-[r:RELATIVE_REF {
             direction: $direction,
             distance: $distance,
             text: $text
           }]->(target)`,
          {
            sourceId,
            direction,
            distance,
            text: reference.text
          }
        );
        break;

      case 'structural':
        // 構造参照（章、編等への参照）
        await tx.run(
          `MATCH (source:Article {id: $sourceId})
           MATCH (target:Article {chapter: $chapter})
           WHERE target.lawId = source.lawId
           MERGE (source)-[r:REFERS_TO_STRUCTURE {
             structureType: $structureType,
             structureName: $structureName,
             text: $text
           }]->(target)`,
          {
            sourceId,
            structureType: reference.structureType,
            structureName: reference.structureName,
            chapter: reference.structureName,
            text: reference.text
          }
        );
        break;
    }
    
    this.stats.referencesCreated++;
  }

  /**
   * 法令名から略称を抽出
   */
  private extractShortTitle(fullTitle: string): string {
    // 括弧内の略称を抽出
    const match = fullTitle.match(/（([^）]+)）/);
    if (match) return match[1];
    
    // 「法」で終わる部分を抽出
    const lawMatch = fullTitle.match(/([^（]+法)/);
    if (lawMatch) return lawMatch[1];
    
    return fullTitle;
  }

  /**
   * 条番号を数値に変換
   */
  private parseArticleNumber(articleNumber: string): number {
    // 漢数字を数値に変換するロジック
    const kanjiNumbers: { [key: string]: number } = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000
    };
    
    // 簡易的な変換（完全な実装は別途必要）
    let result = 0;
    let temp = 0;
    
    for (const char of articleNumber) {
      const num = kanjiNumbers[char];
      if (num) {
        if (num >= 100) {
          result += (temp || 1) * num;
          temp = 0;
        } else {
          temp = temp * 10 + num;
        }
      }
    }
    
    return result + temp;
  }

  /**
   * 統計情報の表示
   */
  private printStats(): void {
    const elapsed = (performance.now() - this.stats.startTime) / 1000;
    
    console.log('\n=== グラフ構築完了 ===');
    console.log(`✅ 処理法令数: ${this.stats.lawsProcessed}`);
    console.log(`✅ 処理条文数: ${this.stats.articlesProcessed}`);
    console.log(`✅ 作成参照数: ${this.stats.referencesCreated}`);
    console.log(`⚠️  エラー数: ${this.stats.errors}`);
    console.log(`⏱️  処理時間: ${elapsed.toFixed(2)}秒`);
  }

  /**
   * クリーンアップ
   */
  private async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
    await this.neo4jDriver.close();
  }
}

// 実行
if (require.main === module) {
  const builder = new ReferenceGraphBuilder();
  const lawId = process.argv[2]; // コマンドライン引数から法令IDを取得
  
  builder.build(lawId)
    .then(() => {
      console.log('✅ 参照関係グラフの構築が正常に完了しました');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ グラフ構築中にエラーが発生しました:', error);
      process.exit(1);
    });
}