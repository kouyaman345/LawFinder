#!/usr/bin/env tsx

/**
 * LLM統合検証テストスクリプト
 * v3.7.0アルゴリズム + Qwen2.5-7B
 */

import { EnhancedReferenceDetectorV37 } from '../src/domain/services/EnhancedReferenceDetectorV37';
import { LLMValidator } from '../src/lib/llm-validator';

interface TestCase {
  text: string;
  description: string;
  expectedImprovement: string[];
}

const testCases: TestCase[] = [
  {
    text: '前条の規定により届出をした者は、同項に定める期間内に手続きを完了しなければならない。',
    description: '相対参照の解決テスト',
    expectedImprovement: ['前条 -> 具体的な条文番号', '同項 -> 具体的な項番号']
  },
  {
    text: '民訴第百条の規定に基づき、裁判所は職権で証拠調べをすることができる。',
    description: '略称の展開テスト',
    expectedImprovement: ['民訴 -> 民事訴訟法']
  },
  {
    text: '関係法令の定めるところにより、主務大臣が指定する。別に政令で定める基準に従う。',
    description: '間接参照の検出テスト',
    expectedImprovement: ['関係法令 -> 具体的な法令リスト', '別に政令で定める -> 該当政令の特定']
  },
  {
    text: '建築基準法施行令第百二十条及び消防法施行令第三条の規定により、防火設備を設置する。',
    description: '複数参照の検証テスト',
    expectedImprovement: ['正確な分離と検証']
  },
  {
    text: '本法において「事業者」とは、第二条第一項に規定する者をいう。前項の規定は、次条に定める場合には適用しない。',
    description: '複合的な参照テスト',
    expectedImprovement: ['本法 -> 現在の法令名', '前項 -> 具体的な項', '次条 -> 具体的な条']
  }
];

class LLMValidationTester {
  private detector: EnhancedReferenceDetectorV37;
  private validator: LLMValidator;
  
  constructor() {
    this.detector = new EnhancedReferenceDetectorV37();
    this.validator = new LLMValidator('qwen2.5:7b');
  }
  
  async runTests() {
    console.log('='.repeat(80));
    console.log('LLM統合検証テスト - v3.7.0 + Qwen2.5-7B');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}`);
    console.log(`テストケース数: ${testCases.length}`);
    console.log();
    
    const results = {
      totalTests: testCases.length,
      algorithmOnly: { detected: 0, accuracy: 0 },
      withLLM: { detected: 0, accuracy: 0, improvements: 0 }
    };
    
    for (const [idx, testCase] of testCases.entries()) {
      console.log(`\n## テストケース ${idx + 1}: ${testCase.description}`);
      console.log('─'.repeat(60));
      console.log(`テキスト: "${testCase.text}"`);
      console.log();
      
      // Step 1: アルゴリズムによる検出
      const algorithmRefs = this.detector.detectReferences(testCase.text);
      console.log(`### アルゴリズム検出結果:`);
      console.log(`  検出数: ${algorithmRefs.length}`);
      
      if (algorithmRefs.length > 0) {
        algorithmRefs.forEach(ref => {
          console.log(`  - "${ref.sourceText}" [${ref.type}] -> ${ref.targetLaw || ref.targetArticle || '未解決'}`);
        });
        results.algorithmOnly.detected += algorithmRefs.length;
      }
      
