import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../../src/generated/prisma';
import { sortItemsByNumber, sortArticlesByNumber } from '../../../../src/utils/japanese-number-sort';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const law = await prisma.law.findUnique({
      where: { id },
      include: {
        articles: {
          orderBy: { articleNumber: 'asc' },
          include: {
            paragraphs: {
              orderBy: { paragraphNumber: 'asc' },
              include: {
                items: {
                  orderBy: { itemNumber: 'asc' },
                },
              },
            },
            referencesFrom: {
              include: {
                toArticle: {
                  select: {
                    id: true,
                    articleNumber: true,
                    law: {
                      select: {
                        id: true,
                        title: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!law) {
      return NextResponse.json(
        { error: 'Law not found' },
        { status: 404 }
      );
    }

    // 条文と項目を正しい順序でソート
    if (law.articles) {
      law.articles = sortArticlesByNumber(law.articles);
      law.articles.forEach(article => {
        article.paragraphs.forEach(paragraph => {
          if (paragraph.items && paragraph.items.length > 0) {
            paragraph.items = sortItemsByNumber(paragraph.items);
          }
        });
      });
    }

    return NextResponse.json(law);
  } catch (error) {
    console.error('Error fetching law:', error);
    return NextResponse.json(
      { error: 'Failed to fetch law' },
      { status: 500 }
    );
  }
}