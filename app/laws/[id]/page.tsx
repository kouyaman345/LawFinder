import Link from 'next/link';
import { LawDetailClient } from '../../components/LawDetailClient';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// XMLから制定文を抽出
function extractEnactStatements(xmlContent: string): string[] {
  const enactStatements: string[] = [];
  const matches = xmlContent.matchAll(/<EnactStatement>([^<]+)<\/EnactStatement>/g);
  for (const match of matches) {
    enactStatements.push(match[1]);
  }
  return enactStatements;
}

// 階層構造を構築する関数（編・本則・附則対応）
function buildStructure(articles: any[]) {
  const structure = {
    divisions: [] as any[], // 本則・附則
    parts: [] as any[],     // 編
    chapters: [] as any[],  // 章
    sections: [] as any[]   // 節
  };
  
  // 区分・編・章・節の情報を収集
  const divisionsMap = new Map<string, { parts: Set<string>; chapters: Set<string>; articles: Set<string> }>();
  const partsMap = new Map<string, { chapters: Set<string>; articles: Set<string> }>();
  const chaptersMap = new Map<string, { sections: Set<string>; articles: Set<string> }>();
  const sectionsMap = new Map<string, Set<string>>();
  
  articles.forEach(article => {
    const division = article.division || '本則';
    const part = article.part;
    const chapter = article.chapter;
    const section = article.section;
    
    // 区分（本則/附則）レベル
    if (!divisionsMap.has(division)) {
      divisionsMap.set(division, { parts: new Set(), chapters: new Set(), articles: new Set() });
    }
    
    // 編レベル
    if (part) {
      divisionsMap.get(division)!.parts.add(part);
      if (!partsMap.has(part)) {
        partsMap.set(part, { chapters: new Set(), articles: new Set() });
      }
      
      if (chapter) {
        partsMap.get(part)!.chapters.add(chapter);
      } else {
        partsMap.get(part)!.articles.add(article.articleNumber);
      }
    } else if (chapter) {
      divisionsMap.get(division)!.chapters.add(chapter);
    } else {
      divisionsMap.get(division)!.articles.add(article.articleNumber);
    }
    
    // 章レベル
    if (chapter) {
      if (!chaptersMap.has(chapter)) {
        chaptersMap.set(chapter, { sections: new Set(), articles: new Set() });
      }
      
      if (section) {
        chaptersMap.get(chapter)!.sections.add(section);
        if (!sectionsMap.has(section)) {
          sectionsMap.set(section, new Set());
        }
        sectionsMap.get(section)!.add(article.articleNumber);
      } else {
        chaptersMap.get(chapter)!.articles.add(article.articleNumber);
      }
    }
  });
  
  // 区分データを構築（本則を先、附則を後に）
  let divNum = 1;
  
  // まず本則を追加
  if (divisionsMap.has('本則')) {
    const data = divisionsMap.get('本則')!;
    structure.divisions.push({
      num: String(divNum),
      title: '本則',
      parts: Array.from(data.parts),
      chapters: Array.from(data.chapters),
      articles: Array.from(data.articles)
    });
    divNum++;
  }
  
  // 次に附則を追加（複数の附則がある可能性）
  divisionsMap.forEach((data, divisionTitle) => {
    if (divisionTitle !== '本則') {
      structure.divisions.push({
        num: String(divNum),
        title: divisionTitle,
        parts: Array.from(data.parts),
        chapters: Array.from(data.chapters),
        articles: Array.from(data.articles)
      });
      divNum++;
    }
  });
  
  // 編データを構築
  let partNum = 1;
  partsMap.forEach((data, partTitle) => {
    structure.parts.push({
      num: String(partNum),
      title: partTitle,
      chapters: Array.from(data.chapters),
      articles: Array.from(data.articles)
    });
    partNum++;
  });
  
  // 章データを構築
  let chapterNum = 1;
  chaptersMap.forEach((data, chapterTitle) => {
    const sectionNums: string[] = [];
    data.sections.forEach(sectionTitle => {
      let sNum = 1;
      for (const [title, _] of sectionsMap) {
        if (title === sectionTitle) {
          sectionNums.push(String(sNum));
          break;
        }
        sNum++;
      }
    });
    
    structure.chapters.push({
      num: String(chapterNum),
      title: chapterTitle,
      sections: sectionNums,
      articles: Array.from(data.articles)
    });
    chapterNum++;
  });
  
  // 節データを構築
  let sectionNum = 1;
  sectionsMap.forEach((articleNums, sectionTitle) => {
    structure.sections.push({
      num: String(sectionNum),
      title: sectionTitle,
      articles: Array.from(articleNums)
    });
    sectionNum++;
  });
  
  return structure;
}

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
    // データベースから法令を取得（XMLも含む）
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
    
    if (!law) {
      throw new Error('Law not found');
    }
    
    // データ形式を変換 - 章節構造を構築
    const structure = buildStructure(law.articles);
    
    // 制定文を抽出
    const enactStatements = extractEnactStatements(law.xmlContent);
    
    const lawData = {
      lawId: law.id,
      lawTitle: law.title,
      lawNum: law.lawNumber || '',
      lawType: law.lawType || 'Act',
      promulgateDate: law.promulgationDate || new Date(),
      enactStatements, // 制定文を追加
      structure,
      articles: law.articles.map(article => ({
        articleNum: article.articleNumber,
        articleTitle: article.articleTitle,
        isDeleted: article.isDeleted,  // 削除フラグを追加
        paragraphs: article.paragraphs.map(para => ({
          content: para.content,
          items: para.items.map(item => ({
            title: item.itemNumber,
            content: item.content
          }))
        }))
      }))
    };
    
    // 参照情報を取得
    const references = await prisma.reference.findMany({
      where: { sourceLawId: lawId }
    });
    
    const allReferences = references.map(ref => ({
      sourceArticle: ref.sourceArticle,
      targetLawId: ref.targetLawId,
      targetArticle: ref.targetArticle,
      type: ref.referenceType,
      text: ref.referenceText,
      confidence: ref.confidence,
      metadata: ref.metadata
    }));
    
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