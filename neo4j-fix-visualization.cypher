// ============================================
// 現在のデータで可視化可能なクエリ
// ============================================

// 1. 自己参照（内部参照）のネットワーク
// 同じ法令内での条文間参照を可視化
MATCH (law:Law)-[r:REFERENCES {type: "internal"}]->(law)
RETURN law, r
LIMIT 50;

// 2. 構造的な参照の可視化
MATCH (law:Law)-[r:REFERENCES {type: "structural"}]->(law)
RETURN law, r
LIMIT 50;

// 3. 全タイプの参照（自己参照含む）
MATCH (law:Law)-[r:REFERENCES]->(law2:Law)
RETURN law, r, law2
LIMIT 100;

// 4. 参照が多い法令
MATCH (law:Law)-[r:REFERENCES]->()
WITH law, COUNT(r) as refCount
WHERE refCount > 10
MATCH (law)-[r2:REFERENCES]->()
RETURN law, r2
LIMIT 200;

// 5. 特定の法令の参照構造
// 民法の例
MATCH (law:Law {id: "129AC0000000089"})-[r:REFERENCES]->()
RETURN law, r
LIMIT 100;

// 6. 参照タイプ別の分布
MATCH (law:Law)-[r:REFERENCES]->()
WITH law, r.type as refType, COUNT(r) as count
RETURN law.id as lawId, law.title as title, refType, count
ORDER BY count DESC
LIMIT 50;

// 7. ノードのみの表示（参照関係の確認用）
MATCH (law:Law)
WHERE SIZE([(law)-[:REFERENCES]-() | 1]) > 0
RETURN law
LIMIT 100;