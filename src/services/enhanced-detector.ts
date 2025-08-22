/**
 * 拡張参照検出エンジン
 * 詳細な位置情報を含む参照検出
 */

import { 
  EnhancedReference, 
  DetectedReference, 
  ReferenceType, 
  DetectionMethod,
  StructuralPosition,
  TextPosition,
  ReferenceDetectionResult,
  toDetectedReference
} from '../types/reference';
import { v4 as uuidv4 } from 'uuid';

export class EnhancedReferenceDetector {
  private version = '2.0.0';
  private currentContext: StructuralPosition | null = null;
  
  /**
   * XMLから現在のコンテキスト（構造的位置）を抽出
   */
  private extractContext(xml: string, position: number): StructuralPosition {
    // XMLを解析して現在位置の構造情報を取得
    const lines = xml.substring(0, position).split('\n');
    const lineNumber = lines.length;
    
    // 条文番号を探す
    const articleMatch = xml.substring(Math.max(0, position - 1000), position)
      .match(/<ArticleNum>第([０-９0-9]+)条/);
    
    // 項番号を探す
    const paragraphMatch = xml.substring(Math.max(0, position - 500), position)
      .match(/<ParagraphNum>([０-９0-9]+)</);
    
    // 号番号を探す
    const itemMatch = xml.substring(Math.max(0, position - 200), position)
      .match(/<ItemNum>([０-９0-9]+)</);
    
    return {
      lawId: this.currentContext?.lawId || '',
      lawName: this.currentContext?.lawName,
      articleNumber: articleMatch ? `第${this.normalizeNumber(articleMatch[1])}条` : '',
      paragraphNumber: paragraphMatch ? this.kanjiToNumber(paragraphMatch[1]) : undefined,
      itemNumber: itemMatch ? itemMatch[1] : undefined
    };
  }
  
  /**
   * テキスト位置情報を生成
   */
  private createTextPosition(
    text: string, 
    match: RegExpExecArray,
    fullText: string
  ): TextPosition {
    const startPosition = match.index || 0;
    const endPosition = startPosition + match[0].length;
    
    // 行番号を計算
    const beforeText = fullText.substring(0, startPosition);
    const lineNumber = beforeText.split('\n').length;
    
    // 列番号を計算
    const lastNewlineIndex = beforeText.lastIndexOf('\n');
    const columnNumber = lastNewlineIndex === -1 ? 
      startPosition + 1 : 
      startPosition - lastNewlineIndex;
    
    return {
      text: match[0],
      startPosition,
      endPosition,
      lineNumber,
      columnNumber
    };
  }
  
  /**
   * 拡張参照を生成
   */
  private createEnhancedReference(
    source: { position: TextPosition; structural: StructuralPosition },
    target: { 
      lawId: string; 
      lawName: string; 
      structural: Partial<StructuralPosition> 
    },
    type: ReferenceType,
    confidence: number,
    method: DetectionMethod
  ): EnhancedReference {
    // コンテキストを抽出（前後100文字）
    const contextStart = Math.max(0, source.position.startPosition - 100);
    const contextEnd = source.position.endPosition + 100;
    
    return {
      id: uuidv4(),
      source: {
        position: source.position,
        structural: source.structural,
        context: `...${source.position.text}...` // 簡略化
      },
      target,
      metadata: {
        type,
        confidence,
        detectionMethod: method,
        detectedAt: new Date(),
        version: this.version
      }
    };
  }
  
