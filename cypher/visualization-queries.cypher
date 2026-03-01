// ====================================================================
// Neo4j Browser用 可視化クエリ集
// 
// 使い方：
// 1. Neo4j Browserを開く: http://localhost:7474
// 2. ユーザー名: neo4j / パスワード: lawfinder123
// 3. 以下のクエリをコピーして実行
// ====================================================================

// ====================================================================
// 1. 最も参照される法令TOP10のグラフ
// ====================================================================
MATCH (target:Law)<-[r:REFERENCES_AGGREGATED]-(source:Law)
WITH target, COUNT(DISTINCT source) as refCount
ORDER BY refCount DESC
LIMIT 10
MATCH (target)<-[r:REFERENCES_AGGREGATED]-(source:Law)
RETURN target, source, r
LIMIT 100;

// ====================================================================
// 2. 地方税法を中心とした参照ネットワーク
// ====================================================================
MATCH (center:Law {lawId: '325AC0000000226'})
OPTIONAL MATCH (center)-[out:REFERENCES_AGGREGATED]->(outTarget:Law)
OPTIONAL MATCH (inSource:Law)-[in:REFERENCES_AGGREGATED]->(center)
WITH center, 
     COLLECT(DISTINCT outTarget)[0..20] as outTargets,
     COLLECT(DISTINCT inSource)[0..20] as inSources,
     COLLECT(DISTINCT out)[0..20] as outRels,
     COLLECT(DISTINCT in)[0..20] as inRels
RETURN center, outTargets, inSources, outRels, inRels;

// ====================================================================
// 3. 会社法の参照ネットワーク（双方向）
// ====================================================================
MATCH (company:Law {lawId: '417AC0000000086'})
OPTIONAL MATCH path = (company)-[:REFERENCES_AGGREGATED*1..2]-(related:Law)
WHERE related.lawId <> '417AC0000000086'
WITH company, COLLECT(DISTINCT related)[0..30] as relatedLaws, COLLECT(path)[0..30] as paths
UNWIND paths as p
RETURN p
LIMIT 50;

// ====================================================================
// 4. 重要法令間の相互参照
// ====================================================================
MATCH (l1:Law)-[r:REFERENCES_AGGREGATED]->(l2:Law)
WHERE l1.lawId IN ['325AC0000000226', '322AC0000000067', '417AC0000000086', '129AC0000000089', '411AC0000000103']
  AND l2.lawId IN ['325AC0000000226', '322AC0000000067', '417AC0000000086', '129AC0000000089', '411AC0000000103']
  AND l1.lawId <> l2.lawId
RETURN l1, l2, r
ORDER BY r.count DESC;

// ====================================================================
// 5. 高頻度参照（50回以上）のネットワーク
// ====================================================================
MATCH (source:Law)-[r:REFERENCES_AGGREGATED]->(target:Law)
WHERE r.count >= 50
RETURN source, target, r
ORDER BY r.count DESC
LIMIT 100;

// ====================================================================
// 6. 法令クラスタ分析（相互参照の強い法令群）
// ====================================================================
MATCH (l1:Law)-[r1:REFERENCES_AGGREGATED]->(l2:Law)
WHERE r1.count > 10
WITH l1, l2, r1
MATCH (l2)-[r2:REFERENCES_AGGREGATED]->(l3:Law)
WHERE r2.count > 10 AND l3.lawId <> l1.lawId
RETURN l1, l2, l3, r1, r2
LIMIT 50;

// ====================================================================
// 7. 内部参照が多い法令
// ====================================================================
MATCH (l:Law)-[r:REFERENCES_AGGREGATED]->(l)
WHERE r.count > 30
RETURN l, r
ORDER BY r.count DESC
LIMIT 20;

// ====================================================================
// 8. 参照タイプ別の分布
// ====================================================================
MATCH (source:Law)-[r:REFERENCES_AGGREGATED]->(target:Law)
WHERE r.type IN ['internal', 'external']
WITH r.type as type, source, target, r
RETURN source, target, r
LIMIT 200;

// ====================================================================
// 9. 独立行政法人通則法への参照パターン
// ====================================================================
MATCH (source:Law)-[r:REFERENCES_AGGREGATED]->(target:Law {lawId: '411AC0000000103'})
WITH source, r, target
ORDER BY r.count DESC
LIMIT 30
RETURN source, target, r;

// ====================================================================
// 10. 法令間の最短パス探索（例：民法から会社法）
// ====================================================================
MATCH path = shortestPath(
  (civil:Law {lawId: '129AC0000000089'})-[:REFERENCES_AGGREGATED*..5]-(company:Law {lawId: '417AC0000000086'})
)
RETURN path;

// ====================================================================
// 11. 法令同士の直接参照関係（全体像）
// ====================================================================
// 法令レベルでの参照関係を俯瞰的に表示
MATCH (source:Law)-[r:REFERENCES_AGGREGATED]->(target:Law)
WHERE source.lawId <> target.lawId  // 自己参照を除外
WITH source, target, SUM(r.count) as totalRefs
WHERE totalRefs > 5  // 5回以上の参照のみ
RETURN source, target, {count: totalRefs} as r
ORDER BY totalRefs DESC
LIMIT 200;

// ====================================================================
// 12. 特定法令ペアの詳細参照（地方税法↔地方自治法）
// ====================================================================
MATCH (l1:Law {lawId: '325AC0000000226'})-[r:REFERENCES_AGGREGATED]-(l2:Law {lawId: '322AC0000000067'})
RETURN l1, l2, r;

