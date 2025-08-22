// 拡張位置情報付き参照関係の可視化クエリ集
// Neo4j Browser (http://localhost:7474) で実行

// ===============================================
// 1. 位置情報付き参照の概要
// ===============================================
MATCH ()-[r:REFERENCES]->()
WHERE r.enhanced = true
RETURN 
  count(r) as 拡張参照数,
  avg(r.confidence) as 平均信頼度,
  collect(DISTINCT r.type) as 参照タイプ一覧
LIMIT 1;

// ===============================================
// 2. 位置情報を含む参照関係のグラフ表示
// ===============================================
MATCH (source)-[r:REFERENCES]->(target)
WHERE r.enhanced = true
RETURN source, r, target
LIMIT 50;

// ===============================================
// 3. 詳細位置情報の表示（テーブル形式）
// ===============================================
MATCH (source)-[r:REFERENCES]->(target)
WHERE r.enhanced = true
RETURN 
  source.lawId as 参照元法令,
  source.number as 参照元条文,
  r.sourceText as 参照テキスト,
  r.sourceStartPos as 開始位置,
  r.sourceEndPos as 終了位置,
  r.sourceLineNumber as 行番号,
  target.lawId as 参照先法令,
  target.number as 参照先条文,
  r.type as 参照タイプ,
  r.confidence as 信頼度
ORDER BY r.sourceStartPos
LIMIT 20;

// ===============================================
// 4. 民法を中心とした参照ネットワーク
// ===============================================
MATCH (civil:Law {id: '129AC0000000089'})
OPTIONAL MATCH (civil)-[:HAS_ARTICLE]->(article:Article)
OPTIONAL MATCH (article)-[r:REFERENCES]->(target)
WHERE r.enhanced = true
RETURN civil, article, r, target
LIMIT 100;

// ===============================================
// 5. 商法を中心とした参照ネットワーク
// ===============================================
MATCH (commercial:Law {id: '132AC0000000048'})
OPTIONAL MATCH (commercial)-[:HAS_ARTICLE]->(article:Article)
OPTIONAL MATCH (article)-[r:REFERENCES]->(target)
WHERE r.enhanced = true
RETURN commercial, article, r, target
LIMIT 100;

// ===============================================
// 6. 階層構造の可視化（法令→条文→項）
// ===============================================
MATCH (law:Law)-[:HAS_ARTICLE]->(article:Article)
OPTIONAL MATCH (article)-[:HAS_PARAGRAPH]->(paragraph:Paragraph)
WHERE law.id IN ['129AC0000000089', '132AC0000000048']
RETURN law, article, paragraph
LIMIT 50;

// ===============================================
// 7. 位置情報ヒートマップ用データ
// ===============================================
MATCH (source)-[r:REFERENCES]->(target)
WHERE r.enhanced = true AND r.sourceLineNumber IS NOT NULL
RETURN 
  source.lawId as lawId,
  source.number as article,
  r.sourceLineNumber as lineNumber,
  count(*) as referenceCount
ORDER BY lineNumber;

// ===============================================
// 8. 相互参照の検出（双方向参照）
// ===============================================
MATCH (a)-[r1:REFERENCES]->(b)
MATCH (b)-[r2:REFERENCES]->(a)
WHERE r1.enhanced = true AND r2.enhanced = true
RETURN 
  a.lawId as 法令A,
  a.number as 条文A,
  b.lawId as 法令B,
  b.number as 条文B,
  r1.sourceText as AからBへの参照,
  r2.sourceText as BからAへの参照
LIMIT 10;

// ===============================================
// 9. 参照チェーンの探索（3段階）
// ===============================================
MATCH path = (start:Article)-[:REFERENCES*1..3]->(end:Article)
WHERE ALL(r IN relationships(path) WHERE r.enhanced = true)
  AND start.lawId = '129AC0000000089'
  AND start.number = '第90条'
RETURN path
LIMIT 10;

// ===============================================
// 10. 位置情報の統計分析
// ===============================================
MATCH ()-[r:REFERENCES]->()
WHERE r.enhanced = true
RETURN 
  min(r.sourceStartPos) as 最小開始位置,
  max(r.sourceEndPos) as 最大終了位置,
  avg(r.sourceEndPos - r.sourceStartPos) as 平均参照長,
  min(r.sourceLineNumber) as 最小行番号,
  max(r.sourceLineNumber) as 最大行番号,
  avg(r.sourceLineNumber) as 平均行番号,
  stdev(r.sourceLineNumber) as 行番号標準偏差;

// ===============================================
// 11. 参照密度の高い条文TOP10
// ===============================================
MATCH (article:Article)-[r:REFERENCES]->()
WHERE r.enhanced = true
RETURN 
  article.lawId as 法令ID,
  article.number as 条文番号,
  count(r) as 参照数,
  avg(r.confidence) as 平均信頼度,
  collect(DISTINCT r.type) as 参照タイプ
ORDER BY count(r) DESC
LIMIT 10;

// ===============================================
// 12. グラフ全体の構造統計
// ===============================================
MATCH (n)
WITH labels(n) as nodeType, count(n) as nodeCount
RETURN nodeType, nodeCount
UNION
MATCH ()-[r]->()
WITH type(r) as relType, count(r) as relCount
RETURN relType, relCount
ORDER BY nodeCount DESC, relCount DESC;