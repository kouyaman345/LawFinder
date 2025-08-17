/**
 * ハイブリッドデータベースアクセス層
 * PostgreSQLとNeo4jを統合的に扱うためのサービス
 */

import { PrismaClient } from '@prisma/client';
import neo4j, { Driver, Session, Result } from 'neo4j-driver';
import { cache } from 'react';

// 環境変数から設定を取得
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

/**
 * ハイブリッドDBクライアント
 */
export class HybridDBClient {
  private prisma: PrismaClient;
  private neo4jDriver: Driver;
  private static instance: HybridDBClient;

  private constructor() {
    // Prismaクライアントの初期化
    this.prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    // Neo4jドライバーの初期化
    this.neo4jDriver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
      {
        maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 2 * 60 * 1000, // 120 seconds
      }
    );
  }

  /**
   * シングルトンインスタンスの取得
   */
  public static getInstance(): HybridDBClient {
    if (!HybridDBClient.instance) {
      HybridDBClient.instance = new HybridDBClient();
    }
    return HybridDBClient.instance;
  }

  /**
   * PostgreSQLクライアントの取得
   */
  public getPrisma(): PrismaClient {
    return this.prisma;
  }

  /**
   * Neo4jセッションの取得
   */
  public getNeo4jSession(): Session {
    return this.neo4jDriver.session();
  }

  /**
   * 法令データの取得（PostgreSQL）
   */
  async getLaw(lawId: string) {
    return this.prisma.law.findUnique({
      where: { id: lawId },
      include: {
        articles: {
          orderBy: { sortOrder: 'asc' },
          include: {
            paragraphs: {
              orderBy: { paragraphNumber: 'asc' },
              include: {
                items: {
                  orderBy: { sortOrder: 'asc' }
                }
              }
            }
          }
        }
      }
    });
  }

  /**
   * 法令一覧の取得（PostgreSQL）
   */
  async getLaws(params?: {
    skip?: number;
    take?: number;
    where?: any;
    orderBy?: any;
  }) {
    return this.prisma.law.findMany({
      skip: params?.skip || 0,
      take: params?.take || 20,
      where: params?.where,
      orderBy: params?.orderBy || { title: 'asc' },
      select: {
        id: true,
        title: true,
        lawType: true,
        lawNumber: true,
        effectiveDate: true,
        status: true,
      }
    });
  }

  /**
   * 全文検索（PostgreSQL）
   */
  async searchLaws(query: string, limit: number = 20) {
    // PostgreSQLの全文検索を使用
    return this.prisma.$queryRaw`
      SELECT 
        l.id,
        l.title,
        l."lawNumber",
        l."lawType",
        l."effectiveDate",
        ts_rank(to_tsvector('japanese', l.title || ' ' || COALESCE(l."lawNumber", '')), 
                plainto_tsquery('japanese', ${query})) as rank
      FROM "Law" l
      WHERE to_tsvector('japanese', l.title || ' ' || COALESCE(l."lawNumber", '')) 
            @@ plainto_tsquery('japanese', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `;
  }

  /**
   * 条文の参照関係取得（Neo4j）
   */
  async getArticleReferences(lawId: string, articleNumber: string) {
    const session = this.getNeo4jSession();
    
    try {
      const result = await session.run(
        `
        MATCH (source:Article {lawId: $lawId, number: $articleNumber})
        OPTIONAL MATCH (source)-[r:REFERS_TO|REFERS_TO_LAW|RELATIVE_REF|APPLIES]->(target)
        RETURN 
          type(r) as relType,
          r.text as text,
          r.confidence as confidence,
          r.metadata as metadata,
          target.lawId as targetLawId,
          target.number as targetArticle
        ORDER BY CASE 
          WHEN type(r) = 'REFERS_TO' THEN 1
          WHEN type(r) = 'RELATIVE_REF' THEN 2
          WHEN type(r) = 'APPLIES' THEN 3
          ELSE 4
        END
        `,
        { lawId, articleNumber }
      );

      return result.records
        .filter(record => record.get('relType') !== null)
        .map(record => ({
          type: this.mapRelationType(record.get('relType')),
          text: record.get('text'),
          confidence: record.get('confidence') || 1.0,
          metadata: record.get('metadata'),
          targetLawId: record.get('targetLawId'),
          targetArticle: record.get('targetArticle')
        }));
    } finally {
      await session.close();
    }
  }
  
  /**
   * Neo4jのリレーションタイプをアプリケーションの参照タイプにマッピング
   */
  private mapRelationType(relType: string): string {
    const mapping: { [key: string]: string } = {
      'REFERS_TO': 'internal',
      'REFERS_TO_LAW': 'external',
      'RELATIVE_REF': 'relative',
      'APPLIES': 'application'
    };
    return mapping[relType] || relType.toLowerCase();
  }

  /**
   * ハネ改正影響分析（Neo4j）
   */
  async analyzeAmendmentImpact(lawId: string, articleNumber: string, depth: number = 3) {
    const session = this.getNeo4jSession();
    
    try {
      const result = await session.run(
        `
        MATCH path = (source:Article {lawId: $lawId, number: $articleNumber})
          <-[:REFERS_TO|REFERS_TO_LAW|APPLIES|RELATIVE_REF*1..${depth}]-(affected:Article)
        WITH affected, path, length(path) as distance
        RETURN DISTINCT 
          affected.lawId as lawId,
          affected.number as articleNumber,
          affected.title as articleTitle,
          min(distance) as impactLevel,
          count(distinct path) as pathCount
        ORDER BY impactLevel, pathCount DESC
        LIMIT 100
        `,
        { lawId, articleNumber }
      );

      return result.records.map(record => ({
        lawId: record.get('lawId'),
        articleNumber: record.get('articleNumber'),
        articleTitle: record.get('articleTitle'),
        impactLevel: record.get('impactLevel').toNumber(),
        pathCount: record.get('pathCount').toNumber(),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * 参照グラフの取得（可視化用）（Neo4j）
   */
  async getReferenceGraph(lawId: string, maxNodes: number = 50) {
    const session = this.getNeo4jSession();
    
    try {
      const result = await session.run(
        `
        MATCH (l:Law {id: $lawId})-[:HAS_ARTICLE]->(a:Article)
        WITH a
        LIMIT ${maxNodes}
        OPTIONAL MATCH (a)-[r:REFERS_TO|REFERS_TO_LAW|APPLIES|RELATIVE_REF]-(related)
        RETURN a, r, related
        `,
        { lawId }
      );

      const nodes = new Map();
      const edges = [];

      result.records.forEach(record => {
        const source = record.get('a');
        const relationship = record.get('r');
        const target = record.get('related');

        // ソースノードを追加
        if (source) {
          const nodeId = source.properties.id;
          if (!nodes.has(nodeId)) {
            nodes.set(nodeId, {
              id: nodeId,
              label: `第${source.properties.number}条`,
              type: 'article',
              properties: source.properties
            });
          }
        }

        // ターゲットノードとエッジを追加
        if (target && relationship) {
          const targetId = target.properties.id;
          if (!nodes.has(targetId)) {
            nodes.set(targetId, {
              id: targetId,
              label: target.labels[0] === 'Law' 
                ? target.properties.title 
                : `第${target.properties.number}条`,
              type: target.labels[0].toLowerCase(),
              properties: target.properties
            });
          }

          edges.push({
            source: source.properties.id,
            target: targetId,
            type: relationship.type,
            properties: relationship.properties
          });
        }
      });

      return {
        nodes: Array.from(nodes.values()),
        edges
      };
    } finally {
      await session.close();
    }
  }

  /**
   * 統計情報の取得（ハイブリッド）
   */
  async getStatistics() {
    // PostgreSQLから基本統計
    const lawCount = await this.prisma.law.count();
    const articleCount = await this.prisma.article.count();
    
    // Neo4jから参照関係統計
    const session = this.getNeo4jSession();
    try {
      const refResult = await session.run(
        `
        MATCH ()-[r]->()
        WHERE type(r) IN ['REFERS_TO', 'REFERS_TO_LAW', 'APPLIES', 'RELATIVE_REF']
        RETURN count(r) as referenceCount
        `
      );
      
      const topReferencedResult = await session.run(
        `
        MATCH (a:Article)<-[r]-()
        WITH a, count(r) as refCount
        RETURN a.lawId as lawId, a.number as articleNumber, refCount
        ORDER BY refCount DESC
        LIMIT 10
        `
      );

      return {
        lawCount,
        articleCount,
        referenceCount: refResult.records[0]?.get('referenceCount').toNumber() || 0,
        topReferenced: topReferencedResult.records.map(r => ({
          lawId: r.get('lawId'),
          articleNumber: r.get('articleNumber'),
          referenceCount: r.get('refCount').toNumber()
        }))
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Neo4j結果のパース
   */
  private parseNeo4jResult(result: Result) {
    return result.records.map(record => {
      const obj: any = {};
      record.keys.forEach(key => {
        const value = record.get(key);
        if (value && value.properties) {
          obj[key] = value.properties;
        } else {
          obj[key] = value;
        }
      });
      return obj;
    });
  }

  /**
   * クリーンアップ
   */
  async disconnect() {
    await this.prisma.$disconnect();
    await this.neo4jDriver.close();
  }
}

// Next.js用のキャッシュ付きヘルパー関数
export const getLawWithCache = cache(async (lawId: string) => {
  const client = HybridDBClient.getInstance();
  return client.getLaw(lawId);
});

export const searchLawsWithCache = cache(async (query: string) => {
  const client = HybridDBClient.getInstance();
  return client.searchLaws(query);
});

export const getReferencesWithCache = cache(async (lawId: string, articleNumber: string) => {
  const client = HybridDBClient.getInstance();
  return client.getArticleReferences(lawId, articleNumber);
});

// デフォルトエクスポート
export default HybridDBClient;