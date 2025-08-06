import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { LawXMLParser } from '../../../../src/lib/xml-parser';
import { ReferenceDetector } from '../../../../src/utils/reference-detector';

const XML_DATA_PATH = path.join(process.cwd(), 'laws_data/sample');

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const lawId = params.id;
    const xmlPath = path.join(XML_DATA_PATH, `${lawId}.xml`);
    
    // XMLファイルの読み込み
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    
    // XMLパース
    const parser = new LawXMLParser();
    const lawData = parser.parseLawXML(xmlContent, `${lawId}.xml`);
    
    // 参照検出
    const detector = new ReferenceDetector();
    const references = [];
    
    for (const article of lawData.articles) {
      const articleText = getArticleText(article);
      const detectedRefs = detector.detectReferences(
        articleText,
        article.articleNum,
        { paragraphNumber: 1 }
      );
      references.push(...detectedRefs);
    }
    
    return NextResponse.json({
      ...lawData,
      references
    });
  } catch (error) {
    console.error('Error loading law:', error);
    return NextResponse.json(
      { error: 'Law not found' },
      { status: 404 }
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