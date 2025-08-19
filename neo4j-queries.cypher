// Neo4j Browser用のサンプルクエリ集
// http://localhost:7474 でNeo4j Browserを開いて実行

// ============================================
// 1. 基本統計
// ============================================

// ノード数の確認
MATCH (n) RETURN COUNT(n) as totalNodes;

// 参照関係の総数
MATCH ()-[r:REFERENCES]->() RETURN COUNT(r) as totalReferences;

// 参照タイプ別統計
MATCH ()-[r:REFERENCES]->()
RETURN r.type as referenceType, COUNT(r) as count
ORDER BY count DESC;

// ============================================
// 2. 特定法令の可視化
// ============================================

// 民法の参照関係を可視化（民法が参照している法令）
MATCH (source:Law {id: "129AC0000000089"})-[r:REFERENCES]->(target:Law)
WHERE source.id <> target.id
RETURN source, r, target
LIMIT 50;

// 民法を参照している法令を可視化
MATCH (source:Law)-[r:REFERENCES]->(target:Law {id: "129AC0000000089"})
WHERE source.id <> target.id
RETURN source, r, target
LIMIT 50;

// ============================================
// 3. 最も参照されている法令TOP10
// ============================================

MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE source.id <> target.id
RETURN target.id as lawId, target.title as title, COUNT(r) as referenceCount
ORDER BY referenceCount DESC
LIMIT 10;

// ============================================
// 4. 相互参照の検出
// ============================================

// 相互に参照し合っている法令ペア
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)-[r2:REFERENCES]->(a)
WHERE a.id < b.id
RETURN a.title as law1, b.title as law2, COUNT(r1) as refs1to2, COUNT(r2) as refs2to1
LIMIT 20;

// ============================================
// 5. 参照の深さ分析（2段階）
// ============================================

// 民法から2段階の参照関係
MATCH path = (start:Law {id: "129AC0000000089"})-[:REFERENCES*1..2]->(end:Law)
WHERE start.id <> end.id
RETURN path
LIMIT 30;

// ============================================
// 6. 孤立法令の検出
// ============================================

// 他の法令を参照していない法令
MATCH (l:Law)
WHERE NOT (l)-[:REFERENCES]->()
RETURN l.id as lawId, l.title as title
LIMIT 20;

// 他の法令から参照されていない法令
MATCH (l:Law)
WHERE NOT ()-[:REFERENCES]->(l)
RETURN l.id as lawId, l.title as title
LIMIT 20;

// ============================================
// 7. 参照ネットワークの中心性分析
// ============================================

// PageRank的な重要度（多く参照されている法令）
MATCH (l:Law)<-[r:REFERENCES]-()
RETURN l.id as lawId, l.title as title, COUNT(r) as inDegree
ORDER BY inDegree DESC
LIMIT 15;

// 多くの法令を参照している法令
MATCH (l:Law)-[r:REFERENCES]->()
WHERE l.id <> r.targetLawId
RETURN l.id as lawId, l.title as title, COUNT(r) as outDegree
ORDER BY outDegree DESC
LIMIT 15;

// ============================================
// 8. 特定条文間の参照関係
// ============================================

// 民法第1条への参照
MATCH (source:Law)-[r:REFERENCES {targetArticle: "第一条"}]->(target:Law {id: "129AC0000000089"})
RETURN source.title as sourceLaw, r.sourceArticle as fromArticle, r.text as referenceText
LIMIT 20;

// ============================================
// 9. グラフの全体構造（小規模サンプル）
// ============================================

// ランダムに50個の参照関係を可視化
MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE source.id <> target.id AND rand() < 0.01
RETURN source, r, target
LIMIT 50;

// ============================================
// 10. 参照タイプ別の可視化
// ============================================

// 外部参照のみ
MATCH (source:Law)-[r:REFERENCES {type: "external"}]->(target:Law)
WHERE source.id <> target.id
RETURN source, r, target
LIMIT 30;

// 適用・準用関係
MATCH (source:Law)-[r:REFERENCES {type: "application"}]->(target:Law)
RETURN source, r, target
LIMIT 30;