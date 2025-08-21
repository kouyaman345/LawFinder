# 残存課題の解決策提案書

生成日時: 2025年8月21日

## エグゼクティブサマリー

現在のF1スコアは基本機能で94.7%、エッジケースで82.8%を達成していますが、特定の複雑なパターンで課題が残っています。本提案書では、これらの課題に対する実装可能な解決策を提示します。

## 1. 残存課題の詳細分析

### 1.1 括弧内参照（優先度: 高）

**問題例**:
```
「第5条（第3条第2項の規定を準用する場合を含む。）」
期待: 第5条、第3条第2項の2件
実際: 0件
```

**原因分析**:
- 括弧内のテキストが独立して解析されていない
- 括弧のネストに対応していない
- 括弧の開始と終了の対応付けが不完全

**解決策**:
```typescript
// 括弧内参照の専用パターン
const bracketPattern = /（([^（）]+)）/g;

// 括弧内のテキストを抽出して再帰的に解析
while ((match = bracketPattern.exec(text)) !== null) {
  const innerText = match[1];
  // 括弧内のテキストを別途解析
  const innerRefs = this.detectByPattern(innerText);
  references.push(...innerRefs);
}

// メインテキストからも参照を検出
const mainPattern = /第(\d+)条/g;
// ...通常の処理
```

### 1.2 準用・読替えパターン（優先度: 高）

**問題例**:
```
1. 「第50条の規定は、前項の場合について準用する」
   期待: 第50条、前項の2件
   実際: 前項の1件のみ

2. 「第30条中「許可」とあるのは「届出」と読み替える」
   期待: 第30条の1件
   実際: 0件
```

**解決策**:
```typescript
// 準用パターン
const junyoPattern = /第(\d+)条(?:の(\d+))?(?:から第(\d+)条(?:の(\d+))?まで)?の規定[はを]、?([^。]+について)?準用/g;

// 読替えパターン  
const yomikaPattern = /第(\d+)条中「([^」]+)」とあるのは「([^」]+)」と読み替え/g;

// 準用の検出
while ((match = junyoPattern.exec(text)) !== null) {
  references.push({
    type: 'application',
    text: match[0],
    targetArticle: `第${match[1]}条`,
    applicationMethod: 'junyo',
    confidence: 0.95
  });
}

// 読替えの検出
while ((match = yomikaPattern.exec(text)) !== null) {
  references.push({
    type: 'application',
    text: match[0],
    targetArticle: `第${match[1]}条`,
    applicationMethod: 'yomikae',
    originalTerm: match[2],
    replacedTerm: match[3],
    confidence: 0.95
  });
}
```

### 1.3 複数法令の並列参照（優先度: 中）

**問題例**:
```
「民法第90条及び商法第48条」
期待: 民法第90条、商法第48条の2件
実際: 0件
```

**原因分析**:
- 法令名と条文番号の組み合わせが分離されている
- 「及び」「並びに」などの接続詞での分割が未実装

**解決策**:
```typescript
// 複数法令並列パターン
const multiLawPattern = /([^、。\s]+法)第(\d+)条(?:(?:及び|並びに|又は|若しくは)([^、。\s]+法)第(\d+)条)+/g;

while ((match = multiLawPattern.exec(text)) !== null) {
  // 最初の法令
  references.push({
    type: 'external',
    text: `${match[1]}第${match[2]}条`,
    targetLaw: match[1],
    targetArticle: `第${match[2]}条`,
    confidence: 0.95
  });
  
  // 2番目の法令
  if (match[3] && match[4]) {
    references.push({
      type: 'external',
      text: `${match[3]}第${match[4]}条`,
      targetLaw: match[3],
      targetArticle: `第${match[4]}条`,
      confidence: 0.95
    });
  }
}
```

## 2. 実装戦略

### 2.1 段階的実装アプローチ

**Phase 1（即座に実装可能）**:
1. 準用・読替えパターンの追加
2. 基本的な括弧内参照の実装

**Phase 2（追加テスト必要）**:
1. 複数法令並列参照の実装
2. ネストした括弧への対応

