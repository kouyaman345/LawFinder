import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const lawId = params.id;
    const url = new URL(request.url);
    const version = url.searchParams.get('version'); // 特定バージョンの指定（オプション）
    
    // 法令マスター情報を取得
    const lawMaster = await prisma.lawMaster.findUnique({
      where: { id: lawId },
      include: {
        currentVersion: true,
        versions: {
          orderBy: { versionDate: 'desc' },
          select: {
            id: true,
            versionDate: true,
            status: true,
            isLatest: true
          }
        }
      }
    });
    
    // 旧スキーマとの互換性チェック
    let law: any = null;
    let references: any[] = [];
    
    if (!lawMaster) {
      // 旧スキーマから取得を試みる
      law = await prisma.law.findUnique({
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
      
      if (law) {
        references = await prisma.reference.findMany({
          where: { sourceLawId: lawId }
        });
      }
    }
    
    if (!lawMaster && !law) {
      return NextResponse.json(
        { error: 'Law not found' },
        { status: 404 }
      );
    }
    
    // 構造情報を復元
    const structure = { parts: [], chapters: [], sections: [] };
    
    // 新スキーマの場合
    if (lawMaster) {
      // バージョンの決定
      let targetVersionId: string;
      
      if (version) {
        // 特定バージョンが指定された場合
        targetVersionId = `${lawId}_${version}`;
      } else if (lawMaster.currentVersionId) {
        // 現行の最新バージョンを使用
        targetVersionId = lawMaster.currentVersionId;
      } else if (lawMaster.versions.length > 0) {
        // currentVersionが設定されていない場合は最新のバージョンを使用
        targetVersionId = lawMaster.versions[0].id;
      } else {
        return NextResponse.json(
          { error: 'No version available for this law' },
          { status: 404 }
        );
      }
      
      // 指定バージョンの詳細データを取得
      const lawVersion = await prisma.lawVersion.findUnique({
        where: { id: targetVersionId },
        include: {
          articles: {
            orderBy: { sortOrder: 'asc' },
            include: {
              paragraphs: {
                orderBy: { paragraphNumber: 'asc' },
                include: {
                  items: {
                    orderBy: { itemNumber: 'asc' }
                  }
                }
              }
            }
          }
        }
      });
      
      if (!lawVersion) {
        return NextResponse.json(
          { error: 'Law version not found' },
          { status: 404 }
        );
      }
      
      // 参照データを取得（新スキーマ）
      references = await prisma.reference.findMany({
        where: { sourceLawId: lawId }
      });
      
      // レスポンス形式を整形（旧形式との互換性維持）
      const response = {
        lawId: lawMaster.id,
        lawTitle: lawMaster.title,
        lawNum: lawMaster.lawNumber || '',
        lawType: lawMaster.lawType || 'Act',
        promulgateDate: lawVersion.promulgationDate,
        effectiveDate: lawVersion.versionDate,
        status: lawVersion.status,
        isLatest: lawVersion.isLatest,
        
        // バージョン情報
        currentVersion: targetVersionId,
        availableVersions: lawMaster.versions.map(v => ({
          id: v.id,
          date: v.versionDate,
          status: v.status,
          isLatest: v.isLatest
        })),
        
        structure,
        articles: lawVersion.articles.map(article => ({
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
    }
    
    // 旧スキーマの場合（互換性維持）
    const response = {
      lawId: law.id,
      lawTitle: law.title,
      lawNum: law.lawNumber || '',
      lawType: law.lawType || 'Act',
      promulgateDate: law.promulgationDate,
      structure,
      articles: law.articles.map((article: any) => ({
        articleNum: article.articleNumber,
        articleTitle: article.articleTitle,
        paragraphs: article.paragraphs.map((para: any) => ({
          content: para.content,
          items: para.items.map((item: any) => ({
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