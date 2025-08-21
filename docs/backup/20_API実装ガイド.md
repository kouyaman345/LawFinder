# LawFinder API実装ガイド

## 1. 現在の実装状況

### 1.1 Phase 1（完了）- 静的サイト生成
現在、LawFinderは静的サイト生成モードで動作しており、APIサーバーは未実装です。

**実装済み機能**：
- XMLファイルからの法令データ解析
- 参照関係の自動抽出（パターンマッチング + LLM）
- 静的HTMLファイルの生成
- クライアントサイド検索

### 1.2 利用可能なスクリプト

```bash
# 基本的な静的サイト生成
node scripts/build-static-simple.js

# LLMモック版
node scripts/build-static-mock.js

# 実LLM統合版（Ollama/Mistral使用）
node scripts/build-static-llm.js

# PWA対応版
node scripts/build-static-site.js

# 開発用サーバー起動
npm run serve  # http://localhost:8080
```

## 2. Phase 2 API実装計画

### 2.1 技術スタック（予定）

#### バックエンド
- **フレームワーク**: Express.js（既にpackage.jsonに含まれる）
- **言語**: TypeScript
- **データベース**: 
  - PostgreSQL（Prisma ORM）- メタデータ、ユーザー管理
  - Neo4j - 参照関係グラフ
- **キャッシュ**: Redis（既にpackage.jsonに含まれる）
- **認証**: JWT

#### API設計
- RESTful API（OpenAPI 3.0仕様準拠）
- GraphQL（参照関係クエリ用）- 検討中

### 2.2 実装予定のエンドポイント

#### 2.2.1 基本的なCRUD操作

```typescript
// 法令一覧取得
GET /api/v1/laws
Query Parameters:
  - page: number
  - limit: number (max: 100)
  - law_type: string
  - status: string (active|repealed|not_yet_enforced)

// 特定の法令取得
GET /api/v1/laws/:lawId

// 条文取得
GET /api/v1/laws/:lawId/articles/:articleNum

// 参照関係取得
GET /api/v1/laws/:lawId/references
GET /api/v1/articles/:articleId/references
```

#### 2.2.2 検索・分析API

```typescript
// 全文検索
POST /api/v1/search
Body: {
  query: string,
  filters: {
    law_types?: string[],
    date_range?: { from: Date, to: Date },
    status?: string[]
  },
  options: {
    highlight: boolean,
    limit: number,
    offset: number
  }
}

// 改正影響分析
POST /api/v1/analysis/impact
Body: {
  source_law_id: string,
  target_article_nums: number[],
  analysis_depth: number (1-3)
}

// AI支援クエリ
POST /api/v1/ai/query
Body: {
  question: string,
  context?: string,
  law_ids?: string[]
}
```

### 2.3 実装アーキテクチャ

```
src/
├── api/
│   ├── controllers/        # リクエストハンドラー
│   │   ├── LawController.ts
│   │   ├── ArticleController.ts
│   │   ├── ReferenceController.ts
│   │   └── SearchController.ts
│   ├── routes/            # ルート定義
│   │   ├── lawRoutes.ts
│   │   └── index.ts
│   ├── middlewares/       # ミドルウェア
│   │   ├── auth.ts
│   │   ├── rateLimiter.ts
│   │   └── validator.ts
│   └── services/          # ビジネスロジック
│       ├── LawService.ts
│       └── ReferenceService.ts
```

## 3. データモデル（実装ベース）

### 3.1 Law（法令）
```typescript
interface Law {
  lawId: string;           // 例: "129AC0000000089"
  lawTitle: string;        // 例: "民法"
  lawNum: string;          // 例: "明治二十九年法律第八十九号"
  promulgateDate: Date;    // 公布日
  enforceDate: Date;       // 施行日
  lawType: LawType;        // Act|CabinetOrder|MinisterialOrdinance
  status: LawStatus;       // active|repealed|not_yet_enforced
  articles: Article[];     // 条文リスト
  structure: LawStructure; // 編・章・節の階層構造
}
```

### 3.2 Article（条文）
```typescript
interface Article {
  articleId: string;       // 複合キー: lawId + articleNum
  articleNum: string;      // 例: "1", "1_2"（枝番）
  articleTitle?: string;   // 条文見出し
  paragraphs: Paragraph[]; // 項リスト
  captions?: string[];     // 条文キャプション
}
```

### 3.3 Reference（参照関係）
```typescript
interface Reference {
  referenceId: string;
  sourceArticle: string;   // 参照元条文ID
  targetArticle: string;   // 参照先条文ID
  referenceText: string;   // 参照テキスト（例: "第九十六条"）
  referenceType: ReferenceType;
  confidence: number;      // LLM信頼度スコア (0.0-1.0)
  detectionMethod: 'pattern' | 'llm' | 'combined';
}

enum ReferenceType {
  EXTERNAL_REFERENCE = 'EXTERNAL_REFERENCE',    // 他法令参照
  INTERNAL_REFERENCE = 'INTERNAL_REFERENCE',    // 同一法令内参照
  RELATIVE_REFERENCE = 'RELATIVE_REFERENCE',    // 相対参照（前項等）
  COMPLEX_REFERENCE = 'COMPLEX_REFERENCE'       // 複合参照
}
```

## 4. 実装時の注意事項

### 4.1 既存コードの活用
Phase 1で実装された以下のモジュールは、API実装でも再利用可能：

1. **XMLパーサー**: `parseXML()`関数群
2. **参照検出エンジン**: `detectReferences()`, `detectComplexPatterns()`
3. **LLM統合**: `analyzeLawWithLLM()`
4. **データ構造**: ドメインモデル（src/domain/）

### 4.2 パフォーマンス考慮事項

1. **キャッシュ戦略**
   - Redis: 頻繁にアクセスされる法令データ
   - インメモリ: 参照関係グラフ
   - CDN: 静的アセット

2. **データベース最適化**
   - インデックス: lawId, articleNum, referenceType
   - 部分インデックス: status='active'の法令

3. **非同期処理**
   - LLM解析: ジョブキューによるバックグラウンド処理
   - 大量データ: ストリーミングレスポンス

### 4.3 セキュリティ

1. **入力検証**: Joi/Yupによるスキーマ検証
2. **レート制限**: express-rate-limit
3. **CORS設定**: 適切なオリジン制限
4. **SQLインジェクション対策**: Prismaの使用

## 5. 移行パス

### Step 1: API基盤構築（2週間）
- Express.jsサーバー設定
- 基本的なルーティング
- エラーハンドリング
- ロギング設定

### Step 2: データ層実装（3週間）
- Prismaスキーマ定義
- PostgreSQL接続
- 既存XMLデータのインポート
- Neo4j統合

### Step 3: API実装（4週間）
- CRUD操作
- 検索機能
- 参照関係API
- キャッシュ実装

### Step 4: 認証・認可（2週間）
- JWT実装
- ユーザー管理
- アクセス制御

### Step 5: 最適化・テスト（2週間）
- パフォーマンステスト
- セキュリティ監査
- ドキュメント更新

## 6. 開発環境セットアップ

```bash
# データベース起動
docker-compose up -d postgres redis neo4j

# Prismaセットアップ
npx prisma init
npx prisma migrate dev

# APIサーバー起動
npm run dev:api

# テスト実行
npm run test:api
```

## 7. 今後の課題

1. **GraphQL検討**: 複雑な参照関係クエリにはGraphQLが適している可能性
2. **リアルタイム更新**: WebSocketによる法令更新通知
3. **マイクロサービス化**: 将来的な規模拡大に備えた設計
4. **国際化**: 英語版API仕様の検討