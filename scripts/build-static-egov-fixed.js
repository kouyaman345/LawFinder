#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const XML_DATA_PATH = path.join(__dirname, '../laws_data/sample');
const OUTPUT_PATH = path.join(__dirname, '../dist/static');

class EGovStaticSiteGenerator {
  constructor() {
    this.lawIndex = new Map();
    this.referenceMap = new Map();
  }

  async generate() {
    console.log('静的サイト生成を開始します（e-Govスタイル版・修正版）...\n');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectories();
    
    // XMLファイルを読み込んで法令データを抽出
    const files = await fs.readdir(XML_DATA_PATH);
    const xmlFiles = files.filter(f => f.endsWith('.xml')); // すべてのXMLファイルを処理
    console.log(`${xmlFiles.length}件の法令を処理します\n`);

    console.log('Phase 1: 法令データの読み込み');
    for (const file of xmlFiles) {
      const lawData = await this.parseLawXML(file);
      if (lawData) {
        this.lawIndex.set(lawData.lawId, lawData);
        console.log(`  - ${lawData.lawTitle} を読み込みました（${lawData.articles.length}条）`);
      }
    }

    console.log('\nPhase 2: 参照関係の抽出');
    await this.extractAllReferences();
    
    console.log('\nPhase 3: HTMLファイルの生成');
    await this.generateHTMLFiles();
    
    await this.generateIndexPage();
    await this.copyAssets();
    
    console.log('\n✅ 静的サイト生成が完了しました！');
    console.log(`出力先: ${OUTPUT_PATH}`);
  }

  async prepareOutputDirectories() {
    await fs.mkdir(OUTPUT_PATH, { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'laws'), { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'assets'), { recursive: true });
  }

  async parseLawXML(filename) {
    const filePath = path.join(XML_DATA_PATH, filename);
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    
    const lawId = filename.replace('.xml', '');
    const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const lawTitle = titleMatch ? titleMatch[1] : '無題';
    
    // 本則部分を抽出（附則を除外）
    const mainProvisionMatch = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
    const mainContent = mainProvisionMatch ? mainProvisionMatch[1] : xmlContent;
    
    // 階層構造（編・章・節）の抽出
    const structure = this.extractStructure(mainContent);
    
    // 条文の抽出（改善版）
    const articles = this.extractArticlesImproved(mainContent);
    
    return {
      lawId,
      lawTitle,
      articles,
      structure
    };
  }

  extractArticlesImproved(xmlContent) {
    const articles = [];
    let lastIndex = 0;
    
    while (true) {
      // Article開始タグを探す
      const startMatch = xmlContent.indexOf('<Article', lastIndex);
      if (startMatch === -1) break;
      
      // Num属性を取得
      const numMatch = xmlContent.substring(startMatch, startMatch + 100).match(/Num="([^"]+)"/);
      if (!numMatch) {
        lastIndex = startMatch + 1;
        continue;
      }
      
      const articleNum = numMatch[1];
      
      // 対応する終了タグを探す（入れ子を考慮）
      let depth = 0;
      let currentIndex = startMatch;
      let endIndex = -1;
      
      while (currentIndex < xmlContent.length) {
        const nextOpen = xmlContent.indexOf('<Article', currentIndex + 1);
        const nextClose = xmlContent.indexOf('</Article>', currentIndex + 1);
        
        if (nextClose === -1) break;
        
        if (nextOpen !== -1 && nextOpen < nextClose) {
          // 開始タグが先
          depth++;
          currentIndex = nextOpen;
        } else {
          // 終了タグが先
          if (depth === 0) {
            endIndex = nextClose + 10; // </Article>の長さ
            break;
          }
          depth--;
          currentIndex = nextClose;
        }
      }
      
      if (endIndex === -1) break;
      
      // 条文内容を抽出
      const articleContent = xmlContent.substring(startMatch, endIndex);
      
      // ArticleCaptionを抽出
      const captionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleTitle = captionMatch ? captionMatch[1] : null;
      
      // 段落を抽出
      const paragraphs = this.extractParagraphs(articleContent);
      
      articles.push({
        articleNum,
        articleTitle,
        paragraphs
      });
      
      lastIndex = endIndex;
    }
    
