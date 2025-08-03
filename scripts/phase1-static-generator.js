#!/usr/bin/env node

/**
 * Phase 1: 静的サイト生成スクリプト
 * 法令XMLファイルから静的HTMLを生成し、相互リンクを作成
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

class StaticLawSiteGenerator {
  constructor(config = {}) {
    this.config = {
      inputDir: config.inputDir || './laws_data',
      outputDir: config.outputDir || './dist',
      templateDir: config.templateDir || './templates',
      ...config
    };
    
    this.parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true
    });
    
    // 参照パターン定義
    this.referencePatterns = [
      {
        name: 'article_reference',
        pattern: /第([一二三四五六七八九十百千]+|[0-9]+)条/g,
        type: 'article'
      },
      {
        name: 'law_reference',
        pattern: /([\u4e00-\u9fa5]+法)(?:律)?(?:第([一二三四五六七八九十百千]+|[0-9]+)号)?/g,
        type: 'law'
      },
      {
        name: 'apply_reference',
        pattern: /第([一二三四五六七八九十百千]+|[0-9]+)条(?:.*の規定)?.*準用/g,
        type: 'apply'
      }
    ];
    
    // 法令インデックス（メモリ内キャッシュ）
    this.lawIndex = new Map();
    this.referenceMap = new Map();
  }
  
  async generate() {
    console.log('📚 Phase 1: 静的法令サイト生成を開始します...');
    
    try {
      // 1. 出力ディレクトリの準備
      await this.prepareOutputDirectory();
      
      // 2. 全法令XMLファイルを読み込み
      console.log('📖 法令データを読み込んでいます...');
      const laws = await this.loadAllLaws();
      console.log(`✅ ${laws.length}件の法令を読み込みました`);
      
      // 3. 参照関係を抽出
      console.log('🔍 参照関係を抽出しています...');
      await this.extractReferences(laws);
      
      // 4. 静的HTMLを生成
      console.log('🏗️ HTMLファイルを生成しています...');
      await this.generateHTMLFiles(laws);
      
      // 5. インデックスページを生成
      await this.generateIndexPage(laws);
      
      // 6. 検索用インデックスを生成
      await this.generateSearchIndex(laws);
      
      // 7. 静的アセットをコピー
      await this.copyStaticAssets();
      
      console.log('✨ 生成が完了しました！');
      console.log(`📁 出力先: ${this.config.outputDir}`);
      
    } catch (error) {
      console.error('❌ エラーが発生しました:', error);
      process.exit(1);
    }
  }
  
  async prepareOutputDirectory() {
    await fs.mkdir(this.config.outputDir, { recursive: true });
    await fs.mkdir(path.join(this.config.outputDir, 'laws'), { recursive: true });
    await fs.mkdir(path.join(this.config.outputDir, 'assets'), { recursive: true });
  }
  
  async loadAllLaws() {
    const laws = [];
    const dirs = await fs.readdir(this.config.inputDir);
    
    for (const dir of dirs) {
      const dirPath = path.join(this.config.inputDir, dir);
      const stat = await fs.stat(dirPath);
      
      if (stat.isDirectory() && dir !== 'all_law_list.csv') {
        const xmlFiles = await fs.readdir(dirPath);
        const xmlFile = xmlFiles.find(f => f.endsWith('.xml'));
        
        if (xmlFile) {
          const xmlPath = path.join(dirPath, xmlFile);
          const lawData = await this.parseLawXML(xmlPath);
          if (lawData) {
            lawData.id = dir.split('_')[0];
            laws.push(lawData);
            this.lawIndex.set(lawData.id, lawData);
          }
        }
      }
    }
    
    return laws;
  }
  
  async parseLawXML(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const result = await this.parser.parseStringPromise(content);
      
      const law = result.Law;
      const lawBody = law.LawBody;
      const lawTitle = lawBody.LawTitle;
      
      return {
        filePath,
        era: law.Era,
        year: law.Year,
        num: law.Num,
        lawType: law.LawType,
        promulgateMonth: law.PromulgateMonth,
        promulgateDay: law.PromulgateDay,
        lawNum: law.LawNum?._text || law.LawNum,
        title: lawTitle?._text || lawTitle || '',
        titleKana: lawTitle?.Kana || '',
        body: lawBody,
        articles: this.extractArticles(lawBody)
      };
    } catch (error) {
      console.warn(`⚠️ XMLパースエラー: ${filePath}`, error.message);
      return null;
    }
  }
  
  extractArticles(lawBody) {
    const articles = [];
    
    // MainProvision内の条文を抽出
    const mainProvision = lawBody.MainProvision;
    if (mainProvision) {
      this.extractArticlesFromElement(mainProvision, articles);
    }
    
    // Chapter内の条文を抽出
    const chapters = Array.isArray(lawBody.Chapter) ? lawBody.Chapter : [lawBody.Chapter].filter(Boolean);
    for (const chapter of chapters) {
      this.extractArticlesFromElement(chapter, articles);
    }
    
    return articles;
  }
  
  extractArticlesFromElement(element, articles) {
    if (!element) return;
    
    // Article要素を探す
    const articleElements = Array.isArray(element.Article) ? element.Article : [element.Article].filter(Boolean);
    
    for (const article of articleElements) {
      articles.push({
        num: article.Num,
        title: article.ArticleTitle,
        content: this.extractTextContent(article)
      });
    }
    
    // Paragraph要素（条番号なし）も処理
    const paragraphs = Array.isArray(element.Paragraph) ? element.Paragraph : [element.Paragraph].filter(Boolean);
    if (paragraphs.length > 0 && articles.length === 0) {
      articles.push({
        num: '0',
        title: '本則',
        content: this.extractTextContent(element)
      });
    }
  }
  
  extractTextContent(element) {
    // 再帰的にテキストを抽出
    if (typeof element === 'string') return element;
    if (!element) return '';
    
    let text = '';
    
    // Sentence要素のテキストを取得
    if (element.Sentence) {
      const sentences = Array.isArray(element.Sentence) ? element.Sentence : [element.Sentence];
      text += sentences.map(s => s._text || s).join('');
    }
    
    // 子要素を再帰的に処理
    for (const key of Object.keys(element)) {
      if (key !== '_text' && key !== '$' && typeof element[key] === 'object') {
        text += this.extractTextContent(element[key]);
      }
    }
    
    return text;
  }
  
  async extractReferences(laws) {
    for (const law of laws) {
      const references = [];
      
      // 各条文から参照を抽出
      for (const article of law.articles) {
        const articleRefs = this.extractReferencesFromText(article.content, law.id);
        references.push(...articleRefs);
      }
      
      this.referenceMap.set(law.id, references);
    }
  }
  
  extractReferencesFromText(text, currentLawId) {
    const references = [];
    
    for (const patternDef of this.referencePatterns) {
      const matches = [...text.matchAll(patternDef.pattern)];
      
      for (const match of matches) {
        references.push({
          type: patternDef.type,
          text: match[0],
          position: match.index,
          sourceLawId: currentLawId
        });
      }
    }
    
    return references;
  }
  
  async generateHTMLFiles(laws) {
    const template = await this.loadTemplate('law.html');
    
    for (const law of laws) {
      const references = this.referenceMap.get(law.id) || [];
      const html = this.renderLawHTML(law, references, template);
      
      const outputPath = path.join(this.config.outputDir, 'laws', `${law.id}.html`);
      await fs.writeFile(outputPath, html, 'utf-8');
    }
  }
  
  renderLawHTML(law, references, template) {
    // シンプルなテンプレートエンジン
    let html = template;
    
    // 基本情報の置換
    html = html.replace('{{title}}', this.escapeHtml(law.title));
    html = html.replace('{{lawNum}}', this.escapeHtml(law.lawNum));
    html = html.replace('{{lawId}}', law.id);
    
    // 条文のレンダリング
    const articlesHtml = law.articles.map(article => {
      let content = this.escapeHtml(article.content);
      
      // 参照をリンクに変換
      content = this.convertReferencesToLinks(content, references);
      
      return `
        <article class="law-article" id="article-${article.num}">
          <h3 class="article-title">第${article.num}条</h3>
          <div class="article-content">${content}</div>
        </article>
      `;
    }).join('\n');
    
    html = html.replace('{{articles}}', articlesHtml);
    
    // 参照関係の表示
    const referencesHtml = this.renderReferences(references);
    html = html.replace('{{references}}', referencesHtml);
    
    return html;
  }
  
  convertReferencesToLinks(content, references) {
    // テキスト内の参照をリンクに変換
    let result = content;
    
    // 位置でソート（後ろから処理）
    const sortedRefs = [...references].sort((a, b) => b.position - a.position);
    
    for (const ref of sortedRefs) {
      if (ref.type === 'article' && content.includes(ref.text)) {
        const link = `<a href="#article-${ref.text.match(/\d+/)[0]}" class="ref-link ref-article">${ref.text}</a>`;
        result = result.replace(ref.text, link);
      }
    }
    
    return result;
  }
  
  renderReferences(references) {
    if (references.length === 0) return '<p>参照なし</p>';
    
    const refsByType = {
      article: [],
      law: [],
      apply: []
    };
    
    references.forEach(ref => {
      refsByType[ref.type].push(ref);
    });
    
    return `
      <div class="references-section">
        ${refsByType.article.length > 0 ? `
          <h4>条文参照</h4>
          <ul>${refsByType.article.map(r => `<li>${r.text}</li>`).join('')}</ul>
        ` : ''}
        ${refsByType.law.length > 0 ? `
          <h4>他法令参照</h4>
          <ul>${refsByType.law.map(r => `<li>${r.text}</li>`).join('')}</ul>
        ` : ''}
        ${refsByType.apply.length > 0 ? `
          <h4>準用規定</h4>
          <ul>${refsByType.apply.map(r => `<li>${r.text}</li>`).join('')}</ul>
        ` : ''}
      </div>
    `;
  }
  
  async generateIndexPage(laws) {
    const template = await this.loadTemplate('index.html');
    
    // 法令を種別ごとにグループ化
    const lawsByType = {};
    laws.forEach(law => {
      const type = law.lawType || 'Other';
      if (!lawsByType[type]) lawsByType[type] = [];
      lawsByType[type].push(law);
    });
    
    // 法令リストのHTML生成
    const lawListHtml = Object.entries(lawsByType).map(([type, laws]) => `
      <section class="law-type-section">
        <h2>${this.getLawTypeLabel(type)}</h2>
        <ul class="law-list">
          ${laws.map(law => `
            <li>
              <a href="laws/${law.id}.html">
                <span class="law-num">${law.lawNum}</span>
                <span class="law-title">${law.title}</span>
              </a>
            </li>
          `).join('')}
        </ul>
      </section>
    `).join('');
    
    let html = template;
    html = html.replace('{{lawCount}}', laws.length);
    html = html.replace('{{lawList}}', lawListHtml);
    
    const outputPath = path.join(this.config.outputDir, 'index.html');
    await fs.writeFile(outputPath, html, 'utf-8');
  }
  
  async generateSearchIndex(laws) {
    // 検索用のJSONインデックスを生成
    const searchIndex = laws.map(law => ({
      id: law.id,
      title: law.title,
      lawNum: law.lawNum,
      content: law.articles.map(a => a.content).join(' ')
    }));
    
    const outputPath = path.join(this.config.outputDir, 'assets', 'search-index.json');
    await fs.writeFile(outputPath, JSON.stringify(searchIndex), 'utf-8');
  }
  
  async loadTemplate(filename) {
    const templatePath = path.join(this.config.templateDir, filename);
    
    // デフォルトテンプレートがない場合は簡易版を返す
    try {
      return await fs.readFile(templatePath, 'utf-8');
    } catch (error) {
      return this.getDefaultTemplate(filename);
    }
  }
  
  getDefaultTemplate(filename) {
    if (filename === 'law.html') {
      return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{title}} - LawFinder</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
  <header>
    <nav>
      <a href="../index.html">← 法令一覧に戻る</a>
    </nav>
  </header>
  
  <main>
    <h1>{{title}}</h1>
    <p class="law-num">{{lawNum}}</p>
    
    <div class="law-content">
      {{articles}}
    </div>
    
    <aside class="references-sidebar">
      <h3>参照関係</h3>
      {{references}}
    </aside>
  </main>
  
  <script src="../assets/law.js"></script>
</body>
</html>`;
    } else if (filename === 'index.html') {
      return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawFinder - 法令検索・参照システム</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header>
    <h1>LawFinder</h1>
    <p>法令間の参照関係を可視化する静的サイト</p>
  </header>
  
  <main>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="法令を検索...">
    </div>
    
    <p class="law-count">収録法令数: {{lawCount}}件</p>
    
    {{lawList}}
  </main>
  
  <script src="assets/search.js"></script>
</body>
</html>`;
    }
    
    return '';
  }
  
  async copyStaticAssets() {
    // CSSファイルを生成
    const cssContent = this.getDefaultCSS();
    await fs.writeFile(path.join(this.config.outputDir, 'assets', 'style.css'), cssContent, 'utf-8');
    
    // JavaScriptファイルを生成
    const jsContent = this.getDefaultJS();
    await fs.writeFile(path.join(this.config.outputDir, 'assets', 'law.js'), jsContent, 'utf-8');
    await fs.writeFile(path.join(this.config.outputDir, 'assets', 'search.js'), this.getSearchJS(), 'utf-8');
  }
  
  getDefaultCSS() {
    return `
/* リセット */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 基本スタイル */
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
}