**Phase 3（将来的な拡張）**:
1. より複雑な文法パターンへの対応
2. 機械学習による精度向上

### 2.2 テスト駆動開発

各パターンの実装前に、以下のテストケースを追加：

```typescript
// test-edge-cases.tsに追加
const advancedEdgeCases = [
  {
    name: '括弧内参照: 基本',
    text: '第5条（第3条の規定による。）',
    expectedCount: 2,
  },
  {
    name: '準用: 完全形',
    text: '第50条から第55条までの規定は、前項の場合について準用する',
    expectedCount: 2,
  },
  {
    name: '読替え: 基本',
    text: '第30条中「許可」とあるのは「届出」と読み替える',
    expectedCount: 1,
  }
];
```

## 3. 期待される改善効果

### 3.1 定量的効果

| 指標 | 現在 | 実装後（予測） | 改善 |
|------|------|--------------|------|
| エッジケースF1スコア | 82.8% | 92-95% | +10-12pt |
| エッジケース成功率 | 69.2% | 85-90% | +16-21pt |
| 実データ成功率 | 40% | 60-70% | +20-30pt |

### 3.2 定性的効果

1. **完全性の向上**: 法律文書の参照をより網羅的に検出
2. **信頼性の向上**: 複雑な法的表現にも対応
3. **実用性の向上**: 実際の法改正作業での有用性向上

## 4. リスクと対策

### 4.1 リスク

1. **過検出のリスク**: パターンが広すぎると誤検出が増加
2. **性能低下**: 複雑なパターンによる処理速度の低下
3. **保守性の低下**: コードの複雑化

### 4.2 対策

1. **信頼度スコアの活用**: 不確実な検出には低い信頼度を設定
2. **パフォーマンステスト**: 各パターン追加後に速度測定
3. **モジュール化**: パターンごとに独立した関数として実装

## 5. 実装スケジュール案

### Week 1（即座）
- 準用・読替えパターンの実装
- テストケースの追加
- 基本的な括弧内参照の実装

### Week 2
- 複数法令並列参照の実装
- 全体的なテストと調整
- ドキュメント更新

### Week 3
- 実データでの検証
- パフォーマンス最適化
- 本番環境への適用準備

## 6. 代替アプローチ

### 6.1 ハイブリッドアプローチ

現在のパターンマッチングに加えて：

1. **構文解析器の導入**
   - 括弧の対応を正確に処理
   - 文法的に正しい解析

2. **LLMの選択的活用**
   - 複雑なケースのみLLMで補完
   - 信頼度の低い検出結果の検証

### 6.2 学習ベースアプローチ

1. **教師データの作成**
   - e-Govの参照データを教師データ化
   - 人手でアノテーション追加

2. **軽量モデルの訓練**
   - BERTベースの日本語モデル
   - 法律文書に特化したファインチューニング

## 7. 結論と推奨事項

### 7.1 推奨する即座の行動

1. **準用・読替えパターンの実装**（1-2時間で実装可能）
2. **括弧内参照の基本実装**（2-3時間で実装可能）
3. **テストケースの拡充**（継続的に追加）

### 7.2 中期的な目標

- エッジケースF1スコア90%以上の達成
- 実データ成功率60%以上の達成
- 全パターンの文書化と標準化

### 7.3 長期的なビジョン

- AIベースの参照検出への移行
- リアルタイム法改正影響分析の実現
- 法律専門家向けツールとしての製品化

---

## 付録: 実装コード例

```typescript
// detector.tsに追加する実装例
private detectAdvancedPatterns(text: string): DetectedReference[] {
  const references: DetectedReference[] = [];
  
  // 1. 括弧内参照の処理
  this.detectBracketReferences(text, references);
  
  // 2. 準用・読替えの処理
  this.detectApplicationReferences(text, references);
  
  // 3. 複数法令並列の処理
  this.detectMultiLawReferences(text, references);
  
  return references;
}
```

---

_提案書作成: LawFinder開発チーム_  
_最終更新: 2025年8月21日_