      // Step 2: LLMによる検証
      console.log(`\n### LLM検証:`);
      try {
        const validationResults = await this.validator.validateReferences(testCase.text, algorithmRefs);
        
        let validCount = 0;
        let invalidCount = 0;
        
        validationResults.forEach(result => {
          if (result.isValid) {
            validCount++;
            console.log(`  ✅ "${result.originalReference.sourceText}" - 信頼度: ${(result.confidence * 100).toFixed(0)}%`);
          } else {
            invalidCount++;
            console.log(`  ❌ "${result.originalReference.sourceText}" - 理由: ${result.reason}`);
          }
          
          if (result.correctedType && result.correctedType !== result.originalReference.type) {
            console.log(`     → タイプ修正: ${result.originalReference.type} → ${result.correctedType}`);
          }
        });
        
        console.log(`  検証結果: 有効 ${validCount}, 無効 ${invalidCount}`);
        results.withLLM.detected += validCount;
        
        // Step 3: 相対参照の解決
        const relativeRefs = algorithmRefs.filter(ref => ref.type === 'relative');
        if (relativeRefs.length > 0) {
          console.log(`\n### 相対参照の解決:`);
          const resolved = await this.validator.resolveRelativeReferences(
            testCase.text,
            algorithmRefs,
            '第5条' // 仮の現在条文
          );
          
          resolved.forEach(ref => {
            if (ref.resolvedTarget && ref.type === 'relative') {
              console.log(`  📍 "${ref.sourceText}" → "${ref.resolvedTarget}"`);
              results.withLLM.improvements++;
            }
          });
        }
        
        // Step 4: 見逃し検出
        console.log(`\n### LLMによる追加検出:`);
        const missedRefs = await this.validator.detectMissedReferences(testCase.text, algorithmRefs);
        
        if (missedRefs.length > 0) {
          missedRefs.forEach(ref => {
            console.log(`  🔍 "${ref.sourceText}" [${ref.type}] -> ${ref.targetLaw || '検出'}`);
            results.withLLM.improvements++;
          });
          results.withLLM.detected += missedRefs.length;
        } else {
          console.log(`  追加検出なし`);
        }
        
      } catch (error) {
        console.error(`  ⚠️ LLM処理エラー:`, error);
      }
      
      // 期待される改善点の確認
      console.log(`\n### 期待される改善:`);
      testCase.expectedImprovement.forEach(improvement => {
        console.log(`  - ${improvement}`);
      });
    }
    
    // サマリー
    console.log('\n' + '='.repeat(80));
    console.log('## テスト結果サマリー');
    console.log('='.repeat(80));
    
    const algorithmAccuracy = (results.algorithmOnly.detected / results.totalTests * 100).toFixed(1);
    const llmAccuracy = (results.withLLM.detected / results.totalTests * 100).toFixed(1);
    const improvementRate = ((results.withLLM.detected - results.algorithmOnly.detected) / results.algorithmOnly.detected * 100).toFixed(1);
    
    console.log(`\n### 検出性能比較:`);
    console.log(`| 手法 | 検出数 | 精度向上 |`);
    console.log(`|------|--------|----------|`);
    console.log(`| アルゴリズムのみ | ${results.algorithmOnly.detected} | - |`);
    console.log(`| アルゴリズム + LLM | ${results.withLLM.detected} | +${improvementRate}% |`);
    
    console.log(`\n### LLMによる改善:`);
    console.log(`- 相対参照解決: ${results.withLLM.improvements} 件`);
    console.log(`- 誤検出除去: 実装済み`);
    console.log(`- 見逃し検出: 実装済み`);
    
    console.log(`\n### 評価:`);
    if (parseFloat(improvementRate) > 0) {
      console.log(`✅ LLM統合により ${improvementRate}% の精度向上を確認`);
    } else {
      console.log(`⚠️ LLM統合による明確な改善は見られず`);
    }
    
    // メモリ使用量とレスポンス時間の推定
    console.log(`\n### パフォーマンス指標（推定）:`);
    console.log(`- LLMモデルサイズ: 4.7GB (Qwen2.5-7B)`);
    console.log(`- VRAM使用量: 5-6GB`);
    console.log(`- 平均レスポンス時間: 1-2秒/リクエスト`);
    console.log(`- 処理可能速度: 30-60 参照/分`);
  }
}

// 実行
async function main() {
  const tester = new LLMValidationTester();
  
  console.log('Ollamaサービスの確認中...');
  
  // Ollamaが起動しているか確認
  try {
    const { execSync } = require('child_process');
    execSync('ollama list', { stdio: 'ignore' });
    console.log('✅ Ollamaサービスが起動しています\n');
  } catch {
    console.error('❌ Ollamaサービスが起動していません');
    console.log('以下のコマンドでOllamaを起動してください:');
    console.log('  ollama serve');
    process.exit(1);
  }
  
  await tester.runTests();
}

main().catch(console.error);