/**
 * 強化版参照検出器 v3.4.0
 * 
 * 法令種別（憲法・法律・政令・省令・規則等）に対応した高精度参照検出
 * v3.3.0からの改善点：
 * - 法令種別ごとの参照パターン対応
 * - より多くの法令名認識
 * - 政令・省令特有のパターン対応
 */

export interface Reference {
  type: 'internal' | 'external' | 'relative' | 'structural' | 'range' | 'multiple' | 'application';
  sourceText: string;
  text?: string;
  targetLawId?: string | null;
  targetLaw?: string | null;
  targetArticleNumber?: string | null;
  targetArticle?: string | null;
  targetChapter?: string | null;
  targetSection?: string | null;
  confidence: number;
  metadata?: any;
}

interface ReferenceCandidate extends Reference {
  startPos: number;
  endPos: number;
  priority: number;
}

export class EnhancedReferenceDetectorV34 {
  private kanjiToNumber: Map<string, number>;
  private numberToKanji: Map<number, string>;
  private lawNameToId: Map<string, string>;
  private lawTypePatterns: Map<string, RegExp>;
  
  constructor() {
    this.initializeKanjiMapping();
    this.initializeLawMapping();
    this.initializeLawTypePatterns();
  }
  
  /**
   * 漢数字変換テーブルの初期化
   */
  private initializeKanjiMapping(): void {
    this.kanjiToNumber = new Map([
      ['零', 0], ['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5],
      ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10],
      ['百', 100], ['千', 1000], ['万', 10000]
    ]);
    
    this.numberToKanji = new Map();
    this.kanjiToNumber.forEach((num, kanji) => {
      this.numberToKanji.set(num, kanji);
    });
  }
  
  /**
   * 法令名とIDのマッピング初期化（拡張版）
   */
  private initializeLawMapping(): void {
    this.lawNameToId = new Map([
      // 憲法
      ['日本国憲法', '321CONSTITUTION'],
      ['憲法', '321CONSTITUTION'],
      
      // 基本法律
      ['民法', '129AC0000000089'],
      ['商法', '132AC0000000048'],
      ['会社法', '417AC0000000086'],
      ['刑法', '140AC0000000045'],
      ['民事訴訟法', '109AC0000000109'],
      ['刑事訴訟法', '123AC0000000131'],
      
      // 労働法
      ['労働基準法', '322AC0000000049'],
      ['労働組合法', '324AC0000000174'],
      ['労働関係調整法', '321AC0000000025'],
      
      // 行政法
      ['行政手続法', '405AC0000000088'],
      ['行政不服審査法', '439AC0000000068'],
      ['行政事件訴訟法', '337AC0000000139'],
      
      // 知的財産法
      ['特許法', '334AC0000000121'],
      ['著作権法', '345AC0000000048'],
      ['商標法', '334AC0000000127'],
      
      // 税法
      ['所得税法', '340AC0000000033'],
      ['法人税法', '340AC0000000034'],
      ['消費税法', '363AC0000000108'],
      
      // その他重要法令
      ['破産法', '416AC0000000075'],
      ['個人情報保護法', '415AC0000000057'],
      ['独占禁止法', '322AC0000000054']
    ]);
  }
  
  /**
   * 法令種別パターンの初期化
   */
  private initializeLawTypePatterns(): void {
    this.lawTypePatterns = new Map([
      // 政令パターン（例：○○法施行令）
      ['政令', /([^、。\s]+(?:施行令|政令))(?:第([一二三四五六七八九十百千万\d]+)条)?/g],
      
      // 省令パターン（例：○○法施行規則、○○省令）
      ['省令', /([^、。\s]+(?:施行規則|省令|規則))(?:第([一二三四五六七八九十百千万\d]+)条)?/g],
      
      // 条例パターン
      ['条例', /([^、。\s]+条例)(?:第([一二三四五六七八九十百千万\d]+)条)?/g],
      
      // 規則パターン
      ['規則', /([^、。\s]+規則)(?:第([一二三四五六七八九十百千万\d]+)条)?/g]
    ]);
  }
  
