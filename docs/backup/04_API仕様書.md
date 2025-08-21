# 04_API仕様書

**作成日**: 2025年8月21日  
**対象プロジェクト**: LawFinder  
**ベースURL**: `http://localhost:3000/api`  
**バージョン**: v2.0  

## 1. API概要

### 1.1 設計方針

LawFinder APIは、Next.js API Routesを使用したRESTful APIとして設計されています。

**特徴:**
- Next.js App Routerベースの統合API
- TypeScript完全対応
- Prisma ORMによるタイプセーフなデータアクセス
- Neo4jとのハイブリッド構成
- JWT認証による認可制御
- OpenAPI 3.0準拠の仕様

### 1.2 認証方式

```typescript
// JWT認証
Authorization: Bearer <jwt_token>

// APIキー認証（将来実装）
X-API-Key: <api_key>
```

### 1.3 レスポンス形式

**成功レスポンス:**
```json
{
  "success": true,
  "data": {},
  "meta": {
    "timestamp": "2025-08-21T10:00:00Z",
    "version": "2.0.0"
  }
}
```

**エラーレスポンス:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "law_id",
        "message": "Required field is missing"
      }
    ]
  }
}
```

## 2. エンドポイント一覧

### 2.1 法令関連API

#### GET /api/laws
法令一覧の取得

**クエリパラメータ:**
```typescript
interface LawListQuery {
  page?: number;          // ページ番号（デフォルト: 1）
  limit?: number;         // 1ページあたりの件数（最大: 100）
  law_type?: string;      // 法令種別フィルター
  status?: string;        // 状態フィルター（active/repealed）
  search?: string;        // 検索キーワード
  sort?: string;          // ソート条件
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": [
    {
      "id": "129AC0000000089",
      "title": "民法",
      "lawNumber": "明治二十九年法律第八十九号",
      "lawType": "Act",
      "status": "active",
      "promulgationDate": "1896-04-27",
      "effectiveDate": "1896-04-27",
      "lastUpdated": "2023-06-14",
      "_count": {
        "articles": 1050
      }
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 8520,
      "totalPages": 426
    }
  }
}
```

#### GET /api/laws/[id]
特定法令の詳細取得

**パスパラメータ:**
- `id`: 法令ID（例: 129AC0000000089）

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "id": "129AC0000000089",
    "title": "民法",
    "lawNumber": "明治二十九年法律第八十九号",
    "lawType": "Act",
    "status": "active",
    "promulgationDate": "1896-04-27",
    "effectiveDate": "1896-04-27",
    "content": {
      "enactStatement": "...",
      "structure": {
        "parts": [
          {
            "name": "第一編　総則",
            "chapters": [...]
          }
        ]
      }
    },
    "articles": [
      {
        "id": "uuid-xxx",
        "articleNumber": "1",
        "articleTitle": "（基本原則）",
        "content": "私権は、公共の福祉に適合しなければならない。",
        "paragraphs": [...]
      }
    ],
    "metadata": {
      "totalArticles": 1050,
      "lastModified": "2023-06-14T00:00:00Z"
    }
  }
}
```

### 2.2 条文関連API

