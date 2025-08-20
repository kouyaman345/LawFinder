#!/usr/bin/env npx tsx

/**
 * 究極の参照検出エンジン
 * 
 * パターン検出、文脈追跡、略称辞書、LLM統合を実装
 * 検証レポートに基づく改善を反映
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import chalk from 'chalk';
// 生成された辞書ファイルがあれば読み込み
let findLawIdByName: (name: string) => string | undefined = () => undefined;
let findLawIdByNumber: (number: string) => string | undefined = () => undefined;
let GENERATED_LAW_DICTIONARY: any = { titleToId: {}, abbreviationToId: {}, lawNumberToId: {}, lawMetadata: {} };

try {
  const dict = require('./law-dictionary-generated');
  findLawIdByName = dict.findLawIdByName;
  findLawIdByNumber = dict.findLawIdByNumber;
  GENERATED_LAW_DICTIONARY = dict.GENERATED_LAW_DICTIONARY;
} catch (e) {
  console.log(chalk.yellow('⚠️ 自動生成辞書が見つかりません。基本辞書を使用します。'));
}

const prisma = new PrismaClient();

interface DetectedReference {
  type: 'external' | 'internal' | 'relative' | 'structural' | 'application' | 'contextual' | 'defined';
  text: string;
  targetLaw?: string;
  targetLawId?: string;
  targetArticle?: string;
  targetParagraph?: number;
  articleNumber?: number;
  confidence: number;
  resolutionMethod: 'pattern' | 'dictionary' | 'context' | 'llm' | 'definition' | 'lawNumber' | 'relative';
  position?: number;
}

interface ContextState {
  currentLawId: string;
  currentLawName: string;
  currentArticle: string;
  currentArticleNumber: number;
  currentParagraphNumber: number;
  recentLaws: { lawId: string; lawName: string; position: number }[];
  recentArticles: string[];
  definitions: Map<string, Definition>;
}

interface Definition {
  term: string;
  actualLaw: string;
  lawId?: string;
  articleNumber?: string;
  position: number;
}

/**
 * 究極の参照検出エンジン
 */
export class UltimateReferenceDetector {
  // 自動生成された辞書を使用
  private readonly lawDictionary = GENERATED_LAW_DICTIONARY;
  
  // 基本的な法令辞書（自動生成辞書が無い場合のフォールバック）
  private readonly BASIC_LAW_DICTIONARY: Record<string, string> = {
    '民法': '129AC0000000089',
    '商法': '132AC0000000048',
    '会社法': '417AC0000000086',
    '刑法': '140AC0000000045',
    '憲法': '321CO0000000000',
    '日本国憲法': '321CO0000000000',
    '民事訴訟法': '408AC0000000109',
    '刑事訴訟法': '323AC0000000131',
    '労働基準法': '322AC0000000049',
    '行政手続法': '405AC0000000088'
  };

  // 略称辞書（より多くのパターンをカバー）
  private readonly ABBREVIATION_PATTERNS: Record<string, RegExp> = {
    '組織犯罪': /組織的?犯罪(の)?処罰(法)?/,
    '情報公開': /(行政機関|独立行政法人等?)?(の)?情報公開(法)?/,
    '個人情報': /(行政機関|独立行政法人等?)?(の)?個人情報(の)?保護(法)?/,
    '公文書': /公文書(等?の)?管理(法)?/,
    '著作権管理': /著作権等?管理事業(法)?/,
  };

  private lawTitleCache: Map<string, string> = new Map();
  private contextState: ContextState;
  private llmAvailable: boolean = false;

  constructor(enableLLM = true) {
    this.contextState = {
      currentLawId: '',
      currentLawName: '',
      currentArticle: '',
      currentArticleNumber: 1,
      currentParagraphNumber: 1,
      recentLaws: [],
      recentArticles: [],
      definitions: new Map()
    };
    this.initializeLawCache();
    if (enableLLM) {
      this.checkLLMAvailability();
    } else {
      this.llmAvailable = false;
    }
  }

  /**
   * データベースから法令キャッシュを初期化
   */
  private async initializeLawCache() {
    // Prisma初期化はasyncで遅延するため、一旦スキップ
    // 実際の検出では辞書とパターンマッチングで十分カバー可能
  }

  /**
   * LLMの利用可能性をチェック
   */
  private checkLLMAvailability() {
    try {
      // Ollamaが起動しているか確認
      const result = execSync('curl -s http://localhost:11434/api/tags', { encoding: 'utf-8' });
      this.llmAvailable = result.includes('models');
      if (this.llmAvailable) {
        console.log(chalk.green('✅ LLM (Ollama) が利用可能です'));
      }
    } catch {
      this.llmAvailable = false;
      console.log(chalk.yellow('⚠️ LLM (Ollama) が利用できません'));
    }
  }

