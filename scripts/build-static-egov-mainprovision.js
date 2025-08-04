const fs = require('fs').promises;
const path = require('path');

// 設定
const LAWS_DATA_PATH = path.join(__dirname, '../laws_data/sample');
const OUTPUT_PATH = path.join(__dirname, '../dist/static');

class EGovMainProvisionStaticSiteGenerator {
  constructor() {
    this.laws = [];
    this.lawIndex = new Map();
    this.referenceMap = new Map();
  }

  async generate() {
    console.log('静的サイト生成を開始します（e-Gov準拠・本文専用版）...\n');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDir();
    
    // 法令データの読み込み（本文のみ）
    await this.loadLaws();
    
    // 参照検出
    this.detectReferences();
    
    // HTMLファイル生成
    await this.generateHTMLFiles();
    
    // インデックスページ生成
    await this.generateIndexPage();
    
    console.log('\n✅ 静的サイト生成が完了しました！');
    console.log(`出力先: ${OUTPUT_PATH}`);
  }

  async prepareOutputDir() {
    await fs.mkdir(OUTPUT_PATH, { recursive: true });
    await fs.mkdir(path.join(OUTPUT_PATH, 'laws'), { recursive: true });
  }

  async loadLaws() {
    const files = await fs.readdir(LAWS_DATA_PATH);
    const xmlFiles = files.filter(f => f.endsWith('.xml'));
    
    console.log(`${xmlFiles.length}件の法令を処理します\n`);
    console.log('Phase 1: 法令データの読み込み（本文のみ）');
    
    for (const file of xmlFiles) {
      const lawId = file.replace('.xml', '');
      const xmlPath = path.join(LAWS_DATA_PATH, file);
      const xmlContent = await fs.readFile(xmlPath, 'utf-8');
      
      const lawData = this.parseXML(xmlContent, lawId);
      if (lawData) {
        this.laws.push(lawData);
        this.lawIndex.set(lawId, lawData);
        console.log(`  - ${lawData.lawTitle} を読み込みました（${lawData.articles.length}条）`);
      }
    }
  }

  parseXML(xmlContent, lawId) {
    // Ruby タグの処理
    const cleanXml = xmlContent.replace(/<Ruby>[\s\S]*?<\/Ruby>/g, (match) => {
      const rtMatch = match.match(/<Rt>([^<]+)<\/Rt>/);
      const baseMatch = match.match(/>([^<>]+)<Rt>/);
      if (rtMatch && baseMatch) {
        return baseMatch[1];
      }
      return match.replace(/<[^>]+>/g, '');
    });
    
    // 法令名
    const titleMatch = cleanXml.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const lawTitle = titleMatch ? titleMatch[1] : `法令${lawId}`;
    
    // メタデータ
    const metadata = this.extractMetadata(cleanXml);
    
    // 制定文
    const enactStatements = this.extractEnactStatements(cleanXml);
    
    // 構造（編・章・節）
    const structure = this.extractStructure(cleanXml);
    
    // MainProvisionから条文を抽出
    const articles = this.extractMainProvisionArticles(cleanXml);
    
    // 改正履歴
    const amendmentHistory = this.extractAmendmentHistory(cleanXml);
    
    return {
      lawId,
      lawTitle,
      metadata,
      enactStatements,
      structure,
      articles,
      amendmentHistory
    };
  }

  extractMetadata(xmlContent) {
    const metadata = {};
    
    const lawNumMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
    if (lawNumMatch) metadata.lawNum = lawNumMatch[1];
    
    const promulgatedDateMatch = xmlContent.match(/<PromulgateDate>([^<]+)<\/PromulgateDate>/);
    if (promulgatedDateMatch) metadata.promulgatedDate = promulgatedDateMatch[1];
    
    const effectiveDateMatch = xmlContent.match(/<EnforcementDate>([^<]+)<\/EnforcementDate>/);
    if (effectiveDateMatch) {
      metadata.effectiveDate = effectiveDateMatch[1];
      metadata.effectiveStatus = '現行';
    }
    
    return metadata;
  }

  extractEnactStatements(xmlContent) {
    const statements = [];
    const matches = xmlContent.matchAll(/<EnactStatement[^>]*>([^<]+)<\/EnactStatement>/g);
    for (const match of matches) {
      statements.push(match[1]);
    }
    return statements;
  }

  extractStructure(xmlContent) {
    const structure = [];
    
    // MainProvisionのみから構造を抽出
    const mainStart = xmlContent.indexOf('<MainProvision>');
    const mainEnd = xmlContent.indexOf('</MainProvision>');
    
    if (mainStart === -1 || mainEnd === -1) return structure;
    
    const mainProvision = xmlContent.substring(mainStart, mainEnd + '</MainProvision>'.length);
    
    // 編
    const partMatches = mainProvision.matchAll(/<Part[^>]*Num="([^"]+)"[^>]*>[\s\S]*?<PartTitle>([^<]+)<\/PartTitle>/g);
    for (const match of partMatches) {
      structure.push({
        type: 'Part',
        num: match[1],
        title: match[2],
        level: 1
      });
    }
    
