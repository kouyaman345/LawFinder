// ========================================
// Neo4j拡張スキーマ - 詳細位置情報対応
// ========================================

// === インデックスとユニーク制約 ===

// 法令ノード
CREATE CONSTRAINT law_id_unique IF NOT EXISTS
ON (l:Law) ASSERT l.id IS UNIQUE;

CREATE INDEX law_name_index IF NOT EXISTS
FOR (l:Law) ON (l.name);

// 条文ノード
CREATE CONSTRAINT article_unique IF NOT EXISTS
ON (a:Article) ASSERT (a.lawId, a.number) IS NODE KEY;

CREATE INDEX article_number_index IF NOT EXISTS
FOR (a:Article) ON (a.number);

// 項ノード
CREATE CONSTRAINT paragraph_unique IF NOT EXISTS
ON (p:Paragraph) ASSERT (p.lawId, p.articleNumber, p.number) IS NODE KEY;

// 号ノード
CREATE CONSTRAINT item_unique IF NOT EXISTS
ON (i:Item) ASSERT (i.lawId, i.articleNumber, i.paragraphNumber, i.number) IS NODE KEY;

// 参照エッジ用インデックス
CREATE INDEX reference_type_index IF NOT EXISTS
FOR ()-[r:REFERENCES]-() ON (r.type);

CREATE INDEX reference_confidence_index IF NOT EXISTS
FOR ()-[r:REFERENCES]-() ON (r.confidence);

// === ノード構造 ===

// 法令ノード
// (:Law {
//   id: '129AC0000000089',
//   name: '民法',
//   abbreviation: '民法',
//   promulgatedDate: '1896-04-27',
//   enforcedDate: '1898-07-16',
//   lastUpdated: '2023-04-01'
// })

// 編ノード（Part）
// (:Part {
//   lawId: '129AC0000000089',
//   number: '第一編',
//   title: '総則'
// })

// 章ノード（Chapter）
// (:Chapter {
//   lawId: '129AC0000000089',
//   partNumber: '第一編',
//   number: '第一章',
//   title: '通則'
// })

// 節ノード（Section）
// (:Section {
//   lawId: '129AC0000000089',
//   chapterNumber: '第一章',
//   number: '第一節',
//   title: '法源'
// })

// 条文ノード（Article）
// (:Article {
//   lawId: '129AC0000000089',
//   number: '第90条',
//   title: '公序良俗',
//   content: '公の秩序又は善良の風俗に反する法律行為は、無効とする。'
// })

// 項ノード（Paragraph）
// (:Paragraph {
//   lawId: '129AC0000000089',
//   articleNumber: '第90条',
//   number: 1,
//   content: '項の内容'
// })

// 号ノード（Item）
// (:Item {
//   lawId: '129AC0000000089',
//   articleNumber: '第90条',
//   paragraphNumber: 1,
//   number: '一',
//   content: '号の内容'
// })

// === 階層関係 ===

// 法令と編
// (law:Law)-[:HAS_PART]->(part:Part)

// 編と章
// (part:Part)-[:HAS_CHAPTER]->(chapter:Chapter)

// 章と節
// (chapter:Chapter)-[:HAS_SECTION]->(section:Section)

// 節と条文
// (section:Section)-[:HAS_ARTICLE]->(article:Article)

// 法令と条文（直接）
// (law:Law)-[:HAS_ARTICLE]->(article:Article)

// 条文と項
// (article:Article)-[:HAS_PARAGRAPH]->(paragraph:Paragraph)

// 項と号
// (paragraph:Paragraph)-[:HAS_ITEM]->(item:Item)

// === 参照関係（拡張版） ===

// 基本的な参照
// (source)-[:REFERENCES {
//   id: 'ref-uuid-1234',
//   type: 'external',
//   confidence: 0.95,
//   detectedAt: datetime(),
//   detectionMethod: 'pattern',
//   
//   // 参照元の詳細位置
//   sourceText: '民法第90条の規定により',
//   sourceStartPos: 1234,
//   sourceEndPos: 1250,
//   sourceLineNumber: 45,
//   sourceContext: '...前後の文脈...',
//   
//   // 参照先の詳細
//   targetSpecific: '第90条',
//   targetParagraph: null,
//   targetItem: null
// }]->(target)

// 範囲参照
// (source)-[:REFERENCES_RANGE {
//   id: 'ref-uuid-5678',
//   type: 'range',
//   confidence: 0.98,
//   
//   // 範囲情報
//   rangeStartArticle: '第1条',
//   rangeEndArticle: '第10条',
//   rangeInclusive: true,
//   
//   // 位置情報
//   sourceText: '第1条から第10条まで',
//   sourceStartPos: 2000,
//   sourceEndPos: 2020
// }]->(law:Law)

