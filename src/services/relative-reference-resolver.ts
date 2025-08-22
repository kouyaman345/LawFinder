/**
 * 相対参照解決サービス
 * 
 * 「前項」「次条」などの相対参照を実際の条文番号・項番号に変換
 */

import { normalizeArticleNumber, toNumericFormat, toDisplayFormat } from '../utils/article-normalizer';

export interface ResolvedReference {
  /** 解決済みの法令ID */
  lawId: string;
  /** 解決済みの条文番号（数値形式） */
  articleNumber: string;
  /** 解決済みの条文番号（表示形式） */
  articleDisplay: string;
  /** 解決済みの項番号 */
  paragraphNumber?: number;
  /** 解決済みの号番号 */
  itemNumber?: string;
  /** 信頼度スコア */
  confidence: number;
  /** 解決方法 */
  resolutionMethod: 'exact' | 'inferred' | 'fallback';
  /** エラーメッセージ（解決失敗時） */
  error?: string;
}

export interface CurrentContext {
  /** 現在の法令ID */
  lawId: string;
  /** 現在の法令名 */
  lawName?: string;
  /** 現在の条文番号（数値形式） */
  articleNumber: string;
  /** 現在の項番号 */
  paragraphNumber?: number;
  /** 現在の号番号 */
  itemNumber?: string;
  /** 条文の総項数（既知の場合） */
  totalParagraphs?: number;
}

