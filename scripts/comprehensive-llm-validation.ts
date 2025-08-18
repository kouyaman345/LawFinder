#!/usr/bin/env tsx

/**
 * 包括的LLM検証スクリプト
 * 実際の法令データを使用した大規模テスト
 */

import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { EnhancedReferenceDetectorV37 } from '../src/domain/services/EnhancedReferenceDetectorV37';
import { LLMValidator } from '../src/lib/llm-validator';

interface LawData {
  lawId: string;
  lawName: string;
  articles: ArticleData[];
}

interface ArticleData {
  articleNumber: string;
  content: string;
}

interface ValidationResult {
  lawId: string;
  lawName: string;
  totalArticles: number;
  algorithmDetected: number;
  llmValidated: number;
  llmImproved: number;
  missedDetected: number;
  falsePositivesRemoved: number;
  relativeResolved: number;
  abbreviationExpanded: number;
  processingTime: number;
}

class ComprehensiveLLMValidator {
  private detector: EnhancedReferenceDetectorV37;
  private validator: LLMValidator;
  private parser: xml2js.Parser;
  
  constructor() {
    this.detector = new EnhancedReferenceDetectorV37();
    this.validator = new LLMValidator('qwen2.5:7b');
    this.parser = new xml2js.Parser();
  }
  
