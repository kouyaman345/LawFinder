import { describe, it, expect } from '@jest/globals';
import {
  normalizeArticleNumber,
  toDisplayFormat,
  toNumericFormat,
  compareArticleNumbers,
  isValidArticleNumber,
  generateArticleRange,
  extractArticleNumbers,
  resolveRelativeReference
} from '../src/utils/article-normalizer';

describe('Article Normalizer', () => {
  describe('normalizeArticleNumber', () => {
    it('should normalize various article formats', () => {
      // 完全形式
      expect(normalizeArticleNumber('第90条')).toEqual({
        numeric: '90',
        display: '第90条',
        original: '第90条',
        value: 90
      });
      
      // 数字のみ
      expect(normalizeArticleNumber('90')).toEqual({
        numeric: '90',
        display: '第90条',
        original: '90',
        value: 90
      });
      
      // 条のみ
      expect(normalizeArticleNumber('90条')).toEqual({
        numeric: '90',
        display: '第90条',
        original: '90条',
        value: 90
      });
      
      // 空文字
      expect(normalizeArticleNumber('')).toEqual({
        numeric: '',
        display: '',
        original: '',
        value: 0
      });
    });
    
    it('should handle kanji numbers', () => {
      expect(normalizeArticleNumber('第九十条')).toEqual({
        numeric: '90',
        display: '第90条',
        original: '第九十条',
        value: 90
      });
      
      expect(normalizeArticleNumber('第一条')).toEqual({
        numeric: '1',
        display: '第1条',
        original: '第一条',
        value: 1
      });
    });
  });
  
  describe('toDisplayFormat', () => {
    it('should convert to display format', () => {
      expect(toDisplayFormat('90')).toBe('第90条');
      expect(toDisplayFormat('第90条')).toBe('第90条');
      expect(toDisplayFormat('90条')).toBe('第90条');
      expect(toDisplayFormat('')).toBe('');
    });
  });
  
  describe('toNumericFormat', () => {
    it('should convert to numeric format', () => {
      expect(toNumericFormat('第90条')).toBe('90');
      expect(toNumericFormat('90')).toBe('90');
      expect(toNumericFormat('90条')).toBe('90');
      expect(toNumericFormat('')).toBe('');
    });
  });
  
  describe('compareArticleNumbers', () => {
    it('should compare article numbers correctly', () => {
      expect(compareArticleNumbers('第1条', '第2条')).toBeLessThan(0);
      expect(compareArticleNumbers('第10条', '第2条')).toBeGreaterThan(0);
      expect(compareArticleNumbers('第5条', '5')).toBe(0);
    });
  });
  
  describe('isValidArticleNumber', () => {
    it('should validate article numbers', () => {
      expect(isValidArticleNumber('第90条')).toBe(true);
      expect(isValidArticleNumber('90')).toBe(true);
      expect(isValidArticleNumber('')).toBe(false);
      expect(isValidArticleNumber('無効')).toBe(false);
    });
  });
  
  describe('generateArticleRange', () => {
    it('should generate article range', () => {
      expect(generateArticleRange('第1条', '第3条')).toEqual([
        '第1条',
        '第2条',
        '第3条'
      ]);
      
      expect(generateArticleRange('5', '7')).toEqual([
        '第5条',
        '第6条',
        '第7条'
      ]);
      
      expect(generateArticleRange('', '3')).toEqual([]);
    });
  });
  
  describe('extractArticleNumbers', () => {
    it('should extract article numbers from text', () => {
      const text = '民法第90条及び第91条の規定により';
      const articles = extractArticleNumbers(text);
      
      expect(articles).toHaveLength(2);
      expect(articles[0].numeric).toBe('90');
      expect(articles[1].numeric).toBe('91');
    });
    
    it('should extract various formats', () => {
      const text = '第1条から第3条まで、前条、次条';
      const articles = extractArticleNumbers(text);
      
      expect(articles.length).toBeGreaterThan(0);
      expect(articles[0].numeric).toBe('1');
    });
  });
  
  describe('resolveRelativeReference', () => {
    it('should resolve 前条', () => {
      const result = resolveRelativeReference('前条', '第5条');
      expect(result).toEqual({
        article: '第4条'
      });
    });
    
    it('should resolve 次条', () => {
      const result = resolveRelativeReference('次条', '第5条');
      expect(result).toEqual({
        article: '第6条'
      });
    });
    
    it('should resolve 前項', () => {
      const result = resolveRelativeReference('前項', '第5条', 3);
      expect(result).toEqual({
        article: '第5条',
        paragraph: 2
      });
    });
    
    it('should resolve 次項', () => {
      const result = resolveRelativeReference('次項', '第5条', 2);
      expect(result).toEqual({
        article: '第5条',
        paragraph: 3
      });
    });
    
    it('should resolve 同条', () => {
      const result = resolveRelativeReference('同条', '第5条');
      expect(result).toEqual({
        article: '第5条'
      });
    });
    
    it('should return null for invalid references', () => {
      expect(resolveRelativeReference('前条', '第1条')).toBeNull();
      expect(resolveRelativeReference('前項', '第5条', 1)).toBeNull();
      expect(resolveRelativeReference('無効', '第5条')).toBeNull();
    });
  });
});