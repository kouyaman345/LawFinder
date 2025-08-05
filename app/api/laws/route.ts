import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    const where = search
      ? {
          OR: [
            { title: { contains: search } },
            { lawNumber: { contains: search } },
          ],
        }
      : {};

    const [laws, total] = await Promise.all([
      prisma.law.findMany({
        where,
        skip,
        take: limit,
        orderBy: { title: 'asc' },
        select: {
          id: true,
          title: true,
          lawNumber: true,
          promulgationDate: true,
          effectiveDate: true,
          _count: {
            select: { articles: true },
          },
        },
      }),
      prisma.law.count({ where }),
    ]);

    return NextResponse.json({
      data: laws,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching laws:', error);
    return NextResponse.json(
      { error: 'Failed to fetch laws' },
      { status: 500 }
    );
  }
}