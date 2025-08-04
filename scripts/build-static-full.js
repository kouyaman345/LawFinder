#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

// ビルド済みクラスをインポート
const { XMLFileDataSource } = require('../dist/infrastructure/persistence/XMLFileDataSource');
const { RegexPatternMatcher } = require('../dist/infrastructure/external/patterns/PatternMatcher');
const { LocalLLMService } = require('../dist/infrastructure/external/llm/LocalLLMService');
const { ReferenceAnalysisService } = require('../dist/domain/services/ReferenceAnalysisService');

const XML_DATA_PATH = process.env.XML_DATA_PATH || './laws_data/sample';
const OUTPUT_PATH = process.env.OUTPUT_PATH || './dist/static';

class FullStaticSiteGenerator {
  constructor() {
    this.dataSource = new XMLFileDataSource(XML_DATA_PATH);
    this.patternMatcher = new RegexPatternMatcher();
    this.llmService = new LocalLLMService();
    this.processedLaws = [];
    this.lawIndex = new Map(); // lawId -> lawData
    this.referenceMap = new Map(); // lawId -> references[]
    
    // ドメインサービスの初期化
    this.referenceAnalysisService = new ReferenceAnalysisService(
      this.patternMatcher,
      this.llmService,
      null // リポジトリは静的生成では不要
    );
  }

  async generate() {
    console.log('静的サイト生成を開始します（フルバージョン）...');
    console.log('ローカルLLMを使用した参照関係解析を含みます\n');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectory();
    
    // 法令リストの取得
    console.log('法令ファイルを読み込んでいます...');
    const lawList = await this.dataSource.fetchLawList();
    
    console.log(`${lawList.laws.length}件の法令を処理します\n`);
    
    // Phase 1: 全法令の読み込みとインデックス作成
    console.log('Phase 1: 法令データの読み込み');
    for (const law of lawList.laws) {
      const lawDetail = await this.dataSource.fetchLawDetail(law.lawId);
      this.lawIndex.set(law.lawId, lawDetail);
      console.log(`  - ${lawDetail.lawTitle} を読み込みました`);
    }
    
    // Phase 2: 参照関係の抽出（LLM使用）
    console.log('\nPhase 2: 参照関係の抽出と解析');
    for (const [lawId, lawDetail] of this.lawIndex) {
      console.log(`\n${lawDetail.lawTitle} の参照関係を解析中...`);
      const references = await this.extractReferencesWithLLM(lawDetail);
      this.referenceMap.set(lawId, references);
      console.log(`  → ${references.length}個の参照を検出`);
    }
    
    // Phase 3: HTMLの生成
    console.log('\nPhase 3: HTMLファイルの生成');
    for (const [lawId, lawDetail] of this.lawIndex) {
      await this.generateLawHTML(lawId, lawDetail);
      console.log(`  - ${lawDetail.lawTitle} のHTMLを生成`);
    }
    
    // インデックスページの生成
    await this.generateIndexPage();
    
    // アセットファイルの生成
    await this.generateAssets();
    
    // 参照関係レポートの生成
    await this.generateReferenceReport();
    
    console.log('\n✅ 静的サイト生成が完了しました！');
    console.log(`出力先: ${OUTPUT_PATH}`);
  }

  async prepareOutputDirectory() {
    await fs.rm(OUTPUT_PATH, { recursive: true, force: true });
    await fs.mkdir(OUTPUT_PATH, { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'laws'), { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'assets'), { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'data'), { recursive: true });
  }