  /**
   * XMLファイルから法令データを抽出
   */
  async extractLawData(xmlPath: string): Promise<LawData | null> {
    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const result = await this.parser.parseStringPromise(xmlContent);
      
      const lawId = path.basename(xmlPath, '.xml');
      const lawName = this.extractLawName(result);
      const articles = this.extractArticles(result);
      
      return {
        lawId,
        lawName,
        articles
      };
    } catch (error) {
      console.error(`Error parsing ${xmlPath}:`, error);
      return null;
    }
  }
  
  private extractLawName(xmlData: any): string {
    try {
      if (xmlData.Law && xmlData.Law.LawBody) {
        const lawBody = xmlData.Law.LawBody[0];
        if (lawBody.LawTitle) {
          return lawBody.LawTitle[0]._ || lawBody.LawTitle[0];
        }
      }
      return '不明';
    } catch {
      return '不明';
    }
  }
  
  private extractArticles(xmlData: any): ArticleData[] {
    const articles: ArticleData[] = [];
    
    try {
      const lawBody = xmlData.Law?.LawBody?.[0];
      if (!lawBody) return articles;
      
      // MainProvisionを探索
      const mainProvision = lawBody.MainProvision?.[0];
      if (!mainProvision) return articles;
      
      // 再帰的に条文を探索
      this.traverseForArticles(mainProvision, articles);
    } catch (error) {
      console.error('Error extracting articles:', error);
    }
    
    return articles;
  }
  
  private traverseForArticles(node: any, articles: ArticleData[]): void {
    if (!node || typeof node !== 'object') return;
    
    // Articleノードを処理
    if (node.Article) {
      const articleArray = Array.isArray(node.Article) ? node.Article : [node.Article];
      for (const article of articleArray) {
        const articleNum = article.$.Num || articles.length + 1;
        const content = this.extractTextContent(article);
        articles.push({
          articleNumber: `第${articleNum}条`,
          content
        });
      }
    }
    
    // Part, Chapter, Sectionなどを再帰的に探索
    const containers = ['Part', 'Chapter', 'Section', 'Subsection', 'Division'];
    for (const container of containers) {
      if (node[container]) {
        const items = Array.isArray(node[container]) ? node[container] : [node[container]];
        for (const item of items) {
          this.traverseForArticles(item, articles);
        }
      }
    }
  }
  
  private extractTextContent(node: any): string {
    let text = '';
    
    if (!node || typeof node !== 'object') {
      return typeof node === 'string' ? node : '';
    }
    
    // ParagraphやItemなどからテキストを抽出
    const textContainers = ['ArticleCaption', 'Paragraph', 'Item', 'Subitem1', 'Subitem2', 'Sentence'];
    
    for (const container of textContainers) {
      if (node[container]) {
        const items = Array.isArray(node[container]) ? node[container] : [node[container]];
        for (const item of items) {
          const itemText = this.extractTextContent(item);
          if (itemText) {
            text += itemText + ' ';
          }
        }
      }
    }
    
    // 直接のテキストコンテンツ
    if (node._ || typeof node === 'string') {
      text += (node._ || node) + ' ';
    }
    
    // ParagraphSentenceやItemSentence
    if (node.ParagraphSentence) {
      const sentences = Array.isArray(node.ParagraphSentence) ? node.ParagraphSentence : [node.ParagraphSentence];
      for (const sentence of sentences) {
        text += this.extractTextContent(sentence) + ' ';
      }
    }
    
    if (node.ItemSentence) {
      const sentences = Array.isArray(node.ItemSentence) ? node.ItemSentence : [node.ItemSentence];
      for (const sentence of sentences) {
        text += this.extractTextContent(sentence) + ' ';
      }
    }
    
    return text.trim();
  }
  
  /**
   * 単一法令の検証
   */
  async validateLaw(lawData: LawData): Promise<ValidationResult> {
    const startTime = Date.now();
    
    const result: ValidationResult = {
      lawId: lawData.lawId,
      lawName: lawData.lawName,
      totalArticles: lawData.articles.length,
      algorithmDetected: 0,
      llmValidated: 0,
      llmImproved: 0,
      missedDetected: 0,
      falsePositivesRemoved: 0,
      relativeResolved: 0,
      abbreviationExpanded: 0,
      processingTime: 0
    };
    
    // サンプリング（最初の10条文または全条文）
    const samplesToProcess = Math.min(10, lawData.articles.length);
    const selectedArticles = lawData.articles.slice(0, samplesToProcess);
    
    for (const article of selectedArticles) {
      // Step 1: アルゴリズム検出
      const algorithmRefs = this.detector.detectReferences(article.content);
      result.algorithmDetected += algorithmRefs.length;
      
      if (algorithmRefs.length === 0) continue;
      
      try {
        // Step 2: LLM検証
        const validationResults = await this.validator.validateReferences(
          article.content,
          algorithmRefs
        );
        
        for (const vResult of validationResults) {
          if (vResult.isValid) {
            result.llmValidated++;
          } else {
            result.falsePositivesRemoved++;
          }
          
          if (vResult.correctedType) {
            result.llmImproved++;
          }
        }
        
        // Step 3: 相対参照の解決
        const relativeRefs = algorithmRefs.filter(ref => ref.type === 'relative');
        if (relativeRefs.length > 0) {
          const resolved = await this.validator.resolveRelativeReferences(
            article.content,
            algorithmRefs,
            article.articleNumber
          );
          
          for (const ref of resolved) {
            if (ref.resolvedTarget && ref.type === 'relative') {
              result.relativeResolved++;
            }
          }
        }
        
        // Step 4: 見逃し検出
        const missedRefs = await this.validator.detectMissedReferences(
          article.content,
          algorithmRefs
        );
        
        result.missedDetected += missedRefs.length;
        
        // 略称展開のカウント
        for (const ref of missedRefs) {
          if (ref.sourceText && (
            ref.sourceText.includes('民訴') ||
            ref.sourceText.includes('刑訴') ||
            ref.sourceText.includes('特措法')
          )) {
            result.abbreviationExpanded++;
          }
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`LLM processing error for ${article.articleNumber}:`, error);
      }
    }
    
    result.processingTime = Date.now() - startTime;
    return result;
  }
  
  /**
   * 複数法令の包括的検証
   */
  async runComprehensiveValidation() {
    console.log('='.repeat(80));
    console.log('包括的LLM検証 - 実法令データによる大規模テスト');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}`);
    console.log();
    
    // サンプル法令の取得
    const sampleDir = path.join(__dirname, '../laws_data/sample');
    const xmlFiles = fs.readdirSync(sampleDir)
      .filter(f => f.endsWith('.xml'))
      .slice(0, 8); // 最大8法令
    
    console.log(`検証対象法令数: ${xmlFiles.length}`);
    console.log();
    
    const results: ValidationResult[] = [];
    
    // 各法令を処理
    for (const [idx, xmlFile] of xmlFiles.entries()) {
      const xmlPath = path.join(sampleDir, xmlFile);
      console.log(`\n[${idx + 1}/${xmlFiles.length}] 処理中: ${xmlFile}`);
      
      const lawData = await this.extractLawData(xmlPath);
      if (!lawData) {
        console.log('  ⚠️ データ抽出失敗');
        continue;
      }
      
      console.log(`  法令名: ${lawData.lawName}`);
      console.log(`  条文数: ${lawData.articles.length}`);
      
      const result = await this.validateLaw(lawData);
      results.push(result);
      
      console.log(`  ✅ 完了 (処理時間: ${(result.processingTime / 1000).toFixed(1)}秒)`);
      this.printLawResult(result);
    }
    
    // 総合結果の集計
    this.printSummary(results);
  }
  
  private printLawResult(result: ValidationResult): void {
    console.log(`  検出結果:`);
    console.log(`    - アルゴリズム検出: ${result.algorithmDetected}`);
    console.log(`    - LLM検証済み: ${result.llmValidated}`);
    console.log(`    - 見逃し検出: ${result.missedDetected}`);
    console.log(`    - 相対参照解決: ${result.relativeResolved}`);
    console.log(`    - 略称展開: ${result.abbreviationExpanded}`);
    console.log(`    - 誤検出除去: ${result.falsePositivesRemoved}`);
  }
  
  private printSummary(results: ValidationResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('## 総合検証結果サマリー');
    console.log('='.repeat(80));
    
    // 集計
    const totals = {
      laws: results.length,
      articles: results.reduce((sum, r) => sum + r.totalArticles, 0),
      algorithmDetected: results.reduce((sum, r) => sum + r.algorithmDetected, 0),
      llmValidated: results.reduce((sum, r) => sum + r.llmValidated, 0),
      missedDetected: results.reduce((sum, r) => sum + r.missedDetected, 0),
      relativeResolved: results.reduce((sum, r) => sum + r.relativeResolved, 0),
      abbreviationExpanded: results.reduce((sum, r) => sum + r.abbreviationExpanded, 0),
      falsePositivesRemoved: results.reduce((sum, r) => sum + r.falsePositivesRemoved, 0),
      totalTime: results.reduce((sum, r) => sum + r.processingTime, 0)
    };
    
    console.log(`\n### 処理規模:`);
    console.log(`- 検証法令数: ${totals.laws}`);
    console.log(`- 検証条文数: ${totals.articles}`);
    console.log(`- 総処理時間: ${(totals.totalTime / 1000).toFixed(1)}秒`);
    
    console.log(`\n### 検出性能:`);
    console.log(`| 項目 | 件数 | 割合 |`);
    console.log(`|------|------|------|`);
    console.log(`| アルゴリズム検出 | ${totals.algorithmDetected} | 100% |`);
    console.log(`| LLM検証済み | ${totals.llmValidated} | ${(totals.llmValidated / totals.algorithmDetected * 100).toFixed(1)}% |`);
    console.log(`| 誤検出除去 | ${totals.falsePositivesRemoved} | ${(totals.falsePositivesRemoved / totals.algorithmDetected * 100).toFixed(1)}% |`);
    
    console.log(`\n### LLM改善効果:`);
    console.log(`| 改善項目 | 件数 | 効果 |`);
    console.log(`|----------|------|------|`);
    console.log(`| 見逃し検出 | ${totals.missedDetected} | +${(totals.missedDetected / totals.algorithmDetected * 100).toFixed(1)}% |`);
    console.log(`| 相対参照解決 | ${totals.relativeResolved} | ✅ |`);
    console.log(`| 略称展開 | ${totals.abbreviationExpanded} | ✅ |`);
    
    // 精度改善率の計算
    const totalDetected = totals.algorithmDetected + totals.missedDetected - totals.falsePositivesRemoved;
    const improvementRate = ((totalDetected - totals.algorithmDetected) / totals.algorithmDetected * 100);
    
    console.log(`\n### 総合評価:`);
    console.log(`- **正味検出数**: ${totalDetected} (アルゴリズム: ${totals.algorithmDetected})`);
    console.log(`- **精度改善率**: ${improvementRate >= 0 ? '+' : ''}${improvementRate.toFixed(1)}%`);
    console.log(`- **処理速度**: ${(totals.articles / (totals.totalTime / 1000)).toFixed(1)} 条文/秒`);
    
    // 法令別の詳細
    console.log(`\n### 法令別パフォーマンス:`);
    console.log(`| 法令名 | 検出数 | LLM改善 | 処理時間 |`);
    console.log(`|--------|--------|---------|----------|`);
    
    for (const result of results) {
      const improvement = result.missedDetected - result.falsePositivesRemoved;
      const improvementStr = improvement >= 0 ? `+${improvement}` : `${improvement}`;
      console.log(`| ${result.lawName.substring(0, 20)} | ${result.algorithmDetected} | ${improvementStr} | ${(result.processingTime / 1000).toFixed(1)}s |`);
    }
    
    console.log(`\n### 結論:`);
    if (improvementRate > 5) {
      console.log(`✅ **LLM統合により${improvementRate.toFixed(1)}%の有意な精度向上を確認**`);
      console.log(`   - 見逃し検出機能が効果的`);
      console.log(`   - 相対参照解決と略称展開が実用レベル`);
    } else if (improvementRate > 0) {
      console.log(`⚠️ **LLM統合による軽微な改善（${improvementRate.toFixed(1)}%）**`);
      console.log(`   - 7Bモデルの限界が影響`);
      console.log(`   - より大規模モデルで改善の余地あり`);
    } else {
      console.log(`❌ **現在の設定では明確な改善効果なし**`);
      console.log(`   - プロンプトの最適化が必要`);
      console.log(`   - モデルのアップグレード検討`);
    }
  }
}

// メイン実行
async function main() {
  const validator = new ComprehensiveLLMValidator();
  
  console.log('事前チェック...');
  
  // Ollamaサービスの確認
  try {
    const { execSync } = require('child_process');
    execSync('ollama list | grep qwen2.5:7b', { stdio: 'ignore' });
    console.log('✅ Qwen2.5-7Bモデル準備完了');
  } catch {
    console.error('❌ Qwen2.5-7Bモデルが見つかりません');
    console.log('以下のコマンドでインストールしてください:');
    console.log('  ollama pull qwen2.5:7b');
    process.exit(1);
  }
  
  // サンプルディレクトリの確認
  const sampleDir = path.join(__dirname, '../laws_data/sample');
  if (!fs.existsSync(sampleDir)) {
    console.error('❌ サンプルディレクトリが見つかりません:', sampleDir);
    process.exit(1);
  }
  
  console.log('✅ 環境準備完了\n');
  
  await validator.runComprehensiveValidation();
}

main().catch(console.error);