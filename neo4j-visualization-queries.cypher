// ============================================
// Neo4j 全体構造可視化クエリ集
// ============================================
// Neo4j Browser (http://localhost:7474) で実行
// 認証: neo4j / lawfinder123

// ============================================
// 1. 全体構造のサンプリング（推奨）
// ============================================

// 主要法令とその参照関係を表示（全体の代表的な構造）
MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE source.id IN [
  "129AC0000000089",  // 民法
  "140AC0000000045",  // 刑法
  "417AC0000000086",  // 会社法
  "322AC0000000049",  // 労働基準法
  "132AC0000000048"   // 商法
]
RETURN source, r, target
LIMIT 200;

// ============================================
// 2. ハブ法令を中心とした可視化
// ============================================

// 最も参照される法令TOP5とその周辺関係
MATCH (target:Law)<-[r1:REFERENCES]-(source1:Law)
WITH target, COUNT(r1) as inDegree
ORDER BY inDegree DESC
LIMIT 5
MATCH (target)-[r2:REFERENCES]-(connected:Law)
RETURN target, r2, connected
LIMIT 300;

// ============================================
// 3. 密な参照ネットワークの検出
// ============================================

// 相互に密接に関連する法令群
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)
WHERE EXISTS((b)-[:REFERENCES]->(a))
WITH a, b, COUNT(r1) as refCount
WHERE refCount > 2
MATCH path = (a)-[r:REFERENCES*1..2]-(c:Law)
WHERE c.id IN [a.id, b.id] OR 
      EXISTS((c)-[:REFERENCES]->(a)) OR 
      EXISTS((c)-[:REFERENCES]->(b))
RETURN path
LIMIT 100;

// ============================================
// 4. 階層的な参照構造
// ============================================

// 参照の階層構造（基本法→関連法令）
MATCH path = (root:Law)-[:REFERENCES*1..3]->(leaf:Law)
WHERE root.id IN ["129AC0000000089", "140AC0000000045", "417AC0000000086"]
  AND NOT (leaf)-[:REFERENCES]->(root)
RETURN path
LIMIT 150;

// ============================================
// 5. 全体マップ（軽量版）
// ============================================

// 参照数が多い重要な関係のみ表示
MATCH (source:Law)
WITH source, SIZE([(source)-[:REFERENCES]->() | 1]) as outDegree
WHERE outDegree > 5
MATCH (source)-[r:REFERENCES]->(target:Law)
WITH source, r, target, SIZE([(target)<-[:REFERENCES]-() | 1]) as targetInDegree
WHERE targetInDegree > 3
RETURN source, r, target
LIMIT 500;

// ============================================
// 6. 法令タイプ別ネットワーク
// ============================================

// 外部参照ネットワークのみ
MATCH (source:Law)-[r:REFERENCES {type: "external"}]->(target:Law)
WHERE source.id <> target.id
WITH source, target, COUNT(r) as refCount
WHERE refCount > 1
MATCH path = (source)-[r2:REFERENCES {type: "external"}]->(target)
RETURN path
LIMIT 200;

// ============================================
// 7. コミュニティ検出
// ============================================

// 強く結合したコミュニティ
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)-[r2:REFERENCES]->(c:Law)-[r3:REFERENCES]->(a)
WHERE a.id < b.id AND b.id < c.id
RETURN a, b, c, r1, r2, r3
LIMIT 50;

// ============================================
// 8. 全体構造の統計付き可視化
// ============================================

// ノードサイズを参照数で調整（D3.js風）
MATCH (n:Law)
OPTIONAL MATCH (n)<-[inRef:REFERENCES]-()
OPTIONAL MATCH (n)-[outRef:REFERENCES]->()
WITH n, COUNT(DISTINCT inRef) as inDegree, COUNT(DISTINCT outRef) as outDegree
WHERE inDegree > 0 OR outDegree > 0
WITH n, inDegree, outDegree, (inDegree + outDegree) as totalDegree
ORDER BY totalDegree DESC
LIMIT 100
MATCH (n)-[r:REFERENCES]-(m:Law)
WHERE m IN [n IN COLLECT(n) | n]
RETURN n, r, m, totalDegree;

// ============================================
// 9. インタラクティブ探索用
// ============================================

// クリック可能な主要ノード（ダブルクリックで展開）
MATCH (n:Law)
WITH n, SIZE([(n)-[:REFERENCES]-() | 1]) as degree
WHERE degree > 10
RETURN n, degree
ORDER BY degree DESC
LIMIT 50;

// 特定法令の1次・2次関係（パラメータ付き）
// $lawIdパラメータを設定して実行
MATCH path = (center:Law {id: $lawId})-[:REFERENCES*1..2]-(connected:Law)
RETURN path
LIMIT 100;

// ============================================
// 10. パフォーマンス最適化版
// ============================================

// 軽量全体図（ノードとエッジ数を制限）
CALL {
  MATCH (n:Law)
  WITH n, SIZE([(n)-[:REFERENCES]-() | 1]) as degree
  ORDER BY degree DESC
  LIMIT 200
  RETURN COLLECT(n) as importantNodes
}
MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE source IN importantNodes AND target IN importantNodes
RETURN source, r, target
LIMIT 1000;