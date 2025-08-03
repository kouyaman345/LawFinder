// 法令参照関係の実用的なCypherクエリ集
// ========================================

// 1. 基本的な参照関係クエリ
// ========================================

// 特定の条文が直接参照している全ての法令部分
MATCH (source:Article {article_id: $articleId})-[ref:REFERENCES]->(target)
RETURN 
    source.article_id as sourceId,
    source.article_num as sourceNum,
    ref.source_text as referenceText,
    ref.primary_type as referenceType,
    labels(target)[0] as targetType,
    CASE
        WHEN target:Law THEN target.law_title
        WHEN target:Article THEN target.article_id + ' (第' + target.article_num + '条)'
        WHEN target:Paragraph THEN target.paragraph_id + ' (第' + target.paragraph_num + '項)'
        ELSE target.item_id
    END as targetDescription;

// 2. 呼び出し・呼び出され関係の分析
// ========================================

// 特定の条文を参照している全ての条文（呼び出され参照）
MATCH (source)-[ref:REFERENCES]->(target:Article {article_id: $articleId})
WITH source, ref, 
     CASE 
         WHEN source:Law THEN source.law_id
         WHEN source:Article THEN head(split(source.article_id, '_'))
         WHEN source:Paragraph THEN head(split(source.paragraph_id, '_'))
         ELSE null
     END as sourceLawId
MATCH (law:Law {law_id: sourceLawId})
RETURN 
    law.law_title as lawTitle,
    labels(source)[0] as sourceType,
    CASE
        WHEN source:Article THEN '第' + source.article_num + '条'
        WHEN source:Paragraph THEN '第' + source.paragraph_num + '項'
        ELSE ''
    END as sourceLocation,
    ref.primary_type as referenceType,
    ref.source_text as referenceText
ORDER BY law.law_title, source.article_num;

// 3. 多段階参照の探索（ハネ改正分析）
// ========================================

// 3段階までの間接参照を含む影響範囲
MATCH path = (amended:Article {article_id: $articleId})<-[:REFERENCES*1..3]-(affected)
WHERE affected:Article OR affected:Paragraph
WITH path, affected, length(path) as depth,
     [rel in relationships(path) | rel.primary_type] as referenceTypes
RETURN 
    depth,
    CASE
        WHEN affected:Article THEN affected.article_id
        WHEN affected:Paragraph THEN affected.paragraph_id
    END as affectedId,
    referenceTypes,
    // 影響経路を可読形式で表示
    reduce(s = '', node in nodes(path) | 
        s + CASE
            WHEN node:Article THEN ' -> 第' + node.article_num + '条'
            WHEN node:Paragraph THEN ' -> 第' + node.paragraph_num + '項'
            ELSE ''
        END
    ) as impactPath
ORDER BY depth, affectedId;

// 4. 参照タイプ別の分析
// ========================================

// 準用関係のネットワーク
MATCH (source)-[ref:REFERENCES {primary_type: 'APPLY'}]->(target)
WHERE source:Article AND target:Article
WITH source, target, ref
MATCH (sourceLaw:Law)-[:HAS_ARTICLE]->(source)
MATCH (targetLaw:Law)-[:HAS_ARTICLE]->(target)
RETURN 
    sourceLaw.law_title as sourceLawTitle,
    source.article_num as sourceArticleNum,
    targetLaw.law_title as targetLawTitle,
    target.article_num as targetArticleNum,
    ref.source_text as referenceText
ORDER BY sourceLaw.law_title, source.article_num;

// 読み替え規定の詳細
MATCH (source)-[ref:REFERENCES {primary_type: 'REPLACE'}]->(target)
WHERE ref.replace_details IS NOT NULL
RETURN 
    labels(source)[0] as sourceType,
    CASE
        WHEN source:Article THEN source.article_id
        WHEN source:Paragraph THEN source.paragraph_id
    END as sourceId,
    ref.replace_details.original_text as originalText,
    ref.replace_details.replacement_text as replacementText,
    labels(target)[0] as targetType,
    CASE
        WHEN target:Article THEN target.article_id
        WHEN target:Paragraph THEN target.paragraph_id
    END as targetId;

// 5. 複雑な参照パターンの検出
// ========================================

// 循環参照の検出
MATCH path = (start:Article)-[:REFERENCES*2..5]->(start)
RETURN 
    start.article_id as circularArticle,
    length(path) as cycleLength,
    [node in nodes(path) | 
        CASE
            WHEN node:Article THEN node.article_id
            ELSE null
        END
    ] as cyclePath
LIMIT 10;

// 参照の集中度分析（よく参照される条文）
MATCH (target:Article)<-[ref:REFERENCES]-()
WITH target, count(ref) as referenceCount
ORDER BY referenceCount DESC
LIMIT 20
MATCH (law:Law)-[:HAS_ARTICLE]->(target)
RETURN 
    law.law_title as lawTitle,
    target.article_num as articleNum,
    target.article_title as articleTitle,
    referenceCount;

// 6. AI解析結果の活用
// ========================================

// 人間による検証が必要な参照
MATCH (source)-[ref:REFERENCES]->(target)
WHERE ref.ai_analysis.confidence < 0.7 
   OR ref.ai_analysis.ambiguity_notes IS NOT NULL
   OR ref.human_verified = false
RETURN 
    labels(source)[0] as sourceType,
    CASE
        WHEN source:Article THEN source.article_id
        WHEN source:Paragraph THEN source.paragraph_id
    END as sourceId,
    ref.source_text as referenceText,
    ref.ai_analysis.confidence as confidence,
    ref.ai_analysis.ambiguity_notes as ambiguityNotes,
    labels(target)[0] as targetType
ORDER BY ref.ai_analysis.confidence ASC;

// 7. 統計情報クエリ
// ========================================

// 参照タイプ別の統計
MATCH ()-[ref:REFERENCES]->()
RETURN 
    ref.primary_type as referenceType,
    count(*) as count,
    avg(ref.ai_analysis.confidence) as avgConfidence
ORDER BY count DESC;

// 法令別の参照関係数
MATCH (law:Law)-[:HAS_ARTICLE]->(article:Article)
OPTIONAL MATCH (article)-[out:REFERENCES]->()
OPTIONAL MATCH (article)<-[in:REFERENCES]-()
WITH law, count(DISTINCT out) as outgoingRefs, count(DISTINCT in) as incomingRefs
RETURN 
    law.law_title as lawTitle,
    outgoingRefs,
    incomingRefs,
    outgoingRefs + incomingRefs as totalRefs
ORDER BY totalRefs DESC
LIMIT 50;

// 8. グラフ可視化用データ取得
// ========================================

// D3.js用のノードとエッジデータ
MATCH (source)-[ref:REFERENCES]->(target)
WHERE source:Article AND target:Article
WITH source, target, ref
LIMIT 100
MATCH (sourceLaw:Law)-[:HAS_ARTICLE]->(source)
MATCH (targetLaw:Law)-[:HAS_ARTICLE]->(target)
RETURN 
    // ノードデータ
    collect(DISTINCT {
        id: source.article_id,
        label: sourceLaw.law_title + ' 第' + source.article_num + '条',
        type: 'article',
        law: sourceLaw.law_title
    }) + collect(DISTINCT {
        id: target.article_id,
        label: targetLaw.law_title + ' 第' + target.article_num + '条',
        type: 'article',
        law: targetLaw.law_title
    }) as nodes,
    // エッジデータ
    collect({
        source: source.article_id,
        target: target.article_id,
        type: ref.primary_type,
        label: ref.primary_type
    }) as edges;