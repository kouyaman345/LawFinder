// ============================================
// 相互参照を優先的に表示するクエリ集
// ============================================

// 1. 相互参照している法令ペア（最も基本的）
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)-[r2:REFERENCES]->(a)
WHERE a.id < b.id  // 重複を避ける
RETURN a, r1, b, r2
LIMIT 50;

// 2. 相互参照のネットワーク（複数の法令が相互に参照）
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)
WHERE EXISTS((b)-[:REFERENCES]->(a))
  AND a.id <> b.id
WITH a, b
MATCH path = (a)-[r:REFERENCES*1..2]-(c:Law)
WHERE c.id IN [a.id, b.id] 
   OR EXISTS((c)-[:REFERENCES]->(a))
   OR EXISTS((c)-[:REFERENCES]->(b))
RETURN path
LIMIT 100;

// 3. 三角形の参照関係（3つの法令が相互に参照）
MATCH (a:Law)-[r1:REFERENCES]->(b:Law),
      (b)-[r2:REFERENCES]->(c:Law),
      (c)-[r3:REFERENCES]->(a)
WHERE a.id < b.id AND b.id < c.id
RETURN a, b, c, r1, r2, r3
LIMIT 30;

// 4. 強く結合したクラスター（参照数でフィルタ）
MATCH (a:Law)-[r:REFERENCES]-(b:Law)
WHERE a.id < b.id
WITH a, b, COUNT(r) as refCount
WHERE refCount >= 2  // 2件以上の参照関係
MATCH (a)-[r1:REFERENCES]-(b)
OPTIONAL MATCH (a)-[r2:REFERENCES]-(c:Law)-[r3:REFERENCES]-(b)
WHERE c.id NOT IN [a.id, b.id]
RETURN a, b, c, r1, r2, r3
LIMIT 100;

// 5. 中心的な法令とその相互参照ネットワーク
MATCH (center:Law)
WHERE SIZE([(center)-[:REFERENCES]-() | 1]) > 10  // 10件以上の参照を持つ
WITH center
LIMIT 5
MATCH (center)-[r1:REFERENCES]-(connected:Law)
WHERE EXISTS((connected)-[:REFERENCES]->(center))
OPTIONAL MATCH (connected)-[r2:REFERENCES]-(other:Law)
WHERE other.id <> center.id 
  AND EXISTS((other)-[:REFERENCES]->(center))
RETURN center, connected, other, r1, r2
LIMIT 150;

// 6. 外部参照の相互ネットワーク
MATCH (a:Law)-[r1:REFERENCES {type: "external"}]->(b:Law)
WHERE EXISTS((b)-[:REFERENCES {type: "external"}]->(a))
  AND a.id < b.id
WITH a, b, r1
MATCH (a)-[r2:REFERENCES]-(b)
RETURN a, b, r1, r2
LIMIT 50;

// 7. 参照の密度が高い領域（推奨）
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)
WHERE a.id <> b.id
WITH a, b, COUNT(r1) as refs
WHERE refs > 0
WITH a, b
MATCH (a)-[r:REFERENCES]-(connected:Law)
WHERE connected.id = b.id 
   OR EXISTS((connected)-[:REFERENCES]-(b))
RETURN a, b, connected, r
LIMIT 200;

// 8. 双方向の参照を持つ全ての法令（完全版）
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)
WHERE EXISTS((b)-[:REFERENCES]->(a))
  AND a.id <> b.id
RETURN a, r1, b
LIMIT 200;

// 9. 参照チェーン（A→B→C→A のような循環）
MATCH path = (start:Law)-[:REFERENCES*2..4]->(start)
WHERE ALL(n IN nodes(path) WHERE n.id <> start.id OR n = start)
RETURN path
LIMIT 20;

// 10. 最も活発な相互参照クラスター（おすすめ）
MATCH (a:Law)-[:REFERENCES]-(b:Law)
WHERE a.id < b.id
WITH a, b, SIZE([(a)-[:REFERENCES]-(b) | 1]) as connectionStrength
WHERE connectionStrength >= 2
WITH a, b, connectionStrength
ORDER BY connectionStrength DESC
LIMIT 20
MATCH path = (a)-[r:REFERENCES*..2]-(b)
RETURN path;