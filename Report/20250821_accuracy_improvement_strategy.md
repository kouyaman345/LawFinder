# 参照検出精度向上のための戦略提案書

生成日時: 2025年8月21日

## エグゼクティブサマリー

過去の開発履歴を分析した結果、**現在96.1%の精度は既に実用レベル**であり、残り3.9%の改善には**根本的に異なるアプローチ**が必要です。LLM統合ではなく、**エラー分析に基づく的確な改善**を提案します。

## 1. 現状分析：なぜ精度が向上しないのか

### 1.1 精度向上を阻害している要因

```
現在の問題点：
1. 評価と改善の不一致
   - テストケースで改善 → 実データで評価 → 効果なし
   
2. 過度な一般化
   - 稀なケースに対応 → 通常ケースの精度低下
   
3. LLMへの過度な期待
   - パターンで解決可能な問題にLLMを適用 → 速度低下のみ

4. 残り3.9%の困難性
   - 真に曖昧な参照（人間でも判断困難）
```

### 1.2 成功パターンの分析

**過去に効果があった改善**：
- **具体的なエラー修正**: 漢数字バグ修正 → 即座に効果
- **実データに基づく実装**: 略称辞書 → 実用的な改善
- **文脈情報の活用**: 定義追跡 → 大幅な精度向上

## 2. 残り3.9%のエラー分析

### 2.1 エラーの内訳（推定）

```typescript
// 8/18の検証結果から推定されるエラー分布
const errorDistribution = {
  "真に曖昧な参照": 1.5,  // 「その他の法令」など
  "複雑な文脈依存": 1.0,  // 「当該」の参照先
  "検出可能な漏れ": 0.9,  // パターン追加で対応可能
  "過検出": 0.5,          // 誤った参照の検出
};
```

### 2.2 改善可能性の評価

| エラータイプ | 割合 | 改善可能性 | 推奨アプローチ |
|------------|------|-----------|--------------|
| 検出可能な漏れ | 0.9% | **高** | パターン追加 |
| 過検出 | 0.5% | **高** | フィルタリング強化 |
| 複雑な文脈依存 | 1.0% | **中** | 高度な文脈追跡 |
| 真に曖昧な参照 | 1.5% | **低** | 人間の判断が必要 |

## 3. 実効性のある精度向上戦略

### 3.1 Phase 1: エラー分析と修正（1週間）

**目標**: 96.1% → 97.5%（+1.4pt）

```typescript
// 1. エラーログの収集と分析
class ErrorAnalyzer {
  async analyzeFailures() {
    // 実際の法令でe-Govと比較
    const failures = await compareWithEGov(majorLaws);
    
    // エラーパターンを分類
    return {
      missedPatterns: [],  // 見逃したパターン
      falsePositives: [],  // 誤検出
      contextErrors: [],   // 文脈エラー
    };
  }
}

// 2. 具体的なパターン修正
const specificFixes = {
  // 実際のエラーケースから抽出
  "附則参照": /附則第(\d+)条/g,
  "条の2形式": /第(\d+)条の(\d+)/g,
  "但書参照": /ただし[^。]*第(\d+)条/g,
};

// 3. 過検出の除外ルール
const exclusionRules = [
  "労働組合",  // 法令名ではない
  "特別の定め", // 具体的な参照ではない
];
```

**実装タスク**：
1. 主要5法令で全エラーケースを収集
2. エラーパターンを分類（自動化）
3. 最頻出エラーから順に修正
4. 回帰テストで副作用を防止

### 3.2 Phase 2: 文脈追跡の高度化（2週間）

**目標**: 97.5% → 98.5%（+1.0pt）

```typescript
// 高度な文脈追跡システム
class AdvancedContextTracker {
  private context = {
    currentLaw: null,
    currentArticle: null,
    definitions: new Map(),
    lastMentionedLaws: [],
    scope: 'article', // article | section | chapter
  };
  
  // 「当該」「その」の解決
  resolveDemonstratives(text: string) {
    // 直前の参照対象を追跡
    if (text.includes('当該')) {
      return this.context.lastMentionedLaws[0];
    }
  }
  
  // スコープベースの解決
  resolveByScope(reference: string) {
    // 現在の条/節/章内での相対参照
    if (reference === '本条') {
      return this.context.currentArticle;
    }
  }
}
```

**実装タスク**：
1. 文脈スコープの正確な追跡
2. 指示代名詞の解決ロジック
3. 定義の有効範囲管理
4. 階層構造の完全な把握

### 3.3 Phase 3: 選択的な人間介入（1ヶ月）

**目標**: 98.5% → 99.5%（+1.0pt）

