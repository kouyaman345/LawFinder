#!/usr/bin/env tsx

/**
 * e-Gov法令検索から実際の参照リンクを取得
 * curlとHTMLパーサーを使用した簡易版
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';

interface EGovReference {
  sourceArticle: string;
  targetLawId: string;
  targetLawName: string;
  targetArticle: string;
  linkText: string;
  context: string;
}

class EGovScraper {
  /**
   * e-Govから法令ページを取得して参照を抽出
   */
  async scrapeLaw(lawId: string): Promise<EGovReference[]> {
    const url = `https://laws.e-gov.go.jp/law/${lawId}`;
    
    console.log(`\n📥 e-Govから取得中: ${url}`);
    
    try {
      // curlでHTMLを取得
      const html = execSync(`curl -s "${url}"`, { encoding: 'utf-8' });
      
      // JSdomでパース
      const dom = new JSDOM(html);
      const document = dom.window.document;
      
      // 参照リンクを抽出（e-Govでは他法令へのリンクが青色で表示される）
      const references: EGovReference[] = [];
      
      // 条文を含むエリアを探す
      const articleElements = document.querySelectorAll('.article-item, .law-text');
      
      articleElements.forEach((articleEl) => {
        const articleNum = this.extractArticleNumber(articleEl);
        
        // リンク要素を探す
        const links = articleEl.querySelectorAll('a[href*="/law/"], a[href*="#"]');
        
        links.forEach((link) => {
          const href = link.getAttribute('href') || '';
          const text = link.textContent?.trim() || '';
          
          // 外部法令へのリンク
          if (href.includes('/law/')) {
            const targetLawId = this.extractLawIdFromUrl(href);
            const targetArticle = this.extractArticleFromUrl(href);
            
            references.push({
              sourceArticle: articleNum,
              targetLawId,
              targetLawName: this.extractLawName(text),
              targetArticle,
              linkText: text,
              context: this.getContext(link)
            });
          }
          // 内部参照
          else if (href.startsWith('#')) {
            references.push({
              sourceArticle: articleNum,
              targetLawId: lawId,
              targetLawName: '',
              targetArticle: href.replace('#', ''),
              linkText: text,
              context: this.getContext(link)
            });
          }
        });
      });
      
      // HTMLファイルも保存（デバッグ用）
      writeFileSync(`/tmp/egov_${lawId}.html`, html);
      console.log(`  💾 HTMLを保存: /tmp/egov_${lawId}.html`);
      
      return references;
      
    } catch (error) {
      console.error(`❌ エラー: ${error.message}`);
      return [];
    }
  }
  
  /**
   * 条文番号を抽出
   */
  private extractArticleNumber(element: Element): string {
    // 第○条のパターンを探す
    const text = element.textContent || '';
    const match = text.match(/第([一二三四五六七八九十百千]+)条/);
    if (match) {
      return match[0];
    }
    
    // data属性から取得
    const dataArticle = element.getAttribute('data-article-num');
    if (dataArticle) {
      return `第${dataArticle}条`;
    }
    
    return '';
  }
  
  /**
   * URLから法令IDを抽出
   */
  private extractLawIdFromUrl(url: string): string {
    const match = url.match(/\/law\/([A-Z0-9]+)/);
    return match ? match[1] : '';
  }
  
  /**
   * URLから条文番号を抽出
   */
  private extractArticleFromUrl(url: string): string {
    const match = url.match(/#[A-Za-z]*_(\d+)/);
    return match ? match[1] : '';
  }
  
  /**
   * リンクテキストから法令名を抽出
   */
  private extractLawName(text: string): string {
    // 「民法」「会社法」などを抽出
    const match = text.match(/([^（）]+法)/);
    return match ? match[1] : text;
  }
  
  /**
   * リンクの周辺テキストを取得
   */
  private getContext(link: Element): string {
    const parent = link.parentElement;
    if (!parent) return '';
    
    const text = parent.textContent || '';
    const linkText = link.textContent || '';
    const index = text.indexOf(linkText);
    
    if (index === -1) return '';
    
    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + linkText.length + 30);
    
    return text.substring(start, end);
  }
  
  /**
   * 簡易的な参照パターン抽出（HTMLがない場合のフォールバック）
   */
  extractReferencesFromText(text: string): string[] {
    const references: string[] = [];
    
    // 民法第○条パターン
    const pattern1 = /([^（）、。\s]+法)(?:（[^）]+）)?第[一二三四五六七八九十百千]+条/g;
    const matches1 = text.matchAll(pattern1);
    for (const match of matches1) {
      references.push(match[0]);
    }
    
    // 括弧内の法令名
    const pattern2 = /（([^）]*法[^）]*)）/g;
    const matches2 = text.matchAll(pattern2);
    for (const match of matches2) {
      references.push(match[1]);
    }
    
    return [...new Set(references)];
  }
}

// 商法第1条のテキストで直接テスト
async function testWithActualText() {
  console.log('='.repeat(80));
  console.log('📊 商法第1条の参照検出テスト（実際のテキスト）');
  console.log('='.repeat(80));
  
  const article1Text = `第一条（趣旨等）
商人の営業、商行為その他商事については、他の法律に特別の定めがあるものを除くほか、この法律の定めるところによる。
２　商事に関し、この法律に定めがない事項については商慣習に従い、商慣習がないときは、民法（明治二十九年法律第八十九号）の定めるところによる。`;
  
  const scraper = new EGovScraper();
  const references = scraper.extractReferencesFromText(article1Text);
  
  console.log('\n検出された参照:');
  references.forEach((ref, i) => {
    console.log(`  ${i + 1}. ${ref}`);
  });
  
  // e-Govの正解データ（手動確認による）
  console.log('\n📌 e-Govでの実際の参照（手動確認）:');
  console.log('  1. 民法（明治二十九年法律第八十九号） → リンク先: 129AC0000000089');
  console.log('     - 第2項で「民法」が青色リンクになっている');
  console.log('     - クリックすると民法のページ（/law/129AC0000000089）に遷移');
  
  // 正しい検出パターン
  console.log('\n✅ 正しい検出に必要な要素:');
  console.log('  1. 「民法」という法令名を検出');
  console.log('  2. 括弧内の「明治二十九年法律第八十九号」も含めて抽出');
  console.log('  3. 法令IDマッピング: 民法 → 129AC0000000089');
}

// メイン処理
async function main() {
  const lawId = process.argv[2] || '132AC0000000048';
  
  // 実際のテキストでテスト
  await testWithActualText();
  
  // e-Govから取得を試みる（オプション）
  if (process.argv.includes('--fetch')) {
    const scraper = new EGovScraper();
    const references = await scraper.scrapeLaw(lawId);
    
    console.log(`\n📊 ${lawId}の参照: ${references.length}件`);
    references.slice(0, 10).forEach((ref, i) => {
      console.log(`\n${i + 1}. ${ref.linkText}`);
      console.log(`   元条文: ${ref.sourceArticle}`);
      console.log(`   対象法令: ${ref.targetLawId} (${ref.targetLawName})`);
      console.log(`   対象条文: ${ref.targetArticle}`);
    });
  }
}

main().catch(console.error);