import { describe, it, expect } from '@jest/globals';
import { RelativeReferenceResolver, CurrentContext } from '../src/services/relative-reference-resolver';

describe('RelativeReferenceResolver', () => {
  let resolver: RelativeReferenceResolver;
  
  beforeEach(() => {
    resolver = new RelativeReferenceResolver();
  });
  
  describe('条文レベルの相対参照', () => {
    const baseContext: CurrentContext = {
      lawId: '129AC0000000089',
      lawName: '民法',
      articleNumber: '90'
    };
    
    it('前条を解決できる', () => {
      const result = resolver.resolve('前条', baseContext);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('89');
      expect(result?.articleDisplay).toBe('第89条');
      expect(result?.confidence).toBeGreaterThan(0.9);
    });
    
    it('次条を解決できる', () => {
      const result = resolver.resolve('次条', baseContext);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('91');
      expect(result?.articleDisplay).toBe('第91条');
    });
    
    it('第1条で前条はエラーを返す', () => {
      const context = { ...baseContext, articleNumber: '1' };
      const result = resolver.resolve('前条', context);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBeLessThan(0.5);
      expect(result?.error).toContain('前条が存在しません');
    });
    
    it('前二条を解決できる', () => {
      const result = resolver.resolve('前二条', baseContext);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('88');
    });
    
    it('次三条を解決できる', () => {
      const result = resolver.resolve('次三条', baseContext);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('93');
    });
  });
  
  describe('項レベルの相対参照', () => {
    const contextWithPara: CurrentContext = {
      lawId: '129AC0000000089',
      articleNumber: '90',
      paragraphNumber: 3
    };
    
    it('前項を解決できる', () => {
      const result = resolver.resolve('前項', contextWithPara);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('90');
      expect(result?.paragraphNumber).toBe(2);
      expect(result?.confidence).toBeGreaterThan(0.9);
    });
    
    it('次項を解決できる', () => {
      const result = resolver.resolve('次項', contextWithPara);
      expect(result).not.toBeNull();
      expect(result?.paragraphNumber).toBe(4);
    });
    
    it('第1項で前項はエラーを返す', () => {
      const context = { ...contextWithPara, paragraphNumber: 1 };
      const result = resolver.resolve('前項', context);
      expect(result).not.toBeNull();
      expect(result?.confidence).toBeLessThan(0.5);
      expect(result?.error).toContain('前項が存在しません');
    });
    
    it('前二項を解決できる', () => {
      const result = resolver.resolve('前二項', contextWithPara);
      expect(result).not.toBeNull();
      expect(result?.paragraphNumber).toBe(1);
    });
    
    it('前各項を解決できる', () => {
      const result = resolver.resolve('前各項', contextWithPara);
      expect(result).not.toBeNull();
      expect(result?.paragraphNumber).toBe(2); // 代表として直前の項
      expect(result?.error).toContain('第1項から第2項まで');
    });
  });
  
  describe('号レベルの相対参照', () => {
    const contextWithItem: CurrentContext = {
      lawId: '129AC0000000089',
      articleNumber: '90',
      paragraphNumber: 2,
      itemNumber: '3'
    };
    
    it('前号を解決できる', () => {
      const result = resolver.resolve('前号', contextWithItem);
      expect(result).not.toBeNull();
      expect(result?.itemNumber).toBe('2');
    });
    
    it('次号を解決できる', () => {
      const result = resolver.resolve('次号', contextWithItem);
      expect(result).not.toBeNull();
      expect(result?.itemNumber).toBe('4');
    });
    
    it('前各号を解決できる', () => {
      const result = resolver.resolve('前各号', contextWithItem);
      expect(result).not.toBeNull();
      expect(result?.error).toContain('第1号から前号まで');
    });
  });
  
  describe('複合的な相対参照', () => {
    const context: CurrentContext = {
      lawId: '129AC0000000089',
      articleNumber: '90',
      paragraphNumber: 2
    };
    
    it('前条第2項を解決できる', () => {
      const result = resolver.resolve('前条第二項', context);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('89');
      expect(result?.paragraphNumber).toBe(2);
    });
    
    it('次条第1項を解決できる', () => {
      const result = resolver.resolve('次条第一項', context);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('91');
      expect(result?.paragraphNumber).toBe(1);
    });
    
    it('前項第3号を解決できる', () => {
      const result = resolver.resolve('前項第三号', context);
      expect(result).not.toBeNull();
      expect(result?.paragraphNumber).toBe(1);
      expect(result?.itemNumber).toBe('3');
    });
  });
  
  describe('同一参照', () => {
    const context: CurrentContext = {
      lawId: '129AC0000000089',
      articleNumber: '90',
      paragraphNumber: 2
    };
    
    it('同条を解決できる', () => {
      const result = resolver.resolve('同条', context);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('90');
      expect(result?.paragraphNumber).toBeUndefined();
    });
    
    it('本条を解決できる', () => {
      const result = resolver.resolve('本条', context);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('90');
    });
    
    it('同項を解決できる', () => {
      const result = resolver.resolve('同項', context);
      expect(result).not.toBeNull();
      expect(result?.articleNumber).toBe('90');
      expect(result?.paragraphNumber).toBe(2);
    });
    
    it('各項を解決できる', () => {
      const result = resolver.resolve('各項', context);
      expect(result).not.toBeNull();
      expect(result?.error).toContain('すべての項');
    });
  });
  
  describe('バッチ解決', () => {
    const context: CurrentContext = {
      lawId: '129AC0000000089',
      articleNumber: '90',
      paragraphNumber: 2
    };
    
    it('複数の参照を一度に解決できる', () => {
      const references = ['前条', '次条', '前項', '同条'];
      const results = resolver.resolveMultiple(references, context);
      
      expect(results.size).toBe(4);
      expect(results.get('前条')?.articleNumber).toBe('89');
      expect(results.get('次条')?.articleNumber).toBe('91');
      expect(results.get('前項')?.paragraphNumber).toBe(1);
      expect(results.get('同条')?.articleNumber).toBe('90');
    });
  });
  
  describe('連続解決', () => {
    const initialContext: CurrentContext = {
      lawId: '129AC0000000089',
      articleNumber: '90',
      paragraphNumber: 1
    };
    
    it('コンテキストを更新しながら解決できる', () => {
      const references = [
        { text: '前条', position: 0 },
        { text: '前項', position: 10 },  // 前条のコンテキストで解決される
        { text: '次条', position: 20 }
      ];
      
      const results = resolver.resolveContinuous(references, initialContext);
      
      expect(results).toHaveLength(3);
      
      // 最初の「前条」で第89条に移動
      expect(results[0].resolved?.articleNumber).toBe('89');
      
      // 「前項」は第89条のコンテキストで解決（項番号は1なのでエラー）
      expect(results[1].context.articleNumber).toBe('89');
      expect(results[1].resolved?.confidence).toBeLessThan(0.5);
      
      // 「次条」は第89条から第90条へ
      expect(results[2].resolved?.articleNumber).toBe('90');
    });
  });
  
  describe('エッジケース', () => {
    const context: CurrentContext = {
      lawId: '129AC0000000089',
      articleNumber: '90'
    };
    
    it('未知の参照パターンはnullを返す', () => {
      const result = resolver.resolve('何か変な参照', context);
      expect(result).toBeNull();
    });
    
    it('空文字列はnullを返す', () => {
      const result = resolver.resolve('', context);
      expect(result).toBeNull();
    });
    
    it('スペースのみはnullを返す', () => {
      const result = resolver.resolve('   ', context);
      expect(result).toBeNull();
    });
  });
});