#!/usr/bin/env npx tsx

/**
 * 困難ケース分析ツール
 * 検出が困難なケースを特定し分類
 */

import { complexTestCases } from './complex-test-cases';
import { EnhancedPatternDetector } from './enhanced-pattern-detector';

interface FailureAnalysis {
  testCase: typeof complexTestCases[0];
  detected: number;
  missing: number;
  reason: string;
  requiredCapability: 'pattern' | 'context' | 'llm' | 'hybrid';
  priority: 'high' | 'medium' | 'low';
}

export class DifficultyAnalyzer {
  private detector = new EnhancedPatternDetector();

  /**
   * 失敗ケースを分析
   */
  public analyzeFailures(): FailureAnalysis[] {
    const failures: FailureAnalysis[] = [];

    for (const tc of complexTestCases) {
      const refs = this.detector.detect(tc.text);
      const detected = refs.length;
      
      if (detected < tc.expected) {
        failures.push({
          testCase: tc,
          detected,
          missing: tc.expected - detected,
          reason: this.analyzeFailureReason(tc, detected),
          requiredCapability: this.determineRequiredCapability(tc),
          priority: this.determinePriority(tc),
        });
      }
    }

    return failures;
  }

  /**
   * 失敗理由を分析
   */
  private analyzeFailureReason(tc: typeof complexTestCases[0], detected: number): string {
    if (tc.type === 'contextual') {
      if (tc.text.includes('この条')) {
        return '自己参照パターンが未実装';
      }
      if (tc.text.includes('同')) {
        return '文脈からの参照先推定が必要';
      }
      return '文脈情報が不足';
    }

    if (tc.type === 'complex') {
      if (tc.text.includes('前') && tc.text.includes('条')) {
        return '複数条の相対参照パターンが未対応';
      }
      if (tc.text.includes('編') && tc.text.includes('章')) {
        return '複数階層の構造参照が未実装';
      }
      if (tc.text.includes('から') && tc.text.includes('まで')) {
        return '範囲展開ロジックが不完全';
      }
    }

    if (tc.type === 'nested') {
      return '複雑な入れ子構造の解析が必要';
    }

    if (tc.type === 'ambiguous') {
      return '曖昧表現の解決にはLLMが必要';
    }

    if (tc.type === 'implicit') {
      return '暗黙的な参照の推定が必要';
    }

    return '原因不明';
  }

  /**
   * 必要な能力を判定
   */
  private determineRequiredCapability(tc: typeof complexTestCases[0]): FailureAnalysis['requiredCapability'] {
    // パターンマッチングで解決可能
    if (tc.difficulty === 'easy' || 
        (tc.difficulty === 'medium' && !tc.text.includes('同') && !tc.text.includes('当該'))) {
      return 'pattern';
    }

    // 文脈情報が必要
    if (tc.type === 'contextual' || tc.text.includes('同') || tc.text.includes('当該')) {
      return 'context';
    }

    // LLMが必要
    if (tc.type === 'ambiguous' || tc.type === 'implicit' || tc.difficulty === 'extreme') {
      return 'llm';
    }

    // ハイブリッドアプローチが必要
    return 'hybrid';
  }

  /**
   * 優先度を判定
   */
  private determinePriority(tc: typeof complexTestCases[0]): FailureAnalysis['priority'] {
    // 基本的なケースは高優先度
    if (tc.difficulty === 'easy' || tc.difficulty === 'medium') {
      return 'high';
    }

    // 頻出する可能性があるケースは中優先度
    if (tc.type === 'contextual' || tc.type === 'complex') {
      return 'medium';
    }

    // 稀なケースは低優先度
    return 'low';
  }