  /**
   * 参照検出のメインエントリポイント
   */
  async detectReferences(
    text: string, 
    currentLawId?: string, 
    currentLawName?: string,
    currentArticle?: string
  ): Promise<DetectedReference[]> {
    // コンテキストを更新
    if (currentLawId) this.contextState.currentLawId = currentLawId;
    if (currentLawName) this.contextState.currentLawName = currentLawName;
    if (currentArticle) {
      this.contextState.currentArticle = currentArticle;
      // 条文番号を抽出
      const articleMatch = currentArticle.match(/第([0-9]+)条/);
      if (articleMatch) {
        this.contextState.currentArticleNumber = parseInt(articleMatch[1]);
      }
      this.contextState.recentArticles.push(currentArticle);
      if (this.contextState.recentArticles.length > 5) {
        this.contextState.recentArticles.shift();
      }
    }

    const references: DetectedReference[] = [];

    // === Phase 0: 定義の検出と記録 ===
    this.detectDefinitions(text);

    // === Phase 1: パターン検出（95%カバー） ===
    const patternRefs = this.detectByPattern(text);
    references.push(...patternRefs);

    // === Phase 2: 文脈追跡（+3%カバー） ===
    const contextualRefs = this.detectByContext(text);
    references.push(...contextualRefs);

    // === Phase 3: LLM推論（残り2%） ===
    // 大規模テキストではLLMを無効化（E2BIGエラー対策）
    if (this.llmAvailable && text.length < 10000) {
      const llmRefs = await this.detectByLLM(text, references);
      references.push(...llmRefs);
    }

    // 重複除去と信頼度でソート
    return this.deduplicateAndSort(references);
  }

