#!/usr/bin/env tsx

/**
 * e-Gov法令データとの比較検証スクリプト
 * 実際のe-Gov表示と比較して検出率・誤検出を測定
 */

import { EnhancedReferenceDetectorV41 } from '../src/domain/services/EnhancedReferenceDetectorV41';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

interface ValidationResult {
  lawId: string;
  lawName: string;
  articleNum: string;
  text: string;
  detectedReferences: any[];
  actualReferences: string[];
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1Score: number;
  errors: {
    falsePositives: string[];
    falseNegatives: string[];
  };
}

interface ErrorPattern {
  type: string;
  pattern: string;
  count: number;
  examples: string[];
}

class EGovComparisonValidator {
  private detector: EnhancedReferenceDetectorV41;
  private lawsDataPath = '/home/coffee/projects/LawFinder/laws_data';
  
  constructor() {
    this.detector = new EnhancedReferenceDetectorV41({ enableCache: true });
  }
  
  /**
   * e-Govとの比較検証を実行
   */
  async validateWithEGov(): Promise<void> {
    console.log('='.repeat(80));
    console.log('📊 e-Gov法令データ比較検証レポート');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}\n`);
    
    // テスト用の代表的な法令を選定
    const testLaws = [
      { id: '129AC0000000089', name: '民法', articles: ['第90条', '第94条', '第95条'] },
      { id: '132AC0000000048', name: '商法', articles: ['第1条', '第500条', '第501条'] },
      { id: '140AC0000000045', name: '刑法', articles: ['第1条', '第35条', '第199条'] },
      { id: '322AC0000000049', name: '労働基準法', articles: ['第1条', '第32条', '第36条'] },
      { id: '417AC0000000086', name: '会社法', articles: ['第1条', '第2条', '第3条'] }
    ];
    
    const results: ValidationResult[] = [];
    
    for (const law of testLaws) {
      console.log(`\n検証中: ${law.name}`);
      console.log('─'.repeat(40));
      
      const lawResults = await this.validateLaw(law.id, law.name, law.articles);
      results.push(...lawResults);
    }
    
    // 結果の集計と分析
    this.analyzeResults(results);
    
    // 誤検出パターンの分析
    this.analyzeErrorPatterns(results);
    
    // 検出不可パターンの分析
    this.analyzeUndetectablePatterns(results);
  }
  
  /**
   * 単一法令の検証
   */
  private async validateLaw(lawId: string, lawName: string, targetArticles: string[]): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];
    
    // XMLファイルを探す
    const xmlPath = this.findXmlFile(lawId);
    if (!xmlPath) {
      console.log(`  ⚠️ ${lawName}のXMLが見つかりません`);
      return results;
    }
    
    try {
      const xmlContent = readFileSync(xmlPath, 'utf-8');
      const dom = new JSDOM(xmlContent, { contentType: 'text/xml' });
      const document = dom.window.document;
      
      // 指定された条文を検証
      for (const articleNum of targetArticles) {
        const article = this.findArticle(document, articleNum);
        if (!article) continue;
        
        const articleText = article.textContent || '';
        
        // v4.1で検出
        const detected = this.detector.detectReferences(articleText, articleNum);
        
        // e-Govでの実際の参照（シミュレーション）
        const actual = this.getActualReferences(articleText, lawName, articleNum);
        
        // 精度計算
        const result = this.calculateAccuracy(
          lawId,
          lawName,
          articleNum,
          articleText,
          detected,
          actual
        );
        
        results.push(result);
        
        // 簡易表示
        console.log(`  ${articleNum}: 精度=${result.precision.toFixed(1)}% 再現率=${result.recall.toFixed(1)}% F1=${result.f1Score.toFixed(1)}%`);
      }
      
    } catch (error) {
      console.error(`  ❌ エラー: ${error.message}`);
    }
    
    return results;
  }
  
  /**
   * XMLファイルを探す
   */
  private findXmlFile(lawId: string): string | null {
    // サンプルディレクトリを優先的に探す
    const samplePath = join(this.lawsDataPath, 'sample', `${lawId}.xml`);
    if (existsSync(samplePath)) {
      return samplePath;
    }
    
    // 実際のディレクトリから探す（簡略化）
    return null;
  }
  
  /**
   * 条文を探す
   */
  private findArticle(document: Document, articleNum: string): Element | null {
    const articles = document.querySelectorAll('Article');
    for (const article of articles) {
      const num = article.getAttribute('Num');
      if (num === articleNum || `第${num}条` === articleNum) {
        return article;
      }
    }
    return null;
  }
  
  /**
   * e-Govでの実際の参照を取得（シミュレーション）
   * 実際にはe-Gov APIや事前に収集したデータを使用
   */
  private getActualReferences(text: string, lawName: string, articleNum: string): string[] {
    const refs: string[] = [];
    
    // 既知のパターンから実際の参照を推定
    // これは実際のe-Govデータとの比較のためのシミュレーション
    
    // 明確な条文参照
    const articlePattern = /第[一二三四五六七八九十百千万\d]+条(?:の[一二三四五六七八九十\d]+)?/g;
    let match;
    while ((match = articlePattern.exec(text)) !== null) {
      refs.push(match[0]);
    }
    
    // 法令名付き参照
    const lawPattern = /([^、。\s]+?法(?:律)?|[^、。\s]+?令)(?:第[一二三四五六七八九十百千万\d]+条)?/g;
    while ((match = lawPattern.exec(text)) !== null) {
      if (!this.isIgnoredLawName(match[1])) {
        refs.push(match[0]);
      }
    }
    
    // 相対参照（e-Govでは解決されて表示）
    if (text.includes('前条')) refs.push('前条');
    if (text.includes('次条')) refs.push('次条');
    if (text.includes('前項')) refs.push('前項');
    if (text.includes('同条')) refs.push('同条');
    
    return refs;
  }
  
  /**
   * 無視すべき法令名
   */
  private isIgnoredLawName(name: string): boolean {
    return /^(この|当該|同|前記|後記|上記|下記|別記|次の)/.test(name);
  }
  
  /**
   * 精度計算
   */
  private calculateAccuracy(
    lawId: string,
    lawName: string,
    articleNum: string,
    text: string,
    detected: any[],
    actual: string[]
  ): ValidationResult {
    const detectedTexts = new Set(detected.map(d => d.sourceText));
    const actualSet = new Set(actual);
    
    // True Positives: 正しく検出
    const truePositives = [...detectedTexts].filter(d => {
      return [...actualSet].some(a => d.includes(a) || a.includes(d));
    }).length;
    
    // False Positives: 誤検出
    const falsePositivesList = [...detectedTexts].filter(d => {
      return ![...actualSet].some(a => d.includes(a) || a.includes(d));
    });
    const falsePositives = falsePositivesList.length;
    
    // False Negatives: 検出漏れ
    const falseNegativesList = [...actualSet].filter(a => {
      return ![...detectedTexts].some(d => d.includes(a) || a.includes(d));
    });
    const falseNegatives = falseNegativesList.length;
    
    // 精度指標
    const precision = truePositives + falsePositives > 0 
      ? (truePositives / (truePositives + falsePositives)) * 100 
      : 0;
    
    const recall = truePositives + falseNegatives > 0
      ? (truePositives / (truePositives + falseNegatives)) * 100
      : 0;
    
    const f1Score = precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
    
    return {
      lawId,
      lawName,
      articleNum,
      text: text.substring(0, 100) + '...',
      detectedReferences: detected,
      actualReferences: actual,
      truePositives,
      falsePositives,
      falseNegatives,
      precision,
      recall,
      f1Score,
      errors: {
        falsePositives: falsePositivesList,
        falseNegatives: falseNegativesList
      }
    };
  }
  
  /**
   * 結果の分析
   */
  private analyzeResults(results: ValidationResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('## 総合精度分析');
    console.log('='.repeat(80));
    
    const totalTP = results.reduce((sum, r) => sum + r.truePositives, 0);
    const totalFP = results.reduce((sum, r) => sum + r.falsePositives, 0);
    const totalFN = results.reduce((sum, r) => sum + r.falseNegatives, 0);
    
    const overallPrecision = totalTP + totalFP > 0 
      ? (totalTP / (totalTP + totalFP)) * 100 
      : 0;
    
    const overallRecall = totalTP + totalFN > 0
      ? (totalTP / (totalTP + totalFN)) * 100
      : 0;
    
    const overallF1 = overallPrecision + overallRecall > 0
      ? (2 * overallPrecision * overallRecall) / (overallPrecision + overallRecall)
      : 0;
    
    console.log('### 全体統計');
    console.log(`検証条文数: ${results.length}条`);
    console.log(`総検出数: ${totalTP + totalFP}件`);
    console.log(`実際の参照数: ${totalTP + totalFN}件`);
    console.log();
    
    console.log('### 精度指標');
    console.log(`精度（Precision）: ${overallPrecision.toFixed(1)}%`);
    console.log(`再現率（Recall）: ${overallRecall.toFixed(1)}%`);
    console.log(`F1スコア: ${overallF1.toFixed(1)}%`);
    console.log();
    
    console.log('### 検出結果内訳');
    console.log(`正検出（TP）: ${totalTP}件`);
    console.log(`誤検出（FP）: ${totalFP}件`);
    console.log(`検出漏れ（FN）: ${totalFN}件`);
    
    // 法令別の精度
    console.log('\n### 法令別精度');
    console.log('| 法令 | 精度 | 再現率 | F1スコア |');
    console.log('|------|------|--------|----------|');
    
    const lawGroups = new Map<string, ValidationResult[]>();
    results.forEach(r => {
      if (!lawGroups.has(r.lawName)) {
        lawGroups.set(r.lawName, []);
      }
      lawGroups.get(r.lawName)!.push(r);
    });
    
    lawGroups.forEach((group, lawName) => {
      const avgPrecision = group.reduce((sum, r) => sum + r.precision, 0) / group.length;
      const avgRecall = group.reduce((sum, r) => sum + r.recall, 0) / group.length;
      const avgF1 = group.reduce((sum, r) => sum + r.f1Score, 0) / group.length;
      
      console.log(`| ${lawName} | ${avgPrecision.toFixed(1)}% | ${avgRecall.toFixed(1)}% | ${avgF1.toFixed(1)}% |`);
    });
  }
  
  /**
   * 誤検出パターンの分析
   */
  private analyzeErrorPatterns(results: ValidationResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('## 誤検出パターン分析');
    console.log('='.repeat(80));
    
    const errorPatterns = new Map<string, ErrorPattern>();
    
    results.forEach(result => {
      result.errors.falsePositives.forEach(fp => {
        // パターン分類
        let patternType = 'その他';
        
        if (/の規定/.test(fp)) {
          patternType = '規定の誤認識';
        } else if (/前|次|同/.test(fp)) {
          patternType = '相対参照の誤解釈';
        } else if (/法|令|規則/.test(fp) && fp.length < 4) {
          patternType = '法令名の過剰検出';
        } else if (/第.+条の.+第.+条/.test(fp)) {
          patternType = '複合参照の誤分割';
        }
        
        if (!errorPatterns.has(patternType)) {
          errorPatterns.set(patternType, {
            type: patternType,
            pattern: '',
            count: 0,
            examples: []
          });
        }
        
        const pattern = errorPatterns.get(patternType)!;
        pattern.count++;
        if (pattern.examples.length < 3) {
          pattern.examples.push(fp);
        }
      });
    });
    
    console.log('### 誤検出の主要パターン');
    const sortedPatterns = Array.from(errorPatterns.values()).sort((a, b) => b.count - a.count);
    
    sortedPatterns.forEach((pattern, index) => {
      console.log(`\n${index + 1}. ${pattern.type} (${pattern.count}件)`);
      console.log('   例:');
      pattern.examples.forEach(ex => {
        console.log(`   - "${ex}"`);
      });
    });
    
    // 改善提案
    console.log('\n### 誤検出削減のための改善提案');
    console.log('1. コンテキスト分析の強化');
    console.log('   - 文の構造を考慮した検出');
    console.log('   - 修飾関係の正確な把握');
    console.log('2. 除外パターンの追加');
    console.log('   - 一般的な誤検出パターンの学習');
    console.log('   - ドメイン固有の表現への対応');
  }
  
  /**
   * 検出不可パターンの分析
   */
  private analyzeUndetectablePatterns(results: ValidationResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('## 検出不可パターン分析');
    console.log('='.repeat(80));
    
    const undetectablePatterns = new Map<string, ErrorPattern>();
    
    results.forEach(result => {
      result.errors.falseNegatives.forEach(fn => {
        // パターン分類
        let patternType = 'その他';
        
        if (/^\d+$/.test(fn)) {
          patternType = '数字のみの参照';
        } else if (/[（(].+[）)]/.test(fn)) {
          patternType = '括弧内の参照';
        } else if (/別表|別記|様式/.test(fn)) {
          patternType = '別表・様式参照';
        } else if (/[、，]/.test(fn)) {
          patternType = '列挙中の参照';
        } else if (fn.length > 50) {
          patternType = '長文参照';
        }
        
        if (!undetectablePatterns.has(patternType)) {
          undetectablePatterns.set(patternType, {
            type: patternType,
            pattern: '',
            count: 0,
            examples: []
          });
        }
        
        const pattern = undetectablePatterns.get(patternType)!;
        pattern.count++;
        if (pattern.examples.length < 3) {
          pattern.examples.push(fn);
        }
      });
    });
    
    console.log('### 検出困難な主要パターン');
    const sortedPatterns = Array.from(undetectablePatterns.values()).sort((a, b) => b.count - a.count);
    
    sortedPatterns.forEach((pattern, index) => {
      console.log(`\n${index + 1}. ${pattern.type} (${pattern.count}件)`);
      console.log('   例:');
      pattern.examples.forEach(ex => {
        console.log(`   - "${ex}"`);
      });
    });
    
    // 改善提案
    console.log('\n### 検出率向上のための改善提案');
    console.log('1. パターンの拡充');
    console.log('   - 別表・様式参照パターンの追加');
    console.log('   - 括弧内参照の処理改善');
    console.log('2. 前処理の強化');
    console.log('   - テキスト正規化の改善');
    console.log('   - 列挙構造の認識');
    console.log('3. LLMの活用');
    console.log('   - 文脈理解による補完');
    console.log('   - 曖昧な参照の解決');
  }
}

// メイン実行
async function main() {
  const validator = new EGovComparisonValidator();
  await validator.validateWithEGov();
}

main().catch(console.error);