header {
  background-color: #1a365d;
  color: white;
  padding: 1rem;
}

header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

main {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 2rem;
}

/* 法令コンテンツ */
.law-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.law-article {
  margin-bottom: 2rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid #e2e8f0;
}

.article-title {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  color: #1a365d;
}

.article-content {
  line-height: 1.8;
}

/* 参照リンク */
.ref-link {
  color: #2563eb;
  text-decoration: none;
  border-bottom: 1px dotted #2563eb;
}

.ref-link:hover {
  color: #1d4ed8;
  border-bottom-style: solid;
}

/* サイドバー */
.references-sidebar {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  height: fit-content;
  position: sticky;
  top: 2rem;
}

/* 検索ボックス */
.search-box {
  margin-bottom: 2rem;
}

#search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  font-size: 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
}

/* 法令リスト */
.law-list {
  list-style: none;
}

.law-list li {
  background: white;
  margin-bottom: 0.5rem;
  border-radius: 4px;
  overflow: hidden;
}

.law-list a {
  display: flex;
  padding: 1rem;
  text-decoration: none;
  color: inherit;
  transition: background-color 0.2s;
}

.law-list a:hover {
  background-color: #f0f4f8;
}

.law-num {
  color: #64748b;
  margin-right: 1rem;
  flex-shrink: 0;
}

