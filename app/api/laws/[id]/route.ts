import { NextResponse } from 'next/server';
import { PrismaClient } from '../../../../src/generated/prisma';

const prisma = new PrismaClient();

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const lawId = params.id;
    
    // データベースから法令を取得
    const law = await prisma.law.findUnique({
      where: { id: lawId },
      include: {
        articles: {
          include: {
            paragraphs: {
              include: {
                items: true
              }
            },
            referencesFrom: true
          },
          orderBy: { articleNumber: 'asc' }
        }
      }
    });
    
    if (!law) {
      return NextResponse.json(
        { error: 'Law not found' },
        { status: 404 }
      );
    }
    
    // 構造情報を復元
    const structure = law.metadata as any || { parts: [], chapters: [], sections: [] };
    
    // レスポンス形式を整形
    const response = {
      lawId: law.id,
      lawTitle: law.title,
      lawNum: law.lawNumber || '',
      lawType: law.lawType || 'Act',
      promulgateDate: law.promulgationDate,
      structure,
      articles: law.articles.map(article => ({
        articleNum: article.articleNumber,
        articleTitle: article.articleTitle,
        paragraphs: article.paragraphs.map(para => ({
          content: para.content,
          items: para.items.map(item => ({
            title: item.itemNumber,
            content: item.content
          }))
        }))
      })),
      references: law.articles.flatMap(article => 
        article.referencesFrom.map(ref => ({
          sourceArticleNumber: article.articleNumber,
          sourceText: ref.referenceText,
          type: ref.referenceType,
          subType: ref.referenceSubType,
          targetArticleNumber: ref.targetArticleNumber,
          targetLawName: ref.targetLawName,
          confidence: ref.confidence
        }))
      )
    };
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error loading law:', error);
    return NextResponse.json(
      { error: 'Failed to load law' },
      { status: 500 }
    );
  }
}