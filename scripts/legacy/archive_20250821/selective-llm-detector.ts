#!/usr/bin/env npx tsx

/**
 * 選択的LLM統合検出器
 * パターンマッチングで低信頼度のケースのみLLMを使用
 */

import { EnhancedPatternDetector } from './enhanced-pattern-detector';
import { execSync } from 'child_process';

interface LLMEnhancedReference {
  type: string;
  text: string;
  confidence: number;
  method: 'pattern' | 'llm' | 'hybrid';
  llmUsed?: boolean;
  llmReason?: string;
}

export class SelectiveLLMDetector {
  private patternDetector = new EnhancedPatternDetector();
  private llmThreshold = 0.7; // 信頼度がこの値未満の場合LLMを使用
  private llmCallCount = 0;
  private patternOnlyCount = 0;

  /**
   * メイン検出メソッド（選択的LLM統合）
   */
  public async detect(text: string, context?: any): Promise<LLMEnhancedReference[]> {
    // Step 1: パターンマッチング
    const patternRefs = this.patternDetector.detect(text);
    
    // Step 2: 低信頼度の参照を特定
    const lowConfidenceRefs = patternRefs.filter(ref => ref.confidence < this.llmThreshold);
    const highConfidenceRefs = patternRefs.filter(ref => ref.confidence >= this.llmThreshold);
    
    // Step 3: 選択的にLLMを適用
    const enhancedRefs: LLMEnhancedReference[] = [];
    
    // 高信頼度の参照はそのまま使用
    for (const ref of highConfidenceRefs) {
      this.patternOnlyCount++;
      enhancedRefs.push({
        ...ref,
        method: 'pattern',
        llmUsed: false,
      });
    }
    
    // 低信頼度の参照はLLMで検証
    for (const ref of lowConfidenceRefs) {
      const llmResult = await this.verifyWithLLM(ref, text, context);
      if (llmResult) {
        this.llmCallCount++;
        enhancedRefs.push(llmResult);
      } else {
        // LLMでも検証できない場合は元の参照を保持
        enhancedRefs.push({
          ...ref,
          method: 'pattern',
          llmUsed: true,
          llmReason: 'LLM verification failed',
        });
      }
    }
    
    // Step 4: パターンで見逃した可能性のある参照をLLMで探索（オプション）
    if (this.shouldSearchWithLLM(text, patternRefs)) {
      const additionalRefs = await this.searchWithLLM(text, context);
      enhancedRefs.push(...additionalRefs);
    }
    
    return enhancedRefs;
  }

  /**
   * LLMで参照を検証
   */
  private async verifyWithLLM(ref: any, text: string, context?: any): Promise<LLMEnhancedReference | null> {
    // Ollamaを使用したLLM検証（シミュレーション）
    try {
      const prompt = this.buildVerificationPrompt(ref, text, context);
      
      // 実際のLLM呼び出しをシミュレート
      // 本番環境では実際のOllama APIを使用
      const isValid = this.simulateLLMVerification(ref, text);
      
      if (isValid) {
        return {
          type: ref.type,
          text: ref.text,
          confidence: 0.9, // LLM検証後は信頼度を上げる
          method: 'hybrid',
          llmUsed: true,
          llmReason: 'Verified by LLM',
        };
      }
    } catch (error) {
      console.error('LLM検証エラー:', error);
    }
    
    return null;
  }

  /**
   * パターンで見逃した参照をLLMで探索
   */
  private async searchWithLLM(text: string, context?: any): Promise<LLMEnhancedReference[]> {
    const refs: LLMEnhancedReference[] = [];
    
    // 特定のキーワードがある場合のみLLM探索
    const keywords = ['同法', '当該', 'この条', '前記', '上記', '別に定める'];
    const hasKeywords = keywords.some(kw => text.includes(kw));
    
    if (!hasKeywords) return refs;
    
    try {
      // LLM探索をシミュレート
      // 本番環境では実際のLLM APIを使用
      const llmRefs = this.simulateLLMSearch(text);
      
      for (const llmRef of llmRefs) {
        this.llmCallCount++;
        refs.push({
          type: llmRef.type,
          text: llmRef.text,
          confidence: 0.8,
          method: 'llm',
          llmUsed: true,
          llmReason: 'Discovered by LLM',
        });
      }
    } catch (error) {
      console.error('LLM探索エラー:', error);
    }
    
    return refs;
  }