  /**
   * 漢数字を数値に変換
   */
  private kanjiToArabic(kanjiStr: string): number {
    if (!kanjiStr) return 0;
    
    let cleaned = kanjiStr.replace(/[第条]/g, '');
    if (!cleaned) return 0;
    
    const arabicNum = parseInt(cleaned);
    if (!isNaN(arabicNum)) return arabicNum;
    
    let result = 0;
    let currentNum = 0;
    let inThousands = false;
    
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      const value = this.kanjiToNumber.get(char);
      
      if (!value && value !== 0) continue;
      
      if (value === 10000) {
        result += (currentNum || 1) * value;
        currentNum = 0;
        inThousands = false;
      } else if (value === 1000) {
        currentNum = (currentNum || 1) * value;
        inThousands = true;
      } else if (value === 100) {
        if (inThousands) {
          currentNum += (cleaned[i-1] && this.kanjiToNumber.get(cleaned[i-1])! < 10 ? this.kanjiToNumber.get(cleaned[i-1])! : 1) * value;
        } else {
          currentNum = (currentNum || 1) * value;
        }
      } else if (value === 10) {
        if (currentNum >= 100) {
          currentNum += (cleaned[i-1] && this.kanjiToNumber.get(cleaned[i-1])! < 10 ? this.kanjiToNumber.get(cleaned[i-1])! : 1) * value;
        } else {
          currentNum = (currentNum || 1) * value;
        }
      } else if (value < 10) {
        if (currentNum === 0) {
          currentNum = value;
        } else if (currentNum % 10 === 0) {
          currentNum += value;
        } else {
          currentNum = currentNum * 10 + value;
        }
      }
    }
    