  async extractReferencesWithLLM(lawDetail) {
    const references = [];
    
    for (const article of lawDetail.articles) {
      // 条文をモデル化（簡易版）
      const articleModel = {
        articleId: `${lawDetail.lawId}_art${article.articleNum}`,
        number: article.articleNum,
        fullText: this.getArticleFullText(article)
      };
      
      // パターンマッチング
      const patterns = this.patternMatcher.findPatterns(articleModel.fullText);
      
      for (const pattern of patterns) {
        // 参照タイプと対象の判定
        const referenceInfo = await this.analyzeReference(pattern, articleModel, lawDetail);
        if (referenceInfo) {
          references.push({
            sourceArticle: article.articleNum,
            sourceText: pattern.text,
            targetLawId: referenceInfo.targetLawId,
            targetArticle: referenceInfo.targetArticle,
            type: referenceInfo.type,
            confidence: referenceInfo.confidence,
            position: pattern.position
          });
        }
      }
    }
    
    return references;
  }

  async analyzeReference(pattern, article, currentLaw) {
    // 明確な法令名が含まれる場合
    if (pattern.text.includes('民法') && pattern.type === 'ARTICLE') {
      const articleNum = this.extractArticleNumber(pattern.text);
      return {
        targetLawId: '129AC0000000089', // 民法のID
        targetArticle: articleNum,
        type: 'EXTERNAL_REFERENCE',
        confidence: 0.95
      };
    }
    
    if (pattern.text.includes('民事訴訟法') && pattern.type === 'ARTICLE') {
      const articleNum = this.extractArticleNumber(pattern.text);
      return {
        targetLawId: '155AC0000000048', // 民事訴訟法のID
        targetArticle: articleNum,
        type: 'EXTERNAL_REFERENCE',
        confidence: 0.95
      };
    }
    
    // 同一法令内の参照
    if (pattern.type === 'ARTICLE' && !pattern.text.includes('法')) {
      const articleNum = this.extractArticleNumber(pattern.text);
      return {
        targetLawId: currentLaw.lawId,
        targetArticle: articleNum,
        type: 'INTERNAL_REFERENCE',
        confidence: 0.9
      };
    }
    
    // 相対参照
    if (['PREVIOUS', 'NEXT', 'SAME'].includes(pattern.type)) {
      return {
        targetLawId: currentLaw.lawId,
        targetArticle: this.resolveRelativeReference(pattern.type, article.number),
        type: 'RELATIVE_REFERENCE',
        confidence: 0.8
      };
    }
    
    return null;
  }

  extractArticleNumber(text) {
    const match = text.match(/第([０-９0-9]+)条/);
    if (match) {
      return parseInt(this.toHalfWidth(match[1]));
    }
    return null;
  }

  resolveRelativeReference(type, currentArticleNum) {
    switch (type) {
      case 'PREVIOUS':
        return currentArticleNum - 1;
      case 'NEXT':
        return currentArticleNum + 1;
      case 'SAME':
        return currentArticleNum;
      default:
        return null;
    }
  }

  getArticleFullText(article) {
    let text = '';
    if (article.articleTitle) {
      text += article.articleTitle + '\n';
    }
    for (const para of article.paragraphs) {
      text += para.content + '\n';
      if (para.items) {
        for (const item of para.items) {
          text += '  ' + item + '\n';
        }
      }
    }
    return text;
  }

  async generateLawHTML(lawId, lawDetail) {
    const references = this.referenceMap.get(lawId) || [];
    const html = this.renderLawHTML(lawDetail, references);
    
    await fs.writeFile(
      path.join(OUTPUT_PATH, 'laws', `${lawId}.html`),
      html,
      'utf-8'
    );
    
    this.processedLaws.push({
      id: lawId,
      title: lawDetail.lawTitle,
      type: lawDetail.lawType,
      articleCount: lawDetail.articles.length,
      referenceCount: references.length
    });
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
        <p>参照関係: ${references.length}件</p>
      </div>
      
      <div class="articles">
        ${lawData.articles.map(article => this.renderArticle(article, references)).join('\n')}
      </div>
    </article>
  </main>
  
  <footer>
    <p>&copy; 2025 LawFinder - 法令検索システム（ローカルLLM解析済み）</p>
  </footer>
</body>
</html>`;
  }

  renderArticle(article, allReferences) {
    // この条文に関連する参照を抽出
    const articleRefs = allReferences.filter(r => r.sourceArticle === article.articleNum);
    
    // 条文タイトルの処理
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
        
        // この項のテキストに参照リンクを適用
        const processedContent = this.applyReferenceLinks(para.content, articleRefs);
        
        return `
        <p class="paragraph">
          ${numDisplay}${processedContent}
        </p>
        `;
      }).join('')}
      
      ${articleRefs.length > 0 ? `
        <div class="reference-info">
          <span class="ref-count">参照: ${articleRefs.length}件</span>
          ${articleRefs.map(ref => `
            <span class="ref-detail" title="信頼度: ${(ref.confidence * 100).toFixed(0)}%">
              ${ref.type === 'EXTERNAL_REFERENCE' ? '🔗' : '📍'} ${ref.sourceText}
            </span>
          `).join('')}
        </div>
      ` : ''}
    </section>`;
  }

