// Neo4j参照関係専用スキーマ
// ハネ改正分析と参照関係探索に特化

// ========================================
// 1. 既存データのクリーンアップ（必要時のみ実行）
// ========================================
// MATCH (n) DETACH DELETE n;

// ========================================
// 2. 制約とインデックスの作成
// ========================================

// ユニーク制約
CREATE CONSTRAINT law_id_unique IF NOT EXISTS FOR (l:Law) REQUIRE l.id IS UNIQUE;
CREATE CONSTRAINT article_id_unique IF NOT EXISTS FOR (a:Article) REQUIRE a.id IS UNIQUE;
CREATE CONSTRAINT paragraph_id_unique IF NOT EXISTS FOR (p:Paragraph) REQUIRE p.id IS UNIQUE;
CREATE CONSTRAINT item_id_unique IF NOT EXISTS FOR (i:Item) REQUIRE i.id IS UNIQUE;

// パフォーマンス用インデックス
CREATE INDEX law_title IF NOT EXISTS FOR (l:Law) ON (l.title);
CREATE INDEX law_status IF NOT EXISTS FOR (l:Law) ON (l.status);
CREATE INDEX law_type IF NOT EXISTS FOR (l:Law) ON (l.lawType);
CREATE INDEX article_number IF NOT EXISTS FOR (a:Article) ON (a.number);
CREATE INDEX article_law_id IF NOT EXISTS FOR (a:Article) ON (a.lawId);
CREATE FULLTEXT INDEX article_content IF NOT EXISTS FOR (a:Article) ON EACH [a.content];

// 複合インデックス（頻繁なクエリパターン用）
CREATE INDEX article_law_number IF NOT EXISTS FOR (a:Article) ON (a.lawId, a.number);
CREATE INDEX article_chapter IF NOT EXISTS FOR (a:Article) ON (a.chapter);
CREATE INDEX article_section IF NOT EXISTS FOR (a:Article) ON (a.section);

// ========================================
// 3. ノード定義
// ========================================

// 法令ノード（軽量版）
// (:Law {
//   id: String,              // 法令ID (例: "129AC0000000089")
//   title: String,           // 法令名（表示用）
//   shortTitle: String,      // 略称（例: "民法"）
//   lawType: String,         // 法令種別
//   status: String,          // 現行/廃止/改正予定
//   effectiveDate: Date,     // 施行日
//   lastUpdated: DateTime    // 最終更新日時
// })

// 条文ノード（参照分析用）
// (:Article {
//   id: String,              // 条文ID (例: "129AC0000000089_709")
//   lawId: String,           // 所属法令ID
//   number: String,          // 条番号（例: "七百九"）
//   numberInt: Integer,      // 条番号（数値、ソート用）
//   title: String,           // 条見出し
//   chapter: String,         // 章
//   section: String,         // 節
//   isDeleted: Boolean,      // 削除フラグ
//   refCount: Integer        // 被参照回数（キャッシュ）
// })

// 項ノード（詳細参照用）
// (:Paragraph {
//   id: String,              // 項ID
//   articleId: String,       // 所属条文ID
//   number: Integer          // 項番号
// })

// 号ノード（詳細参照用）
// (:Item {
//   id: String,              // 号ID
//   paragraphId: String,     // 所属項ID
//   number: String,          // 号番号
//   type: String             // 号/イロハ/いろは
// })

// ========================================
// 4. リレーションシップ定義
// ========================================

// 構造的関係
// (:Law)-[:HAS_ARTICLE]->(:Article)
// (:Article)-[:HAS_PARAGRAPH]->(:Paragraph)
// (:Paragraph)-[:HAS_ITEM]->(:Item)

// 順序関係（ナビゲーション用）
// (:Article)-[:NEXT]->(:Article)
// (:Article)-[:PREV]->(:Article)

// ========================================
// 5. 参照関係の詳細定義
// ========================================

// 内部参照（同一法令内）
// (:Article)-[:REFERS_TO {
//   type: "internal",
//   text: String,            // 参照テキスト（例: "前条第二項"）
//   confidence: Float,       // 信頼度 (0.0-1.0)
//   context: String,         // 文脈（参照を含む文）
//   paragraphNumber: Integer,// 参照元の項番号
//   itemNumber: String,      // 参照元の号番号
//   targetParagraph: Integer,// 参照先の項番号
//   targetItem: String,      // 参照先の号番号
//   createdAt: DateTime      // 検出日時
// }]->(:Article)

