#!/usr/bin/env npx tsx

/**
 * 改善版参照検出エンジン
 * XML構造解析、完全な漢数字処理、範囲参照展開を実装
 */

import * as fs from 'fs';
import * as path from 'path';

// ========================
// 1. XML構造解析クラス
// ========================

interface ArticleStructure {
  articleNum: string;
  paragraphs: ParagraphInfo[];
  items: ItemInfo[];
}

interface ParagraphInfo {
  num: number;
  text: string;
  startPos: number;
  endPos: number;
}

interface ItemInfo {
  paragraphNum: number;
  itemNum: string;  // 一、二、三 or 1、2、3
  text: string;
}

class XMLStructureAnalyzer {
  private articleStructure: Map<string, ArticleStructure> = new Map();

  /**
   * XMLから条文構造を解析
   */
  parseXMLStructure(xmlContent: string, articleNum: string): ArticleStructure {
    const structure: ArticleStructure = {
      articleNum,
      paragraphs: [],
      items: []
    };

    // 条文を探す
    const articlePattern = new RegExp(
      `<Article[^>]*Num="${articleNum}"[^>]*>([\\s\\S]*?)</Article>`,
      'i'
    );
    const articleMatch = xmlContent.match(articlePattern);
    if (!articleMatch) return structure;

    const articleContent = articleMatch[1];
    
    // 項（Paragraph）を解析
    const paragraphPattern = /<Paragraph[^>]*Num="(\d+)"[^>]*>([\s\S]*?)<\/Paragraph>/g;
    let pMatch;
    let paragraphIndex = 0;
    
    while ((pMatch = paragraphPattern.exec(articleContent)) !== null) {
      paragraphIndex++;
      const paragraphNum = parseInt(pMatch[1] || String(paragraphIndex));
      const paragraphContent = pMatch[2];
      
      // ParagraphSentenceからテキストを抽出
      const sentencePattern = /<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/;
      const sentenceMatch = paragraphContent.match(sentencePattern);
      const text = sentenceMatch ? this.cleanXMLText(sentenceMatch[1]) : '';
      
      structure.paragraphs.push({
        num: paragraphNum,
        text,
        startPos: pMatch.index,
        endPos: pMatch.index + pMatch[0].length
      });
      
      // 号（Item）を解析
      const itemPattern = /<Item[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Item>/g;
      let iMatch;
      
      while ((iMatch = itemPattern.exec(paragraphContent)) !== null) {
        const itemNum = iMatch[1];
        const itemText = this.cleanXMLText(iMatch[2]);
        
        structure.items.push({
          paragraphNum,
          itemNum,
          text: itemText
        });
      }
    }
    
    // 項タグがない場合、全体を第1項として扱う
    if (structure.paragraphs.length === 0) {
      const caption = articleContent.match(/<ArticleCaption[^>]*>(.*?)<\/ArticleCaption>/);
      const title = articleContent.match(/<ArticleTitle[^>]*>(.*?)<\/ArticleTitle>/);
      const text = this.cleanXMLText(
        caption ? caption[1] : (title ? title[1] : articleContent)
      );
      
      structure.paragraphs.push({
        num: 1,
        text,
        startPos: 0,
        endPos: articleContent.length
      });
    }
    
    this.articleStructure.set(articleNum, structure);
    return structure;
  }

  /**
   * XMLタグを除去してテキストを抽出
   */
  private cleanXMLText(text: string): string {
    return text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * 相対参照を解決
   */
  resolveRelativeReference(
    relativeRef: string,
    currentArticleNum: string,
    currentParagraphNum: number = 1,
    xmlContent?: string
  ): string {
    // 「第94条」形式から数値を抽出
    const articleNumMatch = currentArticleNum.match(/第?(\d+)条?/);
    const currentArticle = articleNumMatch ? parseInt(articleNumMatch[1]) : 0;
    
    switch (relativeRef) {
      case '前条':
        return `第${currentArticle - 1}条`;
        
      case '次条':
        return `第${currentArticle + 1}条`;
        
      case '前項':
        if (currentParagraphNum > 1) {
          return `第${currentArticle}条第${currentParagraphNum - 1}項`;
        } else if (currentArticle > 1) {
          // 前条の最終項を取得（XML構造が必要）
          return `第${currentArticle - 1}条`;
        }
        return relativeRef;
        
      case '次項':
        return `第${currentArticleNum}第${currentParagraphNum + 1}項`;
        
      case '前二項':
        if (currentParagraphNum >= 3) {
          return `第${currentArticle}条第${currentParagraphNum - 2}項及び第${currentParagraphNum - 1}項`;
        } else if (currentParagraphNum === 2) {
          return `第${currentArticle}条第1項及び第2項`;
        }
        return relativeRef;
        
      case '前各項':
        if (currentParagraphNum >= 2) {
          const items = [];
          for (let i = 1; i < currentParagraphNum; i++) {
            items.push(`第${currentArticle}条第${i}項`);
          }
          return items.join('及び');
        }
        return relativeRef;
        
      case '各号':
        return `第${currentArticle}条各号`;
        
      case '本条':
        return `第${currentArticle}条`;
        
      default:
        // 「同条」「同項」の処理
        if (relativeRef === '同条') {
          return `第${currentArticle}条`;
        }
        if (relativeRef === '同項') {
          return `第${currentArticle}条第${currentParagraphNum}項`;
        }
        
        // 「前項本文」「前項ただし書」等の処理
        if (relativeRef.includes('前項')) {
          const modifier = relativeRef.replace('前項', '').trim();
          const base = currentParagraphNum > 1 
            ? `第${currentArticle}条第${currentParagraphNum - 1}項`
            : `第${currentArticle - 1}条`;
          return modifier ? `${base}${modifier}` : base;
        }
        
        return relativeRef;
    }
  }

  /**
   * 漢数字を数値に変換
   */
  private kanjiToNumber(str: string): number {
    // 実装は後述のEnhancedKanjiParserを使用
    return new EnhancedKanjiParser().parseKanjiNumber(str);
  }
}

// ========================
// 2. 改良版漢数字パーサー
// ========================
class EnhancedKanjiParser {
  private readonly digits: Map<string, number> = new Map([
    ['〇', 0], ['零', 0],
    ['一', 1], ['壱', 1],
    ['二', 2], ['弐', 2],
    ['三', 3], ['参', 3],
    ['四', 4],
    ['五', 5],
    ['六', 6],
    ['七', 7],
    ['八', 8],
    ['九', 9]
  ]);

  private readonly units: Map<string, number> = new Map([
    ['十', 10],
    ['百', 100],
    ['千', 1000],
    ['万', 10000],
    ['億', 100000000]
  ]);

  /**
   * 漢数字文字列を数値に変換
   * 例: "七百五十八" → 758, "二千二十五" → 2025
   */
  parseKanjiNumber(text: string): number {
    if (!text || text.length === 0) return 0;
    
    // 漢数字以外の文字を除去
    const cleanText = text.replace(/[^〇零一壱二弐三参四五六七八九十百千万億]/g, '');
    if (cleanText.length === 0) return 0;
    
    // 特殊ケース: 単一の数字
    if (cleanText.length === 1) {
      if (this.digits.has(cleanText)) {
        return this.digits.get(cleanText)!;
      }
      if (this.units.has(cleanText)) {
        return this.units.get(cleanText)!;
      }
    }
    
    let result = 0;
    let currentNumber = 0;
    let lastUnit = Infinity;
    
    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      
      if (this.digits.has(char)) {
        const digit = this.digits.get(char)!;
        currentNumber = currentNumber * 10 + digit;
      } else if (this.units.has(char)) {
        const unit = this.units.get(char)!;
        
        if (unit === 10000 || unit === 100000000) {
          // 万、億の処理
          if (currentNumber === 0) currentNumber = 1;
          result = (result + currentNumber) * unit;
          currentNumber = 0;
          lastUnit = unit;
        } else {
          // 十、百、千の処理
          if (currentNumber === 0) currentNumber = 1;
          
          if (unit < lastUnit) {
            result += currentNumber * unit;
          } else {
            result = result * unit + currentNumber;
          }
          
          currentNumber = 0;
          lastUnit = unit;
        }
      }
    }
    
    result += currentNumber;
    return result;
  }

  /**
   * 条文番号用の漢数字変換（「第七百五十八条」→ 758）
   */
  parseArticleNumber(text: string): number {
    // 「第」と「条」を除去
    const cleanText = text.replace(/第|条/g, '');
    return this.parseKanjiNumber(cleanText);
  }

  /**
   * 漢数字を含む条文番号を標準化（「第七百五十八条第八号」→「第758条第8号」）
   */
  normalizeArticleReference(text: string): string {
    // 条番号の抽出と変換
    const articleMatch = text.match(/第([^条]+)条/);
    if (articleMatch) {
      const articleNum = this.parseKanjiNumber(articleMatch[1]);
      text = text.replace(articleMatch[0], `第${articleNum}条`);
    }
    
    // 項番号の抽出と変換
    const paragraphMatch = text.match(/第([^項]+)項/);
    if (paragraphMatch && !paragraphMatch[1].includes('条')) {
      const paragraphNum = this.parseKanjiNumber(paragraphMatch[1]);
      text = text.replace(paragraphMatch[0], `第${paragraphNum}項`);
    }
    
    // 号番号の抽出と変換
    const itemMatch = text.match(/第([^号]+)号/);
    if (itemMatch && !itemMatch[1].includes('条') && !itemMatch[1].includes('項')) {
      const itemNum = this.parseKanjiNumber(itemMatch[1]);
      text = text.replace(itemMatch[0], `第${itemNum}号`);
    }
    
    return text;
  }
}

// ========================
// 3. 範囲参照展開クラス
// ========================
class RangeReferenceExpander {
  private kanjiParser = new EnhancedKanjiParser();

