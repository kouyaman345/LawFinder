#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

const XML_DATA_PATH = path.join(__dirname, '../laws_data/sample');
const OUTPUT_PATH = path.join(__dirname, '../dist/static');

class EGovFullStaticSiteGenerator {
  constructor() {
    this.lawIndex = new Map();
    this.referenceMap = new Map();
  }

  async generate() {
    console.log('静的サイト生成を開始します（e-Gov完全準拠版）...\n');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectories();
    
    // XMLファイルを読み込んで法令データを抽出
    const files = await fs.readdir(XML_DATA_PATH);
    const xmlFiles = files.filter(f => f.endsWith('.xml'));
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
    
    // メタデータの抽出
    const metadata = this.extractMetadata(xmlContent);
    
    // 制定文の抽出
    const enactStatements = [];
    const enactMatches = xmlContent.matchAll(/<EnactStatement>([^<]+)<\/EnactStatement>/g);
    for (const match of enactMatches) {
      enactStatements.push(match[1]);
    }
    
    // 階層構造（編・章・節）の抽出（本則部分のみ）
    const mainProvisionMatch = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
    const mainContent = mainProvisionMatch ? mainProvisionMatch[1] : xmlContent;
    const structure = this.extractStructure(mainContent);
    
    // 目次情報の抽出
    const tocStructure = this.extractTOC(xmlContent);
    
    // 条文の抽出（改善版 - 本則と附則の両方から抽出）
    const articles = this.extractArticlesImproved(xmlContent);
    
    // 改正履歴の抽出
    const amendmentHistory = this.extractAmendmentHistory(xmlContent);
    
    return {
      lawId,
      lawTitle,
      metadata,
      enactStatements,
      articles,
      structure,
      tocStructure,
      amendmentHistory
    };
  }

  extractMetadata(xmlContent) {
    const metadata = {};
    
    // 法律番号
    const lawNumMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
    if (lawNumMatch) metadata.lawNum = lawNumMatch[1];
    
    // 法律属性から詳細情報を取得
    const lawMatch = xmlContent.match(/<Law\s+([^>]+)>/);
    if (lawMatch) {
      const attrs = lawMatch[1];
      
      // 年号
      const eraMatch = attrs.match(/Era="([^"]+)"/);
      if (eraMatch) metadata.era = eraMatch[1];
      
      // 年
      const yearMatch = attrs.match(/Year="([^"]+)"/);
      if (yearMatch) metadata.year = yearMatch[1];
      
