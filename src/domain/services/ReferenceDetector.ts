/**
 * 基本的な参照検出器
 * 
 * 法令文書内の参照を検出する基本実装
 */

export interface Reference {
  type: 'internal' | 'external' | 'relative' | 'structural' | 'range' | 'multiple' | 'application';
  sourceText: string;
  targetLawId?: string | null;
  targetLawName?: string | null;
  targetArticleNumber?: string | null;
  targetChapter?: string | null;
  targetSection?: string | null;
  confidence: number;
  metadata?: any;
}

export class ReferenceDetector {
  /**
   * 参照を検出
   */
  detectReferences(text: string, currentArticle?: string): Reference[] {
    const references: Reference[] = [];
    
    // 内部参照パターン
    const internalPatterns = [
      /第([一二三四五六七八九十百千万]+)条/g,
      /第(\d+)条/g,
      /前条/g,
      /次条/g,
      /同条/g
    ];
    
    for (const pattern of internalPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let type: Reference['type'] = 'internal';
        let targetArticle = match[0];
        
        if (match[0] === '前条' || match[0] === '次条') {
          type = 'relative';
        }
        
        references.push({
          type,
          sourceText: match[0],
          targetArticleNumber: targetArticle,
          confidence: 0.9
        });
      }
    }
    
    // 外部法令参照
    const externalPattern = /([^、。\s]+法)(?:（[^）]+\）)?第([一二三四五六七八九十百千万\d]+)条/g;
    let match;
    while ((match = externalPattern.exec(text)) !== null) {
      const lawName = match[1];
      const articleNumber = `第${match[2]}条`;
      
      // 法令IDのマッピング（簡易版）
      const lawIdMap: { [key: string]: string } = {
        '民法': '129AC0000000089',
        '商法': '132AC0000000048',
        '会社法': '417AC0000000086',
        '刑法': '140AC0000000045',
        '労働基準法': '322AC0000000049'
      };
      
      references.push({
        type: 'external',
        sourceText: match[0],
        targetLawId: lawIdMap[lawName] || null,
        targetLawName: lawName,
        targetArticleNumber: articleNumber,
        confidence: 0.85
      });
    }
    
    // 範囲参照
    const rangePattern = /第([一二三四五六七八九十百千万\d]+)条から第([一二三四五六七八九十百千万\d]+)条まで/g;
    while ((match = rangePattern.exec(text)) !== null) {
      const startArticle = `第${match[1]}条`;
      const endArticle = `第${match[2]}条`;
      
      references.push({
        type: 'range',
        sourceText: match[0],
        targetArticleNumber: startArticle,
        confidence: 0.8,
        metadata: { endArticle }
      });
    }
    
    // 準用
    const applicationPattern = /準用する/g;
    while ((match = applicationPattern.exec(text)) !== null) {
      // 準用の前に出現する条文を探す
      const beforeText = text.substring(Math.max(0, match.index - 100), match.index);
      const articleMatch = beforeText.match(/第([一二三四五六七八九十百千万\d]+)条/);
      
      if (articleMatch) {
        references.push({
          type: 'application',
          sourceText: articleMatch[0] + 'を準用',
          targetArticleNumber: articleMatch[0],
          confidence: 0.75
        });
      }
    }
    
    return references;
  }
}