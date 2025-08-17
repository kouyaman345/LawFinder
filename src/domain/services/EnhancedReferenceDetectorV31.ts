/**
 * 強化版参照検出器 v3.1.0
 * 
 * e-Govと同等の精度を目指した高精度な参照検出実装
 * 改善点：
 * - プロパティ名の統一（targetLaw）
 * - 範囲参照の重複除去
 * - 同条参照の解決
 * - 準用パターンの改善
 */

export interface Reference {
  type: 'internal' | 'external' | 'relative' | 'structural' | 'range' | 'multiple' | 'application';
  sourceText: string;
  text?: string; // テストケースとの互換性のため
  targetLawId?: string | null;
  targetLaw?: string | null; // targetLawNameから変更
  targetArticleNumber?: string | null;
  targetArticle?: string | null; // targetArticleNumberのエイリアス
  targetChapter?: string | null;
  targetSection?: string | null;
  confidence: number;
  metadata?: any;
}

export class EnhancedReferenceDetectorV31 {
  private kanjiToNumber: Map<string, number>;
  private numberToKanji: Map<number, string>;
  private lawNameToId: Map<string, string>;
  private processedRanges: Set<string> = new Set();
  
  constructor() {
    this.initializeKanjiMapping();
    this.initializeLawMapping();
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
   * 漢数字を数値に変換（改善版）
   */
  private kanjiToArabic(kanjiStr: string): number {
    if (!kanjiStr) return 0;
    
    // 「第」と「条」を除去
    let cleaned = kanjiStr.replace(/[第条]/g, '');
    if (!cleaned) return 0;
    
    // 算用数字の場合はそのまま返す
    const arabicNum = parseInt(cleaned);
    if (!isNaN(arabicNum)) return arabicNum;
    
    // 千、百、十を含む複合数字の処理
    let result = 0;
    let currentNum = 0;
    let inThousands = false;
    
    for (let i = 0; i < cleaned.length; i++) {
      const char = cleaned[i];
      const value = this.kanjiToNumber.get(char);
      
      if (!value && value !== 0) continue;
      
      if (value === 10000) { // 万
        result += (currentNum || 1) * value;
        currentNum = 0;
        inThousands = false;
      } else if (value === 1000) { // 千
        currentNum = (currentNum || 1) * value;
        inThousands = true;
      } else if (value === 100) { // 百
        if (inThousands) {
          currentNum += (cleaned[i-1] && this.kanjiToNumber.get(cleaned[i-1])! < 10 ? this.kanjiToNumber.get(cleaned[i-1])! : 1) * value;
        } else {
          currentNum = (currentNum || 1) * value;
        }
      } else if (value === 10) { // 十
        if (currentNum >= 100) {
          currentNum += (cleaned[i-1] && this.kanjiToNumber.get(cleaned[i-1])! < 10 ? this.kanjiToNumber.get(cleaned[i-1])! : 1) * value;
        } else {
          currentNum = (currentNum || 1) * value;
        }
      } else if (value < 10) { // 一桁
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
   * 数値を漢数字条文形式に変換（改善版）
   */
  private arabicToKanjiArticle(num: number): string {
    if (num <= 0) return '';
    
    const kanjiDigits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    let result = '第';
    
    // 千の位
    if (num >= 1000) {
      const thousands = Math.floor(num / 1000);
      if (thousands > 1) result += kanjiDigits[thousands];
      result += '千';
      num %= 1000;
    }
    
    // 百の位
    if (num >= 100) {
      const hundreds = Math.floor(num / 100);
      if (hundreds > 1) result += kanjiDigits[hundreds];
      result += '百';
      num %= 100;
    }
    
    // 十の位
    if (num >= 10) {
      const tens = Math.floor(num / 10);
      if (tens > 1) result += kanjiDigits[tens];
      result += '十';
      num %= 10;
    }
    
    // 一の位
    if (num > 0) {
      result += kanjiDigits[num];
    }
    
    return result + '条';
  }
  
  /**
   * 相対参照を解決（改善版）
   */
  private resolveRelativeReference(refType: string, currentArticle?: string): string | null {
    if (!currentArticle) return null;
    
    if (refType === '同条') {
      return currentArticle; // 同じ条文番号を返す
    }
    
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
        return currentArticle;
    }
    
    if (targetNum <= 0) return null;
    return this.arabicToKanjiArticle(targetNum);
  }
  
  /**
   * 参照を検出（メインメソッド）
   */
  detectReferences(text: string, currentArticle?: string): Reference[] {
    const references: Reference[] = [];
    this.processedRanges.clear(); // 処理済み範囲をクリア
    
    // 検出順序を調整（範囲参照を先に処理）
    // 1. 範囲参照と準用（セットで処理）
    references.push(...this.detectApplicationReferences(text));
    
    // 2. 外部法令参照
    references.push(...this.detectExternalReferences(text));
    
    // 3. 複数参照
    references.push(...this.detectMultipleReferences(text));
    
    // 4. 項・号参照
    references.push(...this.detectParagraphReferences(text, currentArticle));
    
    // 5. 単独の範囲参照（準用で処理されなかったもの）
    references.push(...this.detectRangeReferences(text));
    
    // 6. 内部参照（単独条文）
    references.push(...this.detectInternalReferences(text));
    
    // 7. 相対参照
    references.push(...this.detectRelativeReferences(text, currentArticle));
    
    // 重複除去と正規化
    return this.normalizeReferences(this.removeDuplicates(references));
  }
  
  /**
   * 外部法令参照の検出（改善版）
   */
  private detectExternalReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン改善: 括弧内の法令番号も考慮
    const pattern = /([^、。\s（）]+法)(?:（[^）]+\）)?(?:第([一二三四五六七八九十百千万\d]+)条(?:第([一二三四五六七八九十\d]+)項)?)?/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const lawName = match[1];
      const articleNum = match[2];
      const paragraphNum = match[3];
      
      // 法令名の前に他の法令名がないことを確認
      const beforeText = text.substring(Math.max(0, match.index - 10), match.index);
      if (beforeText.match(/法\s*$/)) continue;
      
      const lawId = this.lawNameToId.get(lawName);
      
      if (articleNum) {
        const targetArticle = `第${articleNum}条`;
        references.push({
          type: 'external',
          sourceText: match[0],
          text: match[0],
          targetLawId: lawId || null,
          targetLaw: lawName, // プロパティ名を統一
          targetArticleNumber: targetArticle,
          targetArticle, // エイリアス追加
          confidence: lawId ? 0.95 : 0.8,
          metadata: paragraphNum ? { paragraph: `第${paragraphNum}項` } : undefined
        });
      }
    }
    
    return references;
  }
  
  /**
   * 範囲参照の検出（改善版 - 重複除去）
   */
  private detectRangeReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    const pattern = /第([一二三四五六七八九十百千万\d]+)条から第([一二三四五六七八九十百千万\d]+)条まで/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const rangeKey = match[0];
      
      // 既に処理済みの範囲はスキップ
      if (this.processedRanges.has(rangeKey)) continue;
      this.processedRanges.add(rangeKey);
      
      const startNum = this.kanjiToArabic(`第${match[1]}条`);
      const endNum = this.kanjiToArabic(`第${match[2]}条`);
      
      // 範囲が妥当かチェック
      if (startNum <= 0 || endNum <= 0 || startNum > endNum || endNum - startNum > 100) {
        continue;
      }
      
      // 範囲内の各条文を個別に追加
      for (let i = startNum; i <= endNum; i++) {
        const articleStr = this.arabicToKanjiArticle(i);
        references.push({
          type: 'range',
          sourceText: rangeKey,
          text: rangeKey,
          targetArticleNumber: articleStr,
          targetArticle: articleStr,
          confidence: 0.9,
          metadata: { 
            rangeStart: this.arabicToKanjiArticle(startNum),
            rangeEnd: this.arabicToKanjiArticle(endNum),
            isRangeMember: true
          }
        });
      }
    }
    
