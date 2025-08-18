#!/usr/bin/env tsx

/**
 * ハイブリッド戦略精度検証スクリプト
 * アルゴリズム + 選択的LLM適用の効果測定
 */

import { HybridReferenceDetector, HybridDetectionConfig } from '../src/lib/hybrid-reference-detector';
import { EnhancedReferenceDetectorV37 } from '../src/domain/services/EnhancedReferenceDetectorV37';

interface TestCase {
  id: string;
  text: string;
  description: string;
  expectedPatterns: string[];
  category: 'abbreviation' | 'indirect' | 'complex' | 'simple';
}

const testCases: TestCase[] = [
  // 略称を含むケース
  {
    id: 'abbr-1',
    text: '民訴第百条の規定により、裁判所は職権で証拠調べをすることができる。',
    description: '略称展開テスト（民訴）',
    expectedPatterns: ['民事訴訟法', '第百条'],
    category: 'abbreviation'
  },
  {
    id: 'abbr-2',
    text: '刑訴第三百条及び民執法第二十条の規定に基づき処理する。',
    description: '複数略称展開',
    expectedPatterns: ['刑事訴訟法', '民事執行法'],
    category: 'abbreviation'
  },
  {
    id: 'abbr-3',
    text: '独禁法違反の事案については、下請法も併せて検討する必要がある。',
    description: '特殊略称（独禁法、下請法）',
    expectedPatterns: ['独占禁止法', '下請代金支払遅延等防止法'],
    category: 'abbreviation'
  },
  
  // 間接参照を含むケース
  {
    id: 'indirect-1',
    text: '関係法令の定めるところにより、主務大臣が指定する。',
    description: '間接参照（関係法令）',
    expectedPatterns: ['関係法令'],
    category: 'indirect'
  },
  {
    id: 'indirect-2',
    text: '別に政令で定める基準に従い、都道府県知事が認定する。',
    description: '間接参照（別に定める）',
    expectedPatterns: ['政令', '基準'],
    category: 'indirect'
  },
  {
    id: 'indirect-3',
    text: '他の法律に特別の定めがある場合を除き、この法律の規定を適用する。',
    description: '間接参照（他の法律）',
    expectedPatterns: ['他の法律', 'この法律'],
    category: 'indirect'
  },
  
  // 複雑な混合ケース
  {
    id: 'complex-1',
    text: '民法第九十条、商法第五百条第一項及び会社法施行令第三条の規定により、民訴第百条を準用する。',
    description: '複雑な混合参照',
    expectedPatterns: ['民法', '商法', '会社法施行令', '民事訴訟法'],
    category: 'complex'
  },
  {
    id: 'complex-2',
    text: '建築基準法施行令第百二十条並びに消防法施行令第三条の規定により、関係法令に基づく検査を実施する。',
    description: '施行令並列と間接参照',
    expectedPatterns: ['建築基準法施行令', '消防法施行令', '関係法令'],
    category: 'complex'
  },
  
  // 単純なケース（アルゴリズムのみで十分）
  {
    id: 'simple-1',
    text: '第一条の規定により、次条に定める事項を処理する。',
    description: '単純な内部参照',
    expectedPatterns: ['第一条', '次条'],
    category: 'simple'
  },
  {
    id: 'simple-2',
    text: '民法第九十条の規定は、この場合に準用する。',
    description: '単純な外部参照',
    expectedPatterns: ['民法', '第九十条'],
    category: 'simple'
  }
];

class HybridStrategyTester {
  private hybridDetector: HybridReferenceDetector;
  private algorithmDetector: EnhancedReferenceDetectorV37;
  
  constructor() {
    this.algorithmDetector = new EnhancedReferenceDetectorV37();
  }
  
  /**
   * 異なる設定でハイブリッド検出器をテスト
   */
  async testConfigurations() {
    console.log('='.repeat(80));
    console.log('ハイブリッド戦略精度検証');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}`);
    console.log(`テストケース数: ${testCases.length}`);
    console.log();
    
    // 異なる設定パターン
    const configurations: Array<{name: string, config: Partial<HybridDetectionConfig>}> = [
      {
        name: 'アルゴリズムのみ',
        config: {
          useLLMForAbbreviations: false,
          useLLMForIndirectRefs: false,
          useLLMForValidation: false
        }
      },
      {
        name: '略称展開のみ',
        config: {
          useLLMForAbbreviations: true,
          useLLMForIndirectRefs: false,
          useLLMForValidation: false
        }
      },
      {
        name: '間接参照のみ',
        config: {
          useLLMForAbbreviations: false,
          useLLMForIndirectRefs: true,
          useLLMForValidation: false
        }
      },
      {
        name: 'フルハイブリッド',
        config: {
          useLLMForAbbreviations: true,
          useLLMForIndirectRefs: true,
          useLLMForValidation: false,
          maxLLMCallsPerText: 5
        }
      },
      {
        name: '検証付きハイブリッド',
        config: {
          useLLMForAbbreviations: true,
          useLLMForIndirectRefs: true,
          useLLMForValidation: true,
          confidenceThreshold: 0.7
        }
      }
    ];
    
    const results = new Map<string, any[]>();
    
    // 各設定でテスト実行
    for (const configPattern of configurations) {
      console.log(`\n### 設定: ${configPattern.name}`);
      console.log('─'.repeat(60));
      
