import { NextRequest, NextResponse } from 'next/server';
import HybridDBClient from '../../../../../src/lib/hybrid-db';

/**
 * 法令の参照関係を取得するAPI
 * GET /api/laws/[id]/references
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const client = HybridDBClient.getInstance();
    const { searchParams } = new URL(request.url);
    const articleNumber = searchParams.get('article');
    const visualize = searchParams.get('visualize') === 'true';

    if (articleNumber) {
      // 特定条文の参照関係
      const references = await client.getArticleReferences(params.id, articleNumber);
      return NextResponse.json({
        lawId: params.id,
        articleNumber,
        references
      });
    } else if (visualize) {
      // グラフ可視化用データ
      const maxNodes = parseInt(searchParams.get('maxNodes') || '50');
      const graph = await client.getReferenceGraph(params.id, maxNodes);
      return NextResponse.json({
        lawId: params.id,
        graph
      });
    } else {
      // 法令全体の参照統計
      const session = client.getNeo4jSession();
      try {
        const result = await session.run(
          `
          MATCH (l:Law {id: $lawId})-[:HAS_ARTICLE]->(a:Article)
          OPTIONAL MATCH (a)-[r:REFERS_TO|REFERS_TO_LAW|APPLIES|RELATIVE_REF]-()
          WITH a, count(r) as refCount
          RETURN a.number as articleNumber, 
                 a.title as articleTitle,
                 refCount
          ORDER BY a.numberInt
          `,
          { lawId: params.id }
        );

        const references = result.records.map(record => ({
          articleNumber: record.get('articleNumber'),
          articleTitle: record.get('articleTitle'),
          referenceCount: record.get('refCount').toNumber()
        }));

        return NextResponse.json({
          lawId: params.id,
          totalArticles: references.length,
          totalReferences: references.reduce((sum, r) => sum + r.referenceCount, 0),
          articles: references
        });
      } finally {
        await session.close();
      }
    }
  } catch (error) {
    console.error('参照関係取得エラー:', error);
    return NextResponse.json(
      { error: '参照関係の取得に失敗しました' },
      { status: 500 }
    );
  }
}