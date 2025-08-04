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
    console.log('静的サイト生成を開始します（e-Govスタイル版）...\n');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectories();
    
    // XMLファイルを読み込んで法令データを抽出
    const files = await fs.readdir(XML_DATA_PATH);
    const xmlFiles = files.filter(f => f.endsWith('.xml')).slice(0, 2); // テスト用に2件のみ
    console.log(`${xmlFiles.length}件の法令を処理します\n`);

    console.log('Phase 1: 法令データの読み込み');
    for (const file of xmlFiles) {
      const lawData = await this.parseLawXML(file);
      if (lawData) {
        this.lawIndex.set(lawData.lawId, lawData);
        console.log(`  - ${lawData.lawTitle} を読み込みました`);
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
    
    // 条文の抽出
    const articles = [];
    const articleMatches = mainContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
    for (const match of articleMatches) {
      const articleNum = match[1];
      const articleContent = match[2];
      
      const captionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleTitle = captionMatch ? captionMatch[1] : null;
      
      const paragraphs = this.extractParagraphs(articleContent);
      
      articles.push({
        articleNum,
        articleTitle,
        paragraphs
      });
    }

    return {
      lawId,
      lawTitle,
      articles,
      structure
    };
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
        const articleRefs = this.detectReferences(article, lawId);
        references.push(...articleRefs);
      }
      
      this.referenceMap.set(lawId, references);
      console.log(`  → ${references.length}個の参照を検出`);
    }
  }

  detectReferences(article, lawId) {
    const references = [];
    const text = this.getArticleText(article);
    
    // 参照パターンのマッチング
    const patterns = [
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条/g, type: 'INTERNAL_REFERENCE' },
      { regex: /(民法|商法|刑法|会社法|労働基準法|民事訴訟法|刑事訴訟法|憲法|行政法|税法|独占禁止法|消費税法|所得税法|法人税法|相続税法|関税法|消費者契約法|特定商取引法|個人情報保護法|著作権法|特許法|商標法|意匠法|実用新案法|不正競争防止法|独占禁止法|下請法|建築基準法|都市計画法|道路法|河川法|森林法|農地法|漁業法|鉱業法|電気事業法|ガス事業法|水道法|下水道法|廃棄物処理法|大気汚染防止法|水質汚濁防止法|土壌汚染対策法|騒音規制法|振動規制法|悪臭防止法|自然公園法|自然環境保全法|鳥獣保護法|種の保存法|外来生物法|動物愛護法|食品衛生法|薬事法|医療法|医師法|歯科医師法|保健師助産師看護師法|介護保険法|国民健康保険法|国民年金法|厚生年金保険法|雇用保険法|労働者災害補償保険法|最低賃金法|労働契約法|パートタイム労働法|労働者派遣法|男女雇用機会均等法|育児・介護休業法|労働組合法|労働関係調整法|国家公務員法|地方公務員法|教育基本法|学校教育法|社会教育法|私立学校法|文化財保護法|児童福祉法|母子保健法|生活保護法|社会福祉法|老人福祉法|身体障害者福祉法|知的障害者福祉法|精神保健福祉法|発達障害者支援法|障害者総合支援法|障害者差別解消法|児童虐待防止法|DV防止法|ストーカー規制法|暴力団対策法|銃刀法|火薬類取締法|高圧ガス保安法|消防法|道路交通法|船舶法|船員法|海上運送法|港湾法|航空法|鉄道事業法|貨物自動車運送事業法|倉庫業法|通関法|外国為替及び外国貿易法|輸出入取引法|関税定率法|とん税法|特別とん税法|電波法|放送法|電気通信事業法|郵便法|金融商品取引法|銀行法|保険業法|信託法|資金決済法|貸金業法|割賦販売法|出資法|利息制限法|破産法|民事再生法|会社更生法|特定調停法|仲裁法|公証人法|弁護士法|司法書士法|行政書士法|税理士法|公認会計士法|不動産鑑定士法|土地家屋調査士法|社会保険労務士法|中小企業診断士法|技術士法|建築士法|測量法|旅行業法|宅地建物取引業法|マンション管理適正化法|住宅品質確保法|景観法|屋外広告物法|風俗営業法|旅館業法|公衆浴場法|興行場法|美容師法|理容師法|クリーニング業法|獣医師法|家畜伝染病予防法|と畜場法|食鳥処理法|飼料安全法|肥料取締法|農薬取締法|種苗法|家畜改良増殖法|競馬法|自転車競技法|小型自動車競走法|モーターボート競走法|警察法|海上保安庁法|自衛隊法|日米安全保障条約|国際連合憲章|難民条約|国籍法|出入国管理法|外国人登録法|旅券法|戸籍法|住民基本台帳法|印鑑登録法|公職選挙法|政治資金規正法|政党助成法|国会法|内閣法|裁判所法|検察庁法|地方自治法|地方税法|地方交付税法|地方公営企業法|警察法|消防組織法|災害対策基本法|災害救助法|被災者生活再建支援法|激甚災害法|原子力基本法|原子力規制法|放射線障害防止法|原子力災害対策特別措置法|新型インフルエンザ対策特別措置法|感染症法|検疫法|予防接種法|臓器移植法|血液法|毒物劇物取締法|麻薬及び向精神薬取締法|覚せい剤取締法|大麻取締法|あへん法|安全保障貿易管理|化学兵器禁止法|生物兵器禁止法|対人地雷禁止法|クラスター弾禁止法|国際刑事裁判所規程|国際人道法|国際人権法).*?第([０-９0-9一二三四五六七八九十百千]+)条/g, type: 'EXTERNAL_REFERENCE' },
      { regex: /(前項|次項|前条|次条|同項|同条)/g, type: 'RELATIVE_REFERENCE' },
      { regex: /同項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'COMPLEX_REFERENCE' },
      { regex: /前項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'COMPLEX_REFERENCE' }
    ];
    
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern.regex);
      for (const match of matches) {
        references.push({
          sourceArticle: article.articleNum,
          sourceText: match[0],
          type: pattern.type,
          confidence: 0.9
        });
      }
    }
    
    return references;
  }

  getArticleText(article) {
    let text = '';
    for (const para of article.paragraphs) {
      text += para.content + '\n';
      for (const item of para.items) {
        text += item.content + '\n';
        for (const subitem of item.subitems) {
          text += subitem.content + '\n';
        }
      }
    }
    return text;
  }

  async generateHTMLFiles() {
    for (const [lawId, lawData] of this.lawIndex) {
      const references = this.referenceMap.get(lawId) || [];
      const html = this.generateLawHTML(lawData, references);
      await fs.writeFile(
        path.join(OUTPUT_PATH, 'laws', `${lawId}.html`),
        html,
        'utf-8'
      );
      console.log(`  - ${lawData.lawTitle} のHTMLを生成`);
    }
  }

  generateLawHTML(lawData, references) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(lawData.lawTitle)} | LawFinder 法令検索</title>
  <link rel="stylesheet" href="../assets/style.css">