  /**
   * 範囲参照を展開
   * 例: "第三十二条から第三十二条の五まで" → ["第32条", "第32条の2", "第32条の3", "第32条の4", "第32条の5"]
   */
  expandRange(rangeText: string): string[] {
    const results: string[] = [];
    
    // パターン1: 「第X条から第Y条まで」
    const articleRangePattern = /第([^条]+条)から第([^条]+条)まで/;
    const articleMatch = rangeText.match(articleRangePattern);
    
    if (articleMatch) {
      const startArticle = this.kanjiParser.normalizeArticleReference(`第${articleMatch[1]}`);
      const endArticle = this.kanjiParser.normalizeArticleReference(`第${articleMatch[2]}`);
      
      // 条番号を抽出
      const startNum = this.extractArticleNumber(startArticle);
      const endNum = this.extractArticleNumber(endArticle);
      
      // 枝番号がある場合の処理（例: 第32条の2）
      if (endArticle.includes('の')) {
        const baseMatch = endArticle.match(/第(\d+)条の(\d+)/);
        if (baseMatch) {
          const baseNum = parseInt(baseMatch[1]);
          const subNum = parseInt(baseMatch[2]);
          
          // 開始が基本条文の場合
          if (startNum === baseNum && !startArticle.includes('の')) {
            results.push(`第${baseNum}条`);
            // 枝番号を追加
            for (let i = 2; i <= subNum; i++) {
              results.push(`第${baseNum}条の${i}`);
            }
          } else {
            // 開始も枝番号の場合
            const startSubMatch = startArticle.match(/第(\d+)条の(\d+)/);
            if (startSubMatch) {
              const startSubNum = parseInt(startSubMatch[2]);
              for (let i = startSubNum; i <= subNum; i++) {
                results.push(`第${baseNum}条の${i}`);
              }
            }
          }
        }
      } else {
        // 通常の連続条文
        for (let i = startNum; i <= endNum; i++) {
          results.push(`第${i}条`);
        }
      }
      
      return results;
    }
    
    // パターン2: 「第X号から第Y号まで」
    const itemRangePattern = /第([^号]+号)から第([^号]+号)まで/;
    const itemMatch = rangeText.match(itemRangePattern);
    
    if (itemMatch) {
      const startItem = this.kanjiParser.normalizeArticleReference(`第${itemMatch[1]}`);
      const endItem = this.kanjiParser.normalizeArticleReference(`第${itemMatch[2]}`);
      
      const startNum = this.extractNumber(startItem);
      const endNum = this.extractNumber(endItem);
      
      for (let i = startNum; i <= endNum; i++) {
        results.push(`第${i}号`);
      }
      
      return results;
    }
    
    // パターン3: 「第X項から第Y項まで」
    const paragraphRangePattern = /第([^項]+項)から第([^項]+項)まで/;
    const paragraphMatch = rangeText.match(paragraphRangePattern);
    
    if (paragraphMatch) {
      const startPara = this.kanjiParser.normalizeArticleReference(`第${paragraphMatch[1]}`);
      const endPara = this.kanjiParser.normalizeArticleReference(`第${paragraphMatch[2]}`);
      
      const startNum = this.extractNumber(startPara);
      const endNum = this.extractNumber(endPara);
      
      for (let i = startNum; i <= endNum; i++) {
        results.push(`第${i}項`);
      }
      
      return results;
    }
    
    return results;
  }

