// ============================================
// 法令名をノードに表示するクエリ集
// ============================================
// Neo4j Browser (http://localhost:7474) で実行
// 認証: neo4j / lawfinder123

// ============================================
// Neo4j Browserの表示設定を変更する方法：
// ============================================
// 1. クエリを実行後、グラフが表示されたら
// 2. ノードをクリックして選択
// 3. 画面下部に表示されるノード情報パネルで
//    「Caption」の部分をクリック
// 4. 「title」を選択（デフォルトは「id」）
// 5. これで法令名がノードラベルとして表示されます

// ============================================
// 1. 外部参照ネットワーク（法令名付き）
// ============================================

// 法令名を含めて返す（基本）
MATCH (source:Law)-[r:REFERENCES {isExternal: true}]->(target:Law)
WHERE source.id <> target.id
RETURN source, r, target
LIMIT 100;

// ============================================
// 2. 主要法令間の参照（法令名を明示）
// ============================================

// 民法、刑法、商法、会社法の相互参照
MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE source.id IN ['129AC0000000089', '140AC0000000045', '132AC0000000048', '417AC0000000086']
  AND target.id IN ['129AC0000000089', '140AC0000000045', '132AC0000000048', '417AC0000000086']
  AND source.id <> target.id
RETURN source.title as 参照元, 
       target.title as 参照先,
       r.type as 参照タイプ,
       source, r, target;

// ============================================
// 3. 特定法令の外部参照（タイトル表示優先）
// ============================================

// 民法が参照している法令
MATCH (minpo:Law {id: '129AC0000000089'})-[r:REFERENCES {isExternal: true}]->(target:Law)
WHERE minpo.id <> target.id
RETURN minpo.title as 民法,
       target.title as 参照先法令,
       r.type as 参照タイプ,
       minpo, r, target
LIMIT 50;

// ============================================
// 4. 参照が多い法令TOP10（名前付き）
// ============================================

MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE source.id <> target.id
WITH target, COUNT(r) as refCount
ORDER BY refCount DESC
LIMIT 10
MATCH (source2:Law)-[r2:REFERENCES]->(target)
WHERE source2.id <> target.id
RETURN target.title as 法令名,
       refCount as 被参照数,
       source2, r2, target
LIMIT 100;

// ============================================
// 5. タイトルでフィルタリング
// ============================================

// 「労働」を含む法令の参照関係
MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE (source.title CONTAINS '労働' OR target.title CONTAINS '労働')
  AND source.id <> target.id
RETURN source.title as 参照元,
       target.title as 参照先,
       source, r, target
LIMIT 100;

// ============================================
// 6. テーブル形式で法令名を確認
// ============================================

// 外部参照をテーブル形式で表示（グラフなし）
MATCH (source:Law)-[r:REFERENCES {isExternal: true}]->(target:Law)
WHERE source.id <> target.id
RETURN source.title as 参照元法令,
       target.title as 参照先法令,
       r.type as 参照タイプ,
       r.sourceArticle as 参照元条文,
       r.targetArticle as 参照先条文
LIMIT 50;

// ============================================
// 7. 相互参照の検出（名前付き）
// ============================================

// 相互に参照し合っている法令ペア
MATCH (a:Law)-[r1:REFERENCES]->(b:Law)
WHERE EXISTS((b)-[:REFERENCES]->(a))
  AND a.id < b.id
  AND a.id <> b.id
RETURN a.title as 法令1,
       b.title as 法令2,
       COUNT(r1) as 参照数,
       a, b
LIMIT 20;

// ============================================
// 8. 法令名の部分一致検索
// ============================================

// 「民」を含む法令の参照
MATCH (source:Law)-[r:REFERENCES]->(target:Law)
WHERE source.title =~ '.*民.*'
  AND source.id <> target.id
RETURN source.title as 参照元,
       target.title as 参照先,
       source, r, target
LIMIT 50;

// ============================================
// 9. カスタムスタイル（プロパティ付き）
// ============================================

// ノードサイズを参照数で調整（仮想プロパティ）
MATCH (n:Law)
OPTIONAL MATCH (n)<-[inRef:REFERENCES {isExternal: true}]-()
WITH n, COUNT(inRef) as popularity
WHERE popularity > 0
MATCH (n)-[r:REFERENCES]-(m:Law)
WHERE n.id <> m.id
RETURN n.title as ノード名,
       popularity as 人気度,
       n, r, m
ORDER BY popularity DESC
LIMIT 100;

// ============================================
// 10. 法令名によるパス検索
// ============================================

// 民法から会社法への最短パス
MATCH path = shortestPath(
  (start:Law {title: '民法'})-[:REFERENCES*..5]->(end:Law {title: '会社法'})
)
RETURN [node in nodes(path) | node.title] as 経路,
       length(path) as 距離,
       path;

// ============================================
// ノードラベル表示の設定方法（重要）
// ============================================
// 
// 【自動設定】上記のクエリ実行後：
// 1. グラフ表示領域の右下にある「設定」アイコン（歯車）をクリック
// 2. 「Node display」セクションを探す
// 3. 「Caption」のドロップダウンから「title」を選択
// 4. 「Color」や「Size」も調整可能
//
// 【個別設定】特定のノードだけ変更：
// 1. ノードをクリックして選択
// 2. 画面下部のプロパティパネルで調整
//
// 【スタイルシート】（上級者向け）：
// :style
// でスタイルエディタを開いて以下を追加：
// node {
//   caption: "{title}";
//   font-size: 10px;
// }