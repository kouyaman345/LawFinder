# Neo4j 参照グラフデータベース設計書

## 1. 概要

e-Govスクレイピングデータとローカルのlaws_data XMLファイルを統合し、完全な法令参照グラフを構築します。

## 2. ノード設計

### 2.1 Law (法令)ノード

```cypher
(:Law {
  // 必須属性
  lawId: String,           // 法令ID (例: "129AC0000000089")
  lawNumber: String,       // 法令番号 (例: "明治二十九年法律第八十九号")
  lawTitle: String,        // 法令名 (例: "民法")
  
  // XMLから取得する属性
  promulgationDate: Date,  // 公布日
  enforcementDate: Date,   // 施行日
  lawType: String,         // 法令種別 (法律/政令/省令等)
  era: String,             // 元号
  year: Integer,           // 年
  num: Integer,            // 番号
  
  // データソース情報
  xmlPath: String,         // XMLファイルパス
  hasXml: Boolean,         // XMLファイル存在フラグ
  source: String,          // データソース ("egov" | "xml" | "xml-llm" | "detector" | "manual" | "both")
  
  // メタデータ
  totalArticles: Integer,  // 総条文数
  totalReferences: Integer,// 総参照数
  created: DateTime,       // 作成日時
  updated: DateTime        // 更新日時
})
```

### 2.2 Article (条文)ノード

```cypher
(:Article {
  // 必須属性
  lawId: String,           // 所属法令ID
  articleNumber: String,   // 条文番号 (例: "1", "2-2", "3の2")
  
  // XMLから取得する属性
  articleTitle: String,    // 条文見出し (例: "（基本原則）")
  articleCaption: String,  // 条文タイトル (例: "第一条")
  
  // 階層情報
  partNumber: String,      // 編番号
  chapterNumber: String,   // 章番号
  sectionNumber: String,   // 節番号
  subsectionNumber: String,// 款番号
  
  // コンテンツ
  content: String,         // 条文本文（テキスト）
  
  // 位置情報
  xmlLineNumber: Integer,  // XMLファイル内の行番号
  xmlPath: String,         // XPath
  
  // メタデータ
  paragraphCount: Integer, // 項数
  itemCount: Integer,      // 号数
  source: String,          // データソース
  created: DateTime,       // 作成日時
})
```

### 2.3 Paragraph (項)ノード（オプション）

```cypher
(:Paragraph {
  lawId: String,
  articleNumber: String,
  paragraphNumber: String,  // 項番号 (例: "1", "2")
  content: String,          // 項本文
  source: String
})
```

### 2.4 Item (号)ノード（オプション）

```cypher
(:Item {
  lawId: String,
  articleNumber: String,
  paragraphNumber: String,
  itemNumber: String,       // 号番号 (例: "1", "2", "イ", "ロ")
  content: String,          // 号本文
  source: String
})
```

## 3. リレーションシップ設計

### 3.1 REFERENCES (参照)

```cypher
()-[:REFERENCES {
  // 参照情報
  text: String,            // 参照テキスト (例: "第九十条", "前項", "民法第一条")
  type: String,            // 参照タイプ ("internal" | "external" | "relative")
  
  // 位置情報（e-Govから）
  sourceArticle: String,   // 参照元条文番号
  sourceParagraph: String, // 参照元項番号
  sourceItem: String,      // 参照元号番号
  
  targetArticle: String,   // 参照先条文番号
  targetParagraph: String, // 参照先項番号
  targetItem: String,      // 参照先号番号
  
  // メタデータ
  source: String,          // データソース ("egov" | "xml" | "xml-llm" | "detector" | "manual")
  confidence: Float,       // 信頼度 (0.0-1.0)
  created: DateTime,       // 作成日時
  
  // デバッグ情報
  extractionMethod: String,// 抽出方法
  originalUrl: String      // e-GovのURL（ある場合）
}]->()
```

### 3.2 CONTAINS (包含)

```cypher
(Law)-[:CONTAINS]->(Article)
(Article)-[:CONTAINS]->(Paragraph)
(Paragraph)-[:CONTAINS]->(Item)
```

### 3.3 NEXT/PREV (順序)

```cypher
(Article)-[:NEXT]->(Article)  // 次の条文
(Article)-[:PREV]->(Article)  // 前の条文
```

## 4. インデックス設計

```cypher
// ユニーク制約
CREATE CONSTRAINT law_id_unique ON (l:Law) ASSERT l.lawId IS UNIQUE;
CREATE CONSTRAINT article_id_unique ON (a:Article) ASSERT (a.lawId, a.articleNumber) IS NODE KEY;

// インデックス
CREATE INDEX law_title ON :Law(lawTitle);
CREATE INDEX law_number ON :Law(lawNumber);
CREATE INDEX article_content ON :Article(content);
CREATE INDEX reference_type ON ()-[:REFERENCES]->() (type);
CREATE INDEX reference_source ON ()-[:REFERENCES]->() (source);
```

## 5. データ統合フロー

### Phase 1: XMLデータの読み込み
1. laws_dataディレクトリをスキャン
2. 法令IDとXMLファイルのマッピング作成
3. XMLをパースして法令・条文ノードを作成
4. 階層構造（CONTAINS）を構築

### Phase 2: e-Gov参照データの統合
1. e-Govスクレイピング結果を読み込み
2. 法令IDでマッチング
3. 参照関係（REFERENCES）を作成
4. ソース属性を "egov" に設定

### Phase 3: 独自検出データの追加
1. detector.tsの検出結果を読み込み
2. 既存の参照と重複チェック
3. 新規参照のみ追加
4. confidence値を設定

### Phase 4: データ検証
1. 孤立ノードのチェック
2. 循環参照の検出
3. 統計情報の生成

## 6. クエリ例

### 6.1 法令の参照関係を取得
```cypher
MATCH (source:Law {lawId: "129AC0000000089"})-[r:REFERENCES]->(target:Law)
RETURN source.lawTitle, type(r), target.lawTitle, r.type, count(r) as refs
ORDER BY refs DESC
```

### 6.2 特定条文の参照先
```cypher
MATCH (a:Article {lawId: "129AC0000000089", articleNumber: "90"})-[r:REFERENCES]->(target)
RETURN a.articleCaption, r.text, labels(target), target.lawId, target.articleNumber
```

### 6.3 最も参照される条文TOP10
```cypher
MATCH (a:Article)<-[r:REFERENCES]-(source)
WHERE r.source = 'egov'
RETURN a.lawId, a.articleNumber, a.articleTitle, count(r) as refs
ORDER BY refs DESC
LIMIT 10
```

### 6.4 参照チェーン（2ホップ）
```cypher
MATCH path = (start:Article)-[:REFERENCES*1..2]->(end:Article)
WHERE start.lawId = "129AC0000000089" AND start.articleNumber = "1"
RETURN path
```

## 7. データ品質指標

- **カバレッジ**: XMLファイルが存在する法令の割合
- **完全性**: 条文データが揃っている法令の割合
- **整合性**: e-GovデータとXMLデータが一致する割合
- **信頼度**: 参照関係の平均confidence値

## 8. 実装上の注意点

1. **大規模データ対応**: 8,000法令 × 平均200条文 = 160万ノード
2. **トランザクション管理**: バッチ処理で1000件ずつコミット
3. **メモリ管理**: ヒープサイズを適切に設定（最低4GB推奨）
4. **重複防止**: MERGE文を使用してユニーク性を保証
5. **エラーハンドリング**: 個別エラーでも処理継続