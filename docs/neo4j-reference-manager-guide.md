# Neo4j参照管理システム ガイド

## 概要

`neo4j-reference-manager.ts`は、法令間の参照関係を管理する統合ツールです。
HTMLから参照を抽出し、集約・正規化して、Neo4jグラフデータベースに格納します。

## 統合されたスクリプト

以下の10個のスクリプトが統合されました：

### アーカイブ済み（scripts/archived/）
- aggregate-references.ts
- normalize-reference-counts.ts  
- restore-and-renormalize.ts
- remove-all-limits.ts
- normalize-duplicate-texts.ts
- reprocess-missing-refs.ts
- fix-neo4j-references.ts
- process-heavy-laws.ts
- analyze-heavy-refs.ts
- egov-html-to-neo4j-direct.ts

## 使用方法

### 基本コマンド

```bash
# ヘルプ表示
npx tsx scripts/neo4j-reference-manager.ts --help

# HTMLから参照をインポート
npx tsx scripts/neo4j-reference-manager.ts import --limit 100 --skip-existing

# 参照を集約（重複を統合）
npx tsx scripts/neo4j-reference-manager.ts aggregate

# 参照を正規化（外れ値を除去）
npx tsx scripts/neo4j-reference-manager.ts normalize --max-self 50 --max-ext 100

# 正規化を解除
npx tsx scripts/neo4j-reference-manager.ts remove-limits

# 統計表示
npx tsx scripts/neo4j-reference-manager.ts stats

# データ品質チェック
npx tsx scripts/neo4j-reference-manager.ts quality

# 完全処理（インポート→集約→正規化→統計）
npx tsx scripts/neo4j-reference-manager.ts full-process --limit 1000
```

### コマンド詳細

#### import
HTMLファイルから参照関係を抽出してNeo4jにインポート

オプション：
- `-l, --limit <number>`: 処理する法令数の上限
- `-s, --skip-existing`: 既存の法令をスキップ

#### aggregate  
重複する参照を統合し、REFERENCES_AGGREGATEDリレーションシップを作成

#### normalize
統計的外れ値を検出して正規化

オプション：
- `--max-self <number>`: 自己参照の上限（デフォルト: 50）
- `--max-ext <number>`: 外部参照の上限（デフォルト: 100）

#### stats
参照関係の統計情報を表示
- 全体統計
- タイプ別統計
- 被参照TOP10
- カウント分布

#### quality
データ品質をチェック
- 重複参照
- 空テキスト
- 自己参照
- 法令名欠損

## データ構造

### ノード
```cypher
(:Law {
  lawId: String,        // 法令ID
  lawTitle: String,     // 法令名
  source: String,       // データソース（'egov'）
  created: DateTime     // 作成日時
})
```

### リレーションシップ
```cypher
(:Law)-[:REFERENCES_AGGREGATED {
  type: String,         // 参照タイプ（'internal', 'external'）
  count: Integer,       // 参照回数
  sampleTexts: [String], // サンプルテキスト（最大10個）
  normalized: Boolean,   // 正規化フラグ
  originalCount: Integer, // 元のカウント（正規化前）
  source: String,        // データソース
  created: DateTime      // 作成日時
}]->(:Law)
```

## 処理フロー

1. **インポート**: HTMLから参照を抽出
2. **集約**: 同一参照を統合（カウント保持）
3. **正規化**: 統計的外れ値を除去
4. **品質管理**: データ品質をチェック

## 統計情報（2025年8月27日現在）

- **ユニーク参照**: 233,854件
- **総参照数**: 629,170回
- **平均参照数**: 2.7回
- **最大参照数**: 100回（正規化後）
- **データ分布**: 91.8%が5回以下

## パフォーマンス

- HTMLインポート: 約100法令/分
- 集約処理: 約10秒（23万件）
- 正規化処理: 約2秒

## トラブルシューティング

### メモリ不足エラー
```bash
# Node.jsのメモリを増やす
NODE_OPTIONS="--max-old-space-size=8192" npx tsx scripts/neo4j-reference-manager.ts import
```

### Neo4j接続エラー
`.env`ファイルの設定を確認：
```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=lawfinder123
```

### 処理速度の改善
統合スクリプトでは並列度とバッチサイズが最適化されています：
- 並列度: 5
- バッチサイズ: 50

## 今後の改善案

1. **増分更新**: 新規法令のみを処理
2. **差分検出**: 変更された法令のみ再処理
3. **バックアップ**: 定期的なデータバックアップ
4. **監視**: 処理状況のリアルタイム監視