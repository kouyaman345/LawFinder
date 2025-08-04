#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { XMLFileDataSource } = require('../dist/infrastructure/persistence/XMLFileDataSource').default || require('../dist/infrastructure/persistence/XMLFileDataSource');
const { RegexPatternMatcher } = require('../dist/infrastructure/external/patterns/PatternMatcher').default || require('../dist/infrastructure/external/patterns/PatternMatcher');
const { LocalLLMService } = require('../dist/infrastructure/external/llm/LocalLLMService').default || require('../dist/infrastructure/external/llm/LocalLLMService');

const XML_DATA_PATH = process.env.XML_DATA_PATH || './laws_data';
const OUTPUT_PATH = process.env.OUTPUT_PATH || './dist/static';

class StaticSiteGenerator {
  constructor() {
    this.dataSource = new XMLFileDataSource(XML_DATA_PATH);
    this.patternMatcher = new RegexPatternMatcher();
    this.llmService = new LocalLLMService();
    this.processedReferences = new Map();
  }

  async generate() {
    console.log('静的サイト生成を開始します...');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectory();
    
    // 法令リストの取得
    console.log('法令ファイルを読み込んでいます...');
    const lawList = await this.dataSource.fetchLawList({ limit: 10000 });
    
    console.log(`${lawList.laws.length}件の法令を処理します`);
    
    // 各法令の処理
    const batchSize = 10;
    for (let i = 0; i < lawList.laws.length; i += batchSize) {
      const batch = lawList.laws.slice(i, i + batchSize);
      await Promise.all(batch.map(law => this.processLaw(law)));
      
      const progress = Math.floor((i + batch.length) / lawList.laws.length * 100);
      console.log(`進捗: ${progress}% (${i + batch.length}/${lawList.laws.length})`);
    }
    
    // インデックスファイルの生成
    await this.generateIndexFiles(lawList.laws);
    
    // アセットファイルのコピー
    await this.copyAssets();
    
    console.log('静的サイト生成が完了しました！');
  }

  async prepareOutputDirectory() {
    await fs.rm(OUTPUT_PATH, { recursive: true, force: true });
    await fs.mkdir(OUTPUT_PATH, { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'laws'), { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'assets'), { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'search'), { recursive: true });
  }

  async processLaw(lawSummary) {
    try {
      const lawData = await this.dataSource.fetchLawDetail(lawSummary.lawId);
      const references = await this.extractReferences(lawData);
      const html = this.renderLawHTML(lawData, references);
      
      await fs.writeFile(
        path.join(OUTPUT_PATH, 'laws', `${lawData.lawId}.html`),
        html,
        'utf-8'
      );
      
      // 参照関係の記録
      this.processedReferences.set(lawData.lawId, references);
    } catch (error) {
      console.error(`法令 ${lawSummary.lawId} の処理に失敗しました:`, error);
    }
  }

  async extractReferences(lawData) {
    const references = [];
    
    for (const article of lawData.articles) {
      const fullText = this.getArticleFullText(article);
      const patterns = this.patternMatcher.findPatterns(fullText);
      
      for (const pattern of patterns) {
        // 高信頼度のパターンのみを静的サイトに含める
        if (pattern.confidence > 0.8) {
          references.push({
            sourceArticle: article.articleNum,
            pattern: pattern,
            targetUrl: this.resolveTargetUrl(pattern, lawData.lawId)
          });
        }
      }
    }
    
    return references;
  }

  getArticleFullText(article) {
    let text = article.articleTitle ? `${article.articleTitle}\n` : '';
    
    for (const para of article.paragraphs) {
      text += para.content + '\n';
      if (para.items) {
        for (const item of para.items) {
          text += `  ${item}\n`;
        }
      }
    }
    
    return text;
  }