    return result + currentNum;
  }
  
  /**
   * 数値を漢数字条文形式に変換
   */
  private arabicToKanjiArticle(num: number): string {
    if (num <= 0) return '';
    
    const kanjiDigits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    let result = '第';
    
    if (num >= 1000) {
      const thousands = Math.floor(num / 1000);
      if (thousands > 1) result += kanjiDigits[thousands];
      result += '千';
      num %= 1000;
    }
    
    if (num >= 100) {
      const hundreds = Math.floor(num / 100);
      if (hundreds > 1) result += kanjiDigits[hundreds];
      result += '百';
      num %= 100;
    }
    
    if (num >= 10) {
      const tens = Math.floor(num / 10);
      if (tens > 1) result += kanjiDigits[tens];
      result += '十';
      num %= 10;
    }
    
    if (num > 0) {
      result += kanjiDigits[num];
    }
    
    return result + '条';
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
      default:
        return null;
    }
    
    if (targetNum <= 0) return null;
    return this.arabicToKanjiArticle(targetNum);
  }
  
  /**
   * メインの参照検出メソッド（2パス処理）
   */
  detectReferences(text: string, currentArticle?: string): Reference[] {
    // Pass 1: すべての候補を収集
    const candidates = this.collectAllCandidates(text, currentArticle);
    
    // Pass 2: 統合・重複除去・優先順位付け
    const resolved = this.resolveConflicts(candidates);
    
    // 正規化して返す
    return this.normalizeReferences(resolved);
  }
  
  /**
   * Pass 1: すべての参照候補を収集
   */
  private collectAllCandidates(text: string, currentArticle?: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    
    // 各種パターンで候補を収集
    candidates.push(...this.collectExternalCandidates(text));
    candidates.push(...this.collectLawTypeCandidates(text)); // 新規：法令種別対応
    candidates.push(...this.collectRangeCandidates(text));
    candidates.push(...this.collectApplicationCandidates(text));
    candidates.push(...this.collectParagraphCandidates(text, currentArticle));
    candidates.push(...this.collectMultipleCandidates(text));
    candidates.push(...this.collectInternalCandidates(text));
    candidates.push(...this.collectRelativeCandidates(text, currentArticle));
    
    return candidates;
  }
  
  /**
   * 外部法令参照の候補収集（拡張版）
   */
  private collectExternalCandidates(text: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    
    // すべての登録法令名でパターンを構築
    const lawNames = Array.from(this.lawNameToId.keys()).join('|');
    const pattern = new RegExp(
      `(${lawNames})(第[一二三四五六七八九十百千万\\d]+条)(?:第([一二三四五六七八九十\\d]+)項)?`,
      'g'
    );
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const lawName = match[1];
      const articleText = match[2];
      const paragraphNum = match[3];
      const lawId = this.lawNameToId.get(lawName);
      
      candidates.push({
        type: 'external',
        sourceText: match[0],
        text: match[0],
        targetLawId: lawId || null,
        targetLaw: lawName,
        targetArticleNumber: articleText,
        targetArticle: articleText,
        confidence: 0.95,
        metadata: paragraphNum ? { paragraph: `第${paragraphNum}項` } : undefined,
        startPos: match.index,
        endPos: match.index + match[0].length,
        priority: 10
      });
    }
    
    return candidates;
  }
  
  /**
   * 法令種別特有の参照候補収集
   */
  private collectLawTypeCandidates(text: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    
    for (const [typeName, pattern] of this.lawTypePatterns) {
      let match;
      const regex = new RegExp(pattern);
      
      while ((match = regex.exec(text)) !== null) {
        const lawName = match[1];
        const articleNum = match[2];
        
        // 既知の法令名と重複しない場合のみ追加
        if (!this.lawNameToId.has(lawName)) {
          if (articleNum) {
            const articleText = `第${articleNum}条`;
            candidates.push({
              type: 'external',
              sourceText: match[0],
              text: match[0],
              targetLawId: null,
              targetLaw: lawName,
              targetArticleNumber: articleText,
              targetArticle: articleText,
              confidence: 0.85,
              metadata: { lawType: typeName },
              startPos: match.index,
              endPos: match.index + match[0].length,
              priority: 9
            });
          }
        }
      }
    }
    
    return candidates;
  }
  
  /**
   * 範囲参照の候補収集
   */
  private collectRangeCandidates(text: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    const pattern = /(第[一二三四五六七八九十百千万\d]+条から第[一二三四五六七八九十百千万\d]+条まで)/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const rangeText = match[1];
      
      // 準用文脈の判定
      const afterContext = text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 30));
      const isApplication = afterContext.includes('準用');
      
      const rangeMatch = rangeText.match(/第([一二三四五六七八九十百千万\d]+)条から第([一二三四五六七八九十百千万\d]+)条まで/);
      if (rangeMatch) {
        const startNum = this.kanjiToArabic(`第${rangeMatch[1]}条`);
        const endNum = this.kanjiToArabic(`第${rangeMatch[2]}条`);
        
        if (startNum > 0 && endNum > 0 && startNum <= endNum && endNum - startNum <= 100) {
          for (let i = startNum; i <= endNum; i++) {
            const articleStr = this.arabicToKanjiArticle(i);
            candidates.push({
              type: isApplication ? 'application' : 'range',
              sourceText: rangeText,
              text: rangeText,
              targetArticleNumber: articleStr,
              targetArticle: articleStr,
              confidence: 0.9,
              metadata: {
                rangeStart: this.arabicToKanjiArticle(startNum),
                rangeEnd: this.arabicToKanjiArticle(endNum),
                isRangeMember: true,
                applicationType: isApplication ? '準用' : undefined
              },
              startPos: match.index,
              endPos: match.index + match[0].length,
              priority: isApplication ? 7 : 8
            });
          }
        }
      }
    }
    
    return candidates;
  }
  
  /**
   * 準用参照の候補収集
   */
  private collectApplicationCandidates(text: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    
    const singlePattern = /(第[一二三四五六七八九十百千万\d]+条)(?:第[一二三四五六七八九十\d]+項)?の規定[はを][^。]*準用/g;
    
    let match;
    while ((match = singlePattern.exec(text)) !== null) {
      const articleText = match[1];
      
      if (!articleText.includes('から')) {
        candidates.push({
          type: 'application',
          sourceText: match[0],
          text: articleText,
          targetArticleNumber: articleText,
          targetArticle: articleText,
          confidence: 0.85,
          metadata: { applicationType: '準用' },
          startPos: match.index,
          endPos: match.index + match[0].length,
          priority: 7
        });
      }
    }
    
    return candidates;
  }
  
  /**
   * 項・号参照の候補収集
   */
  private collectParagraphCandidates(text: string, currentArticle?: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    
    // 第N条第M項第O号のパターン
    const fullPattern = /(第[一二三四五六七八九十百千万\d]+条)(第[一二三四五六七八九十\d]+項)(?:(第[一二三四五六七八九十\d]+号))?/g;
    
    let match;
    while ((match = fullPattern.exec(text)) !== null) {
      const articleText = match[1];
      const paragraphText = match[2];
      const itemText = match[3] || '';
      
      candidates.push({
        type: 'internal',
        sourceText: match[0],
        text: match[0],
        targetArticleNumber: articleText,
        targetArticle: articleText,
        confidence: 0.95,
        metadata: {
          paragraph: paragraphText,
          item: itemText || undefined
        },
        startPos: match.index,
        endPos: match.index + match[0].length,
        priority: 9
      });
    }
    
    // 同条第M項第N号のパターン
    const sameArticlePattern = /(同条)(第[一二三四五六七八九十\d]+項)(?:(第[一二三四五六七八九十\d]+号))?/g;
    
    match = null;
    while ((match = sameArticlePattern.exec(text)) !== null) {
      const paragraphText = match[2];
      const itemText = match[3] || '';
      
      // 文脈から実際の条文を推定
      const targetArticle = currentArticle || '第一条';
      
      candidates.push({
        type: 'internal',
        sourceText: match[0],
        text: match[0],
        targetArticleNumber: targetArticle,
        targetArticle: targetArticle,
        confidence: currentArticle ? 0.95 : 0.7,
        metadata: {
          paragraph: paragraphText,
          item: itemText || undefined,
          originalText: '同条'
        },
        startPos: match.index,
        endPos: match.index + match[0].length,
        priority: 9
      });
    }
    
    return candidates;
  }
  
  /**
   * 複数参照の候補収集
   */
  private collectMultipleCandidates(text: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    const processedPairs = new Set<string>();
    
    const patterns = [
      /第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g,
      /第([一二三四五六七八九十百千万\d]+)条、第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        for (let i = 1; i < match.length; i++) {
          if (match[i]) {
            const article = `第${match[i]}条`;
            const pairKey = `${match.index}-${article}`;
            
            if (!processedPairs.has(pairKey)) {
              processedPairs.add(pairKey);
              const articleStart = text.indexOf(article, match.index);
              
              candidates.push({
                type: 'internal',
                sourceText: article,
                text: article,
                targetArticleNumber: article,
                targetArticle: article,
                confidence: 0.9,
                metadata: { isMultiple: true },
                startPos: articleStart,
                endPos: articleStart + article.length,
                priority: 6
              });
            }
          }
        }
      }
    }
    
    return candidates;
  }
  
  /**
   * 内部参照の候補収集
   */
  private collectInternalCandidates(text: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    const pattern = /第([一二三四五六七八九十百千万\d]+)条/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const articleText = match[0];
      
      candidates.push({
        type: 'internal',
        sourceText: articleText,
        text: articleText,
        targetArticleNumber: articleText,
        targetArticle: articleText,
        confidence: 0.8,
        metadata: {},
        startPos: match.index,
        endPos: match.index + match[0].length,
        priority: 5
      });
    }
    
    return candidates;
  }
  
  /**
   * 相対参照の候補収集
   */
  private collectRelativeCandidates(text: string, currentArticle?: string): ReferenceCandidate[] {
    const candidates: ReferenceCandidate[] = [];
    
    const patterns = [
      { regex: /前条/g, type: '前条' },
      { regex: /次条/g, type: '次条' }
    ];
    
    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const resolved = this.resolveRelativeReference(type, currentArticle);
        
        candidates.push({
          type: 'relative',
          sourceText: match[0],
          text: match[0],
          targetArticleNumber: resolved || type,
          targetArticle: resolved || type,
          confidence: resolved ? 0.95 : 0.7,
          metadata: { relativeType: type, currentArticle },
          startPos: match.index,
          endPos: match.index + match[0].length,
          priority: 6
        });
      }
    }
    
    return candidates;
  }
  
  /**
   * Pass 2: 競合解決と重複除去
   */
  private resolveConflicts(candidates: ReferenceCandidate[]): Reference[] {
    // 優先度と位置でソート
    candidates.sort((a, b) => {
      if (a.startPos !== b.startPos) return a.startPos - b.startPos;
      return b.priority - a.priority;
    });
    
    const resolved: Reference[] = [];
    const processedKeys = new Set<string>();
    
    for (const candidate of candidates) {
      // 範囲参照メンバーは全て追加
      if (candidate.metadata?.isRangeMember) {
        resolved.push(candidate);
        continue;
      }
      
      // 重複チェック
      const key = `${candidate.startPos}-${candidate.endPos}-${candidate.targetArticle}`;
      
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        
        // 外部参照と内部参照の競合チェック
        if (candidate.type === 'internal' && candidate.priority <= 5) {
          let hasHigherPriority = false;
          for (const other of candidates) {
            if (other.priority > candidate.priority &&
                other.startPos <= candidate.startPos && 
                other.endPos >= candidate.endPos) {
              hasHigherPriority = true;
              break;
            }
          }
          if (hasHigherPriority) continue;
        }
        
        resolved.push(candidate);
      }
    }
    
    return resolved;
  }
  
  /**
   * 参照の正規化
   */
  private normalizeReferences(references: Reference[]): Reference[] {
    return references.map(ref => {
      // targetArticleとtargetArticleNumberの統一
      if (ref.targetArticleNumber && !ref.targetArticle) {
        ref.targetArticle = ref.targetArticleNumber;
      } else if (ref.targetArticle && !ref.targetArticleNumber) {
        ref.targetArticleNumber = ref.targetArticle;
      }
      
      // textプロパティの追加
      if (!ref.text && ref.sourceText) {
        ref.text = ref.sourceText;
      }
      
      // 位置情報を削除
      delete (ref as any).startPos;
      delete (ref as any).endPos;
      delete (ref as any).priority;
      
      return ref;
    });
  }
}