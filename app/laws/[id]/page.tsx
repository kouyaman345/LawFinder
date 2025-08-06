import Link from 'next/link';
import { LawDetailClient } from '../../components/LawDetailClient';
import { LawXMLParser } from '../../../src/lib/xml-parser';
import { ReferenceDetector } from '../../../src/utils/reference-detector';
import { promises as fs } from 'fs';
import path from 'path';

const XML_DATA_PATH = path.join(process.cwd(), 'laws_data/sample');

// 静的パラメータの生成
export async function generateStaticParams() {
  const files = await fs.readdir(XML_DATA_PATH);
  const xmlFiles = files.filter(f => f.endsWith('.xml'));
  
  return xmlFiles.map(file => ({
    id: file.replace('.xml', '')
  }));
}

// メタデータの生成
export async function generateMetadata(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const xmlPath = path.join(XML_DATA_PATH, `${params.id}.xml`);
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    const parser = new LawXMLParser();
    const lawData = parser.parseLawXML(xmlContent, `${params.id}.xml`);
    
    return {
      title: `${lawData.lawTitle} | LawFinder`,
      description: `${lawData.lawTitle}の条文と参照関係を表示`
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
    // XMLファイルの読み込み
    const xmlPath = path.join(XML_DATA_PATH, `${lawId}.xml`);
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    
    // XMLパース
    const parser = new LawXMLParser();
    const lawData = parser.parseLawXML(xmlContent, `${lawId}.xml`);
    
    // 参照検出
    const detector = new ReferenceDetector();
    const allReferences: any[] = [];
    
    for (const article of lawData.articles) {
      const articleText = getArticleText(article);
      const detectedRefs = detector.detectReferences(
        articleText,
        article.articleNum
      );
      allReferences.push(...detectedRefs);
    }
    
    return (
      <LawDetailClient
        lawData={lawData}
        allReferences={allReferences}
        lawId={lawId}
      />
    );
  } catch (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            法令が見つかりません
          </h1>
          <p className="text-gray-600 mb-4">
            指定された法令ID: {lawId} は存在しません。
          </p>
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

function getArticleText(article: any): string {
  let text = '';
  if (article.articleTitle) {
    text += article.articleTitle + ' ';
  }
  for (const para of article.paragraphs) {
    if (para.content) {
      text += para.content + ' ';
    }
    if (para.items) {
      for (const item of para.items) {
        if (item.content) {
          text += item.content + ' ';
        }
      }
    }
  }
  return text;
}