  resolveTargetUrl(pattern, currentLawId) {
    // シンプルな解決ロジック（静的サイト用）
    if (pattern.type === 'ARTICLE' && pattern.metadata?.number) {
      return `#art${pattern.metadata.number}`;
    }
    return null;
  }

  renderLawHTML(lawData, references) {
    const referenceMap = new Map();
    for (const ref of references) {
      if (!referenceMap.has(ref.sourceArticle)) {
        referenceMap.set(ref.sourceArticle, []);
      }
      referenceMap.get(ref.sourceArticle).push(ref);
    }

    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(lawData.lawTitle)} | LawFinder</title>
  <link rel="stylesheet" href="../assets/style.css">
  <link rel="manifest" href="../manifest.json">
</head>
<body>
  <header>
    <nav>
      <a href="../index.html">ホーム</a>
      <a href="../search.html">検索</a>
    </nav>
  </header>
  
  <main>
    <article class="law">
      <h1>${this.escapeHtml(lawData.lawTitle)}</h1>
      <div class="law-metadata">
        <dl>
          <dt>法令ID</dt>
          <dd>${lawData.lawId}</dd>
          <dt>法令種別</dt>
          <dd>${lawData.lawType}</dd>
          <dt>公布日</dt>
          <dd>${lawData.promulgateDate.toLocaleDateString('ja-JP')}</dd>
          ${lawData.enforceDate ? `
          <dt>施行日</dt>
          <dd>${lawData.enforceDate.toLocaleDateString('ja-JP')}</dd>
          ` : ''}
        </dl>
      </div>
      
      <div class="articles">
        ${lawData.articles.map(article => this.renderArticle(article, referenceMap.get(article.articleNum) || [])).join('\n')}
      </div>
    </article>
  </main>
  
  <footer>
    <p>&copy; 2025 LawFinder. データソース: 日本政府法令データ</p>
  </footer>
  
