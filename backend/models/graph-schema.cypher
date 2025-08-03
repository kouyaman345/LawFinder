// Neo4j Graph Schema for Law Reference System
// 法令参照関係グラフDBスキーマ

// ========================================
// ノード定義
// ========================================

// 法令ノード
CREATE CONSTRAINT law_id_unique IF NOT EXISTS
FOR (law:Law) 
REQUIRE law.law_id IS UNIQUE;

// 条文ノード  
CREATE CONSTRAINT article_id_unique IF NOT EXISTS
FOR (article:Article)
REQUIRE article.article_id IS UNIQUE;

// 項ノード
CREATE CONSTRAINT paragraph_id_unique IF NOT EXISTS  
FOR (paragraph:Paragraph)
REQUIRE paragraph.paragraph_id IS UNIQUE;

// 号ノード
CREATE CONSTRAINT item_id_unique IF NOT EXISTS
FOR (item:Item)  
REQUIRE item.item_id IS UNIQUE;

// ========================================
// インデックス定義
// ========================================

CREATE INDEX law_title_index IF NOT EXISTS
FOR (law:Law)
ON (law.law_title);

CREATE INDEX article_num_index IF NOT EXISTS
FOR (article:Article)
ON (article.article_num);

// ========================================
// サンプルデータ作成
// ========================================

// 法令作成
CREATE (law1:Law {
    law_id: '320AC0000000046',
    law_title: '民法',
    law_type: 'Act',
    promulgate_date: date('1896-04-27')
});

CREATE (law2:Law {
    law_id: '145AC0000000009',  
    law_title: '商法',
    law_type: 'Act',
    promulgate_date: date('1899-03-09')
});

// 条文作成
CREATE (art1:Article {
    article_id: '320AC0000000046_art94',
    article_num: 94,
    article_title: '（通謀虚偽表示）',
    content: '相手方と通じてした虚偽の意思表示は、無効とする。'
});

CREATE (art2:Article {
    article_id: '320AC0000000046_art95',
    article_num: 95,
    article_title: '（錯誤）',
    content: '意思表示は、次に掲げる錯誤に基づくものであって...'
});

// 項作成
CREATE (para1:Paragraph {
    paragraph_id: '320AC0000000046_art94_para2',
    paragraph_num: 2,
    content: '前項の規定による意思表示の無効は、善意の第三者に対抗することができない。'
});

// 号作成
CREATE (item1:Item {
    item_id: '320AC0000000046_art95_para1_item1',
    item_num: 1,
    content: '意思表示に対応する意思を欠く錯誤'
});

// ========================================
// リレーション作成
// ========================================

// 構造的リレーション
MATCH (law1:Law {law_id: '320AC0000000046'})
MATCH (art1:Article {article_id: '320AC0000000046_art94'})
CREATE (law1)-[:HAS_ARTICLE]->(art1);

MATCH (art1:Article {article_id: '320AC0000000046_art94'})
MATCH (para1:Paragraph {paragraph_id: '320AC0000000046_art94_para2'})
CREATE (art1)-[:HAS_PARAGRAPH]->(para1);

// 参照リレーション例1: 条文から条文への準用
MATCH (source:Article {article_id: '145AC0000000009_art526'})
MATCH (target:Article {article_id: '320AC0000000046_art94'})
CREATE (source)-[:REFERENCES {
    reference_id: 'ref_001',
    source_text: '民法第九十四条第二項の規定は、前項の場合について準用する。',
    primary_type: 'APPLY',
    secondary_types: ['準用'],
    target_specification: {
        target_type: 'paragraph',
        target_num: 2
    },
    conditions: [],
    ai_analysis: {
        confidence: 0.95,
        target_resolved: true,
        verified_at: datetime(),
        reasoning: '明確な法令名と条項番号が指定されている'
    }
}]->(target);

// 参照リレーション例2: 項から項への読み替え
MATCH (source:Paragraph {paragraph_id: '145AC0000000009_art526_para2'})  
MATCH (target:Paragraph {paragraph_id: '320AC0000000046_art94_para2'})
CREATE (source)-[:REFERENCES {
    reference_id: 'ref_002',
    source_text: '「善意の第三者」とあるのは「善意かつ無重過失の第三者」と読み替える',
    primary_type: 'REPLACE',
    secondary_types: ['読み替え'],
    replace_details: {
        original_text: '善意の第三者',
        replacement_text: '善意かつ無重過失の第三者'
    },
    ai_analysis: {
        confidence: 0.98,
        target_resolved: true,
        verified_at: datetime()
    }
}]->(target);

// ========================================
// クエリ例
// ========================================

// 1. 特定の条文が参照している全ての条文を取得
MATCH (source:Article {article_id: '145AC0000000009_art526'})-[ref:REFERENCES]->(target)
RETURN source, ref, target;

// 2. 特定の条文を参照している全ての条文を取得（逆参照）
MATCH (source)-[ref:REFERENCES]->(target:Article {article_id: '320AC0000000046_art94'})
RETURN source, ref, target;

// 3. 多段階参照の探索（ハネ改正の影響分析）
MATCH path = (start:Article {article_id: '320AC0000000046_art94'})<-[:REFERENCES*1..3]-(affected)
RETURN path, length(path) as depth
ORDER BY depth;

// 4. 特定の参照タイプのみを抽出
MATCH (source)-[ref:REFERENCES {primary_type: 'APPLY'}]->(target)
RETURN source.article_id, ref.source_text, target.article_id;

// 5. 信頼度が低い参照を人間レビュー用に抽出
MATCH (source)-[ref:REFERENCES]->(target)
WHERE ref.ai_analysis.confidence < 0.7
RETURN source, ref, target
ORDER BY ref.ai_analysis.confidence ASC;