  /**
   * 条文番号を抽出
   */
  private extractArticleNumber(text: string): number {
    const match = text.match(/第(\d+)条/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 数値を抽出
   */
  private extractNumber(text: string): number {
    const match = text.match(/第(\d+)[項号]/);
    return match ? parseInt(match[1]) : 0;
  }

  /**
   * 複合的な範囲参照を検出して展開
   * 例: "第四号から第六号までに掲げる額" → コンテキスト付きで展開
   */
  detectAndExpandRanges(text: string, currentArticle?: string): ReferenceRange[] {
    const ranges: ReferenceRange[] = [];
    
    // 各種範囲パターン
    const patterns = [
      /第([^条項号]+[条項号])から第([^条項号]+[条項号])まで/g,
      /([^及び並びに又は若しくは、。\s]+)から([^及び並びに又は若しくは、。\s]+)まで/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const rangeText = match[0];
        const expanded = this.expandRange(rangeText);
        
        if (expanded.length > 0) {
          ranges.push({
            originalText: rangeText,
            expandedReferences: expanded,
            startPos: match.index,
            endPos: match.index + rangeText.length,
            context: currentArticle
          });
        }
      }
    }
    
    return ranges;
  }
}

interface ReferenceRange {
  originalText: string;
  expandedReferences: string[];
  startPos: number;
  endPos: number;
  context?: string;
}

// ========================
// 4. 統合検出エンジン
// ========================
export class EnhancedReferenceDetector {
  private xmlAnalyzer = new XMLStructureAnalyzer();
  private kanjiParser = new EnhancedKanjiParser();
  private rangeExpander = new RangeReferenceExpander();
  