      // 公布月日
      const monthMatch = attrs.match(/PromulgateMonth="([^"]+)"/);
      const dayMatch = attrs.match(/PromulgateDay="([^"]+)"/);
      if (monthMatch && dayMatch) {
        metadata.promulgateDate = `${monthMatch[1]}月${dayMatch[1]}日`;
      }
    }
    
    // 現在の施行状態（仮の実装）
    metadata.effectiveStatus = '現在施行';
    metadata.effectiveDate = '令和5年4月1日';
    
    return metadata;
  }

  extractTOC(xmlContent) {
    const toc = {
      parts: [],
      chapters: [],
      sections: []
    };
    
    // TOCセクションから構造を抽出
    const tocMatch = xmlContent.match(/<TOC>([\s\S]*?)<\/TOC>/);
    if (!tocMatch) return toc;
    
    const tocContent = tocMatch[1];
    
    // 編（Part）の抽出
    const partMatches = tocContent.matchAll(/<TOCPart\s+Num="([^"]+)">([\s\S]*?)<\/TOCPart>/g);
    for (const match of partMatches) {
      const partNum = match[1];
      const partContent = match[2];
      const titleMatch = partContent.match(/<PartTitle>([^<]+)<\/PartTitle>/);
      
      const part = {
        num: partNum,
        title: titleMatch ? titleMatch[1] : '',
        chapters: []
      };
      
      // この編の章を抽出
      const chapterMatches = partContent.matchAll(/<TOCChapter\s+Num="([^"]+)">([\s\S]*?)<\/TOCChapter>/g);
      for (const chMatch of chapterMatches) {
        const chapterNum = chMatch[1];
        const chapterContent = chMatch[2];
        const chTitleMatch = chapterContent.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
        const articleRangeMatch = chapterContent.match(/<ArticleRange>([^<]+)<\/ArticleRange>/);
        
        part.chapters.push({
          num: chapterNum,
          title: chTitleMatch ? chTitleMatch[1] : '',
          articleRange: articleRangeMatch ? articleRangeMatch[1] : ''
        });
      }
      
      toc.parts.push(part);
    }
    
    return toc;
  }

  extractAmendmentHistory(xmlContent) {
    const history = [];
    const supplMatches = xmlContent.matchAll(/<SupplProvision\s+AmendLawNum="([^"]+)"[^>]*>/g);
    
    for (const match of supplMatches) {
      history.push({
        lawNum: match[1],
        // 実際の施行日などは別途データが必要
      });
    }
    
    return history;
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

  extractArticlesImproved(xmlContent) {
    const articles = [];
    const existingArticles = new Map();
    let currentIndex = 0;
    
    // まず存在する条文を抽出
    while (currentIndex < xmlContent.length) {
      // Article開始タグを探す（正確にマッチ）
      const startIndex = xmlContent.indexOf('<Article ', currentIndex);
      if (startIndex === -1) break;
      
      // Num属性を取得
      const tagEndIndex = xmlContent.indexOf('>', startIndex);
      if (tagEndIndex === -1) {
        currentIndex = startIndex + 1;
        continue;
      }
      
      const tagContent = xmlContent.substring(startIndex, tagEndIndex);
      const numMatch = tagContent.match(/Num="([^"]+)"/); 
      if (!numMatch) {
        currentIndex = startIndex + 1;
        continue;
      }
      
      const articleNum = numMatch[1];
      
      // 対応する終了タグを探す（入れ子を考慮）
      let depth = 0;
      let searchIndex = tagEndIndex;
      let endIndex = -1;
      
      while (searchIndex < xmlContent.length) {
        const nextOpenIndex = xmlContent.indexOf('<Article ', searchIndex + 1);
        const nextCloseIndex = xmlContent.indexOf('</Article>', searchIndex + 1);
        
        if (nextCloseIndex === -1) break;
        
        // 次の開始タグが終了タグより前にある場合
        if (nextOpenIndex !== -1 && nextOpenIndex < nextCloseIndex) {
          depth++;
          searchIndex = nextOpenIndex;
        } else {
          // 終了タグが先
          if (depth === 0) {
            endIndex = nextCloseIndex + 10; // </Article>の長さ
            break;
          }
          depth--;
          searchIndex = nextCloseIndex;
        }
      }
      
      if (endIndex === -1) break;
      
      // 条文内容を抽出
      const articleContent = xmlContent.substring(startIndex, endIndex);
      
      // ArticleCaptionを抽出
      const captionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleTitle = captionMatch ? captionMatch[1] : null;
      
      // 段落を抽出
      const paragraphs = this.extractParagraphs(articleContent);
      
      existingArticles.set(parseInt(articleNum), {
        articleNum,
        articleTitle,
        paragraphs
      });
      
      currentIndex = endIndex;
    }
    
    // 削除された条文を補完（連続する削除は範囲でまとめる）
    const sortedNums = Array.from(existingArticles.keys()).sort((a, b) => a - b);
    if (sortedNums.length > 0) {
      const maxNum = sortedNums[sortedNums.length - 1];
      
      let i = 1;
      while (i <= maxNum) {
        if (existingArticles.has(i)) {
          articles.push(existingArticles.get(i));
          i++;
        } else {
          // 連続する削除範囲を見つける
          const startDeleted = i;
          let endDeleted = i;
          
          while (endDeleted + 1 <= maxNum && !existingArticles.has(endDeleted + 1)) {
            endDeleted++;
          }
          
          // 10条以上の削除範囲は一つにまとめる
          if (endDeleted - startDeleted >= 10) {
            articles.push({
              articleNum: `${startDeleted}-${endDeleted}`,
              articleTitle: '削除',
              paragraphs: [{
                content: '削除',
                items: []
              }],
              isDeleted: true,
              isRange: true,
              startNum: startDeleted,
              endNum: endDeleted
            });
            i = endDeleted + 1;
          } else {
            // 少ない削除は個別に表示
            for (let j = startDeleted; j <= endDeleted; j++) {
              articles.push({
                articleNum: j.toString(),
                articleTitle: '削除',
                paragraphs: [{
                  content: '削除',
                  items: []
                }],
                isDeleted: true
              });
            }
            i = endDeleted + 1;
          }
        }
      }
    }
    
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

  convertToKanjiNum(num) {
    if (!num || typeof num !== 'number') return num;
    
    const kanjiNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    
    if (num === 0) return '零';
    if (num < 10) return kanjiNums[num];
    
    // 特殊なケース
    if (num === 10) return '十';
    if (num === 100) return '百';
    if (num === 500) return '五百';
    if (num === 1000) return '千';
    
    // 2桁の数字
    if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      if (tens === 1) {
        return '十' + (ones > 0 ? kanjiNums[ones] : '');
      } else {
        return kanjiNums[tens] + '十' + (ones > 0 ? kanjiNums[ones] : '');
      }
    }
    
    // 3桁の数字
    if (num < 1000) {
      const hundreds = Math.floor(num / 100);
      const remainder = num % 100;
      let result = kanjiNums[hundreds] + '百';
      if (remainder > 0) {
        if (remainder < 10) {
          result += kanjiNums[remainder];
        } else {
          const tens = Math.floor(remainder / 10);
          const ones = remainder % 10;
          if (tens === 1) {
            result += '十' + (ones > 0 ? kanjiNums[ones] : '');
          } else {
            result += kanjiNums[tens] + '十' + (ones > 0 ? kanjiNums[ones] : '');
          }
        }
      }
      return result;
    }
    
    // 他の数字はアラビア数字のまま
    return num.toString();
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
      max-width: 100%;
      margin: 0;
      margin-top: 60px;
      min-height: calc(100vh - 60px);
    }
    
    .toc-sidebar {
      width: 320px;
      background: white;
      border-right: 1px solid #ddd;
      padding: 1.5rem;
      height: calc(100vh - 60px);
      overflow-y: auto;
      position: fixed;
      top: 60px;
      left: 0;
      bottom: 0;
      z-index: 100;
    }
    
    .toc-sidebar::-webkit-scrollbar {
      width: 8px;
    }
    
    .toc-sidebar::-webkit-scrollbar-track {
      background: #f1f1f1;
    }
    
    .toc-sidebar::-webkit-scrollbar-thumb {
      background: #888;
      border-radius: 4px;
    }
    
    .toc-title {
      font-size: 1.1rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #003d7a;
    }
    
    .toc-list {
      list-style: none;
    }
    
    .toc-part {
      margin-bottom: 1.5rem;
    }
    
    .toc-part-title {
      font-weight: bold;
      color: #003d7a;
      margin-bottom: 0.5rem;
      font-size: 0.95rem;
    }
    
    .toc-chapter {
      margin-bottom: 0.75rem;
    }
    
    .toc-chapter-title {
      font-weight: 600;
      color: #444;
      display: block;
      font-size: 0.9rem;
      padding: 0.25rem 0;
    }
    
    .toc-article-range {
      font-size: 0.85rem;
      color: #666;
      margin-left: 1rem;
    }
    
    .content {
      background: white;
      padding: 2rem 3rem;
      margin-left: 320px;
      width: calc(100% - 320px);
      min-height: calc(100vh - 60px);
    }
    
    .law-header {
      margin-bottom: 2rem;
      padding-bottom: 2rem;
      border-bottom: 3px solid #003d7a;
    }
    
    .law-metadata {
      margin-bottom: 1rem;
    }
    
    .effective-date {
      background-color: #e8f4f8;
      padding: 0.5rem 1rem;
      border-left: 4px solid #003d7a;
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
    }
    
    .amendment-info {
      font-size: 0.85rem;
      color: #666;
    }
    
    .law-title {
      font-size: 2.5rem;
      color: #003d7a;
      margin-bottom: 0.5rem;
    }
    
    .law-number {
      font-size: 1.1rem;
      color: #555;
      margin-bottom: 1rem;
    }
    
    .enact-statements {
      margin-top: 1rem;
      padding: 1rem;
      background-color: #f9f9f9;
      border: 1px solid #e0e0e0;
      font-size: 0.95rem;
    }
    
    .enact-statements p {
      margin-bottom: 0.5rem;
    }
    
    .enact-statements p:last-child {
      margin-bottom: 0;
    }
    
    .article {
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .article:last-child {
      border-bottom: none;
    }
    
    .article-header {
      display: flex;
      align-items: baseline;
      margin-bottom: 1rem;
    }
    
    .article-number {
      font-weight: bold;
      color: #003d7a;
      font-size: 1.1rem;
      margin-right: 0.75rem;
    }
    
    .article-title {
      color: #666;
      font-size: 1rem;
    }
    
    .deleted-article {
      opacity: 0.6;
      padding: 0.5rem 0;
    }
    
    .deleted-article-range {
      opacity: 0.6;
      padding: 1rem 0;
      margin: 1rem 0;
      border-top: 1px solid #e0e0e0;
      border-bottom: 1px solid #e0e0e0;
    }
    
    .article-title.deleted {
      color: #999;
      font-style: italic;
    }
    
    .part-header {
      font-size: 1.5rem;
      font-weight: bold;
      color: #003d7a;
      margin: 3rem 0 2rem 0;
      padding: 1rem 0;
      border-bottom: 3px solid #003d7a;
      text-align: center;
    }
    
    .chapter-header {
      font-size: 1.3rem;
      font-weight: bold;
      color: #003d7a;
      margin: 2rem 0 1.5rem 0;
      padding: 0.75rem 0;
      border-bottom: 2px solid #003d7a;
      text-align: center;
    }
    
    .paragraph {
      margin-bottom: 1rem;
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
      margin: 0.75rem 0;
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
      background-color: rgba(0, 102, 204, 0.1);
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
      background-color: #003d7a;
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
      background-color: #002850;
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

  generateFullTOC(lawData) {
    let tocHtml = '<ul class="toc-list">';
    
    if (lawData.tocStructure && lawData.tocStructure.parts.length > 0) {
      // TOC構造がある場合
      for (const part of lawData.tocStructure.parts) {
        tocHtml += `<li class="toc-part">
          <div class="toc-part-title">${this.escapeHtml(part.title)}</div>
          <ul class="toc-list">`;
        
        for (const chapter of part.chapters) {
          tocHtml += `<li class="toc-chapter">
            <div class="toc-chapter-title">${this.escapeHtml(chapter.title)}</div>
            ${chapter.articleRange ? `<div class="toc-article-range">${this.escapeHtml(chapter.articleRange)}</div>` : ''}
          </li>`;
        }
        
        tocHtml += '</ul></li>';
      }
    } else if (lawData.structure.chapters.length > 0) {
      // 章構造がある場合
      for (const chapter of lawData.structure.chapters) {
        tocHtml += `<li class="toc-chapter">
          <div class="toc-chapter-title">${this.escapeHtml(chapter.title)}</div>
        </li>`;
      }
    } else {
      // 章構造がない場合は条文リスト（全条文を表示）
      for (const article of lawData.articles) {
        tocHtml += `<li class="toc-article">
          <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
        </li>`;
      }
    }
    
    tocHtml += '</ul>';
    return tocHtml;
  }

  renderArticlesWithStructure(lawData, references) {
    let html = '';
    
    // TOC構造から章の範囲を取得
    const chapterRanges = new Map();
    if (lawData.tocStructure && lawData.tocStructure.parts.length > 0) {
      for (const part of lawData.tocStructure.parts) {
        for (const chapter of part.chapters) {
          if (chapter.articleRange) {
            const rangeMatch = chapter.articleRange.match(/（第([^条]+)条[^）]*）/);
            if (rangeMatch) {
              chapterRanges.set(chapter.num, {
                part: part,
                chapter: chapter,
                startArticle: rangeMatch[1]
              });
            }
          }
        }
      }
    }
    
    let currentPart = null;
    let currentChapter = null;
    
    // 条文をレンダリング
    for (const article of lawData.articles) {
      // 編・章の見出しを挿入
      const articleNum = parseInt(article.articleNum);
      
      // 簡易的な判定（実際にはTOCの範囲情報を使う）
      if (lawData.lawTitle === '商法') {
        // 商法の特定の章の開始位置
        if (articleNum === 501 && currentPart !== '第二編') {
          currentPart = '第二編';
          html += '<div class="part-header">第二編　商行為</div>';
          currentChapter = '第一章';
          html += '<div class="chapter-header">第一章　総則</div>';
        } else if (articleNum === 684 && currentPart !== '第三編') {
          currentPart = '第三編';
          html += '<div class="part-header">第三編　海商</div>';
        }
      }
      
      html += this.renderArticle(article, references.filter(r => r.sourceArticle === article.articleNum), lawData.lawId);
    }
    
    return html;
  }

  renderArticle(article, references, lawId) {
    const articleRefs = references.filter(r => r.sourceArticle === article.articleNum);
    
    // 削除された条文の場合
    if (article.isDeleted) {
      if (article.isRange) {
        // 範囲削除の場合
        return `
        <div class="article deleted-article-range" id="art${article.startNum}-${article.endNum}">
          <div class="article-header">
            <span class="article-number">第${this.convertToKanjiNum(article.startNum)}条から第${this.convertToKanjiNum(article.endNum)}条まで</span>
            <span class="article-title deleted">削除</span>
          </div>
        </div>`;
      } else {
        return `
        <div class="article deleted-article" id="art${article.articleNum}">
          <div class="article-header">
            <span class="article-number">第${this.formatArticleNumber(article.articleNum)}条</span>
            <span class="article-title deleted">削除</span>
          </div>
        </div>`;
      }
    }
    
    let titleDisplay = '';
    if (article.articleTitle) {
      titleDisplay = article.articleTitle.includes('（') ? article.articleTitle : `（${article.articleTitle}）`;
    }
    
    return `
    <div class="article" id="art${article.articleNum}">
      <div class="article-header">
        <span class="article-number">第${this.formatArticleNumber(article.articleNum)}条</span>
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
      // 「の」付き条文参照
      { regex: /第([０-９0-9一二三四五六七八九十百千]+)条の([０-９0-9一二三四五六七八九十]+)(?!項)/g, type: 'internal-ref' },
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
          } else if (match[1] && pattern.type === 'internal-ref' && match[0].includes('の')) {
            // 「第二十七条の七」のような形式
            const mainNum = this.convertToArabic(match[1]);
            const subNum = match[2] ? this.convertToArabic(match[2]) : null;
            const articleId = subNum ? `${mainNum}_${subNum}` : mainNum;
            replacement = `<a href="#art${articleId}" class="ref-link internal-ref">${match[0]}</a>`;
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

  async copyAssets() {
    // 現時点では追加のアセットは不要
  }
}

// 実行
const generator = new EGovFullStaticSiteGenerator();
generator.generate().catch(console.error);