export class RelativeReferenceResolver {
  private readonly kanjiNumberMap: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
    '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
    '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
    '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
    '二十一': 21, '二十二': 22, '二十三': 23, '二十四': 24, '二十五': 25,
    '三十': 30, '四十': 40, '五十': 50, '六十': 60, '七十': 70,
    '八十': 80, '九十': 90, '百': 100
  };

  /**
   * 相対参照を解決
   * @param referenceText 相対参照テキスト（例：「前項」「次条」「前三項」）
   * @param context 現在のコンテキスト
   * @returns 解決された参照情報
   */
  resolve(referenceText: string, context: CurrentContext): ResolvedReference | null {
    // 正規化
    const text = referenceText.trim();
    
    // 各パターンを試行
    const resolvers = [
      () => this.resolveArticleRelative(text, context),
      () => this.resolveParagraphRelative(text, context),
      () => this.resolveItemRelative(text, context),
      () => this.resolveComplexRelative(text, context),
      () => this.resolveSameReference(text, context)
    ];
    
    for (const resolver of resolvers) {
      const result = resolver();
      if (result) {
        return result;
      }
    }
    
    return null;
  }

  /**
   * 条文レベルの相対参照を解決
   */
  private resolveArticleRelative(text: string, context: CurrentContext): ResolvedReference | null {
    const currentArticleNum = parseInt(context.articleNumber, 10);
    
    if (text === '前条') {
      if (currentArticleNum <= 1) {
        return {
          lawId: context.lawId,
          articleNumber: context.articleNumber,
          articleDisplay: toDisplayFormat(context.articleNumber),
          confidence: 0.3,
          resolutionMethod: 'fallback',
          error: '前条が存在しません（第1条）'
        };
      }
      
      const prevArticle = (currentArticleNum - 1).toString();
      return {
        lawId: context.lawId,
        articleNumber: prevArticle,
        articleDisplay: toDisplayFormat(prevArticle),
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    if (text === '次条') {
      const nextArticle = (currentArticleNum + 1).toString();
      return {
        lawId: context.lawId,
        articleNumber: nextArticle,
        articleDisplay: toDisplayFormat(nextArticle),
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    // 前N条、次N条のパターン
    const prevNMatch = text.match(/^前([一二三四五六七八九十]+)条$/);
    if (prevNMatch) {
      const n = this.kanjiToNumber(prevNMatch[1]);
      const targetArticle = Math.max(1, currentArticleNum - n);
      
      return {
        lawId: context.lawId,
        articleNumber: targetArticle.toString(),
        articleDisplay: toDisplayFormat(targetArticle.toString()),
        confidence: 0.90,
        resolutionMethod: 'exact'
      };
    }
    
    const nextNMatch = text.match(/^次([一二三四五六七八九十]+)条$/);
    if (nextNMatch) {
      const n = this.kanjiToNumber(nextNMatch[1]);
      const targetArticle = currentArticleNum + n;
      
      return {
        lawId: context.lawId,
        articleNumber: targetArticle.toString(),
        articleDisplay: toDisplayFormat(targetArticle.toString()),
        confidence: 0.90,
        resolutionMethod: 'exact'
      };
    }
    
    return null;
  }

  /**
   * 項レベルの相対参照を解決
   */
  private resolveParagraphRelative(text: string, context: CurrentContext): ResolvedReference | null {
    const currentPara = context.paragraphNumber || 1;
    
    if (text === '前項') {
      if (currentPara <= 1) {
        // 第1項で「前項」は通常エラーだが、前条の最終項を指す可能性もある
        return {
          lawId: context.lawId,
          articleNumber: context.articleNumber,
          articleDisplay: toDisplayFormat(context.articleNumber),
          paragraphNumber: 1,
          confidence: 0.4,
          resolutionMethod: 'fallback',
          error: '前項が存在しません（第1項）'
        };
      }
      
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: currentPara - 1,
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    if (text === '次項') {
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: currentPara + 1,
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    // 前N項、次N項のパターン
    const prevNParaMatch = text.match(/^前([一二三四五六七八九十]+)項$/);
    if (prevNParaMatch) {
      const n = this.kanjiToNumber(prevNParaMatch[1]);
      const targetPara = Math.max(1, currentPara - n);
      
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: targetPara,
        confidence: 0.90,
        resolutionMethod: 'exact'
      };
    }
    
    const nextNParaMatch = text.match(/^次([一二三四五六七八九十]+)項$/);
    if (nextNParaMatch) {
      const n = this.kanjiToNumber(nextNParaMatch[1]);
      
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: currentPara + n,
        confidence: 0.90,
        resolutionMethod: 'exact'
      };
    }
    
    // 前各項（現在の項より前のすべての項）
    if (text === '前各項') {
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: currentPara - 1, // 代表として直前の項を返す
        confidence: 0.85,
        resolutionMethod: 'inferred',
        error: `第1項から第${currentPara - 1}項までを指します`
      };
    }
    
    return null;
  }

  /**
   * 号レベルの相対参照を解決
   */
  private resolveItemRelative(text: string, context: CurrentContext): ResolvedReference | null {
    if (!context.itemNumber) {
      return null;
    }
    
    const currentItem = this.parseItemNumber(context.itemNumber);
    
    if (text === '前号') {
      const prevItem = this.getPreviousItem(currentItem);
      if (!prevItem) {
        return {
          lawId: context.lawId,
          articleNumber: context.articleNumber,
          articleDisplay: toDisplayFormat(context.articleNumber),
          paragraphNumber: context.paragraphNumber,
          itemNumber: currentItem,
          confidence: 0.3,
          resolutionMethod: 'fallback',
          error: '前号が存在しません'
        };
      }
      
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: context.paragraphNumber,
        itemNumber: prevItem,
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    if (text === '次号') {
      const nextItem = this.getNextItem(currentItem);
      
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: context.paragraphNumber,
        itemNumber: nextItem,
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    // 前各号
    if (text === '前各号') {
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: context.paragraphNumber,
        itemNumber: currentItem,
        confidence: 0.85,
        resolutionMethod: 'inferred',
        error: `第1号から前号までを指します`
      };
    }
    
    return null;
  }

  /**
   * 複合的な相対参照を解決
   */
  private resolveComplexRelative(text: string, context: CurrentContext): ResolvedReference | null {
    // 「前条第2項」のようなパターン
    const prevArticleParaMatch = text.match(/^前条第([一二三四五六七八九十]+)項$/);
    if (prevArticleParaMatch) {
      const currentArticleNum = parseInt(context.articleNumber, 10);
      if (currentArticleNum <= 1) {
        return null;
      }
      
      const prevArticle = (currentArticleNum - 1).toString();
      const paraNum = this.kanjiToNumber(prevArticleParaMatch[1]);
      
      return {
        lawId: context.lawId,
        articleNumber: prevArticle,
        articleDisplay: toDisplayFormat(prevArticle),
        paragraphNumber: paraNum,
        confidence: 0.90,
        resolutionMethod: 'exact'
      };
    }
    
    // 「次条第1項」のようなパターン
    const nextArticleParaMatch = text.match(/^次条第([一二三四五六七八九十]+)項$/);
    if (nextArticleParaMatch) {
      const currentArticleNum = parseInt(context.articleNumber, 10);
      const nextArticle = (currentArticleNum + 1).toString();
      const paraNum = this.kanjiToNumber(nextArticleParaMatch[1]);
      
      return {
        lawId: context.lawId,
        articleNumber: nextArticle,
        articleDisplay: toDisplayFormat(nextArticle),
        paragraphNumber: paraNum,
        confidence: 0.90,
        resolutionMethod: 'exact'
      };
    }
    
    // 「前項第N号」のようなパターン
    const prevParaItemMatch = text.match(/^前項第([一二三四五六七八九十]+)号$/);
    if (prevParaItemMatch) {
      const currentPara = context.paragraphNumber || 1;
      if (currentPara <= 1) {
        return null;
      }
      
      const itemNum = this.kanjiToNumber(prevParaItemMatch[1]);
      
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: currentPara - 1,
        itemNumber: itemNum.toString(),
        confidence: 0.90,
        resolutionMethod: 'exact'
      };
    }
    
    return null;
  }

  /**
   * 同一参照を解決（同条、同項、本条など）
   */
  private resolveSameReference(text: string, context: CurrentContext): ResolvedReference | null {
    if (text === '同条' || text === '本条') {
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    if (text === '同項' || text === '本項') {
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: context.paragraphNumber || 1,
        confidence: 0.95,
        resolutionMethod: 'exact'
      };
    }
    
    if (text === '各項') {
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        confidence: 0.85,
        resolutionMethod: 'inferred',
        error: '当該条のすべての項を指します'
      };
    }
    
    if (text === '各号') {
      return {
        lawId: context.lawId,
        articleNumber: context.articleNumber,
        articleDisplay: toDisplayFormat(context.articleNumber),
        paragraphNumber: context.paragraphNumber,
        confidence: 0.85,
        resolutionMethod: 'inferred',
        error: '当該項のすべての号を指します'
      };
    }
    
    return null;
  }

  /**
   * 漢数字を数値に変換
   */
  private kanjiToNumber(kanji: string): number {
    return this.kanjiNumberMap[kanji] || 1;
  }

  /**
   * 号番号をパース
   */
  private parseItemNumber(itemNumber: string): string {
    // 「第1号」「1」「一」などの形式に対応
    const match = itemNumber.match(/(\d+|[一二三四五六七八九十]+)/);
    if (match) {
      const num = match[1];
      if (/\d+/.test(num)) {
        return num;
      } else {
        return this.kanjiToNumber(num).toString();
      }
    }
    return '1';
  }

  /**
   * 前の号番号を取得
   */
  private getPreviousItem(currentItem: string): string | null {
    const num = parseInt(currentItem, 10);
    if (num <= 1) {
      return null;
    }
    return (num - 1).toString();
  }

  /**
   * 次の号番号を取得
   */
  private getNextItem(currentItem: string): string {
    const num = parseInt(currentItem, 10);
    return (num + 1).toString();
  }

  /**
   * バッチ解決（複数の相対参照を一度に解決）
   */
  resolveMultiple(
    references: string[],
    context: CurrentContext
  ): Map<string, ResolvedReference | null> {
    const results = new Map<string, ResolvedReference | null>();
    
    for (const ref of references) {
      results.set(ref, this.resolve(ref, context));
    }
    
    return results;
  }

  /**
   * コンテキストを更新しながら連続的に解決
   */
  resolveContinuous(
    references: { text: string; position: number }[],
    initialContext: CurrentContext
  ): Array<{ original: string; resolved: ResolvedReference | null; context: CurrentContext }> {
    const results: Array<{ original: string; resolved: ResolvedReference | null; context: CurrentContext }> = [];
    let currentContext = { ...initialContext };
    
    // 位置順にソート
    const sorted = [...references].sort((a, b) => a.position - b.position);
    
    for (const ref of sorted) {
      const resolved = this.resolve(ref.text, currentContext);
      results.push({
        original: ref.text,
        resolved,
        context: { ...currentContext }
      });
      
      // コンテキストを更新（解決に成功した場合）
      if (resolved && resolved.confidence > 0.7) {
        if (resolved.articleNumber && resolved.articleNumber !== currentContext.articleNumber) {
          currentContext.articleNumber = resolved.articleNumber;
          currentContext.paragraphNumber = resolved.paragraphNumber || 1;
          currentContext.itemNumber = resolved.itemNumber;
        } else if (resolved.paragraphNumber && resolved.paragraphNumber !== currentContext.paragraphNumber) {
          currentContext.paragraphNumber = resolved.paragraphNumber;
          currentContext.itemNumber = resolved.itemNumber;
        } else if (resolved.itemNumber) {
          currentContext.itemNumber = resolved.itemNumber;
        }
      }
    }
    
    return results;
  }
}