// ====================================================================
// 13. 法系統別の参照ネットワーク（税法関連）
// ====================================================================
MATCH (source:Law)-[r:REFERENCES_AGGREGATED]->(target:Law)
WHERE (source.lawTitle CONTAINS '税' OR target.lawTitle CONTAINS '税')
  AND source.lawId <> target.lawId
  AND r.count > 10
RETURN source, target, r
LIMIT 100;

// ====================================================================
// 14. 法系統別の参照ネットワーク（行政法関連）
// ====================================================================
MATCH (source:Law)-[r:REFERENCES_AGGREGATED]->(target:Law)
WHERE (source.lawTitle CONTAINS '行政' OR target.lawTitle CONTAINS '行政')
  AND source.lawId <> target.lawId
  AND r.count > 10
RETURN source, target, r
LIMIT 100;

// ====================================================================
// 15. 双方向参照関係（相互に参照し合う法令）
// ====================================================================
MATCH (l1:Law)-[r1:REFERENCES_AGGREGATED]->(l2:Law)
MATCH (l2)-[r2:REFERENCES_AGGREGATED]->(l1)
WHERE l1.lawId < l2.lawId  // 重複除去
  AND r1.count > 5 AND r2.count > 5
RETURN l1, l2, r1, r2
ORDER BY r1.count + r2.count DESC
LIMIT 50;

// ====================================================================
// 16. ハブ法令の検出（入出力が多い中心的法令）
// ====================================================================
MATCH (hub:Law)
WITH hub,
     SIZE([(hub)<-[:REFERENCES_AGGREGATED]-() | 1]) as inDegree,
     SIZE([(hub)-[:REFERENCES_AGGREGATED]->() | 1]) as outDegree
WHERE inDegree > 100 OR outDegree > 100
MATCH (hub)-[r:REFERENCES_AGGREGATED]-(connected:Law)
WHERE r.count > 10
RETURN hub, connected, r
LIMIT 150;

// ====================================================================
// 17. 施行令・施行規則と本法の関係
// ====================================================================
MATCH (source:Law)-[r:REFERENCES_AGGREGATED]->(target:Law)
WHERE (source.lawTitle CONTAINS '施行令' OR source.lawTitle CONTAINS '施行規則')
  AND NOT (target.lawTitle CONTAINS '施行令' OR target.lawTitle CONTAINS '施行規則')
  AND r.count > 20
RETURN source, target, r
ORDER BY r.count DESC
LIMIT 100;

// ====================================================================
// 18. 階層的法令構造の可視化
// ====================================================================
// 憲法→法律→政令→省令の階層関係
MATCH (l1:Law)-[r1:REFERENCES_AGGREGATED]->(l2:Law)
WHERE l1.lawId IN ['321AC0000000000', '129AC0000000089', '140AC0000000045']  // 憲法、民法、刑法
WITH l1, COLLECT({law: l2, rel: r1}) as level2
UNWIND level2 as l2data
MATCH (l2data.law)-[r2:REFERENCES_AGGREGATED]->(l3:Law)
WHERE r2.count > 10
RETURN l1, l2data.law as l2, l2data.rel as r1, l3, r2
LIMIT 100;

// ====================================================================
// 19. 時系列参照パターン（新旧法令の関係）
// ====================================================================
// 改正法や新法が旧法を参照するパターン
MATCH (newer:Law)-[r:REFERENCES_AGGREGATED]->(older:Law)
WHERE newer.lawId > older.lawId  // 法令番号で新旧を推定
  AND r.type = 'external'
  AND r.count > 20
RETURN newer, older, r
ORDER BY r.count DESC
LIMIT 50;

// ====================================================================
// 20. 法令影響度分析（参照の連鎖）
// ====================================================================
// ある法令の変更が影響する範囲を2段階まで追跡
MATCH (origin:Law {lawId: '417AC0000000086'})  // 会社法を起点
OPTIONAL MATCH (origin)<-[r1:REFERENCES_AGGREGATED]-(level1:Law)
WHERE r1.count > 10
WITH origin, COLLECT(DISTINCT level1) as firstLevel
UNWIND firstLevel as l1
OPTIONAL MATCH (l1)<-[r2:REFERENCES_AGGREGATED]-(level2:Law)
WHERE r2.count > 10 AND level2.lawId <> origin.lawId
RETURN origin, l1 as level1, level2
LIMIT 100;

// ====================================================================
// 統計サマリー（テキスト形式）
// ====================================================================
MATCH (l:Law)
WITH COUNT(l) as totalLaws
MATCH ()-[r:REFERENCES_AGGREGATED]->()
WITH totalLaws, COUNT(r) as totalRefs, SUM(r.count) as totalCount
RETURN 
  totalLaws as '法令数',
  totalRefs as 'ユニーク参照',
  totalCount as '総参照回数',
  totalCount * 1.0 / totalRefs as '平均参照回数';

// ====================================================================
// ノードとエッジのスタイル設定用
// ====================================================================
// Neo4j Browserの設定で以下を使用：
// - ノードのラベル: lawTitle または lawId
// - ノードのサイズ: 被参照数に応じて
// - エッジの太さ: countプロパティに応じて
// - カラースキーム: 
//   - internal参照: 青
//   - external参照: 緑
//   - 高頻度（50回以上）: 赤