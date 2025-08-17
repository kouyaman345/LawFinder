#!/usr/bin/env npx tsx
/**
 * 参照検出検証スクリプト
 * 特定の法令（民法）で参照検出の精度を検証する
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ComprehensiveReferenceDetector } from '../src/domain/services/ComprehensiveReferenceDetector';
import { parseString } from 'xml2js';
import { promisify } from 'util';

const parseXML = promisify(parseString);

interface ValidationResult {
  lawId: string;
  lawTitle: string;
  totalArticles: number;
  totalReferences: number;
  referencesByType: Record<string, number>;
  sampleReferences: any[];
  processingTime: number;
}

class ReferenceValidator {
  private detector: ComprehensiveReferenceDetector;

  constructor() {
    this.detector = new ComprehensiveReferenceDetector();
  }

  async validateLaw(xmlPath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    
    // XMLファイルを読み込み
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    const lawId = path.basename(xmlPath, '.xml');
    
    // XMLをパース
    const xmlData = await parseXML(xmlContent);
    const lawTitle = this.extractLawTitle(xmlData);
    
    // 条文を抽出
    const articles = this.extractArticles(xmlData);
    console.log(`\n📖 法令: ${lawTitle}`);
    console.log(`📊 条文数: ${articles.length}`);
    
    // 参照を検出
    const allReferences: any[] = [];
    const referencesByType: Record<string, number> = {};
    
    for (const article of articles) {
      const references = this.detector.detectAllReferences(article.content);
      allReferences.push(...references);
      
      // タイプ別に集計
      for (const ref of references) {
        referencesByType[ref.type] = (referencesByType[ref.type] || 0) + 1;
      }
    }
    
    const processingTime = Date.now() - startTime;
    
    // サンプル参照を抽出（各タイプから最大5個）
    const sampleReferences = this.extractSampleReferences(allReferences);
    
    return {
      lawId,
      lawTitle,
      totalArticles: articles.length,
      totalReferences: allReferences.length,
      referencesByType,
      sampleReferences,
      processingTime
    };
  }

  private extractLawTitle(xmlData: any): string {
    try {
      const law = xmlData.Law || xmlData.law;
      const lawTitle = law?.LawBody?.[0]?.LawTitle?.[0] || 
                      law?.lawBody?.[0]?.lawTitle?.[0] ||
                      '（タイトル不明）';
      return lawTitle;
    } catch {
      return '（タイトル不明）';
    }
  }

  private extractArticles(xmlData: any): Array<{number: string, content: string}> {
    const articles: Array<{number: string, content: string}> = [];
    
    const extractFromNode = (node: any, path: string = '') => {
      if (!node) return;
      
      // 条文を探す
      if (node.Article || node.article) {
        const articleNodes = node.Article || node.article;
        for (const article of articleNodes) {
          const num = article.$?.Num || article.$?.num || '不明';
          const content = this.extractTextContent(article);
          articles.push({ number: num, content });
        }
      }
      
      // 再帰的に探索
      for (const key in node) {
        if (typeof node[key] === 'object' && node[key] !== null) {
          if (Array.isArray(node[key])) {
            for (const item of node[key]) {
              extractFromNode(item, `${path}/${key}`);
            }
          } else {
            extractFromNode(node[key], `${path}/${key}`);
          }
        }
      }
    };
    
    extractFromNode(xmlData);
    return articles;
  }

  private extractTextContent(node: any): string {
    let text = '';
    
    const extract = (obj: any) => {
      if (typeof obj === 'string') {
        text += obj;
      } else if (Array.isArray(obj)) {
        for (const item of obj) {
          extract(item);
        }
      } else if (typeof obj === 'object' && obj !== null) {
        for (const key in obj) {
          if (key !== '$') {  // 属性は除外
            extract(obj[key]);
          }
        }
      }
    };
    
    extract(node);
    return text;
  }

  private extractSampleReferences(references: any[]): any[] {
    const samples: any[] = [];
    const typeMap = new Map<string, any[]>();
    
    // タイプ別に分類
    for (const ref of references) {
      if (!typeMap.has(ref.type)) {
        typeMap.set(ref.type, []);
      }
      typeMap.get(ref.type)!.push(ref);
    }
    
    // 各タイプから最大5個サンプル
    for (const [type, refs] of typeMap) {
      const typeSamples = refs.slice(0, 5).map(ref => ({
        type: ref.type,
        text: ref.text,
        confidence: ref.confidence,
        context: ref.context.substring(0, 100) + '...'
      }));
      samples.push(...typeSamples);
    }
    
    return samples;
  }

  async generateReport(result: ValidationResult): Promise<void> {
    const reportDir = '/home/coffee/projects/LawFinder/validation-reports';
    await fs.mkdir(reportDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `${result.lawId}_${timestamp}.md`);
    
    const report = `# 参照検出検証レポート

## 法令情報
- **法令ID**: ${result.lawId}
- **法令名**: ${result.lawTitle}
- **条文数**: ${result.totalArticles}
- **処理時間**: ${result.processingTime}ms

## 検出結果サマリー
- **総参照数**: ${result.totalReferences}
- **平均参照数/条文**: ${(result.totalReferences / result.totalArticles).toFixed(2)}

## タイプ別検出数
${Object.entries(result.referencesByType)
  .sort((a, b) => b[1] - a[1])
  .map(([type, count]) => `- **${type}**: ${count}件`)
  .join('\n')}

## サンプル参照
\`\`\`json
${JSON.stringify(result.sampleReferences, null, 2)}
\`\`\`

## 検証時刻
${new Date().toLocaleString('ja-JP')}
`;
    
    await fs.writeFile(reportPath, report);
    console.log(`\n✅ レポート生成: ${reportPath}`);
  }
}

// メイン処理
async function main() {
  const validator = new ReferenceValidator();
  
  // 民法を検証
  const xmlPath = '/home/coffee/projects/LawFinder/laws_data/sample/129AC0000000089.xml';
  
  console.log('🔍 参照検出検証を開始します...');
  
  try {
    const result = await validator.validateLaw(xmlPath);
    
    console.log('\n📊 検出結果:');
    console.log(`  総参照数: ${result.totalReferences}`);
    console.log(`  タイプ別:`, result.referencesByType);
    
    await validator.generateReport(result);
    
  } catch (error) {
    console.error('❌ エラー:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}