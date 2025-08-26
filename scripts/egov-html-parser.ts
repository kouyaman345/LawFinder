#!/usr/bin/env npx tsx

/**
 * e-Gov法令HTMLパーサー
 * 
 * 保存されたHTMLファイルから参照データを抽出する
 * サーバーアクセスなしでローカル処理のみ
 */

import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';
import chalk from 'chalk';

interface EGovReference {
  sourceLawId: string;
  sourceArticle?: string;
  targetLawId?: string;
  targetLawName?: string;
  targetArticle?: string;
  referenceText: string;
  referenceType: 'internal' | 'external' | 'structural';
  confidence: number;
  sourcePosition?: {
    start: number;
    end: number;
    line?: number;
  };
}

interface ParseResult {
  lawId: string;
  lawTitle: string;
  references: EGovReference[];
  parseDate: string;
  articleCount: number;
  linkCount: number;
}

export class EGovHTMLParser {
  private htmlDir: string;
  private outputDir: string;
  private progressFile: string;
  
  constructor() {
    this.htmlDir = path.join(process.cwd(), 'egov_html_cache');
    this.outputDir = path.join(process.cwd(), 'egov_parsed_references');
    this.progressFile = path.join(this.outputDir, 'parse_progress.json');
    
    // 出力ディレクトリ作成
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * 進捗状況を読み込み
   */
  private loadProgress(): Set<string> {
    if (fs.existsSync(this.progressFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.progressFile, 'utf-8'));
        return new Set(data.completed || []);
      } catch {
        return new Set();
      }
    }
    return new Set();
  }

  /**
   * 進捗状況を保存
   */
  private saveProgress(completed: Set<string>): void {
    const data = {
      completed: Array.from(completed),
      lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(this.progressFile, JSON.stringify(data, null, 2));
  }

  /**
   * 結果をJSONファイルに保存
   */
  private saveResult(lawId: string, result: ParseResult): void {
    const outputPath = path.join(this.outputDir, `${lawId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  }

  /**
   * HTMLファイルから参照を抽出
   */
  parseHTML(lawId: string, htmlPath: string): ParseResult {
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    
    // メタデータを抽出
    let metadata: any = {};
    const metaMatch = htmlContent.match(/<!-- METADATA: (.*?) -->/);
    if (metaMatch) {
      try {
        metadata = JSON.parse(metaMatch[1]);
      } catch {}
    }
    
    // JSOMでHTML解析
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;
    
    const references: EGovReference[] = [];
    const seenRefs = new Set<string>();
    
    // 法令タイトルを取得
    let lawTitle = metadata.lawTitle || '';
    if (!lawTitle) {
      const titleEl = document.querySelector('.law_title, .lawTitle, h1');
      if (titleEl) {
        lawTitle = titleEl.textContent?.trim() || '';
      }
    }
    
    // すべての条文要素を処理
    const articles = document.querySelectorAll('.Article, article, [class*="article"]');
    let articleCount = 0;
    let totalLinkCount = 0;
    
    articles.forEach((article: Element) => {
      articleCount++;
      
      // 条文番号を取得
      const articleId = article.id || '';
      let articleNumber = '';
      
      // IDから条文番号を抽出（Mp-Pa_1-Ch_1-At_1 形式）
      const idMatch = articleId.match(/At_(\d+)/);
      if (idMatch) {
        articleNumber = idMatch[1];
      }
      
      // 条文番号が取れない場合は、テキストから抽出
      if (!articleNumber) {
        const articleText = article.textContent || '';
        const textMatch = articleText.match(/第(\d+)条/);
        if (textMatch) {
          articleNumber = textMatch[1];
        }
      }
      
      // 条文内のリンクを処理
      const links = article.querySelectorAll('a[href]');
      
      links.forEach((link: Element) => {
        totalLinkCount++;
        const href = (link as HTMLAnchorElement).href;
        const text = link.textContent?.trim() || '';
        
        // 相対位置を計算（簡易版）
        const parentText = article.textContent || '';
        const textIndex = parentText.indexOf(text);
        
        // 参照タイプを判定
        let referenceType: 'internal' | 'external' | 'structural' = 'external';
        let targetLawId = '';
        let targetArticle = '';
        
        // URLパターンから情報抽出
        if (href.includes('/law/') || href.includes('lawid=')) {
          // 他法令への参照
          const lawMatch = href.match(/(?:\/law\/|lawid=)([^/#?&]+)/);
          if (lawMatch) {
            targetLawId = lawMatch[1];
          }
          
          // アンカーから条文番号を抽出
          const anchorMatch = href.match(/#([^#]+)$/);
          if (anchorMatch) {
            const atMatch = anchorMatch[1].match(/At_(\d+)/);
            if (atMatch) {
              targetArticle = atMatch[1];
            }
          }
        } else if (href.includes('#')) {
          // 同一法令内参照
          referenceType = 'internal';
          targetLawId = lawId;
          
          const anchorMatch = href.match(/#([^#]+)$/);
          if (anchorMatch) {
            const atMatch = anchorMatch[1].match(/At_(\d+)/);
            if (atMatch) {
              targetArticle = atMatch[1];
            }
          }
        }
        
        // テキストパターンからも条文番号を補完
        if (!targetArticle && text) {
          const articleMatch = text.match(/第?(\d+)条/);
          if (articleMatch) {
            targetArticle = articleMatch[1];
          }
        }
        
        // 参照として有効か判定
        const isValidReference = (targetLawId || targetArticle) && text && text.length > 0;
        
        if (isValidReference) {
          // 重複チェック
          const refKey = `${articleNumber}-${targetLawId}-${targetArticle}-${text}`;
          
          if (!seenRefs.has(refKey)) {
            seenRefs.add(refKey);
            
            const ref: EGovReference = {
              sourceLawId: lawId,
              sourceArticle: articleNumber || undefined,
              targetLawId: targetLawId || undefined,
              targetArticle: targetArticle || undefined,
              referenceText: text,
              referenceType,
              confidence: 1.0, // HTMLリンクからの抽出なので信頼度100%
              sourcePosition: textIndex >= 0 ? {
                start: textIndex,
                end: textIndex + text.length
              } : undefined
            };
            
            references.push(ref);
          }
        }
      });
    });
    
    // 条文がない場合は本文全体を処理
    if (articleCount === 0) {
      const allLinks = document.querySelectorAll('a[href]');
      
      allLinks.forEach((link: Element) => {
        totalLinkCount++;
        const href = (link as HTMLAnchorElement).href;
        const text = link.textContent?.trim() || '';
        
        // URLから法令IDを抽出
        let targetLawId = '';
        const lawMatch = href.match(/(?:\/law\/|lawid=)([^/#?&]+)/);
        if (lawMatch) {
          targetLawId = lawMatch[1];
        }
        
        if (targetLawId && targetLawId !== lawId) {
          const refKey = `main-${targetLawId}-${text}`;
          
          if (!seenRefs.has(refKey)) {
            seenRefs.add(refKey);
            
            const ref: EGovReference = {
              sourceLawId: lawId,
              targetLawId,
              referenceText: text,
              referenceType: 'external',
              confidence: 1.0
            };
            
            references.push(ref);
          }
        }
      });
    }
    
    const result: ParseResult = {
      lawId,
      lawTitle,
      references,
      parseDate: new Date().toISOString(),
      articleCount,
      linkCount: totalLinkCount
    };
    
    return result;
  }

  /**
   * すべてのHTMLファイルを解析
   */
  async parseAll(options: {
    limit?: number;
    resume?: boolean;
  } = {}): Promise<void> {
    const {
      limit,
      resume = true
    } = options;
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('📋 e-Gov HTMLパース開始'));
    console.log(chalk.cyan('='.repeat(60)));
    
    // HTMLファイル一覧を取得
    const htmlFiles = fs.readdirSync(this.htmlDir)
      .filter(f => f.endsWith('.html'))
      .map(f => f.replace('.html', ''));
    
    // 進捗状況を読み込み
    const completed = resume ? this.loadProgress() : new Set<string>();
    
    // 処理対象を決定
    let targetLaws = htmlFiles.filter(id => !completed.has(id));
    
    if (limit) {
      targetLaws = targetLaws.slice(0, limit);
    }
    
    console.log(chalk.blue('\n📊 処理状況:'));
    console.log(`  HTMLファイル総数: ${htmlFiles.length}件`);
    console.log(`  解析済み: ${completed.size}件`);
    console.log(`  処理対象: ${targetLaws.length}件`);
    console.log(`  出力先: ${this.outputDir}\n`);
    
    const startTime = Date.now();
    let totalReferences = 0;
    let totalInternal = 0;
    let totalExternal = 0;
    let errors = 0;
    
    for (let i = 0; i < targetLaws.length; i++) {
      const lawId = targetLaws[i];
      const htmlPath = path.join(this.htmlDir, `${lawId}.html`);
      
      try {
        console.log(chalk.blue(`[${i + 1}/${targetLaws.length}] 解析中: ${lawId}`));
        
        const result = this.parseHTML(lawId, htmlPath);
        
        // 結果を保存
        this.saveResult(lawId, result);
        
        // 統計更新
        totalReferences += result.references.length;
        totalInternal += result.references.filter(r => r.referenceType === 'internal').length;
        totalExternal += result.references.filter(r => r.referenceType === 'external').length;
        
        // 進捗を記録
        completed.add(lawId);
        
        console.log(chalk.green(`  ✓ 完了: ${result.references.length}件の参照を抽出`));
        console.log(chalk.gray(`    - 条文数: ${result.articleCount}`));
        console.log(chalk.gray(`    - リンク数: ${result.linkCount}`));
        console.log(chalk.gray(`    - 内部参照: ${result.references.filter(r => r.referenceType === 'internal').length}件`));
        console.log(chalk.gray(`    - 外部参照: ${result.references.filter(r => r.referenceType === 'external').length}件`));
        
        // 定期的に進捗を保存
        if ((i + 1) % 10 === 0) {
          this.saveProgress(completed);
          
          const elapsed = (Date.now() - startTime) / 1000 / 60;
          const rate = (i + 1) / elapsed;
          const remaining = (targetLaws.length - i - 1) / rate;
          
          console.log(chalk.cyan(`\n📈 進捗: ${i + 1}/${targetLaws.length} (${Math.round((i + 1) / targetLaws.length * 100)}%)`));
          console.log(`  経過時間: ${elapsed.toFixed(1)}分`);
          console.log(`  残り時間: 約${Math.round(remaining)}分\n`);
        }
        
      } catch (error: any) {
        console.error(chalk.red(`  ✗ エラー: ${error.message}`));
        errors++;
      }
    }
    
    // 最終統計
    this.saveProgress(completed);
    const totalTime = (Date.now() - startTime) / 1000 / 60;
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('📊 解析完了'));
    console.log(chalk.cyan('='.repeat(60)));
    console.log(chalk.green(`✅ 処理済み: ${targetLaws.length - errors}件`));
    console.log(chalk.red(`✗ エラー: ${errors}件`));
    console.log(chalk.blue(`📍 総参照数: ${totalReferences}件`));
    console.log(chalk.blue(`  - 内部参照: ${totalInternal}件 (${Math.round(totalInternal / totalReferences * 100)}%)`));
    console.log(chalk.blue(`  - 外部参照: ${totalExternal}件 (${Math.round(totalExternal / totalReferences * 100)}%)`));
    console.log(chalk.blue(`⏱ 所要時間: ${totalTime.toFixed(1)}分`));
    console.log(chalk.blue(`📈 処理速度: ${(targetLaws.length / totalTime).toFixed(1)}法令/分`));
  }

  /**
   * 統計情報を表示
   */
  showStatistics(): void {
    const parsedFiles = fs.readdirSync(this.outputDir).filter(f => f.endsWith('.json') && f !== 'parse_progress.json');
    
    let totalLaws = 0;
    let totalReferences = 0;
    let totalInternal = 0;
    let totalExternal = 0;
    let maxReferences = 0;
    let maxRefLaw = '';
    
    const lawStats: Array<{lawId: string, title: string, count: number}> = [];
    
    parsedFiles.forEach(file => {
      const data: ParseResult = JSON.parse(fs.readFileSync(path.join(this.outputDir, file), 'utf-8'));
      
      totalLaws++;
      totalReferences += data.references.length;
      totalInternal += data.references.filter(r => r.referenceType === 'internal').length;
      totalExternal += data.references.filter(r => r.referenceType === 'external').length;
      
      if (data.references.length > maxReferences) {
        maxReferences = data.references.length;
        maxRefLaw = data.lawId;
      }
      
      lawStats.push({
        lawId: data.lawId,
        title: data.lawTitle,
        count: data.references.length
      });
    });
    
    // 参照数でソート
    lawStats.sort((a, b) => b.count - a.count);
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('📊 解析結果統計'));
    console.log(chalk.cyan('='.repeat(60)));
    console.log(`\n解析済み法令: ${totalLaws}件`);
    console.log(`総参照数: ${totalReferences}件`);
    console.log(`  - 内部参照: ${totalInternal}件 (${Math.round(totalInternal / totalReferences * 100)}%)`);
    console.log(`  - 外部参照: ${totalExternal}件 (${Math.round(totalExternal / totalReferences * 100)}%)`);
    console.log(`平均参照数: ${Math.round(totalReferences / totalLaws)}件/法令`);
    console.log(`最大参照数: ${maxReferences}件 (${maxRefLaw})`);
    
    console.log(chalk.cyan('\n📈 参照数TOP10:'));
    lawStats.slice(0, 10).forEach((law, i) => {
      console.log(`  ${i + 1}. ${law.title || law.lawId}: ${law.count}件`);
    });
    
    console.log(chalk.cyan('='.repeat(60)));
  }
}

// CLI実行
if (require.main === module) {
  const parser = new EGovHTMLParser();
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'parse':
          await parser.parseAll({
            limit: process.argv.includes('--limit') ?
              parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : undefined,
            resume: !process.argv.includes('--no-resume')
          });
          break;
          
        case 'stats':
          parser.showStatistics();
          break;
          
        case 'test':
          // テスト（5件のみ）
          await parser.parseAll({ limit: 5 });
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/egov-html-parser.ts parse [オプション]');
          console.log('  npx tsx scripts/egov-html-parser.ts stats');
          console.log('  npx tsx scripts/egov-html-parser.ts test');
          console.log('\nオプション:');
          console.log('  --limit N     解析数を制限');
          console.log('  --no-resume   最初から実行');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    }
  })();
}

export default EGovHTMLParser;