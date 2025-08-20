#!/usr/bin/env npx tsx
/**
 * 実際の法令データでの参照検出検証ツール
 * 
 * 複数の実際の法令XMLファイルを使用して、
 * 参照検出の精度と網羅性を検証する
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseString } from 'xml2js';
import { EnhancedReferenceDetectorV33 } from '../src/domain/services/EnhancedReferenceDetectorV33';
import chalk from 'chalk';
import ora from 'ora';

interface LawArticle {
  articleNumber: string;
  articleTitle: string;
  paragraphs: string[];
}

interface LawData {
  lawId: string;
  lawTitle: string;
  articles: LawArticle[];
}

interface ValidationResult {
  lawId: string;
  lawTitle: string;
  totalArticles: number;
  totalReferences: number;
  referencesByType: { [key: string]: number };
  simpleReferences: number;
  complexReferences: number;
  detectionRate: number;
  examples: any[];
}

/**
 * 法令XMLパーサー
 */
class LawXMLParser {
  /**
   * XMLファイルから法令データを抽出
   */
  async parseLawXML(xmlPath: string): Promise<LawData | null> {
    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      
      return new Promise((resolve, reject) => {
        parseString(xmlContent, (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          
          const law = result.Law || result.法令;
          if (!law) {
            resolve(null);
            return;
          }
          
          // 法令ID抽出
          const lawId = path.basename(path.dirname(xmlPath));
          
          // 法令名抽出
          const lawTitle = this.extractLawTitle(law);
          
          // 条文抽出
          const articles = this.extractArticles(law);
          
          resolve({
            lawId,
            lawTitle,
            articles
          });
        });
      });
    } catch (error) {
      console.error(`Error parsing ${xmlPath}:`, error);
      return null;
    }
  }
  
  /**
   * 法令名を抽出
   */
  private extractLawTitle(law: any): string {
    if (law.LawTitle) {
      return law.LawTitle[0];
    }
    if (law.法令名) {
      return law.法令名[0];
    }
    if (law.LawBody && law.LawBody[0].LawTitle) {
      return law.LawBody[0].LawTitle[0];
    }
    return '不明な法令';
  }
  
  /**
   * 条文を抽出
   */
  private extractArticles(law: any): LawArticle[] {
    const articles: LawArticle[] = [];
    
    // LawBodyから条文を探す
    const lawBody = law.LawBody?.[0] || law.法令本体?.[0] || law;
    
    // MainProvisionから条文を探す
    const mainProvision = lawBody.MainProvision?.[0] || lawBody.本則?.[0];
    if (!mainProvision) return articles;
    
    // 章・節・条の階層を探索
    this.extractArticlesFromNode(mainProvision, articles);
    
    return articles;
  }
  
  /**
   * ノードから再帰的に条文を抽出
   */
  private extractArticlesFromNode(node: any, articles: LawArticle[]): void {
    if (!node) return;
    
    // 直接の条文
    if (node.Article) {
      for (const article of node.Article) {
        const extracted = this.extractSingleArticle(article);
        if (extracted) articles.push(extracted);
      }
    }
    
    // 章
    if (node.Chapter) {
      for (const chapter of node.Chapter) {
        this.extractArticlesFromNode(chapter, articles);
      }
    }
    
    // 節
    if (node.Section) {
      for (const section of node.Section) {
        this.extractArticlesFromNode(section, articles);
      }
    }
    
    // 款
    if (node.Subsection) {
      for (const subsection of node.Subsection) {
        this.extractArticlesFromNode(subsection, articles);
      }
    }
    
    // Part（編）
    if (node.Part) {
      for (const part of node.Part) {
        this.extractArticlesFromNode(part, articles);
      }
    }
  }
  
  /**
   * 単一の条文を抽出
   */
  private extractSingleArticle(article: any): LawArticle | null {
    if (!article) return null;
    
    // 条番号
    const articleNumber = article.ArticleTitle?.[0] || 
                          article.ArticleCaption?.[0] || 
                          article.$.Num || 
                          '不明';
    
    // 条見出し
    const articleTitle = article.ArticleCaption?.[0] || '';
    
    // 項のテキストを収集
    const paragraphs: string[] = [];
    if (article.Paragraph) {
      for (const paragraph of article.Paragraph) {
        const text = this.extractParagraphText(paragraph);
        if (text) paragraphs.push(text);
      }
    }
    
    return {
      articleNumber,
      articleTitle,
      paragraphs
    };
  }
  
  /**
   * 項のテキストを抽出
   */
  private extractParagraphText(paragraph: any): string {
    if (!paragraph) return '';
    
    // ParagraphSentence -> Sentence
    if (paragraph.ParagraphSentence) {
      const sentences = [];
      for (const ps of paragraph.ParagraphSentence) {
        if (ps.Sentence) {
          for (const sentence of ps.Sentence) {
            if (typeof sentence === 'string') {
              sentences.push(sentence);
            } else if (sentence._) {
              sentences.push(sentence._);
            }
          }
        }
      }
      return sentences.join('');
    }
    
    // 直接のテキスト
    if (paragraph._ || typeof paragraph === 'string') {
      return paragraph._ || paragraph;
    }
    
    return '';
  }
}