    // 章
    const chapterMatches = mainProvision.matchAll(/<Chapter[^>]*Num="([^"]+)"[^>]*>[\s\S]*?<ChapterTitle>([^<]+)<\/ChapterTitle>/g);
    for (const match of chapterMatches) {
      structure.push({
        type: 'Chapter',
        num: match[1],
        title: match[2],
        level: 2
      });
    }
    
    // 節
    const sectionMatches = mainProvision.matchAll(/<Section[^>]*Num="([^"]+)"[^>]*>[\s\S]*?<SectionTitle>([^<]+)<\/SectionTitle>/g);
    for (const match of sectionMatches) {
      structure.push({
        type: 'Section',
        num: match[1],
        title: match[2],
        level: 3
      });
    }
    
    return structure;
  }

  extractMainProvisionArticles(xmlContent) {
    const articles = [];
    const existingArticles = new Map();
    
    // MainProvisionの範囲を特定
    const mainStart = xmlContent.indexOf('<MainProvision>');
    const mainEnd = xmlContent.indexOf('</MainProvision>');
    
    if (mainStart === -1 || mainEnd === -1) {
      console.error('MainProvisionが見つかりません');
      return articles;
    }
    
    const mainProvision = xmlContent.substring(mainStart, mainEnd + '</MainProvision>'.length);
    
    // 条文を抽出
    const articleMatches = mainProvision.matchAll(/<Article[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
    for (const match of articleMatches) {
      const articleNum = match[1];
      const articleContent = match[2];
      
      const titleMatch = articleContent.match(/<ArticleTitle>([^<]+)<\/ArticleTitle>/);
      const articleTitle = titleMatch ? titleMatch[1] : '';
      
      // 条文番号と同じ場合はタイトルを空に
      const articleTitleClean = (articleTitle === `第${articleNum}条` || articleTitle === articleNum) ? '' : articleTitle;
      
      const paragraphs = this.extractParagraphs(articleContent);
      
      existingArticles.set(parseInt(articleNum.split('_')[0]), true);
      
      articles.push({
        articleNum,
        articleTitle: articleTitleClean,
        paragraphs
      });
    }
    
    // 削除された条文範囲を追加
    const rangeMatches = mainProvision.matchAll(/<ArticleRange>第([０-９0-9一二三四五六七八九十百千]+)条から第([０-９0-9一二三四五六七八九十百千]+)条まで<\/ArticleRange>/g);
    
    for (const match of rangeMatches) {
      const startNum = this.convertToArabic(match[1]);
      const endNum = this.convertToArabic(match[2]);
      
      if (endNum - startNum >= 20) {
        articles.push({
          articleNum: `${startNum}-${endNum}`,
          articleTitle: '削除',
          paragraphs: [{
            content: `第${this.convertToKanjiNum(startNum)}条から第${this.convertToKanjiNum(endNum)}条まで　削除`,
            items: []
          }],
          isDeleted: true,
          isRange: true,
          startNum: startNum,
          endNum: endNum
        });
        
        // 範囲内の条文番号を記録
        for (let i = startNum; i <= endNum; i++) {
          existingArticles.set(i, true);
        }
      }
    }
    
    // 条文番号でソート
    articles.sort((a, b) => {
      const numA = parseInt(a.articleNum.split('_')[0].split('-')[0]);
      const numB = parseInt(b.articleNum.split('_')[0].split('-')[0]);
      return numA - numB;
    });
    
    return articles;
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
    
    // サブサブアイテムの抽出
    const subsubitemMatches = subitemContent.matchAll(/<Subitem2[^>]*>([\s\S]*?)<\/Subitem2>/g);
    for (const match of subsubitemMatches) {
      const subsubitem = this.extractSubsubitem(match[1]);
      subitem.subsubitems.push(subsubitem);
    }
    
    return subitem;
  }

  extractSubsubitem(subsubitemContent) {
    const subsubitem = {
      title: '',
      content: ''
    };
    
    const titleMatch = subsubitemContent.match(/<Subitem2Title>([^<]+)<\/Subitem2Title>/);
    if (titleMatch) {
      subsubitem.title = titleMatch[1];
    }
    
    const sentenceMatch = subsubitemContent.match(/<Subitem2Sentence>([\s\S]*?)<\/Subitem2Sentence>/);
    if (sentenceMatch) {
      const sentences = sentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
      subsubitem.content = Array.from(sentences).map(s => s[1]).join('');
    }
    
    return subsubitem;
  }

  extractAmendmentHistory(xmlContent) {
    const history = [];
    const supplMatches = xmlContent.matchAll(/<SupplProvision\s+AmendLawNum="([^"]+)"[^>]*>/g);
    
    for (const match of supplMatches) {
      history.push({
        lawNum: match[1],
        description: `${match[1]}による改正`
      });
    }
    
    return history;
  }

  detectReferences() {
    console.log('\nPhase 2: 参照関係の抽出\n');
    
    for (const law of this.laws) {
      console.log(`${law.lawTitle} の参照関係を解析中...`);
      const references = [];
      
      for (const article of law.articles) {
        if (!article.isDeleted && !article.isRange) {
          references.push(...this.extractReferencesFromArticle(article, law.lawId));
        }
      }
      
      this.referenceMap.set(law.lawId, references);
      console.log(`  → ${references.length}個の参照を検出`);
    }
  }

  extractReferencesFromArticle(article, sourceLawId) {
    const references = [];
    const patterns = [
      // 条文範囲参照（例：第七十七条から第七十九条まで）
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条から第([０-９0-9一二三四五六七八九十百千]+)条まで/g, type: 'RANGE_REFERENCE' },
      // 複数条文参照（例：前二条、前三条）
      { regex: /前([二三四五六七八九十])条/g, type: 'MULTIPLE_ARTICLE_REFERENCE' },
      // 「この章」「この編」「この節」参照
      { regex: /この(章|編|節)/g, type: 'STRUCTURE_REFERENCE' },
      // 次の各号・次に掲げる
      { regex: /次の各号|次に掲げる/g, type: 'ITEM_LIST_REFERENCE' },
      // 準用規定
      { regex: /(準用する|準用される)/g, type: 'APPLICATION_REFERENCE' },
      // 「の」付き条文参照（例：第二十七条の七）
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条の([０-９0-9一二三四五六七八九十]+)(?!項)/g, type: 'INTERNAL_REFERENCE' },
      // 条文＋項の参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条第([０-９0-9一二三四五六七八九十]+)項/g, type: 'ARTICLE_PARAGRAPH_REFERENCE' },
      // 条文のみ（前のパターンに一致しないもの）
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条(?!第|の|から)/g, type: 'INTERNAL_REFERENCE' },
      // 章の参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)章/g, type: 'CHAPTER_REFERENCE' },
      // 編の参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)編/g, type: 'PART_REFERENCE' },
      // 相対参照
      { regex: /前条|次条/g, type: 'RELATIVE_ARTICLE_REFERENCE' },
      { regex: /前項|次項|同項|同条/g, type: 'RELATIVE_REFERENCE' },
      { regex: /前章|次章/g, type: 'RELATIVE_CHAPTER_REFERENCE' },
      // 複合参照
      { regex: /同項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'COMPLEX_REFERENCE' },
      { regex: /前項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'COMPLEX_REFERENCE' },
      { regex: /同条第([０-９0-9一二三四五六七八九十]+)項/g, type: 'COMPLEX_REFERENCE' },
      // 外部法令参照
      { regex: /(民法|商法|刑法|民事訴訟法|独占禁止法|労働基準法|消費税法|会社法)(?:（[^）]+）)?第([０-９0-9一二三四五六七八九十百千]+)条/g, type: 'EXTERNAL_REFERENCE' }
    ];
    
    const processText = (text) => {
      for (const pattern of patterns) {
        const matches = text.matchAll(pattern.regex);
        for (const match of matches) {
          if (pattern.type === 'RANGE_REFERENCE') {
            // 範囲参照
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              targetArticle: this.convertToArabic(match[1]),
              targetArticleEnd: this.convertToArabic(match[2]),
              type: pattern.type,
              sourceLawId
            });
          } else if (pattern.type === 'MULTIPLE_ARTICLE_REFERENCE') {
            // 複数条文参照（前二条など）
            const num = this.convertToArabic(match[1]);
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              relativeCount: num,
              type: pattern.type,
              sourceLawId
            });
          } else if (pattern.type === 'STRUCTURE_REFERENCE') {
            // この章・この編・この節
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              structureType: match[1],
              type: pattern.type,
              sourceLawId
            });
          } else if (pattern.type === 'ITEM_LIST_REFERENCE' || pattern.type === 'APPLICATION_REFERENCE') {
            // 各号列記・準用規定
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              type: pattern.type,
              sourceLawId
            });
          } else if (pattern.type === 'INTERNAL_REFERENCE' && match[0].includes('の')) {
            // 「第二十七条の七」のような形式
            const mainArticle = this.convertToArabic(match[1]);
            const subArticle = match[2] ? this.convertToArabic(match[2]) : null;
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              targetArticle: subArticle ? `${mainArticle}_${subArticle}` : mainArticle,
              targetParagraph: null,
              type: pattern.type,
              sourceLawId
            });
          } else if (pattern.type === 'ARTICLE_PARAGRAPH_REFERENCE') {
            // 条文＋項の参照
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              targetArticle: this.convertToArabic(match[1]),
              targetParagraph: this.convertToArabic(match[2]),
              type: pattern.type,
              sourceLawId
            });
          } else if (pattern.type === 'EXTERNAL_REFERENCE') {
            // 外部法令参照
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              targetLawName: match[1],
              targetArticle: this.convertToArabic(match[2]),
              type: pattern.type,
              sourceLawId
            });
          } else if (pattern.type === 'CHAPTER_REFERENCE' || pattern.type === 'PART_REFERENCE') {
            // 章・編の参照
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              targetNumber: this.convertToArabic(match[1]),
              type: pattern.type,
              sourceLawId
            });
          } else {
            // その他の参照（前条、次条、前項、次項等）
            references.push({
              sourceArticle: article.articleNum,
              sourceText: match[0],
              type: pattern.type,
              sourceLawId
            });
          }
        }
      }
    };
    
    // 各段落を処理
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
    
    return references;
  }

  convertToArabic(num) {
    if (!num) return null;
    
    // 既にアラビア数字の場合
    if (/^[0-9]+$/.test(num)) {
      return parseInt(num);
    }
    
    // 漢数字変換マップ
    const kanjiMap = {
      '〇': 0, '０': 0, '零': 0,
      '一': 1, '１': 1, '壱': 1,
      '二': 2, '２': 2, '弐': 2,
      '三': 3, '３': 3, '参': 3,
      '四': 4, '４': 4,
      '五': 5, '５': 5,
      '六': 6, '６': 6,
      '七': 7, '７': 7,
      '八': 8, '８': 8,
      '九': 9, '９': 9,
      '十': 10, '拾': 10,
      '百': 100,
      '千': 1000
    };
    
    let result = 0;
    let temp = 0;
    let prevValue = 0;
    
    for (let i = 0; i < num.length; i++) {
      const char = num[i];
      const value = kanjiMap[char];
      
      if (value === undefined) continue;
      
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

  convertToKanjiNum(num) {
    const kanjiNums = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const kanjiUnits = ['', '十', '百', '千'];
    
    if (num === 0) return '〇';
    if (num < 10) return kanjiNums[num];
    
    let result = '';
    let strNum = num.toString();
    let len = strNum.length;
    
    for (let i = 0; i < len; i++) {
      let digit = parseInt(strNum[i]);
      let unit = len - i - 1;
      
      if (digit === 0) continue;
      
      if (digit === 1 && unit > 0) {
        result += kanjiUnits[unit];
      } else {
        result += kanjiNums[digit];
        if (unit > 0) {
          result += kanjiUnits[unit];
        }
      }
    }
    
    return result;
  }

  formatArticleNumber(articleNum) {
    // 「34_2」のような形式を「三十四条の二」に変換
    const parts = articleNum.toString().split('_');
    const mainNum = parseInt(parts[0]);
    const subNum = parts[1] ? parseInt(parts[1]) : null;
    
    let result = this.convertToKanjiNum(mainNum);
    
    if (subNum) {
      result += 'の' + this.convertToKanjiNum(subNum);
    }
    
    return result;
  }

  async generateHTMLFiles() {
    console.log('\nPhase 3: HTMLファイルの生成');
    
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
    <div class="header-container">
      <h1 class="site-title"><a href="../index.html">LawFinder</a></h1>
      <nav class="header-nav">
        <a href="../index.html">法令検索</a>
        <a href="#">新規制定・改正法令</a>
        <a href="#">法分野別</a>
        <a href="#">ヘルプ</a>
      </nav>
    </div>
  </header>

  <div class="main-container">
    <nav class="toc-sidebar">
      <h2 class="toc-title">目次</h2>
      ${this.generateFullTOC(lawData)}
    </nav>

    <main class="content">
      <div class="law-header">
        <div class="law-metadata">
          ${lawData.metadata.effectiveDate ? `<div class="effective-date">${lawData.metadata.effectiveDate} 施行 ${lawData.metadata.effectiveStatus}</div>` : ''}
          ${lawData.amendmentHistory.length > 0 ? `
          <div class="amendment-info">
            最終改正: ${lawData.amendmentHistory[lawData.amendmentHistory.length - 1].lawNum}
          </div>` : ''}
        </div>
        
        <h1 class="law-title">${this.escapeHtml(lawData.lawTitle)}</h1>
        ${lawData.metadata.lawNum ? `<div class="law-number">${lawData.metadata.lawNum}</div>` : ''}
        
        ${lawData.enactStatements.length > 0 ? `
        <div class="enact-statements">
          ${lawData.enactStatements.map(stmt => `<p>${this.escapeHtml(stmt)}</p>`).join('\n')}
        </div>` : ''}
      </div>
      
      <div class="articles">
        ${this.renderArticlesWithStructure(lawData, references)}
      </div>
      
      <div class="suppl-notice">
        <p>※ 附則については、e-Gov法令検索をご参照ください。</p>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 
                   'ヒラギノ角ゴ ProN W3', 'メイリオ', Meiryo, sans-serif;
      line-height: 1.8;
      color: #333;
      background-color: #f5f5f5;
    }
    
    .header {
      background-color: #003d7a;
      color: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
    }
    
    .header-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 0.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .site-title {
      font-size: 1.25rem;
      font-weight: normal;
    }
    
    .site-title a {
      color: white;
      text-decoration: none;
    }
    
    .header-nav {
      display: flex;
      gap: 2rem;
    }
    
    .header-nav a {
      color: white;
      text-decoration: none;
      font-size: 0.9rem;
    }
    
    .header-nav a:hover {
      text-decoration: underline;
    }
    
    .main-container {
      display: flex;
      min-height: 100vh;
      padding-top: 60px;
    }
    
    .toc-sidebar {
      width: 320px;
      background-color: white;
      border-right: 1px solid #ddd;
      padding: 1.5rem;
      overflow-y: auto;
      position: fixed;
      top: 60px;
      left: 0;
      bottom: 0;
      z-index: 100;
    }
    
    .toc-title {
      font-size: 1.1rem;
      margin-bottom: 1rem;
      color: #003d7a;
    }
    
    .toc-sidebar ul {
      list-style: none;
    }
    
    .toc-sidebar > ul {
      margin-left: 0;
    }
    
    .toc-sidebar ul ul {
      margin-left: 1.5rem;
    }
    
    .toc-sidebar li {
      margin: 0.25rem 0;
    }
    
    .toc-sidebar a {
      color: #333;
      text-decoration: none;
      display: block;
      padding: 0.25rem 0;
      font-size: 0.9rem;
    }
    
    .toc-sidebar a:hover {
      color: #003d7a;
      text-decoration: underline;
    }
    
    .toc-part {
      font-weight: bold;
      color: #003d7a;
      margin-top: 1rem;
    }
    
    .toc-chapter {
      font-weight: bold;
      color: #003d7a;
      margin-top: 0.75rem;
    }
    
    .toc-section {
      margin-left: 1rem;
      color: #666;
    }
    
    .toc-article.deleted {
      color: #999;
      font-style: italic;
    }
    
    .content {
      flex: 1;
      margin-left: 320px;
      background-color: white;
      padding: 2rem 3rem;
      max-width: calc(100% - 320px);
    }
    
    .law-header {
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid #003d7a;
    }
    
    .law-metadata {
      font-size: 0.9rem;
      color: #666;
      margin-bottom: 0.5rem;
    }
    
    .effective-date {
      display: inline-block;
      background-color: #e8f4ff;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      margin-right: 1rem;
    }
    
    .amendment-info {
      display: inline-block;
      color: #666;
    }
    
    .law-title {
      font-size: 2rem;
      color: #003d7a;
      margin: 1rem 0;
    }
    
    .law-number {
      font-size: 1rem;
      color: #666;
    }
    
    .enact-statements {
      margin-top: 1rem;
      padding: 1rem;
      background-color: #f9f9f9;
      border-left: 3px solid #003d7a;
    }
    
    .enact-statements p {
      margin: 0.5rem 0;
      color: #666;
    }
    
    .structure-header {
      margin: 2rem 0 1rem;
      padding: 0.75rem 1rem;
      background-color: #f0f0f0;
      border-left: 5px solid #003d7a;
    }
    
    .part-header {
      font-size: 1.5rem;
      font-weight: bold;
      color: #003d7a;
    }
    
    .chapter-header {
      font-size: 1.3rem;
      font-weight: bold;
      color: #003d7a;
    }
    
    .section-header {
      font-size: 1.1rem;
      font-weight: bold;
      color: #666;
      margin-left: 1rem;
    }
    
    .article {
      margin: 1.5rem 0;
      padding: 1rem 0;
      border-bottom: 1px solid #eee;
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
      color: #003d7a;
      margin-right: 1rem;
      font-size: 1.1rem;
    }
    
    .article-title {
      color: #666;
    }
    
    .paragraph {
      margin: 0.5rem 0;
      display: flex;
      align-items: flex-start;
    }
    
    .paragraph-number {
      min-width: 2rem;
      font-weight: bold;
      color: #666;
      user-select: none;
    }
    
    .paragraph-content {
      flex: 1;
      padding-left: 0.5rem;
    }
    
    .item {
      margin: 0.5rem 0 0.5rem 2rem;
      display: flex;
      align-items: flex-start;
    }
    
    .item-number {
      min-width: 2.5rem;
      color: #666;
      user-select: none;
    }
    
    .item-content {
      flex: 1;
      padding-left: 0.5rem;
    }
    
    .subitem {
      margin: 0.25rem 0 0.25rem 2rem;
      display: flex;
      align-items: flex-start;
    }
    
    .subitem-letter {
      min-width: 2rem;
      color: #666;
      user-select: none;
    }
    
    .subitem-content {
      flex: 1;
      padding-left: 0.5rem;
    }
    
    .subsubitem {
      margin: 0.25rem 0 0.25rem 2rem;
      display: flex;
      align-items: flex-start;
    }
    
    .subsubitem-number {
      min-width: 2.5rem;
      color: #666;
      user-select: none;
    }
    
    .subsubitem-content {
      flex: 1;
      padding-left: 0.5rem;
    }
    
    .ref-link {
      color: #0066cc;
      text-decoration: none;
      padding: 0 2px;
      border-bottom: 1px solid transparent;
      transition: all 0.2s ease;
    }
    
    .ref-link:hover {
      background-color: #e8f4ff;
      border-bottom-color: #0066cc;
    }
    
    .ref-link.relative-ref {
      color: #0066cc;
      font-weight: 500;
    }
    
    .ref-link.external-ref {
      color: #00897b;
    }
    
    @keyframes highlight-fade {
      0% { background-color: yellow; }
      100% { background-color: transparent; }
    }
    
    .highlight-animation::before {
      content: '';
      position: absolute;
      top: -5px;
      left: -10px;
      right: -10px;
      bottom: -5px;
      background-color: yellow;
      animation: highlight-fade 2s ease-out;
      z-index: -1;
      pointer-events: none;
    }
    
    .article-header,
    .paragraph,
    .item,
    .subitem,
    .subsubitem {
      position: relative;
    }
    
    .back-button {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      background-color: #003d7a;
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 50px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.9rem;
      box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
      z-index: 900;
    }
    
    .back-button:hover {
      background-color: #002855;
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.3);
    }
    
    .deleted-range {
      color: #999;
      font-style: italic;
      padding: 1rem;
      background-color: #f5f5f5;
      border-left: 3px solid #ccc;
      margin: 1rem 0;
    }
    
    .suppl-notice {
      margin-top: 3rem;
      padding: 2rem;
      background-color: #f0f0f0;
      border-left: 5px solid #666;
      color: #666;
      font-style: italic;
    }`;
  }

  getJavaScript() {
    return `
    // ナビゲーション履歴管理
    let navigationHistory = [];
    const backButton = document.getElementById('backButton');
    
    // 参照リンクのクリックハンドラー
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('ref-link')) {
        const href = e.target.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          
          // 現在位置を履歴に追加
          const currentElement = document.elementFromPoint(window.innerWidth / 2, 100);
          if (currentElement) {
            const article = currentElement.closest('.article');
            if (article) {
              navigationHistory.push({
                element: article,
                scrollY: window.scrollY
              });
            }
          }
          
          // ターゲットにジャンプ
          const targetId = href.substring(1);
          const targetElement = document.getElementById(targetId);
          if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // ハイライトアニメーション
            targetElement.classList.add('highlight-animation');
            setTimeout(() => {
              targetElement.classList.remove('highlight-animation');
            }, 2000);
            
            // 戻るボタンを表示
            if (navigationHistory.length > 0) {
              backButton.style.display = 'flex';
            }
          }
        }
      }
    });
    
    // 戻るボタンのクリックハンドラー
    backButton.addEventListener('click', function() {
      if (navigationHistory.length > 0) {
        const lastPosition = navigationHistory.pop();
        
        // 元の位置に戻る
        if (lastPosition.element) {
          lastPosition.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // ハイライトアニメーション
          lastPosition.element.classList.add('highlight-animation');
          setTimeout(() => {
            lastPosition.element.classList.remove('highlight-animation');
          }, 2000);
        }
        
        // 履歴がなくなったら戻るボタンを非表示
        if (navigationHistory.length === 0) {
          backButton.style.display = 'none';
        }
      }
    });
    
    // 外部法令リンクの処理
    document.addEventListener('DOMContentLoaded', function() {
      // ナビゲーション履歴をクリア
      navigationHistory = [];
      backButton.style.display = 'none';
    });`;
  }

  generateFullTOC(lawData) {
    const toc = [];
    let currentStructure = null;
    
    for (const article of lawData.articles) {
      // 構造要素の追加
      for (const struct of lawData.structure) {
        if (this.isArticleInStructure(article, struct, lawData)) {
          if (struct.type === 'Part' && (!currentStructure || currentStructure.type !== 'Part' || currentStructure.num !== struct.num)) {
            toc.push(`<li class="toc-part">${struct.title}</li>`);
            currentStructure = struct;
          } else if (struct.type === 'Chapter' && (!currentStructure || currentStructure.type !== 'Chapter' || currentStructure.num !== struct.num)) {
            toc.push(`<li class="toc-chapter">${struct.title}</li>`);
            currentStructure = struct;
          } else if (struct.type === 'Section' && (!currentStructure || currentStructure.type !== 'Section' || currentStructure.num !== struct.num)) {
            toc.push(`<li class="toc-section">${struct.title}</li>`);
            currentStructure = struct;
          }
        }
      }
      
      // 条文リンク
      if (article.isRange) {
        toc.push(`<li class="toc-article deleted">第${this.formatArticleNumber(article.startNum)}条から第${this.formatArticleNumber(article.endNum)}条まで　削除</li>`);
      } else {
        const articleClass = article.isDeleted ? 'toc-article deleted' : 'toc-article';
        const articleTitle = article.articleTitle ? `　${article.articleTitle}` : '';
        toc.push(`<li class="${articleClass}"><a href="#art${article.articleNum}">第${this.formatArticleNumber(article.articleNum)}条${articleTitle}</a></li>`);
      }
    }
    
    return `<ul>${toc.join('\n')}</ul>`;
  }

  isArticleInStructure(article, structure, lawData) {
    // 簡略化された構造チェック
    return true;
  }

  renderArticlesWithStructure(lawData, references) {
    const html = [];
    let currentStructure = null;
    
    for (const article of lawData.articles) {
      // 構造ヘッダーの追加
      for (const struct of lawData.structure) {
        if (this.isArticleInStructure(article, struct, lawData)) {
          if (struct.type === 'Part' && (!currentStructure || currentStructure.type !== 'Part' || currentStructure.num !== struct.num)) {
            html.push(`<div class="structure-header part-header">${struct.title}</div>`);
            currentStructure = struct;
          } else if (struct.type === 'Chapter' && (!currentStructure || currentStructure.type !== 'Chapter' || currentStructure.num !== struct.num)) {
            html.push(`<div class="structure-header chapter-header">${struct.title}</div>`);
            currentStructure = struct;
          } else if (struct.type === 'Section' && (!currentStructure || currentStructure.type !== 'Section' || currentStructure.num !== struct.num)) {
            html.push(`<div class="structure-header section-header">${struct.title}</div>`);
            currentStructure = struct;
          }
        }
      }
      
      // 条文の描画
      if (article.isRange) {
        html.push(`
          <div class="article deleted-range" id="art${article.articleNum}">
            第${this.formatArticleNumber(article.startNum)}条から第${this.formatArticleNumber(article.endNum)}条まで　削除
          </div>
        `);
      } else {
        html.push(this.renderArticle(article, references, lawData.lawId));
      }
    }
    
    return html.join('\n');
  }

  renderArticle(article, references, lawId) {
    if (article.isDeleted) {
      return `
      <div class="article" id="art${article.articleNum}">
        <div class="article-header">
          <span class="article-number">第${this.formatArticleNumber(article.articleNum)}条</span>
          <span class="article-title">削除</span>
        </div>
      </div>`;
    }
    
    return `
    <div class="article" id="art${article.articleNum}">
      <div class="article-header">
        <span class="article-number">第${this.formatArticleNumber(article.articleNum)}条</span>
        ${article.articleTitle ? `<span class="article-title">（${this.escapeHtml(article.articleTitle)}）</span>` : ''}
      </div>
      ${article.paragraphs.map((para, idx) => this.renderParagraph(para, idx + 1, references, lawId, article.articleNum)).join('\n')}
    </div>`;
  }

  renderParagraph(paragraph, paragraphNum, references, lawId, articleNum) {
    let content = this.escapeHtml(paragraph.content);
    content = this.applyReferenceLinks(content, references, lawId, articleNum, paragraphNum);
    
    const paraId = `art${articleNum}-para${paragraphNum}`;
    
    if (paragraphNum === 1 && paragraph.items.length === 0) {
      return `<div class="paragraph" id="${paraId}"><div class="paragraph-content">${content}</div></div>`;
    }
    
    return `
    <div class="paragraph" id="${paraId}">
      ${paragraphNum > 1 ? `<span class="paragraph-number">${paragraphNum}</span>` : '<span class="paragraph-number"></span>'}
      <div class="paragraph-content">
        ${content}
        ${paragraph.items.map(item => this.renderItem(item, references, lawId, articleNum, paragraphNum)).join('\n')}
      </div>
    </div>`;
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
      // 範囲参照（例：第七十七条から第七十九条まで）
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条から第([０-９0-9一二三四五六七八九十百千]+)条まで/g, type: 'range-ref' },
      // 複数条文参照（例：前二条、前三条）
      { regex: /前([二三四五六七八九十])条/g, type: 'multiple-article-ref' },
      // 「この章」「この編」「この節」参照
      { regex: /この章|この編|この節/g, type: 'structure-ref' },
      // 外部法令参照（先に処理）
      { regex: /(民法|商法|刑法|民事訴訟法|独占禁止法|労働基準法|消費税法|会社法)第([０-９0-9一二三四五六七八九十百千]+)条/g, type: 'external-ref' },
      // 「の」付き条文参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条の([０-９0-9一二三四五六七八九十]+)(?!項)/g, type: 'internal-ref' },
      // 条文＋項の参照（優先度高）
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条第([０-９0-9一二三四五六七八九十]+)項/g, type: 'article-para-ref' },
      // 条文のみ
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条(?!第|の|から)/g, type: 'internal-ref' },
      // 章の参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)章/g, type: 'chapter-ref' },
      { regex: /前章|次章/g, type: 'relative-chapter-ref' },
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
      { regex: /同項|同条/g, type: 'relative-ref' },
      // 複合参照
      { regex: /同項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'complex-ref' },
      { regex: /前項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'complex-ref' },
      // 準用規定
      { regex: /準用する|準用される/g, type: 'application-ref' }
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
        } else if (pattern.type === 'range-ref') {
          // 範囲参照
          const startArticle = this.convertToArabic(match[1]);
          const endArticle = this.convertToArabic(match[2]);
          replacement = `<a href="#art${startArticle}" class="ref-link">第${match[1]}条から第${match[2]}条まで</a>`;
        } else if (pattern.type === 'multiple-article-ref') {
          // 複数条文参照（前二条など）
          const count = this.convertToArabic(match[1]);
          const startArticle = Math.max(1, parseInt(currentArticleNum) - count + 1);
          replacement = `<a href="#art${startArticle}" class="ref-link relative-ref">前${match[1]}条</a>`;
        } else if (pattern.type === 'structure-ref') {
          // 章・編・節参照はとりあえずスタイルのみ
          replacement = `<span class="ref-link structure-ref">${match[0]}</span>`;
        } else if (pattern.type === 'external-ref') {
          // 外部法令参照
          const lawName = match[1];
          const articleNum = this.convertToArabic(match[2]);
          const targetLawId = this.getLawIdByName(lawName);
          
          if (targetLawId) {
            replacement = `<a href="${targetLawId}.html#art${articleNum}" class="ref-link external-ref">${match[0]}</a>`;
          } else {
            replacement = `<span class="ref-link external-ref">${match[0]}</span>`;
          }
        } else if (pattern.type === 'article-para-ref') {
          // 条文＋項の参照
          const articleNum = this.convertToArabic(match[1]);
          const paraNum = this.convertToArabic(match[2]);
          replacement = `<a href="#art${articleNum}-para${paraNum}" class="ref-link">${match[0]}</a>`;
        } else if (pattern.type === 'internal-ref') {
          // 内部条文参照
          if (match[0].includes('の')) {
            const mainArticle = this.convertToArabic(match[1]);
            const subArticle = this.convertToArabic(match[2]);
            const targetArticle = `${mainArticle}_${subArticle}`;
            replacement = `<a href="#art${targetArticle}" class="ref-link">${match[0]}</a>`;
          } else {
            const articleNum = this.convertToArabic(match[1]);
            replacement = `<a href="#art${articleNum}" class="ref-link">${match[0]}</a>`;
          }
        } else if (pattern.type === 'chapter-ref') {
          // 章参照
          replacement = `<span class="ref-link chapter-ref">${match[0]}</span>`;
        } else if (pattern.type === 'relative-chapter-ref') {
          // 前章・次章
          replacement = `<span class="ref-link relative-ref">${match[0]}</span>`;
        } else if (pattern.type === 'complex-ref') {
          // 複合参照（同項第○号など）
          replacement = `<span class="ref-link complex-ref">${match[0]}</span>`;
        } else if (pattern.type === 'application-ref') {
          // 準用規定
          replacement = `<span class="ref-link application-ref">${match[0]}</span>`;
        } else {
          // デフォルト
          replacement = `<span class="ref-link">${match[0]}</span>`;
        }
        
        // テキストを置換
        text = text.substring(0, start) + replacement + text.substring(end);
        
        // 処理済み範囲を記録（置換後の長さを考慮）
        processedRanges.push({
          start: start,
          end: start + replacement.length
        });
      }
    }
    
    return text;
  }

  getLawIdByName(lawName) {
    const lawNameMap = {
      '民法': '129AC0000000089',
      '商法': '132AC0000000048',
      '刑法': '140AC0000000045',
      '民事訴訟法': '155AC0000000048',
      '独占禁止法': '222AC0000000054',
      '労働基準法': '322AC0000000049',
      '消費税法': '323AC0000000108',
      '会社法': '417AC0000000086'
    };
    return lawNameMap[lawName];
  }

  escapeHtml(text) {
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
    <div class="header-container">
      <h1 class="site-title">LawFinder</h1>
      <nav class="header-nav">
        <a href="#">法令検索</a>
        <a href="#">新規制定・改正法令</a>
        <a href="#">法分野別</a>
        <a href="#">ヘルプ</a>
      </nav>
    </div>
  </header>

  <main class="container">
    <h2>法令一覧</h2>
    <div class="law-grid">
      ${Array.from(this.lawIndex.values()).map(law => `
        <a href="laws/${law.lawId}.html" class="law-card">
          <h3>${this.escapeHtml(law.lawTitle)}</h3>
          <p class="law-info">
            ${law.metadata.lawNum || ''}<br>
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
      font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 
                   'ヒラギノ角ゴ ProN W3', 'メイリオ', Meiryo, sans-serif;
      line-height: 1.8;
      color: #333;
      background-color: #f5f5f5;
    }
    
    .header {
      background-color: #003d7a;
      color: white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    
    .header-container {
      max-width: 100%;
      margin: 0 auto;
      padding: 0.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .site-title {
      font-size: 1.25rem;
      font-weight: normal;
    }
    
    .header-nav {
      display: flex;
      gap: 2rem;
    }
    
    .header-nav a {
      color: white;
      text-decoration: none;
      font-size: 0.9rem;
    }
    
    .header-nav a:hover {
      text-decoration: underline;
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    
    h2 {
      color: #003d7a;
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
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      text-decoration: none;
      color: inherit;
      transition: all 0.3s ease;
      border: 1px solid #e0e0e0;
    }
    
    .law-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
      border-color: #003d7a;
    }
    
    .law-card h3 {
      color: #003d7a;
      margin-bottom: 0.5rem;
      font-size: 1.1rem;
    }
    
    .law-info {
      color: #666;
      font-size: 0.9rem;
      line-height: 1.6;
    }`;
  }
}

// 実行
const generator = new EGovMainProvisionStaticSiteGenerator();
generator.generate().catch(console.error);