import Link from 'next/link';
import { LawDetailClient } from '../../components/LawDetailClient';
import { PrismaClient } from '../../../src/generated/prisma';

const prisma = new PrismaClient();

// 動的レンダリングを使用（データベースから取得するため）
export const dynamic = 'force-dynamic';

// メタデータの生成
export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const law = await prisma.law.findUnique({
      where: { id: params.id },
      select: { title: true }
    });
    
    if (!law) {
      return {
        title: '法令が見つかりません | LawFinder'
      };
    }
    
    return {
      title: `${law.title} | LawFinder`,
      description: `${law.title}の条文と参照関係を表示`
    };
  } catch {
    return {
      title: '法令が見つかりません | LawFinder'
    };
  }
}

export default async function LawDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const lawId = params.id;
  
  try {
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
      throw new Error('Law not found');
    }
    
    // データ形式を変換
    const structure = law.metadata as any || { parts: [], chapters: [], sections: [] };
    
    const lawData = {
      lawId: law.id,
      lawTitle: law.title,
      lawNum: law.lawNumber || '',
      lawType: law.lawType || 'Act',
      promulgateDate: law.promulgationDate || new Date(),
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
      }))
    };
    
    const allReferences = law.articles.flatMap(article => 
      article.referencesFrom.map(ref => ({
        sourceArticleNumber: article.articleNumber,
        sourceText: ref.referenceText,
        type: ref.referenceType,
        subType: ref.referenceSubType,
        targetArticleNumber: ref.targetArticleNumber,
        targetLawName: ref.targetLawName,
        confidence: ref.confidence || 0.8
      }))
    );
    
    return (
      <LawDetailClient
        lawData={lawData}
        allReferences={allReferences}
        lawId={lawId}
      />
    );
  } catch (error) {
    console.error(`Error loading law ${lawId}:`, error);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            法令が見つかりません
          </h1>
          <p className="text-gray-600 mb-4">
            指定された法令ID: {lawId} は存在しません。
          </p>
          {process.env.NODE_ENV === 'development' && (
            <p className="text-red-600 text-sm mb-4">
              Error: {error instanceof Error ? error.message : String(error)}
            </p>
          )}
          <Link
            href="/laws"
            className="text-blue-600 hover:text-blue-800 underline"
          >
            法令一覧に戻る
          </Link>
        </div>
      </div>
    );
  }
}