  <script src="../assets/app.js"></script>
</body>
</html>`;
  }

  renderArticle(article, references) {
    const processedContent = this.processReferences(article, references);
    
    return `
    <section class="article" id="art${article.articleNum}">
      <h2>第${article.articleNum}条${article.articleTitle ? ` （${this.escapeHtml(article.articleTitle)}）` : ''}</h2>
      ${processedContent}
    </section>`;
  }

  processReferences(article, references) {
    let content = '';
    
    for (let i = 0; i < article.paragraphs.length; i++) {
      const para = article.paragraphs[i];
      let paraText = para.content;
      
      // 参照リンクの挿入
      for (const ref of references) {
        if (ref.targetUrl) {
          paraText = paraText.replace(
            ref.pattern.text,
            `<a href="${ref.targetUrl}" class="reference">${ref.pattern.text}</a>`
          );
        }
      }
      
      content += `<p class="paragraph">${this.escapeHtml(paraText)}</p>\n`;
      
      if (para.items && para.items.length > 0) {
        content += '<ol class="items">\n';
        for (const item of para.items) {
          content += `<li>${this.escapeHtml(item)}</li>\n`;
        }
        content += '</ol>\n';
      }
    }
    
    return content;
  }

  async generateIndexFiles(laws) {
    // メインインデックスページ
    const indexHTML = this.renderIndexHTML(laws);
    await fs.writeFile(path.join(OUTPUT_PATH, 'index.html'), indexHTML, 'utf-8');
    
    // 検索インデックスの生成（分割）
    const chunks = this.splitIntoChunks(laws, 20);
    for (let i = 0; i < chunks.length; i++) {
      const searchIndex = chunks[i].map(law => ({
        id: law.lawId,
        title: law.lawTitle,
        type: law.lawType
      }));
      
      await fs.writeFile(
        path.join(OUTPUT_PATH, 'search', `index-${i}.json`),
        JSON.stringify(searchIndex),
        'utf-8'
      );
    }
    
    // 検索メタデータ
    await fs.writeFile(
      path.join(OUTPUT_PATH, 'search', 'metadata.json'),
      JSON.stringify({ totalChunks: chunks.length, totalLaws: laws.length }),
      'utf-8'
    );
  }

  renderIndexHTML(laws) {
    const lawsByType = this.groupByType(laws);
    
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawFinder - 日本法令検索</title>
  <link rel="stylesheet" href="assets/style.css">
  <link rel="manifest" href="manifest.json">
</head>
<body>
  <header>
    <h1>LawFinder</h1>
    <p>日本の法令を簡単に検索・閲覧</p>
  </header>
  
  <main>
    <section class="search-section">
      <h2>法令検索</h2>
      <input type="text" id="search-input" placeholder="法令名または法令IDで検索...">
      <div id="search-results"></div>
    </section>
    
    <section class="law-categories">
      <h2>法令種別</h2>
      ${Object.entries(lawsByType).map(([type, typeLaws]) => `
        <details>
          <summary>${type} (${typeLaws.length}件)</summary>
          <ul>
            ${typeLaws.slice(0, 10).map(law => `
              <li><a href="laws/${law.lawId}.html">${this.escapeHtml(law.lawTitle)}</a></li>
            `).join('')}
            ${typeLaws.length > 10 ? `<li><a href="search.html?type=${type}">もっと見る...</a></li>` : ''}
          </ul>
        </details>
      `).join('')}
    </section>
  </main>
  
  <footer>
    <p>&copy; 2025 LawFinder. データソース: 日本政府法令データ</p>
  </footer>
  
  <script src="assets/app.js"></script>
</body>
</html>`;
  }

  groupByType(laws) {
    const groups = {};
    for (const law of laws) {
      if (!groups[law.lawType]) {
        groups[law.lawType] = [];
      }
      groups[law.lawType].push(law);
    }
    return groups;
  }

  splitIntoChunks(array, chunkSize) {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  async copyAssets() {
    // CSS
    const css = this.generateCSS();
    await fs.writeFile(path.join(OUTPUT_PATH, 'assets', 'style.css'), css, 'utf-8');
    
    // JavaScript
    const js = this.generateJS();
    await fs.writeFile(path.join(OUTPUT_PATH, 'assets', 'app.js'), js, 'utf-8');
    
    // マニフェスト
    const manifest = this.generateManifest();
    await fs.writeFile(path.join(OUTPUT_PATH, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
    
    // Service Worker
    const sw = this.generateServiceWorker();
    await fs.writeFile(path.join(OUTPUT_PATH, 'sw.js'), sw, 'utf-8');
  }

  generateCSS() {
    return `
/* リセット */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 基本スタイル */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
}

header {
  background-color: #2c3e50;
  color: white;
  padding: 1rem;
  text-align: center;
}

header nav {
  margin-top: 1rem;
}

header nav a {
  color: white;
  text-decoration: none;
  padding: 0.5rem 1rem;
  margin: 0 0.5rem;
  border-radius: 4px;
  transition: background-color 0.3s;
}

header nav a:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

main {
  max-width: 1200px;
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
  color: #2c3e50;
  margin-bottom: 1rem;
  font-size: 2rem;
}

.law-metadata {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 2rem;
}

.law-metadata dl {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 0.5rem;
}

.law-metadata dt {
  font-weight: bold;
  color: #666;
}

.article {
  margin: 2rem 0;
  padding: 1.5rem;
  border-left: 4px solid #3498db;
  background: #f8f9fa;
}

.article h2 {
  color: #2c3e50;
  margin-bottom: 1rem;
  font-size: 1.5rem;
}

.paragraph {
  margin: 1rem 0;
  line-height: 1.8;
}

.items {
  margin: 1rem 0 1rem 2rem;
  list-style-type: decimal;
}

.items li {
  margin: 0.5rem 0;
}

.reference {
  color: #3498db;
  text-decoration: none;
  border-bottom: 1px dashed #3498db;
  transition: color 0.3s;
}

.reference:hover {
  color: #2980b9;
}

/* 検索 */
#search-input {
  width: 100%;
  padding: 1rem;
  font-size: 1.1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 1rem;
}

#search-results {
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.search-result {
  padding: 1rem;
  border-bottom: 1px solid #eee;
  transition: background-color 0.3s;
}

.search-result:hover {
  background-color: #f8f9fa;
}

.search-result a {
  color: #2c3e50;
  text-decoration: none;
  font-weight: 500;
}

.search-result .type {
  color: #666;
  font-size: 0.9rem;
}

/* カテゴリ */
.law-categories details {
  background: white;
  margin: 1rem 0;
  padding: 1rem;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.law-categories summary {
  cursor: pointer;
  font-weight: bold;
  color: #2c3e50;
  padding: 0.5rem;
}

.law-categories ul {
  list-style: none;
  margin-top: 1rem;
}

.law-categories li {
  padding: 0.5rem;
  border-bottom: 1px solid #eee;
}

.law-categories a {
  color: #3498db;
  text-decoration: none;
}

.law-categories a:hover {
  text-decoration: underline;
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
  .law {
    padding: 1rem;
  }
  
  .article {
    padding: 1rem;
  }
  
  .law-metadata dl {
    grid-template-columns: 80px 1fr;
  }
}`;
  }

  generateJS() {
    return `
// Service Worker登録
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').then(registration => {
    console.log('Service Worker registered:', registration);
  }).catch(error => {
    console.error('Service Worker registration failed:', error);
  });
}

// 検索機能
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');
let searchIndex = null;

// 検索インデックスの読み込み
async function loadSearchIndex() {
  if (searchIndex) return searchIndex;
  
  try {
    const metadata = await fetch('/search/metadata.json').then(r => r.json());
    const index = [];
    
    for (let i = 0; i < metadata.totalChunks; i++) {
      const chunk = await fetch(\`/search/index-\${i}.json\`).then(r => r.json());
      index.push(...chunk);
    }
    
    searchIndex = index;
    return index;
  } catch (error) {
    console.error('Failed to load search index:', error);
    return [];
  }
}

// 検索実行
async function performSearch(query) {
  if (!query) {
    searchResults.innerHTML = '';
    return;
  }
  
  const index = await loadSearchIndex();
  const results = index.filter(law => 
    law.title.toLowerCase().includes(query.toLowerCase()) ||
    law.id.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 20);
  
  displayResults(results);
}

// 検索結果表示
function displayResults(results) {
  if (results.length === 0) {
    searchResults.innerHTML = '<p class="no-results">検索結果が見つかりませんでした</p>';
    return;
  }
  
  searchResults.innerHTML = results.map(result => \`
    <div class="search-result">
      <a href="/laws/\${result.id}.html">\${escapeHtml(result.title)}</a>
      <div class="type">\${result.type}</div>
    </div>
  \`).join('');
}

// デバウンス検索
let searchTimeout;
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      performSearch(e.target.value);
    }, 300);
  });
}

// スムーズスクロール
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// HTMLエスケープ
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}`;
  }

  generateManifest() {
    return {
      name: 'LawFinder',
      short_name: 'LawFinder',
      description: '日本の法令を簡単に検索・閲覧',
      start_url: '/',
      display: 'standalone',
      background_color: '#f5f5f5',
      theme_color: '#2c3e50',
      icons: [
        {
          src: '/assets/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/assets/icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    };
  }

  generateServiceWorker() {
    return `
const CACHE_NAME = 'lawfinder-v1';
const urlsToCache = [
  '/',
  '/assets/style.css',
  '/assets/app.js',
  '/search/metadata.json'
];

// インストール
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

// フェッチ
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});

// アクティベート
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          return caches.delete(cacheName);
        })
      );
    })
  );
});`;
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
  const generator = new StaticSiteGenerator();
  generator.generate().catch(console.error);
}