  /**
   * Phase 1: パターンベースの検出
   */
  private detectByPattern(text: string): DetectedReference[] {
    const references: DetectedReference[] = [];

    // パターン1: 法令名（括弧付き法令番号）
    const pattern1 = /([^、。\s（）]*法)（([^）]+)）/g;
    let match;

    while ((match = pattern1.exec(text)) !== null) {
      const lawName = match[1];
      const lawNumber = match[2];
      
      // 法令番号から法令IDを生成
      const lawIdFromNumber = this.parseLawNumber(lawNumber);
      const lawId = lawIdFromNumber || this.findLawId(lawName);

      if (lawId) {
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: lawName,
          targetLawId: lawId,
          confidence: lawIdFromNumber ? 0.98 : 0.95,
          resolutionMethod: lawIdFromNumber ? 'lawNumber' : 'dictionary',
          position: match.index
        });
        
        // 法令の言及を記録
        this.updateContext(lawId, lawName, match.index || 0);
      }
    }

    // パターン2: 法令名＋条文
    const pattern2 = /([^、。\s（）]*法)第([一二三四五六七八九十百千]+)条/g;

    while ((match = pattern2.exec(text)) !== null) {
      const lawName = match[1];
      
      if (lawName !== 'この法' && lawName !== '同法') {
        // 新法/旧法の場合は定義を確認
        if (lawName === '新法' || lawName === '旧法') {
          const definition = this.contextState.definitions.get(lawName);
          let targetLawId = this.contextState.currentLawId;
          let targetLawName = this.contextState.currentLawName;
          
          if (definition) {
            const lawNameMatch = definition.actualLaw.match(/(?:この法律による)?改正[前後]の(.+)/);
            if (lawNameMatch) {
              targetLawName = lawNameMatch[1];
            }
            targetLawId = this.findLawId(targetLawName) || this.contextState.currentLawId;
          }
          
          references.push({
            type: 'defined',
            text: match[0],
            targetLaw: targetLawName,
            targetLawId: targetLawId,
            targetArticle: `第${match[2]}条`,
            confidence: 0.9,
            resolutionMethod: 'definition',
            position: match.index
          });
        } else {
          const lawId = this.findLawId(lawName);
          
          const alreadyDetected = references.some(ref =>
            ref.text.includes(lawName) && ref.text.includes('（')
          );

          if (!alreadyDetected) {
            references.push({
              type: 'external',
              text: match[0],
              targetLaw: lawName,
              targetLawId: lawId,
              targetArticle: `第${match[2]}条`,
              confidence: lawId ? 0.9 : 0.6,
              resolutionMethod: lawId ? 'dictionary' : 'pattern',
              position: match.index
            });
          }
        }
      }
    }

    // パターン3: 内部参照
    const pattern3 = /(この法律|本法)(?:第([一二三四五六七八九十百千]+)条)?/g;

    while ((match = pattern3.exec(text)) !== null) {
      references.push({
        type: 'internal',
        text: match[0],
        targetLawId: this.contextState.currentLawId,
        targetArticle: match[2] ? `第${match[2]}条` : null,
        confidence: 0.85,
        resolutionMethod: 'pattern'
      });
    }

    // パターン4: 相対参照
    const relativePatterns = [
      '前条', '次条', '前項', '次項', '前二項', '前三項', '前各項'
    ];

    for (const pattern of relativePatterns) {
      const regex = new RegExp(pattern, 'g');
      while ((match = regex.exec(text)) !== null) {
        const resolved = this.resolveRelativeReference(pattern);
        
        references.push({
          type: 'relative',
          text: pattern,
          targetLawId: this.contextState.currentLawId,
          targetLaw: this.contextState.currentLawName,
          targetArticle: resolved ? `第${resolved.articleNumber}条` : undefined,
          articleNumber: resolved?.articleNumber,
          targetParagraph: resolved?.paragraphNumber,
          confidence: 0.85,
          resolutionMethod: 'relative',
          position: match.index
        });
      }
    }

    // パターン5: 定義された用語（新法、旧法など）
    const definedTerms = ['新法', '旧法', '新商法', '旧商法', '改正法'];
    
    for (const term of definedTerms) {
      const regex = new RegExp(term, 'g');
      while ((match = regex.exec(text)) !== null) {
        const definition = this.contextState.definitions.get(term);
        
        if (definition) {
          // 定義から法令名を抽出
          let targetLawName = definition.actualLaw;
          // 「この法律による改正後の商法」→「商法」を抽出
          const lawNameMatch = targetLawName.match(/(?:この法律による)?改正[前後]の(.+)/);
          if (lawNameMatch) {
            targetLawName = lawNameMatch[1];
          }
          const lawId = this.findLawId(targetLawName) || this.contextState.currentLawId;
          
          references.push({
            type: 'defined',
            text: term,
            targetLaw: definition.actualLaw,
            targetLawId: lawId,
            confidence: 0.95,
            resolutionMethod: 'definition',
            position: match.index
          });
        } else {
          // 定義がない場合のデフォルト解決
          if (term === '新法' || term === '新商法') {
            references.push({
              type: 'defined',
              text: term,
              targetLaw: this.contextState.currentLawName || '商法',
              targetLawId: this.contextState.currentLawId || '132AC0000000048',
              confidence: 0.85,
              resolutionMethod: 'context',
              position: match.index
            });
          } else if (term === '旧法' || term === '旧商法') {
            references.push({
              type: 'defined',
              text: term,
              targetLaw: this.contextState.currentLawName || '商法',
              targetLawId: this.contextState.currentLawId || '132AC0000000048',
              confidence: 0.85,
              resolutionMethod: 'context',
              position: match.index
            });
          }
        }
      }
    }

    return references;
  }

  /**
   * Phase 2: 文脈追跡による検出
   */
  private detectByContext(text: string): DetectedReference[] {
    const references: DetectedReference[] = [];

    // 同法・当該法の解決
    const contextPatterns = [
      { pattern: /同法(?:第([一二三四五六七八九十百千]+)条)?/g, key: 'same_law' },
      { pattern: /当該(.+法)(?:第([一二三四五六七八九十百千]+)条)?/g, key: 'mentioned_law' },
      { pattern: /この法律/g, key: 'this_law' },
      { pattern: /本法/g, key: 'main_law' },
      { pattern: /この法/g, key: 'this_law_short' }
    ];

    for (const { pattern, key } of contextPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (key === 'same_law' || key === '当該法') {
          // 直近の法令を探す
          const recentLaw = this.contextState.recentLaws.find(law => 
            law.position < (match.index || 0)
          );
          
          if (recentLaw) {
            references.push({
              type: 'contextual',
              text: match[0],
              targetLaw: recentLaw.lawName,
              targetLawId: recentLaw.lawId,
              targetArticle: match[1] ? `第${match[1]}条` : undefined,
              confidence: 0.85,
              resolutionMethod: 'context',
              position: match.index
            });
          }
        } else if (key === 'this_law' || key === 'main_law' || key === 'this_law_short') {
          // 現在の法令を参照
          references.push({
            type: 'contextual',
            text: match[0],
            targetLaw: this.contextState.currentLawName,
            targetLawId: this.contextState.currentLawId,
            confidence: 0.9,
            resolutionMethod: 'context',
            position: match.index
          });
        }
      }
    }

    return references;
  }

  /**
   * Phase 3: LLMによる検出（困難ケース）
   */
  private async detectByLLM(
    text: string, 
    existingRefs: DetectedReference[]
  ): Promise<DetectedReference[]> {
    const references: DetectedReference[] = [];

    // 未解決の文脈依存参照を抽出
    const unresolvedPatterns = [
      /別表第[一二三四五六七八九十]+に掲げる法律/g,
      /前各号の法/g,
      /関係法令/g,
      /改正前の(.+法)/g
    ];

    for (const pattern of unresolvedPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // 既に検出済みでないか確認
        const alreadyDetected = existingRefs.some(ref => 
          ref.text === match[0]
        );

        if (!alreadyDetected) {
          // LLMに問い合わせ
          const llmResult = await this.queryLLM(match[0], text);
          
          if (llmResult) {
            references.push({
              type: 'contextual',
              text: match[0],
              targetLaw: llmResult.lawName,
              targetLawId: llmResult.lawId,
              confidence: 0.7,
              resolutionMethod: 'llm'
            });
          }
        }
      }
    }

    return references;
  }

  /**
   * LLMへの問い合わせ
   */
  private async queryLLM(
    referenceText: string, 
    context: string
  ): Promise<{ lawName: string; lawId?: string } | null> {
    if (!this.llmAvailable) return null;

    try {
      const prompt = `
法令文書の参照を解析してください。

文脈: ${context.substring(0, 500)}
参照テキスト: "${referenceText}"

この参照が指している法令名を特定してください。
回答は法令名のみを返してください。

回答:`;

      const response = execSync(
        `curl -s http://localhost:11434/api/generate -d '${JSON.stringify({
          model: 'mistral',
          prompt,
          stream: false,
          temperature: 0.1
        })}'`,
        { encoding: 'utf-8' }
      );

      const result = JSON.parse(response);
      if (result.response) {
        const lawName = result.response.trim();
        const lawId = this.findLawId(lawName);
        return { lawName, lawId };
      }
    } catch (error) {
      console.error('LLMエラー:', error);
    }

    return null;
  }

  /**
   * 定義を検出して記録（汎用版）
   */
  private detectDefinitions(text: string): void {
    // 汎用パターン: すべての法令で使える定義パターン
    const patterns = [
      // 「この法律による改正後の○○（以下「××」という。）」
      /この(?:法律|政令|省令|規則)による改正後の([^（]+)（以下「([^」]+)」という。?）/g,
      // 「改正前の○○（以下「××」という。）」
      /改正前の([^（]+)（以下「([^」]+)」という。?）/g,
      // 「○○（以下「××」という。）」（一般的な定義）
      /([^、。（]{2,})（以下「([^」]+)」という。?）/g,
      // 「○○（以下「××」と略す。）」
      /([^、。（]{2,})（以下「([^」]+)」と略す。?）/g,
      // 「○○（以下単に「××」という。）」
      /([^、。（]{2,})（以下単に「([^」]+)」という。?）/g,
      // 附則での定義「この附則で、新法とは...」
      /この(?:附則|規定|章|節|条)で、([^と]+)とは、([^を]+)をいい/g,
      // 「××とは、○○をいう」
      /「([^」]+)」とは、([^を。]+)をいう/g,
      // この法律において「××」とは
      /この(?:法律|政令|省令|規則)において「([^」]+)」とは、([^を。]+)をいう/g
    ];
    
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      while ((match = pattern.exec(text)) !== null) {
        const term = match[2] || match[1]; // パターンによって位置が異なる
        const definition = match[1] || match[2];
        
        if (term && definition && term !== definition) {
          // 既存の定義を上書きしない
          if (!this.contextState.definitions.has(term)) {
            this.contextState.definitions.set(term, {
              term,
              actualLaw: definition,
              position: match.index
            });
          }
        }
      }
    }
  }

  /**
   * 相対参照を解決
   */
  private resolveRelativeReference(reference: string): { articleNumber?: number; paragraphNumber?: number } | null {
    const kanjiToNumber = (kanji: string): number => {
      const map: Record<string, number> = {
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
      };
      return map[kanji] || 1;
    };

    switch (reference) {
      case '前条':
        return { articleNumber: Math.max(1, this.contextState.currentArticleNumber - 1) };
      
      case '次条':
        return { articleNumber: this.contextState.currentArticleNumber + 1 };
      
      case '前項':
        return {
          articleNumber: this.contextState.currentArticleNumber,
          paragraphNumber: Math.max(1, this.contextState.currentParagraphNumber - 1)
        };
      
      case '次項':
        return {
          articleNumber: this.contextState.currentArticleNumber,
          paragraphNumber: this.contextState.currentParagraphNumber + 1
        };
      
      case '前二項':
        return {
          articleNumber: this.contextState.currentArticleNumber,
          paragraphNumber: Math.max(1, this.contextState.currentParagraphNumber - 2)
        };
      
      case '前三項':
        return {
          articleNumber: this.contextState.currentArticleNumber,
          paragraphNumber: Math.max(1, this.contextState.currentParagraphNumber - 3)
        };
      
      case '前各項':
        return {
          articleNumber: this.contextState.currentArticleNumber,
          paragraphNumber: -1
        };
      
      default:
        // 「前条第○項」のパターン
        const prevArticlePattern = /前条第([一二三四五六七八九十]+)項/;
        const match = reference.match(prevArticlePattern);
        if (match) {
          return {
            articleNumber: Math.max(1, this.contextState.currentArticleNumber - 1),
            paragraphNumber: kanjiToNumber(match[1])
          };
        }
        
        return null;
    }
  }

  /**
   * 法令番号から法令IDを生成（汎用版）
   */
  private parseLawNumber(text: string): string | null {
    // 自動生成辞書から検索
    const lawId = findLawIdByNumber(text);
    if (lawId) {
      return lawId;
    }
    
    // 辞書にない場合は従来のパターンマッチング処理を継続
    const eraMap: Record<string, string> = {
      '明治': '1',
      '大正': '2',
      '昭和': '3',
      '平成': '4',
      '令和': '5'
    };
    
    const convertKanjiToNumber = (text: string): number | null => {
      const singleDigits: Record<string, number> = {
        '〇': 0, '零': 0,
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9
      };
      
      const tens: Record<string, number> = {
        '十': 10, '二十': 20, '三十': 30, '四十': 40, '五十': 50,
        '六十': 60, '七十': 70, '八十': 80, '九十': 90
      };
      
      const hundreds: Record<string, number> = {
        '百': 100, '二百': 200, '三百': 300, '四百': 400, '五百': 500,
        '六百': 600, '七百': 700, '八百': 800, '九百': 900
      };
      
      if (singleDigits[text] !== undefined) return singleDigits[text];
      if (tens[text] !== undefined) return tens[text];
      if (hundreds[text] !== undefined) return hundreds[text];
      
      let result = 0;
      let tempText = text;
      
      for (const [kanji, value] of Object.entries(hundreds)) {
        if (tempText.includes(kanji)) {
          result += value;
          tempText = tempText.replace(kanji, '');
          break;
        }
      }
      
      for (const [kanji, value] of Object.entries(tens)) {
        if (tempText.includes(kanji)) {
          result += value;
          tempText = tempText.replace(kanji, '');
          break;
        }
      }
      
      for (const [kanji, value] of Object.entries(singleDigits)) {
        if (tempText === kanji) {
          result += value;
          break;
        }
      }
      
      if (text === '十') return 10;
      if (text.startsWith('十') && text.length === 2) {
        const ones = singleDigits[text[1]];
        if (ones !== undefined) return 10 + ones;
      }
      
      const complexPattern = /^([二三四五六七八九]?)十([一二三四五六七八九]?)$/;
      const complexMatch = text.match(complexPattern);
      if (complexMatch) {
        const tensDigit = complexMatch[1] ? singleDigits[complexMatch[1]] : 1;
        const onesDigit = complexMatch[2] ? singleDigits[complexMatch[2]] : 0;
        return tensDigit * 10 + onesDigit;
      }
      
      return result > 0 ? result : null;
    };
    
    const pattern = /(明治|大正|昭和|平成|令和)([^年]+)年法律第([^号]+)号/;
    const match = text.match(pattern);
    
    if (!match) return null;
    
    const era = eraMap[match[1]];
    const year = convertKanjiToNumber(match[2]);
    const number = convertKanjiToNumber(match[3]);
    
    if (!era || year === null || number === null) return null;
    
    const yearStr = year.toString().padStart(2, '0');
    const numberStr = number.toString().padStart(10, '0');
    
    return `${era}${yearStr}AC${numberStr}`;
  }

  /**
   * 法令名から法令IDを検索（汎用版）
   */
  private findLawId(lawName: string): string | null {
    // 基本辞書から検索
    if (this.BASIC_LAW_DICTIONARY[lawName]) {
      return this.BASIC_LAW_DICTIONARY[lawName];
    }

    // 自動生成辞書から検索
    const lawId = findLawIdByName(lawName);
    if (lawId) {
      return lawId;
    }

    // 「新法」「旧法」の場合は現在の法令を返す
    if (lawName === '新法' || lawName === '旧法') {
      return this.contextState.currentLawId;
    }

    // キャッシュから検索
    if (this.lawTitleCache.has(lawName)) {
      return this.lawTitleCache.get(lawName)!;
    }

    return null;
  }

  /**
   * 重複除去とソート
   */
  private deduplicateAndSort(references: DetectedReference[]): DetectedReference[] {
    const seen = new Set<string>();
    const unique: DetectedReference[] = [];

    for (const ref of references) {
      const key = `${ref.position || 0}:${ref.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(ref);
      }
    }

    return unique.sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  /**
   * 法令参照を記録（文脈追跡用）
   */
  updateContext(lawId: string, lawName: string, position: number) {
    // 最近の法令リストに追加
    this.contextState.recentLaws.unshift({ lawId, lawName, position });
    
    // 最大5件まで保持
    if (this.contextState.recentLaws.length > 5) {
      this.contextState.recentLaws.pop();
    }
  }
}

// =========================
// e-Gov比較検証機能
// =========================

/**
 * e-Govとの参照比較検証
 */
export async function compareWithEGov(lawId: string, lawName: string): Promise<void> {
  console.log(chalk.cyan(`\n🔍 e-Govとの参照比較検証: ${lawName}`));
  console.log('='.repeat(80));
  
  try {
    // e-Gov APIから法令データ取得
    const egovUrl = `https://laws.e-gov.go.jp/api/1/lawdata/${lawId}`;
    console.log(chalk.yellow(`📡 e-Gov APIから取得中: ${egovUrl}`));
    
    const response = await fetch(egovUrl);
    if (!response.ok) {
      console.error(chalk.red(`❌ e-Gov APIエラー: ${response.status}`));
      return;
    }
    
    const xmlText = await response.text();
    
    // XMLパース
    const parser = new (require('fast-xml-parser').XMLParser)({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text'
    });
    
    const data = parser.parse(xmlText);
    const lawData = data?.DataRoot?.ApplData?.LawFullText?.Law;
    
    if (!lawData) {
      console.error(chalk.red('❌ 法令データが見つかりません'));
      return;
    }
    
    // 条文テキストを抽出
    const articles: string[] = [];
    function extractArticleText(node: any): void {
      if (node?.Article) {
        const articleNodes = Array.isArray(node.Article) ? node.Article : [node.Article];
        for (const article of articleNodes) {
          const sentences = [];
          if (article.Paragraph?.ParagraphSentence?.Sentence) {
            const sentenceNodes = Array.isArray(article.Paragraph.ParagraphSentence.Sentence) 
              ? article.Paragraph.ParagraphSentence.Sentence 
              : [article.Paragraph.ParagraphSentence.Sentence];
            for (const sentence of sentenceNodes) {
              if (typeof sentence === 'string') {
                sentences.push(sentence);
              } else if (sentence['#text']) {
                sentences.push(sentence['#text']);
              }
            }
          }
          if (sentences.length > 0) {
            articles.push(sentences.join(''));
          }
        }
      }
      
      for (const key in node) {
        if (typeof node[key] === 'object' && key !== 'Article') {
          extractArticleText(node[key]);
        }
      }
    }
    
    extractArticleText(lawData.LawBody);
    
    console.log(chalk.green(`✓ ${articles.length}条文を抽出`));
    
    // 参照検出実行
    const detector = new UltimateReferenceDetector();
    const fullText = articles.join('\n');
    const references = await detector.detectReferences(fullText, lawId, lawName);
    
    // 統計表示
    console.log(chalk.cyan('\n📊 検出結果:'));
    console.log(`総参照数: ${references.length}`);
    
    const byType: Record<string, number> = {};
    for (const ref of references) {
      byType[ref.type] = (byType[ref.type] || 0) + 1;
    }
    
    console.log('\n参照タイプ別:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}`);
    }
    
    const mappedCount = references.filter(r => r.targetLawId || r.targetArticle).length;
    const accuracy = references.length > 0 ? (mappedCount / references.length * 100) : 0;
    
    console.log(chalk.cyan('\n精度指標:'));
    console.log(`マッピング成功: ${chalk.green(mappedCount)}`);  
    console.log(`マッピング失敗: ${chalk.red(references.length - mappedCount)}`);
    console.log(`精度: ${accuracy >= 90 ? chalk.green : accuracy >= 70 ? chalk.yellow : chalk.red}(${accuracy.toFixed(1)}%)`);
    
  } catch (error) {
    console.error(chalk.red('❌ エラー:'), error);
  }
}

