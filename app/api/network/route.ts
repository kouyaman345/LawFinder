import { NextRequest, NextResponse } from 'next/server';
import neo4j, { Driver } from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';

let driver: Driver | null = null;
const prisma = new PrismaClient();

function getDriver(): Driver {
  if (!driver) {
    driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'lawfinder123'
      )
    );
  }
  return driver;
}

// Natural sort for article numbers like "1", "2", "10", "90", "附則2_1"
function naturalCompareArticle(a: string, b: string): number {
  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);
  if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
  if (!isNaN(numA)) return -1;
  if (!isNaN(numB)) return 1;
  return a.localeCompare(b, 'ja');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'stats';
  const lawId = searchParams.get('lawId');
  const query = searchParams.get('q');
  const depth = Math.min(parseInt(searchParams.get('depth') || '1'), 3);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);

  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });

  try {
    switch (action) {
      case 'stats': {
        const result = await session.run(`
          MATCH (l:Law) WITH count(l) AS lawCount
          MATCH ()-[r:REFERENCES]->() WITH lawCount, count(r) AS refCount
          MATCH (s)-[r2:REFERENCES]->(t) WHERE s.lawId <> t.lawId AND id(s) <> id(t)
          WITH lawCount, refCount, count(r2) AS crossLawCount
          OPTIONAL MATCH (n)-[sr:REFERENCES]->(n)
          WITH lawCount, refCount, crossLawCount, count(sr) AS selfRefCount
          RETURN lawCount, refCount, crossLawCount, selfRefCount
        `);
        const r = result.records[0];
        return NextResponse.json({
          lawCount: r.get('lawCount').toNumber(),
          referenceCount: r.get('refCount').toNumber(),
          crossLawReferenceCount: r.get('crossLawCount').toNumber(),
          selfReferenceCount: r.get('selfRefCount').toNumber(),
        });
      }

      case 'search': {
        if (!query) {
          return NextResponse.json({ error: 'Missing q parameter' }, { status: 400 });
        }
        const result = await session.run(`
          MATCH (l:Law)
          WHERE l.title CONTAINS $query OR l.lawId CONTAINS $query
          WITH l,
               size([(l)<-[:REFERENCES]-() | 1]) AS incoming,
               size([(l)-[:REFERENCES]->() | 1]) AS outgoing
          RETURN l.lawId AS lawId, l.title AS title, incoming, outgoing
          ORDER BY incoming + outgoing DESC
          LIMIT $limit
        `, { query, limit: neo4j.int(limit) });

        return NextResponse.json({
          results: result.records.map(r => ({
            lawId: r.get('lawId'),
            title: r.get('title') || '',
            incoming: r.get('incoming').toNumber(),
            outgoing: r.get('outgoing').toNumber(),
          })),
        });
      }

      case 'graph': {
        if (!lawId) {
          return NextResponse.json({ error: 'Missing lawId parameter' }, { status: 400 });
        }

        // Phase 1: 中心法令と接続先の総数を取得
        const countResult = await session.run(`
          MATCH (center:Law {lawId: $lawId})
          OPTIONAL MATCH (center)-[:REFERENCES]->(out:Law)
          WHERE center.lawId <> out.lawId
          WITH center, count(DISTINCT out) AS totalOut
          OPTIONAL MATCH (inc:Law)-[:REFERENCES]->(center)
          WHERE inc.lawId <> center.lawId
          RETURN center.title AS centerTitle,
                 totalOut,
                 count(DISTINCT inc) AS totalIn
        `, { lawId });

        if (countResult.records.length === 0) {
          return NextResponse.json({ error: 'Law not found' }, { status: 404 });
        }

        const countRec = countResult.records[0];
        const centerTitle = countRec.get('centerTitle');
        const totalOutgoing = countRec.get('totalOut').toNumber();
        const totalIncoming = countRec.get('totalIn').toNumber();

        // Phase 2: 参照件数順でoutgoing取得 (limit件)
        const halfLimit = Math.ceil(limit / 2);
        const outResult = await session.run(`
          MATCH (center:Law {lawId: $lawId})-[r:REFERENCES]->(out:Law)
          WHERE center.lawId <> out.lawId
          WITH out, count(r) AS refCount
          RETURN DISTINCT out.lawId AS lawId, out.title AS title, refCount
          ORDER BY refCount DESC
          LIMIT $lim
        `, { lawId, lim: neo4j.int(halfLimit) });

        // Phase 3: 参照件数順でincoming取得 (limit件)
        const inResult = await session.run(`
          MATCH (inc:Law)-[r:REFERENCES]->(center:Law {lawId: $lawId})
          WHERE inc.lawId <> center.lawId
          WITH inc, count(r) AS refCount
          RETURN DISTINCT inc.lawId AS lawId, inc.title AS title, refCount
          ORDER BY refCount DESC
          LIMIT $lim
        `, { lawId, lim: neo4j.int(halfLimit) });

        // Build graph data (vis.js compatible)
        const nodes: any[] = [{
          id: lawId,
          label: centerTitle || lawId,
          group: 'center',
        }];

        const edges: any[] = [];
        const nodeIds = new Set([lawId]);

        for (const rec of outResult.records) {
          const rid = rec.get('lawId');
          if (rid && !nodeIds.has(rid)) {
            nodeIds.add(rid);
            nodes.push({
              id: rid,
              label: rec.get('title') || rid,
              group: 'outgoing',
            });
          }
          if (rid) {
            edges.push({ from: lawId, to: rid, arrows: 'to' });
          }
        }

        for (const rec of inResult.records) {
          const rid = rec.get('lawId');
          if (rid && !nodeIds.has(rid)) {
            nodeIds.add(rid);
            nodes.push({
              id: rid,
              label: rec.get('title') || rid,
              group: 'incoming',
            });
          }
          if (rid) {
            edges.push({ from: rid, to: lawId, arrows: 'to' });
          }
        }

        return NextResponse.json({
          center: { lawId, title: centerTitle },
          nodes,
          edges,
          stats: {
            outgoing: outResult.records.length,
            incoming: inResult.records.length,
            totalOutgoing,
            totalIncoming,
          },
        });
      }

      case 'articles': {
        if (!lawId) {
          return NextResponse.json({ error: 'Missing lawId parameter' }, { status: 400 });
        }

        // 1. PostgreSQLから全条文を取得（sortOrder順）
        const lawMaster = await prisma.lawMaster.findUnique({
          where: { id: lawId },
          select: { currentVersionId: true },
        });

        let allArticles: { articleNumber: string; sortOrder: number }[] = [];
        if (lawMaster?.currentVersionId) {
          allArticles = await prisma.article.findMany({
            where: { versionId: lawMaster.currentVersionId, isDeleted: false },
            select: { articleNumber: true, sortOrder: true },
            orderBy: { sortOrder: 'asc' },
          });
        }

        // 2. Neo4jから参照数を取得
        const result = await session.run(`
          MATCH (a:Article {lawId: $lawId})
          OPTIONAL MATCH (a)-[outR:REFERENCES]->()
          WITH a, count(outR) AS outRefs
          OPTIONAL MATCH (a)<-[inR:REFERENCES]-()
          RETURN a.articleNumber AS articleNumber,
                 outRefs, count(inR) AS inRefs
        `, { lawId });

        const refMap = new Map<string, { outgoing: number; incoming: number }>();
        for (const r of result.records) {
          const artNum = r.get('articleNumber');
          refMap.set(artNum, {
            outgoing: r.get('outRefs').toNumber(),
            incoming: r.get('inRefs').toNumber(),
          });
        }

        // 3. マージ: PostgreSQL全条文 + Neo4j参照数
        let articles: { articleNumber: string; outgoing: number; incoming: number; total: number }[];

        if (allArticles.length > 0) {
          // PostgreSQLに条文データがある場合: sortOrder順で全条文返却
          articles = allArticles.map(a => {
            const refs = refMap.get(a.articleNumber);
            return {
              articleNumber: a.articleNumber,
              outgoing: refs?.outgoing ?? 0,
              incoming: refs?.incoming ?? 0,
              total: (refs?.outgoing ?? 0) + (refs?.incoming ?? 0),
            };
          });
        } else {
          // PostgreSQLにデータがない場合: Neo4jのみ（参照ありのみ、条文番号順）
          articles = result.records.map(r => {
            const out = r.get('outRefs').toNumber();
            const inc = r.get('inRefs').toNumber();
            return {
              articleNumber: r.get('articleNumber'),
              outgoing: out,
              incoming: inc,
              total: out + inc,
            };
          }).sort((a, b) => naturalCompareArticle(a.articleNumber, b.articleNumber));
        }

        return NextResponse.json({ lawId, articles });
      }

      case 'article-graph': {
        if (!lawId) {
          return NextResponse.json({ error: 'Missing lawId parameter' }, { status: 400 });
        }
        const article = searchParams.get('article');
        if (!article) {
          return NextResponse.json({ error: 'Missing article parameter' }, { status: 400 });
        }

        // Get outgoing references from this article
        const outResult = await session.run(`
          MATCH (source:Article {lawId: $lawId, articleNumber: $article})-[r:REFERENCES]->(target)
          WHERE target.lawId <> $lawId
          RETURN DISTINCT target.lawId AS targetLawId,
                 target.articleNumber AS targetArticle,
                 labels(target)[0] AS targetType,
                 count(r) AS refCount
          ORDER BY refCount DESC
          LIMIT $lim
        `, { lawId, article, lim: neo4j.int(Math.ceil(limit / 2)) });

        // Get incoming references to this article
        const inResult = await session.run(`
          MATCH (source)-[r:REFERENCES]->(target:Article {lawId: $lawId, articleNumber: $article})
          WHERE source.lawId <> $lawId
          RETURN DISTINCT source.lawId AS sourceLawId,
                 source.articleNumber AS sourceArticle,
                 labels(source)[0] AS sourceType,
                 count(r) AS refCount
          ORDER BY refCount DESC
          LIMIT $lim
        `, { lawId, article, lim: neo4j.int(Math.ceil(limit / 2)) });

        // Collect all unique lawIds for batch title lookup
        const lawIds = new Set<string>();
        lawIds.add(lawId);
        for (const rec of outResult.records) lawIds.add(rec.get('targetLawId'));
        for (const rec of inResult.records) lawIds.add(rec.get('sourceLawId'));

        const titleResult = await session.run(`
          UNWIND $ids AS lid
          MATCH (l:Law {lawId: lid})
          RETURN l.lawId AS lawId, l.title AS title
        `, { ids: Array.from(lawIds) });

        const titleMap = new Map<string, string>();
        for (const rec of titleResult.records) {
          titleMap.set(rec.get('lawId'), rec.get('title') || '');
        }

        // Build vis.js compatible graph
        const centerNodeId = `${lawId}#${article}`;
        const centerTitle = titleMap.get(lawId) || lawId;
        const nodes: any[] = [{
          id: centerNodeId,
          label: `${centerTitle}\n第${article}条`,
          group: 'center',
        }];
        const edges: any[] = [];
        const nodeIds = new Set([centerNodeId]);

        for (const rec of outResult.records) {
          const tLawId = rec.get('targetLawId');
          const tArticle = rec.get('targetArticle');
          const tType = rec.get('targetType');
          const nodeId = tType === 'Law' ? tLawId : `${tLawId}#${tArticle}`;
          const title = titleMap.get(tLawId) || tLawId;

          if (!nodeIds.has(nodeId)) {
            nodeIds.add(nodeId);
            nodes.push({
              id: nodeId,
              label: tType === 'Law' ? title : `${title}\n第${tArticle}条`,
              group: 'outgoing',
            });
          }
          edges.push({ from: centerNodeId, to: nodeId, arrows: 'to' });
        }

        for (const rec of inResult.records) {
          const sLawId = rec.get('sourceLawId');
          const sArticle = rec.get('sourceArticle');
          const sType = rec.get('sourceType');
          const nodeId = sType === 'Law' ? sLawId : `${sLawId}#${sArticle}`;
          const title = titleMap.get(sLawId) || sLawId;

          if (!nodeIds.has(nodeId)) {
            nodeIds.add(nodeId);
            nodes.push({
              id: nodeId,
              label: sType === 'Law' ? title : `${title}\n第${sArticle}条`,
              group: 'incoming',
            });
          }
          edges.push({ from: nodeId, to: centerNodeId, arrows: 'to' });
        }

        return NextResponse.json({
          center: { lawId, article, title: centerTitle },
          nodes,
          edges,
          stats: {
            outgoing: outResult.records.length,
            incoming: inResult.records.length,
          },
        });
      }

      case 'top': {
        const result = await session.run(`
          MATCH (l:Law)
          WHERE l.title IS NOT NULL AND l.title <> '' AND l.title <> 'e-Gov 法令検索'
          WITH l,
               size([(l)<-[:REFERENCES]-(s) WHERE s.lawId <> l.lawId | 1]) AS incoming,
               size([(l)-[:REFERENCES]->(t) WHERE t.lawId <> l.lawId | 1]) AS outgoing
          WHERE incoming + outgoing > 0
          RETURN l.lawId AS lawId, l.title AS title, incoming, outgoing,
                 incoming + outgoing AS total
          ORDER BY total DESC
          LIMIT $limit
        `, { limit: neo4j.int(limit) });

        return NextResponse.json({
          laws: result.records.map(r => ({
            lawId: r.get('lawId'),
            title: r.get('title'),
            incoming: r.get('incoming').toNumber(),
            outgoing: r.get('outgoing').toNumber(),
            total: r.get('total').toNumber(),
          })),
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Network API error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  } finally {
    await session.close();
  }
}