    return articles;
  }

  extractStructure(xmlContent) {
    const structure = {
      parts: [],
      chapters: [],
      sections: []
    };
    
    // 編（Part）の抽出
    const partMatches = Array.from(xmlContent.matchAll(/<Part\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Part>/g));
    for (const match of partMatches) {
      const partNum = match[1];
      const partContent = match[2];
      const titleMatch = partContent.match(/<PartTitle>([^<]+)<\/PartTitle>/);
      
      structure.parts.push({
        num: partNum,
        title: titleMatch ? titleMatch[1] : '',
        chapters: []
      });
    }
    
    // 章（Chapter）の抽出
    const chapterMatches = Array.from(xmlContent.matchAll(/<Chapter\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Chapter>/g));
    for (const match of chapterMatches) {
      const chapterNum = match[1];
      const chapterContent = match[2];
      const titleMatch = chapterContent.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
      
      structure.chapters.push({
        num: chapterNum,
        title: titleMatch ? titleMatch[1] : '',
        sections: [],
        articles: []
      });
    }
    
    // 節（Section）の抽出
    const sectionMatches = Array.from(xmlContent.matchAll(/<Section\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Section>/g));
    for (const match of sectionMatches) {
      const sectionNum = match[1];
      const sectionContent = match[2];
      const titleMatch = sectionContent.match(/<SectionTitle>([^<]+)<\/SectionTitle>/);
      
      structure.sections.push({
        num: sectionNum,
        title: titleMatch ? titleMatch[1] : '',
        articles: []
      });
    }
    
    return structure;
  }

  extractParagraphs(articleContent) {
    const paragraphs = [];
    const paragraphMatches = articleContent.matchAll(/<Paragraph[^>]*>([\s\S]*?)<\/Paragraph>/g);
    
    for (const pMatch of paragraphMatches) {
      const paragraphContent = pMatch[1];
      const paragraph = {
        content: '',
        items: []
      };
      
      // 段落本文の抽出
      const sentenceMatch = paragraphContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
      if (sentenceMatch) {
        const sentences = sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
        paragraph.content = Array.from(sentences).map(s => s[1]).join('');
      }
      
      // 号（Item）の抽出
      const itemMatches = paragraphContent.matchAll(/<Item[^>]*>([\s\S]*?)<\/Item>/g);
      for (const itemMatch of itemMatches) {
        const itemContent = itemMatch[1];
        const item = this.extractItem(itemContent);
        paragraph.items.push(item);
      }
      
      paragraphs.push(paragraph);
    }
    
    return paragraphs;
  }

  extractItem(itemContent) {
    const item = {
      title: '',
      content: '',
      subitems: []
    };
    
    const titleMatch = itemContent.match(/<ItemTitle>([^<]+)<\/ItemTitle>/);
    if (titleMatch) {
      item.title = titleMatch[1];
    }
    
    const sentenceMatch = itemContent.match(/<ItemSentence>([\s\S]*?)<\/ItemSentence>/);
    if (sentenceMatch) {
      const sentences = sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
      item.content = Array.from(sentences).map(s => s[1]).join('');
    }
    
    // サブアイテム（イロハ）の抽出
    const subitemMatches = itemContent.matchAll(/<Subitem1[^>]*>([\s\S]*?)<\/Subitem1>/g);
    for (const match of subitemMatches) {
      const subitem = this.extractSubitem(match[1]);
      item.subitems.push(subitem);
    }
    
    return item;
  }

  extractSubitem(subitemContent) {
    const subitem = {
      title: '',
      content: '',
      subsubitems: []
    };
    
    const titleMatch = subitemContent.match(/<Subitem1Title>([^<]+)<\/Subitem1Title>/);
    if (titleMatch) {
      subitem.title = titleMatch[1];
    }
    
    const sentenceMatch = subitemContent.match(/<Subitem1Sentence>([\s\S]*?)<\/Subitem1Sentence>/);
    if (sentenceMatch) {
      const sentences = sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
      subitem.content = Array.from(sentences).map(s => s[1]).join('');
    }
    
    // サブサブアイテム（括弧数字）の抽出
    const subsubitemMatches = subitemContent.matchAll(/<Subitem2[^>]*>([\s\S]*?)<\/Subitem2>/g);
    for (const match of subsubitemMatches) {
      const titleMatch = match[1].match(/<Subitem2Title>([^<]+)<\/Subitem2Title>/);
      const sentenceMatch = match[1].match(/<Subitem2Sentence>([\s\S]*?)<\/Subitem2Sentence>/);
      
      if (titleMatch || sentenceMatch) {
        subitem.subsubitems.push({
          title: titleMatch ? titleMatch[1] : '',
          content: sentenceMatch ? Array.from(sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g)).map(s => s[1]).join('') : ''
        });
      }
    }
    
    return subitem;
  }

  async extractAllReferences() {
    for (const [lawId, lawData] of this.lawIndex) {
      console.log(`\n${lawData.lawTitle} の参照関係を解析中...`);
      const references = [];
      
      for (const article of lawData.articles) {
        const articleRefs = this.extractReferencesFromArticle(article, lawId);
        references.push(...articleRefs);
      }
      
      this.referenceMap.set(lawId, references);
      console.log(`  → ${references.length}個の参照を検出`);
    }
  }

  extractReferencesFromArticle(article, sourceLawId) {
    const references = [];
    const patterns = [
      // 条文＋項の参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条第([０-９0-9一二三四五六七八九十]+)項/g, type: 'INTERNAL_REFERENCE' },
      // 条文のみ
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条(?!第)/g, type: 'INTERNAL_REFERENCE' },
      // 章の参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)章/g, type: 'CHAPTER_REFERENCE' },
      { regex: /前章|次章/g, type: 'RELATIVE_CHAPTER_REFERENCE' },
      // 相対参照
      { regex: /前条|次条/g, type: 'RELATIVE_ARTICLE_REFERENCE' },
      { regex: /前項|次項|同項|同条/g, type: 'RELATIVE_REFERENCE' },
      // 複合参照
      { regex: /同項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'COMPLEX_REFERENCE' },
      { regex: /前項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'COMPLEX_REFERENCE' }
    ];
    
    const processText = (text) => {
      for (const pattern of patterns) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
          references.push({
            sourceArticle: article.articleNum,
            sourceText: match[0],
            targetArticle: match[1] ? this.convertToArabic(match[1]) : null,
            targetParagraph: match[2] ? this.convertToArabic(match[2]) : null,
            type: pattern.type,
            sourceLawId
          });
        }
      }
    };
    
    // 各段落のテキストを処理
    for (const paragraph of article.paragraphs) {
      processText(paragraph.content);
      
      // 号のテキストも処理
      for (const item of paragraph.items) {
        processText(item.content);
        
        // サブアイテムも処理
        for (const subitem of item.subitems) {
          processText(subitem.content);
          
          // サブサブアイテムも処理
          for (const subsubitem of subitem.subsubitems) {
            processText(subsubitem.content);
          }
        }
      }
    }
    
    // 外部法令への参照を検出
    this.extractExternalReferences(article, sourceLawId, references);
    
    return references;
  }

  extractExternalReferences(article, sourceLawId, references) {
    const lawNames = [
      { name: '民法', id: '129AC0000000089' },
      { name: '商法', id: '132AC0000000048' },
      { name: '刑法', id: '140AC0000000045' },
      { name: '民事訴訟法', id: '155AC0000000048' },
      { name: '独占禁止法', id: '222AC0000000067' },
      { name: '労働基準法', id: '322AC0000000049' },
      { name: '消費税法', id: '323AC0000000131' },
      { name: '会社法', id: '417AC0000000086' }
    ];
    
    const processText = (text) => {
      for (const law of lawNames) {
        const regex = new RegExp(`${law.name}第([０-９0-9一二三四五六七八九十百千]+)条`, 'g');
        const matches = text.matchAll(regex);
        
        for (const match of matches) {
          references.push({
            sourceArticle: article.articleNum,
            sourceText: match[0],
            targetArticle: this.convertToArabic(match[1]),
            targetLawId: law.id,
            targetLawName: law.name,
            type: 'EXTERNAL_REFERENCE',
            sourceLawId
          });
        }
      }
    };
    
    for (const paragraph of article.paragraphs) {
      processText(paragraph.content);
      
      for (const item of paragraph.items) {
        processText(item.content);
        
        for (const subitem of item.subitems) {
          processText(subitem.content);
          
          for (const subsubitem of subitem.subsubitems) {
            processText(subsubitem.content);
          }
        }
      }
    }
  }

  convertToArabic(num) {
    if (!num) return null;
    
    // 全角数字を半角に変換
    num = num.replace(/[０-９]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));
    
    // すでにアラビア数字の場合はそのまま返す
    if (/^\d+$/.test(num)) {
      return parseInt(num);
    }
    
    // 漢数字の変換
    const kanjiMap = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000
    };
    
    let result = 0;
    let temp = 0;
    let prevValue = 0;
    
    for (let i = 0; i < num.length; i++) {
      const char = num[i];
      const value = kanjiMap[char];
      
      if (!value) continue;
      
      if (value === 10 || value === 100 || value === 1000) {
        if (temp === 0) temp = 1;
        result += temp * value;
        temp = 0;
      } else {
        if (prevValue === 10 || prevValue === 100 || prevValue === 1000) {
          result += value;
        } else {
          temp = value;
        }
      }
      prevValue = value;
    }
    
    result += temp;
    return result;
  }

  async generateHTMLFiles() {
    for (const [lawId, lawData] of this.lawIndex) {
      console.log(`  - ${lawData.lawTitle} のHTMLを生成`);
      const references = this.referenceMap.get(lawId) || [];
      const html = this.generateHTML(lawData, references);
      
      const outputPath = path.join(OUTPUT_PATH, 'laws', `${lawId}.html`);
      await fs.writeFile(outputPath, html);
    }
  }

  generateHTML(lawData, references) {
    const lawId = lawData.lawId;
    
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(lawData.lawTitle)} - LawFinder</title>
  <style>
    ${this.getCSS()}
  </style>
