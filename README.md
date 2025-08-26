# LawFinder - 日本法令検索・法改正支援システム

LawFinder は、日本政府が公開する法令標準 XML データを活用し、法令間の参照関係を自動抽出・管理することで、法改正時の影響分析を効率化するシステムです。

## 🚀 特徴

- **法令間の参照関係の可視化**: 複雑な法令間の相互参照を自動検出
- **AI 支援による高精度な参照解析**: ローカル LLM を活用した参照関係の解決
- **改正影響（ハネ改正）の自動検出**: 法改正による影響範囲を自動分析
- **段階的なアプローチ**: Phase 1 で静的サイト、Phase 2 で動的システムを構築

## 📋 要件

### Phase 1（現在実装中）

- Node.js 18 以上
- npm または yarn
- TypeScript 5.3 以上
- Ollama（オプション - LLM 解析を使用する場合）

### Phase 2（計画中）

- PostgreSQL、Neo4j、Elasticsearch、Redis
- 認証システム、API サーバー

## 🛠️ インストール

```bash
# リポジトリのクローン
git clone https://github.com/your-org/lawfinder.git
cd lawfinder

# 依存関係のインストール
npm install
```

## 🏗️ アーキテクチャ

### Phase 1 の技術スタック

- **フロントエンド**: Next.js 15 + React 19 + TypeScript
- **スタイリング**: Tailwind CSS
- **静的サイト生成**: カスタム Node.js スクリプト
- **LLM 統合**: Ollama (Mistral)

### Phase 2 で追加予定

- **バックエンド**: Express.js + TypeScript
- **データベース**: PostgreSQL (Prisma) + Neo4j
- **検索エンジン**: Elasticsearch
- **キャッシュ**: Redis

## 🚦 クイックスタート（Phase 1）

### 1. ビルド

```bash
npm run build
```

### 2. 静的サイトの生成

```bash
npm run build:static
```

### 3. 開発サーバーの起動

```bash
npm run serve
# または一括実行
npm run dev:static
```

ブラウザで http://localhost:8080 を開いてください。

## 📁 プロジェクト構造

```
LawFinder/
├── src/                      # ソースコード
│   ├── domain/              # ドメインモデル（DDD）
│   │   ├── models/          # エンティティ
│   │   ├── repositories/    # リポジトリインターフェース
│   │   ├── services/        # ドメインサービス
│   │   └── value-objects/   # 値オブジェクト
│   ├── infrastructure/      # インフラストラクチャ層
│   │   ├── persistence/     # データソース実装
│   │   └── external/        # 外部サービス連携
│   └── shared/              # 共通コード
├── scripts/                 # ビルド・ユーティリティスクリプト
├── laws_data/              # 法令XMLデータ
│   └── sample/             # サンプルデータ
└── dist/                   # ビルド成果物
    ├── static/             # 静的サイト出力
    └── *.js                # コンパイル済みJavaScript
```

## 🔧 スクリプト

| コマンド               | 説明                                   |
| ---------------------- | -------------------------------------- |
| `npm run build`        | TypeScript のコンパイル                |
| `npm run build:static` | 静的サイトの生成                       |
| `npm run serve`        | 開発サーバーの起動                     |
| `npm run dev:static`   | ビルド → 静的サイト生成 → サーバー起動 |
| `npm run test`         | テストの実行                           |
| `npm run lint`         | ESLint によるコード検査                |
| `npm run typecheck`    | TypeScript の型チェック                |

## 📊 データ形式

### 入力：政府標準法令 XML

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Law Era="Meiji" Year="29" Type="Act" Num="89">
  <LawNum>明治二十九年法律第八十九号</LawNum>
  <LawTitle Kana="みんぽう">民法</LawTitle>
  <LawBody>
    <MainProvision>
      <Article Num="1">
        <ArticleCaption>（基本原則）</ArticleCaption>
        <Paragraph Num="1">
          <ParagraphSentence>
            <Sentence>私権は、公共の福祉に適合しなければならない。</Sentence>
          </ParagraphSentence>
        </Paragraph>
      </Article>
    </MainProvision>
  </LawBody>
</Law>
```

### 出力：静的 HTML（Phase 1）

各法令が個別の HTML ファイルとして生成され、条文間の参照が自動的にリンク化されます。