#### GET /api/articles/[id]
特定条文の詳細取得

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-xxx",
    "law": {
      "id": "129AC0000000089",
      "title": "民法"
    },
    "articleNumber": "90",
    "articleTitle": "（公序良俗）",
    "content": "公の秩序又は善良の風俗に反する法律行為は、無効とする。",
    "paragraphs": [
      {
        "id": "uuid-yyy",
        "paragraphNumber": 1,
        "content": "公の秩序又は善良の風俗に反する法律行為は、無効とする。",
        "items": []
      }
    ]
  }
}
```

### 2.3 参照関係API

#### GET /api/references
参照関係の取得

**クエリパラメータ:**
```typescript
interface ReferenceQuery {
  lawId?: string;         // 法令IDで絞り込み
  articleId?: string;     // 条文IDで絞り込み
  type?: string;          // 参照タイプで絞り込み
  direction?: 'from' | 'to' | 'both'; // 参照方向
  depth?: number;         // 参照深度（最大: 5）
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-ref-1",
      "sourceArticle": {
        "id": "uuid-art-1",
        "articleNumber": "94",
        "law": {
          "id": "129AC0000000089",
          "title": "民法"
        }
      },
      "targetArticle": {
        "id": "uuid-art-2",
        "articleNumber": "90",
        "law": {
          "id": "129AC0000000089",
          "title": "民法"
        }
      },
      "referenceText": "第九十条",
      "referenceType": "internal",
      "confidence": 0.95,
      "metadata": {
        "detectionMethod": "pattern",
        "verifiedBy": "ai",
        "detectedAt": "2025-08-21T10:00:00Z"
      }
    }
  ]
}
```

#### GET /api/references/graph/[articleId]
特定条文の参照グラフデータ取得

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "nodes": [
      {
        "id": "uuid-art-1",
        "label": "民法第90条",
        "type": "article",
        "properties": {
          "articleNumber": "90",
          "title": "（公序良俗）",
          "lawTitle": "民法"
        }
      }
    ],
    "edges": [
      {
        "id": "uuid-ref-1",
        "source": "uuid-art-1",
        "target": "uuid-art-2",
        "type": "REFERS_TO",
        "properties": {
          "referenceType": "internal",
          "confidence": 0.95,
          "weight": 1.0
        }
      }
    ],
    "metadata": {
      "nodeCount": 25,
      "edgeCount": 32,
      "maxDepth": 3
    }
  }
}
```

### 2.4 検索API

#### POST /api/search
全文検索

**リクエストボディ:**
```typescript
interface SearchRequest {
  query: string;
  filters?: {
    lawTypes?: string[];
    dateRange?: {
      from: string;
      to: string;
    };
    status?: string[];
  };
  options?: {
    highlight: boolean;
    fuzzy: boolean;
    limit: number;
    offset: number;
  };
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "type": "law",
        "law": {
          "id": "129AC0000000089",
          "title": "民法",
          "snippet": "私権は、公共の福祉に適合しなければならない。"
        },
        "score": 0.95,
        "highlights": [
          "私権は、<mark>公共の福祉</mark>に適合しなければならない。"
        ]
      }
    ],
    "aggregations": {
      "lawTypes": {
        "Act": 1520,
        "CabinetOrder": 380
      }
    },
    "metadata": {
      "total": 1520,
      "took": 45,
      "maxScore": 0.95
    }
  }
}
```

### 2.5 分析API

#### POST /api/analysis/impact
改正影響分析（ハネ改正分析）

**リクエストボディ:**
```typescript
interface ImpactAnalysisRequest {
  sourceLawId: string;
  targetArticleIds: string[];
  analysisDepth: number;      // 1-5
  includeIndirect: boolean;
  confidenceThreshold: number; // 0.0-1.0
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalAffectedLaws": 23,
      "totalAffectedArticles": 156,
      "directImpacts": 45,
      "indirectImpacts": 111,
      "analysisDepth": 3,
      "executionTime": 1250
    },
    "affectedLaws": [
      {
        "lawId": "132AC0000000048",
        "lawTitle": "商法",
        "articles": [
          {
            "articleId": "uuid-xxx",
            "articleNumber": "5",
            "impactType": "direct",
            "impactPath": ["民法第90条"],
            "confidenceScore": 0.89,
            "referenceText": "民法第九十条"
          }
        ],
        "impactLevel": "high"
      }
    ],
    "visualizationData": {
      "nodes": [...],
      "edges": [...],
      "layout": "hierarchical"
    }
  }
}
```

