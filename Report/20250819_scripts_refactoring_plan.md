# scriptsディレクトリ リファクタリング計画書

作成日: 2025年8月19日

## 1. 現状分析

### 1.1 ファイル数と状態
- **総ファイル数**: 74個のTypeScriptファイル
- **問題点**:
  - 機能の重複が多数存在
  - バージョン番号付きファイルが乱立（v35, v36, v37, v40, v41など）
  - 似た機能を持つスクリプトが複数存在
  - 命名規則が不統一

### 1.2 カテゴリ別分類

#### A. インポート関連 (11ファイル)
```
最新版（推奨）:
- import-laws-with-versioning-fixed.ts (2025-08-20) ★最新
- import-parallel.ts (2025-08-19)
- reimport-major-laws.ts (2025-08-20)
- reimport-single-law.ts (2025-08-20)

旧版（削除候補）:
- import-all-laws-improved.ts
- import-all-laws-to-postgresql.ts
- import-laws-to-db-v3.ts
- import-laws-with-versioning.ts (fixedがあるため不要)
```

#### B. 参照検出・登録関連 (24ファイル)
```
最新版（推奨）:
- reference-manager.ts ★統合管理システム（CLAUDE.md推奨）
- populate-references-v41.ts (最新エンジン使用)
- detect-and-populate-neo4j-full.ts

中核機能:
- manage-references.ts (旧管理システム、reference-managerと重複)

旧版（削除候補）:
- populate-references.ts
- populate-references-simple.ts
- populate-references-versioned.ts
- populate-references-neo4j.ts
- populate-all-references-to-neo4j.ts
- populate-neo4j-from-validation.ts
- register-references.ts
- register-references-v2.ts
- register-references-v3.ts
- detect-and-populate-neo4j.ts (fullがあるため不要)
```

#### C. 検証・テスト関連 (26ファイル)
```
最新版（推奨）:
- massive-validation-1000.ts (2025-08-20) ★最新
- test-reference-detection.ts
- reference-validation-workflow.ts

e-Gov比較:
- egov-complete-comparison.ts (2025-08-20) ★最新
- egov-scraper.ts (2025-08-20)
- verify-references-with-egov.ts

旧版（削除候補）:
- validate-v35-improvements.ts
- validate-v36-final.ts
- validate-v37-final.ts
- comprehensive-validation-v36.ts
- extended-pattern-test-v36.ts
- test-v40-detector.ts
- test-v41-improvements.ts
- test-improved-detector.ts (detection.tsと重複)
- test-improved-detection.ts
- validate-all-laws.ts (batch/fullがあるため不要)
- validate-diverse-laws.ts
- validate-real-laws.ts
- egov-validator.ts (comparison系と重複)
- egov-comparison-validator.ts
- egov-full-comparison.ts (complete-comparisonがあるため不要)
```

#### D. Neo4j同期関連 (8ファイル)
```
最新版（推奨）:
- sync-to-neo4j.ts ★メイン同期スクリプト
- rebuild-neo4j-with-titles.ts

修正系:
- sync-fixed-references-to-neo4j.ts
- sync-postgres-references-to-neo4j.ts

削除候補:
- その他のNeo4j関連スクリプト（sync-to-neo4jに統合）
```

#### E. データ修正関連 (9ファイル)
```
必要:
- fix-law-titles.ts
- fix-titles-from-csv.ts
- fix-references-with-target-law.ts
- fix-article-order.ts
- fix-sortorder.ts
- handle-deleted-articles.ts
- restore-articles-from-xml.ts

統合候補:
- fix-commercial-code.ts (単体法令修正)
- validate-and-fix-laws.ts (validate系と重複)
```

#### F. 分析・デバッグ関連 (8ファイル)
```
保持:
- analyze-detection-failures.ts
- analyze-detection-superiority.ts
- analyze-ref-accuracy.ts
- debug-references.ts
- graph-analysis.ts

統合候補:
- monitor-progress.ts (単純なモニタリング)
```

#### G. その他 (7ファイル)
```
保持:
- startup.sh (Ollama起動)
- setup-postgresql.sh (DB設定)
- neo4j-visualization-guide.ts (ガイド)

テスト系:
- test-xml-extraction.ts
- test-reference-insert.ts
- test-hybrid-strategy.ts
- test-llm-validation.ts
```

## 2. リファクタリング計画

### 2.1 統合スクリプトの作成

#### 📁 `scripts/unified/law-manager.ts`
```typescript
// 統合法令管理ツール
Commands:
- import: 法令データのインポート（単体/複数/全体）
- reimport: 法令データの再インポート
- validate: データ検証
- fix: データ修正
```

