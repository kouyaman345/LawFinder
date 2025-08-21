#!/usr/bin/env npx tsx

/**
 * エラー分析ツール
 * e-Govとの比較で実際のエラーを収集・分析
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import chalk from 'chalk';

const prisma = new PrismaClient();

interface ErrorCase {
  lawId: string;
  lawName: string;
  articleNumber: string;
  text: string;
  expected: string;
  detected: string;
  errorType: 'missed' | 'false_positive' | 'wrong_type';
  pattern?: string;
  context?: any;
}

export class ErrorAnalyzer {
  private errors: ErrorCase[] = [];
  
  /**
   * e-Gov XMLから正解データを抽出
   */
  private extractEGovReferences(xmlPath: string): any[] {
    if (!existsSync(xmlPath)) {
      console.warn(`XMLファイルが見つかりません: ${xmlPath}`);
      return [];
    }
    
    const content = readFileSync(xmlPath, 'utf-8');
    const references = [];
    
    // e-Govの参照マークアップを抽出
    const patterns = [
      /<Ruby>([^<]+)<\/Ruby>/g,  // ルビ付き参照
      /第([０-９〇一二三四五六七八九十百千万]+)条/g,  // 条文参照
      /([^、。]+法)(?:（[^）]+）)?/g,  // 法令名
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        references.push({
          text: match[0],
          position: match.index,
          type: this.detectReferenceType(match[0]),
        });
      }
    }
    
    return references;
  }
  
  /**
   * 参照タイプを判定
   */
  private detectReferenceType(text: string): string {
    if (text.includes('法') && !text.includes('第')) return 'law_name';
    if (text.includes('第') && text.includes('条')) return 'article';
    if (text.includes('前') || text.includes('次')) return 'relative';
    if (text.includes('から') && text.includes('まで')) return 'range';
    return 'other';
  }
  
  /**
   * 主要法令でエラーを収集
   */
  public async collectErrors(lawIds: string[]): Promise<void> {
    console.log(chalk.blue('=== エラー収集開始 ===\n'));
    
    for (const lawId of lawIds) {
      console.log(chalk.cyan(`\n処理中: ${lawId}`));
      
      // データベースから法令を取得
      const law = await prisma.law.findUnique({
        where: { id: lawId },
        include: { articles: true },
      });
      
      if (!law) {
        console.warn(`法令が見つかりません: ${lawId}`);
        continue;
      }
      
      // XMLパスを構築
      const xmlPath = path.join(
        process.cwd(),
        'laws_data',
        'sample',
        `${lawId}.xml`
      );
      
      // e-Govの正解データを取得
      const egovRefs = this.extractEGovReferences(xmlPath);
      
      // 現在の検出結果を取得
      const detectedRefs = await this.detectReferences(law.articles);
      
      // 比較してエラーを特定
      this.compareAndLogErrors(law, egovRefs, detectedRefs);
    }
    
    // エラー分析
    this.analyzeErrors();
  }
  
  /**
   * 現在のエンジンで参照を検出
   */
  private async detectReferences(articles: any[]): Promise<any[]> {
    const references = [];
    
    for (const article of articles) {
      // 簡易検出（実際のdetector.tsの処理を簡略化）
      const patterns = [
        /第(\d+)条/g,
        /([^、。]+法)/g,
        /前項|次項|前条|次条/g,
      ];
      
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(article.content)) !== null) {
          references.push({
            articleId: article.id,
            text: match[0],
            type: this.detectReferenceType(match[0]),
            position: match.index,
          });
        }
      }
    }
    
    return references;
  }
  
  /**
   * 比較してエラーを記録
   */
  private compareAndLogErrors(law: any, egovRefs: any[], detectedRefs: any[]): void {
    // 検出漏れをチェック
    for (const egovRef of egovRefs) {
      const found = detectedRefs.some(d => 
        d.text === egovRef.text && 
        Math.abs(d.position - egovRef.position) < 10
      );
      
      if (!found) {
        this.errors.push({
          lawId: law.id,
          lawName: law.name,
          articleNumber: 'N/A',
          text: egovRef.text,
          expected: egovRef.type,
          detected: 'none',
          errorType: 'missed',
          pattern: this.suggestPattern(egovRef.text),
        });
      }
    }
    
    // 誤検出をチェック
    for (const detectedRef of detectedRefs) {
      const found = egovRefs.some(e => 
        e.text === detectedRef.text && 
        Math.abs(e.position - detectedRef.position) < 10
      );
      
      if (!found) {
        this.errors.push({
          lawId: law.id,
          lawName: law.name,
          articleNumber: 'N/A',
          text: detectedRef.text,
          expected: 'none',
          detected: detectedRef.type,
          errorType: 'false_positive',
        });
      }
    }
  }
  
  /**
   * エラーパターンを分析
   */
  private analyzeErrors(): void {
    console.log(chalk.yellow('\n=== エラー分析結果 ===\n'));
    
    // エラータイプ別集計
    const byType = this.errors.reduce((acc, err) => {
      acc[err.errorType] = (acc[err.errorType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('エラータイプ別:');
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type}: ${count}件`);
    }
    
    // 最頻出エラーパターン
    const patterns = new Map<string, number>();
    for (const err of this.errors) {
      if (err.errorType === 'missed') {
        const pattern = this.extractPattern(err.text);
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }
    
    console.log('\n最頻出の見逃しパターン:');
    const sortedPatterns = Array.from(patterns.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    for (const [pattern, count] of sortedPatterns) {
      console.log(`  "${pattern}": ${count}件`);
    }
    
    // 修正提案
    this.suggestFixes();
  }
  
  /**
   * エラーテキストからパターンを抽出
   */
  private extractPattern(text: string): string {
    // 数字を汎用化
    let pattern = text.replace(/\d+/g, '(\\d+)');
    // 漢数字を汎用化
    pattern = pattern.replace(/[〇一二三四五六七八九十百千万]+/g, '([漢数字]+)');
    return pattern;
  }
  
  /**
   * パターンを提案
   */
  private suggestPattern(text: string): string {
    const pattern = this.extractPattern(text);
    return `/${pattern}/g`;
  }
  
  /**
   * 修正提案を生成
   */
  private suggestFixes(): void {
    console.log(chalk.green('\n=== 修正提案 ===\n'));
    
    const fixes = [];
    
    // 最頻出エラーから修正案を生成
    for (const err of this.errors.slice(0, 5)) {
      if (err.errorType === 'missed' && err.pattern) {
        fixes.push({
          pattern: err.pattern,
          example: err.text,
          impact: this.errors.filter(e => e.text.includes(err.text.substring(0, 5))).length,
        });
      }
    }
    
    console.log('detector.tsに追加すべきパターン:\n');
    for (const fix of fixes) {
      console.log(`// 例: "${fix.example}" (${fix.impact}件の改善)`);
      console.log(`const newPattern = ${fix.pattern};\n`);
    }
  }
  
  /**
   * エラーレポートを保存
   */
  public saveReport(outputPath: string): void {
    const report = {
      summary: {
        totalErrors: this.errors.length,
        missed: this.errors.filter(e => e.errorType === 'missed').length,
        falsePositives: this.errors.filter(e => e.errorType === 'false_positive').length,
      },
      errors: this.errors,
      patterns: this.extractCommonPatterns(),
      timestamp: new Date().toISOString(),
    };
    
    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    console.log(chalk.green(`\nレポート保存: ${outputPath}`));
  }
  
  /**
   * 共通パターンを抽出
   */
  private extractCommonPatterns(): any[] {
    const patterns = new Map<string, ErrorCase[]>();
    
    for (const err of this.errors) {
      if (err.errorType === 'missed') {
        const pattern = this.extractPattern(err.text);
        if (!patterns.has(pattern)) {
          patterns.set(pattern, []);
        }
        patterns.get(pattern)!.push(err);
      }
    }
    
    return Array.from(patterns.entries())
      .map(([pattern, cases]) => ({
        pattern,
        count: cases.length,
        examples: cases.slice(0, 3).map(c => c.text),
      }))
      .sort((a, b) => b.count - a.count);
  }
}

// メイン実行
if (require.main === module) {
  const analyzer = new ErrorAnalyzer();
  
  // 主要5法令でテスト
  const majorLaws = [
    '129AC0000000089', // 民法
    '132AC0000000048', // 商法
    '140AC0000000045', // 刑法
    '417AC0000000086', // 会社法
    '322AC0000000049', // 労働基準法
  ];
  
  analyzer.collectErrors(majorLaws)
    .then(() => {
      analyzer.saveReport('Report/error_analysis_report.json');
      console.log(chalk.green('\n✅ エラー分析完了'));
      process.exit(0);
    })
    .catch(err => {
      console.error(chalk.red('エラー:', err));
      process.exit(1);
    });
}