/**
 * 参照検出検証クラス
 */
class ReferenceValidator {
  private detector: EnhancedReferenceDetectorV33;
  private parser: LawXMLParser;
  
  constructor() {
    this.detector = new EnhancedReferenceDetectorV33();
    this.parser = new LawXMLParser();
  }
  
  /**
   * 単一の法令を検証
   */
  async validateLaw(xmlPath: string): Promise<ValidationResult | null> {
    const lawData = await this.parser.parseLawXML(xmlPath);
    if (!lawData) return null;
    
    let totalReferences = 0;
    const referencesByType: { [key: string]: number } = {};
    const examples: any[] = [];
    let simpleReferences = 0;
    let complexReferences = 0;
    
    // 各条文の参照を検出
    for (const article of lawData.articles) {
      for (const paragraph of article.paragraphs) {
        const references = this.detector.detectReferences(paragraph, article.articleNumber);
        
        for (const ref of references) {
          totalReferences++;
          referencesByType[ref.type] = (referencesByType[ref.type] || 0) + 1;
          
          // 単純/複雑の分類
          if (this.isSimpleReference(ref)) {
            simpleReferences++;
          } else {
            complexReferences++;
          }
          
          // 例を収集（最初の10個まで）
          if (examples.length < 10) {
            examples.push({
              article: article.articleNumber,
              type: ref.type,
              text: ref.text,
              target: ref.targetArticle
            });
          }
        }
      }
    }
    
    return {
      lawId: lawData.lawId,
      lawTitle: lawData.lawTitle,
      totalArticles: lawData.articles.length,
      totalReferences,
      referencesByType,
      simpleReferences,
      complexReferences,
      detectionRate: simpleReferences > 0 ? 
        (simpleReferences / (simpleReferences + complexReferences)) * 100 : 0,
      examples
    };
  }
  
  /**
   * 単純な参照かどうかを判定
   */
  private isSimpleReference(ref: any): boolean {
    // 単純な参照の定義：
    // - 単独の条文参照（第N条）
    // - 明示的な法令参照（○○法第N条）
    // - 相対参照で解決済み（前条・次条）
    
    if (ref.type === 'internal' && !ref.metadata?.paragraph && !ref.metadata?.item) {
      return true; // 単純な内部参照
    }
    
    if (ref.type === 'external' && ref.targetLaw && ref.targetArticle) {
      return true; // 明示的な外部参照
    }
    
    if (ref.type === 'relative' && ref.targetArticle && !ref.targetArticle.includes('条')) {
      return false; // 未解決の相対参照
    }
    
    if (ref.type === 'relative' && ref.targetArticle && ref.targetArticle.includes('第')) {
      return true; // 解決済みの相対参照
    }
    
    return false; // その他は複雑な参照
  }
  
