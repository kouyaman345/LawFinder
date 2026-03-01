import { NextRequest, NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Neo4jドライバーの初期化（シングルトン）
let driver: neo4j.Driver | null = null;

function getDriver(): neo4j.Driver {
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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: lawId } = await context.params;
  const { searchParams } = new URL(request.url);
  const direction = searchParams.get('direction') || 'both'; // outgoing, incoming, both
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const pageSize = Math.min(Math.max(1, parseInt(searchParams.get('pageSize') || '5000')), 10000);
  const skip = (page - 1) * pageSize;

  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });

  try {
    // この法令から他法令への参照（outgoing）
    let outgoingRefs: any[] = [];
    let outgoingTotalCount = 0;
    if (direction === 'outgoing' || direction === 'both') {
      // まず実際の総件数を取得（LIMITなし）
      const outCountResult = await session.run(`
        MATCH (s)-[r:REFERENCES]->(t)
        WHERE s.lawId = $lawId AND t.lawId <> $lawId
        RETURN count(r) AS totalCount
      `, { lawId });
      outgoingTotalCount = outCountResult.records[0]?.get('totalCount')?.toNumber?.() ?? 0;

      // ページネーション付きでデータ取得
      const outResult = await session.run(`
        MATCH (s)-[r:REFERENCES]->(t)
        WHERE s.lawId = $lawId AND t.lawId <> $lawId
        WITH t.lawId AS targetLawId,
             CASE WHEN t:Law THEN t.title ELSE null END AS targetTitle,
             CASE WHEN s:Article THEN s.articleNumber ELSE null END AS sourceArticle,
             CASE WHEN t:Article THEN t.articleNumber ELSE null END AS targetArticle,
             r.text AS text,
             r.type AS type,
             r.confidence AS confidence,
             r.source AS source
        RETURN targetLawId, targetTitle, sourceArticle, targetArticle, text, type, confidence, source
        ORDER BY targetLawId, sourceArticle
        SKIP $skip
        LIMIT $pageSize
      `, { lawId, skip: neo4j.int(skip), pageSize: neo4j.int(pageSize) });

      outgoingRefs = outResult.records.map(r => ({
        direction: 'outgoing',
        targetLawId: r.get('targetLawId'),
        targetTitle: r.get('targetTitle'),
        sourceArticle: r.get('sourceArticle'),
        targetArticle: r.get('targetArticle'),
        text: r.get('text'),
        type: r.get('type') || 'external',
        confidence: r.get('confidence')?.toNumber?.() ?? r.get('confidence') ?? 1.0,
        source: r.get('source'),
      }));
    }

    // 他法令からこの法令への参照（incoming）
    let incomingRefs: any[] = [];
    let incomingTotalCount = 0;
    if (direction === 'incoming' || direction === 'both') {
      // まず実際の総件数を取得（LIMITなし）
      const inCountResult = await session.run(`
        MATCH (s)-[r:REFERENCES]->(t)
        WHERE t.lawId = $lawId AND s.lawId <> $lawId
        RETURN count(r) AS totalCount
      `, { lawId });
      incomingTotalCount = inCountResult.records[0]?.get('totalCount')?.toNumber?.() ?? 0;

      // ページネーション付きでデータ取得
      const inResult = await session.run(`
        MATCH (s)-[r:REFERENCES]->(t)
        WHERE t.lawId = $lawId AND s.lawId <> $lawId
        WITH s.lawId AS sourceLawId,
             CASE WHEN s:Law THEN s.title ELSE null END AS sourceTitle,
             CASE WHEN s:Article THEN s.articleNumber ELSE null END AS sourceArticle,
             CASE WHEN t:Article THEN t.articleNumber ELSE null END AS targetArticle,
             r.text AS text,
             r.type AS type,
             r.confidence AS confidence,
             r.source AS source
        RETURN sourceLawId, sourceTitle, sourceArticle, targetArticle, text, type, confidence, source
        ORDER BY sourceLawId, sourceArticle
        SKIP $skip
        LIMIT $pageSize
      `, { lawId, skip: neo4j.int(skip), pageSize: neo4j.int(pageSize) });

      incomingRefs = inResult.records.map(r => ({
        direction: 'incoming',
        sourceLawId: r.get('sourceLawId'),
        sourceTitle: r.get('sourceTitle'),
        sourceArticle: r.get('sourceArticle'),
        targetArticle: r.get('targetArticle'),
        text: r.get('text'),
        type: r.get('type') || 'external',
        confidence: r.get('confidence')?.toNumber?.() ?? r.get('confidence') ?? 1.0,
        source: r.get('source'),
      }));
    }

    // 法令タイトル取得
    const titleResult = await session.run(`
      MATCH (l:Law {lawId: $lawId})
      RETURN l.title AS title
      LIMIT 1
    `, { lawId });
    const lawTitle = titleResult.records[0]?.get('title') || '';

    // Collect all referenced law IDs for title lookup
    const allLawIds = new Set<string>();
    for (const ref of outgoingRefs) allLawIds.add(ref.targetLawId);
    for (const ref of incomingRefs) allLawIds.add(ref.sourceLawId);

    // Collect IDs with missing Neo4j titles (Article nodes don't carry Law title)
    const missingTitleIds = new Set<string>();
    for (const ref of outgoingRefs) {
      if (!ref.targetTitle || ref.targetTitle === 'e-Gov 法令検索') missingTitleIds.add(ref.targetLawId);
    }
    for (const ref of incomingRefs) {
      if (!ref.sourceTitle || ref.sourceTitle === 'e-Gov 法令検索') missingTitleIds.add(ref.sourceLawId);
    }

    // Batch lookup titles from Neo4j Law nodes for missing titles
    const neo4jTitleMap = new Map<string, string>();
    if (missingTitleIds.size > 0) {
      const neo4jTitles = await session.run(`
        UNWIND $ids AS id
        MATCH (l:Law {lawId: id})
        WHERE l.title IS NOT NULL AND l.title <> '' AND l.title <> l.lawId
        RETURN l.lawId AS lawId, l.title AS title
      `, { ids: Array.from(missingTitleIds) });
      for (const r of neo4jTitles.records) {
        neo4jTitleMap.set(r.get('lawId'), r.get('title'));
      }
    }

    // Batch lookup titles from PostgreSQL as final fallback
    const pgTitleMap = new Map<string, string>();
    if (allLawIds.size > 0) {
      const pgLaws = await prisma.lawMaster.findMany({
        where: { id: { in: Array.from(allLawIds) } },
        select: { id: true, title: true },
      });
      for (const law of pgLaws) {
        pgTitleMap.set(law.id, law.title);
      }
    }

    /** Get best available title for a lawId */
    function getTitle(lawId: string, neo4jTitle: string | null): string {
      if (neo4jTitle && neo4jTitle !== 'e-Gov 法令検索') return neo4jTitle;
      return neo4jTitleMap.get(lawId) || pgTitleMap.get(lawId) || lawId;
    }

    // 参照先法令をグループ化（outgoing）
    const outgoingByLaw = new Map<string, any>();
    for (const ref of outgoingRefs) {
      const key = ref.targetLawId;
      if (!outgoingByLaw.has(key)) {
        outgoingByLaw.set(key, {
          lawId: ref.targetLawId,
          title: getTitle(ref.targetLawId, ref.targetTitle),
          references: [],
        });
      }
      outgoingByLaw.get(key)!.references.push({
        sourceArticle: ref.sourceArticle,
        targetArticle: ref.targetArticle,
        text: ref.text,
        type: ref.type,
        confidence: ref.confidence,
      });
    }

    // 参照元法令をグループ化（incoming）
    const incomingByLaw = new Map<string, any>();
    for (const ref of incomingRefs) {
      const key = ref.sourceLawId;
      if (!incomingByLaw.has(key)) {
        incomingByLaw.set(key, {
          lawId: ref.sourceLawId,
          title: getTitle(ref.sourceLawId, ref.sourceTitle),
          references: [],
        });
      }
      incomingByLaw.get(key)!.references.push({
        sourceArticle: ref.sourceArticle,
        targetArticle: ref.targetArticle,
        text: ref.text,
        type: ref.type,
        confidence: ref.confidence,
      });
    }

    return NextResponse.json({
      lawId,
      lawTitle,
      outgoing: {
        count: outgoingTotalCount,
        returnedCount: outgoingRefs.length,
        page,
        pageSize,
        laws: Array.from(outgoingByLaw.values())
          .sort((a, b) => b.references.length - a.references.length),
      },
      incoming: {
        count: incomingTotalCount,
        returnedCount: incomingRefs.length,
        page,
        pageSize,
        laws: Array.from(incomingByLaw.values())
          .sort((a, b) => b.references.length - a.references.length),
      },
      totalReferences: outgoingTotalCount + incomingTotalCount,
    });

  } catch (error) {
    console.error('Error fetching references:', error);
    return NextResponse.json(
      { error: 'Failed to fetch references', detail: String(error) },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}