.law-title {
  color: #1e293b;
}

/* レスポンシブ */
@media (max-width: 768px) {
  main {
    grid-template-columns: 1fr;
  }
  
  .references-sidebar {
    position: static;
  }
}
`;
  }
  
  getDefaultJS() {
    return `
// スムーズスクロール
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});

// ハイライト機能
function highlightElement(elementId) {
  const element = document.getElementById(elementId);
  if (element) {
    element.classList.add('highlight');
    setTimeout(() => {
      element.classList.remove('highlight');
    }, 2000);
  }
}

// URLハッシュに基づいてハイライト
if (window.location.hash) {
  highlightElement(window.location.hash.substring(1));
}
`;
  }
  
  getSearchJS() {
    return `
// 簡易検索機能
let searchIndex = [];

// 検索インデックスの読み込み
fetch('assets/search-index.json')
  .then(res => res.json())
  .then(data => {
    searchIndex = data;
  });

// 検索処理
const searchInput = document.getElementById('search-input');
if (searchInput) {
  searchInput.addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase();
    
    if (query.length < 2) {
      // クエリが短い場合は全件表示
      showAllLaws();
      return;
    }
    
    const results = searchIndex.filter(law => 
      law.title.toLowerCase().includes(query) ||
      law.lawNum.toLowerCase().includes(query) ||
      law.content.toLowerCase().includes(query)
    );
    
    updateLawList(results);
  });
}

