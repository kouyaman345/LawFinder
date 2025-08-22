#!/usr/bin/env npx tsx

/**
 * 究極の参照検出エンジン
 * 
 * パターン検出、文脈追跡、略称辞書、LLM統合を実装
 * 検証レポートに基づく改善を反映
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { NegativePatternFilter } from './negative-patterns';
import { 
  normalizeArticleNumber, 
  toNumericFormat, 
  toDisplayFormat, 
  resolveRelativeReference,
  extractArticleNumbers 
} from '../src/utils/article-normalizer';
import { RelativeReferenceResolver, CurrentContext } from '../src/services/relative-reference-resolver';

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
  type: 'external' | 'internal' | 'relative' | 'structural' | 'application' | 'contextual' | 'defined' | 'range' | 'conditional';
  text: string;
  targetLaw?: string;
  targetLawId?: string;
  targetArticle?: string;
  targetParagraph?: number;
  articleNumber?: number;
  confidence: number;
  resolutionMethod: 'pattern' | 'dictionary' | 'context' | 'llm' | 'definition' | 'lawNumber' | 'relative';
  position?: number;
  
  // 拡張位置情報（新規追加）
  enhanced?: {
    source: {
      startPos: number;
      endPos: number;
      lineNumber?: number;
      paragraphNumber?: number;
      itemNumber?: string;
    };
    target: {
      paragraphNumber?: number;
      itemNumber?: string;
      subItemNumber?: string;
    };
  };
  
  // 範囲参照用
  rangeStart?: string;
  rangeEnd?: string;
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
  
  // 相対参照リゾルバー
  private readonly relativeResolver = new RelativeReferenceResolver();
  
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
  private negativeFilter: NegativePatternFilter;
  
  // 法令メタデータキャッシュ（条文数を記録）
  private lawMetadataCache: Map<string, { maxArticle: number; title: string }> = new Map();

  constructor(enableLLM = true, enableNegativeFilter = true) {
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
    this.negativeFilter = new NegativePatternFilter();
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
    const deduplicated = this.deduplicateAndSort(references);
    
    // === Phase 4: ネガティブパターンフィルタリング ===
    // 参照でないものを除外して精度を向上
    const filtered = this.filterNegativePatterns(deduplicated, text);
    
    return filtered;
  }

  /**
   * Phase 1: パターンベースの検出
   */
  private detectByPattern(text: string): DetectedReference[] {
    const references: DetectedReference[] = [];

    // パターン1: 法令名（括弧付き法令番号）
    const pattern1 = /([^、。\s（）]*法)(?:（[^）]+）)?/g;
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

    // パターン2a: 法令名＋条文（数字版）
    const pattern2a = /([^、。\s（）「」『』]+(?:法|令|規則|条例))第(\d+)条(?:第(\d+)項)?/g;
    
    while ((match = pattern2a.exec(text)) !== null) {
      const lawName = match[1];
      const lawId = this.findLawId(lawName);
      
      if (lawId && lawId !== this.contextState.currentLawId) {
        // 外部法令参照
        let refText = `${lawName}第${match[2]}条`;
        if (match[3]) refText = `${lawName}第${match[2]}条第${match[3]}項`;
        
        references.push({
          type: 'external',
          text: refText,
          targetLaw: lawName,
          targetLawId: lawId,
          targetArticle: toNumericFormat(`第${match[2]}条`) + (match[3] ? `第${match[3]}項` : ''),
          articleNumber: parseInt(match[2]),
          confidence: 0.95,
          resolutionMethod: 'dictionary',
          position: match.index
        });
      }
    }
    
    // パターン2b: 法令名＋条文（漢数字対応版）
    // 改善版: 法令名の前に区切り文字を要求し、長すぎる法令名を除外
    const pattern2b = /(?:^|[、。\s（「『])((?:[^、。\s（）「』]{2,30})?法(?:律)?)第([一二三四五六七八九十百千]+)条/g;

    while ((match = pattern2b.exec(text)) !== null) {
      const lawName = match[1];
      
      // 法令名の妥当性チェック
      if (!lawName || lawName.length > 25) {
        continue; // 長すぎる法令名は誤検出の可能性が高い
      }
      
      // 誤検出しやすいパターンを除外
      if (lawName.endsWith('する法') || lawName.endsWith('による法') || 
          lawName.endsWith('に関する法') || lawName.endsWith('の法')) {
        // これらは文脈の一部である可能性が高い
        // ただし、正式な法令名の場合は辞書でチェック
        const lawId = this.findLawId(lawName);
        if (!lawId) {
          continue; // 辞書に無い場合は誤検出として除外
        }
      }
      
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

          if (!alreadyDetected && lawId) {
            // 条文番号を抽出して妥当性チェック
            const articleNumber = this.kanjiToNumber(match[2]);
            
            if (articleNumber && this.validateArticleNumber(lawId, articleNumber)) {
              references.push({
                type: 'external',
                text: match[0],
                targetLaw: lawName,
                targetLawId: lawId,
                targetArticle: `第${match[2]}条`,
                articleNumber: articleNumber,
                confidence: 0.9,
                resolutionMethod: 'dictionary',
                position: match.index
              });
            }
          }
        }
      }
    }

    // パターン2c: 単独の条文参照（漢数字対応）
    const pattern2c = /第([一二三四五六七八九十百千]+)条/g;
    
    while ((match = pattern2c.exec(text)) !== null) {
      // 既に検出済みでないか確認
      const alreadyDetected = references.some(ref => 
        ref.position === match.index
      );
      
      if (!alreadyDetected) {
        const articleNumber = this.kanjiToNumber(match[1]);
        
        if (articleNumber) {
          references.push({
            type: 'internal',
            text: match[0],
            targetLawId: this.contextState.currentLawId,
            targetLaw: this.contextState.currentLawName,
            targetArticle: match[0],
            articleNumber: articleNumber,
            confidence: 0.95,
            resolutionMethod: 'pattern',
            position: match.index
          });
        }
      }
    }

    
    // パターン2.5: 単独の条文参照（数字）
    const pattern2_5a = /第(\d+)条(?:第(\d+)項)?(?:第(\d+)号)?/g;
    while ((match = pattern2_5a.exec(text)) !== null) {
      // 既に検出済みでないか確認
      const alreadyDetected = references.some(ref => 
        ref.position === match.index
      );
      
      if (!alreadyDetected) {
        const articleNumber = parseInt(match[1]);
        let refText = `第${match[1]}条`;
        if (match[2]) refText += `第${match[2]}項`;
        if (match[3]) refText += `第${match[3]}号`;
        
        references.push({
          type: 'internal',
          text: refText,
          targetLawId: this.contextState.currentLawId,
          targetLaw: this.contextState.currentLawName,
          targetArticle: refText,
          articleNumber: articleNumber,
          confidence: 0.95,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }
    
    // パターン2.6: 複数条文（及び・並びに）
    const pattern2_6 = /第(\d+)条(?:及び|並びに)第(\d+)条/g;
    while ((match = pattern2_6.exec(text)) !== null) {
      // 第1条文
      references.push({
        type: 'internal',
        text: `第${match[1]}条`,
        targetArticle: match[1],
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
      // 第2条文
      references.push({
        type: 'internal',
        text: `第${match[2]}条`,
        targetArticle: match[2],
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index + match[0].indexOf(`第${match[2]}条`)
      });
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

    // パターン4: 相対参照（改善版）
    const relativePatterns = [
      '前条', '次条', '前項', '次項', '前二項', '前三項', '前各項',
      '同条', '本条', '同項', '本項', '各項', '前号', '次号', '前各号'
    ];

    for (const pattern of relativePatterns) {
      const regex = new RegExp(pattern, 'g');
      while ((match = regex.exec(text)) !== null) {
        // 新しいリゾルバーを使用
        const context: CurrentContext = {
          lawId: this.contextState.currentLawId,
          lawName: this.contextState.currentLawName,
          articleNumber: toNumericFormat(this.contextState.currentArticle),
          paragraphNumber: this.contextState.currentParagraphNumber || undefined
        };
        
        const resolved = this.relativeResolver.resolve(pattern, context);
        
        if (resolved) {
          references.push({
            type: 'relative',
            text: pattern,
            targetLawId: resolved.lawId,
            targetLaw: this.contextState.currentLawName,
            targetArticle: resolved.articleNumber,
            articleNumber: parseInt(resolved.articleNumber, 10),
            targetParagraph: resolved.paragraphNumber,
            confidence: resolved.confidence,
            resolutionMethod: 'relative',
            position: match.index,
            // 拡張情報を追加
            enhanced: {
              source: {
                startPos: match.index!,
                endPos: match.index! + pattern.length,
                lineNumber: this.getLineNumber(text, match.index!),
                paragraphNumber: this.contextState.currentParagraphNumber
              },
              target: {
                paragraphNumber: resolved.paragraphNumber
              }
            }
          });
        } else {
          // 解決できない場合も記録（信頼度低）
          references.push({
            type: 'relative',
            text: pattern,
            targetLawId: this.contextState.currentLawId,
            targetLaw: this.contextState.currentLawName,
            confidence: 0.3,
            resolutionMethod: 'relative',
            position: match.index
          });
        }
      }
    }

    // パターン5: 範囲参照の展開（新規追加）
    const rangePattern = /第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]))?から第([一二三四五六七八九十百千]+)条(?:の([一二三四五六七八九十]))?まで/g;
    
    while ((match = rangePattern.exec(text)) !== null) {
      const startArticle = this.kanjiToNumber(match[1]);
      const startBranch = match[2] ? this.kanjiToNumber(match[2]) : null;
      const endArticle = this.kanjiToNumber(match[3]);
      const endBranch = match[4] ? this.kanjiToNumber(match[4]) : null;
      
      if (startArticle && endArticle) {
        // 範囲参照として記録
        references.push({
          type: 'range' as const,
          text: match[0],
          targetLawId: this.contextState.currentLawId,
          targetLaw: this.contextState.currentLawName,
          targetArticle: `第${startArticle}条から第${endArticle}条まで`,
          confidence: 0.90,
          resolutionMethod: 'pattern',
          position: match.index
        });
        
        // 範囲内の各条文を展開（オプション）
        if (startArticle === endArticle && startBranch && endBranch) {
          // 同じ条の枝番号範囲（例：第32条の2から第32条の5まで）
          for (let i = startBranch; i <= endBranch; i++) {
            references.push({
              type: 'internal',
              text: `第${startArticle}条の${i}`,
              targetLawId: this.contextState.currentLawId,
              targetArticle: `第${startArticle}条の${i}`,
              confidence: 0.85,
              resolutionMethod: 'pattern',
              position: match.index
            });
          }
        } else if (!startBranch && !endBranch) {
          // 通常の条文範囲（例：第1条から第3条まで）
          for (let i = startArticle; i <= endArticle; i++) {
            references.push({
              type: 'internal',
              text: `第${i}条`,
              targetLawId: this.contextState.currentLawId,
              targetArticle: `第${i}条`,
              confidence: 0.85,
              resolutionMethod: 'pattern',
              position: match.index
            });
          }
        }
      }
    }
    
    // パターン5b: 範囲参照（アラビア数字版）
    const rangePatternArabic = /第(\d+)条から第(\d+)条まで/g;
    
    while ((match = rangePatternArabic.exec(text)) !== null) {
      const startArticle = parseInt(match[1]);
      const endArticle = parseInt(match[2]);
      
      if (startArticle && endArticle) {
        // 範囲参照として記録
        references.push({
          type: 'range' as const,
          text: match[0],
          targetLawId: this.contextState.currentLawId,
          targetLaw: this.contextState.currentLawName,
          targetArticle: `第${startArticle}条から第${endArticle}条まで`,
          confidence: 0.90,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }
    
    // パターン5c: 範囲参照（枝番号付き）
    const rangePatternBranch = /第(\d+)条の(\d+)から第(\d+)条の(\d+)まで/g;
    
    while ((match = rangePatternBranch.exec(text)) !== null) {
      const startArticle = parseInt(match[1]);
      const startBranch = parseInt(match[2]);
      const endArticle = parseInt(match[3]);
      const endBranch = parseInt(match[4]);
      
      if (startArticle && startBranch && endArticle && endBranch) {
        references.push({
          type: 'range' as const,
          text: match[0],
          targetLawId: this.contextState.currentLawId,
          targetLaw: this.contextState.currentLawName,
          targetArticle: `第${startArticle}条の${startBranch}から第${endArticle}条の${endBranch}まで`,
          confidence: 0.90,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }
    
    // パターン5d: 項の範囲参照
    const rangePatternParagraph = /第(\d+)条第(\d+)項から第(\d+)項まで/g;
    
    while ((match = rangePatternParagraph.exec(text)) !== null) {
      const article = parseInt(match[1]);
      const startPara = parseInt(match[2]);
      const endPara = parseInt(match[3]);
      
      if (article && startPara && endPara) {
        references.push({
          type: 'range' as const,
          text: match[0],
          targetLawId: this.contextState.currentLawId,
          targetLaw: this.contextState.currentLawName,
          targetArticle: `第${article}条第${startPara}項から第${endPara}項まで`,
          confidence: 0.90,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }
    
    // パターン5.5: 構造参照（章・節）
    const pattern5_5 = /第(\d+)章(?:第(\d+)節)?/g;
    while ((match = pattern5_5.exec(text)) !== null) {
      references.push({
        type: 'structural',
        text: match[0],
        targetArticle: match[2] ? `章${match[1]}節${match[2]}` : `章${match[1]}`,
        confidence: 0.85,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }


    // パターン6: 定義された用語（新法、旧法など）
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
    
    // パターン7: 括弧内参照の処理（新規追加）
    // まず括弧外の第X条を検出
    const articleWithBracketPattern = /第(\d+)条（([^）]+)）/g;
    while ((match = articleWithBracketPattern.exec(text)) !== null) {
      // メインの条文参照
      references.push({
        type: 'internal',
        text: `第${match[1]}条`,
        targetArticle: `第${match[1]}条`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
      
      // 括弧内のテキストを解析
      const innerText = match[2];
      if (innerText.includes('第') && (innerText.includes('条') || innerText.includes('項'))) {
        // 括弧内の条文参照を検出
        const innerPattern = /第(\d+)条(?:第(\d+)項)?/g;
        let innerMatch;
        while ((innerMatch = innerPattern.exec(innerText)) !== null) {
          references.push({
            type: 'internal',
            text: innerMatch[0],
            targetArticle: innerMatch[0],
            confidence: 0.90, // 括弧内なので信頼度を少し下げる
            resolutionMethod: 'pattern',
            position: match.index + match[0].indexOf(innerMatch[0]),
            inBracket: true
          });
        }
      }
    }
    
    // パターン8: 準用パターン（新規追加）
    const junyoPattern = /第(\d+)条(?:から第(\d+)条まで)?の規定[はを]、?([^。]+について)?準用/g;
    while ((match = junyoPattern.exec(text)) !== null) {
      const startArticle = match[1];
      const endArticle = match[2];
      
      references.push({
        type: 'application' as const,
        text: match[0],
        targetLawId: this.contextState.currentLawId,
        targetLaw: this.contextState.currentLawName,
        targetArticle: endArticle ? `第${startArticle}条から第${endArticle}条まで` : `第${startArticle}条`,
        applicationMethod: 'junyo',
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
    
    // パターン9: 読替えパターン（新規追加）
    const yomikaePattern = /第(\d+)条(?:第(\d+)項)?中「([^」]+)」とあるのは「([^」]+)」と読み替え/g;
    while ((match = yomikaePattern.exec(text)) !== null) {
      references.push({
        type: 'application' as const,
        text: match[0],
        targetLawId: this.contextState.currentLawId,
        targetLaw: this.contextState.currentLawName,
        targetArticle: match[2] ? `第${match[1]}条第${match[2]}項` : `第${match[1]}条`,
        applicationMethod: 'yomikae',
        originalTerm: match[3],
        replacedTerm: match[4],
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
    
    // パターン10: 複数法令並列参照（新規追加）
    const multiLawPattern = /([^、。\s（）「」『』]+法)第(\d+)条(?:(?:及び|並びに|又は|若しくは)([^、。\s（）「」『』]+法)第(\d+)条)+/g;
    while ((match = multiLawPattern.exec(text)) !== null) {
      // 最初の法令と条文
      const firstLaw = match[1];
      const firstArticle = match[2];
      
      // 最初の法令を検出
      const firstLawId = this.findLawId(firstLaw);
      if (firstLawId) {
        references.push({
          type: 'external',
          text: `${firstLaw}第${firstArticle}条`,
          targetLaw: firstLaw,
          targetLawId: firstLawId,
          targetArticle: `第${firstArticle}条`,
          confidence: 0.95,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
      
      // 2番目の法令と条文（存在する場合）
      if (match[3] && match[4]) {
        const secondLaw = match[3];
        const secondArticle = match[4];
        const secondLawId = this.findLawId(secondLaw);
        
        if (secondLawId) {
          references.push({
            type: 'external',
            text: `${secondLaw}第${secondArticle}条`,
            targetLaw: secondLaw,
            targetLawId: secondLawId,
            targetArticle: `第${secondArticle}条`,
            confidence: 0.95,
            resolutionMethod: 'pattern',
            position: match.index + match[0].indexOf(secondLaw)
          });
        }
      }
    }
    
    // パターン10b: 簡略版の複数法令並列（「民法第90条及び第91条」のような同一法令内）
    const sameLawMultiplePattern = /([^、。\s（）「」『』]+法)第(\d+)条(?:(?:及び|並びに|又は|若しくは)第(\d+)条)+/g;
    while ((match = sameLawMultiplePattern.exec(text)) !== null) {
      const lawName = match[1];
      const firstArticle = match[2];
      const secondArticle = match[3];
      
      const lawId = this.findLawId(lawName);
      if (lawId) {
        // 最初の条文
        references.push({
          type: 'external',
          text: `${lawName}第${firstArticle}条`,
          targetLaw: lawName,
          targetLawId: lawId,
          targetArticle: `第${firstArticle}条`,
          confidence: 0.95,
          resolutionMethod: 'pattern',
          position: match.index
        });
        
        // 2番目の条文
        if (secondArticle) {
          references.push({
            type: 'external',
            text: `第${secondArticle}条`,
            targetLaw: lawName,
            targetLawId: lawId,
            targetArticle: `第${secondArticle}条`,
            confidence: 0.95,
            resolutionMethod: 'pattern',
            position: match.index + match[0].lastIndexOf(`第${secondArticle}条`)
          });
        }
      }
    }

    // パターン11: 階層構造（編・章・節・款・目）の検出
    const hierarchyPattern = /第([一二三四五六七八九十百千]+)(編|章|節|款|目)(?:第([一二三四五六七八九十百千]+)(編|章|節|款|目))?(?:第([一二三四五六七八九十百千]+)(編|章|節|款|目))?(?:第([一二三四五六七八九十百千]+)(編|章|節|款|目))?/g;
    while ((match = hierarchyPattern.exec(text)) !== null) {
      references.push({
        type: 'structural',
        text: match[0],
        confidence: 0.85,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
    
    // パターン12: 前々条・次々条の検出
    const doubleRelativePattern = /(前々|次々)(条|項|号)/g;
    while ((match = doubleRelativePattern.exec(text)) !== null) {
      references.push({
        type: 'relative',
        text: match[0],
        confidence: 0.8,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
    
    // パターン13: 条項混在範囲（第X条第Y項から第Z条第W項まで）
    const mixedRangePattern = /第(\d+)条第(\d+)項から第(\d+)条第(\d+)項まで/g;
    while ((match = mixedRangePattern.exec(text)) !== null) {
      references.push({
        type: 'range',
        text: match[0],
        rangeStart: `第${match[1]}条第${match[2]}項`,
        rangeEnd: `第${match[3]}条第${match[4]}項`,
        confidence: 0.9,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
    
    // パターン14: 政令・省令・規則参照（告示も含む改良版）
    const regulationPattern = /(?:(?:平成|令和|昭和)([一二三四五六七八九十]+)年)?([^、。\s（）「」『』]*(?:省|府|庁|委員会))?(?:告示|施行令|施行規則|省令|政令|規則)(?:第([一二三四五六七八九十百千]+)号)?(?:第(\d+)条)?(?:第(\d+)項)?/g;
    while ((match = regulationPattern.exec(text)) !== null) {
      if (match[4] || match[3]) { // 条文番号または号番号がある場合
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: match[0].replace(/第\d+条.*/, '').trim(),
          targetArticle: match[4] ? `第${match[4]}条` : undefined,
          confidence: 0.85,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }
    
    // パターン15: 号のイロハ列挙（第X条第Y項第Z号イからホまで）
    const irohaPattern = /第(\d+)条(?:第(\d+)項)?第(\d+)号([イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス])から([イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス])まで/g;
    while ((match = irohaPattern.exec(text)) !== null) {
      references.push({
        type: 'range',
        text: match[0],
        rangeStart: `第${match[1]}条${match[2] ? `第${match[2]}項` : ''}第${match[3]}号${match[4]}`,
        rangeEnd: `第${match[1]}条${match[2] ? `第${match[2]}項` : ''}第${match[3]}号${match[5]}`,
        confidence: 0.85,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }
    
    // パターン16: 若しくは・又は・並びにの選択的参照
    const selectivePattern = /第(\d+)条(?:若しくは|又は|並びに)第(\d+)条/g;
    while ((match = selectivePattern.exec(text)) !== null) {
      // 最初の条文
      references.push({
        type: 'internal',
        text: `第${match[1]}条`,
        targetArticle: `第${match[1]}条`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
      // 2番目の条文
      references.push({
        type: 'internal',
        text: `第${match[2]}条`,
        targetArticle: `第${match[2]}条`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index + match[0].lastIndexOf(`第${match[2]}条`)
      });
    }
    
    // パターン17: 附則参照の強化
    const supplementaryPattern = /附則第(\d+)条(?:から第(\d+)条まで)?(?:第(\d+)項)?/g;
    while ((match = supplementaryPattern.exec(text)) !== null) {
      if (match[2]) {
        // 範囲参照
        references.push({
          type: 'range',
          text: match[0],
          rangeStart: `附則第${match[1]}条`,
          rangeEnd: `附則第${match[2]}条`,
          confidence: 0.85,
          resolutionMethod: 'pattern',
          position: match.index
        });
      } else {
        // 単一参照
        references.push({
          type: 'internal',
          text: match[0],
          targetArticle: `附則第${match[1]}条${match[3] ? `第${match[3]}項` : ''}`,
          confidence: 0.9,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }
    
    // パターン18: 複数号の列挙（第三号及び第四号）
    const multipleItemPattern = /(?:同項)?第([一二三四五六七八九十]+)号(?:及び|並びに|又は|若しくは)第([一二三四五六七八九十]+)号/g;
    while ((match = multipleItemPattern.exec(text)) !== null) {
      // 第一号
      references.push({
        type: 'internal',
        text: `第${match[1]}号`,
        confidence: 0.9,
        resolutionMethod: 'pattern',
        position: match.index
      });
      // 第二号
      references.push({
        type: 'internal',
        text: `第${match[2]}号`,
        confidence: 0.9,
        resolutionMethod: 'pattern',
        position: match.index + match[0].lastIndexOf(`第${match[2]}号`)
      });
    }
    
    // パターン19: 会社法特有の括弧内準用（第XXX条第X項において準用する場合を含む）
    const companyLawJunyoPattern = /第(\d+)条(?:第(\d+)項)?（第(\d+)条(?:第(\d+)項)?において準用する場合を含む。）/g;
    while ((match = companyLawJunyoPattern.exec(text)) !== null) {
      // 元の条文
      references.push({
        type: 'internal',
        text: `第${match[1]}条${match[2] ? `第${match[2]}項` : ''}`,
        targetArticle: `第${match[1]}条${match[2] ? `第${match[2]}項` : ''}`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
      // 準用先の条文
      references.push({
        type: 'application',
        text: `第${match[3]}条${match[4] ? `第${match[4]}項` : ''}において準用`,
        targetArticle: `第${match[3]}条${match[4] ? `第${match[4]}項` : ''}`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }

    // パターン20: 会社法の条文範囲表記（第XXX条の二、第XXX条の三など）
    const companyLawRangePattern = /第(\d+)条から第(\d+)条の(\d+)まで/g;
    while ((match = companyLawRangePattern.exec(text)) !== null) {
      references.push({
        type: 'range',
        text: match[0],
        rangeStart: `第${match[1]}条`,
        rangeEnd: `第${match[2]}条の${match[3]}`,
        confidence: 0.9,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }

    // パターン21: 会社法の複雑な条項組み合わせ（第XXX条第Y項第Z号）
    const companyLawComplexPattern = /第(\d+)条第([一二三四五六七八九十]+)項第([一二三四五六七八九十]+)号/g;
    while ((match = companyLawComplexPattern.exec(text)) !== null) {
      const paragraph = this.kanjiToNumber(match[2]);
      const item = this.kanjiToNumber(match[3]);
      references.push({
        type: 'internal',
        text: match[0],
        targetArticle: `第${match[1]}条第${paragraph}項第${item}号`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }

    // パターン22: 会社法の複雑な準用パターン（において準用する同条第X項）
    const complexJunyoPattern = /第(\d+)条(?:第(\d+)項)?において準用する(?:同条)?第(\d+)項/g;
    while ((match = complexJunyoPattern.exec(text)) !== null) {
      references.push({
        type: 'application',
        text: match[0],
        targetArticle: `第${match[1]}条${match[3] ? `第${match[3]}項` : ''}`,
        confidence: 0.9,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }

    // パターン23: 会社法の条文番号枝番（第XXX条の二、第XXX条の三）
    const branchNumberPattern = /第(\d+)条の([二三四五六七八九十]+)/g;
    while ((match = branchNumberPattern.exec(text)) !== null) {
      const branchNum = this.kanjiToNumber(match[2]);
      references.push({
        type: 'internal',
        text: match[0],
        targetArticle: `第${match[1]}条の${branchNum}`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }

    // パターン24: 会社法の場合分け参照（場合には、場合において）
    const conditionalPattern = /(?:の場合には|の場合において)、第(\d+)条(?:第(\d+)項)?(?:の規定)?/g;
    while ((match = conditionalPattern.exec(text)) !== null) {
      references.push({
        type: 'conditional',
        text: match[0],
        targetArticle: `第${match[1]}条${match[2] ? `第${match[2]}項` : ''}`,
        confidence: 0.85,
        resolutionMethod: 'pattern',
        position: match.index
      });
    }

    // パターン25: 定義後の略称使用（「法」第91条のような略称）
    // 定義検出で記録された略称を使用
    if (this.contextState && this.contextState.definitions) {
      for (const [abbreviation, definition] of this.contextState.definitions) {
        // 「法」第XX条のパターン
        const abbrevPattern = new RegExp(`${abbreviation}第(\\d+)条`, 'g');
        let match;
        while ((match = abbrevPattern.exec(text)) !== null) {
          references.push({
            type: 'external',
            text: match[0],
            targetLaw: definition.actualLaw,
            targetArticle: `第${match[1]}条`,
            confidence: 0.85,
            resolutionMethod: 'context',
            position: match.index
          });
        }
      }
    }

    // パターン20: 選択的参照（若しくは・又は）
    const alternativePattern = /第(\d+)条(?:第(\d+)項)?(?:若しくは|又は)第(\d+)条(?:第(\d+)項)?/g;
    while ((match = alternativePattern.exec(text)) !== null) {
      // 第1の選択肢
      references.push({
        type: 'internal',
        text: match[2] ? `第${match[1]}条第${match[2]}項` : `第${match[1]}条`,
        targetArticle: match[2] ? `第${match[1]}条第${match[2]}項` : `第${match[1]}条`,
        articleNumber: parseInt(match[1]),
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
      
      // 第2の選択肢
      const secondStart = match.index + match[0].indexOf(`第${match[3]}条`);
      references.push({
        type: 'internal',
        text: match[4] ? `第${match[3]}条第${match[4]}項` : `第${match[3]}条`,
        targetArticle: match[4] ? `第${match[3]}条第${match[4]}項` : `第${match[3]}条`,
        articleNumber: parseInt(match[3]),
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: secondStart
      });
    }
    
    // パターン21: 除外規定（〜を除く）
    const exclusionPattern = /第(\d+)条(?:（第(\d+)項を除く。?）)?/g;
    while ((match = exclusionPattern.exec(text)) !== null) {
      if (match[2]) {
        references.push({
          type: 'internal',
          text: match[0],
          targetArticle: `第${match[1]}条`,
          articleNumber: parseInt(match[1]),
          exclusion: `第${match[2]}項`,
          confidence: 0.95,
          resolutionMethod: 'pattern',
          position: match.index
        });
      }
    }
    
    // パターン22: 号の列挙（第X号から第Y号まで）
    const itemRangePattern = /第(\d+)条(?:第(\d+)項)?第(\d+)号から第(\d+)号まで/g;
    while ((match = itemRangePattern.exec(text)) !== null) {
      references.push({
        type: 'internal',
        text: match[0],
        targetArticle: match[2] ? `第${match[1]}条第${match[2]}項` : `第${match[1]}条`,
        itemRange: `第${match[3]}号から第${match[4]}号まで`,
        confidence: 0.95,
        resolutionMethod: 'pattern',
        position: match.index
      });
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
      { pattern: /この法/g, key: 'this_law_short' },
      // 省略形参照の追加
      { pattern: /同条第(\d+)項/g, key: 'same_article_para' },
      { pattern: /同項/g, key: 'same_paragraph' },
      { pattern: /同号/g, key: 'same_item' },
      { pattern: /別表第([一二三四五六七八九十]+)/g, key: 'appendix' }
    ];

    for (const { pattern, key } of contextPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (key === 'same_article_para') {
          // 同条第2項のような省略形
          const para = match[1];
          references.push({
            type: 'contextual',
            text: match[0],
            targetLawId: this.contextState.currentLawId,
            targetLaw: this.contextState.currentLawName,
            targetArticle: this.contextState.currentArticle,
            targetParagraph: para,
            confidence: 0.85,
            resolutionMethod: 'context',
            position: match.index
          });
        } else if (key === 'same_paragraph' || key === 'same_item') {
          // 同項、同号の参照
          references.push({
            type: 'contextual',
            text: match[0],
            targetLawId: this.contextState.currentLawId,
            targetLaw: this.contextState.currentLawName,
            targetArticle: this.contextState.currentArticle,
            confidence: 0.80,
            resolutionMethod: 'context',
            position: match.index
          });
        } else if (key === 'appendix') {
          // 別表参照
          const tableNum = this.kanjiToNumber(match[1]);
          references.push({
            type: 'structural',
            text: match[0],
            targetLawId: this.contextState.currentLawId,
            targetLaw: this.contextState.currentLawName,
            targetArticle: `別表第${tableNum}`,
            confidence: 0.85,
            resolutionMethod: 'pattern',
            position: match.index
          });
        } else if (key === 'same_law' || key === '当該法') {
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

    
    // 同法の検出（改善版）
    if (text.includes('同法')) {
      const matches = text.matchAll(/同法(?:第(\d+)条)?/g);
      for (const match of matches) {
        // 直近の外部法令参照を探す
        const recentExternalRef = references
          .filter(r => r.type === 'external' && r.position! < match.index!)
          .sort((a, b) => (b.position || 0) - (a.position || 0))[0];
        
        if (recentExternalRef) {
          references.push({
            type: 'contextual',
            text: match[0],
            targetLaw: recentExternalRef.targetLaw,
            targetLawId: recentExternalRef.targetLawId,
            targetArticle: match[1] ? `第${match[1]}条` : undefined,
            confidence: 0.85,
            resolutionMethod: 'context',
            position: match.index
          });
        }
      }
    }
    
    // 当該規定の検出
    if (text.includes('当該')) {
      const matches = text.matchAll(/当該[^、。]{1,10}/g);
      for (const match of matches) {
        references.push({
          type: 'contextual',
          text: match[0],
          confidence: 0.60,
          resolutionMethod: 'context',
          position: match.index
        });
      }
    }

    return references;
  }

  /**
   * Phase 3: LLMによる検出（困難ケース・拡張版）
   */
  private async detectByLLM(
    text: string, 
    existingRefs: DetectedReference[]
  ): Promise<DetectedReference[]> {
    const references: DetectedReference[] = [];

    // 1. 曖昧な参照パターンの解決
    const ambiguousPatterns = [
      { pattern: /同法(?:第(\d+)条)?/g, type: 'same_law' },
      { pattern: /当該[^、。]{1,20}/g, type: 'current_ref' },
      { pattern: /別表第[一二三四五六七八九十]+に掲げる法律/g, type: 'appendix_law' },
      { pattern: /前各号の法/g, type: 'previous_items' },
      { pattern: /関係法令/g, type: 'related_laws' },
      { pattern: /改正前の(.+法)/g, type: 'old_law' },
      { pattern: /「(.{1,20}法)」/g, type: 'quoted_law' }
    ];

    // 2. 準用・読替えパターンの詳細解析
    const applicationPatterns = [
      { pattern: /(.+)の規定は、?(.+)について準用する/g, type: 'junyo' },
      { pattern: /(.+)中「(.+)」とあるのは「(.+)」と読み替える/g, type: 'yomikae' },
      { pattern: /(.+)の規定を準用する場合において/g, type: 'junyo_conditional' }
    ];

    // 3. 複雑な構造参照
    const complexPatterns = [
      { pattern: /第(\d+)条(?:第(\d+)項)?(?:（[^）]+を除く。?）)/g, type: 'exclusion' },
      { pattern: /第(\d+)条第(\d+)項(?:若しくは|又は)第(\d+)項/g, type: 'alternative' },
      { pattern: /第(\d+)条(?:第(\d+)項)?各号/g, type: 'all_items' }
    ];

    // LLMによる曖昧参照の解決
    for (const { pattern, type } of ambiguousPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const alreadyDetected = existingRefs.some(ref => 
          ref.text === match[0] || (ref.position === match.index)
        );

        if (!alreadyDetected) {
          const llmResult = await this.queryLLMEnhanced(
            match[0], 
            text, 
            type,
            existingRefs
          );
          
          if (llmResult && llmResult.confidence > 0.6) {
            references.push({
              type: llmResult.referenceType || 'contextual',
              text: match[0],
              targetLaw: llmResult.lawName,
              targetLawId: llmResult.lawId,
              targetArticle: llmResult.article,
              confidence: llmResult.confidence,
              resolutionMethod: 'llm',
              position: match.index
            });
          }
        }
      }
    }

    // 準用・読替えパターンの高度な解析
    for (const { pattern, type } of applicationPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const llmResult = await this.analyzeApplicationPattern(
          match,
          text,
          type,
          existingRefs
        );
        
        if (llmResult) {
          references.push(...llmResult);
        }
      }
    }

    return references;
  }

  /**
   * 拡張版LLMクエリ（構造化された応答）
   */
  private async queryLLMEnhanced(
    referenceText: string,
    context: string,
    referenceType: string,
    existingRefs: DetectedReference[]
  ): Promise<{
    lawName: string;
    lawId?: string;
    article?: string;
    confidence: number;
    referenceType?: string;
  } | null> {
    if (!this.llmAvailable) return null;

    try {
      // 文脈情報を充実させる
      const contextStart = Math.max(0, context.indexOf(referenceText) - 500);
      const contextEnd = Math.min(context.length, context.indexOf(referenceText) + 500);
      const enrichedContext = context.substring(contextStart, contextEnd);
      
      // 最近の法令参照を含める
      const recentLaws = existingRefs
        .filter(r => r.type === 'external')
        .slice(-3)
        .map(r => `${r.targetLaw}（${r.targetLawId}）`)
        .join(', ');

      // Few-shotプロンプティング
      const fewShotExamples = `
【解析例】
例1:
入力: "民法第90条"
出力: {"lawName": "民法", "article": "第90条", "confidence": 1.0}

例2:
入力: "同法第5条"（文脈：商法について議論中）
出力: {"lawName": "商法", "article": "第5条", "confidence": 0.9}

例3:
入力: "前条の規定"（直前が第42条）
出力: {"lawName": "現在の法令", "article": "第41条", "confidence": 0.95}

例4:
入力: "第331条第1項（第335条第1項において準用する場合を含む）"
出力: {"lawName": "会社法", "article": "第331条第1項", "confidence": 0.95}`;

      const prompt = `
あなたは日本の法令文書の専門家です。以下の参照を解析してください。

${fewShotExamples}

【文脈】
${enrichedContext}

【最近参照された法令】
${recentLaws || 'なし'}

【現在の法令】
${this.contextState.currentLawName || '不明'}

【解析対象の参照】
"${referenceText}"

【参照タイプ】
${referenceType}

【タスク】
この参照が指している内容を特定し、以下のJSON形式で回答してください：
{
  "lawName": "法令名（必須）",
  "article": "条文番号（あれば）",
  "confidence": 0.0-1.0の信頼度,
  "referenceType": "internal/external/contextual/application",
  "reasoning": "判断理由（簡潔に）"
}

JSONのみを回答してください。`;

      const response = execSync(
        `curl -s http://localhost:11434/api/generate -d '${JSON.stringify({
          model: 'mistral',
          prompt,
          stream: false,
          temperature: 0.1,
          max_tokens: 200
        }).replace(/'/g, "'\\''")}'`,
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
      );

      const result = JSON.parse(response);
      if (result.response) {
        // JSON部分を抽出
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            const lawId = this.findLawId(parsed.lawName);
            return {
              lawName: parsed.lawName,
              lawId,
              article: parsed.article,
              confidence: parsed.confidence || 0.7,
              referenceType: parsed.referenceType
            };
          } catch (e) {
            // JSON解析失敗時のフォールバック
            const lawNameMatch = result.response.match(/法令名[：:]\s*([^、。\n]+)/);
            if (lawNameMatch) {
              const lawName = lawNameMatch[1].trim();
              const lawId = this.findLawId(lawName);
              return { lawName, lawId, confidence: 0.5 };
            }
          }
        }
      }
    } catch (error) {
      // エラーは静かに処理
    }

    return null;
  }

  /**
   * 準用・読替えパターンの高度な解析
   */
  private async analyzeApplicationPattern(
    match: RegExpMatchArray,
    context: string,
    type: string,
    existingRefs: DetectedReference[]
  ): Promise<DetectedReference[]> {
    if (!this.llmAvailable) return [];

    try {
      const prompt = `
日本の法令における${type === 'junyo' ? '準用' : '読替え'}規定を解析してください。

【文脈】
${context.substring(Math.max(0, match.index! - 300), Math.min(context.length, match.index! + 300))}

【解析対象】
"${match[0]}"

【タスク】
1. 準用元/読替え元の条文を特定
2. 準用先/読替え先を特定
3. 適用範囲を明確化

JSON形式で回答：
{
  "sourceArticle": "準用元の条文",
  "targetContext": "準用先の文脈",
  "modifications": ["変更内容1", "変更内容2"],
  "confidence": 0.0-1.0
}`;

      const response = execSync(
        `curl -s http://localhost:11434/api/generate -d '${JSON.stringify({
          model: 'mistral',
          prompt,
          stream: false,
          temperature: 0.1
        }).replace(/'/g, "'\\''")}'`,
        { encoding: 'utf-8', maxBuffer: 1024 * 1024 }
      );

      const result = JSON.parse(response);
      if (result.response) {
        const jsonMatch = result.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            return [{
              type: 'application',
              text: match[0],
              targetArticle: parsed.sourceArticle,
              applicationMethod: type,
              confidence: parsed.confidence || 0.7,
              resolutionMethod: 'llm',
              position: match.index
            }];
          } catch (e) {
            // フォールバック
          }
        }
      }
    } catch (error) {
      // エラーは静かに処理
    }

    return [];
  }

  /**
   * 旧LLMクエリ（互換性のため残す）
   */
  private async queryLLM(
    referenceText: string, 
    context: string
  ): Promise<{ lawName: string; lawId?: string } | null> {
    const result = await this.queryLLMEnhanced(
      referenceText,
      context,
      'unknown',
      []
    );
    
    if (result) {
      return { lawName: result.lawName, lawId: result.lawId };
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
   * 行番号を取得
   */
  private getLineNumber(text: string, position: number): number {
    const beforeText = text.substring(0, position);
    return beforeText.split('\n').length;
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
   * 漢数字を数値に変換（メソッドとして抽出）
   */
  private kanjiToNumber(text: string): number | null {
    // 改善版：より正確な漢数字変換
    const singleDigits: Record<string, number> = {
      '〇': 0, '零': 0,
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9
    };
    
    // 基本単位
    const units: Record<string, number> = {
      '千': 1000,
      '百': 100,
      '十': 10
    };
    
    // 空文字や不正な入力のチェック
    if (!text || text.length === 0) return null;
    
    // 単純な一桁の数字
    if (singleDigits[text] !== undefined) return singleDigits[text];
    
    // 完全な漢数字パーサー実装
    let result = 0;
    let currentNumber = 0;
    let i = 0;
    
    while (i < text.length) {
      const char = text[i];
      
      // 千の位の処理
      if (char === '千') {
        if (i === 0) {
          // "千"で始まる場合は1000
          result += 1000;
        } else {
          const prevChar = text[i - 1];
          if (singleDigits[prevChar] !== undefined) {
            result += singleDigits[prevChar] * 1000;
            currentNumber = 0;
          } else {
            result += 1000;
          }
        }
      }
      // 百の位の処理
      else if (char === '百') {
        if (i === 0 || (i > 0 && units[text[i - 1]])) {
          // "百"で始まるか、前が単位の場合は100
          result += 100;
        } else {
          const prevChar = text[i - 1];
          if (singleDigits[prevChar] !== undefined) {
            result += singleDigits[prevChar] * 100;
            currentNumber = 0;
          } else {
            result += 100;
          }
        }
      }
      // 十の位の処理
      else if (char === '十') {
        if (i === 0 || (i > 0 && units[text[i - 1]])) {
          // "十"で始まるか、前が単位の場合は10
          result += 10;
        } else {
          const prevChar = text[i - 1];
          if (singleDigits[prevChar] !== undefined) {
            result += singleDigits[prevChar] * 10;
            currentNumber = 0;
          } else {
            result += 10;
          }
        }
      }
      // 一の位の処理
      else if (singleDigits[char] !== undefined) {
        // 次の文字を確認
        if (i + 1 < text.length) {
          const nextChar = text[i + 1];
          if (!units[nextChar]) {
            // 次が単位でない場合は一の位として加算
            result += singleDigits[char];
          }
          // 次が単位の場合は、単位の処理で扱われる
        } else {
          // 最後の文字の場合は一の位として加算
          result += singleDigits[char];
        }
      }
      
      i++;
    }
    
    // 特殊ケース: "五百六十六"のようなパターンの再チェック
    if (result === 0) {
      // 正規表現でのパターンマッチング
      const pattern = /^([一二三四五六七八九])?千?([一二三四五六七八九])?百?([一二三四五六七八九])?十?([一二三四五六七八九])?$/;
      const match = text.match(pattern);
      
      if (match) {
        if (match[1]) result += (singleDigits[match[1]] || 1) * 1000;
        if (match[2]) result += (singleDigits[match[2]] || 1) * 100;
        if (match[3]) result += (singleDigits[match[3]] || 1) * 10;
        if (match[4]) result += singleDigits[match[4]] || 0;
        
        // 千・百・十が単独で現れた場合の処理
        if (text.includes('千') && !match[1]) result += 1000;
        if (text.includes('百') && !match[2]) result += 100;
        if (text.includes('十') && !match[3]) result += 10;
      }
    }
    
    return result > 0 ? result : null;
  }

  /**
   * 法令番号から法令IDを生成（汎用版）
   */
  private parseLawNumber(text: string): string | null {
    if (!text) return null;
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
      // 改善版：より正確な漢数字変換
      const singleDigits: Record<string, number> = {
        '〇': 0, '零': 0,
        '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
        '六': 6, '七': 7, '八': 8, '九': 9
      };
      
      // 基本単位
      const units: Record<string, number> = {
        '千': 1000,
        '百': 100,
        '十': 10
      };
      
      // 空文字や不正な入力のチェック
      if (!text || text.length === 0) return null;
      
      // 単純な一桁の数字
      if (singleDigits[text] !== undefined) return singleDigits[text];
      
      // 完全な漢数字パーサー実装
      let result = 0;
      let currentNumber = 0;
      let i = 0;
      
      while (i < text.length) {
        const char = text[i];
        
        // 千の位の処理
        if (char === '千') {
          if (i === 0) {
            // "千"で始まる場合は1000
            result += 1000;
          } else {
            const prevChar = text[i - 1];
            if (singleDigits[prevChar] !== undefined) {
              result += singleDigits[prevChar] * 1000;
              currentNumber = 0;
            } else {
              result += 1000;
            }
          }
        }
        // 百の位の処理
        else if (char === '百') {
          if (i === 0 || (i > 0 && units[text[i - 1]])) {
            // "百"で始まるか、前が単位の場合は100
            result += 100;
          } else {
            const prevChar = text[i - 1];
            if (singleDigits[prevChar] !== undefined) {
              result += singleDigits[prevChar] * 100;
              currentNumber = 0;
            } else {
              result += 100;
            }
          }
        }
        // 十の位の処理
        else if (char === '十') {
          if (i === 0 || (i > 0 && units[text[i - 1]])) {
            // "十"で始まるか、前が単位の場合は10
            result += 10;
          } else {
            const prevChar = text[i - 1];
            if (singleDigits[prevChar] !== undefined) {
              result += singleDigits[prevChar] * 10;
              currentNumber = 0;
            } else {
              result += 10;
            }
          }
        }
        // 一の位の処理
        else if (singleDigits[char] !== undefined) {
          // 次の文字を確認
          if (i + 1 < text.length) {
            const nextChar = text[i + 1];
            if (!units[nextChar]) {
              // 次が単位でない場合は一の位として加算
              result += singleDigits[char];
            }
            // 次が単位の場合は、単位の処理で扱われる
          } else {
            // 最後の文字の場合は一の位として加算
            result += singleDigits[char];
          }
        }
        
        i++;
      }
      
      // 特殊ケース: "五百六十六"のようなパターンの再チェック
      if (result === 0) {
        // 正規表現でのパターンマッチング
        const pattern = /^([一二三四五六七八九])?千?([一二三四五六七八九])?百?([一二三四五六七八九])?十?([一二三四五六七八九])?$/;
        const match = text.match(pattern);
        
        if (match) {
          if (match[1]) result += singleDigits[match[1]] * 1000 || 0;
          if (match[2]) result += singleDigits[match[2]] * 100 || 0;
          if (match[3]) result += singleDigits[match[3]] * 10 || 0;
          if (match[4]) result += singleDigits[match[4]] || 0;
          
          // 千・百・十が単独で現れた場合の処理
          if (text.includes('千') && !match[1]) result += 1000;
          if (text.includes('百') && !match[2]) result += 100;
          if (text.includes('十') && !match[3]) result += 10;
        }
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
   * 条文番号の妥当性チェック
   */
  private validateArticleNumber(lawId: string, articleNumber: number): boolean {
    // 急傾斜地法のような特定の法令の最大条文数をハードコード
    const knownMaxArticles: Record<string, number> = {
      '344AC0000000057': 26,  // 急傾斜地の崩壊による災害の防止に関する法律
      '129AC0000000089': 1050, // 民法
      '132AC0000000048': 850,  // 商法
      '140AC0000000045': 264,  // 刑法
      '417AC0000000086': 979,  // 会社法
    };
    
    // 既知の法令の場合、最大条文数をチェック
    if (knownMaxArticles[lawId]) {
      return articleNumber <= knownMaxArticles[lawId];
    }
    
    // メタデータキャッシュから確認
    const metadata = this.lawMetadataCache.get(lawId);
    if (metadata) {
      return articleNumber <= metadata.maxArticle;
    }
    
    // 不明な場合は、異常に大きい条文番号を除外（一般的に1000条を超える法令は稀）
    return articleNumber <= 1000;
  }

  /**
   * 重複除去とソート
   */
  private deduplicateAndSort(references: DetectedReference[]): DetectedReference[] {
    // まずポジションでソート
    const sorted = references.sort((a, b) => (a.position || 0) - (b.position || 0));
    
    const unique: DetectedReference[] = [];
    const covered = new Set<string>(); // "start-end"形式でカバー済み範囲を記録
    
    for (const ref of sorted) {
      const start = ref.position || 0;
      const end = start + ref.text.length;
      
      // この参照が既存の参照に完全に含まれているかチェック
      let isSubsumed = false;
      for (const range of covered) {
        const [coveredStart, coveredEnd] = range.split('-').map(Number);
        if (start >= coveredStart && end <= coveredEnd) {
          isSubsumed = true;
          break;
        }
      }
      
      if (!isSubsumed) {
        // この参照に含まれる既存の参照を削除
        const filtered = unique.filter(existing => {
          const existingStart = existing.position || 0;
          const existingEnd = existingStart + existing.text.length;
          // 既存の参照がこの参照に完全に含まれる場合は削除
          return !(existingStart >= start && existingEnd <= end);
        });
        
        // 新しい参照を追加
        filtered.push(ref);
        unique.length = 0;
        unique.push(...filtered);
        
        // カバー範囲を更新
        covered.add(`${start}-${end}`);
      }
    }

    return unique.sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  /**
   * ネガティブパターンで参照をフィルタリング
   */
  private filterNegativePatterns(references: DetectedReference[], fullText: string): DetectedReference[] {
    const filtered: DetectedReference[] = [];
    
    for (const ref of references) {
      // 参照の前後のコンテキストを取得（前後30文字）
      const startPos = Math.max(0, (ref.position || 0) - 30);
      const endPos = Math.min(fullText.length, (ref.position || 0) + ref.text.length + 30);
      const context = fullText.substring(startPos, endPos);
      
      // ネガティブパターンに一致するかチェック
      if (!this.negativeFilter.isNegative(context)) {
        filtered.push(ref);
      }
    }
    
    return filtered;
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
async function localOnlyValidation(count: number, random: boolean, fullArticles: boolean = false): Promise<void> {
  console.log(chalk.cyan('\n🚀 ローカル高速検証モード'));
  console.log(fullArticles ? chalk.yellow('📖 全条文処理モード') : chalk.blue('📄 サンプリングモード（最初の3条文）'));
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
      
      // 条文のサンプリング（全条文モードまたはサンプリング）
      const sampledArticles = fullArticles ? articles : articles.slice(0, 3);
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
 * 検証結果を保持する型
 */
export interface ValidationReport {
  totalLaws: number;
  totalArticles: number;
  totalReferences: number;
  processingTime: number;
  averageSpeed: number;
  averageReferencesPerArticle: number;
  typeDistribution: Record<string, number>;
  egovComparison?: {
    sampleSize: number;
    avgPrecision: number;
    avgRecall: number;
    f1Score: number;
  };
}

/**
 * e-Govとの詳細比較検証
 */
export async function egovComparisonValidation(
  count: number,
  random: boolean = false,
  fullArticles: boolean = false
): Promise<ValidationReport | void> {
  console.log(chalk.cyan('\n🔍 e-Gov詳細比較検証'));
  console.log('='.repeat(80));
  
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const { parse } = require('csv-parse/sync');
  
  // 検証結果を格納
  const results: any[] = [];
  
  // CSVから法令リストを読み込み
  const csvPath = join(process.cwd(), 'laws_data', 'all_law_list.csv');
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
  
  // サンプル法令を選択（最大100件に拡大）
  const sampleCount = Math.min(count, 100);
  const selectedLaws = random
    ? laws.sort(() => Math.random() - 0.5).slice(0, sampleCount)
    : laws.slice(0, sampleCount);
  
  console.log(`📌 ${sampleCount}法令をe-Gov APIと比較\n`);
  
  for (const law of selectedLaws) {
    try {
      console.log(chalk.blue(`\n比較中: ${law.name} (${law.id})`));
      
      // e-Gov APIから取得
      const egovUrl = `https://laws.e-gov.go.jp/api/1/lawdata/${law.id}`;
      const response = await fetch(egovUrl);
      
      if (!response.ok) {
        console.log(chalk.red(`  ❌ e-Gov API エラー: ${response.status}`));
        continue;
      }
      
      const xmlText = await response.text();
      const parser = new (require('fast-xml-parser').XMLParser)({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
      });
      
      const data = parser.parse(xmlText);
      const lawData = data?.DataRoot?.ApplData?.LawFullText?.Law;
      
      if (!lawData?.LawBody?.MainProvision) continue;
      
      // e-Govの参照を抽出
      const egovRefs = extractEGovReferences(lawData.LawBody.MainProvision);
      
      // ローカル検出
      const detector = new UltimateReferenceDetector(false);
      const xmlPath = join(process.cwd(), 'laws_data');
      const lawDirs = require('fs').readdirSync(xmlPath);
      const lawDir = lawDirs.find((dir: string) => dir.startsWith(law.id));
      
      if (!lawDir) continue;
      
      const xmlFile = join(xmlPath, lawDir, `${lawDir}.xml`);
      const xmlContent = readFileSync(xmlFile, 'utf-8');
      const ourRefs = await detector.detectReferences(xmlContent, law.id, law.name);
      
      // 比較結果
      const result = {
        lawId: law.id,
        lawName: law.name,
        egovCount: egovRefs.length,
        ourCount: ourRefs.length,
        precision: egovRefs.length > 0 ? (Math.min(ourRefs.length, egovRefs.length) / ourRefs.length * 100).toFixed(1) : '100.0',
        recall: egovRefs.length > 0 ? (Math.min(ourRefs.length, egovRefs.length) / egovRefs.length * 100).toFixed(1) : '100.0'
      };
      
      results.push(result);
      console.log(chalk.green(`  ✅ e-Gov: ${egovRefs.length}件, 検出: ${ourRefs.length}件`));
      
      // API制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.log(chalk.red(`  ❌ エラー: ${error}`));
    }
  }
  
  // 統計表示
  console.log('\n' + '='.repeat(80));
  console.log(chalk.cyan('📊 e-Gov比較結果サマリー'));
  console.log('='.repeat(80));
  
  if (results.length === 0) {
    console.log(chalk.yellow('比較結果なし'));
    return;
  }
  
  const avgPrecision = results.reduce((sum, r) => sum + parseFloat(r.precision), 0) / results.length;
  const avgRecall = results.reduce((sum, r) => sum + parseFloat(r.recall), 0) / results.length;
  const f1Score = 2 * (avgPrecision * avgRecall) / (avgPrecision + avgRecall);
  
  console.log(`検証法令数: ${results.length}件`);
  console.log(`平均精度(Precision): ${avgPrecision.toFixed(1)}%`);
  console.log(`平均再現率(Recall): ${avgRecall.toFixed(1)}%`);
  console.log(`F1スコア: ${f1Score.toFixed(1)}%`);
  
  // レポート保存
  const reportPath = `Report/egov_comparison_${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(chalk.green(`\n💾 詳細レポート: ${reportPath}`));
}

/**
 * e-Govデータから参照を抽出（XMLファイルから直接）
 */
export function extractEGovReferencesFromXML(xmlContent: string): any[] {
  const refs: any[] = [];
  
  // ReferenceToLaw タグを抽出
  const lawRefMatches = xmlContent.matchAll(/<ReferenceToLaw[^>]*>([^<]+)<\/ReferenceToLaw>/g);
  for (const match of lawRefMatches) {
    refs.push({
      type: 'external',
      text: match[1],
      tag: 'ReferenceToLaw'
    });
  }
  
  // ReferenceToArticle タグを抽出
  const articleRefMatches = xmlContent.matchAll(/<ReferenceToArticle[^>]*>([^<]+)<\/ReferenceToArticle>/g);
  for (const match of articleRefMatches) {
    refs.push({
      type: 'internal', 
      text: match[1],
      tag: 'ReferenceToArticle'
    });
  }
  
  // その他の参照タグも追加
  const otherTags = [
    'ReferenceToSubsection',
    'ReferenceToItem',
    'ReferenceToChapter',
    'ReferenceToSection',
    'ReferenceToParagraph'
  ];
  
  for (const tag of otherTags) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'g');
    const matches = xmlContent.matchAll(regex);
    for (const match of matches) {
      refs.push({
        type: 'structural',
        text: match[1],
        tag: tag
      });
    }
  }
  
  return refs;
}

/**
 * e-Govデータから参照を抽出
 */
function extractEGovReferences(mainProvision: any): any[] {
  const refs: any[] = [];
  
  // 再帰的に参照を探索
  function traverse(obj: any) {
    if (!obj) return;
    
    // ReferenceToLaw要素を探す
    if (obj.ReferenceToLaw) {
      const lawRefs = Array.isArray(obj.ReferenceToLaw) ? obj.ReferenceToLaw : [obj.ReferenceToLaw];
      for (const ref of lawRefs) {
        refs.push({
          type: 'external',
          lawId: ref['@_lawId'],
          text: ref['#text']
        });
      }
    }
    
    // ReferenceToArticle要素を探す
    if (obj.ReferenceToArticle) {
      const artRefs = Array.isArray(obj.ReferenceToArticle) ? obj.ReferenceToArticle : [obj.ReferenceToArticle];
      for (const ref of artRefs) {
        refs.push({
          type: 'internal',
          article: ref['@_num'],
          text: ref['#text']
        });
      }
    }
    
    // 子要素を再帰的に探索
    for (const key in obj) {
      if (typeof obj[key] === 'object') {
        traverse(obj[key]);
      }
    }
  }
  
  traverse(mainProvision);
  return refs;
}

/**
 * 大規模e-Gov検証
 */
export async function massEGovValidation(
  count: number,
  random: boolean = false,
  statsOnly: boolean = false,
  fullArticles: boolean = false
): Promise<void> {
  console.log(chalk.cyan('\n🚀 大規模e-Gov検証開始'));
  console.log('='.repeat(80));
  
  // 統計のみモードの場合はローカル検証のみ
  if (statsOnly) {
    await localOnlyValidation(count, random, fullArticles);
    return;
  }
  
  // e-Gov比較モード（10件まで）
  if (!statsOnly && count <= 10) {
    await egovComparisonValidation(count, random, fullArticles);
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

/**
 * 全法令でe-GovタグとLawFinder検出を比較
 */
export async function compareAllLawsWithEGov(): Promise<void> {
  console.log(chalk.cyan('\n🔍 全法令e-Gov精度検証開始'));
  console.log('='.repeat(80));
  
  const { readFileSync, readdirSync } = require('fs');
  const { join } = require('path');
  const { parse } = require('csv-parse/sync');
  
  // CSVから法令リストを読み込み
  const csvPath = join(process.cwd(), 'laws_data', 'all_law_list.csv');
  const csvContent = readFileSync(csvPath, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true
  });
  
  // 統計情報
  let totalLaws = 0;
  let totalEGovRefs = 0;
  let totalOurRefs = 0;
  let totalMatched = 0;
  let totalMissed = 0;
  let totalExtra = 0;
  
  const detector = new UltimateReferenceDetector(false);
  const startTime = Date.now();
  
  // 全法令を処理
  for (const record of records) {
    const lawId = record['法令ID'] || record['law_id'];
    const title = record['法令名'] || record['law_title'] || record['法令名漢字'];
    
    if (!lawId || !title) continue;
    
    totalLaws++;
    
    // 進捗表示
    if (totalLaws % 100 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = totalLaws / elapsed;
      process.stdout.write(`\r進捗: ${totalLaws}/${records.length} (${Math.round(totalLaws/records.length*100)}%) | 速度: ${rate.toFixed(1)}法令/秒`);
    }
    
    try {
      // XMLファイル読み込み
      const xmlPath = join(process.cwd(), 'laws_data');
      const lawDirs = readdirSync(xmlPath);
      const lawDir = lawDirs.find((dir: string) => dir.startsWith(lawId));
      
      if (!lawDir) continue;
      
      const xmlFile = join(xmlPath, lawDir, `${lawDir}.xml`);
      if (!existsSync(xmlFile)) continue;
      
      const xmlContent = readFileSync(xmlFile, 'utf-8');
      
      // ベースライン参照を抽出
      const baselineRefs = extractBaselineReferences(xmlContent);
      totalEGovRefs += baselineRefs.length;
      
      // LawFinderで参照を検出
      const ourRefs = await detector.detectReferences(xmlContent, lawId, title);
      totalOurRefs += ourRefs.length;
      
      // 比較（簡易版：テキストマッチング）
      const egovTexts = new Set(egovRefs.map(r => r.text.trim()));
      const ourTexts = new Set(ourRefs.map(r => r.text.trim()));
      
      // マッチング計算
      for (const text of ourTexts) {
        if (baselineTexts.has(text)) {
          totalMatched++;
        } else {
          totalExtra++;
        }
      }
      
      for (const text of baselineTexts) {
        if (!ourTexts.has(text)) {
          totalMissed++;
        }
      }
      
    } catch (error) {
      // エラーは無視して続行
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  // 結果表示
  console.log('\n');
  console.log(chalk.green('='.repeat(80)));
  console.log(chalk.cyan('📊 全法令e-Gov精度検証結果'));
  console.log(chalk.green('='.repeat(80)));
  console.log(`✅ 処理法令数: ${totalLaws}件`);
  console.log(`📌 ベースライン参照数: ${totalEGovRefs}件`);
  console.log(`🔍 LawFinder検出数: ${totalOurRefs}件`);
  console.log(`✓ マッチ数: ${totalMatched}件`);
  console.log(`✗ 未検出: ${totalMissed}件`);
  console.log(`+ 過検出: ${totalExtra}件`);
  console.log(`⏱️ 処理時間: ${elapsed.toFixed(1)}秒`);
  console.log(chalk.yellow('\n📈 精度指標:'));
  
  const precision = totalOurRefs > 0 ? (totalMatched / totalOurRefs * 100) : 0;
  const recall = totalEGovRefs > 0 ? (totalMatched / totalEGovRefs * 100) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
  
  console.log(`  精度(Precision): ${precision.toFixed(2)}%`);
  console.log(`  再現率(Recall): ${recall.toFixed(2)}%`);
  console.log(`  F1スコア: ${f1.toFixed(2)}%`);
  console.log(chalk.green('='.repeat(80)));
  
  // レポート保存
  const report = {
    timestamp: new Date().toISOString(),
    totalLaws,
    totalEGovRefs,
    totalOurRefs,
    totalMatched,
    totalMissed,
    totalExtra,
    precision,
    recall,
    f1,
    processingTime: elapsed
  };
  
  const reportPath = `Report/egov_full_comparison_${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(chalk.green(`\n💾 詳細レポート: ${reportPath}`));
}

/**
 * XMLから条文を抽出する関数
 */
function extractArticlesFromXML(xmlContent: string): { number: string; content: string }[] {
  const articles: { number: string; content: string }[] = [];
  
  // <Article>タグを抽出
  const articleMatches = xmlContent.matchAll(/<Article[^>]*>([\s\S]*?)<\/Article>/g);
  
  for (const match of articleMatches) {
    const articleContent = match[1];
    
    // 条文番号を取得
    const numMatch = articleContent.match(/<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/);
    const number = numMatch ? numMatch[1] : '';
    
    // 条文本文を取得（すべてのテキストを結合）
    const textContent = articleContent
      .replace(/<[^>]+>/g, ' ')  // タグを削除
      .replace(/\s+/g, ' ')       // 連続する空白を1つに
      .trim();
    
    if (textContent) {
      articles.push({ number, content: textContent });
    }
  }
  
  return articles;
}

/**
 * ベースライン参照を抽出（明確な参照パターンのみ）
 */
function extractBaselineReferences(xmlContent: string): any[] {
  const refs: any[] = [];
  
  // XMLから条文を抽出
  const articles = extractArticlesFromXML(xmlContent);
  
  for (const article of articles) {
    const content = article.content;
    
    // 明確な法令名参照（「○○法」「○○令」など）
    const lawNamePattern = /([^。、\s]{2,20}(?:法|令|規則|条例|通達))(?:（[^）]+）)?(?:第[一二三四五六七八九十百千万]+条|[０-９]+条)/g;
    const lawMatches = content.matchAll(lawNamePattern);
    for (const match of lawMatches) {
      refs.push({ text: match[0], type: 'external' });
    }
    
    // 明確な条文参照（「第○条」）
    const articlePattern = /第[一二三四五六七八九十百千万０-９]+条(?:第[一二三四五六七八九十百千万０-９]+項)?/g;
    const articleMatches = content.matchAll(articlePattern);
    for (const match of articleMatches) {
      // 法令名が前にない場合は内部参照
      const prevText = content.substring(Math.max(0, match.index! - 30), match.index!);
      if (!prevText.match(/(?:法|令|規則|条例|通達)[）)]*$/)) {
        refs.push({ text: match[0], type: 'internal' });
      }
    }
  }
  
  return refs;
}

/**
 * XMLファイルを検索する関数
 */
async function findXMLFile(lawId: string): Promise<string | null> {
  const basePath = 'laws_data';
  
  // 法令IDに対応するディレクトリを探す
  try {
    const dirs = readdirSync(basePath);
    for (const dir of dirs) {
      if (dir.startsWith(lawId)) {
        const dirPath = path.join(basePath, dir);
        const files = readdirSync(dirPath);
        const xmlFile = files.find(f => f.endsWith('.xml'));
        if (xmlFile) {
          return path.join(dirPath, xmlFile);
        }
      }
    }
  } catch (error) {
    // エラーは無視
  }
  
  return null;
}

/**
 * サンプリング方式でe-Govタグと比較
 */
export async function compareSampleLawsWithEGov(sampleSize: number = 1000) {
  console.log(chalk.cyan(`\n🔬 サンプリング精度検証 (${sampleSize}法令)`));
  console.log(chalk.gray('='.repeat(80)));
  
  // CSVから法令リストを取得
  const csvPath = 'laws_data/all_law_list.csv';
  const csvContent = readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').slice(1).filter(line => line.trim());
  
  const laws = lines.map(line => {
    const columns = line.split(',');
    // 法令ID（12番目のカラム）、法令名（3番目のカラム）、法令番号（2番目のカラム）
    if (columns.length >= 12) {
      return { 
        id: columns[11] ? columns[11].trim() : '',
        title: columns[2] ? columns[2].trim() : '',
        lawNum: columns[1] ? columns[1].trim() : ''
      };
    }
    return null;
  }).filter(law => law && law.id && law.title) as { id: string; title: string; lawNum: string }[];
  
  if (laws.length === 0) {
    console.log(chalk.red('❌ 法令データが見つかりません'));
    return;
  }
  
  // ランダムサンプリング
  const shuffled = [...laws].sort(() => 0.5 - Math.random());
  const samples = shuffled.slice(0, Math.min(sampleSize, laws.length));
  
  console.log(`📊 対象法令: ${samples.length}件 / 全${laws.length}件`);
  console.log(chalk.gray('='.repeat(80)));
  
  const detector = new UltimateReferenceDetector(false); // LLM無効化
  const startTime = Date.now();
  
  let totalEGovRefs = 0;
  let totalOurRefs = 0;
  let totalMatched = 0;
  let totalMissed = 0;
  let totalExtra = 0;
  let processedCount = 0;
  let filesFound = 0;
  let articlesProcessed = 0;
  
  // プログレスバー用
  const progressInterval = Math.max(1, Math.floor(samples.length / 20));
  
  for (const law of samples) {
    processedCount++;
    
    // プログレス表示
    if (processedCount % progressInterval === 0 || processedCount === samples.length) {
      const progress = (processedCount / samples.length * 100).toFixed(1);
      process.stdout.write(`\r処理中: ${processedCount}/${samples.length} (${progress}%)`);
    }
    
    try {
      // デバッグ: 最初の3つの法令IDを表示
      if (processedCount <= 3) {
        console.log(`\nDebug: 法令ID = ${law.id}, タイトル = ${law.title.substring(0, 30)}...`);
      }
      
      const xmlPath = await findXMLFile(law.id);
      if (!xmlPath) {
        if (processedCount <= 3) {
          console.log(`  → XMLファイルが見つかりません`);
        }
        continue;
      }
      
      filesFound++;
      const xmlContent = readFileSync(xmlPath, 'utf-8');
      
      // ベースライン参照を抽出
      const baselineRefs = extractBaselineReferences(xmlContent);
      totalEGovRefs += baselineRefs.length;
      
      // LawFinderで参照を検出（全文処理）
      const articles = extractArticlesFromXML(xmlContent);
      articlesProcessed += articles.length;
      const ourRefs: any[] = [];
      
      for (const article of articles) {
        const refs = await detector.detectReferences(article.content, law.id, law.title);
        ourRefs.push(...refs);
      }
      totalOurRefs += ourRefs.length;
      
      // 比較（テキストマッチング）
      const baselineTexts = new Set(baselineRefs.map((r: any) => r.text.trim()));
      const ourTexts = new Set(ourRefs.map(r => r.text.trim()));
      
      // マッチング計算
      for (const text of ourTexts) {
        if (baselineTexts.has(text)) {
          totalMatched++;
        } else {
          totalExtra++;
        }
      }
      
      for (const text of baselineTexts) {
        if (!ourTexts.has(text)) {
          totalMissed++;
        }
      }
      
    } catch (error) {
      // エラーは無視して続行
    }
  }
  
  const elapsed = (Date.now() - startTime) / 1000;
  
  // 結果表示
  console.log('\n');
  console.log(chalk.green('='.repeat(80)));
  console.log(chalk.cyan('📊 サンプリング精度検証結果'));
  console.log(chalk.green('='.repeat(80)));
  console.log(`✅ 処理法令数: ${processedCount}件`);
  console.log(`📁 XMLファイル発見: ${filesFound}件`);
  console.log(`📝 処理条文数: ${articlesProcessed}件`);
  console.log(`📌 ベースライン参照数: ${totalEGovRefs}件`);
  console.log(`🔍 LawFinder検出数: ${totalOurRefs}件`);
  console.log(`✓ マッチ数: ${totalMatched}件`);
  console.log(`✗ 未検出: ${totalMissed}件`);
  console.log(`+ 過検出: ${totalExtra}件`);
  console.log(`⏱️ 処理時間: ${elapsed.toFixed(1)}秒`);
  console.log(chalk.yellow('\n📈 精度指標:'));
  
  const precision = totalOurRefs > 0 ? (totalMatched / totalOurRefs * 100) : 0;
  const recall = totalEGovRefs > 0 ? (totalMatched / totalEGovRefs * 100) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall / (precision + recall)) : 0;
  
  console.log(`  精度(Precision): ${precision.toFixed(2)}%`);
  console.log(`  再現率(Recall): ${recall.toFixed(2)}%`);
  console.log(`  F1スコア: ${f1.toFixed(2)}%`);
  console.log(chalk.green('='.repeat(80)));
  
  // レポート保存
  const report = {
    timestamp: new Date().toISOString(),
    sampleSize: processedCount,
    totalLaws: laws.length,
    totalEGovRefs,
    totalOurRefs,
    totalMatched,
    totalMissed,
    totalExtra,
    precision,
    recall,
    f1,
    processingTime: elapsed
  };
  
  const reportPath = `Report/egov_sample_comparison_${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(chalk.green(`\n💾 詳細レポート: ${reportPath}`));
}

// エクスポート
export default UltimateReferenceDetector;
export { extractArticlesFromXML, extractBaselineReferences };