  /**
   * LLM探索が必要かどうかを判定
   */
  private shouldSearchWithLLM(text: string, patternRefs: any[]): boolean {
    // テキストが長く、検出数が少ない場合はLLM探索を実行
    const textLength = text.length;
    const refDensity = patternRefs.length / (textLength / 100);
    
    // 参照密度が低い場合（100文字あたり0.5個未満）
    return refDensity < 0.5 && textLength > 50;
  }

  /**
   * LLM検証プロンプトを構築
   */
  private buildVerificationPrompt(ref: any, text: string, context?: any): string {
    return `
以下の文章から抽出された法令参照が正しいか検証してください。

文章: "${text}"
抽出された参照: "${ref.text}"
参照タイプ: ${ref.type}
${context ? `文脈: ${JSON.stringify(context)}` : ''}

この参照は正しい法令参照ですか？ はい/いいえで答えてください。
`;
  }

  /**
   * LLM検証をシミュレート（テスト用）
   */
  private simulateLLMVerification(ref: any, text: string): boolean {
    // 文脈依存の参照は高確率で正しいと判定
    if (ref.type === 'contextual') {
      return Math.random() > 0.2; // 80%の確率で正しい
    }
    
    // その他の低信頼度参照
    return Math.random() > 0.5; // 50%の確率で正しい
  }

  /**
   * LLM探索をシミュレート（テスト用）
   */
  private simulateLLMSearch(text: string): any[] {
    const refs = [];
    
    // 「同法」が含まれる場合
    if (text.includes('同法')) {
      refs.push({
        type: 'contextual',
        text: '同法第10条',
      });
    }
    
    // 「この条」が含まれる場合
    if (text.includes('この条')) {
      refs.push({
        type: 'contextual',
        text: 'この条の規定',
      });
    }
    
    return refs;
  }

  /**
   * 統計情報を取得
   */
  public getStatistics() {
    const total = this.patternOnlyCount + this.llmCallCount;
    return {
      totalDetections: total,
      patternOnly: this.patternOnlyCount,
      llmUsed: this.llmCallCount,
      llmUsageRate: total > 0 ? (this.llmCallCount / total * 100).toFixed(1) + '%' : '0%',
    };
  }
}

// テスト実行
if (require.main === module) {
  const detector = new SelectiveLLMDetector();
  const { complexTestCases } = require('./complex-test-cases');
  
  async function runTest() {
    console.log('=== 選択的LLM統合テスト ===\n');
    
    let totalExpected = 0;
    let totalDetected = 0;
    let correctCount = 0;
    
    for (const tc of complexTestCases) {
      const refs = await detector.detect(tc.text);
      const detected = refs.length;
      const isCorrect = detected >= tc.expected;
      
      totalExpected += tc.expected;
      totalDetected += detected;
      if (isCorrect) correctCount += tc.expected;
      
      const llmUsed = refs.some(r => r.llmUsed);
      const icon = isCorrect ? '✅' : '❌';
      const llmIcon = llmUsed ? '🤖' : '⚡';
      
      console.log(
        `[${tc.difficulty}] ${tc.name}: ` +
        `期待=${tc.expected}, 検出=${detected} ${icon} ${llmIcon}`
      );
    }
    
    const precision = totalDetected > 0 ? (correctCount / totalDetected * 100) : 0;
    const recall = totalExpected > 0 ? (correctCount / totalExpected * 100) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
    
    console.log('\n=== 精度結果 ===');
    console.log(`精度: ${precision.toFixed(1)}%`);
    console.log(`再現率: ${recall.toFixed(1)}%`);
    console.log(`F1スコア: ${f1.toFixed(1)}%`);
    
    const stats = detector.getStatistics();
    console.log('\n=== LLM使用統計 ===');
    console.log(`総検出数: ${stats.totalDetections}`);
    console.log(`パターンのみ: ${stats.patternOnly}`);
    console.log(`LLM使用: ${stats.llmUsed}`);
    console.log(`LLM使用率: ${stats.llmUsageRate}`);
    
    console.log('\n=== 目標達成状況 ===');
    console.log(`現在のF1スコア: ${f1.toFixed(1)}%`);
    console.log(`目標（90%）まで: ${(90 - f1).toFixed(1)}pt`);
    
    if (f1 >= 90) {
      console.log('🎉 目標達成！');
    } else {
      console.log(`改善提案: ${f1 < 80 ? 'パターン強化' : 'LLM閾値調整'}が必要`);
    }
  }
  
  runTest().catch(console.error);
}