</head>
<body>
  <header class="header">
    <h1><a href="../index.html">LawFinder</a></h1>
    <p class="subtitle">法令参照解析システム（e-Govスタイル版）</p>
  </header>

  <div class="main-container">
    <nav class="toc-sidebar">
      <h2 class="toc-title">目次</h2>
      ${this.generateTOC(lawData)}
    </nav>

    <main class="content">
      <div class="law-header">
        <h1 class="law-title">${this.escapeHtml(lawData.lawTitle)}</h1>
      </div>
      
      <div class="articles">
        ${lawData.articles.map(article => this.renderArticle(article, references, lawId)).join('\n')}
      </div>
    </main>
  </div>
  
  <button id="backButton" class="back-button" style="display: none;">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M19 12H5M5 12L12 19M5 12L12 5"/>
    </svg>
    参照元に戻る
  </button>
  
  <script>
    ${this.getJavaScript()}
  </script>
</body>
</html>`;
  }

  getCSS() {
    return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ ProN W3', 
                   'メイリオ', Meiryo, 'ＭＳ Ｐゴシック', sans-serif;
      line-height: 1.8;
      color: #333;
      background-color: #f8f9fa;
    }
    
    .header {
      background-color: #2c3e50;
      color: white;
      padding: 1rem 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .header h1 {
      font-size: 1.5rem;
      font-weight: normal;
    }
    
    .header a {
      color: white;
      text-decoration: none;
    }
    
    .header a:hover {
      text-decoration: underline;
    }
    
    .subtitle {
      font-size: 0.9rem;
      opacity: 0.8;
      margin-top: 0.25rem;
    }
    
    .main-container {
      display: flex;
      max-width: 1400px;
      margin: 0 auto;
      gap: 2rem;
      padding: 2rem;
    }
    
    .toc-sidebar {
      flex: 0 0 300px;
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      position: sticky;
      top: 20px;
      height: calc(100vh - 120px);
      overflow-y: auto;
    }
    
    .toc-sidebar::-webkit-scrollbar {
      width: 8px;
    }
    
    .toc-sidebar::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 4px;
    }
    
    .toc-sidebar::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    
    .toc-sidebar::-webkit-scrollbar-thumb:hover {
      background: #555;
    }
    
    .toc-title {
      font-size: 1.2rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #2c3e50;
    }
    
    .toc-list {
      list-style: none;
    }
    
    .toc-chapter {
      margin-bottom: 1rem;
    }
    
    .toc-chapter-title {
      font-weight: bold;
      color: #2c3e50;
      display: block;
      margin-bottom: 0.5rem;
    }
    
    .toc-articles {
      list-style: none;
      margin-left: 1rem;
    }
    
    .toc-article {
      margin-bottom: 0.25rem;
    }
    
    .toc-article a {
      color: #555;
      text-decoration: none;
      font-size: 0.9rem;
      display: block;
      padding: 0.25rem 0;
    }
    
    .toc-article a:hover {
      color: #2c3e50;
      background-color: #f8f9fa;
      padding-left: 0.5rem;
      transition: all 0.2s ease;
    }
    
    .content {
      flex: 1;
      background: white;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    
    .law-header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #e9ecef;
    }
    
    .law-title {
      font-size: 2rem;
      color: #2c3e50;
    }
    
    .article {
      margin-bottom: 0.5rem;
      padding: 1rem 0;
      border-bottom: 1px solid #e9ecef;
    }
    
    .article:last-child {
      border-bottom: none;
    }
    
    .article-header {
      display: flex;
      align-items: baseline;
      margin-bottom: 0.5rem;
    }
    
    .article-number {
      font-weight: bold;
      color: #2c3e50;
      margin-right: 0.5rem;
    }
    
    .article-title {
      color: #666;
      font-size: 0.95rem;
    }
    
    .paragraph {
      margin-bottom: 0.75rem;
      display: flex;
      align-items: flex-start;
    }
    
    .paragraph-num {
      flex: 0 0 30px;
      text-align: right;
      margin-right: 15px;
      font-weight: bold;
      color: #666;
    }
    
    .paragraph-content {
      flex: 1;
    }
    
    .item {
      margin: 0.5rem 0;
      display: flex;
      align-items: flex-start;
    }
    
    .item-number {
      flex: 0 0 40px;
      text-align: right;
      margin-right: 15px;
      color: #666;
    }
    
    .item-content {
      flex: 1;
    }
    
    .subitem {
      margin: 0.5rem 0;
      display: flex;
      align-items: flex-start;
    }
    
    .subitem-letter {
      flex: 0 0 30px;
      text-align: right;
      margin-right: 15px;
      color: #666;
    }
    
    .subitem-content {
      flex: 1;
    }
    
    .subsubitem {
      margin: 0.5rem 0;
      display: flex;
      align-items: flex-start;
    }
    
    .subsubitem-number {
      flex: 0 0 40px;
      text-align: right;
      margin-right: 15px;
      color: #666;
    }
    
    .subsubitem-content {
      flex: 1;
    }
    
    .ref-link {
      text-decoration: none;
      border-bottom: 1px solid;
      padding: 0 2px;
      transition: all 0.2s ease;
    }
    
    .ref-link:hover {
      opacity: 0.8;
    }
    
    .internal-ref {
      color: #0066cc;
      border-color: #0066cc;
    }
    
    .external-ref {
      color: #dc3545;
      border-color: #dc3545;
    }
    
    .relative-ref {
      color: #28a745;
      border-color: #28a745;
    }
    
    @keyframes highlight {
      0% {
        background-color: rgba(255, 235, 59, 0);
      }
      10% {
        background-color: rgba(255, 235, 59, 0.5);
      }
      100% {
        background-color: rgba(255, 235, 59, 0);
      }
    }
    
    .highlight-target::before {
      content: '';
      position: absolute;
      top: -5px;
      left: -10px;
      right: -10px;
      bottom: -5px;
      background-color: transparent;
      pointer-events: none;
      z-index: -1;
      animation: highlight 2s ease-out;
    }
    
    .article,
    .paragraph {
      position: relative;
    }
    
    .back-button {
      position: fixed;
      bottom: 30px;
      right: 30px;
      background-color: #2c3e50;
      color: white;
      border: none;
      border-radius: 50px;
      padding: 12px 24px;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: all 0.3s ease;
    }
    
    .back-button:hover {
      background-color: #34495e;
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    }
    
    .back-button svg {
      transition: transform 0.3s ease;
    }
    
    .back-button:hover svg {
      transform: translateX(-3px);
    }`;
  }

  getJavaScript() {
    return `
    let navigationHistory = [];
    
    // ナビゲーション履歴の管理
    function pushHistory(from) {
      navigationHistory.push(from);
      if (navigationHistory.length > 10) {
        navigationHistory.shift();
      }
    }
    
    function popHistory() {
      return navigationHistory.pop();
    }
    
    function showBackButton() {
      const backButton = document.getElementById('backButton');
      if (navigationHistory.length > 0) {
        backButton.style.display = 'flex';
      }
    }
    
    function hideBackButton() {
      const backButton = document.getElementById('backButton');
      backButton.style.display = 'none';
    }
    
    // アンカーリンクのクリックを検出
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (link) {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          // 現在位置を記録
          const currentElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
          const closestAnchor = currentElement?.closest('[id]');
          
          if (closestAnchor) {
            pushHistory({
              id: closestAnchor.id,
              scrollY: window.scrollY
            });
            showBackButton();
          }
          
          // ターゲットへスクロール
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
          
          // ハイライト効果
          setTimeout(() => {
            targetElement.classList.add('highlight-target');
            setTimeout(() => {
              targetElement.classList.remove('highlight-target');
            }, 2000);
          }, 300);
        }
      }
    });
    
    // 戻るボタンのクリック処理
    document.getElementById('backButton').addEventListener('click', () => {
      const lastPosition = popHistory();
      if (lastPosition) {
        if (lastPosition.id) {
          const element = document.getElementById(lastPosition.id);
          if (element) {
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
            
            // ハイライト効果
            setTimeout(() => {
              element.classList.add('highlight-target');
              setTimeout(() => {
                element.classList.remove('highlight-target');
              }, 2000);
            }, 300);
          }
        } else {
          // IDがない場合はスクロール位置で戻る
          window.scrollTo({
            top: lastPosition.scrollY,
            behavior: 'smooth'
          });
        }
      }
      
      if (navigationHistory.length === 0) {
        hideBackButton();
      }
    });
    
    // ページ読み込み時にハッシュがある場合の処理
    if (window.location.hash) {
      const target = document.querySelector(window.location.hash);
      if (target) {
        setTimeout(() => {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
          target.classList.add('highlight-target');
          setTimeout(() => {
            target.classList.remove('highlight-target');
          }, 2000);
        }, 100);
      }
    }`;
  }

  generateTOC(lawData) {
    let tocHtml = '<ul class="toc-list">';
    
    if (lawData.structure.chapters.length > 0) {
      // 章構造がある場合
      for (const chapter of lawData.structure.chapters) {
        tocHtml += `<li class="toc-chapter">
          <span class="toc-chapter-title">${this.escapeHtml(chapter.title)}</span>
          <ul class="toc-articles">`;
        
        // この章の条文
        const chapterArticles = lawData.articles.filter(art => {
          // 実際の章への所属判定ロジックが必要
          return true; // 仮実装
        });
        
        for (const article of chapterArticles.slice(0, 5)) { // 最初の5条のみ表示
          tocHtml += `<li class="toc-article">
            <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
          </li>`;
        }
        
        tocHtml += '</ul></li>';
      }
    } else {
      // 章構造がない場合は条文リスト
      for (const article of lawData.articles.slice(0, 20)) { // 最初の20条のみ表示
        tocHtml += `<li class="toc-article">
          <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
        </li>`;
      }
    }
    
    tocHtml += '</ul>';
    return tocHtml;
  }

  renderArticle(article, references, lawId) {
    const articleRefs = references.filter(r => r.sourceArticle === article.articleNum);
    
    let titleDisplay = '';
    if (article.articleTitle) {
      titleDisplay = article.articleTitle.includes('（') ? article.articleTitle : `（${article.articleTitle}）`;
    }
    
    return `
    <div class="article" id="art${article.articleNum}">
      <div class="article-header">
        <span class="article-number">第${article.articleNum}条</span>
        ${titleDisplay ? `<span class="article-title">${titleDisplay}</span>` : ''}
      </div>
      
      ${article.paragraphs.map((para, idx) => this.renderParagraph(para, idx, article.paragraphs.length, articleRefs, lawId, article.articleNum)).join('\n')}
    </div>`;
  }

  renderParagraph(paragraph, index, totalParagraphs, references, lawId, articleNum) {
    const hasNumber = totalParagraphs > 1 && index > 0;
    const paragraphNum = hasNumber ? index + 1 : 1;
    let content = this.escapeHtml(paragraph.content);
    
    // 参照リンクの適用（現在の条文番号と項番号を渡す）
    content = this.applyReferenceLinks(content, references, lawId, articleNum, paragraphNum);
    
    const idAttr = `id="art${articleNum}-para${paragraphNum}"`;
    
    if (paragraph.items.length === 0) {
      // 号がない段落
      return `
      <div class="paragraph" ${idAttr}>
        ${hasNumber ? `<span class="paragraph-num">${paragraphNum}</span>` : '<span class="paragraph-num"></span>'}
        <div class="paragraph-content">${content}</div>
      </div>`;
    } else {
      // 号がある段落
      return `
      <div class="paragraph" ${idAttr}>
        ${hasNumber ? `<span class="paragraph-num">${paragraphNum}</span>` : '<span class="paragraph-num"></span>'}
        <div class="paragraph-content">
          ${content}
          ${paragraph.items.map(item => this.renderItem(item, references, lawId, articleNum, paragraphNum)).join('\n')}
        </div>
      </div>`;
    }
  }

  renderItem(item, references, lawId, articleNum, paragraphNum) {
    let content = this.escapeHtml(item.content);
    content = this.applyReferenceLinks(content, references, lawId, articleNum, paragraphNum);
    
    if (item.subitems.length === 0) {
      return `
      <div class="item">
        <span class="item-number">${this.escapeHtml(item.title)}</span>
        <div class="item-content">${content}</div>
      </div>`;
    } else {
      return `
      <div class="item">
        <span class="item-number">${this.escapeHtml(item.title)}</span>
        <div class="item-content">
          ${content}
          ${item.subitems.map(subitem => this.renderSubitem(subitem, references, lawId, articleNum, paragraphNum)).join('\n')}
        </div>
      </div>`;
    }
  }

  renderSubitem(subitem, references, lawId, articleNum, paragraphNum) {
    let content = this.escapeHtml(subitem.content);
    content = this.applyReferenceLinks(content, references, lawId, articleNum, paragraphNum);
    
    if (subitem.subsubitems.length === 0) {
      return `
      <div class="subitem">
        <span class="subitem-letter">${this.escapeHtml(subitem.title)}</span>
        <div class="subitem-content">${content}</div>
      </div>`;
    } else {
      return `
      <div class="subitem">
        <span class="subitem-letter">${this.escapeHtml(subitem.title)}</span>
        <div class="subitem-content">
          ${content}
          ${subitem.subsubitems.map(subsubitem => this.renderSubsubitem(subsubitem, references, lawId, articleNum, paragraphNum)).join('\n')}
        </div>
      </div>`;
    }
  }

  renderSubsubitem(subsubitem, references, lawId, articleNum, paragraphNum) {
    let content = this.escapeHtml(subsubitem.content);
    content = this.applyReferenceLinks(content, references, lawId, articleNum, paragraphNum);
    
    return `
    <div class="subsubitem">
      <span class="subsubitem-number">${this.escapeHtml(subsubitem.title)}</span>
      <div class="subsubitem-content">${content}</div>
    </div>`;
  }

  applyReferenceLinks(text, references, lawId, currentArticleNum, currentParagraphNum) {
    const patterns = [
      // 外部法令参照（先に処理）
      { regex: /(民法|商法|刑法|民事訴訟法|独占禁止法|労働基準法|消費税法|会社法)第([０-９0-9一二三四五六七八九十百千]+)条/g, type: 'external-ref' },
      // 条文＋項の参照（優先度高）
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条第([０-９0-9一二三四五六七八九十]+)項/g, type: 'internal-ref' },
      // 条文のみ
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条(?!第)/g, type: 'internal-ref' },
      // 章の参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)章/g, type: 'internal-ref' },
      { regex: /前章|次章/g, type: 'internal-ref' },
      // 相対参照
      { regex: /前条/g, type: 'relative-ref', handler: () => {
        const prevArt = parseInt(currentArticleNum) - 1;
        return prevArt > 0 ? `<a href="#art${prevArt}" class="ref-link relative-ref">前条</a>` : '<span class="ref-link relative-ref">前条</span>';
      }},
      { regex: /次条/g, type: 'relative-ref', handler: () => {
        const nextArt = parseInt(currentArticleNum) + 1;
        return `<a href="#art${nextArt}" class="ref-link relative-ref">次条</a>`;
      }},
      { regex: /前項/g, type: 'relative-ref', handler: () => {
        const prevPara = currentParagraphNum - 1;
        return prevPara > 0 ? `<a href="#art${currentArticleNum}-para${prevPara}" class="ref-link relative-ref">前項</a>` : '<span class="ref-link relative-ref">前項</span>';
      }},
      { regex: /次項/g, type: 'relative-ref', handler: () => {
        const nextPara = currentParagraphNum + 1;
        return nextPara <= 10 ? `<a href="#art${currentArticleNum}-para${nextPara}" class="ref-link relative-ref">次項</a>` : '<span class="ref-link relative-ref">次項</span>';
      }},
      { regex: /同項|同条/g, type: 'relative-ref' }
    ];
    
    // 既に処理された範囲を追跡
    const processedRanges = [];
    
    // 各パターンを順に適用
    for (const pattern of patterns) {
      const matches = Array.from(text.matchAll(pattern.regex));
      
      for (const match of matches) {
        const start = match.index;
        const end = start + match[0].length;
        
        // 既に処理された範囲と重複していないかチェック
        const isProcessed = processedRanges.some(range => 
          (start >= range.start && start < range.end) || 
          (end > range.start && end <= range.end)
        );
        
        if (isProcessed) continue;
        
        let replacement;
        
        if (pattern.handler) {
          replacement = pattern.handler();
        } else if (pattern.type === 'external-ref') {
          // 外部法令参照
          const lawName = match[1];
          const articleNum = this.convertToArabic(match[2]);
          const targetLawId = this.getLawIdByName(lawName);
          
          if (targetLawId && this.lawIndex.has(targetLawId)) {
            replacement = `<a href="${targetLawId}.html#art${articleNum}" class="ref-link external-ref">${match[0]}</a>`;
          } else {
            replacement = `<span class="ref-link external-ref">${match[0]}</span>`;
          }
        } else if (pattern.type === 'internal-ref') {
          if (match[1] && match[2]) {
            // 条文＋項
            const articleNum = this.convertToArabic(match[1]);
            const paraNum = this.convertToArabic(match[2]);
            replacement = `<a href="#art${articleNum}-para${paraNum}" class="ref-link internal-ref">${match[0]}</a>`;
          } else if (match[1]) {
            // 条文のみまたは章
            const num = this.convertToArabic(match[1]);
            const prefix = match[0].includes('章') ? 'chapter' : 'art';
            replacement = `<a href="#${prefix}${num}" class="ref-link internal-ref">${match[0]}</a>`;
          } else {
            // 前章・次章
            replacement = `<span class="ref-link internal-ref">${match[0]}</span>`;
          }
        } else {
          replacement = `<span class="ref-link ${pattern.type}">${match[0]}</span>`;
        }
        
        // テキストを置換
        text = text.substring(0, start) + replacement + text.substring(end);
        
        // 処理済み範囲を記録
        processedRanges.push({
          start: start,
          end: start + replacement.length
        });
        
        // 後続のマッチのインデックスを調整
        const lengthDiff = replacement.length - match[0].length;
        processedRanges.forEach(range => {
          if (range.start > start) {
            range.start += lengthDiff;
            range.end += lengthDiff;
          }
        });
      }
    }
    
    return text;
  }

  getLawIdByName(lawName) {
    const lawMap = {
      '民法': '129AC0000000089',
      '商法': '132AC0000000048',
      '刑法': '140AC0000000045',
      '民事訴訟法': '155AC0000000048',
      '独占禁止法': '222AC0000000067',
      '労働基準法': '322AC0000000049',
      '消費税法': '323AC0000000131',
      '会社法': '417AC0000000086'
    };
    return lawMap[lawName];
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async generateIndexPage() {
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawFinder - 法令一覧</title>
  <style>
    ${this.getIndexCSS()}
  </style>
</head>
<body>
  <header class="header">
    <h1>LawFinder</h1>
    <p class="subtitle">法令参照解析システム（e-Govスタイル版）</p>
  </header>

  <main class="container">
    <h2>法令一覧</h2>
    <div class="law-grid">
      ${Array.from(this.lawIndex.values()).map(law => `
        <a href="laws/${law.lawId}.html" class="law-card">
          <h3>${this.escapeHtml(law.lawTitle)}</h3>
          <p class="law-info">
            条文数: ${law.articles.length}条<br>
            参照数: ${(this.referenceMap.get(law.lawId) || []).length}件
          </p>
        </a>
      `).join('')}
    </div>
  </main>
</body>
</html>`;
    
    await fs.writeFile(path.join(OUTPUT_PATH, 'index.html'), html);
  }

  getIndexCSS() {
    return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Hiragino Kaku Gothic ProN', 'ヒラギノ角ゴ ProN W3', 
                   'メイリオ', Meiryo, 'ＭＳ Ｐゴシック', sans-serif;
      line-height: 1.8;
      color: #333;
      background-color: #f8f9fa;
    }
    
    .header {
      background-color: #2c3e50;
      color: white;
      padding: 1rem 2rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .header h1 {
      font-size: 1.5rem;
      font-weight: normal;
    }
    
    .subtitle {
      font-size: 0.9rem;
      opacity: 0.8;
      margin-top: 0.25rem;
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    
    h2 {
      color: #2c3e50;
      margin-bottom: 2rem;
    }
    
    .law-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.5rem;
    }
    
    .law-card {
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      text-decoration: none;
      color: inherit;
      transition: all 0.3s ease;
    }
    
    .law-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
    }
    
    .law-card h3 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
    }
    
    .law-info {
      color: #666;
      font-size: 0.9rem;
    }`;
  }

  async copyAssets() {
    // 現時点では追加のアセットは不要
  }
}

// 実行
const generator = new EGovStaticSiteGenerator();
generator.generate().catch(console.error);