  /**
   * 複数の法令を検証
   */
  async validateMultipleLaws(xmlPaths: string[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    for (const xmlPath of xmlPaths) {
      const spinner = ora(`検証中: ${path.basename(xmlPath)}`).start();
      const result = await this.validateLaw(xmlPath);
      
      if (result) {
        results.push(result);
        spinner.succeed(`完了: ${result.lawTitle} - ${result.totalReferences}件の参照を検出`);
      } else {
        spinner.fail(`失敗: ${path.basename(xmlPath)}`);
      }
    }
    
    return results;
  }
  
  /**
   * 結果サマリーを生成
   */
  generateSummary(results: ValidationResult[]): string {
    let summary = '# 法令参照検出検証レポート\n\n';
    summary += `検証日時: ${new Date().toISOString()}\n`;
    summary += `検証法令数: ${results.length}\n\n`;
    
    // 全体統計
    const totalArticles = results.reduce((sum, r) => sum + r.totalArticles, 0);
    const totalReferences = results.reduce((sum, r) => sum + r.totalReferences, 0);
    const totalSimple = results.reduce((sum, r) => sum + r.simpleReferences, 0);
    const totalComplex = results.reduce((sum, r) => sum + r.complexReferences, 0);
    
    summary += '## 全体統計\n\n';
    summary += `- 総条文数: ${totalArticles}\n`;
    summary += `- 総参照数: ${totalReferences}\n`;
    summary += `- 単純な参照: ${totalSimple} (${(totalSimple/totalReferences*100).toFixed(1)}%)\n`;
    summary += `- 複雑な参照: ${totalComplex} (${(totalComplex/totalReferences*100).toFixed(1)}%)\n\n`;
    
    // タイプ別統計
    const typeStats: { [key: string]: number } = {};
    for (const result of results) {
      for (const [type, count] of Object.entries(result.referencesByType)) {
        typeStats[type] = (typeStats[type] || 0) + count;
      }
    }
    
    summary += '## 参照タイプ別統計\n\n';
    for (const [type, count] of Object.entries(typeStats).sort((a, b) => b[1] - a[1])) {
      summary += `- ${type}: ${count} (${(count/totalReferences*100).toFixed(1)}%)\n`;
    }
    summary += '\n';
    
    // 法令別詳細
    summary += '## 法令別詳細\n\n';
    for (const result of results) {
      summary += `### ${result.lawTitle}\n`;
      summary += `- 法令ID: ${result.lawId}\n`;
      summary += `- 条文数: ${result.totalArticles}\n`;
      summary += `- 参照数: ${result.totalReferences}\n`;
      summary += `- 単純な参照の割合: ${result.detectionRate.toFixed(1)}%\n`;
      
      if (result.examples.length > 0) {
        summary += `- 検出例:\n`;
        for (const ex of result.examples.slice(0, 3)) {
          summary += `  - ${ex.article} [${ex.type}] "${ex.text}" → ${ex.target}\n`;
        }
      }
      summary += '\n';
    }
    
    return summary;
  }
}

// メイン実行
async function main() {
  const validator = new ReferenceValidator();
  
  // テスト用の法令XMLファイルを収集
  const lawsDataDir = path.join(process.cwd(), 'laws_data', 'sample');
  
  // サンプルディレクトリがない場合は作成
  if (!fs.existsSync(lawsDataDir)) {
    console.log(chalk.yellow('サンプルディレクトリを作成しています...'));
    fs.mkdirSync(lawsDataDir, { recursive: true });
    
    // いくつかの法令をコピー
    const lawsToCopy = [
      '129AC0000000089', // 民法
      '132AC0000000048', // 商法
      '140AC0000000045', // 刑法
      '322AC0000000049', // 労働基準法
    ];
    
    for (const lawId of lawsToCopy) {
      const sourcePaths = fs.readdirSync(path.join(process.cwd(), 'laws_data'))
        .filter(dir => dir.startsWith(lawId))
        .map(dir => path.join(process.cwd(), 'laws_data', dir));
      
      if (sourcePaths.length > 0) {
        const xmlFiles = fs.readdirSync(sourcePaths[0])
          .filter(file => file.endsWith('.xml'));
        
        if (xmlFiles.length > 0) {
          const sourceFile = path.join(sourcePaths[0], xmlFiles[0]);
          const destFile = path.join(lawsDataDir, `${lawId}.xml`);
          fs.copyFileSync(sourceFile, destFile);
          console.log(chalk.green(`✓ ${lawId}.xml をコピーしました`));
        }
      }
    }
  }
  
  // XMLファイルを収集
  const xmlFiles = fs.readdirSync(lawsDataDir)
    .filter(file => file.endsWith('.xml'))
    .map(file => path.join(lawsDataDir, file));
  
  if (xmlFiles.length === 0) {
    console.log(chalk.red('検証するXMLファイルが見つかりません'));
    return;
  }
  
  console.log(chalk.cyan(`\n${xmlFiles.length}個の法令を検証します\n`));
  
  // 検証実行
  const results = await validator.validateMultipleLaws(xmlFiles);
  
  // レポート生成
  const summary = validator.generateSummary(results);
  const reportPath = `validation-report-${new Date().toISOString().slice(0, 10)}.md`;
  fs.writeFileSync(reportPath, summary);
  
  // コンソール出力
  console.log(chalk.cyan('\n=== 検証結果サマリー ===\n'));
  
  const totalRefs = results.reduce((sum, r) => sum + r.totalReferences, 0);
  const simpleRefs = results.reduce((sum, r) => sum + r.simpleReferences, 0);
  
  console.log(`総参照数: ${chalk.bold(totalRefs)}`);
  console.log(`単純な参照: ${chalk.green(simpleRefs)} (${chalk.bold((simpleRefs/totalRefs*100).toFixed(1) + '%')})`);
  console.log(`複雑な参照: ${chalk.yellow(totalRefs - simpleRefs)} (${chalk.bold(((totalRefs-simpleRefs)/totalRefs*100).toFixed(1) + '%')})`);
  
  console.log(chalk.green(`\nレポートを ${reportPath} に保存しました`));
}

// エラーハンドリング
main().catch(error => {
  console.error(chalk.red('エラー:'), error);
  process.exit(1);
});

export { LawXMLParser, ReferenceValidator };