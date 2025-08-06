import { NextRequest, NextResponse } from 'next/server';
import HybridDBClient from '../../../../../src/lib/hybrid-db';

/**
 * ハネ改正影響分析API
 * GET /api/laws/[id]/impact?article=XXX&depth=3
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const articleNumber = searchParams.get('article');
    const depth = parseInt(searchParams.get('depth') || '3');

    if (!articleNumber) {
      return NextResponse.json(
        { error: '条番号を指定してください' },
        { status: 400 }
      );
    }

    if (depth < 1 || depth > 5) {
      return NextResponse.json(
        { error: '探索深度は1から5の間で指定してください' },
        { status: 400 }
      );
    }

    const client = HybridDBClient.getInstance();
    
    // ハネ改正影響分析の実行
    const impacts = await client.analyzeAmendmentImpact(
      params.id,
      articleNumber,
      depth
    );

    // 影響を受ける法令の詳細情報を取得
    const prisma = client.getPrisma();
    const affectedLawIds = [...new Set(impacts.map(i => i.lawId))];
    const laws = await prisma.law.findMany({
      where: { id: { in: affectedLawIds } },
      select: {
        id: true,
        title: true,
        lawType: true,
        status: true
      }
    });

    const lawMap = new Map(laws.map(l => [l.id, l]));

    // 結果を整形
    const result = {
      sourceLawId: params.id,
      sourceArticle: articleNumber,
      analysisDepth: depth,
      totalImpacted: impacts.length,
      impactedLaws: affectedLawIds.length,
      impacts: impacts.map(impact => ({
        ...impact,
        lawTitle: lawMap.get(impact.lawId)?.title || '不明',
        lawType: lawMap.get(impact.lawId)?.lawType || '',
        impactScore: calculateImpactScore(impact.impactLevel, impact.pathCount)
      }))
    };

    // 影響度でグループ化
    const impactGroups = {
      high: result.impacts.filter(i => i.impactScore >= 0.7),
      medium: result.impacts.filter(i => i.impactScore >= 0.4 && i.impactScore < 0.7),
      low: result.impacts.filter(i => i.impactScore < 0.4)
    };

    return NextResponse.json({
      ...result,
      summary: {
        highImpact: impactGroups.high.length,
        mediumImpact: impactGroups.medium.length,
        lowImpact: impactGroups.low.length
      },
      impactGroups
    });

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
 */
function calculateImpactScore(impactLevel: number, pathCount: number): number {
  // 距離による減衰（近いほど影響大）
  const distanceScore = 1 / (impactLevel * 0.5);
  
  // 経路数による重み（多いほど影響大）
  const pathScore = Math.min(pathCount / 10, 1);
  
  // 総合スコア（0-1の範囲）
  return Math.min((distanceScore * 0.7 + pathScore * 0.3), 1);
}