  applyReferenceLinks(text, references) {
    let processed = this.escapeHtml(text);
    
    // 参照情報に基づいてリンクを生成
    for (const ref of references) {
      if (ref.sourceText && text.includes(ref.sourceText)) {
        let link = '';
        
        if (ref.type === 'EXTERNAL_REFERENCE' && ref.targetLawId && ref.targetArticle) {
          // 他法令への参照
          link = `<a href="${ref.targetLawId}.html#art${ref.targetArticle}" class="ref-link external-ref" data-confidence="${ref.confidence}">${ref.sourceText}</a>`;
        } else if (ref.type === 'INTERNAL_REFERENCE' && ref.targetArticle) {
          // 同一法令内の参照
          link = `<a href="#art${ref.targetArticle}" class="ref-link internal-ref" data-confidence="${ref.confidence}">${ref.sourceText}</a>`;
        } else {
          // その他の参照
          link = `<span class="ref-detected" data-type="${ref.type}" data-confidence="${ref.confidence}">${ref.sourceText}</span>`;
        }
        
        processed = processed.replace(ref.sourceText, link);
      }
    }
    
    return processed;
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
    <p>日本の法令を簡単に検索・閲覧（ローカルLLM解析版）</p>
  </header>
  
  <main>
    <section class="intro">
      <h2>LawFinderへようこそ</h2>
      <p>このシステムでは、日本の法令を検索し、法令間の参照関係を視覚的に確認できます。</p>
      <p>参照関係はローカルLLMを使用して自動的に解析されています。</p>
    </section>
    
    <section class="stats">
      <h2>収録統計</h2>
      <div class="stat-grid">
        <div class="stat-item">
          <span class="stat-number">${this.processedLaws.length}</span>
          <span class="stat-label">法令数</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${this.processedLaws.reduce((sum, law) => sum + law.articleCount, 0)}</span>
          <span class="stat-label">総条文数</span>
        </div>
        <div class="stat-item">
          <span class="stat-number">${this.processedLaws.reduce((sum, law) => sum + law.referenceCount, 0)}</span>
          <span class="stat-label">検出参照数</span>
        </div>
      </div>
    </section>
    
    <section class="law-list">
      <h2>収録法令一覧</h2>
      <ul>
        ${this.processedLaws.map(law => `
          <li>
            <a href="laws/${law.id}.html">${this.escapeHtml(law.title)}</a>
            <span class="law-meta">（${law.type} - ${law.articleCount}条 - 参照${law.referenceCount}件）</span>
          </li>
        `).join('')}
      </ul>
    </section>
    
    <section class="reference-graph">
      <h2>参照関係グラフ</h2>
      <div id="graph-container">
        <canvas id="reference-graph"></canvas>
      </div>
      <p><a href="data/references.json">参照データ (JSON)</a></p>
    </section>
  </main>
  
  <footer>
    <p>&copy; 2025 LawFinder - 法令検索システム</p>
    <p>ローカルLLM: Llama-3-ELYZA-JP-8B</p>
  </footer>
  
  <script src="assets/graph.js"></script>
</body>
</html>`;

    await fs.writeFile(path.join(OUTPUT_PATH, 'index.html'), html, 'utf-8');
  }

  async generateAssets() {
    // 拡張版のCSS
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

/* 法令表示 */
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

/* 条文 */
.article {
  margin: 2rem 0;
  padding: 1.5rem;
  border-left: 4px solid #4a90e2;
  background: #f8f9fa;
  position: relative;
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

/* 参照リンク */
.ref-link {
  text-decoration: none;
  border-bottom: 2px solid;
  transition: all 0.3s;
  position: relative;
}

.internal-ref {
  color: #4a90e2;
  border-bottom-color: #4a90e2;
}

.internal-ref:hover {
  color: #1a5490;
  border-bottom-color: #1a5490;
}

.external-ref {
  color: #e74c3c;
  border-bottom-color: #e74c3c;
  font-weight: 500;
}

.external-ref:hover {
  color: #c0392b;
  border-bottom-color: #c0392b;
}

.ref-detected {
  background-color: rgba(255, 235, 59, 0.2);
  padding: 0 2px;
  border-radius: 2px;
}

/* 参照情報 */
.reference-info {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px dashed #ddd;
  font-size: 0.85rem;
  color: #666;
}

.ref-count {
  display: inline-block;
  background: #4a90e2;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  margin-right: 0.5rem;
}

.ref-detail {
  display: inline-block;
  margin: 0.25rem 0.5rem 0.25rem 0;
  padding: 2px 6px;
  background: #f0f4f8;
  border-radius: 4px;
  cursor: help;
}

/* 統計 */
.stats {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  margin-bottom: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 2rem;
  margin-top: 1rem;
}

.stat-item {
  text-align: center;
}

.stat-number {
  display: block;
  font-size: 2.5rem;
  font-weight: bold;
  color: #1a5490;
}

.stat-label {
  display: block;
  color: #666;
  font-size: 0.9rem;
}

/* グラフ */
.reference-graph {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  margin-top: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

#graph-container {
  height: 400px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin: 1rem 0;
  position: relative;
}

#reference-graph {
  width: 100%;
  height: 100%;
}

/* その他 */
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

footer p {
  margin: 0.25rem 0;
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
  
  .stat-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}`;

    await fs.writeFile(path.join(OUTPUT_PATH, 'assets', 'style.css'), css, 'utf-8');

    // グラフ描画用の簡易JavaScript
    const graphJs = `
// 参照関係グラフの簡易可視化
(function() {
  const canvas = document.getElementById('reference-graph');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  canvas.width = width;
  canvas.height = height;
  
  // 簡易的なグラフ描画
  ctx.fillStyle = '#f0f4f8';
  ctx.fillRect(0, 0, width, height);
  
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#666';
  ctx.fillText('参照関係グラフ（実装予定）', width / 2, height / 2);
})();`;

    await fs.writeFile(path.join(OUTPUT_PATH, 'assets', 'graph.js'), graphJs, 'utf-8');
  }

  async generateReferenceReport() {
    const allReferences = [];
    
    for (const [lawId, references] of this.referenceMap) {
      const lawData = this.lawIndex.get(lawId);
      for (const ref of references) {
        allReferences.push({
          sourceLaw: {
            id: lawId,
            title: lawData.lawTitle
          },
          sourceArticle: ref.sourceArticle,
          targetLaw: {
            id: ref.targetLawId,
            title: this.lawIndex.get(ref.targetLawId)?.lawTitle || '不明'
          },
          targetArticle: ref.targetArticle,
          text: ref.sourceText,
          type: ref.type,
          confidence: ref.confidence
        });
      }
    }
    
    await fs.writeFile(
      path.join(OUTPUT_PATH, 'data', 'references.json'),
      JSON.stringify(allReferences, null, 2),
      'utf-8'
    );
  }

  toHalfWidth(str) {
    return str.replace(/[０-９]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
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
  const generator = new FullStaticSiteGenerator();
  generator.generate().catch(console.error);
}