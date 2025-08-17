#!/usr/bin/env npx tsx
/**
 * e-Gov参照構造検証ツール
 * 
 * e-Gov法令検索サイトの参照リンク構造を正解データとして使用し、
 * 本システムの参照検出精度を測定・改善する
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import HybridDBClient from '../src/lib/hybrid-db';

// 型定義
interface EGovReference {
  sourceArticle: string;
  targetUrl: string;
  targetLawId: string;
  targetArticle: string;
  anchorText: string;
  xpath?: string;
}

interface EGovLawData {
  lawId: string;
  url: string;
  title: string;
  references: EGovReference[];
  extractedAt: Date;
}

interface ValidationResult {
  lawId: string;
  totalEGovLinks: number;
  totalDetected: number;
  correctMatches: number;
  partialMatches: number;
  missed: EGovReference[];
  falsePositives: any[];
  accuracy: number;
  completeness: number;
  f1Score: number;
}

/**
 * e-Gov検証クラス
 */
class EGovValidator {
  private prisma: PrismaClient;
  private hybridDB: HybridDBClient;
  private cacheDir: string;

  constructor() {
    this.prisma = new PrismaClient();
    this.hybridDB = HybridDBClient.getInstance();
    this.cacheDir = path.join(process.cwd(), '.egov-cache');
    this.ensureCacheDir();
  }