      this.hybridDetector = new HybridReferenceDetector(configPattern.config);
      const configResults = [];
      
      for (const testCase of testCases) {
        const result = await this.testSingleCase(testCase);
        configResults.push(result);
        
        // 簡易出力
        const successRate = this.calculateSuccessRate(result.detected, testCase.expectedPatterns);
        const icon = successRate >= 80 ? '✅' : successRate >= 50 ? '⚠️' : '❌';
        console.log(`  ${icon} [${testCase.category}] ${testCase.description}: ${successRate.toFixed(0)}%`);
      }
      
      results.set(configPattern.name, configResults);
      
      // 設定別サマリー
      this.printConfigSummary(configPattern.name, configResults);
    }
    
    // 総合比較
    this.printComparison(results);
  }
  
  /**
   * 単一テストケースの実行
   */
  private async testSingleCase(testCase: TestCase): Promise<any> {
    const startTime = Date.now();
    
    // アルゴリズムのみの検出
    const algorithmRefs = this.algorithmDetector.detectReferences(testCase.text);
    
    // ハイブリッド検出
    let hybridResult;
    try {
      hybridResult = await Promise.race([
        this.hybridDetector.detectReferences(testCase.text),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]) as any;
    } catch (error) {
      hybridResult = {
        references: algorithmRefs,
        algorithmDetected: algorithmRefs.length,
        llmEnhanced: 0,
        llmValidated: 0,
        processingTimeMs: Date.now() - startTime,
        llmCallsMade: 0,
        cacheHits: 0,
        strategy: 'algorithm (timeout)'
      };
    }
    
    // 検出されたパターンを抽出
    const detected = this.extractDetectedPatterns(hybridResult.references);
    
    return {
      testId: testCase.id,
      category: testCase.category,
      description: testCase.description,
      expected: testCase.expectedPatterns,
      detected,
      algorithmOnly: algorithmRefs.length,
      hybridTotal: hybridResult.references.length,
      llmEnhanced: hybridResult.llmEnhanced,
      llmCalls: hybridResult.llmCallsMade,
      processingTimeMs: hybridResult.processingTimeMs,
      strategy: hybridResult.strategy
    };
  }
  
  /**
   * 検出されたパターンを抽出
   */
  private extractDetectedPatterns(refs: any[]): string[] {
    const patterns = new Set<string>();
    
    refs.forEach(ref => {
      if (ref.targetLaw) patterns.add(ref.targetLaw);
      if (ref.targetArticle) patterns.add(ref.targetArticle);
      if (ref.sourceText) {
        // 法令名パターンのチェック
        if (/法|令|規則|条例/.test(ref.sourceText)) {
          patterns.add(ref.sourceText);
        }
      }
    });
    
    return Array.from(patterns);
  }
  
  /**
   * 成功率を計算
   */
  private calculateSuccessRate(detected: string[], expected: string[]): number {
    if (expected.length === 0) return 100;
    
    let matches = 0;
    for (const exp of expected) {
      if (detected.some(d => d.includes(exp) || exp.includes(d))) {
        matches++;
      }
    }
    
    return (matches / expected.length) * 100;
  }
  
  /**
   * 設定別サマリー
   */
  private printConfigSummary(configName: string, results: any[]): void {
    const categoryStats = new Map<string, {total: number, success: number}>();
    
    // カテゴリ別集計
    results.forEach(result => {
      if (!categoryStats.has(result.category)) {
        categoryStats.set(result.category, {total: 0, success: 0});
      }
      
      const stats = categoryStats.get(result.category)!;
      stats.total++;
      
      const successRate = this.calculateSuccessRate(result.detected, result.expected);
      if (successRate >= 80) stats.success++;
    });
    
    console.log(`\n  カテゴリ別成績:`);
    categoryStats.forEach((stats, category) => {
      const rate = (stats.success / stats.total * 100).toFixed(0);
      console.log(`    ${category}: ${stats.success}/${stats.total} (${rate}%)`);
    });
    
    // 全体統計
    const totalLLMCalls = results.reduce((sum, r) => sum + r.llmCalls, 0);
    const avgTime = results.reduce((sum, r) => sum + r.processingTimeMs, 0) / results.length;
    const enhancedCount = results.reduce((sum, r) => sum + r.llmEnhanced, 0);
    
    console.log(`  統計:`);
    console.log(`    LLM呼び出し: ${totalLLMCalls}回`);
    console.log(`    平均処理時間: ${avgTime.toFixed(0)}ms`);
    console.log(`    LLM改善数: ${enhancedCount}件`);
  }
  
  /**
   * 総合比較
   */
  private printComparison(results: Map<string, any[]>): void {
    console.log('\n' + '='.repeat(80));
    console.log('## 総合比較結果');
    console.log('='.repeat(80));
    
    const comparison: any[] = [];
    
    results.forEach((configResults, configName) => {
      let totalSuccess = 0;
      let abbreviationSuccess = 0;
      let indirectSuccess = 0;
      let complexSuccess = 0;
      let simpleSuccess = 0;
      
      configResults.forEach(result => {
        const rate = this.calculateSuccessRate(result.detected, result.expected);
        if (rate >= 80) totalSuccess++;
        
        if (result.category === 'abbreviation' && rate >= 80) abbreviationSuccess++;
        if (result.category === 'indirect' && rate >= 80) indirectSuccess++;
        if (result.category === 'complex' && rate >= 80) complexSuccess++;
        if (result.category === 'simple' && rate >= 80) simpleSuccess++;
      });
      
      const totalRate = (totalSuccess / configResults.length * 100).toFixed(1);
      const avgTime = configResults.reduce((sum, r) => sum + r.processingTimeMs, 0) / configResults.length;
      const llmCalls = configResults.reduce((sum, r) => sum + r.llmCalls, 0);
      
      comparison.push({
        config: configName,
        totalRate,
        abbreviation: abbreviationSuccess,
        indirect: indirectSuccess,
        complex: complexSuccess,
        simple: simpleSuccess,
        avgTime: avgTime.toFixed(0),
        llmCalls
      });
    });
    
    // 表形式で出力
    console.log('\n### 精度比較');
    console.log('| 設定 | 総合精度 | 略称 | 間接 | 複雑 | 単純 | 平均時間 | LLM呼出 |');
    console.log('|------|----------|------|------|------|------|----------|---------|');
    
    comparison.forEach(comp => {
      console.log(`| ${comp.config} | ${comp.totalRate}% | ${comp.abbreviation} | ${comp.indirect} | ${comp.complex} | ${comp.simple} | ${comp.avgTime}ms | ${comp.llmCalls} |`);
    });
    
    // 最適設定の判定
    const bestConfig = comparison.reduce((best, current) => {
      return parseFloat(current.totalRate) > parseFloat(best.totalRate) ? current : best;
    });
    
    console.log(`\n### 最適設定: ${bestConfig.config}`);
    console.log(`- 総合精度: ${bestConfig.totalRate}%`);
    console.log(`- 処理時間: ${bestConfig.avgTime}ms`);
    console.log(`- LLM呼び出し: ${bestConfig.llmCalls}回`);
    
    // 推奨事項
    console.log('\n### 推奨事項:');
    
    if (bestConfig.config === 'フルハイブリッド') {
      console.log('✅ フルハイブリッド戦略が最高精度');
      console.log('   - 略称展開と間接参照検出の両方が効果的');
      console.log('   - 処理時間とのトレードオフは許容範囲');
    } else if (bestConfig.config === '略称展開のみ') {
      console.log('⚠️ 略称展開に特化した戦略が効果的');
      console.log('   - 間接参照は7Bモデルでは精度不足');
      console.log('   - 処理速度を優先する場合に推奨');
    } else {
      console.log('❌ LLM統合の効果が限定的');
      console.log('   - アルゴリズムのみで十分な可能性');
      console.log('   - より大規模なモデルの検討を推奨');
    }
    
    // 精度向上の計算
    const baselineRate = parseFloat(
      comparison.find(c => c.config === 'アルゴリズムのみ')?.totalRate || '0'
    );
    const improvement = parseFloat(bestConfig.totalRate) - baselineRate;
    
    console.log(`\n### 精度向上効果:`);
    console.log(`- ベースライン（アルゴリズムのみ）: ${baselineRate.toFixed(1)}%`);
    console.log(`- 最適設定: ${bestConfig.totalRate}%`);
    console.log(`- **改善幅: ${improvement >= 0 ? '+' : ''}${improvement.toFixed(1)}%**`);
    
    if (improvement >= 10) {
      console.log('🎉 **10%以上の大幅な精度向上を達成！**');
    } else if (improvement >= 5) {
      console.log('✅ **5-10%の有意な精度向上**');
    } else if (improvement > 0) {
      console.log('⚠️ **軽微な改善（5%未満）**');
    } else {
      console.log('❌ **改善効果なし**');
    }
  }
}

// メイン実行
async function main() {
  console.log('環境チェック...');
  
  // Ollamaの確認
  try {
    const { execSync } = require('child_process');
    execSync('ollama list | grep qwen2.5:7b', { stdio: 'ignore' });
    console.log('✅ Qwen2.5-7B準備完了');
  } catch {
    console.error('❌ Qwen2.5-7Bが見つかりません');
    console.log('インストール: ollama pull qwen2.5:7b');
    process.exit(1);
  }
  
  console.log();
  
  const tester = new HybridStrategyTester();
  await tester.testConfigurations();
}

main().catch(console.error);