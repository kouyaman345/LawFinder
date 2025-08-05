import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lawId = searchParams.get('lawId');
    const articleId = searchParams.get('articleId');

    let where = {};
    if (lawId) {
      where = {
        fromArticle: {
          lawId,
        },
      };
    } else if (articleId) {
      where = {
        OR: [
          { fromArticleId: articleId },
          { toArticleId: articleId },
        ],
      };
    }

    const references = await prisma.reference.findMany({
      where,
      include: {
        fromArticle: {
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
      take: 100,
    });

    return NextResponse.json(references);
  } catch (error) {
    console.error('Error fetching references:', error);
    return NextResponse.json(
      { error: 'Failed to fetch references' },
      { status: 500 }
    );
  }
}