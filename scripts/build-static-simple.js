#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// ビルド済みクラスをインポート
const { XMLFileDataSource } = require('../dist/infrastructure/persistence/XMLFileDataSource');
const { RegexPatternMatcher } = require('../dist/infrastructure/external/patterns/PatternMatcher');

const XML_DATA_PATH = process.env.XML_DATA_PATH || './laws_data/sample';
const OUTPUT_PATH = process.env.OUTPUT_PATH || './dist/static';

class SimpleStaticSiteGenerator {
  constructor() {
    this.dataSource = new XMLFileDataSource(XML_DATA_PATH);
    this.patternMatcher = new RegexPatternMatcher();
    this.processedLaws = [];
  }

  async generate() {
    console.log('静的サイト生成を開始します（簡易版）...');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectory();
    
    // 法令リストの取得
    console.log('法令ファイルを読み込んでいます...');
    const lawList = await this.dataSource.fetchLawList();
    
    console.log(`${lawList.laws.length}件の法令を処理します`);
    
    // 各法令の処理
    for (const law of lawList.laws) {
      await this.processLaw(law);
    }
    
    // インデックスページの生成
    await this.generateIndexPage();
    
    // アセットファイルの生成
    await this.generateAssets();
    
    console.log('静的サイト生成が完了しました！');
    console.log(`出力先: ${OUTPUT_PATH}`);
  }

  async prepareOutputDirectory() {
    await fs.rm(OUTPUT_PATH, { recursive: true, force: true });
    await fs.mkdir(OUTPUT_PATH, { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'laws'), { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'assets'), { recursive: true });
  }

  async processLaw(lawSummary) {
    try {
      console.log(`処理中: ${lawSummary.lawTitle}`);
      const lawDetail = await this.dataSource.fetchLawDetail(lawSummary.lawId);
      
      // 参照関係の抽出
      const references = this.extractReferences(lawDetail);
      
      // HTMLの生成
      const html = this.renderLawHTML(lawDetail, references);
      
      // ファイルの保存
      await fs.writeFile(
        path.join(OUTPUT_PATH, 'laws', `${lawSummary.lawId}.html`),
        html,
        'utf-8'
      );
      
      this.processedLaws.push({
        id: lawSummary.lawId,
        title: lawDetail.lawTitle,
        type: lawDetail.lawType,
        articleCount: lawDetail.articles.length
      });
      
    } catch (error) {
      console.error(`法令 ${lawSummary.lawId} の処理に失敗しました:`, error);
    }
  }

  extractReferences(lawData) {
    const references = [];
    
    for (const article of lawData.articles) {
      const text = this.getArticleText(article);
      const patterns = this.patternMatcher.findPatterns(text);
      
      // 条内参照の解決
      for (const pattern of patterns) {
        if (pattern.type === 'ARTICLE' && pattern.confidence > 0.9) {
          references.push({
            sourceArticle: article.articleNum,
            targetArticle: pattern.text,
            type: pattern.type
          });
        }
      }
    }
    
    return references;
  }

  getArticleText(article) {
    let text = '';
    for (const para of article.paragraphs) {
      text += para.content + ' ';
    }
    return text;
  }

  renderLawHTML(lawData, references) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(lawData.lawTitle)} | LawFinder</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
  <header>
    <h1>LawFinder</h1>
    <nav>
      <a href="../index.html">ホーム</a>
    </nav>
  </header>
  
  <main>
    <article class="law">
      <h1>${this.escapeHtml(lawData.lawTitle)}</h1>
      ${lawData.lawTitleKana ? `<p class="law-kana">${this.escapeHtml(lawData.lawTitleKana)}</p>` : ''}
      
      <div class="law-info">
        <p>法令ID: ${lawData.lawId}</p>
        <p>種別: ${lawData.lawType}</p>
        <p>公布日: ${lawData.promulgateDate.toLocaleDateString('ja-JP')}</p>
      </div>
      
      <div class="articles">
        ${lawData.articles.map(article => this.renderArticle(article, references)).join('\n')}
      </div>
    </article>
  </main>
  
  <footer>
    <p>&copy; 2025 LawFinder - 法令検索システム</p>
  </footer>
