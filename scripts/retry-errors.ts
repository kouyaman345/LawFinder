#!/usr/bin/env npx tsx

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

const errorLaws = [
  '141IO0000000217',
  '210AC0000000076',
  '318IO0000000618',
  '329AC0000000109',
  '344M50004000055',
  '355M50000400020',
  '416M60000010013',
  '418M60000400102',
  '428AC1000000105'
];

async function retryDownload() {
  const browser = await chromium.launch({ headless: true });
  const htmlDir = path.join(process.cwd(), 'egov_html_cache');
  
  console.log(chalk.cyan('エラーファイルの再試行'));
  console.log(`対象: ${errorLaws.length}件\n`);
  
  let success = 0;
  let failed = 0;
  
  for (const lawId of errorLaws) {
    console.log(chalk.blue(`再試行: ${lawId}`));
    const page = await browser.newPage();
    
    try {
      const url = `https://elaws.e-gov.go.jp/document?lawid=${lawId}`;
      
      // タイムアウトを60秒に延長
      const response = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 60000
      });
      
      if (response && response.ok()) {
        await page.waitForTimeout(2000);
        const html = await page.content();
        
        const metadata = {
          lawId,
          downloadDate: new Date().toISOString(),
          url,
          size: html.length,
          retry: true
        };
        
        const htmlWithMeta = `<!-- METADATA: ${JSON.stringify(metadata)} -->\n${html}`;
        const htmlPath = path.join(htmlDir, `${lawId}.html`);
        
        fs.writeFileSync(htmlPath, htmlWithMeta);
        console.log(chalk.green(`  ✓ 成功: ${(html.length / 1024).toFixed(1)}KB`));
        success++;
      } else {
        console.log(chalk.red(`  ✗ HTTP ${response?.status()}`));
        failed++;
      }
    } catch (error: any) {
      console.log(chalk.red(`  ✗ エラー: ${error.message}`));
      failed++;
    } finally {
      await page.close();
    }
    
    // 次のリクエストまで3秒待つ
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  await browser.close();
  
  console.log(chalk.cyan('\n=== 再試行結果 ==='));
  console.log(chalk.green(`成功: ${success}件`));
  console.log(chalk.red(`失敗: ${failed}件`));
}

retryDownload().catch(console.error);