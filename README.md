# LawFinder - 日本法令検索・法改正支援システム

LawFinderは、日本政府が公開する法令標準XMLデータを活用し、法令間の参照関係を自動抽出・管理することで、法改正時の影響分析を効率化するシステムです。

## 🚀 特徴

- **法令間の参照関係の可視化**: 複雑な法令間の相互参照を自動検出
- **AI支援による高精度な参照解析**: ローカルLLMを活用した参照関係の解決
- **改正影響（ハネ改正）の自動検出**: 法改正による影響範囲を自動分析
- **段階的なアプローチ**: Phase 1で静的サイト、Phase 2で動的システムを構築

## 📋 要件

- Node.js 18以上
- npm または yarn
- （Phase 2以降）PostgreSQL、Neo4j、Elasticsearch、Redis

## 🛠️ インストール

```bash
# リポジトリのクローン
git clone https://github.com/your-org/lawfinder.git
cd lawfinder

# 依存関係のインストール
npm install
```

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

| コマンド | 説明 |
|---------|------|
| `npm run build` | TypeScriptのコンパイル |
| `npm run build:static` | 静的サイトの生成 |
| `npm run serve` | 開発サーバーの起動 |
| `npm run dev:static` | ビルド→静的サイト生成→サーバー起動 |
| `npm run test` | テストの実行 |
| `npm run lint` | ESLintによるコード検査 |
| `npm run typecheck` | TypeScriptの型チェック |

## 📊 データ形式

### 入力：政府標準法令XML

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

### 出力：静的HTML（Phase 1）

各法令が個別のHTMLファイルとして生成され、条文間の参照が自動的にリンク化されます。

## 🗺️ ロードマップ

### Phase 1（完了）✅
- [x] XMLパーサーの実装
- [x] 参照関係抽出エンジン
- [x] 静的サイト生成
- [x] 基本的な参照リンク生成

### Phase 2（計画中）
- [ ] Express.js APIサーバー
- [ ] PostgreSQL/Neo4j/Elasticsearchの統合
- [ ] リアルタイム法令更新
- [ ] 高度な影響分析機能
- [ ] 管理画面の実装

## 🤝 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを作成して変更内容を議論してください。

## 📄 ライセンス

MIT License

## 🙏 謝辞

- 日本政府e-Gov法令データベース
- Llama-3-ELYZA-JP-8Bモデル