</body>
</html>`;
  }

  renderArticle(article, references) {
    // この条文に関連する参照を探す
    const articleRefs = references.filter(r => r.sourceArticle === article.articleNum);
    
    // 条文タイトルの処理（既に括弧が含まれている場合は追加しない）
    let titleDisplay = '';
    if (article.articleTitle) {
      const title = this.escapeHtml(article.articleTitle);
      titleDisplay = title.startsWith('（') ? ` ${title}` : ` （${title}）`;
    }
    
    return `
    <section class="article" id="art${article.articleNum}">
      <h2>第${article.articleNum}条${titleDisplay}</h2>
      ${article.paragraphs.map((para, idx) => {
        const paragraphNum = para.paragraphNum || (idx + 1);
        const numDisplay = article.paragraphs.length > 1 && paragraphNum > 1 ? `${paragraphNum}　` : '';
        return `
        <p class="paragraph">
          ${numDisplay}${this.processReferenceLinks(para.content, articleRefs)}
        </p>
        `;
      }).join('')}
    </section>`;
  }

  processReferenceLinks(text, references) {
    let processed = this.escapeHtml(text);
    
    // 他の法令への参照（民法、民事訴訟法など）
    processed = processed.replace(/民法第([０-９0-9]+)条/g, (match, num) => {
      const articleNum = this.toHalfWidth(num);
      // 民法のIDは129AC0000000089（サンプルデータ）
      return `<a href="129AC0000000089.html#art${articleNum}" class="ref-link external-ref">${match}</a>`;
    });
    
    processed = processed.replace(/民事訴訟法第([０-９0-9]+)条/g, (match, num) => {
      const articleNum = this.toHalfWidth(num);
      // 民事訴訟法のIDは155AC0000000048（サンプルデータ）
      return `<a href="155AC0000000048.html#art${articleNum}" class="ref-link external-ref">${match}</a>`;
    });
    
    // 同一法令内の条文参照のリンク化
    processed = processed.replace(/第([０-９0-9]+)条/g, (match, num) => {
      // 既に他法令へのリンクになっている場合はスキップ
      if (match.includes('class="ref-link')) return match;
      return `<a href="#art${this.toHalfWidth(num)}" class="ref-link">${match}</a>`;
    });
    
    // 前条・次条・同条などの相対参照
    processed = processed.replace(/前条/g, '<span class="ref-relative">前条</span>');
    processed = processed.replace(/次条/g, '<span class="ref-relative">次条</span>');
    processed = processed.replace(/同条/g, '<span class="ref-relative">同条</span>');
    
    // 項への参照
    processed = processed.replace(/前項/g, '<span class="ref-relative">前項</span>');
    processed = processed.replace(/同項/g, '<span class="ref-relative">同項</span>');
    processed = processed.replace(/第([０-９0-9]+)項/g, (match, num) => {
      return `<span class="ref-paragraph">${match}</span>`;
    });
    
    return processed;
  }

  toHalfWidth(str) {
    return str.replace(/[０-９]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
  }

  async generateIndexPage() {
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawFinder - 法令検索システム</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header>
    <h1>LawFinder</h1>
    <p>日本の法令を簡単に検索・閲覧</p>
  </header>
  
  <main>
    <section class="intro">
      <h2>LawFinderへようこそ</h2>
      <p>このシステムでは、日本の法令を検索し、法令間の参照関係を視覚的に確認できます。</p>
    </section>
    
    <section class="law-list">
      <h2>収録法令一覧</h2>
      <ul>
        ${this.processedLaws.map(law => `
          <li>
            <a href="laws/${law.id}.html">${this.escapeHtml(law.title)}</a>
            <span class="law-meta">（${law.type} - ${law.articleCount}条）</span>
          </li>
        `).join('')}
      </ul>
    </section>
  </main>
  
  <footer>
    <p>&copy; 2025 LawFinder - 法令検索システム</p>
  </footer>
</body>
</html>`;

    await fs.writeFile(path.join(OUTPUT_PATH, 'index.html'), html, 'utf-8');
  }

  async generateAssets() {
    // シンプルなCSSを生成
    const css = `
/* リセット */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 基本スタイル */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans CJK JP", sans-serif;
  line-height: 1.8;
  color: #333;
  background-color: #f5f5f5;
}

header {
  background-color: #1a5490;
  color: white;
  padding: 2rem 0;
  text-align: center;
}

header h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

header nav {
  margin-top: 1rem;
}

header nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  transition: background-color 0.3s;
}

header nav a:hover {
  background-color: rgba(255, 255, 255, 0.2);
}

main {
  max-width: 900px;
  margin: 2rem auto;
  padding: 0 1rem;
}

.law {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.law h1 {
  color: #1a5490;
  margin-bottom: 0.5rem;
  font-size: 2rem;
  border-bottom: 3px solid #1a5490;
  padding-bottom: 0.5rem;
}

.law-kana {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.law-info {
  background: #f0f4f8;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 2rem;
  font-size: 0.9rem;
}

.law-info p {
  margin: 0.25rem 0;
}

.article {
  margin: 2rem 0;
  padding: 1.5rem;
  border-left: 4px solid #4a90e2;
  background: #f8f9fa;
}

.article h2 {
  color: #1a5490;
  margin-bottom: 1rem;
  font-size: 1.3rem;
}

.paragraph {
  margin: 0.5rem 0;
  text-indent: 1em;
}

.ref-link {
  color: #4a90e2;
  text-decoration: none;
  border-bottom: 1px dashed #4a90e2;
}

.ref-link:hover {
  color: #1a5490;
  border-bottom-style: solid;
}

.external-ref {
  color: #e74c3c;
  font-weight: 500;
}

.external-ref:hover {
  color: #c0392b;
}

.ref-relative {
  color: #27ae60;
  font-weight: 500;
  border-bottom: 1px dotted #27ae60;
}

.ref-paragraph {
  color: #8e44ad;
  font-weight: 500;
}

/* インデックスページ */
.intro {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.intro h2 {
  color: #1a5490;
  margin-bottom: 1rem;
}

.law-list {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.law-list h2 {
  color: #1a5490;
  margin-bottom: 1rem;
}

.law-list ul {
  list-style: none;
}

.law-list li {
  padding: 0.5rem 0;
  border-bottom: 1px solid #eee;
}

.law-list a {
  color: #4a90e2;
  text-decoration: none;
  font-weight: 500;
}

.law-list a:hover {
  color: #1a5490;
  text-decoration: underline;
}

.law-meta {
  color: #666;
  font-size: 0.9rem;
  margin-left: 0.5rem;
}

footer {
  background-color: #34495e;
  color: white;
  text-align: center;
  padding: 2rem;
  margin-top: 4rem;
}

/* レスポンシブ */
@media (max-width: 768px) {
  header h1 {
    font-size: 2rem;
  }
  
  .law {
    padding: 1rem;
  }
  
  .article {
    padding: 1rem;
    margin: 1rem 0;
  }
}`;

    await fs.writeFile(path.join(OUTPUT_PATH, 'assets', 'style.css'), css, 'utf-8');
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}

// 実行
if (require.main === module) {
  const generator = new SimpleStaticSiteGenerator();
  generator.generate().catch(console.error);
}