  /**
   * 条文参照パターンの検出（位置情報付き）
   */
  private detectArticleReferences(text: string): EnhancedReference[] {
    const references: EnhancedReference[] = [];
    
    // パターン: 法令名＋条文
    const pattern = /([^、。\s（）「」『』]+(?:法|令|規則|条例))第([０-９0-9]+)条(?:第([０-９0-9]+)項)?(?:第([０-９0-9]+)号)?/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const lawName = match[1];
      const articleNum = this.normalizeNumber(match[2]);
      const paragraphNum = match[3] ? this.kanjiToNumber(match[3]) : undefined;
      const itemNum = match[4] ? match[4] : undefined;
      
      // テキスト位置を生成
      const textPosition = this.createTextPosition(text, match, text);
      
      // 構造的位置を生成
      const sourceStructural = this.extractContext(text, match.index || 0);
      
      // 参照先の構造的位置
      const targetStructural: Partial<StructuralPosition> = {
        articleNumber: `第${articleNum}条`,
        paragraphNumber: paragraphNum,
        itemNumber: itemNum
      };
      
      // 拡張参照を作成
      const enhancedRef = this.createEnhancedReference(
        { position: textPosition, structural: sourceStructural },
        {
          lawId: this.getLawId(lawName),
          lawName: lawName,
          structural: targetStructural
        },
        'external',
        0.95,
        'pattern'
      );
      
      references.push(enhancedRef);
    }
    
