/**
 * 参照検出エンジンのテストスイート
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { UltimateReferenceDetector } from '../scripts/detector';

describe('UltimateReferenceDetector', () => {
  let detector: UltimateReferenceDetector;

  beforeAll(() => {
    // LLMなしでテスト用インスタンスを作成
    detector = new UltimateReferenceDetector(false);
  });

  describe('基本的な参照検出', () => {
    it('外部法令への参照を検出できる', async () => {
      const text = '民法第90条の規定により無効とする。';
      const refs = await detector.detectReferences(text);
      
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('external');
      expect(refs[0].targetLaw).toBe('民法');
      expect(refs[0].targetArticle).toBe('第九十条');
    });

    it('法令番号付きの参照を高精度で検出できる', async () => {
      const text = '民法（明治二十九年法律第八十九号）第90条';
      const refs = await detector.detectReferences(text);
      
      expect(refs).toHaveLength(1);
      expect(refs[0].confidence).toBeGreaterThanOrEqual(0.95);
      expect(refs[0].targetLawId).toBe('129AC0000000089');
    });

    it('内部参照を正しく識別できる', async () => {
      const text = 'この法律第5条の規定により処理する。';
      const refs = await detector.detectReferences(text, '123AC0000000001', 'テスト法');
      
      expect(refs).toHaveLength(1);
      expect(refs[0].type).toBe('internal');
      expect(refs[0].targetLawId).toBe('123AC0000000001');
    });

    it('相対参照を検出できる', async () => {
      const text = '前条の規定にかかわらず、次条に定める場合を除く。';
      const refs = await detector.detectReferences(text);
      
      const relativeRefs = refs.filter(r => r.type === 'relative');
      expect(relativeRefs).toHaveLength(2);
      expect(relativeRefs[0].text).toContain('前条');
      expect(relativeRefs[1].text).toContain('次条');
    });
  });

  describe('複雑な参照パターン', () => {
    it('範囲参照を検出できる', async () => {
      const text = '第10条から第15条までの規定を適用する。';
      const refs = await detector.detectReferences(text);
      
      expect(refs.length).toBeGreaterThan(0);
      const rangeRef = refs.find(r => r.type === 'range');
      expect(rangeRef).toBeDefined();
    });

    it('複数参照を検出できる', async () => {
      const text = '第3条、第5条及び第7条の規定により処理する。';
      const refs = await detector.detectReferences(text);
      
      expect(refs.length).toBeGreaterThan(0);
      const multipleRef = refs.find(r => r.type === 'multiple');
      expect(multipleRef).toBeDefined();
    });

    it('準用参照を検出できる', async () => {
      const text = '民法第100条の規定を準用する。';
      const refs = await detector.detectReferences(text);
      
      expect(refs.length).toBeGreaterThan(0);
      const applicationRef = refs.find(r => r.type === 'application');
      expect(applicationRef).toBeDefined();
    });
  });

  describe('条文番号の妥当性チェック', () => {
    it('存在しない条文番号を除外できる', async () => {
      const text = '急傾斜地の崩壊による災害の防止に関する法律第99条';
      const refs = await detector.detectReferences(text);
      
      // 急傾斜地法は最大26条なので、99条への参照は除外されるべき
      const invalidRef = refs.find(r => 
        r.targetLaw?.includes('急傾斜地') && r.articleNumber === 99
      );
      expect(invalidRef).toBeUndefined();
    });

    it('正常な条文番号は許可する', async () => {
      const text = '民法第500条の規定により処理する。';
      const refs = await detector.detectReferences(text);
      
      // 民法は1000条以上あるので、500条は有効
      expect(refs).toHaveLength(1);
      expect(refs[0].targetArticle).toContain('500');
    });
  });

  describe('漢数字変換', () => {
    it('基本的な漢数字を変換できる', () => {
      const detector = new UltimateReferenceDetector(false);
      
      expect(detector.kanjiToNumber('一')).toBe(1);
      expect(detector.kanjiToNumber('五')).toBe(5);
      expect(detector.kanjiToNumber('十')).toBe(10);
    });

    it('複雑な漢数字を変換できる', () => {
      const detector = new UltimateReferenceDetector(false);
      
      expect(detector.kanjiToNumber('二十三')).toBe(23);
      expect(detector.kanjiToNumber('九十九')).toBe(99);
      expect(detector.kanjiToNumber('百')).toBe(100);
      expect(detector.kanjiToNumber('二百五十')).toBe(250);
    });
  });

  describe('パフォーマンス', () => {
    it('大量のテキストを1秒以内に処理できる', async () => {
      const longText = '民法第90条の規定により、'.repeat(100);
      
      const startTime = Date.now();
      await detector.detectReferences(longText);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('エッジケース', () => {
    it('空文字列でエラーを起こさない', async () => {
      const refs = await detector.detectReferences('');
      expect(refs).toEqual([]);
    });

    it('参照のないテキストで空配列を返す', async () => {
      const text = 'これは参照を含まない通常のテキストです。';
      const refs = await detector.detectReferences(text);
      expect(refs).toEqual([]);
    });

    it('誤検出しやすいパターンを正しく処理する', async () => {
      const text = '方法第1条ではなく、手法第2条でもない。';
      const refs = await detector.detectReferences(text);
      
      // 「方法」「手法」は法令名ではないので検出されないべき
      expect(refs).toEqual([]);
    });
  });
});

describe('参照検出の統合テスト', () => {
  it('実際の法令テキストを正しく処理できる', async () => {
    const detector = new UltimateReferenceDetector(false);
    
    const realText = `
      第一条　この法律は、民法（明治二十九年法律第八十九号）第九十条の規定により、
      公の秩序又は善良の風俗に反する事項を目的とする法律行為は無効とすることを定める。
      
      第二条　前条の規定にかかわらず、次に掲げる場合はこの限りでない。
      一　会社法（平成十七年法律第八十六号）第三十条に規定する場合
      二　刑法（明治四十年法律第四十五号）第百九十九条に該当する場合
    `;
    
    const refs = await detector.detectReferences(realText, '999AC0000000999', 'テスト法');
    
    // 複数の参照が検出されるべき
    expect(refs.length).toBeGreaterThan(3);
    
    // 民法への参照が含まれるべき
    const civilLawRef = refs.find(r => r.targetLaw === '民法');
    expect(civilLawRef).toBeDefined();
    expect(civilLawRef?.targetLawId).toBe('129AC0000000089');
    
    // 内部参照（前条）が含まれるべき
    const relativeRef = refs.find(r => r.type === 'relative' && r.text.includes('前条'));
    expect(relativeRef).toBeDefined();
  });
});