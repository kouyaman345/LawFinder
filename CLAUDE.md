# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリのコードを扱う際のガイダンスを提供します。

## プロジェクト概要

LawFinder は、政府が公開する法的標準 XML ファイルを処理する日本の法文書検索・法改正支援アプリケーションです。システムは法的構造の可視化、法律間の相互参照の検出、改正影響（「はね改正」）の分析を目的としています。

## プロジェクト状況（2025 年 8 月 16 日更新）

**Phase 2（React/Next.js 実装）が進行中です。参照関係検出機能の改善と検証を重点的に実施中。**

# 開発ガイドライン

- Python を使う時には必ず venv を使用してください
- レポートを生成する際は、`Report/` ディレクトリ内に `yyyymmdd_reportname.md` の形式で作成してください
- .gitignore も適宜追加更新すること
- 実装に着手する前に、必ず `docs/` 配下の要件定義・仕様書（.md）や `CLAUDE.md` を最新化し、それに基づいてタスクを進めてください
- サーバーのポートは 5000 を使用 (Next.js デフォルト)
- ポートが使用されている時には kill で終了させましょう (pkill -f "next-server" && pkill -f "next dev")

### 現在の開発環境

- **フロントエンド開発**: React + Next.js 15
- **開発サーバー**: `npm run dev` (http://localhost:5000)

### 重要な開発コマンド

```bash
# Next.js開発サーバー起動（メイン開発環境）
npm run dev

# 静的サイトビルド（レガシー版）
npm run build:static:egov

# テスト実行
npm test

# 型チェック
npm run typecheck

# リンター実行
npm run lint
```

### 実装済み機能

- ✅ 政府標準 XML 形式の完全な解析
- ✅ 包括的参照検出エンジン（ComprehensiveReferenceDetector）
- ✅ e-Gov 風の洗練された UI（React/Next.js）
- ✅ インタラクティブな参照ナビゲーション
- ✅ ローカル LLM 統合（Ollama/Mistral）
- ✅ 階層目次の完全再現（編・章・節・条・項・号）
- ✅ PostgreSQL + Prisma によるデータ管理
- ✅ 参照検出検証ワークフロー

### 改善中の機能

- 🔧 参照検出精度の向上（大規模漢数字、複数項目参照など）
- 🔧 Neo4j 統合によるグラフベース参照分析
- 🔧 LLM による文脈依存参照の解析（「同項」など）

### 技術スタック（実装済み）

- **静的サイト生成**: Node.js カスタムスクリプト
- **XML パーサー**: 正規表現ベースのカスタムパーサー
- **スタイル**: e-Gov 準拠のカスタム CSS
- **LLM 統合**: Ollama REST API（Mistral モデル）
- **アーキテクチャ**: ドメイン駆動設計（DDD）

### Phase 2 技術スタック（実装中）

- **フロントエンド**: React + Next.js 15（App Router）
- **バックエンド**: Next.js API Routes（TypeScript）
- **データベース**: ハイブリッド構成
  - **PostgreSQL + Prisma ORM**: 法令本体データ、メタデータ、全文検索
  - **Neo4j**: 参照関係グラフ、ハネ改正分析専用
- **キャッシュ**: Redis（予定）
- **検索エンジン**: PostgreSQL 全文検索（pg_bigm）
- **LLM 統合**: Ollama（既存） + OpenAI GPT-4o API（予定）

### データベース設計方針（ハイブリッド構成）

**PostgreSQL の責務**:

- 法令 XML 本体の保存と管理
- メタデータ（法令番号、施行日等）の管理
- 全文検索インデックス（日本語対応）
- 条文の階層構造の保持
- 基本的な CRUD 操作

**Neo4j の責務**:

- 法令間・条文間の参照関係のグラフ管理
- ハネ改正（波及的改正）の影響分析
- 複雑な参照パターンの高速探索
- グラフビジュアライゼーション用データ提供

この設計により、法令データの特性（イミュータブル、Read-heavy、低更新頻度）を最大限活用し、各 DB の強みを活かした高性能システムを実現します。

## データ構造

プロジェクトには以下が含まれています：

- `/laws_data/` - 政府標準 XML 形式の日本の政府法データを含むディレクトリ
- `/laws_data/all_law_list.csv` - メタデータ付きの全法律のマスターリスト
- 各法律は独自のディレクトリに格納され、XML ファイルは政府標準形式に従います

## 開発の進め方

### 開発環境の起動

```bash
# 1. Next.js開発サーバー起動（メイン開発環境）
npm run dev  # http://localhost:5000

# 2. 必要に応じてデータベース起動
docker-compose up -d  # PostgreSQL
docker-compose -f docker-compose.neo4j.yml up -d  # Neo4j

# 3. LLM APIの確認（Ollama）
./scripts/startup.sh
```

### 参照検出

法令内又は法令間の参照検出は、統合管理スクリプト `scripts/manage-references.ts` で管理されています。
参照関係は web サイトでリンクとして使用されています。参照関係の検出の開発の際には**必ず**、ウェブサイトで検出と表示の効果を確認して、表示上の不整合や、検出できていない箇所がないかを確かめてください。

#### 使用方法

```bash
# 初期登録（データベースが空の場合）
npx tsx scripts/manage-references.ts --init

# 特定法令の更新（差分更新）
npx tsx scripts/manage-references.ts --update 129AC0000000089

# 全法令の再登録（既存データを削除して再構築）
npx tsx scripts/manage-references.ts --rebuild

# 統計情報の表示
npx tsx scripts/manage-references.ts --stats

# 不要データのクリーンアップ
npx tsx scripts/manage-references.ts --cleanup
```

#### 特徴

- **統合管理**: 参照検出の全機能を 1 つのスクリプトで管理
- **差分更新対応**: 法令が更新された場合、特定法令のみを更新可能
- **バッチ処理**: 大量データを効率的に処理
- **統計機能**: 参照データの分析・可視化
- **自動クリーンアップ**: 重複データや異常データの自動削除

#### 参照検出エンジン

`src/domain/services/ImprovedReferenceDetector.ts` が中核となる検出エンジンです。
以下の参照タイプを検出：

- **internal**: 同一法令内の参照
- **external**: 他法令への参照
- **relative**: 相対参照（前条、次項など）
- **structural**: 構造参照（章、節への参照）
- **range**: 範囲参照（第 1 条から第 3 条まで）
- **multiple**: 複数参照（第 1 条及び第 2 条）
- **application**: 準用・適用

### ディレクトリ構造

- `/app/` - Next.js App Router のページとコンポーネント
- `/src/` - ドメイン駆動設計に基づくビジネスロジック
- `/prisma/` - Prisma スキーマとマイグレーション
- `/scripts/` - ユーティリティスクリプト
- `/dist/static/` - 静的サイト生成物（Phase 1 のレガシー）

### Phase 2 の開発タスク

1. **API 層の実装**

   - Next.js API Routes 実装（/app/api/）
   - 既存の参照検出エンジンを API として公開
   - PostgreSQL/Prisma のスキーマ定義とマイグレーション
   - Neo4j 統合とグラフクエリ実装

2. **フロントエンド実装**

   - Next.js App Router（/app/）でのページ実装
   - 既存の静的 HTML を React コンポーネント化
   - サーバーコンポーネントとクライアントコンポーネントの適切な使い分け
   - 状態管理（必要に応じて Zustand）

3. **高度な機能実装**
   - 改正影響分析エンジン
   - OpenAI GPT-4o 統合
   - リアルタイム更新機能（WebSocket）

## 重要な考慮事項

- すべての文書は日本語です - 全体を通じて日本語サポートを維持してください
- XML ファイルは特定の政府標準形式に従っており、これを保持する必要があります
- 相互参照検出には、パターンマッチングと AI 支援検証の両方が必要です
- システムは複雑な法的用語と参照を正確に処理する必要があります
