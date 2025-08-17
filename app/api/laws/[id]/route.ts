import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

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
            }
          },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });
    
    // 参照データを取得
    const references = await prisma.reference.findMany({
      where: { sourceLawId: lawId }
    });
    
    if (!law) {
      return NextResponse.json(
        { error: 'Law not found' },
        { status: 404 }
      );
    }
    
    // 構造情報を復元
    const structure = { parts: [], chapters: [], sections: [] };
    
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
      references: references.map(ref => ({
        sourceArticle: ref.sourceArticle,
        targetLawId: ref.targetLawId,
        targetArticle: ref.targetArticle,
        type: ref.referenceType,
        text: ref.referenceText,
        confidence: ref.confidence,
        metadata: ref.metadata
      }))
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