  /**
   * 包括的な参照検出
   */
  async detectReferences(
    text: string,
    currentArticle: string,
    xmlContent?: string,
    useLLM: boolean = false
  ): Promise<DetectedReference[]> {
    const references: DetectedReference[] = [];
    
    // 1. XML構造解析（提供されている場合）
    let articleStructure;
    if (xmlContent) {
      articleStructure = this.xmlAnalyzer.parseXMLStructure(xmlContent, currentArticle);
    }
    
    // 2. 相対参照の検出と解決
    const relativeRefs = this.detectRelativeReferences(text, currentArticle, articleStructure);
    references.push(...relativeRefs);
    
    // 3. 明示的参照の検出（改良版漢数字処理）
    const explicitRefs = this.detectExplicitReferences(text);
    references.push(...explicitRefs);
    
    // 4. 範囲参照の検出と展開
    const rangeRefs = this.detectRangeReferences(text, currentArticle);
    references.push(...rangeRefs);
    
    // 5. LLMによる補完（オプション）
    if (useLLM) {
      const llmRefs = await this.enhanceWithLLM(text, references);
      references.push(...llmRefs);
    }
    
    // 重複除去と信頼度でソート
    return this.deduplicateAndSort(references);
  }
  
  /**
   * 相対参照の検出と解決
   */
  private detectRelativeReferences(
    text: string,
    currentArticle: string,
    structure?: any
  ): DetectedReference[] {
    const references: DetectedReference[] = [];
    
    // 相対参照パターン
    const patterns = [
      /前条/g,
      /次条/g,
      /前項/g,
      /次項/g,
      /前二項/g,
      /前各項/g,
      /各号/g,
      /本条/g,
      /同条/g,
      /同項/g,
      /前項本文/g,
      /前項ただし書/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const relativeRef = match[0];
        const resolved = this.xmlAnalyzer.resolveRelativeReference(
          relativeRef,
          currentArticle,
          1, // TODO: 現在の項番号を文脈から取得
          structure
        );
        
        references.push({
          type: 'relative',
          originalText: relativeRef,
          resolvedText: resolved,
          targetArticle: resolved,
          confidence: 0.95,
          startPos: match.index,
          endPos: match.index + relativeRef.length
        });
      }
    }
    
    return references;
  }
  
  /**
   * 明示的参照の検出（改良版）
   */
  private detectExplicitReferences(text: string): DetectedReference[] {
    const references: DetectedReference[] = [];
    
    // より精密なパターン
    // 条文＋項＋号の複合パターン
    const complexPattern = /第([〇零一壱二弐三参四五六七八九十百千万億]+)条(?:の([〇零一壱二弐三参四五六七八九十百千万億]+))?(?:第([〇零一壱二弐三参四五六七八九十百千万億]+)[項])?(?:第([〇零一壱二弐三参四五六七八九十百千万億]+)[号])?/g;
    
    let match;
    while ((match = complexPattern.exec(text)) !== null) {
      const fullMatch = match[0];
      let normalized = '';
      
      // 条番号
      const articleNum = this.kanjiParser.parseKanjiNumber(match[1]);
      normalized = `第${articleNum}条`;
      
      // 枝番号
      if (match[2]) {
        const subNum = this.kanjiParser.parseKanjiNumber(match[2]);
        normalized = `第${articleNum}条の${subNum}`;
      }
      
      // 項番号
      if (match[3]) {
        const paraNum = this.kanjiParser.parseKanjiNumber(match[3]);
        normalized += `第${paraNum}項`;
      }
      
      // 号番号
      if (match[4]) {
        const itemNum = this.kanjiParser.parseKanjiNumber(match[4]);
        normalized += `第${itemNum}号`;
      }
      
      references.push({
        type: 'explicit',
        originalText: fullMatch,
        resolvedText: normalized,
        targetArticle: normalized,
        confidence: 0.95,
        startPos: match.index,
        endPos: match.index + fullMatch.length
      });
    }
    
    return references;
  }
  