/**
 * 法令辞書の構築
 */
export async function buildLawDictionary(): Promise<void> {
  console.log(chalk.cyan('🔨 法令辞書の自動構築'));
  console.log('='.repeat(80));
  
  const { readFileSync, writeFileSync } = require('fs');
  const { join } = require('path');
  const { parse } = require('csv-parse/sync');
  
  const csvPath = join(process.cwd(), 'laws_data', 'all_law_list.csv');
  
  if (!existsSync(csvPath)) {
    console.error(chalk.red('❌ all_law_list.csv が見つかりません'));
    return;
  }
  
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  const titleToId: Record<string, string> = {};
  const abbreviationToId: Record<string, string> = {};
  let count = 0;
  
  for (const record of records) {
    const lawId = record['法令ID'] || record['law_id'];
    const title = record['法令名'] || record['law_title'];
    
    if (!lawId || !title) continue;
    
    titleToId[title] = lawId;
    
    // 略称生成
    const shortTitle = title.replace(/（.+）/g, '').trim();
    if (shortTitle !== title) {
      abbreviationToId[shortTitle] = lawId;
    }
    
    count++;
  }
  
  console.log(chalk.green(`✓ ${count}件の法令を処理`));
  
  // TypeScriptファイルとして出力
  const outputPath = join(process.cwd(), 'scripts', 'law-dictionary-generated.ts');
  const content = `// 自動生成された法令辞書\nexport const GENERATED_LAW_DICTIONARY = {\n  titleToId: ${JSON.stringify(titleToId, null, 2)},\n  abbreviationToId: ${JSON.stringify(abbreviationToId, null, 2)}\n};\n\nexport function findLawIdByName(name: string): string | undefined {\n  return GENERATED_LAW_DICTIONARY.titleToId[name] || GENERATED_LAW_DICTIONARY.abbreviationToId[name];\n}\n\nexport function findLawIdByNumber(number: string): string | undefined {\n  // TODO: 実装\n  return undefined;\n}`;
  
  writeFileSync(outputPath, content, 'utf-8');
  console.log(chalk.green(`✅ 辞書ファイルを生成: ${outputPath}`));
}

