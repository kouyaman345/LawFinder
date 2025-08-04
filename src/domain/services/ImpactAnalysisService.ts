import { LawId, ArticleId } from '@domain/value-objects';
import { ReferenceRepository, LawRepository } from '@domain/repositories';

export interface ImpactAnalysisOptions {
  depth?: number;
  includeIndirect?: boolean;
  confidenceThreshold?: number;
}

export interface ImpactedNode {
  nodeId: string;
  nodeType: string;
  impactType: ImpactType;
  impactPath: string[];
  confidence: number;
  depth: number;
}

export interface ImpactAnalysisResult {
  amendedLawId: string;
  amendedArticles: number[];
  summary: {
    totalAffectedLaws: number;
    totalAffectedArticles: number;
    directImpacts: number;
    indirectImpacts: number;
    maxDepthReached: number;
  };
  affectedItems: AffectedItem[];
  executedAt: Date;
}

export interface AffectedItem {
  lawId: string;
  lawTitle: string;
  affectedArticles: AffectedArticle[];
}

export interface AffectedArticle {
  articleId: string;
  articleNum: number;
  impactType: ImpactType;
  impactPath: string[];
  confidence: number;
}

export type ImpactType = 
  | 'DirectApplication'
  | 'TextReplacement'
  | 'LegalFiction'
  | 'Exception'
  | 'General';

interface ProcessingNode {
  nodeId: string;
  nodeType: string;
  depth: number;
  path: string[];
}

export class ImpactAnalysisService {
  constructor(
    private readonly referenceRepository: ReferenceRepository,
    private readonly lawRepository: LawRepository
  ) {}

  async analyzeAmendmentImpact(
    amendedLawId: LawId,
    amendedArticles: number[],
    options: ImpactAnalysisOptions = {}
  ): Promise<ImpactAnalysisResult> {
    const depth = options.depth || 3;
    const includeIndirect = options.includeIndirect ?? true;
    const confidenceThreshold = options.confidenceThreshold || 0.7;
    
    const impactedNodes = new Map<string, ImpactedNode>();
    const toProcess: ProcessingNode[] = [];
    
    // 初期ノードの設定
    for (const articleNum of amendedArticles) {
      const articleId = ArticleId.generate(amendedLawId, articleNum);
      toProcess.push({
        nodeId: articleId.value,
        nodeType: 'article',
        depth: 0,
        path: [articleId.value]
      });
    }
    
    // 幅優先探索で影響を分析
    while (toProcess.length > 0) {
      const current = toProcess.shift()!;
      
      if (current.depth >= depth) continue;
      
      // 参照元を取得
      const references = await this.referenceRepository.findIncoming(
        current.nodeId,
        { minConfidence: confidenceThreshold }
      );
      
      for (const ref of references) {
        const impactedId = ref.sourceNode.id;
        
        if (!impactedNodes.has(impactedId)) {
          const impacted: ImpactedNode = {
            nodeId: impactedId,
            nodeType: ref.sourceNode.type,
            impactType: this.determineImpactType(ref),
            impactPath: [...current.path, impactedId],
            confidence: ref.referenceConfidence * (0.9 ** current.depth),
            depth: current.depth + 1
          };
          
          impactedNodes.set(impactedId, impacted);
          
          if (includeIndirect) {
            toProcess.push({
              nodeId: impactedId,
              nodeType: ref.sourceNode.type,
              depth: current.depth + 1,
              path: impacted.impactPath
            });
          }
        }
      }
    }
    
    return this.buildAnalysisResult(impactedNodes, amendedLawId, amendedArticles);
  }

  private determineImpactType(reference: any): ImpactType {
    switch (reference.referenceType) {
      case 'APPLY':
        return 'DirectApplication';
      case 'REPLACE':
        return 'TextReplacement';
      case 'DEEM':
        return 'LegalFiction';
      case 'EXCEPT':
        return 'Exception';
      default:
        return 'General';
    }
  }

  private async buildAnalysisResult(
    impactedNodes: Map<string, ImpactedNode>,
    amendedLawId: LawId,
    amendedArticles: number[]
  ): Promise<ImpactAnalysisResult> {
    const affectedByLaw = new Map<string, AffectedArticle[]>();
    let maxDepth = 0;
    let directCount = 0;
    let indirectCount = 0;

    for (const [_, node] of impactedNodes) {
      maxDepth = Math.max(maxDepth, node.depth);
      if (node.depth === 1) {
        directCount++;
      } else {
        indirectCount++;
      }

      const lawId = node.nodeId.split('_')[0];
      const articles = affectedByLaw.get(lawId) || [];
      
      if (node.nodeType === 'article') {
        articles.push({
          articleId: node.nodeId,
          articleNum: parseInt(node.nodeId.split('_art')[1]),
          impactType: node.impactType,
          impactPath: node.impactPath,
          confidence: node.confidence
        });
      }
      
      affectedByLaw.set(lawId, articles);
    }

    const affectedItems: AffectedItem[] = [];
    for (const [lawId, articles] of affectedByLaw) {
      const law = await this.lawRepository.findById(new LawId(lawId));
      if (law) {
        affectedItems.push({
          lawId: lawId,
          lawTitle: law.lawTitle,
          affectedArticles: articles
        });
      }
    }

    return {
      amendedLawId: amendedLawId.value,
      amendedArticles: amendedArticles,
      summary: {
        totalAffectedLaws: affectedByLaw.size,
        totalAffectedArticles: impactedNodes.size,
        directImpacts: directCount,
        indirectImpacts: indirectCount,
        maxDepthReached: maxDepth
      },
      affectedItems: affectedItems,
      executedAt: new Date()
    };
  }
}