// 外部参照（他法令）
// (:Article)-[:REFERS_TO_LAW {
//   type: "external",
//   lawName: String,         // 参照先法令名
//   articleNumber: String,   // 参照先条番号
//   text: String,            // 参照テキスト
//   confidence: Float,
//   context: String,
//   isResolved: Boolean,     // 解決済みフラグ
//   createdAt: DateTime
// }]->(:Law)

// 相対参照（前条、次条等）
// (:Article)-[:RELATIVE_REF {
//   direction: String,       // previous/next/same
//   distance: Integer,       // 距離（前二条なら2）
//   type: String,            // 条/項/号
//   text: String,            // 元のテキスト
//   resolved: Boolean        // 解決済みフラグ
// }]->(:Article)

// 準用関係
// (:Article)-[:APPLIES {
//   type: "準用",
//   scope: String,           // 準用範囲
//   modifications: String,   // 読替規定
//   text: String,            // 準用規定のテキスト
//   isPartial: Boolean,      // 部分準用フラグ
//   createdAt: DateTime
// }]->(:Article)

// 構造参照（章、編への参照）
// (:Article)-[:REFERS_TO_STRUCTURE {
//   structureType: String,   // 章/編/節/款/目
//   structureName: String,   // 構造名（例: "第二章"）
//   text: String,
//   scope: String,           // 参照範囲
//   createdAt: DateTime
// }]->(:Article)

// ========================================
// 6. 改正関係の定義
// ========================================

// 改正ノード
// (:Amendment {
//   id: String,              // 改正ID
//   lawId: String,           // 改正法令ID
//   targetLawId: String,     // 改正対象法令ID
//   effectiveDate: Date,     // 施行日
//   description: String,     // 改正内容
//   status: String           // 予定/施行済
// })

// 改正による影響
// (:Amendment)-[:AMENDS]->(:Article)
// (:Article)-[:AFFECTED_BY]->(:Amendment)

// 条文のバージョン管理
// (:Article)-[:REPLACED_BY {
//   effectiveDate: Date,
//   amendmentId: String,
//   changeType: String       // 新設/改正/削除
// }]->(:Article)

// ========================================
// 7. 分析用の集約関係
// ========================================

// 影響度スコア（ハネ改正分析用）
// (:Article)-[:IMPACTS {
//   score: Float,            // 影響度スコア (0.0-1.0)
//   depth: Integer,          // 影響の深さ（何段階先か）
//   pathCount: Integer,      // 影響経路の数
//   calculatedAt: DateTime   // 計算日時
// }]->(:Article)

// 関連度（類似条文検出用）
// (:Article)-[:SIMILAR_TO {
//   similarity: Float,       // 類似度 (0.0-1.0)
//   method: String,          // 計算方法
//   calculatedAt: DateTime
// }]->(:Article)

// ========================================
// 8. サンプルクエリ
// ========================================

// ハネ改正の影響範囲検出（5段階まで）
// MATCH path = (source:Article {lawId: "129AC0000000089", number: "七百九"})
//   <-[:REFERS_TO|REFERS_TO_LAW|APPLIES|RELATIVE_REF*1..5]-(affected:Article)
// WITH affected, path, length(path) as distance
// RETURN DISTINCT affected.lawId, affected.number, min(distance) as minDistance
// ORDER BY minDistance, affected.lawId, affected.number
// LIMIT 100;

// 準用関係の連鎖探索
// MATCH path = (a:Article)-[:APPLIES*]-(b:Article)
// WHERE a.lawId = "417AC0000000086" AND a.number = "一〇〇"
// RETURN path;

// 最も参照されている条文TOP10
// MATCH (a:Article)<-[r:REFERS_TO|REFERS_TO_LAW|APPLIES|RELATIVE_REF]-()
// WITH a, count(r) as refCount
// SET a.refCount = refCount
// RETURN a.lawId, a.number, a.title, refCount
// ORDER BY refCount DESC
// LIMIT 10;