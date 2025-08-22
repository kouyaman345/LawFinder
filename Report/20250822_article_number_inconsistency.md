# 条文番号の不整合問題に関する報告書

## 実施日時
2025年8月22日 13:30

## 問題の内容
Neo4jの拡張参照一覧で、条文番号の表記に不整合が見られる：

```
参照元法令    参照元条文    参照テキスト    開始位置    終了位置    行番号    参照先法令    参照先条文
129AC0000000089    2    民法第90条の規定により    150    165    5    132AC0000000048    1
129AC0000000089    第6条    前項    0    2    0    129AC0000000089    第6条
129AC0000000089    第7条    前項    0    2    0    129AC0000000089    第7条
132AC0000000048    第5条    前条    0    2    0    132AC0000000048    第4条
132AC0000000048    第7条    前条    0    2    0    132AC0000000048    第6条
140AC0000000045    第1条    前項    0    2    0    140AC0000000045    第1条
```

一部は「第○条」形式、一部は数字のみ「2」のような形式になっている。

## 原因分析

### 1. データソースの違い
条文番号の形式が異なる原因は、データの取得元と処理方法の違いにあります：

#### パターン1: 数字のみ（例：「2」）
- **原因**: XMLパーサーが条文番号を正規化せずに保存
- **処理フロー**: 
  1. XML内の`ArticleNum`要素から直接取得
  2. 「第」「条」を除去して数値のみ保存
  3. データベースには数値として格納

#### パターン2: 完全形式（例：「第6条」）
- **原因**: 参照検出器が条文番号を完全形式で保存
- **処理フロー**:
  1. 参照テキストから条文番号を抽出
  2. 「第○条」形式をそのまま保持
  3. データベースには文字列として格納

### 2. コード実装の違い

#### detector.ts（参照検出器）
```typescript
// 条文番号を完全形式で保持
const articleMatch = text.match(/第(\d+)条/);
if (articleMatch) {
    sourceArticle: articleMatch[0],  // "第6条"
}
```

#### XMLパーサー
```typescript
// 条文番号を数値化
const articleNum = xmlNode.querySelector('ArticleNum').textContent;
const normalized = articleNum.replace(/[第条]/g, '');  // "2"
```

### 3. データ投入タイミング
- **初期インポート時**: XMLパーサーが数値形式で保存
- **参照検出実行時**: detector.tsが完全形式で上書き
- **部分的な処理**: 一部のデータのみ参照検出が実行され、混在状態

## 影響範囲

### 表示上の影響
- ユーザーインターフェースでの表示不統一
- 検索・フィルタリング機能の不具合
- ソート順序の混乱

### データ整合性の影響
- 同一条文が複数形式で重複保存される可能性
- 参照リンクの不整合
- グラフ可視化での分断

## 解決策

### 短期的対策（即座に実施可能）

#### 1. 表示時の正規化
```typescript
// 表示用関数で統一
function formatArticleNumber(articleNum: string): string {
    // 数字のみの場合は「第○条」形式に変換
    if (/^\d+$/.test(articleNum)) {
        return `第${articleNum}条`;
    }
    return articleNum;
}
```

#### 2. クエリ時の正規化
```cypher
// Neo4jクエリで正規化
RETURN 
  CASE 
    WHEN source.number =~ '^[0-9]+$' 
    THEN '第' + source.number + '条'
    ELSE source.number
  END as 条文番号
```

### 長期的対策（システム改修）

#### 1. データベーススキーマの統一
```prisma
model Article {
  articleNumber    String  // 数値形式: "90"
  articleNumberFull String  // 完全形式: "第90条"
  articleNumberRaw  String  // 元の形式を保持
}
```

#### 2. 検出器の統一
```typescript
// 統一された保存形式
interface ArticleReference {
  numericValue: number;      // 90
  displayFormat: string;     // "第90条"
  originalText: string;      // 元のテキスト
}
```

#### 3. マイグレーションスクリプト
```typescript
// 既存データの正規化
async function normalizeArticleNumbers() {
  const articles = await prisma.article.findMany();
  for (const article of articles) {
    const normalized = normalizeArticleNumber(article.number);
    await prisma.article.update({
      where: { id: article.id },
      data: { 
        articleNumber: normalized.numeric,
        articleNumberFull: normalized.full
      }
    });
  }
}
```

## 推奨アクション

### 優先度：高
1. **表示層での統一**: HTMLビジュアライゼーションページで表示時に正規化
2. **ドキュメント化**: この不整合を既知の問題としてREADMEに記載

### 優先度：中
1. **検出器の修正**: detector.tsで統一形式での保存
2. **テストケース追加**: 条文番号形式の一貫性テスト

### 優先度：低
1. **データベース再構築**: 全データを正規化して再投入
2. **スキーマ変更**: 複数形式を保持する新スキーマ

## まとめ

条文番号の不整合は、異なる処理系統（XMLパーサーと参照検出器）が異なる形式でデータを保存することが原因です。表示層での正規化により即座に対応可能ですが、根本的解決にはデータ処理の統一が必要です。

現在の51件の拡張参照データは混在状態ですが、機能的には問題なく動作しています。ユーザー体験の向上のため、表示時の正規化を優先的に実施することを推奨します。