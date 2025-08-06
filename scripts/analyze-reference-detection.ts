import { LawXMLParser } from '../src/lib/xml-parser';
import { ReferenceDetector } from '../src/utils/reference-detector';
import { promises as fs } from 'fs';
import path from 'path';

interface ReferenceStats {
  lawId: string;
  lawTitle: string;
  totalArticles: number;
  totalReferences: number;
  referenceTypes: Record<string, number>;
  exampleReferences: string[];
  unmatchedPatterns: string[];
}

// 参照パターンのうち、検出されない可能性があるもの
const additionalPatterns = [
  /各号の一/g,                    // 「各号の一」
  /ただし書/g,                    // 「ただし書」への参照
  /本文/g,                        // 「本文」への参照
  /別表第[一二三四五]/g,           // 別表への参照
  /附則第[０-９0-9一二三四五六七八九十]+条/g, // 附則への参照
  /第[０-９0-9一二三四五六七八九十]+条の[０-９0-9一二三四五六七八九十]+から第[０-９0-9一二三四五六七八九十]+条の[０-９0-9一二三四五六七八九十]+まで/g, // 枝番号の範囲
  /[一二三四五六七八九十]に掲げる/g, // 号への参照
  /次項/g,                        // 次項への参照
  /第[一二三四五六七八九十]+号/g,  // 号のみの参照
  /その他の/g,                    // 「その他の」を含む参照
];

async function analyzeReferences(xmlPath: string): Promise<ReferenceStats> {
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  const filename = path.basename(xmlPath);
  
  const parser = new LawXMLParser();
  const lawData = parser.parseLawXML(xmlContent, filename);
  
  const detector = new ReferenceDetector();
  const allReferences: any[] = [];
  const referenceTypes: Record<string, number> = {};
  const unmatchedPatterns: string[] = [];
  
  // 各条文で参照を検出
  for (const article of lawData.articles) {
    const articleText = getArticleText(article);
    const detectedRefs = detector.detectReferences(
      articleText,
      article.articleNum
    );
    
    allReferences.push(...detectedRefs);
    
    // 参照タイプをカウント
    for (const ref of detectedRefs) {
      const key = `${ref.type}${ref.subType ? '-' + ref.subType : ''}`;
      referenceTypes[key] = (referenceTypes[key] || 0) + 1;
    }
    
    // 追加パターンをチェック（検出漏れの可能性）
    for (const pattern of additionalPatterns) {
      const matches = articleText.matchAll(pattern);
      for (const match of matches) {
        const matchText = match[0];
        // 既に検出されているか確認
        const isDetected = detectedRefs.some(ref => 
          ref.sourceText === matchText || ref.sourceText.includes(matchText)
        );
        
        if (!isDetected && !unmatchedPatterns.includes(matchText)) {
          unmatchedPatterns.push(matchText);
        }
      }
    }
  }
  
  // サンプル参照を収集（各タイプから最大3つ）
  const exampleReferences: string[] = [];
  const typeExamples: Record<string, string[]> = {};
  
  for (const ref of allReferences.slice(0, 100)) {
    const key = `${ref.type}${ref.subType ? '-' + ref.subType : ''}`;
    if (!typeExamples[key]) {
      typeExamples[key] = [];
    }
    if (typeExamples[key].length < 3) {
      typeExamples[key].push(ref.sourceText);
    }
  }
  
  for (const [type, examples] of Object.entries(typeExamples)) {
    for (const example of examples) {
      exampleReferences.push(`[${type}] ${example}`);
    }
  }
  
  return {
    lawId: lawData.lawId,
    lawTitle: lawData.lawTitle,
    totalArticles: lawData.articles.length,
    totalReferences: allReferences.length,
    referenceTypes,
    exampleReferences,
    unmatchedPatterns: unmatchedPatterns.slice(0, 20) // 最大20個
  };
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
        if (item.subitems) {
          for (const subitem of item.subitems) {
            if (subitem.content) {
              text += subitem.content + ' ';
            }
          }
        }
      }
    }
  }
  return text;
}

async function main() {
  const XML_DATA_PATH = path.join(process.cwd(), 'laws_data/sample');
  const files = await fs.readdir(XML_DATA_PATH);
  const xmlFiles = files.filter(f => f.endsWith('.xml'));
  
  console.log('参照検出精度分析レポート\n');
  console.log('=' .repeat(80));
  
  for (const file of xmlFiles) {
    const xmlPath = path.join(XML_DATA_PATH, file);
    
    try {
      const stats = await analyzeReferences(xmlPath);
      
      console.log(`\n【${stats.lawTitle}】（${stats.lawId}）`);
      console.log('-'.repeat(60));
      console.log(`条文数: ${stats.totalArticles}条`);
      console.log(`検出された参照数: ${stats.totalReferences}件`);
      console.log(`平均参照数: ${(stats.totalReferences / stats.totalArticles).toFixed(1)}件/条`);
      
      console.log('\n参照タイプ別統計:');
      const sortedTypes = Object.entries(stats.referenceTypes)
        .sort((a, b) => b[1] - a[1]);
      for (const [type, count] of sortedTypes) {
        console.log(`  ${type}: ${count}件`);
      }
      
      if (stats.exampleReferences.length > 0) {
        console.log('\n検出された参照の例:');
        for (const example of stats.exampleReferences.slice(0, 10)) {
          console.log(`  - ${example}`);
        }
      }
      
      if (stats.unmatchedPatterns.length > 0) {
        console.log('\n検出されなかった可能性のあるパターン:');
        for (const pattern of stats.unmatchedPatterns) {
          console.log(`  ⚠️  "${pattern}"`);
        }
      }
      
    } catch (error) {
      console.error(`\nエラー: ${file} の処理中にエラーが発生しました:`, error);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('分析完了');
}

main().catch(console.error);