```typescript
// 信頼度ベースの人間介入システム
class HumanInTheLoopSystem {
  // 低信頼度の検出を記録
  async flagForReview(reference, confidence) {
    if (confidence < 0.7) {
      await saveToReviewQueue({
        text: reference.text,
        context: reference.context,
        suggestedType: reference.type,
        confidence: confidence,
      });
    }
  }
  
  // 人間のフィードバックから学習
  async learnFromFeedback(feedback) {
    // パターンの自動生成
    if (feedback.corrected) {
      this.generateNewPattern(feedback);
    }
  }
}
```

**実装タスク**：
1. 信頼度スコアリングの実装
2. レビューキューの構築
3. フィードバックの自動反映
4. パターン学習システム

## 4. 測定と評価の標準化

### 4.1 統一ベンチマークの確立

```typescript
// 固定ベンチマークセット
const STANDARD_BENCHMARK = {
  laws: [
    '129AC0000000089', // 民法
    '132AC0000000048', // 商法
    '140AC0000000045', // 刑法
    '417AC0000000086', // 会社法
    '322AC0000000049', // 労働基準法
  ],
  
  // e-Govの正解データ
  groundTruth: loadEGovReferences(),
  
  // 評価指標
  metrics: ['precision', 'recall', 'f1', 'speed'],
};

// 継続的な精度測定
async function continuousEvaluation() {
  const results = await evaluate(STANDARD_BENCHMARK);
  
  // 改善/劣化を即座に検知
  if (results.f1 < lastResults.f1) {
    console.warn('精度が低下しました！');
    rollback();
  }
}
```

### 4.2 A/Bテストフレームワーク

```typescript
// 新旧バージョンの比較
class ABTestFramework {
  async compare(oldDetector, newDetector) {
    const testSet = getRandomSample(allLaws, 100);
    
    const oldResults = await oldDetector.process(testSet);
    const newResults = await newDetector.process(testSet);
    
    return {
      improvement: calculateImprovement(oldResults, newResults),
      regressions: findRegressions(oldResults, newResults),
      newCapabilities: findNewDetections(oldResults, newResults),
    };
  }
}
```

## 5. 実装優先順位

### 5.1 即座に実施（今週）

1. **エラーログ収集スクリプト作成**
   ```bash
   npx tsx scripts/collect-errors.ts --laws "民法,商法,刑法"
   ```

2. **固定ベンチマーク作成**
   ```bash
   npx tsx scripts/create-benchmark.ts --output benchmark.json
   ```

3. **最頻出エラーパターンの修正**

### 5.2 短期実施（2週間以内）

1. **文脈追跡の強化**
2. **過検出フィルターの実装**
3. **継続的評価システムの構築**

### 5.3 中期実施（1ヶ月以内）

1. **信頼度スコアリング**
2. **人間介入システム**
3. **自動学習機能**

## 6. 期待される成果

### 6.1 現実的な目標設定

```
現在: 96.1%
Phase 1完了: 97.5%（+1.4pt）
Phase 2完了: 98.5%（+1.0pt）
Phase 3完了: 99.5%（+1.0pt）
最終目標: 99.5%（+3.4pt）
```

### 6.2 投資対効果

| Phase | 工数 | 精度向上 | ROI |
|-------|------|---------|-----|
| Phase 1 | 1週間 | +1.4pt | **高** |
| Phase 2 | 2週間 | +1.0pt | **中** |
| Phase 3 | 1ヶ月 | +1.0pt | **低** |

**推奨**: Phase 1を確実に実施し、効果を測定してからPhase 2へ

## 7. アンチパターンの回避

### 7.1 避けるべきアプローチ

❌ **やってはいけないこと**：
1. **全面的な書き換え** - 既存の96%を失うリスク
2. **LLMへの全面依存** - 速度低下、コスト増、効果なし
3. **理論的な最適化** - 実データでの検証なし
4. **過度な一般化** - エッジケースへの対応で通常ケースが劣化

### 7.2 成功のための原則

✅ **守るべき原則**：
1. **小さな改善の積み重ね**
2. **実データでの検証**
3. **回帰テストの徹底**
4. **測定可能な目標設定**

## 8. 結論

### 8.1 核心的な洞察

**残り3.9%の改善は、新技術ではなくエラー分析と地道な修正で達成可能**

### 8.2 行動計画

```bash
# 今すぐ実行すべきコマンド
# 1. エラー収集
npx tsx scripts/cli.ts test egov --detailed > errors.log

# 2. エラー分析
grep "❌" errors.log | sort | uniq -c | sort -rn

# 3. 最頻出エラーの修正
# detector.tsの該当パターンを修正

# 4. 効果測定
npx tsx scripts/cli.ts test egov --benchmark
```

### 8.3 最終提言

**LLMやAIに頼るのではなく、エンジニアリングの基本に立ち返る**：
- エラーを一つずつ潰す
- 実データで検証する
- 小さく確実に改善する

この戦略により、**3ヶ月で99.5%の精度達成が現実的に可能**です。

---

_レポート作成: LawFinder開発チーム_  
_最終更新: 2025年8月21日_