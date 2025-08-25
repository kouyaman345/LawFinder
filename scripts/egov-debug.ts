#!/usr/bin/env npx tsx

/**
 * e-Gov法令検索のデバッグツール
 * 実際のページ構造を調査する
 */

import { chromium } from 'playwright';
import chalk from 'chalk';

async function debugEGov(lawId: string) {
  const browser = await chromium.launch({
    headless: true, // ヘッドレスモード
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // User-Agentを設定
    await page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });

    // e-Gov法令ページにアクセス（両方のURL形式を試す）
    const urls = [
      `https://elaws.e-gov.go.jp/document?lawid=${lawId}`,
      `https://laws.e-gov.go.jp/law/${lawId}`,
      `https://elaws.e-gov.go.jp/law/${lawId}`
    ];

    let successUrl = null;
    
    for (const url of urls) {
      console.log(chalk.blue(`\n試行中: ${url}`));
      
      try {
        const response = await page.goto(url, { 
          waitUntil: 'networkidle',
          timeout: 30000
        });

        if (response && response.ok()) {
          console.log(chalk.green(`✓ 成功: ${url}`));
          successUrl = url;
          break;
        } else {
          console.log(chalk.yellow(`✗ 失敗: Status ${response?.status()}`));
        }
      } catch (error) {
        console.log(chalk.red(`✗ エラー: ${error.message}`));
      }
    }

    if (!successUrl) {
      console.log(chalk.red('\n全てのURLで失敗しました'));
      return;
    }

    // ページ分析
    console.log(chalk.cyan('\n=== ページ分析 ==='));
    
    // タイトル
    const title = await page.title();
    console.log(`タイトル: ${title}`);

    // 法令名
    const lawTitle = await page.evaluate(() => {
      const selectors = [
        '.law_title',
        '.lawTitle',
        'h1',
        '[class*="title"]'
      ];
      
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
          return { selector, text: el.textContent?.trim() };
        }
      }
      return null;
    });
    
    if (lawTitle) {
      console.log(`法令名: ${lawTitle.text} (セレクタ: ${lawTitle.selector})`);
    }

    // リンク構造の分析
    const linkAnalysis = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href]');
      const analysis = {
        total: links.length,
        byType: {
          internal: 0,
          external: 0,
          anchor: 0,
          other: 0
        },
        samples: [] as any[]
      };

      links.forEach((link, index) => {
        const href = (link as HTMLAnchorElement).href;
        const text = (link as HTMLElement).innerText || (link as HTMLElement).textContent || '';
        
        // タイプ分類
        if (href.includes('#') && !href.includes('://')) {
          analysis.byType.anchor++;
        } else if (href.includes('/law/') || href.includes('lawid=')) {
          analysis.byType.external++;
          
          // サンプル収集（最初の5件）
          if (analysis.samples.length < 5) {
            // 親要素の情報も取得
            let parent = link.parentElement;
            let context = '';
            let depth = 0;
            
            while (parent && depth < 3) {
              if (parent.className) {
                context += `[${parent.tagName}.${parent.className}]`;
              }
              parent = parent.parentElement;
              depth++;
            }
            
            analysis.samples.push({
              href: href,
              text: text.substring(0, 50),
              parentClasses: link.parentElement?.className || '',
              context: context
            });
          }
        } else if (href.startsWith('http')) {
          analysis.byType.external++;
        } else {
          analysis.byType.other++;
        }
      });

      return analysis;
    });

    console.log(chalk.cyan('\n=== リンク分析 ==='));
    console.log(`総リンク数: ${linkAnalysis.total}`);
    console.log(`  - アンカー: ${linkAnalysis.byType.anchor}`);
    console.log(`  - 外部参照: ${linkAnalysis.byType.external}`);
    console.log(`  - その他: ${linkAnalysis.byType.other}`);
    
    if (linkAnalysis.samples.length > 0) {
      console.log(chalk.cyan('\n=== 参照リンクサンプル ==='));
      linkAnalysis.samples.forEach((sample, i) => {
        console.log(`\n[${i + 1}]`);
        console.log(`  テキスト: ${sample.text}`);
        console.log(`  URL: ${sample.href}`);
        console.log(`  親クラス: ${sample.parentClasses}`);
        console.log(`  コンテキスト: ${sample.context}`);
      });
    }

    // DOM構造の分析
    const domStructure = await page.evaluate(() => {
      const structures = [];
      
      // 各種セレクタを試す
      const selectors = [
        '.article',
        '.Article',
        '[class*="article"]',
        '[class*="Article"]',
        'div[id*="article"]',
        'table tr',
        '.item',
        '.paragraph'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          structures.push({
            selector,
            count: elements.length,
            sample: elements[0].outerHTML.substring(0, 200)
          });
        }
      }
      
      return structures;
    });

    if (domStructure.length > 0) {
      console.log(chalk.cyan('\n=== DOM構造 ==='));
      domStructure.forEach(struct => {
        console.log(`\nセレクタ: ${struct.selector}`);
        console.log(`  要素数: ${struct.count}`);
        console.log(`  サンプル: ${struct.sample}...`);
      });
    }

    // スクリーンショット保存
    await page.screenshot({ path: `egov_debug_${lawId}.png`, fullPage: false });
    console.log(chalk.green(`\nスクリーンショット保存: egov_debug_${lawId}.png`));

    // ブラウザを閉じる
    await browser.close();
    
  } catch (error) {
    console.error(chalk.red('エラー:'), error);
  } finally {
    // Ctrl+Cで終了時にブラウザを閉じる
    process.on('SIGINT', async () => {
      await browser.close();
      process.exit(0);
    });
  }
}

// メイン実行
const lawId = process.argv[2] || '129AC0000000089';
console.log(chalk.cyan(`e-Gov法令検索デバッグツール`));
console.log(chalk.gray(`法令ID: ${lawId}`));

debugEGov(lawId);