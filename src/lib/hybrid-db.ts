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
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'lawfinder123';

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
        MATCH (source:Article {lawId: $lawId, articleNumber: $articleNumber})
        OPTIONAL MATCH (source)-[r:REFERENCES]->(target)
        WHERE target.lawId <> $lawId
        RETURN
          r.type as relType,
          r.text as text,
          r.confidence as confidence,
          r.metadata as metadata,
          target.lawId as targetLawId,
          target.articleNumber as targetArticle,
          CASE WHEN target:Law THEN target.title ELSE null END as targetTitle
        ORDER BY r.confidence DESC
        `,
        { lawId, articleNumber }
      );

      return result.records
        .filter(record => record.get('relType') !== null)
        .map(record => ({
          type: record.get('relType') || 'external',
          text: record.get('text'),
          confidence: record.get('confidence')?.toNumber?.() ?? record.get('confidence') ?? 1.0,
          metadata: record.get('metadata'),
          targetLawId: record.get('targetLawId'),
          targetArticle: record.get('targetArticle'),
          targetTitle: record.get('targetTitle')
        }));
    } finally {
      await session.close();
    }
  }
  

  /**
   * ハネ改正影響分析（Neo4j）
   */
  async analyzeAmendmentImpact(lawId: string, articleNumber: string, depth: number = 3) {
    const session = this.getNeo4jSession();
    const safeDepth = Math.min(Math.max(depth, 1), 5);

    try {
      const result = await session.run(
        `
        MATCH path = (source:Article {lawId: $lawId, articleNumber: $articleNumber})
          <-[:REFERENCES*1..${safeDepth}]-(affected)
        WHERE affected.lawId <> $lawId
        WITH affected, path, length(path) as distance
        RETURN DISTINCT
          affected.lawId as lawId,
          affected.articleNumber as articleNumber,
          labels(affected)[0] as nodeType,
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
        nodeType: record.get('nodeType'),
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
        MATCH (a:Article {lawId: $lawId})
        WITH a LIMIT $maxNodes
        OPTIONAL MATCH (a)-[r:REFERENCES]-(related)
        WHERE related.lawId <> $lawId
        RETURN a, r, related
        `,
        { lawId, maxNodes: neo4j.int(maxNodes) }
      );

      const nodes = new Map();
      const edges: any[] = [];

      result.records.forEach(record => {
        const source = record.get('a');
        const relationship = record.get('r');
        const target = record.get('related');

        if (source) {
          const nodeId = `${source.properties.lawId}#${source.properties.articleNumber}`;
          if (!nodes.has(nodeId)) {
            nodes.set(nodeId, {
              id: nodeId,
              label: `第${source.properties.articleNumber}条`,
              type: 'article',
              properties: source.properties
            });
          }
        }

        if (target && relationship) {
          const isLaw = target.labels.includes('Law');
          const targetId = isLaw
            ? target.properties.lawId
            : `${target.properties.lawId}#${target.properties.articleNumber}`;
          if (!nodes.has(targetId)) {
            nodes.set(targetId, {
              id: targetId,
              label: isLaw
                ? target.properties.title
                : `第${target.properties.articleNumber}条`,
              type: isLaw ? 'law' : 'article',
              properties: target.properties
            });
          }

          const sourceId = `${source.properties.lawId}#${source.properties.articleNumber}`;
          edges.push({
            source: sourceId,
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
   * 法令の条文一覧を参照数付きで取得（Neo4j）
   */
  async getArticlesWithReferences(lawId: string) {
    const session = this.getNeo4jSession();

    try {
      const result = await session.run(
        `
        MATCH (a:Article {lawId: $lawId})
        OPTIONAL MATCH (a)-[outR:REFERENCES]->()
        WITH a, count(outR) AS outRefs
        OPTIONAL MATCH (a)<-[inR:REFERENCES]-()
        WITH a, outRefs, count(inR) AS inRefs
        WHERE outRefs + inRefs > 0
        RETURN a.articleNumber AS articleNumber,
               outRefs, inRefs,
               outRefs + inRefs AS totalRefs
        ORDER BY totalRefs DESC
        `,
        { lawId }
      );

      return result.records.map(record => ({
        articleNumber: record.get('articleNumber'),
        outgoing: record.get('outRefs').toNumber(),
        incoming: record.get('inRefs').toNumber(),
        total: record.get('totalRefs').toNumber(),
      }));
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
        MATCH ()-[r:REFERENCES]->()
        RETURN count(r) as referenceCount
        `
      );

      const topReferencedResult = await session.run(
        `
        MATCH (a:Article)<-[r:REFERENCES]-()
        WITH a, count(r) as refCount
        RETURN a.lawId as lawId, a.articleNumber as articleNumber, refCount
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