function updateLawList(laws) {
  // 検索結果に基づいて法令リストを更新
  const sections = document.querySelectorAll('.law-type-section');
  
  sections.forEach(section => {
    const lawItems = section.querySelectorAll('.law-list li');
    let hasVisibleItem = false;
    
    lawItems.forEach(item => {
      const link = item.querySelector('a');
      const href = link.getAttribute('href');
      const lawId = href.match(/laws\\/(.+)\\.html/)[1];
      
      if (laws.some(law => law.id === lawId)) {
        item.style.display = '';
        hasVisibleItem = true;
      } else {
        item.style.display = 'none';
      }
    });
    
    // セクション全体の表示/非表示
    section.style.display = hasVisibleItem ? '' : 'none';
  });
}

function showAllLaws() {
  document.querySelectorAll('.law-type-section').forEach(section => {
    section.style.display = '';
  });
  document.querySelectorAll('.law-list li').forEach(item => {
    item.style.display = '';
  });
}
`;
  }
  
  getLawTypeLabel(type) {
    const labels = {
      'Act': '法律',
      'CabinetOrder': '政令',
      'Ordinance': '省令',
      'ImperialOrdinance': '勅令',
      'Rule': '規則',
      'Other': 'その他'
    };
    return labels[type] || type;
  }
  
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// メイン処理
if (require.main === module) {
  const generator = new StaticLawSiteGenerator({
    inputDir: path.join(__dirname, '..', 'laws_data'),
    outputDir: path.join(__dirname, '..', 'dist'),
    templateDir: path.join(__dirname, '..', 'templates')
  });
  
  generator.generate();
}

module.exports = StaticLawSiteGenerator;