import { NextRequest, NextResponse } from 'next/server';
import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver | null = null;

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

/**
 * ハネ改正影響分析API
 * GET /api/laws/[id]/impact?article=XXX&depth=2
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: lawId } = await context.params;

  try {
    const { searchParams } = new URL(request.url);
    const articleNumber = searchParams.get('article');
    const depth = Math.min(Math.max(parseInt(searchParams.get('depth') || '2'), 1), 5);

    if (!articleNumber) {
      return NextResponse.json(
        { error: '条番号を指定してください (article parameter required)' },
        { status: 400 }
      );
    }

    const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });

    try {
      // Run impact analysis directly with correct schema
      const result = await session.run(
        `
        MATCH path = (source:Article {lawId: $lawId, articleNumber: $articleNumber})
          <-[:REFERENCES*1..${depth}]-(affected)
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

      const impacts = result.records.map(record => ({
        lawId: record.get('lawId') as string,
        articleNumber: record.get('articleNumber') as string | null,
        nodeType: record.get('nodeType') as string,
        impactLevel: record.get('impactLevel').toNumber(),
        pathCount: record.get('pathCount').toNumber(),
      }));

      // Get law titles from Neo4j (faster than PostgreSQL for this)
      const affectedLawIds = [...new Set(impacts.map(i => i.lawId))];

      let titleMap = new Map<string, string>();
      if (affectedLawIds.length > 0) {
        const titleResult = await session.run(`
          UNWIND $ids AS lid
          MATCH (l:Law {lawId: lid})
          RETURN l.lawId AS lawId, l.title AS title
        `, { ids: affectedLawIds });

        for (const rec of titleResult.records) {
          titleMap.set(rec.get('lawId') as string, (rec.get('title') as string) || '');
        }
      }

      // Score and enrich impacts
      const scored = impacts.map(impact => {
        const impactScore = calculateImpactScore(impact.impactLevel, impact.pathCount);
        return {
          ...impact,
          lawTitle: titleMap.get(impact.lawId) || impact.lawId,
          impactScore,
        };
      });

      // Group by severity
      const high = scored.filter(i => i.impactScore >= 0.7);
      const medium = scored.filter(i => i.impactScore >= 0.4 && i.impactScore < 0.7);
      const low = scored.filter(i => i.impactScore < 0.4);

      return NextResponse.json({
        sourceLawId: lawId,
        sourceArticle: articleNumber,
        analysisDepth: depth,
        totalImpacted: impacts.length,
        impactedLaws: affectedLawIds.length,
        summary: {
          highImpact: high.length,
          mediumImpact: medium.length,
          lowImpact: low.length,
        },
        impactGroups: { high, medium, low },
      });
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('影響分析エラー:', error);
    return NextResponse.json(
      { error: '影響分析の実行に失敗しました' },
      { status: 500 }
    );
  }
}

/**
 * 影響度スコアの計算
 * impactScore = 1 / impactLevel * log(pathCount + 1)
 * Normalized to 0-1 range
 */
function calculateImpactScore(impactLevel: number, pathCount: number): number {
  const raw = (1 / impactLevel) * Math.log(pathCount + 1);
  // Normalize: log(101) ≈ 4.6, so max raw ≈ 4.6 at level 1
  return Math.min(raw / Math.log(11), 1);
}