#### POST /api/analysis/centrality
中心性分析

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "centralityMeasures": [
      {
        "articleId": "uuid-xxx",
        "law": "民法",
        "articleNumber": "90",
        "title": "（公序良俗）",
        "inDegree": 245,
        "outDegree": 12,
        "betweennessCentrality": 0.45,
        "pageRank": 0.032,
        "eigenvectorCentrality": 0.089
      }
    ],
    "metadata": {
      "totalNodes": 50000,
      "totalEdges": 120000,
      "algorithmTime": 2300
    }
  }
}
```

### 2.6 AI支援API

#### POST /api/ai/analyze-reference
AI参照解析

**リクエストボディ:**
```typescript
interface AIAnalysisRequest {
  sourceText: string;
  context?: {
    lawId: string;
    articleId: string;
    surroundingText: string;
  };
  options?: {
    model: 'local' | 'gpt4';
    confidence_threshold: number;
  };
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "detectedReferences": [
      {
        "text": "第九十条",
        "targetLaw": "民法",
        "targetArticle": "90",
        "referenceType": "internal",
        "confidence": 0.92,
        "reasoning": "明確な条文番号の記載があり、同一法令内の参照として確信度が高い",
        "suggestions": []
      }
    ],
    "metadata": {
      "model": "llama-3-elyza-jp-8b",
      "processingTime": 250,
      "tokenCount": {
        "input": 120,
        "output": 45
      }
    }
  }
}
```

### 2.7 ユーザー管理API

#### POST /api/auth/login
ログイン

**リクエストボディ:**
```typescript
interface LoginRequest {
  email: string;
  password: string;
}
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid-user-1",
      "email": "user@example.com",
      "name": "田中太郎",
      "organization": "内閣法制局",
      "role": "editor"
    },
    "tokens": {
      "accessToken": "eyJ...",
      "refreshToken": "eyJ...",
      "expiresIn": 3600
    }
  }
}
```

#### GET /api/auth/me
現在のユーザー情報取得

**ヘッダー:**
```
Authorization: Bearer <access_token>
```

**レスポンス:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-user-1",
    "email": "user@example.com",
    "name": "田中太郎",
    "organization": "内閣法制局",
    "role": "editor",
    "permissions": [
      "law:read",
      "law:write",
      "reference:validate"
    ],
    "lastLoginAt": "2025-08-21T09:00:00Z"
  }
}
```

## 3. データモデル

### 3.1 基本エンティティ

#### Law（法令）
```typescript
interface Law {
  id: string;                    // 法令ID
  title: string;                 // 法令名
  lawNumber: string;             // 法令番号
  lawType: LawType;              // 法令種別
  status: LawStatus;             // 状態
  promulgationDate: Date;        // 公布日
  effectiveDate?: Date;          // 施行日
  repealDate?: Date;             // 廃止日
  content: LawContent;           // 法令本体
  metadata: LawMetadata;         // メタデータ
}

enum LawType {
  Act = 'Act',
  CabinetOrder = 'CabinetOrder',
  MinisterialOrdinance = 'MinisterialOrdinance',
  Rule = 'Rule'
}

enum LawStatus {
  Active = 'active',
  Repealed = 'repealed',
  NotYetEnforced = 'not_yet_enforced'
}
```

#### Article（条文）
```typescript
interface Article {
  id: string;                    // 条文ID（UUID）
  lawId: string;                 // 所属法令ID
  articleNumber: string;         // 条番号
  articleTitle?: string;         // 条見出し
  content: string;               // 条文内容
  paragraphs: Paragraph[];       // 項リスト
  structure: ArticleStructure;   // 構造情報
}
```

#### Reference（参照関係）
```typescript
interface Reference {
  id: string;                    // 参照ID
  sourceArticleId: string;       // 参照元条文ID
  targetArticleId?: string;      // 参照先条文ID
  targetLawId?: string;          // 参照先法令ID
  referenceText: string;         // 参照テキスト
  referenceType: ReferenceType;  // 参照タイプ
  confidence: number;            // 信頼度スコア
  metadata: ReferenceMetadata;   // メタデータ
}

enum ReferenceType {
  Internal = 'internal',         // 内部参照
  External = 'external',         // 外部参照
  Relative = 'relative',         // 相対参照
  Complex = 'complex'            // 複合参照
}
```

### 3.2 検索・分析用データモデル

#### SearchResult（検索結果）
```typescript
interface SearchResult {
  type: 'law' | 'article' | 'paragraph';
  score: number;
  highlights: string[];
  law?: Law;
  article?: Article;
  paragraph?: Paragraph;
}
```

#### ImpactAnalysisResult（影響分析結果）
```typescript
interface ImpactAnalysisResult {
  summary: {
    totalAffectedLaws: number;
    totalAffectedArticles: number;
    directImpacts: number;
    indirectImpacts: number;
    analysisDepth: number;
    executionTime: number;
  };
  affectedLaws: AffectedLaw[];
  visualizationData: GraphData;
}
```

## 4. エラーハンドリング

### 4.1 エラーコード一覧

