import { NextRequest, NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';
import { EnhancedReferenceDetectorV41 } from '../../../../../src/domain/services/EnhancedReferenceDetectorV41';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Neo4jドライバーの初期化
const driver = neo4j.driver(
  process.env.NEO4J_URI || 'bolt://localhost:7687',
  neo4j.auth.basic(
    process.env.NEO4J_USER || 'neo4j',
    process.env.NEO4J_PASSWORD || 'lawfinder123'
  )
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const lawId = params.id;
  const session = driver.session();
  
  try {
    // まずNeo4jから既存の参照を取得
    const neo4jResult = await session.run(
      `MATCH (from:Law {lawId: $lawId})-[r:REFERENCES]->(to:Law)
       RETURN r.article as sourceArticle, 
              to.lawId as targetLaw,
              r.type as referenceType,
              r.text as referenceText
       LIMIT 100`,
      { lawId }
    );
    
    if (neo4jResult.records.length > 0) {
      // Neo4jにデータがある場合はそれを返す
      const references = neo4jResult.records.map(record => ({
        sourceArticle: record.get('sourceArticle'),
        targetLaw: record.get('targetLaw'),
        referenceType: record.get('referenceType'),
        referenceText: record.get('referenceText')
      }));
      
      return NextResponse.json({ references });
    }
    
    // Neo4jにデータがない場合は、リアルタイムで検出
    const law = await prisma.law.findUnique({
      where: { lawId },
      include: {
        articles: {
          orderBy: { articleNum: 'asc' },
          take: 10 // デモ用に最初の10条のみ
        }
      }
    });
    
    if (!law) {
      return NextResponse.json({ error: 'Law not found' }, { status: 404 });
    }
    
    // 参照検出器を使用
    const detector = new EnhancedReferenceDetectorV41({ enableCache: true });
    const references: any[] = [];
    
    for (const article of law.articles) {
      // 条文テキストを構築
      const articleText = article.paragraphs
        .map((p: any) => p.sentenceOrColumns?.map((s: any) => 
          s.sentence || s.column || ''
        ).join('') || '')
        .join(' ');
      
      // 参照を検出
      const detected = detector.detectReferences(articleText, article.articleNum);
      
      // 検出結果を整形
      detected.forEach(ref => {
        references.push({
          sourceArticle: article.articleNum,
          targetLaw: ref.type === 'external' ? ref.metadata?.lawNumber : lawId,
          targetArticle: ref.targetArticle,
          referenceType: ref.type,
          referenceText: ref.sourceText,
          metadata: ref.metadata
        });
      });
      
      // Neo4jに保存（バックグラウンド）
      if (detected.length > 0) {
        detected.forEach(async ref => {
          await session.run(
            `MERGE (from:Law {lawId: $fromLaw})
             MERGE (to:Law {lawId: $toLaw})
             MERGE (from)-[r:REFERENCES {
               type: $type,
               article: $article,
               text: $text
             }]->(to)`,
            {
              fromLaw: lawId,
              toLaw: ref.type === 'external' ? ref.metadata?.lawNumber || lawId : lawId,
              type: ref.type,
              article: article.articleNum,
              text: ref.sourceText
            }
          ).catch(() => {}); // エラーは無視
        });
      }
    }
    
    return NextResponse.json({ references });
    
  } catch (error) {
    console.error('Error fetching references:', error);
    return NextResponse.json(
      { error: 'Failed to fetch references' },
      { status: 500 }
    );
  } finally {
    await session.close();
  }
}