  /**
   * 改善提案を生成
   */
  public generateImprovementPlan(failures: FailureAnalysis[]): void {
    console.log('\n=== 改善計画 ===\n');

    // 優先度別にグループ化
    const byPriority = {
      high: failures.filter(f => f.priority === 'high'),
      medium: failures.filter(f => f.priority === 'medium'),
      low: failures.filter(f => f.priority === 'low'),
    };

    // 必要な能力別にグループ化
    const byCapability = {
      pattern: failures.filter(f => f.requiredCapability === 'pattern'),
      context: failures.filter(f => f.requiredCapability === 'context'),
      llm: failures.filter(f => f.requiredCapability === 'llm'),
      hybrid: failures.filter(f => f.requiredCapability === 'hybrid'),
    };

    console.log('## 優先度別の改善項目\n');
    for (const [priority, items] of Object.entries(byPriority)) {
      if (items.length > 0) {
        console.log(`### ${priority.toUpperCase()}優先度（${items.length}件）`);
        items.slice(0, 3).forEach(item => {
          console.log(`- ${item.testCase.name}: ${item.reason}`);
        });
        console.log();
      }
    }

    console.log('## 必要な技術別の分類\n');
    for (const [capability, items] of Object.entries(byCapability)) {
      if (items.length > 0) {
        const percentage = (items.length / failures.length * 100).toFixed(1);
        console.log(`### ${capability.toUpperCase()}（${items.length}件, ${percentage}%）`);
        
        if (capability === 'pattern') {
          console.log('パターンマッチングの改善で対応可能:');
        } else if (capability === 'context') {
          console.log('文脈トラッキングの実装が必要:');
        } else if (capability === 'llm') {
          console.log('LLM統合が必須:');
        } else {
          console.log('複合的なアプローチが必要:');
        }
        
        items.slice(0, 2).forEach(item => {
          console.log(`  - ${item.testCase.name}`);
        });
        console.log();
      }
    }

    // 実装提案
    console.log('## 段階的な実装提案\n');
    console.log('### Phase 1: パターン改善（1-2日）');
    console.log('- 自己参照パターン（この条）の追加');
    console.log('- 複数条の相対参照（前3条）の実装');
    console.log('- 複数階層構造（第2編第3章）の対応');
    console.log(`  → 期待効果: +${(byCapability.pattern.length * 2).toFixed(0)}pt改善\n`);

    console.log('### Phase 2: 文脈トラッキング（3-4日）');
    console.log('- 現在位置（条文番号）の追跡');
    console.log('- 直前の法令名の記憶');
    console.log('- 定義済み用語の管理');
    console.log(`  → 期待効果: +${(byCapability.context.length * 2.5).toFixed(0)}pt改善\n`);

    console.log('### Phase 3: 選択的LLM統合（1週間）');
    console.log('- 低信頼度ケースのLLM検証');
    console.log('- 曖昧表現の解決');
    console.log('- 暗黙的参照の推定');
    console.log(`  → 期待効果: +${(byCapability.llm.length * 1.5).toFixed(0)}pt改善\n`);
  }
}

// メイン実行
if (require.main === module) {
  const analyzer = new DifficultyAnalyzer();
  
  console.log('=== 困難ケース分析 ===\n');
  
  const failures = analyzer.analyzeFailures();
  
  console.log(`検出失敗ケース数: ${failures.length}件\n`);
  
  // 失敗ケースの詳細
  console.log('## 失敗ケース一覧\n');
  failures.forEach((f, i) => {
    console.log(`${i + 1}. ${f.testCase.name} [${f.testCase.difficulty}]`);
    console.log(`   テキスト: "${f.testCase.text}"`);
    console.log(`   期待: ${f.testCase.expected}, 検出: ${f.detected}, 不足: ${f.missing}`);
    console.log(`   理由: ${f.reason}`);
    console.log(`   必要技術: ${f.requiredCapability}`);
    console.log(`   優先度: ${f.priority}\n`);
  });
  
  // 改善計画の生成
  analyzer.generateImprovementPlan(failures);
  
  // サマリー
  const currentF1 = 67.9; // 前回の実行結果から
  const targetF1 = 90;
  console.log('## サマリー\n');
  console.log(`現在のF1スコア: ${currentF1.toFixed(1)}%`);
  console.log(`目標F1スコア: ${targetF1}%`);
  console.log(`必要な改善: +${(targetF1 - currentF1).toFixed(1)}pt`);
  console.log(`\n高優先度の改善で期待される向上: +${(failures.filter(f => f.priority === 'high').length * 3).toFixed(0)}pt`);
}