  /**
   * 範囲参照の検出と展開
   */
  private detectRangeReferences(text: string, currentArticle: string): DetectedReference[] {
    const references: DetectedReference[] = [];
    const ranges = this.rangeExpander.detectAndExpandRanges(text, currentArticle);
    
    for (const range of ranges) {
      // 展開された各参照を個別に追加
      for (const expandedRef of range.expandedReferences) {
        references.push({
          type: 'range',
          originalText: range.originalText,
          resolvedText: expandedRef,
          targetArticle: expandedRef,
          confidence: 0.85,
          startPos: range.startPos,
          endPos: range.endPos
        });
      }
    }
    
    return references;
  }
  
  /**
   * LLMによる補完検出
   */
  private async enhanceWithLLM(
    text: string,
    existingRefs: DetectedReference[]
  ): Promise<DetectedReference[]> {
    // TODO: Ollama/Mistral APIを使用して暗黙的参照を検出
    // 例: 「この法律の規定」「関係法令」等
    return [];
  }
  
  /**
   * 重複除去と信頼度ソート
   */
  private deduplicateAndSort(references: DetectedReference[]): DetectedReference[] {
    const seen = new Set<string>();
    const unique: DetectedReference[] = [];
    
    for (const ref of references) {
      const key = `${ref.targetArticle}_${ref.startPos}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(ref);
      }
    }
    
    return unique.sort((a, b) => b.confidence - a.confidence);
  }
}

interface DetectedReference {
  type: 'relative' | 'explicit' | 'range' | 'implicit';
  originalText: string;
  resolvedText: string;
  targetArticle: string;
  confidence: number;
  startPos: number;
  endPos: number;
  targetLaw?: string;
}

// ========================
// 5. テスト実行
// ========================
async function testEnhancedDetector() {
  console.log('===== 改善版参照検出エンジンテスト =====\n');
  
  const detector = new EnhancedReferenceDetector();
  
  // テストケース
  const testCases = [
    {
      text: '前項の規定による意思表示の無効は、善意の第三者に対抗することができない。',
      article: '第94条',
      expected: ['第94条第1項']
    },
    {
      text: '第五百六十六条の規定を準用する。',
      article: '第570条',
      expected: ['第566条']
    },
    {
      text: '第三十二条から第三十二条の五まで若しくは第四十条の労働時間',
      article: '第36条',
      expected: ['第32条', '第32条の2', '第32条の3', '第32条の4', '第32条の5', '第40条']
    },
    {
      text: '第七百五十八条第八号、第七百六十条第八号',
      article: '第26条',
      expected: ['第758条第8号', '第760条第8号']
    },
    {
      text: '前二項の場合において、損害の原因について',
      article: '第717条',
      expected: ['第717条第1項及び第2項']
    }
  ];
  
  for (const testCase of testCases) {
    console.log(`テスト: "${testCase.text.substring(0, 30)}..."`);
    console.log(`現在条文: ${testCase.article}`);
    
    const refs = await detector.detectReferences(testCase.text, testCase.article);
    
    console.log(`期待される参照: ${testCase.expected.join(', ')}`);
    console.log(`検出された参照: ${refs.map(r => r.resolvedText).join(', ')}`);
    
    // 成功判定
    const detected = new Set(refs.map(r => r.resolvedText));
    const expected = new Set(testCase.expected);
    const matches = Array.from(expected).filter(e => detected.has(e));
    
    const success = matches.length === expected.size;
    console.log(success ? '✅ 成功\n' : '❌ 失敗\n');
  }
}

// メイン実行
if (require.main === module) {
  testEnhancedDetector().catch(console.error);
}

export { XMLStructureAnalyzer, EnhancedKanjiParser, RangeReferenceExpander };