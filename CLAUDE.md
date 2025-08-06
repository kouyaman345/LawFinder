# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリのコードを扱う際のガイダンスを提供します。

## プロジェクト概要

LawFinder は、政府が公開する法的標準 XML ファイルを処理する日本の法文書検索・法改正支援アプリケーションです。システムは法的構造の可視化、法律間の相互参照の検出、改正影響（「はね改正」）の分析を目的としています。

## プロジェクト状況（2025年8月6日更新）

**Phase 1（静的サイト生成）が完了し、Phase 2（React/Next.js実装）が進行中です。**

### 現在の開発環境
- **フロントエンド開発**: React + Next.js 15
- **開発サーバー**: `npm run dev` (http://localhost:3000)
- **静的サイト（参考用）**: `npm run serve` (http://localhost:8080 or 8081)

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
- ✅ 政府標準XML形式の完全な解析
- ✅ 複雑な参照パターンの検出（同項第二号、前項第一号など）
- ✅ e-Gov風の洗練されたUI
- ✅ インタラクティブな参照ナビゲーション
- ✅ ローカルLLM統合（Ollama/Mistral）
- ✅ 階層目次の完全再現（編・章・節・条・項・号）

### 技術スタック（実装済み）
- **静的サイト生成**: Node.js カスタムスクリプト
- **XMLパーサー**: 正規表現ベースのカスタムパーサー
- **スタイル**: e-Gov準拠のカスタムCSS
- **LLM統合**: Ollama REST API（Mistralモデル）
- **アーキテクチャ**: ドメイン駆動設計（DDD）

### Phase 2技術スタック（実装中）
- **フロントエンド**: React + Next.js 15（App Router）
- **バックエンド**: Next.js API Routes（TypeScript）
- **データベース**: ハイブリッド構成
  - **PostgreSQL + Prisma ORM**: 法令本体データ、メタデータ、全文検索
  - **Neo4j**: 参照関係グラフ、ハネ改正分析専用
- **キャッシュ**: Redis（予定）
- **検索エンジン**: PostgreSQL全文検索（pg_bigm）
- **LLM統合**: Ollama（既存） + OpenAI GPT-4o API（予定）

### データベース設計方針（ハイブリッド構成）

**PostgreSQLの責務**:
- 法令XML本体の保存と管理
- メタデータ（法令番号、施行日等）の管理
- 全文検索インデックス（日本語対応）
- 条文の階層構造の保持
- 基本的なCRUD操作

**Neo4jの責務**:
- 法令間・条文間の参照関係のグラフ管理
- ハネ改正（波及的改正）の影響分析
- 複雑な参照パターンの高速探索
- グラフビジュアライゼーション用データ提供

この設計により、法令データの特性（イミュータブル、Read-heavy、低更新頻度）を最大限活用し、各DBの強みを活かした高性能システムを実現します。

## データ構造

プロジェクトには以下が含まれています：

- `/laws_data/` - 政府標準 XML 形式の日本の政府法データを含むディレクトリ
- `/laws_data/all_law_list.csv` - メタデータ付きの全法律のマスターリスト
- 各法律は独自のディレクトリに格納され、XML ファイルは政府標準形式に従います

## 開発の進め方

### 開発環境の起動

```bash
# 1. Next.js開発サーバー起動（メイン開発環境）
npm run dev  # http://localhost:3000

# 2. 必要に応じてデータベース起動
docker-compose up -d  # PostgreSQL
docker-compose -f docker-compose.neo4j.yml up -d  # Neo4j

# 3. LLM APIの確認（Ollama）
./scripts/startup.sh
```

### ディレクトリ構造
- `/app/` - Next.js App Routerのページとコンポーネント
- `/src/` - ドメイン駆動設計に基づくビジネスロジック
- `/prisma/` - Prismaスキーマとマイグレーション
- `/scripts/` - ユーティリティスクリプト
- `/dist/static/` - 静的サイト生成物（Phase 1のレガシー）

### Phase 2の開発タスク

1. **API層の実装**
   - Next.js API Routes実装（/app/api/）
   - 既存の参照検出エンジンをAPIとして公開
   - PostgreSQL/Prismaのスキーマ定義とマイグレーション
   - Neo4j統合とグラフクエリ実装

2. **フロントエンド実装**
   - Next.js App Router（/app/）でのページ実装
   - 既存の静的HTMLをReactコンポーネント化
   - サーバーコンポーネントとクライアントコンポーネントの適切な使い分け
   - 状態管理（必要に応じてZustand）

3. **高度な機能実装**
   - 改正影響分析エンジン
   - OpenAI GPT-4o統合
   - リアルタイム更新機能（WebSocket）

## 重要な考慮事項

- すべての文書は日本語です - 全体を通じて日本語サポートを維持してください
- XML ファイルは特定の政府標準形式に従っており、これを保持する必要があります
- 相互参照検出には、パターンマッチングと AI 支援検証の両方が必要です
- システムは複雑な法的用語と参照を正確に処理する必要があります
