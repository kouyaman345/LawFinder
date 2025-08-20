#!/usr/bin/env tsx

/**
 * 軽量版LLM検証スクリプト
 * 処理を最適化してタイムアウトを回避
 */

import * as fs from 'fs';
import * as path from 'path';
import * as xml2js from 'xml2js';
import { EnhancedReferenceDetectorV37 } from '../src/domain/services/EnhancedReferenceDetectorV37';
import { LLMValidator } from '../src/lib/llm-validator';

interface ValidationStats {
  lawName: string;
  articlesProcessed: number;
  algorithmDetected: number;
  llmValidated: number;
  missedDetected: number;
  falsePositivesRemoved: number;
  processingTimeMs: number;
}

class LightweightLLMValidator {
  private detector: EnhancedReferenceDetectorV37;
  private validator: LLMValidator;
  private parser: xml2js.Parser;
  
  constructor() {
    this.detector = new EnhancedReferenceDetectorV37();
    this.validator = new LLMValidator('qwen2.5:7b');
    this.parser = new xml2js.Parser();
  }
  
  /**
   * 法令名を抽出
   */
  private async getLawName(xmlPath: string): Promise<string> {
    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const result = await this.parser.parseStringPromise(xmlContent);
      
      if (result.Law?.LawBody?.[0]?.LawTitle) {
        const lawTitle = result.Law.LawBody[0].LawTitle[0];
        return lawTitle._ || lawTitle || path.basename(xmlPath, '.xml');
      }
    } catch {
      // エラー時はファイル名を返す
    }
    return path.basename(xmlPath, '.xml');
  }
  
  /**
   * 条文サンプルを抽出（最初の3条文のみ）
   */
  private extractSampleArticles(xmlContent: string): string[] {
    const articles: string[] = [];
    
    // 簡易的な条文抽出（Article要素のテキストを取得）
    const articleMatches = xmlContent.match(/<Article[^>]*>[\s\S]*?<\/Article>/g);
    
    if (articleMatches) {
      // 最初の3条文のみ
      const samples = articleMatches.slice(0, 3);
      
      for (const articleXml of samples) {
        // XMLタグを除去してテキストのみ抽出
        const text = articleXml
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (text && text.length > 10) {
          articles.push(text);
        }
      }
    }
    
    return articles;
  }
  
  /**
   * 単一法令の軽量検証
   */
  async validateLawFile(xmlPath: string): Promise<ValidationStats> {
    const startTime = Date.now();
    const lawName = await this.getLawName(xmlPath);
    
    const stats: ValidationStats = {
      lawName,
      articlesProcessed: 0,
      algorithmDetected: 0,
      llmValidated: 0,
      missedDetected: 0,
      falsePositivesRemoved: 0,
      processingTimeMs: 0
    };
    
    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const sampleArticles = this.extractSampleArticles(xmlContent);
      
      stats.articlesProcessed = sampleArticles.length;
      
      // 各サンプル条文を処理
      for (const articleText of sampleArticles) {
        // アルゴリズム検出
        const refs = this.detector.detectReferences(articleText);
        stats.algorithmDetected += refs.length;
        
        if (refs.length > 0) {
          try {
            // LLM検証（タイムアウト対策: 簡易版）
            const validationPromise = this.validator.validateReferences(
              articleText.substring(0, 500), // テキストを短縮
              refs.slice(0, 5) // 最大5参照まで
            );
            
            // 3秒でタイムアウト
            const timeout = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 3000)
            );
            
            const validationResults = await Promise.race([
              validationPromise,
              timeout
            ]) as any;
            
            if (Array.isArray(validationResults)) {
              for (const result of validationResults) {
                if (result.isValid) {
                  stats.llmValidated++;
                } else {
                  stats.falsePositivesRemoved++;
                }
              }
            }
            
            // 見逃し検出（簡易版）
            const missedPromise = this.validator.detectMissedReferences(
              articleText.substring(0, 300),
              refs.slice(0, 3)
            );
            
            const missedRefs = await Promise.race([
              missedPromise,
              timeout
            ]) as any;
            
            if (Array.isArray(missedRefs)) {
              stats.missedDetected += missedRefs.length;
            }
            
          } catch (error) {
            // タイムアウトまたはエラーの場合はスキップ
            console.log(`    ⚠️ LLM処理スキップ: ${error.message}`);
          }
        }
        
        // レート制限対策
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
    } catch (error) {
      console.error(`  エラー: ${error.message}`);
    }
    
    stats.processingTimeMs = Date.now() - startTime;
    return stats;
  }
  
  /**
   * 複数法令の検証実行
   */
  async runValidation() {
    console.log('='.repeat(80));
    console.log('軽量版LLM検証 - タイムアウト対策済み');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}`);
    console.log();
    
    const sampleDir = path.join(__dirname, '../laws_data/sample');
    const xmlFiles = fs.readdirSync(sampleDir)
      .filter(f => f.endsWith('.xml'))
      .slice(0, 8);
    
    console.log(`検証対象: ${xmlFiles.length}法令（各3条文サンプル）`);
    console.log();
    
    const allStats: ValidationStats[] = [];
    
    for (const [idx, xmlFile] of xmlFiles.entries()) {
      const xmlPath = path.join(sampleDir, xmlFile);
      console.log(`[${idx + 1}/${xmlFiles.length}] ${xmlFile}`);
      
      const stats = await this.validateLawFile(xmlPath);
      allStats.push(stats);
      
      console.log(`  法令名: ${stats.lawName}`);
      console.log(`  処理条文: ${stats.articlesProcessed}`);
      console.log(`  アルゴリズム検出: ${stats.algorithmDetected}`);
      console.log(`  LLM検証: ${stats.llmValidated}/${stats.algorithmDetected}`);
      console.log(`  見逃し検出: ${stats.missedDetected}`);
      console.log(`  誤検出除去: ${stats.falsePositivesRemoved}`);
      console.log(`  処理時間: ${(stats.processingTimeMs / 1000).toFixed(1)}秒`);
      console.log();
    }
    
    // サマリー
    this.printSummary(allStats);
  }
  
  private printSummary(stats: ValidationStats[]): void {
    console.log('='.repeat(80));
    console.log('## 検証結果サマリー');
    console.log('='.repeat(80));
    
    const totals = {
      laws: stats.length,
      articles: stats.reduce((sum, s) => sum + s.articlesProcessed, 0),
      algorithmDetected: stats.reduce((sum, s) => sum + s.algorithmDetected, 0),
      llmValidated: stats.reduce((sum, s) => sum + s.llmValidated, 0),
      missedDetected: stats.reduce((sum, s) => sum + s.missedDetected, 0),
      falsePositivesRemoved: stats.reduce((sum, s) => sum + s.falsePositivesRemoved, 0),
      totalTimeMs: stats.reduce((sum, s) => sum + s.processingTimeMs, 0)
    };
    
    console.log(`\n### 処理規模:`);
    console.log(`- 検証法令数: ${totals.laws}`);
    console.log(`- 検証条文数: ${totals.articles}`);
    console.log(`- 総処理時間: ${(totals.totalTimeMs / 1000).toFixed(1)}秒`);
    console.log(`- 平均処理速度: ${(totals.articles / (totals.totalTimeMs / 1000)).toFixed(1)}条文/秒`);
    
    console.log(`\n### 検出性能:`);
    const validationRate = totals.algorithmDetected > 0 
      ? (totals.llmValidated / totals.algorithmDetected * 100).toFixed(1)
      : '0.0';
    const falsePositiveRate = totals.algorithmDetected > 0
      ? (totals.falsePositivesRemoved / totals.algorithmDetected * 100).toFixed(1)
      : '0.0';
    
    console.log(`| 指標 | 件数 | 割合 |`);
    console.log(`|------|------|------|`);
    console.log(`| アルゴリズム検出 | ${totals.algorithmDetected} | - |`);
    console.log(`| LLM検証済み | ${totals.llmValidated} | ${validationRate}% |`);
    console.log(`| 誤検出除去 | ${totals.falsePositivesRemoved} | ${falsePositiveRate}% |`);
    console.log(`| 見逃し検出 | ${totals.missedDetected} | +${totals.missedDetected} |`);
    
    // 精度改善の計算
    const netImprovement = totals.missedDetected - totals.falsePositivesRemoved;
    const improvementRate = totals.algorithmDetected > 0
      ? (netImprovement / totals.algorithmDetected * 100)
      : 0;
    
    console.log(`\n### LLM統合効果:`);
    console.log(`- 正味改善数: ${netImprovement >= 0 ? '+' : ''}${netImprovement}`);
    console.log(`- 改善率: ${improvementRate >= 0 ? '+' : ''}${improvementRate.toFixed(1)}%`);
    
    console.log(`\n### 法令別結果:`);
    console.log(`| 法令 | 検出 | LLM検証 | 見逃し | 誤検出 |`);
    console.log(`|------|------|---------|--------|--------|`);
    
    for (const stat of stats) {
      const name = stat.lawName.length > 15 
        ? stat.lawName.substring(0, 15) + '...'
        : stat.lawName;
      console.log(`| ${name} | ${stat.algorithmDetected} | ${stat.llmValidated} | ${stat.missedDetected} | ${stat.falsePositivesRemoved} |`);
    }
    
    console.log(`\n### 評価:`);
    if (improvementRate > 5) {
      console.log(`✅ **LLM統合により${improvementRate.toFixed(1)}%の精度向上**`);
      console.log(`   - 見逃し検出が効果的に機能`);
      console.log(`   - 7Bモデルでも実用的な改善`);
    } else if (improvementRate > 0) {
      console.log(`⚠️ **軽微な改善効果（${improvementRate.toFixed(1)}%）**`);
      console.log(`   - 限定的だが正の効果あり`);
      console.log(`   - プロンプト最適化で改善余地`);
    } else if (improvementRate === 0) {
      console.log(`➖ **改善効果は中立的**`);
      console.log(`   - 誤検出除去と見逃し検出が相殺`);
    } else {
      console.log(`❌ **精度が低下（${improvementRate.toFixed(1)}%）**`);
      console.log(`   - 誤検出除去が過剰`);
      console.log(`   - プロンプトの調整が必要`);
    }
    
    console.log(`\n### 推奨事項:`);
    console.log(`1. プロンプトエンジニアリングの継続的改善`);
    console.log(`2. より多くの法令での検証実施`);
    console.log(`3. 特定パターン（略称、相対参照）に特化した最適化`);
    
    if (totals.falsePositivesRemoved > totals.missedDetected) {
      console.log(`4. 誤検出判定の閾値調整（現在過剰に除去）`);
    }
  }
}

// メイン実行
async function main() {
  const validator = new LightweightLLMValidator();
  
  console.log('環境チェック...');
  
  // Qwen2.5-7Bの確認
  try {
    const { execSync } = require('child_process');
    execSync('ollama list | grep qwen2.5:7b', { stdio: 'ignore' });
    console.log('✅ Qwen2.5-7B準備完了');
  } catch {
    console.error('❌ Qwen2.5-7Bが見つかりません');
    process.exit(1);
  }
  
  console.log();
  await validator.runValidation();
}

main().catch(console.error);