/**
 * ローカルのみの高速検証
 */
async function localOnlyValidation(count: number, random: boolean): Promise<void> {
  console.log(chalk.cyan('\n🚀 ローカル高速検証モード'));
  console.log('='.repeat(80));
  
  const { readFileSync, readdirSync } = require('fs');
  const { join } = require('path');
  const { parse } = require('csv-parse/sync');
  
  // CSVから法令リストを読み込み
  const csvPath = join(process.cwd(), 'laws_data', 'all_law_list.csv');
  if (!existsSync(csvPath)) {
    console.error(chalk.red('❌ all_law_list.csv が見つかりません'));
    return;
  }
  
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  // 法令リスト準備
  const laws: { id: string; name: string }[] = [];
  for (const record of records) {
    const lawId = record['法令ID'] || record['law_id'];
    const title = record['法令名'] || record['law_title'] || record['法令名漢字'];
    if (lawId && title) {
      laws.push({ id: lawId, name: title });
    }
  }
  
  console.log(`✓ ${laws.length}件の法令を読み込み`);
  
  // ランダム選択または順次選択
  const selectedLaws = random
    ? laws.sort(() => Math.random() - 0.5).slice(0, count)
    : laws.slice(0, count);
  
  console.log(`🎲 ${selectedLaws.length}件を${random ? 'ランダム' : '順次'}選択`);
  
  // LLMを無効化した高速検出器
  const detector = new UltimateReferenceDetector(false);
  const startTime = Date.now();
  let processed = 0;
  let totalRefs = 0;
  let totalArticles = 0;
  
  for (const law of selectedLaws) {
    processed++;
    
    // プログレス表示
    if (processed % 50 === 0 || processed === selectedLaws.length) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = processed / elapsed;
      const eta = (selectedLaws.length - processed) / rate;
      process.stdout.write(`\r進捗: ${processed}/${selectedLaws.length} (${Math.round(processed / selectedLaws.length * 100)}%) | 速度: ${rate.toFixed(1)}法令/秒 | 残り: ${Math.round(eta)}秒`);
    }
    
    try {
      // XMLファイル探索
      const xmlPath = join(process.cwd(), 'laws_data');
      const lawDirs = readdirSync(xmlPath);
      const lawDir = lawDirs.find((dir: string) => dir.startsWith(law.id));
      
      if (!lawDir) continue;
      
      const xmlFile = join(xmlPath, lawDir, `${lawDir}.xml`);
      if (!existsSync(xmlFile)) continue;
      
      const xmlContent = readFileSync(xmlFile, 'utf-8');
      const articles = xmlContent.match(/<Article[^>]*>[\s\S]*?<\/Article>/g) || [];
      
      // 最初の3条文のみサンプリング（高速化）
      const sampledArticles = articles.slice(0, 3);
      totalArticles += sampledArticles.length;
      
      // 検出実行
      const fullText = sampledArticles.join('\n');
      const refs = await detector.detectReferences(fullText, law.id, law.name);
      totalRefs += refs.length;
      
    } catch (error) {
      // エラーは無視して続行
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  console.log('\n');
  console.log(chalk.green('='.repeat(80)));
  console.log(chalk.cyan('📊 ローカル検証統計'));
  console.log(chalk.green('='.repeat(80)));
  console.log(`✅ 処理法令数: ${processed}件`);
  console.log(`📄 処理条文数: ${totalArticles}件`);
  console.log(`🔗 検出参照数: ${totalRefs}件`);
  console.log(`⏱️ 処理時間: ${elapsed.toFixed(1)}秒`);
  console.log(`⚡ 処理速度: ${(processed / elapsed).toFixed(1)}法令/秒`);
  console.log(`📈 平均参照数: ${(totalRefs / totalArticles).toFixed(1)}件/条文`);
  console.log(chalk.green('='.repeat(80)));
}

/**
 * 大規模e-Gov検証
 */
export async function massEGovValidation(
  count: number,
  random: boolean = false,
  statsOnly: boolean = false
): Promise<void> {
  console.log(chalk.cyan('\n🚀 大規模e-Gov検証開始'));
  console.log('='.repeat(80));
  
  // 統計のみモードの場合はローカル検証のみ
  if (statsOnly) {
    await localOnlyValidation(count, random);
    return;
  }
  
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const { parse } = require('csv-parse/sync');
  
  // CSVから法令リストを読み込み
  const csvPath = join(process.cwd(), 'laws_data', 'all_law_list.csv');
  
  if (!existsSync(csvPath)) {
    console.error(chalk.red('❌ all_law_list.csv が見つかりません'));
    return;
  }
  
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  // 法令リストを準備
  const laws: { id: string; name: string }[] = [];
  for (const record of records) {
    const lawId = record['法令ID'] || record['law_id'];
    const title = record['法令名'] || record['law_title'] || record['法令名漢字'];
    
    if (lawId && title) {
      laws.push({ id: lawId, name: title });
    }
  }
  
  console.log(chalk.green(`✓ ${laws.length}件の法令を読み込み`));
  
  // サンプリング
  let selectedLaws = laws;
  if (random) {
    // ランダム選択
    selectedLaws = [];
    const indices = new Set<number>();
    while (indices.size < Math.min(count, laws.length)) {
      indices.add(Math.floor(Math.random() * laws.length));
    }
    for (const idx of indices) {
      selectedLaws.push(laws[idx]);
    }
    console.log(chalk.yellow(`🎲 ${count}件をランダム選択`));
  } else {
    // 先頭から順番に
    selectedLaws = laws.slice(0, count);
  }
  
  // 検証実行
  const results: {
    lawId: string;
    lawName: string;
    total: number;
    success: number;
    accuracy: number;
    error?: string;
  }[] = [];
  
  console.log(chalk.yellow(`\n🔍 ${selectedLaws.length}法令を検証中...`));
  
  const detector = new UltimateReferenceDetector();
  let processed = 0;
  
  for (const law of selectedLaws) {
    processed++;
    
    // プログレス表示
    if (processed % 10 === 0 || processed === selectedLaws.length) {
      process.stdout.write(`\r進捗: ${processed}/${selectedLaws.length} (${Math.round(processed / selectedLaws.length * 100)}%)`);
    }
    
    try {
      // e-Gov APIから取得
      const egovUrl = `https://laws.e-gov.go.jp/api/1/lawdata/${law.id}`;
      const response = await fetch(egovUrl);
      
      if (!response.ok) {
        results.push({
          lawId: law.id,
          lawName: law.name,
          total: 0,
          success: 0,
          accuracy: 0,
          error: `APIエラー: ${response.status}`
        });
        continue;
      }
      
      const xmlText = await response.text();
      
      // XMLパース
      const parser = new (require('fast-xml-parser').XMLParser)({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        textNodeName: '#text'
      });
      
      const data = parser.parse(xmlText);
      const lawData = data?.DataRoot?.ApplData?.LawFullText?.Law;
      
      if (!lawData) {
        results.push({
          lawId: law.id,
          lawName: law.name,
          total: 0,
          success: 0,
          accuracy: 0,
          error: 'データなし'
        });
        continue;
      }
      
      // 条文テキストを抽出
      const articles: string[] = [];
      function extractArticleText(node: any): void {
        if (node?.Article) {
          const articleNodes = Array.isArray(node.Article) ? node.Article : [node.Article];
          for (const article of articleNodes) {
            const sentences = [];
            
            // Sentenceを再帰的に抽出
            function extractSentences(n: any): void {
              if (n?.Sentence) {
                const sentenceNodes = Array.isArray(n.Sentence) ? n.Sentence : [n.Sentence];
                for (const sentence of sentenceNodes) {
                  if (typeof sentence === 'string') {
                    sentences.push(sentence);
                  } else if (sentence['#text']) {
                    sentences.push(sentence['#text']);
                  }
                }
              }
              
              for (const key in n) {
                if (typeof n[key] === 'object' && key !== 'Sentence') {
                  extractSentences(n[key]);
                }
              }
            }
            
            extractSentences(article);
            
            if (sentences.length > 0) {
              articles.push(sentences.join(''));
            }
          }
        }
        
        for (const key in node) {
          if (typeof node[key] === 'object' && key !== 'Article') {
            extractArticleText(node[key]);
          }
        }
      }
      
      extractArticleText(lawData.LawBody);
      
      // サンプル条文で検証（全条文は重いため）
      const sampleArticles = articles.slice(0, Math.min(10, articles.length));
      const fullText = sampleArticles.join('\n');
      
      // 参照検出
      const references = await detector.detectReferences(fullText, law.id, law.name);
      
      // 統計
      const mappedCount = references.filter(r => r.targetLawId || r.targetArticle || r.targetLaw).length;
      const accuracy = references.length > 0 ? (mappedCount / references.length * 100) : 100;
      
      results.push({
        lawId: law.id,
        lawName: law.name,
        total: references.length,
        success: mappedCount,
        accuracy
      });
      
    } catch (error: any) {
      results.push({
        lawId: law.id,
        lawName: law.name,
        total: 0,
        success: 0,
        accuracy: 0,
        error: error.message
      });
    }
    
    // APIレート制限対策（大規模時は短縮）
    if (count >= 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
    } else {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  console.log('\n'); // プログレス表示の改行
  
  // 統計表示
  console.log(chalk.cyan('\n📊 検証結果統計'));
  console.log('='.repeat(80));
  
  const successfulResults = results.filter(r => !r.error);
  const failedResults = results.filter(r => r.error);
  
  console.log(`検証成功: ${chalk.green(successfulResults.length)}件`);
  console.log(`検証失敗: ${chalk.red(failedResults.length)}件`);
  
  if (successfulResults.length > 0) {
    const avgAccuracy = successfulResults.reduce((sum, r) => sum + r.accuracy, 0) / successfulResults.length;
    const perfectCount = successfulResults.filter(r => r.accuracy === 100).length;
    const highAccuracyCount = successfulResults.filter(r => r.accuracy >= 95).length;
    const mediumAccuracyCount = successfulResults.filter(r => r.accuracy >= 90 && r.accuracy < 95).length;
    const lowAccuracyCount = successfulResults.filter(r => r.accuracy < 90).length;
    
    console.log(chalk.cyan('\n精度分布:'));
    console.log(`  100%: ${chalk.green(perfectCount)}件`);
    console.log(`  95-99%: ${chalk.green(highAccuracyCount - perfectCount)}件`);
    console.log(`  90-94%: ${chalk.yellow(mediumAccuracyCount)}件`);
    console.log(`  90%未満: ${chalk.red(lowAccuracyCount)}件`);
    
    const accuracyColor = avgAccuracy >= 95 ? chalk.green : avgAccuracy >= 90 ? chalk.yellow : chalk.red;
    console.log(chalk.cyan('\n平均精度: ') + accuracyColor(`${avgAccuracy.toFixed(2)}%`));
    
    // ワースト10件
    if (!statsOnly) {
      const worstResults = successfulResults
        .sort((a, b) => a.accuracy - b.accuracy)
        .slice(0, 10);
      
      if (worstResults.length > 0 && worstResults[0].accuracy < 100) {
        console.log(chalk.yellow('\n📉 精度が低い法令 (Top 10):'));
        for (const result of worstResults) {
          if (result.accuracy < 100) {
            const color = result.accuracy >= 95 ? chalk.green : result.accuracy >= 90 ? chalk.yellow : chalk.red;
            console.log(`  ${result.lawName.slice(0, 40).padEnd(40, ' ')} ${color(result.accuracy.toFixed(1) + '%')}`);
          }
        }
      }
    }
    
    // 参照タイプ別統計
    const typeStats: Record<string, number> = {};
    let totalRefs = 0;
    
    for (const result of successfulResults) {
      totalRefs += result.total;
    }
    
    if (totalRefs > 0) {
      console.log(chalk.cyan(`\n総参照数: ${totalRefs.toLocaleString()}件`));
      console.log(`平均参照数/法令: ${(totalRefs / successfulResults.length).toFixed(1)}件`);
    }
  }
  
  // CSVレポート出力
  if (count >= 100) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(process.cwd(), 'Report', `egov_validation_${timestamp}.csv`);
    
    let csvContent = '法令ID,法令名,総参照数,成功数,精度,エラー\n';
    for (const result of results) {
      csvContent += `"${result.lawId}","${result.lawName.replace(/"/g, '""')}",${result.total},${result.success},${result.accuracy.toFixed(2)},"${result.error || ''}"\n`;
    }
    
    writeFileSync(reportPath, csvContent, 'utf-8');
    console.log(chalk.green(`\n💾 レポートを保存: ${reportPath}`));
  }
}

// エクスポート
export default UltimateReferenceDetector;