#### 📁 `scripts/unified/reference-manager.ts`
```typescript
// 既存のreference-manager.tsを拡張
// manage-references.tsの機能を統合
```

#### 📁 `scripts/unified/validation-suite.ts`
```typescript
// 検証ツール統合
Commands:
- test: 参照検出テスト
- compare: e-Gov比較
- validate: 大規模検証
- analyze: 失敗分析
```

#### 📁 `scripts/unified/sync-manager.ts`
```typescript
// データベース同期管理
Commands:
- neo4j: Neo4j同期
- postgres: PostgreSQL同期
- hybrid: ハイブリッド同期
```

### 2.2 ディレクトリ構造の整理

```
scripts/
├── unified/           # 統合スクリプト（新規）
│   ├── law-manager.ts
│   ├── reference-manager.ts
│   ├── validation-suite.ts
│   └── sync-manager.ts
├── utils/            # ユーティリティ（保持）
│   ├── startup.sh
│   └── setup-postgresql.sh
├── legacy/           # 旧バージョン（アーカイブ）
│   └── [古いスクリプトを移動]
└── docs/            # ドキュメント
    └── neo4j-visualization-guide.ts
```

## 3. 削除推奨ファイル一覧

### 即座に削除可能（重複・旧版）
1. import-laws-with-versioning.ts (fixedがある)
2. import-all-laws-to-postgresql.ts
3. import-laws-to-db-v3.ts
4. populate-references.ts～populate-references-neo4j.ts (v41使用)
5. register-references*.ts (全バージョン)
6. validate-v35～v37系 (全て)
7. test-v40-detector.ts, test-v41-improvements.ts
8. egov-full-comparison.ts (complete版がある)
9. detect-and-populate-neo4j.ts (full版がある)

### 統合後に削除
1. manage-references.ts (reference-manager.tsに統合)
2. 各種validate-*.ts (validation-suiteに統合)
3. 各種test-*.ts (validation-suiteに統合)
4. 各種import-*.ts (law-managerに統合)

## 4. 実装優先順位

### Phase 1: 緊急対応（今すぐ）
1. 削除推奨ファイルをlegacy/ディレクトリに移動
2. 最新版スクリプトの動作確認

### Phase 2: 統合実装（1日以内）
1. law-manager.ts の実装
2. validation-suite.ts の実装
3. sync-manager.ts の実装

### Phase 3: クリーンアップ（2日以内）
1. reference-manager.ts の機能拡張
2. legacy/ディレクトリの削除
3. ドキュメント更新

## 5. 影響範囲とリスク

### リスク評価
- **低リスク**: 削除対象は全て旧版・重複
- **中リスク**: 統合による新規バグの可能性
- **対策**: legacyディレクトリで一時保管

### 依存関係
- package.jsonのスクリプトセクション更新が必要
- CLAUDE.mdの更新が必要
- CI/CDパイプラインの確認が必要

## 6. 期待される効果

### メンテナンス性向上
- ファイル数: 74個 → 約20個（73%削減）
- 重複コード: 80%削減
- 実行コマンド: 統一化により学習コスト削減

### パフォーマンス
- バッチ処理の効率化
- メモリ使用量の削減
- 実行時間の短縮

### 開発効率
- 新機能追加が容易に
- デバッグの簡素化
- テストカバレッジの向上

## 7. 次のアクション

1. **即座に実行**:
   ```bash
   # legacyディレクトリ作成
   mkdir -p scripts/legacy
   
   # 旧版ファイルの移動
   mv scripts/*v35*.ts scripts/legacy/
   mv scripts/*v36*.ts scripts/legacy/
   mv scripts/*v37*.ts scripts/legacy/
   mv scripts/*v40*.ts scripts/legacy/
   mv scripts/register-references*.ts scripts/legacy/
   ```

2. **統合スクリプトの実装開始**
3. **CLAUDE.mdの更新**
4. **動作確認テストの実施**

---

## 補足: 保持すべき最新スクリプト一覧

### コア機能（必須保持）
- reference-manager.ts
- import-laws-with-versioning-fixed.ts
- populate-references-v41.ts
- sync-to-neo4j.ts
- massive-validation-1000.ts
- egov-complete-comparison.ts

### サポート機能（保持推奨）
- fix-*.ts シリーズ（データ修正用）
- analyze-*.ts シリーズ（分析用）
- test-reference-detection.ts（基本テスト）
- reference-validation-workflow.ts（ワークフロー）

このリファクタリングにより、scriptsディレクトリの管理が大幅に改善され、開発効率が向上します。