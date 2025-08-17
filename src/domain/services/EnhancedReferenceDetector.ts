/**
 * 強化版参照検出器
 * 
 * e-Govと同等の精度を目指した高精度な参照検出実装
 * バージョン: 3.0.0
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

export class EnhancedReferenceDetector {
  private kanjiToNumber: Map<string, number>;
  private numberToKanji: Map<number, string>;
  private lawNameToId: Map<string, string>;
  
  constructor() {
    this.initializeKanjiMapping();
    this.initializeLawMapping();
  }
  
  /**
   * 漢数字変換テーブルの初期化
   */
  private initializeKanjiMapping(): void {
    this.kanjiToNumber = new Map([
      ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5],
      ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10],
      ['百', 100], ['千', 1000], ['万', 10000]
    ]);
    
    this.numberToKanji = new Map();
    this.kanjiToNumber.forEach((num, kanji) => {
      this.numberToKanji.set(num, kanji);
    });
  }
  
  /**
   * 法令名とIDのマッピング初期化
   */
  private initializeLawMapping(): void {
    this.lawNameToId = new Map([
      ['民法', '129AC0000000089'],
      ['商法', '132AC0000000048'],
      ['会社法', '417AC0000000086'],
      ['刑法', '140AC0000000045'],
      ['労働基準法', '322AC0000000049'],
      ['民事訴訟法', '109AC0000000109'],
      ['刑事訴訟法', '123AC0000000131'],
      ['憲法', '321CONSTITUTION'],
      ['行政手続法', '405AC0000000088'],
      ['破産法', '416AC0000000075']
    ]);
  }
  
  /**
   * 漢数字を数値に変換
   */
  private kanjiToArabic(kanjiStr: string): number {
    // 「第」と「条」を除去
    let cleaned = kanjiStr.replace(/[第条]/g, '');
    
    // 特殊ケース: 千二百三十四 のような複合数字
    if (cleaned.includes('千') || cleaned.includes('百') || cleaned.includes('十')) {
      let result = 0;
      let tempNum = 0;
      let lastMultiplier = 1;
      
      for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        const value = this.kanjiToNumber.get(char);
        
        if (!value) continue;
        
        if (value >= 10) {
          // 位の数字（十、百、千、万）
          if (tempNum === 0) tempNum = 1;
          if (value === 10000) {
            result += tempNum * value;
            tempNum = 0;
          } else {
            tempNum *= value;
          }
          lastMultiplier = value;
        } else {
          // 一桁の数字
          if (lastMultiplier >= 10) {
            result += tempNum;
            tempNum = value;
            lastMultiplier = 1;
          } else {
            tempNum = tempNum * 10 + value;
          }
        }
      }
      
      return result + tempNum;
    }
    
    // 単純な数字
    let result = 0;
    for (const char of cleaned) {
      const value = this.kanjiToNumber.get(char);
      if (value && value < 10) {
        result = result * 10 + value;
      }
    }
    
    return result;
  }
  
  /**
   * 相対参照を解決
   */
  private resolveRelativeReference(refType: string, currentArticle?: string): string | null {
    if (!currentArticle) return null;
    
    const currentNum = this.kanjiToArabic(currentArticle);
    if (!currentNum) return null;
    
    let targetNum: number;
    switch (refType) {
      case '前条':
        targetNum = currentNum - 1;
        break;
      case '次条':
        targetNum = currentNum + 1;
        break;
      case '前項':
      case '次項':
      case '同条':
        return currentArticle; // 同じ条文
      default:
        return null;
    }
    
    if (targetNum <= 0) return null;
    
    // 数値を漢数字条文形式に変換
    return this.arabicToKanjiArticle(targetNum);
  }
  
  /**
   * 数値を漢数字条文形式に変換
   */
  private arabicToKanjiArticle(num: number): string {
    // 簡易実装（完全版は複雑）
    const kanjiDigits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    
    if (num < 10) {
      return `第${kanjiDigits[num]}条`;
    } else if (num === 10) {
      return '第十条';
    } else if (num < 20) {
      return `第十${kanjiDigits[num - 10]}条`;
    } else if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      return `第${kanjiDigits[tens]}十${ones > 0 ? kanjiDigits[ones] : ''}条`;
    } else if (num < 1000) {
      const hundreds = Math.floor(num / 100);
      const remainder = num % 100;
      let result = `第${kanjiDigits[hundreds]}百`;
      if (remainder > 0) {
        const tens = Math.floor(remainder / 10);
        const ones = remainder % 10;
        if (tens > 0) {
          result += `${tens === 1 ? '十' : kanjiDigits[tens] + '十'}`;
        }
        if (ones > 0) {
          result += kanjiDigits[ones];
        }
      }
      return result + '条';
    } else {
      // 千以上の数
      const thousands = Math.floor(num / 1000);
      const remainder = num % 1000;
      let result = `第${thousands === 1 ? '千' : kanjiDigits[thousands] + '千'}`;
      
      if (remainder > 0) {
        const hundreds = Math.floor(remainder / 100);
        const tens = Math.floor((remainder % 100) / 10);
        const ones = remainder % 10;
        
        if (hundreds > 0) {
          result += `${hundreds === 1 ? '百' : kanjiDigits[hundreds] + '百'}`;
        }
        if (tens > 0) {
          result += `${tens === 1 ? '十' : kanjiDigits[tens] + '十'}`;
        }
        if (ones > 0) {
          result += kanjiDigits[ones];
        }
      }
      
      return result + '条';
    }
  }
  
  /**
   * 参照を検出（メインメソッド）
   */
  detectReferences(text: string, currentArticle?: string): Reference[] {
    const references: Reference[] = [];
    
    // 1. 外部法令参照（優先度高）
    references.push(...this.detectExternalReferences(text));
    
    // 2. 範囲参照
    references.push(...this.detectRangeReferences(text));
    
    // 3. 複数参照（及び、並びに）
    references.push(...this.detectMultipleReferences(text));
    
    // 4. 項・号参照
    references.push(...this.detectParagraphReferences(text));
    
    // 5. 内部参照（単独条文）
    references.push(...this.detectInternalReferences(text));
    
    // 6. 相対参照
    references.push(...this.detectRelativeReferences(text, currentArticle));
    
    // 7. 準用・適用
    references.push(...this.detectApplicationReferences(text));
    
    // 重複除去
    return this.removeDuplicates(references);
  }
  
  /**
   * 外部法令参照の検出
   */
  private detectExternalReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン: 「○○法第N条」
    const pattern = /([^、。\s（）]+法)(?:（[^）]+\）)?(?:第([一二三四五六七八九十百千万\d]+)条(?:第([一二三四五六七八九十\d]+)項)?)?/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const lawName = match[1];
      const articleNum = match[2];
      const paragraphNum = match[3];
      
      const lawId = this.lawNameToId.get(lawName);
      
      if (articleNum) {
        references.push({
          type: 'external',
          sourceText: match[0],
          targetLawId: lawId || null,
          targetLawName: lawName,
          targetArticleNumber: `第${articleNum}条`,
          confidence: lawId ? 0.95 : 0.8,
          metadata: paragraphNum ? { paragraph: `第${paragraphNum}項` } : undefined
        });
      }
    }
    
    return references;
  }
  
  /**
   * 範囲参照の検出
   */
  private detectRangeReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン: 「第N条から第M条まで」
    const pattern = /第([一二三四五六七八九十百千万\d]+)条から第([一二三四五六七八九十百千万\d]+)条まで/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const startNum = this.kanjiToArabic(`第${match[1]}条`);
      const endNum = this.kanjiToArabic(`第${match[2]}条`);
      
      // 範囲内のすべての条文を参照として追加
      for (let i = startNum; i <= endNum && i <= startNum + 100; i++) {
        const articleStr = this.arabicToKanjiArticle(i);
        references.push({
          type: 'range',
          sourceText: match[0],
          targetArticleNumber: articleStr,
          confidence: 0.9,
          metadata: { 
            rangeStart: this.arabicToKanjiArticle(startNum),
            rangeEnd: this.arabicToKanjiArticle(endNum)
          }
        });
      }
    }
    
    return references;
  }
  
  /**
   * 複数参照の検出
   */
  private detectMultipleReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン: 「第N条及び第M条」「第N条並びに第M条」
    const patterns = [
      /第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g,
      /第([一二三四五六七八九十百千万\d]+)条、第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // 各条文を個別の参照として追加
        for (let i = 1; i < match.length; i++) {
          if (match[i]) {
            const articleStr = `第${match[i]}条`;
            references.push({
              type: 'internal',
              sourceText: articleStr,
              targetArticleNumber: articleStr,
              confidence: 0.9
            });
          }
        }
      }
    }
    
    return references;
  }
  
  /**
   * 項・号参照の検出
   */
  private detectParagraphReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン: 「第N条第M項」「同条第M項第N号」
    const patterns = [
      /第([一二三四五六七八九十百千万\d]+)条第([一二三四五六七八九十\d]+)項/g,
      /同条第([一二三四五六七八九十\d]+)項(?:第([一二三四五六七八九十\d]+)号)?/g
    ];
    
    let match;
    
    // 第N条第M項
    match = null;
    while ((match = patterns[0].exec(text)) !== null) {
      references.push({
        type: 'internal',
        sourceText: match[0],
        targetArticleNumber: `第${match[1]}条`,
        confidence: 0.95,
        metadata: { paragraph: `第${match[2]}項` }
      });
    }
    
    // 同条第M項
    match = null;
    while ((match = patterns[1].exec(text)) !== null) {
      references.push({
        type: 'internal',
        sourceText: match[0],
        targetArticleNumber: '同条',
        confidence: 0.85,
        metadata: { 
          paragraph: `第${match[1]}項`,
          item: match[2] ? `第${match[2]}号` : undefined
        }
      });
    }
    
    return references;
  }
  
  /**
   * 内部参照の検出
   */
  private detectInternalReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン: 「第N条」（単独）
    const pattern = /第([一二三四五六七八九十百千万\d]+)条/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // 既に他のパターンで検出されていない場合のみ追加
      const articleStr = match[0];
      
      // 文脈チェック（法令名が前にない）
      const beforeText = text.substring(Math.max(0, match.index - 20), match.index);
      if (!beforeText.match(/[^、。\s]+法\s*$/)) {
        references.push({
          type: 'internal',
          sourceText: articleStr,
          targetArticleNumber: articleStr,
          confidence: 0.9
        });
      }
    }
    
    return references;
  }
  
  /**
   * 相対参照の検出
   */
  private detectRelativeReferences(text: string, currentArticle?: string): Reference[] {
    const references: Reference[] = [];
    
    const patterns = [
      { regex: /前条/g, type: '前条' },
      { regex: /次条/g, type: '次条' },
      { regex: /前項/g, type: '前項' },
      { regex: /次項/g, type: '次項' },
      { regex: /同条/g, type: '同条' }
    ];
    
    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const resolved = this.resolveRelativeReference(type, currentArticle);
        
        references.push({
          type: 'relative',
          sourceText: match[0],
          targetArticleNumber: resolved || type,
          confidence: resolved ? 0.95 : 0.7,
          metadata: { relativeType: type, currentArticle }
        });
      }
    }
    
    return references;
  }
  
  /**
   * 準用・適用参照の検出
   */
  private detectApplicationReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン: 「第N条...準用する」
    const pattern = /(第[一二三四五六七八九十百千万\d]+条(?:から第[一二三四五六七八九十百千万\d]+条まで)?)[^。]*準用/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const articleRef = match[1];
      
      // 範囲の場合は展開
      const rangeMatch = articleRef.match(/第([一二三四五六七八九十百千万\d]+)条から第([一二三四五六七八九十百千万\d]+)条まで/);
      
      if (rangeMatch) {
        const startNum = this.kanjiToArabic(`第${rangeMatch[1]}条`);
        const endNum = this.kanjiToArabic(`第${rangeMatch[2]}条`);
        
        for (let i = startNum; i <= endNum && i <= startNum + 100; i++) {
          const articleStr = this.arabicToKanjiArticle(i);
          references.push({
            type: 'application',
            sourceText: match[0],
            targetArticleNumber: articleStr,
            confidence: 0.85,
            metadata: { applicationType: '準用' }
          });
        }
      } else {
        references.push({
          type: 'application',
          sourceText: match[0],
          targetArticleNumber: articleRef,
          confidence: 0.85,
          metadata: { applicationType: '準用' }
        });
      }
    }
    
    return references;
  }
  
  /**
   * 重複を除去
   */
  private removeDuplicates(references: Reference[]): Reference[] {
    const seen = new Set<string>();
    const unique: Reference[] = [];
    
    for (const ref of references) {
      const key = `${ref.type}:${ref.targetArticleNumber}:${ref.targetLawId || 'internal'}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(ref);
      }
    }
    
    return unique;
  }
}