// 準用参照
// (source)-[:APPLIES {
//   id: 'ref-uuid-9012',
//   type: 'junyo',
//   confidence: 0.92,
//   
//   // 準用情報
//   originalProvision: '第331条第1項',
//   applyingContext: '設立時取締役',
//   conditions: '第335条第1項において準用する場合を含む',
//   
//   // 位置情報
//   sourceText: '第331条第1項（第335条第1項において準用する場合を含む。）',
//   sourceStartPos: 3000,
//   sourceEndPos: 3050
// }]->(target)

// 読替え参照
// (source)-[:REPLACES {
//   id: 'ref-uuid-3456',
//   type: 'yomikae',
//   confidence: 0.88,
//   
//   // 読替え情報
//   originalText: '過半数',
//   replacementText: '三分の二以上',
//   scope: '第1項及び第2項',
//   
//   // 位置情報
//   sourceText: '第1項及び第2項中「過半数」とあるのは「三分の二以上」と読み替える',
//   sourceStartPos: 4000,
//   sourceEndPos: 4100
// }]->(target)

// === サンプルクエリ ===

// 1. 特定の条文から出ているすべての参照を取得（位置情報付き）
MATCH (a:Article {lawId: '129AC0000000089', number: '第90条'})
-[r:REFERENCES|APPLIES|REPLACES]->()
RETURN r.sourceText, r.sourceStartPos, r.sourceEndPos, r.type, r.confidence
ORDER BY r.sourceStartPos;

// 2. 特定の条文への入力参照を取得（どこから参照されているか）
MATCH (source)-[r:REFERENCES|APPLIES|REPLACES]
->(a:Article {lawId: '129AC0000000089', number: '第90条'})
RETURN source, r.sourceText, r.sourceContext
ORDER BY r.confidence DESC;

// 3. 範囲参照の展開
MATCH (source)-[r:REFERENCES_RANGE]->(law:Law)
WHERE r.rangeStartArticle = '第1条' AND r.rangeEndArticle = '第10条'
MATCH (law)-[:HAS_ARTICLE]->(a:Article)
WHERE toInteger(replace(replace(a.number, '第', ''), '条', '')) >= 1
  AND toInteger(replace(replace(a.number, '第', ''), '条', '')) <= 10
RETURN source, collect(a.number) as articlesInRange;

// 4. 準用の連鎖を追跡
MATCH path = (start:Article)-[:APPLIES*1..5]->(end:Article)
WHERE start.lawId = '417AC0000000086' AND start.number = '第331条'
RETURN path, length(path) as chainLength
ORDER BY chainLength DESC;

// 5. 特定位置の参照を検索
MATCH ()-[r:REFERENCES|APPLIES|REPLACES]->()
WHERE r.sourceStartPos >= 1000 AND r.sourceEndPos <= 2000
RETURN r.sourceText, r.type, r.confidence
ORDER BY r.sourceStartPos;

// 6. 信頼度の低い参照を検証用に抽出
MATCH (source)-[r:REFERENCES|APPLIES|REPLACES]->(target)
WHERE r.confidence < 0.8
RETURN source, r.sourceText, r.confidence, target
ORDER BY r.confidence ASC
LIMIT 100;

// === データ投入例 ===

// 法令の作成
MERGE (law:Law {id: '129AC0000000089'})
SET law.name = '民法',
    law.abbreviation = '民法',
    law.promulgatedDate = '1896-04-27',
    law.enforcedDate = '1898-07-16';

// 条文の作成
MERGE (a:Article {lawId: '129AC0000000089', number: '第90条'})
SET a.title = '公序良俗',
    a.content = '公の秩序又は善良の風俗に反する法律行為は、無効とする。';

// 法令と条文の関係
MATCH (law:Law {id: '129AC0000000089'})
MATCH (a:Article {lawId: '129AC0000000089', number: '第90条'})
MERGE (law)-[:HAS_ARTICLE]->(a);

// 参照の作成（詳細位置情報付き）
MATCH (source:Article {lawId: '132AC0000000048', number: '第1条'})
MATCH (target:Article {lawId: '129AC0000000089', number: '第90条'})
CREATE (source)-[r:REFERENCES {
  id: 'ref-' + randomUUID(),
  type: 'external',
  confidence: 0.95,
  detectedAt: datetime(),
  detectionMethod: 'pattern',
  sourceText: '民法第90条の規定により',
  sourceStartPos: 150,
  sourceEndPos: 165,
  sourceLineNumber: 5,
  sourceContext: '契約は、民法第90条の規定により無効となる場合がある。',
  targetSpecific: '第90条'
}]->(target);

// === 統計クエリ ===

// 参照タイプ別の統計
MATCH ()-[r:REFERENCES|APPLIES|REPLACES]->()
RETURN r.type as referenceType, 
       count(r) as count,
       avg(r.confidence) as avgConfidence
ORDER BY count DESC;

// 法令間の参照ネットワーク密度
MATCH (l1:Law)-[:HAS_ARTICLE]->(a1:Article)
-[r:REFERENCES]->(a2:Article)<-[:HAS_ARTICLE]-(l2:Law)
WHERE l1.id <> l2.id
RETURN l1.name, l2.name, count(r) as referenceCount
ORDER BY referenceCount DESC
LIMIT 20;