</head>
<body>
  <header class="gov-header">
    <div class="container">
      <h1 class="site-title">
        <a href="../index.html">LawFinder 法令検索</a>
      </h1>
      <nav class="nav-menu">
        <a href="../index.html">ホーム</a>
        <a href="#">法令検索</a>
        <a href="#">新規制定・改正法令</a>
        <a href="#">ヘルプ</a>
      </nav>
    </div>
  </header>
  
  <main class="law-main">
    <div class="law-container">
      <div class="law-header">
        <h2 class="law-title">${this.escapeHtml(lawData.lawTitle)}</h2>
      </div>
      
      <div class="law-layout">
        <aside class="toc-sidebar">
          <div class="toc-header">目次</div>
          <div class="toc-content">
            ${this.generateTOC(lawData)}
          </div>
        </aside>
        
        <div class="law-text">
          ${lawData.articles.map(article => this.renderArticle(article, references, lawData.lawId)).join('\n')}
        </div>
      </div>
    </div>
  </main>
  
  <footer class="gov-footer">
    <div class="container">
      <p>LawFinder - 日本法令検索システム（e-Govスタイル版）</p>
    </div>
  </footer>
  
  <script>
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
  </script>
</body>
</html>`;
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
      
      ${article.paragraphs.map((para, idx) => this.renderParagraph(para, idx, article.paragraphs.length, articleRefs, lawId)).join('\n')}
    </div>`;
  }

  renderParagraph(paragraph, index, totalParagraphs, references, lawId) {
    const hasNumber = totalParagraphs > 1 && index > 0;
    let content = this.escapeHtml(paragraph.content);
    
    // 参照リンクの適用
    content = this.applyReferenceLinks(content, references, lawId);
    
    let html = '<div class="paragraph">';
    
    if (hasNumber) {
      html += `<span class="paragraph-num">${index + 1}</span>`;
      html += `<div class="paragraph-text">${content}`;
    } else {
      html += `<div class="paragraph-text no-indent">${content}`;
    }
    
    // 号（Items）の表示
    if (paragraph.items.length > 0) {
      html += '<div class="items">';
      for (const item of paragraph.items) {
        html += this.renderItem(item, references, lawId);
      }
      html += '</div>';
    }
    
    html += '</div></div>';
    return html;
  }

  renderItem(item, references, lawId) {
    let content = this.escapeHtml(item.content);
    content = this.applyReferenceLinks(content, references, lawId);
    
    let html = `<div class="item">
      <span class="item-num">${item.title}</span>
      <div class="item-text">${content}`;
    
    // サブアイテム（イロハ）の表示
    if (item.subitems.length > 0) {
      html += '<div class="subitems">';
      for (const subitem of item.subitems) {
        html += this.renderSubitem(subitem, references, lawId);
      }
      html += '</div>';
    }
    
    html += '</div></div>';
    return html;
  }

  renderSubitem(subitem, references, lawId) {
    let content = this.escapeHtml(subitem.content);
    content = this.applyReferenceLinks(content, references, lawId);
    
    let html = `<div class="subitem">
      <span class="subitem-num">${subitem.title}</span>
      <div class="subitem-text">${content}`;
    
    // サブサブアイテム（括弧数字）の表示
    if (subitem.subsubitems && subitem.subsubitems.length > 0) {
      html += '<div class="subsubitems">';
      for (const subsubitem of subitem.subsubitems) {
        let subsubContent = this.escapeHtml(subsubitem.content);
        subsubContent = this.applyReferenceLinks(subsubContent, references, lawId);
        
        html += `<div class="subsubitem">
          <span class="subsubitem-num">${subsubitem.title}</span>
          <div class="subsubitem-text">${subsubContent}</div>
        </div>`;
      }
      html += '</div>';
    }
    
    html += '</div></div>';
    return html;
  }

  applyReferenceLinks(text, references, lawId) {
    let result = text;
    
    // 参照を長い順にソート（より具体的な参照を優先）
    const sortedRefs = references.sort((a, b) => b.sourceText.length - a.sourceText.length);
    
    for (const ref of sortedRefs) {
      const escapedText = ref.sourceText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedText, 'g');
      
      if (ref.type === 'INTERNAL_REFERENCE') {
        const targetArticle = ref.sourceText.match(/第([０-９0-9一二三四五六七八九十百千]+)条/);
        if (targetArticle) {
          const articleNum = this.convertToArabic(targetArticle[1]);
          result = result.replace(regex, `<a href="#art${articleNum}" class="ref-link internal-ref">${ref.sourceText}</a>`);
        }
      } else if (ref.type === 'EXTERNAL_REFERENCE') {
        result = result.replace(regex, `<a href="#" class="ref-link external-ref">${ref.sourceText}</a>`);
      } else {
        result = result.replace(regex, `<span class="ref-link relative-ref">${ref.sourceText}</span>`);
      }
    }
    
    return result;
  }

  convertToArabic(num) {
    const kanjiToArabic = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15,
      '十六': 16, '十七': 17, '十八': 18, '十九': 19, '二十': 20,
      '三十': 30, '四十': 40, '五十': 50, '六十': 60, '七十': 70,
      '八十': 80, '九十': 90, '百': 100, '二百': 200, '三百': 300
    };
    
    return kanjiToArabic[num] || num;
  }

  async generateIndexPage() {
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawFinder 法令検索</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="gov-header">
    <div class="container">
      <h1 class="site-title">LawFinder 法令検索</h1>
      <nav class="nav-menu">
        <a href="#">ホーム</a>
        <a href="#">法令検索</a>
        <a href="#">新規制定・改正法令</a>
        <a href="#">ヘルプ</a>
      </nav>
    </div>
  </header>
  
  <main class="container">
    <h2>法令一覧</h2>
    <div class="law-list">
      ${Array.from(this.lawIndex.values()).map(law => `
        <div class="law-item">
          <h3><a href="laws/${law.lawId}.html">${this.escapeHtml(law.lawTitle)}</a></h3>
          <p>条文数: ${law.articles.length}</p>
        </div>
      `).join('')}
    </div>
  </main>
  
  <footer class="gov-footer">
    <div class="container">
      <p>LawFinder - 日本法令検索システム</p>
    </div>
  </footer>
</body>
</html>`;
    
    await fs.writeFile(path.join(OUTPUT_PATH, 'index.html'), html, 'utf-8');
  }

  async copyAssets() {
    const css = `/* e-Gov風スタイルシート */
body {
  margin: 0;
  padding: 0;
  font-family: "メイリオ", "Meiryo", "ヒラギノ角ゴ Pro W3", sans-serif;
  line-height: 1.6;
  color: #333;
  background-color: #f5f5f5;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 20px;
}

/* ヘッダー */
.gov-header {
  background-color: #003f8e;
  color: white;
  padding: 10px 0;
}

.site-title {
  margin: 0;
  font-size: 24px;
  font-weight: normal;
}

.site-title a {
  color: white;
  text-decoration: none;
}

.nav-menu {
  margin-top: 10px;
}

.nav-menu a {
  color: white;
  text-decoration: none;
  margin-right: 20px;
  font-size: 14px;
}

.nav-menu a:hover {
  text-decoration: underline;
}

/* 法令表示レイアウト */
.law-main {
  background-color: white;
  min-height: calc(100vh - 150px);
}

.law-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.law-header {
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #003f8e;
}

.law-title {
  font-size: 28px;
  font-weight: bold;
  margin: 0;
}

.law-layout {
  display: flex;
  gap: 30px;
}

/* サイドバー目次 */
.toc-sidebar {
  flex: 0 0 300px;
  position: sticky;
  top: 20px;
  height: calc(100vh - 120px);
  overflow-y: auto;
  background-color: #f8f8f8;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.toc-header {
  background-color: #003f8e;
  color: white;
  padding: 10px 15px;
  font-weight: bold;
  font-size: 16px;
}

.toc-content {
  padding: 10px;
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-article {
  border-bottom: 1px solid #eee;
}

.toc-article a {
  display: block;
  padding: 8px 10px;
  color: #0066cc;
  text-decoration: none;
  font-size: 14px;
}

.toc-article a:hover {
  background-color: #e6f2ff;
}

/* スクロールバーのスタイル */
.toc-sidebar::-webkit-scrollbar {
  width: 6px;
}

.toc-sidebar::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.toc-sidebar::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 3px;
}

/* 法令本文 */
.law-text {
  flex: 1;
  background-color: white;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

/* 条文 */
.article {
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.article:last-child {
  border-bottom: none;
}

.article-header {
  margin-bottom: 15px;
  font-size: 18px;
}

.article-number {
  font-weight: bold;
  color: #003f8e;
}

.article-title {
  margin-left: 10px;
  color: #666;
}

/* 段落 */
.paragraph {
  margin-bottom: 15px;
  display: flex;
  align-items: flex-start;
}

.paragraph-num {
  flex: 0 0 30px;
  text-align: right;
  margin-right: 15px;
  font-weight: normal;
}

.paragraph-text {
  flex: 1;
  line-height: 1.8;
}

.paragraph-text.no-indent {
  margin-left: 45px;
}

/* 号 */
.items {
  margin-top: 10px;
  margin-left: 45px;
}

.item {
  margin-bottom: 10px;
  display: flex;
  align-items: flex-start;
}

.item-num {
  flex: 0 0 40px;
  text-align: right;
  margin-right: 15px;
}

.item-text {
  flex: 1;
  line-height: 1.8;
}

/* サブアイテム（イロハ） */
.subitems {
  margin-top: 8px;
  margin-left: 55px;
}

.subitem {
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
}

.subitem-num {
  flex: 0 0 30px;
  text-align: right;
  margin-right: 15px;
}

.subitem-text {
  flex: 1;
  line-height: 1.8;
}

/* サブサブアイテム（括弧数字） */
.subsubitems {
  margin-top: 5px;
  margin-left: 45px;
}

.subsubitem {
  margin-bottom: 5px;
  display: flex;
  align-items: flex-start;
}

.subsubitem-num {
  flex: 0 0 40px;
  text-align: right;
  margin-right: 15px;
}

.subsubitem-text {
  flex: 1;
  line-height: 1.8;
}

/* 参照リンク */
.ref-link {
  color: #0066cc;
  text-decoration: none;
  border-bottom: 1px dotted #0066cc;
}

.ref-link:hover {
  background-color: #fff3cd;
}

.ref-link.internal-ref {
  color: #0066cc;
}

.ref-link.external-ref {
  color: #dc3545;
}

.ref-link.relative-ref {
  color: #28a745;
  cursor: default;
}

/* フッター */
.gov-footer {
  background-color: #f8f8f8;
  border-top: 1px solid #ddd;
  padding: 20px 0;
  margin-top: 50px;
  text-align: center;
  color: #666;
}

/* レスポンシブ */
@media (max-width: 1024px) {
  .law-layout {
    flex-direction: column;
  }
  
  .toc-sidebar {
    position: static;
    height: auto;
    max-height: 400px;
    margin-bottom: 20px;
  }
}

/* 法令一覧 */
.law-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 30px;
}

.law-item {
  background-color: white;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.law-item h3 {
  margin: 0 0 10px;
  font-size: 18px;
}

.law-item a {
  color: #0066cc;
  text-decoration: none;
}

.law-item a:hover {
  text-decoration: underline;
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
      .replace(/'/g, '&#039;');
  }
}

// メイン実行
if (require.main === module) {
  const generator = new EGovStaticSiteGenerator();
  generator.generate().catch(console.error);
}

module.exports = EGovStaticSiteGenerator;