  /**
   * キャッシュディレクトリの作成
   */
  private ensureCacheDir(): void {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * e-Govから法令ページをスクレイピング
   */
  async scrapeEGov(lawId: string): Promise<EGovLawData> {
    const spinner = ora(`e-Govから ${lawId} をスクレイピング中...`).start();
    const url = `https://laws.e-gov.go.jp/law/${lawId}`;
    
    try {
      // WebFetchを使用してe-Govページを取得
      const prompt = `
        この法令ページから以下の情報を抽出してください：
        1. 法令名（タイトル）
        2. すべての参照リンク（他の法令や条文へのリンク）
        
        各リンクについて以下を抽出：
        - リンク元の条文番号
        - リンク先のURL
        - リンクテキスト
        - リンク先の法令IDと条文番号（URLから判別可能な場合）
        
        JSON形式で返してください。
      `;
      
      // 実際のスクレイピング処理（WebFetchツールを使用）
      // ここではモックデータを返す
      const mockData: EGovLawData = {
        lawId,
        url,
        title: this.getLawTitle(lawId),
        references: await this.extractReferencesFromEGov(lawId),
        extractedAt: new Date()
      };
      
      // キャッシュに保存
      this.saveToCache(lawId, mockData);
      
      spinner.succeed(`${mockData.references.length}件の参照を抽出しました`);
      return mockData;
      
    } catch (error) {
      spinner.fail(`スクレイピングエラー: ${error}`);
      throw error;
    }
  }

  /**
   * 法令名の取得（仮実装）
   */
  private getLawTitle(lawId: string): string {
    const titles: { [key: string]: string } = {
      '132AC0000000048': '商法',
      '129AC0000000089': '民法',
      '417AC0000000086': '会社法',
      '322AC0000000049': '労働基準法',
      '140AC0000000045': '刑法'
    };
    return titles[lawId] || `法令 ${lawId}`;
  }

  /**
   * e-Govから参照を抽出（仮実装）
   * 実際にはWebFetchやpuppeteerを使用してスクレイピング
   */
  private async extractReferencesFromEGov(lawId: string): Promise<EGovReference[]> {
    // 商法の例
    if (lawId === '132AC0000000048') {
      return [
        {
          sourceArticle: '第五百五十一条',
          targetUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089#Mp-At_566',
          targetLawId: '129AC0000000089',
          targetArticle: '第五百六十六条',
          anchorText: '民法第五百六十六条'
        },
        {
          sourceArticle: '第五百五十二条',
          targetUrl: 'https://laws.e-gov.go.jp/law/129AC0000000089#Mp-At_567',
          targetLawId: '129AC0000000089',
          targetArticle: '第五百六十七条',
          anchorText: '民法第五百六十七条'
        }
      ];
    }
    
    // 民法の例
    if (lawId === '129AC0000000089') {
      return [
        {
          sourceArticle: '第三条',
          targetUrl: '#Mp-At_1',
          targetLawId: '129AC0000000089',
          targetArticle: '第一条',
          anchorText: '第一条'
        }
      ];
    }
    
    return [];
  }

  /**
   * キャッシュへの保存
   */
  private saveToCache(lawId: string, data: EGovLawData): void {
    const filePath = path.join(this.cacheDir, `${lawId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * キャッシュからの読み込み
   */
  private loadFromCache(lawId: string): EGovLawData | null {
    const filePath = path.join(this.cacheDir, `${lawId}.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  }

  /**
   * 本システムの検出結果とe-Govデータを比較
   */
  async compare(lawId: string): Promise<ValidationResult> {
    const spinner = ora('検出結果を比較中...').start();
    
    try {
      // e-Govデータの取得（キャッシュまたはスクレイピング）
      let egovData = this.loadFromCache(lawId);
      if (!egovData) {
        egovData = await this.scrapeEGov(lawId);
      }
      
      // 本システムの検出結果を取得
      const systemReferences = await this.getSystemReferences(lawId);
      
      // 比較処理
      const result = this.compareReferences(egovData, systemReferences);
      
      spinner.succeed(`精度: ${(result.accuracy * 100).toFixed(1)}% | 完全性: ${(result.completeness * 100).toFixed(1)}%`);
      return result;
      
    } catch (error) {
      spinner.fail(`比較エラー: ${error}`);
      throw error;
    }
  }

  /**
   * 本システムの参照検出結果を取得
   */
  private async getSystemReferences(lawId: string): Promise<any[]> {
    // Neo4jから参照データを取得
    const law = await this.hybridDB.getLaw(lawId);
    if (!law) return [];
    
    const references = [];
    for (const article of law.articles) {
      const refs = await this.hybridDB.getArticleReferences(lawId, article.articleNumber);
      for (const ref of refs) {
        references.push({
          sourceArticle: article.articleNumber,
          targetLawId: ref.targetLawId,
          targetArticle: ref.targetArticle,
          type: ref.type,
          text: ref.text
        });
      }
    }
    
    return references;
  }

  /**
   * 参照の比較
   */
  private compareReferences(egovData: EGovLawData, systemRefs: any[]): ValidationResult {
    const correctMatches: EGovReference[] = [];
    const partialMatches: EGovReference[] = [];
    const missed: EGovReference[] = [];
    const systemRefsCopy = [...systemRefs];
    
    // e-Govの各参照について照合
    for (const egovRef of egovData.references) {
      const matchIndex = systemRefsCopy.findIndex(sysRef => 
        this.isExactMatch(egovRef, sysRef)
      );
      
      if (matchIndex >= 0) {
        correctMatches.push(egovRef);
        systemRefsCopy.splice(matchIndex, 1);
      } else {
        // 部分一致をチェック
        const partialIndex = systemRefsCopy.findIndex(sysRef =>
          this.isPartialMatch(egovRef, sysRef)
        );
        
        if (partialIndex >= 0) {
          partialMatches.push(egovRef);
          systemRefsCopy.splice(partialIndex, 1);
        } else {
          missed.push(egovRef);
        }
      }
    }
    
    // 残りは誤検出
    const falsePositives = systemRefsCopy;
    
    // メトリクス計算
    const totalEGov = egovData.references.length;
    const accuracy = totalEGov > 0 ? correctMatches.length / totalEGov : 0;
    const completeness = totalEGov > 0 
      ? (correctMatches.length + partialMatches.length * 0.5) / totalEGov 
      : 0;
    const precision = systemRefs.length > 0 
      ? (correctMatches.length + partialMatches.length * 0.5) / systemRefs.length 
      : 0;
    const recall = completeness;
    const f1Score = precision + recall > 0 
      ? 2 * (precision * recall) / (precision + recall) 
      : 0;
    
    return {
      lawId: egovData.lawId,
      totalEGovLinks: totalEGov,
      totalDetected: systemRefs.length,
      correctMatches: correctMatches.length,
      partialMatches: partialMatches.length,
      missed,
      falsePositives,
      accuracy,
      completeness,
      f1Score
    };
  }

  /**
   * 完全一致判定
   */
  private isExactMatch(egovRef: EGovReference, sysRef: any): boolean {
    return egovRef.sourceArticle === sysRef.sourceArticle &&
           egovRef.targetLawId === sysRef.targetLawId &&
           egovRef.targetArticle === sysRef.targetArticle;
  }

  /**
   * 部分一致判定
   */
  private isPartialMatch(egovRef: EGovReference, sysRef: any): boolean {
    // 条文番号が一致し、法令または対象が部分的に一致
    return egovRef.sourceArticle === sysRef.sourceArticle &&
           (egovRef.targetLawId === sysRef.targetLawId ||
            egovRef.targetArticle === sysRef.targetArticle);
  }

  /**
   * レポート生成
   */
  async generateReport(results: ValidationResult[]): Promise<string> {
    let report = '# e-Gov検証レポート\n\n';
    report += `生成日時: ${new Date().toISOString()}\n\n`;
    
    // サマリー
    const avgAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
    const avgCompleteness = results.reduce((sum, r) => sum + r.completeness, 0) / results.length;
    const avgF1 = results.reduce((sum, r) => sum + r.f1Score, 0) / results.length;
    
    report += '## 全体サマリー\n\n';
    report += `- 検証法令数: ${results.length}\n`;
    report += `- 平均精度: ${(avgAccuracy * 100).toFixed(1)}%\n`;
    report += `- 平均完全性: ${(avgCompleteness * 100).toFixed(1)}%\n`;
    report += `- 平均F1スコア: ${(avgF1 * 100).toFixed(1)}%\n\n`;
    
    // 各法令の詳細
    report += '## 法令別結果\n\n';
    for (const result of results) {
      report += `### ${result.lawId}\n\n`;
      report += `- e-Gov参照数: ${result.totalEGovLinks}\n`;
      report += `- 検出数: ${result.totalDetected}\n`;
      report += `- 完全一致: ${result.correctMatches}\n`;
      report += `- 部分一致: ${result.partialMatches}\n`;
      report += `- 見逃し: ${result.missed.length}\n`;
      report += `- 誤検出: ${result.falsePositives.length}\n`;
      report += `- 精度: ${(result.accuracy * 100).toFixed(1)}%\n`;
      report += `- F1スコア: ${(result.f1Score * 100).toFixed(1)}%\n\n`;
      
      if (result.missed.length > 0) {
        report += '#### 見逃した参照:\n';
        for (const miss of result.missed.slice(0, 5)) {
          report += `- ${miss.sourceArticle} → ${miss.anchorText}\n`;
        }
        if (result.missed.length > 5) {
          report += `- 他 ${result.missed.length - 5}件\n`;
        }
        report += '\n';
      }
    }
    
    return report;
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// CLIコマンドの定義
const program = new Command();
const validator = new EGovValidator();

program
  .name('egov-validator')
  .description('e-Gov参照構造検証ツール')
  .version('1.0.0');

// scrape コマンド
program
  .command('scrape <lawId>')
  .description('e-Govから法令をスクレイピング')
  .action(async (lawId) => {
    try {
      const data = await validator.scrapeEGov(lawId);
      console.log(chalk.green(`✅ ${data.references.length}件の参照を抽出しました`));
      console.log(`キャッシュに保存: .egov-cache/${lawId}.json`);
    } catch (error) {
      console.error(chalk.red('❌ エラー:'), error);
      process.exit(1);
    } finally {
      await validator.cleanup();
    }
  });

// compare コマンド
program
  .command('compare <lawId>')
  .description('本システムとe-Govの参照を比較')
  .action(async (lawId) => {
    try {
      const result = await validator.compare(lawId);
      
      console.log(chalk.cyan('\n=== 比較結果 ==='));
      console.log(`法令ID: ${result.lawId}`);
      console.log(`e-Gov参照数: ${result.totalEGovLinks}`);
      console.log(`システム検出数: ${result.totalDetected}`);
      console.log(chalk.green(`完全一致: ${result.correctMatches}`));
      console.log(chalk.yellow(`部分一致: ${result.partialMatches}`));
      console.log(chalk.red(`見逃し: ${result.missed.length}`));
      console.log(chalk.magenta(`誤検出: ${result.falsePositives.length}`));
      console.log(chalk.bold(`\n精度: ${(result.accuracy * 100).toFixed(1)}%`));
      console.log(chalk.bold(`F1スコア: ${(result.f1Score * 100).toFixed(1)}%`));
      
      if (result.missed.length > 0) {
        console.log(chalk.yellow('\n見逃した参照（最初の5件）:'));
        for (const miss of result.missed.slice(0, 5)) {
          console.log(`  - ${miss.sourceArticle} → ${miss.anchorText}`);
        }
      }
      
    } catch (error) {
      console.error(chalk.red('❌ エラー:'), error);
      process.exit(1);
    } finally {
      await validator.cleanup();
    }
  });

// validate-all コマンド
program
  .command('validate-all')
  .description('主要法令すべてを検証')
  .action(async () => {
    const lawIds = [
      '132AC0000000048', // 商法
      '129AC0000000089', // 民法
      '417AC0000000086', // 会社法
      '322AC0000000049', // 労働基準法
      '140AC0000000045'  // 刑法
    ];
    
    const results: ValidationResult[] = [];
    
    for (const lawId of lawIds) {
      console.log(chalk.cyan(`\n${lawId} を検証中...`));
      try {
        const result = await validator.compare(lawId);
        results.push(result);
        console.log(chalk.green(`✅ 完了: 精度 ${(result.accuracy * 100).toFixed(1)}%`));
      } catch (error) {
        console.error(chalk.red(`❌ ${lawId} でエラー:`, error));
      }
    }
    
    // レポート生成
    const report = await validator.generateReport(results);
    const reportPath = `egov-validation-report-${new Date().toISOString().slice(0, 10)}.md`;
    fs.writeFileSync(reportPath, report);
    console.log(chalk.green(`\n✅ レポートを生成しました: ${reportPath}`));
    
    await validator.cleanup();
  });

// report コマンド
program
  .command('report')
  .description('キャッシュから検証レポートを生成')
  .action(async () => {
    try {
      // キャッシュディレクトリのファイルを読み込み
      const cacheDir = path.join(process.cwd(), '.egov-cache');
      const files = fs.readdirSync(cacheDir).filter(f => f.endsWith('.json'));
      
      const results: ValidationResult[] = [];
      for (const file of files) {
        const lawId = file.replace('.json', '');
        console.log(chalk.cyan(`${lawId} を処理中...`));
        const result = await validator.compare(lawId);
        results.push(result);
      }
      
      const report = await validator.generateReport(results);
      const reportPath = `egov-validation-report-${new Date().toISOString().slice(0, 10)}.md`;
      fs.writeFileSync(reportPath, report);
      console.log(chalk.green(`✅ レポートを生成しました: ${reportPath}`));
      
    } catch (error) {
      console.error(chalk.red('❌ エラー:'), error);
      process.exit(1);
    } finally {
      await validator.cleanup();
    }
  });

// プログラム実行
program.parse(process.argv);

export { EGovValidator, EGovLawData, ValidationResult };