| コード | HTTPステータス | 説明 |
|-------|---------------|------|
| VALIDATION_ERROR | 400 | リクエストパラメータ検証エラー |
| UNAUTHORIZED | 401 | 認証エラー |
| FORBIDDEN | 403 | 認可エラー |
| NOT_FOUND | 404 | リソースが見つからない |
| CONFLICT | 409 | データ競合エラー |
| RATE_LIMIT_EXCEEDED | 429 | レート制限エラー |
| INTERNAL_ERROR | 500 | 内部サーバーエラー |
| DATABASE_ERROR | 500 | データベース接続エラー |
| AI_SERVICE_ERROR | 503 | AI サービス接続エラー |

### 4.2 エラーレスポンス例

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      {
        "field": "law_id",
        "message": "Law ID must be a valid format",
        "code": "INVALID_FORMAT"
      }
    ],
    "timestamp": "2025-08-21T10:00:00Z",
    "requestId": "req_123456789"
  }
}
```

## 5. 認証・認可

### 5.1 JWTトークン構造

```typescript
interface JWTPayload {
  sub: string;          // ユーザーID
  email: string;        // メールアドレス
  role: UserRole;       // ユーザーロール
  org: string;          // 組織
  permissions: string[]; // 権限リスト
  iat: number;          // 発行時刻
  exp: number;          // 有効期限
}
```

### 5.2 権限モデル

| ロール | 権限 | 説明 |
|--------|------|------|
| admin | すべて | システム管理者 |
| editor | law:read, law:write, reference:validate | 編集者 |
| viewer | law:read | 閲覧者 |

## 6. レート制限

### 6.1 制限ルール

| エンドポイント | 制限 | ウィンドウ |
|---------------|------|-----------|
| GET /api/laws | 100 req/min | ユーザー単位 |
| POST /api/search | 50 req/min | ユーザー単位 |
| POST /api/analysis/* | 20 req/min | ユーザー単位 |
| POST /api/ai/* | 10 req/min | ユーザー単位 |

### 6.2 レート制限ヘッダー

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1629123456
```

## 7. キャッシュ戦略

### 7.1 キャッシュポリシー

| リソース | キャッシュ期間 | 戦略 |
|---------|---------------|------|
| 法令データ | 24時間 | Redis + CDN |
| 参照関係 | 12時間 | Redis |
| 検索結果 | 1時間 | Redis |
| 分析結果 | 6時間 | Redis |

### 7.2 キャッシュヘッダー

```
Cache-Control: public, max-age=86400
ETag: "W/abc123"
Last-Modified: Tue, 21 Aug 2025 10:00:00 GMT
```

## 8. バージョニング

### 8.1 バージョン戦略

- **メジャーバージョン**: 破壊的変更
- **マイナーバージョン**: 新機能追加
- **パッチバージョン**: バグ修正

### 8.2 下位互換性

- v1.x のサポートは v2.0 リリース後1年間
- 非推奨APIは3ヶ月前に予告

## 9. 開発者向けツール

### 9.1 SDK/クライアントライブラリ

```typescript
// TypeScript/JavaScript SDK
import { LawFinderClient } from '@lawfinder/sdk';

const client = new LawFinderClient({
  baseURL: 'https://api.lawfinder.jp',
  apiKey: 'your-api-key'
});

const law = await client.laws.get('129AC0000000089');
const references = await client.references.getByArticle('article-id');
```

### 9.2 OpenAPI仕様書

```yaml
openapi: 3.0.0
info:
  title: LawFinder API
  version: 2.0.0
  description: 法令検索・参照分析API
servers:
  - url: https://api.lawfinder.jp/v2
    description: Production server
paths:
  /laws:
    get:
      summary: 法令一覧取得
      parameters:
        - name: page
          in: query
          schema:
            type: integer
            minimum: 1
            default: 1
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/LawListResponse'
```

## 10. テスト

### 10.1 API テスト例

```typescript
describe('GET /api/laws', () => {
  it('should return law list with pagination', async () => {
    const response = await request(app)
      .get('/api/laws')
      .query({ page: 1, limit: 10 })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(10);
    expect(response.body.meta.pagination.total).toBeGreaterThan(0);
  });
  
  it('should handle search query', async () => {
    const response = await request(app)
      .get('/api/laws')
      .query({ search: '民法' })
      .expect(200);
    
    expect(response.body.data[0].title).toContain('民法');
  });
});
```

---

**改訂履歴**

| バージョン | 日付 | 変更内容 |
|----------|------|----------|
| 2.0 | 2025-08-21 | 初版作成（API仕様書v2、実装ガイドを統合） |