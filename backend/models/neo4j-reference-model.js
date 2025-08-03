// Neo4j Reference Model Implementation
// 法令参照関係のNeo4jモデル実装

const neo4j = require('neo4j-driver');

class LawReferenceGraph {
    constructor(uri, user, password) {
        this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    }

    async close() {
        await this.driver.close();
    }

    /**
     * 法令間の参照関係を作成
     * @param {Object} reference - 参照情報
     */
    async createReference(reference) {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (source:${reference.sourceType} {${reference.sourceType.toLowerCase()}_id: $sourceId})
                MATCH (target:${reference.targetType} {${reference.targetType.toLowerCase()}_id: $targetId})
                CREATE (source)-[ref:REFERENCES {
                    reference_id: $referenceId,
                    source_text: $sourceText,
                    primary_type: $primaryType,
                    secondary_types: $secondaryTypes,
                    target_specification: $targetSpec,
                    conditions: $conditions,
                    ai_analysis: $aiAnalysis,
                    created_at: datetime()
                }]->(target)
                RETURN ref
            `, {
                sourceId: reference.sourceId,
                targetId: reference.targetId,
                referenceId: reference.referenceId,
                sourceText: reference.sourceText,
                primaryType: reference.primaryType,
                secondaryTypes: reference.secondaryTypes || [],
                targetSpec: reference.targetSpecification || {},
                conditions: reference.conditions || [],
                aiAnalysis: reference.aiAnalysis || {}
            });
            return result.records[0].get('ref');
        } finally {
            await session.close();
        }
    }

    /**
     * 特定の法令部分から参照している全ての関係を取得
     */
    async getOutgoingReferences(nodeId, nodeType = 'Article') {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (source:${nodeType} {${nodeType.toLowerCase()}_id: $nodeId})-[ref:REFERENCES]->(target)
                RETURN source, ref, target, labels(target) as targetLabels
                ORDER BY ref.created_at DESC
            `, { nodeId });
            
            return result.records.map(record => ({
                source: record.get('source').properties,
                reference: record.get('ref').properties,
                target: record.get('target').properties,
                targetType: record.get('targetLabels')[0]
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * 特定の法令部分を参照している全ての関係を取得（逆参照）
     */
    async getIncomingReferences(nodeId, nodeType = 'Article') {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (source)-[ref:REFERENCES]->(target:${nodeType} {${nodeType.toLowerCase()}_id: $nodeId})
                RETURN source, ref, target, labels(source) as sourceLabels
                ORDER BY ref.created_at DESC
            `, { nodeId });
            
            return result.records.map(record => ({
                source: record.get('source').properties,
                sourceType: record.get('sourceLabels')[0],
                reference: record.get('ref').properties,
                target: record.get('target').properties
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * ハネ改正の影響分析 - 多段階の参照を辿る
     */
    async analyzeAmendmentImpact(nodeId, nodeType = 'Article', maxDepth = 3) {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH path = (start:${nodeType} {${nodeType.toLowerCase()}_id: $nodeId})<-[:REFERENCES*1..${maxDepth}]-(affected)
                WITH path, affected, length(path) as depth
                RETURN DISTINCT 
                    affected,
                    labels(affected) as affectedType,
                    depth,
                    [node in nodes(path) | {
                        id: CASE 
                            WHEN node:Law THEN node.law_id
                            WHEN node:Article THEN node.article_id
                            WHEN node:Paragraph THEN node.paragraph_id
                            WHEN node:Item THEN node.item_id
                            ELSE null
                        END,
                        type: labels(node)[0],
                        title: COALESCE(node.law_title, node.article_title, node.content)
                    }] as pathNodes
                ORDER BY depth, affected.article_id
            `, { nodeId });
            
            return result.records.map(record => ({
                affected: record.get('affected').properties,
                affectedType: record.get('affectedType')[0],
                depth: record.get('depth').toNumber(),
                path: record.get('pathNodes')
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * 特定の参照タイプの関係のみを検索
     */
    async findReferencesByType(referenceType, limit = 100) {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (source)-[ref:REFERENCES {primary_type: $type}]->(target)
                RETURN source, ref, target,
                       labels(source) as sourceType,
                       labels(target) as targetType
                LIMIT $limit
            `, { type: referenceType, limit: neo4j.int(limit) });
            
            return result.records.map(record => ({
                source: record.get('source').properties,
                sourceType: record.get('sourceType')[0],
                reference: record.get('ref').properties,
                target: record.get('target').properties,
                targetType: record.get('targetType')[0]
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * AI解析の信頼度が低い参照を取得（人間レビュー用）
     */
    async getLowConfidenceReferences(threshold = 0.7) {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH (source)-[ref:REFERENCES]->(target)
                WHERE ref.ai_analysis.confidence < $threshold
                RETURN source, ref, target,
                       labels(source) as sourceType,
                       labels(target) as targetType
                ORDER BY ref.ai_analysis.confidence ASC
            `, { threshold });
            
            return result.records.map(record => ({
                source: record.get('source').properties,
                sourceType: record.get('sourceType')[0],
                reference: record.get('ref').properties,
                target: record.get('target').properties,
                targetType: record.get('targetType')[0]
            }));
        } finally {
            await session.close();
        }
    }

    /**
     * 参照関係の統計情報を取得
     */
    async getReferenceStatistics() {
        const session = this.driver.session();
        try {
            const result = await session.run(`
                MATCH ()-[ref:REFERENCES]->()
                WITH ref.primary_type as type, count(*) as count
                RETURN type, count
                ORDER BY count DESC
            `);
            
            const stats = {};
            result.records.forEach(record => {
                stats[record.get('type')] = record.get('count').toNumber();
            });
            
            return stats;
        } finally {
            await session.close();
        }
    }
}

// 使用例
async function example() {
    const graph = new LawReferenceGraph('bolt://localhost:7687', 'neo4j', 'password');
    
    try {
        // 1. 参照関係の作成
        await graph.createReference({
            sourceId: '145AC0000000009_art526_para2',
            sourceType: 'Paragraph',
            targetId: '320AC0000000046_art94_para2',
            targetType: 'Paragraph',
            referenceId: 'ref_' + Date.now(),
            sourceText: '民法第九十四条第二項の規定は、前項の場合について準用する。',
            primaryType: 'APPLY',
            secondaryTypes: ['準用'],
            targetSpecification: {
                law: '民法',
                article: 94,
                paragraph: 2
            },
            aiAnalysis: {
                confidence: 0.95,
                targetResolved: true,
                reasoning: '法令名と条項が明確に指定されている'
            }
        });
        
        // 2. 改正影響分析
        const impacts = await graph.analyzeAmendmentImpact('320AC0000000046_art94', 'Article', 3);
        console.log('影響を受ける条文:', impacts);
        
        // 3. 低信頼度参照の取得
        const lowConfidence = await graph.getLowConfidenceReferences(0.7);
        console.log('レビューが必要な参照:', lowConfidence);
        
    } finally {
        await graph.close();
    }
}

module.exports = LawReferenceGraph;