    return references;
  }
  
  /**
   * 項・号参照の検出（改善版 - 同条解決）
   */
  private detectParagraphReferences(text: string, currentArticle?: string): Reference[] {
    const references: Reference[] = [];
    
    // 第N条第M項のパターン
    const articleParagraphPattern = /第([一二三四五六七八九十百千万\d]+)条第([一二三四五六七八九十\d]+)項(?:第([一二三四五六七八九十\d]+)号)?/g;
    let match;
    while ((match = articleParagraphPattern.exec(text)) !== null) {
      const targetArticle = `第${match[1]}条`;
      references.push({
        type: 'internal',
        sourceText: match[0],
        text: match[0],
        targetArticleNumber: targetArticle,
        targetArticle,
        confidence: 0.95,
        metadata: { 
          paragraph: `第${match[2]}項`,
          item: match[3] ? `第${match[3]}号` : undefined
        }
      });
    }
    
    // 同条第M項のパターン（改善: 実際の条文番号に解決）
    const sameArticlePattern = /同条第([一二三四五六七八九十\d]+)項(?:第([一二三四五六七八九十\d]+)号)?/g;
    match = null;
    while ((match = sameArticlePattern.exec(text)) !== null) {
      const resolvedArticle = currentArticle || '同条';
      references.push({
        type: 'internal',
        sourceText: match[0],
        text: match[0],
        targetArticleNumber: resolvedArticle,
        targetArticle: resolvedArticle,
        confidence: currentArticle ? 0.95 : 0.7,
        metadata: { 
          paragraph: `第${match[1]}項`,
          item: match[2] ? `第${match[2]}号` : undefined,
          originalText: '同条'
        }
      });
    }
    
    return references;
  }
  
  /**
   * 準用・適用参照の検出（改善版）
   */
  private detectApplicationReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン改善: より正確な準用検出
    const patterns = [
      // 範囲準用: 第N条から第M条までの規定は...準用
      /(第[一二三四五六七八九十百千万\d]+条から第[一二三四五六七八九十百千万\d]+条まで)の規定[はを][^。]*準用/g,
      // 単独準用: 第N条の規定は...準用
      /(第[一二三四五六七八九十百千万\d]+条)(?:第[一二三四五六七八九十\d]+項)?の規定[はを][^。]*準用/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const articleRef = match[1];
        
        // 範囲の場合
        const rangeMatch = articleRef.match(/第([一二三四五六七八九十百千万\d]+)条から第([一二三四五六七八九十百千万\d]+)条まで/);
        
        if (rangeMatch) {
          const rangeKey = rangeMatch[0];
          this.processedRanges.add(rangeKey); // 重複処理を防ぐ
          
          const startNum = this.kanjiToArabic(`第${rangeMatch[1]}条`);
          const endNum = this.kanjiToArabic(`第${rangeMatch[2]}条`);
          
          if (startNum > 0 && endNum > 0 && startNum <= endNum && endNum - startNum <= 100) {
            for (let i = startNum; i <= endNum; i++) {
              const articleStr = this.arabicToKanjiArticle(i);
              references.push({
                type: 'application',
                sourceText: rangeKey,
                text: rangeKey,
                targetArticleNumber: articleStr,
                targetArticle: articleStr,
                confidence: 0.85,
                metadata: { 
                  applicationType: '準用',
                  rangeStart: this.arabicToKanjiArticle(startNum),
                  rangeEnd: this.arabicToKanjiArticle(endNum)
                }
              });
            }
          }
        } else {
          // 単独条文の準用
          references.push({
            type: 'application',
            sourceText: match[0],
            text: articleRef,
            targetArticleNumber: articleRef,
            targetArticle: articleRef,
            confidence: 0.85,
            metadata: { applicationType: '準用' }
          });
        }
      }
    }
    
    return references;
  }
  
  /**
   * 複数参照の検出（改善版）
   */
  private detectMultipleReferences(text: string): Reference[] {
    const references: Reference[] = [];
    
    // パターン改善: より柔軟な複数参照検出
    const patterns = [
      // 第N条及び第M条
      /第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g,
      // 第N条、第M条及び第O条
      /第([一二三四五六七八九十百千万\d]+)条、第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g,
      // 第N条、第M条、第O条及び第P条
      /第([一二三四五六七八九十百千万\d]+)条、第([一二三四五六七八九十百千万\d]+)条、第([一二三四五六七八九十百千万\d]+)条(?:及び|並びに)第([一二三四五六七八九十百千万\d]+)条/g
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
              text: articleStr,
              targetArticleNumber: articleStr,
              targetArticle: articleStr,
              confidence: 0.9
            });
          }
        }
      }
    }
    
    return references;
  }
  
  /**
   * 内部参照の検出（改善版）
   */
  private detectInternalReferences(text: string): Reference[] {
    const references: Reference[] = [];
    const processedPositions = new Set<number>();
    
    // パターン: 「第N条」（単独）
    const pattern = /第([一二三四五六七八九十百千万\d]+)条/g;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // 既に他のパターンで処理済みの位置はスキップ
      if (processedPositions.has(match.index)) continue;
      
      const articleStr = match[0];
      
      // 文脈チェック
      const beforeText = text.substring(Math.max(0, match.index - 20), match.index);
      const afterText = text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 10));
      
      // 以下の場合はスキップ
      // - 法令名の直後
      // - 「から」「まで」が続く（範囲参照の一部）
      // - 「及び」「並びに」の前後（複数参照の一部）
      if (beforeText.match(/[^、。\s]+法\s*$/) ||
          afterText.match(/^から/) ||
          beforeText.match(/から$/) ||
          afterText.match(/^まで/) ||
          beforeText.match(/(?:及び|並びに)\s*$/) ||
          afterText.match(/^\s*(?:及び|並びに)/)) {
        continue;
      }
      
      references.push({
        type: 'internal',
        sourceText: articleStr,
        text: articleStr,
        targetArticleNumber: articleStr,
        targetArticle: articleStr,
        confidence: 0.9
      });
      
      processedPositions.add(match.index);
    }
    
    return references;
  }
  
  /**
   * 相対参照の検出（改善版）
   */
  private detectRelativeReferences(text: string, currentArticle?: string): Reference[] {
    const references: Reference[] = [];
    
    const patterns = [
      { regex: /前条/g, type: '前条' },
      { regex: /次条/g, type: '次条' },
      { regex: /前項/g, type: '前項' },
      { regex: /次項/g, type: '次項' },
      { regex: /前号/g, type: '前号' },
      { regex: /次号/g, type: '次号' }
    ];
    
    for (const { regex, type } of patterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        const resolved = this.resolveRelativeReference(type, currentArticle);
        
        // 条文参照のみ解決（項・号は文脈依存のため保留）
        if (type === '前条' || type === '次条') {
          references.push({
            type: 'relative',
            sourceText: match[0],
            text: match[0],
            targetArticleNumber: resolved || type,
            targetArticle: resolved || type,
            confidence: resolved ? 0.95 : 0.7,
            metadata: { relativeType: type, currentArticle }
          });
        } else {
          // 項・号の相対参照は保持
          references.push({
            type: 'relative',
            sourceText: match[0],
            text: match[0],
            targetArticleNumber: currentArticle || type,
            targetArticle: type,
            confidence: 0.7,
            metadata: { relativeType: type, currentArticle }
          });
        }
      }
    }
    
    return references;
  }
  
  /**
   * 重複を除去（改善版）
   */
  private removeDuplicates(references: Reference[]): Reference[] {
    const seen = new Map<string, Reference>();
    
    for (const ref of references) {
      const key = `${ref.type}:${ref.targetArticleNumber || ref.targetArticle}:${ref.targetLawId || ref.targetLaw || 'internal'}`;
      
      // 既存のエントリと比較して、より高い信頼度のものを保持
      const existing = seen.get(key);
      if (!existing || existing.confidence < ref.confidence) {
        seen.set(key, ref);
      }
    }
    
    return Array.from(seen.values());
  }
  
  /**
   * 参照の正規化（プロパティの統一）
   */
  private normalizeReferences(references: Reference[]): Reference[] {
    return references.map(ref => {
      // targetArticleとtargetArticleNumberの統一
      if (ref.targetArticleNumber && !ref.targetArticle) {
        ref.targetArticle = ref.targetArticleNumber;
      } else if (ref.targetArticle && !ref.targetArticleNumber) {
        ref.targetArticleNumber = ref.targetArticle;
      }
      
      // textプロパティの追加（テストケースとの互換性）
      if (!ref.text && ref.sourceText) {
        ref.text = ref.sourceText;
      }
      
      return ref;
    });
  }
}