    return references;
  }
  
  /**
   * 相対参照の検出（位置情報付き）
   */
  private detectRelativeReferences(text: string): EnhancedReference[] {
    const references: EnhancedReference[] = [];
    
    // パターン: 前条、次条、前項、次項など
    const patterns = [
      { regex: /前条/g, type: 'previous_article' },
      { regex: /次条/g, type: 'next_article' },
      { regex: /前項/g, type: 'previous_paragraph' },
      { regex: /次項/g, type: 'next_paragraph' },
      { regex: /前([二三四五六七八九十]+)条/g, type: 'previous_n_articles' },
      { regex: /前([二三四五六七八九十]+)項/g, type: 'previous_n_paragraphs' }
    ];
    
    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const textPosition = this.createTextPosition(text, match, text);
        const sourceStructural = this.extractContext(text, match.index || 0);
        
        // 相対参照を解決
        const targetStructural = this.resolveRelativeReference(
          sourceStructural,
          type,
          match[1] // 数値（ある場合）
        );
        
        const enhancedRef = this.createEnhancedReference(
          { position: textPosition, structural: sourceStructural },
          {
            lawId: sourceStructural.lawId,
            lawName: sourceStructural.lawName || '',
            structural: targetStructural
          },
          'relative',
          0.9,
          'relative'
        );
        
        references.push(enhancedRef);
      }
    }
    
    return references;
  }
  
  /**
   * 範囲参照の検出（位置情報付き）
   */
  private detectRangeReferences(text: string): EnhancedReference[] {
    const references: EnhancedReference[] = [];
    
    // パターン: 第X条から第Y条まで
    const pattern = /第([０-９0-9]+)条(?:第([０-９0-9]+)項)?から第([０-９0-9]+)条(?:第([０-９0-9]+)項)?まで/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const textPosition = this.createTextPosition(text, match, text);
      const sourceStructural = this.extractContext(text, match.index || 0);
      
      const startArticle = this.normalizeNumber(match[1]);
      const startParagraph = match[2] ? this.kanjiToNumber(match[2]) : undefined;
      const endArticle = this.normalizeNumber(match[3]);
      const endParagraph = match[4] ? this.kanjiToNumber(match[4]) : undefined;
      
      const enhancedRef: EnhancedReference = {
        id: uuidv4(),
        source: {
          position: textPosition,
          structural: sourceStructural
        },
        target: {
          lawId: sourceStructural.lawId,
          lawName: sourceStructural.lawName || '',
          structural: {},
          range: {
            start: {
              articleNumber: `第${startArticle}条`,
              paragraphNumber: startParagraph
            },
            end: {
              articleNumber: `第${endArticle}条`,
              paragraphNumber: endParagraph
            },
            inclusive: true
          }
        },
        metadata: {
          type: 'range',
          confidence: 0.95,
          detectionMethod: 'pattern',
          detectedAt: new Date(),
          version: this.version
        }
      };
      
      references.push(enhancedRef);
    }
    
    return references;
  }
  
  /**
   * メイン検出メソッド
   */
  async detectReferences(
    text: string,
    lawId?: string,
    lawName?: string
  ): Promise<ReferenceDetectionResult> {
    const startTime = Date.now();
    
    // コンテキストを設定
    if (lawId) {
      this.currentContext = {
        lawId,
        lawName,
        articleNumber: ''
      };
    }
    
    // 各種パターンで検出
    const articleRefs = this.detectArticleReferences(text);
    const relativeRefs = this.detectRelativeReferences(text);
    const rangeRefs = this.detectRangeReferences(text);
    
    // すべての参照を統合
    const allReferences = [
      ...articleRefs,
      ...relativeRefs,
      ...rangeRefs
    ];
    
    // 重複を除去
    const uniqueReferences = this.removeDuplicates(allReferences);
    
    // 統計を生成
    const statistics = this.generateStatistics(uniqueReferences);
    
    return {
      references: uniqueReferences,
      statistics,
      processingTime: Date.now() - startTime
    };
  }
  
  /**
   * 後方互換性のための検出メソッド
   */
  async detectReferencesCompat(
    text: string,
    lawId?: string
  ): Promise<DetectedReference[]> {
    const result = await this.detectReferences(text, lawId);
    return result.references.map(toDetectedReference);
  }
  
  // === ユーティリティメソッド ===
  
  private normalizeNumber(num: string): string {
    // 全角数字を半角に変換
    return num.replace(/[０-９]/g, (char) => {
      return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
    });
  }
  
  private kanjiToNumber(kanji: string): number {
    const kanjiMap: Record<string, number> = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
      '二十': 20, '三十': 30, '四十': 40, '五十': 50,
      '百': 100, '千': 1000
    };
    
    return kanjiMap[kanji] || parseInt(this.normalizeNumber(kanji)) || 0;
  }
  
  private getLawId(lawName: string): string {
    // 法令名から法令IDを取得（簡略版）
    const lawIdMap: Record<string, string> = {
      '民法': '129AC0000000089',
      '商法': '132AC0000000048',
      '刑法': '140AC0000000045',
      '会社法': '417AC0000000086',
      '労働基準法': '322AC0000000049'
    };
    
    return lawIdMap[lawName] || '';
  }
  
  private resolveRelativeReference(
    current: StructuralPosition,
    type: string,
    n?: string
  ): Partial<StructuralPosition> {
    const currentArticleNum = parseInt(
      current.articleNumber.replace(/[^0-9]/g, '')
    );
    
    switch (type) {
      case 'previous_article':
        return { articleNumber: `第${currentArticleNum - 1}条` };
      case 'next_article':
        return { articleNumber: `第${currentArticleNum + 1}条` };
      case 'previous_paragraph':
        return {
          articleNumber: current.articleNumber,
          paragraphNumber: (current.paragraphNumber || 2) - 1
        };
      case 'next_paragraph':
        return {
          articleNumber: current.articleNumber,
          paragraphNumber: (current.paragraphNumber || 1) + 1
        };
      case 'previous_n_articles':
        const nArticles = n ? this.kanjiToNumber(n) : 1;
        return { articleNumber: `第${currentArticleNum - nArticles}条` };
      case 'previous_n_paragraphs':
        const nParagraphs = n ? this.kanjiToNumber(n) : 1;
        return {
          articleNumber: current.articleNumber,
          paragraphNumber: (current.paragraphNumber || nParagraphs + 1) - nParagraphs
        };
      default:
        return {};
    }
  }
  
  private removeDuplicates(refs: EnhancedReference[]): EnhancedReference[] {
    const seen = new Set<string>();
    return refs.filter(ref => {
      const key = `${ref.source.position.startPosition}-${ref.target.lawId}-${ref.target.structural.articleNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  private generateStatistics(refs: EnhancedReference[]) {
    const byType: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let high = 0, medium = 0, low = 0;
    
    refs.forEach(ref => {
      // タイプ別
      byType[ref.metadata.type] = (byType[ref.metadata.type] || 0) + 1;
      
      // メソッド別
      byMethod[ref.metadata.detectionMethod] = 
        (byMethod[ref.metadata.detectionMethod] || 0) + 1;
      
      // 信頼度別
      if (ref.metadata.confidence >= 0.9) high++;
      else if (ref.metadata.confidence >= 0.7) medium++;
      else low++;
    });
    
    return {
      total: refs.length,
      byType: byType as Record<ReferenceType, number>,
      byConfidence: { high, medium, low },
      byMethod: byMethod as Record<DetectionMethod, number>
    };
  }
}