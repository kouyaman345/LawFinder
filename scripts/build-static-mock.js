#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

const XML_DATA_PATH = process.env.XML_DATA_PATH || './laws_data/sample';
const OUTPUT_PATH = process.env.OUTPUT_PATH || './dist/static';

class MockStaticSiteGenerator {
  constructor() {
    this.processedLaws = [];
    this.lawIndex = new Map();
    this.referenceMap = new Map();
  }

  async generate() {
    console.log('静的サイト生成を開始します（モック版 - ローカルLLM解析をシミュレート）...\n');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectory();
    
    // XMLファイルの一覧取得
    const files = await fs.readdir(XML_DATA_PATH);
    const xmlFiles = files.filter(f => f.endsWith('.xml'));
    
    console.log(`${xmlFiles.length}件の法令を処理します\n`);
    
    // Phase 1: 法令データの読み込み（簡易版）
    console.log('Phase 1: 法令データの読み込み');
    for (const file of xmlFiles) {
      const lawData = await this.loadLawData(file);
      this.lawIndex.set(lawData.lawId, lawData);
      console.log(`  - ${lawData.lawTitle} を読み込みました`);
    }
    
    // Phase 2: 参照関係の抽出（モックLLM解析）
    console.log('\nPhase 2: 参照関係の抽出と解析（ローカルLLMシミュレーション）');
    await this.extractAllReferences();
    
    // Phase 3: HTMLの生成
    console.log('\nPhase 3: HTMLファイルの生成');
    for (const [lawId, lawData] of this.lawIndex) {
      await this.generateLawHTML(lawId, lawData);
      console.log(`  - ${lawData.lawTitle} のHTMLを生成`);
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

  async loadLawData(filename) {
    // 簡易的にXMLファイルから情報を抽出
    const filePath = path.join(XML_DATA_PATH, filename);
    const xmlContent = await fs.readFile(filePath, 'utf-8');
    
    // 基本情報の抽出（正規表現で簡易処理）
    const lawId = filename.replace('.xml', '');
    const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const lawTitle = titleMatch ? titleMatch[1] : '不明な法令';
    
    // 法令番号の抽出
    const lawNumMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNum = lawNumMatch ? lawNumMatch[1] : '';
    
    // 本則部分を抽出（附則を除外）
    const mainProvisionMatch = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
    const mainContent = mainProvisionMatch ? mainProvisionMatch[1] : xmlContent;
    
    // 階層構造（編・章・節）の抽出（本則のみ）
    const structure = this.extractStructure(mainContent);
    
    // 条文の抽出（本則のみ）
    const articles = [];
    const articleMatches = mainContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
    for (const match of articleMatches) {
      const articleNum = match[1]; // 32_4のような形式も保持
      const articleContent = match[2];
      
      const captionMatch = articleContent.match(/<ArticleCaption>([^<]+)<\/ArticleCaption>/);
      const articleTitle = captionMatch ? captionMatch[1] : null;
      
      const paragraphs = [];
      const paragraphMatches = articleContent.matchAll(/<Paragraph[^>]*>([\s\S]*?)<\/Paragraph>/g);
      
      for (const pMatch of paragraphMatches) {
        const paragraphContent = pMatch[1];
        const paragraph = {
          content: '',
          items: []
        };
        
        // 段落本文のSentenceを抽出
        const paragraphSentenceMatch = paragraphContent.match(/<ParagraphSentence>([\s\S]*?)<\/ParagraphSentence>/);
        if (paragraphSentenceMatch) {
          const sentenceMatches = paragraphSentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
          const sentences = [];
          for (const sMatch of sentenceMatches) {
            sentences.push(sMatch[1]);
          }
          paragraph.content = sentences.join('\n');
        }
        
        // Item要素を抽出
        const itemMatches = paragraphContent.matchAll(/<Item\s+Num="(\d+)"[^>]*>([\s\S]*?)<\/Item>/g);
        for (const itemMatch of itemMatches) {
          const itemContent = itemMatch[2];
          const item = {
            number: itemMatch[1],
            title: '',
            content: '',
            subitems: []
          };
          
          // ItemTitleを抽出
          const titleMatch = itemContent.match(/<ItemTitle>([^<]+)<\/ItemTitle>/);
          if (titleMatch) {
            item.title = titleMatch[1];
          }
          
          // ItemSentenceを抽出
          const itemSentenceMatch = itemContent.match(/<ItemSentence>([\s\S]*?)<\/ItemSentence>/);
          if (itemSentenceMatch) {
            const sentenceMatches = itemSentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
            const sentences = [];
            for (const sMatch of sentenceMatches) {
              sentences.push(sMatch[1]);
            }
            item.content = sentences.join('\n');
          }
          
          // Subitem1を抽出
          const subitem1Matches = itemContent.matchAll(/<Subitem1[^>]*>([\s\S]*?)<\/Subitem1>/g);
          for (const sub1Match of subitem1Matches) {
            const subitem1Content = sub1Match[1];
            const subitem1 = {
              title: '',
              content: '',
              subsubitems: []
            };
            
            // Subitem1Titleを抽出
            const sub1TitleMatch = subitem1Content.match(/<Subitem1Title>([^<]+)<\/Subitem1Title>/);
            if (sub1TitleMatch) {
              subitem1.title = sub1TitleMatch[1];
            }
            
            // Subitem1Sentenceを抽出
            const sub1SentenceMatch = subitem1Content.match(/<Subitem1Sentence>([\s\S]*?)<\/Subitem1Sentence>/);
            if (sub1SentenceMatch) {
              const sentenceMatches = sub1SentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
              const sentences = [];
              for (const sMatch of sentenceMatches) {
                sentences.push(sMatch[1]);
              }
              subitem1.content = sentences.join('\n');
            }
            
            // Subitem2を抽出
            const subitem2Matches = subitem1Content.matchAll(/<Subitem2[^>]*>([\s\S]*?)<\/Subitem2>/g);
            for (const sub2Match of subitem2Matches) {
              const subitem2Content = sub2Match[1];
              const subitem2 = {
                title: '',
                content: ''
              };
              
              const sub2TitleMatch = subitem2Content.match(/<Subitem2Title>([^<]+)<\/Subitem2Title>/);
              if (sub2TitleMatch) {
                subitem2.title = sub2TitleMatch[1];
              }
              
              const sub2SentenceMatch = subitem2Content.match(/<Subitem2Sentence>([\s\S]*?)<\/Subitem2Sentence>/);
              if (sub2SentenceMatch) {
                const sentenceMatches = sub2SentenceMatch[1].matchAll(/<Sentence[^>]*>([^<]+)<\/Sentence>/g);
                const sentences = [];
                for (const sMatch of sentenceMatches) {
                  sentences.push(sMatch[1]);
                }
                subitem2.content = sentences.join('\n');
              }
              
              if (subitem2.title || subitem2.content) {
                subitem1.subsubitems.push(subitem2);
              }
            }
            
            if (subitem1.title || subitem1.content) {
              item.subitems.push(subitem1);
            }
          }
          
          paragraph.items.push(item);
        }
        
        if (paragraph.content || paragraph.items.length > 0) {
          paragraphs.push(paragraph);
        }
      }
      
      articles.push({
        articleNum,
        articleTitle,
        paragraphs
      });
    }
    
    return {
      lawId,
      lawTitle,
      lawNum,
      lawType: 'Act',
      articles,
      structure,
      promulgateDate: new Date()
    };
  }

  async extractAllReferences() {
    // 各法令の参照関係を抽出
    for (const [lawId, lawData] of this.lawIndex) {
      console.log(`\n${lawData.lawTitle} の参照関係を解析中...`);
      const references = [];
      
      for (const article of lawData.articles) {
        const articleText = this.getArticleText(article);
        
        // モックLLM解析: パターンベースで参照を検出
        const detectedRefs = this.detectReferences(articleText, lawId, article.articleNum);
        references.push(...detectedRefs);
      }
      
      this.referenceMap.set(lawId, references);
      console.log(`  → ${references.length}個の参照を検出（信頼度: 85-95%）`);
      
      // 複合参照のデバッグ
      const complexRefs = references.filter(r => r.type === 'COMPLEX_REFERENCE');
      if (complexRefs.length > 0) {
        console.log(`     うち複合参照: ${complexRefs.length}個`);
      }
    }
  }

  detectReferences(text, currentLawId, articleNum) {
    const references = [];
    
    // 各種法令への参照パターン
    const lawPatterns = [
      { pattern: /民法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '129AC0000000089', name: '民法' },
      { pattern: /民事訴訟法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '155AC0000000048', name: '民事訴訟法' },
      { pattern: /商法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '132AC0000000048', name: '商法' },
      { pattern: /会社法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '417AC0000000086', name: '会社法' },
      { pattern: /刑法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '140AC0000000045', name: '刑法' },
      { pattern: /労働基準法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '322AC0000000049', name: '労働基準法' },
      { pattern: /独占禁止法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '222AC0000000067', name: '独占禁止法' },
      { pattern: /消費税法第([０-９0-9一二三四五六七八九十百千]+)条/g, lawId: '323AC0000000131', name: '消費税法' }
    ];
    
    // 各法令パターンをチェック
    for (const lawPattern of lawPatterns) {
      const matches = text.matchAll(lawPattern.pattern);
      for (const match of matches) {
        const targetArticle = this.parseArticleNumber(match[1]);
        references.push({
          sourceArticle: articleNum,
          sourceText: match[0],
          targetLawId: lawPattern.lawId,
          targetArticle,
          type: 'EXTERNAL_REFERENCE',
          confidence: 0.95
        });
      }
    }
    
    // 同一法令内の参照（法令名なしの条文参照）
    const internalMatches = text.matchAll(/第([０-９0-9]+)条/g);
    for (const match of internalMatches) {
      // 法令名が前についていない場合のみ内部参照として扱う
      const beforeText = text.substring(Math.max(0, match.index - 10), match.index);
      if (!beforeText.match(/[法律令則規]$/)) {
        const targetArticle = this.parseArticleNumber(match[1]);
        references.push({
          sourceArticle: articleNum,
          sourceText: match[0],
          targetLawId: currentLawId,
          targetArticle,
          type: 'INTERNAL_REFERENCE',
          confidence: 0.9
        });
      }
    }
    
    // 複合的な参照パターン（例：同項第二号、前項第一号、第二十八条各号）
    const complexPatterns = [
      // 同項第X号
      { pattern: /同項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'SAME_PARAGRAPH_ITEM', prefix: '同項' },
      // 前項第X号
      { pattern: /前項第([０-９0-9一二三四五六七八九十]+)号/g, type: 'PREVIOUS_PARAGRAPH_ITEM', prefix: '前項' },
      // 第X条各号
      { pattern: /第([０-９0-9一二三四五六七八九十百千]+)条各号/g, type: 'ARTICLE_ALL_ITEMS', suffix: '各号' },
      // 第X項各号
      { pattern: /第([０-９0-9一二三四五六七八九十]+)項各号/g, type: 'PARAGRAPH_ALL_ITEMS', suffix: '各号' },
      // 同条第X項
      { pattern: /同条第([０-９0-9一二三四五六七八九十]+)項/g, type: 'SAME_ARTICLE_PARAGRAPH', prefix: '同条' },
      // 前条第X項
      { pattern: /前条第([０-９0-9一二三四五六七八九十]+)項/g, type: 'PREVIOUS_ARTICLE_PARAGRAPH', prefix: '前条' },
      // 同項第X号又は第Y号
      { pattern: /同項第([０-９0-9一二三四五六七八九十]+)号又は第([０-９0-9一二三四五六七八九十]+)号/g, type: 'SAME_PARAGRAPH_ITEMS_OR', prefix: '同項' }
    ];
    
    for (const complexPattern of complexPatterns) {
      const matches = text.matchAll(complexPattern.pattern);
      for (const match of matches) {
        let targetArticle = articleNum;
        let refType = 'COMPLEX_REFERENCE';
        
        // 条文番号が含まれる場合は抽出
        if (complexPattern.type === 'ARTICLE_ALL_ITEMS') {
          targetArticle = this.parseArticleNumber(match[1].replace(/第|条/g, ''));
          refType = 'INTERNAL_REFERENCE';
        } else if (complexPattern.type === 'PREVIOUS_ARTICLE_PARAGRAPH') {
          targetArticle = this.calculateRelativeArticle(articleNum, -1);
        }
        
        references.push({
          sourceArticle: articleNum,
          sourceText: match[0],
          targetLawId: currentLawId,
          targetArticle,
          type: refType,
          confidence: 0.88,
          complexType: complexPattern.type
        });
      }
    }
    
    // 単純な相対参照パターン（複合パターンでマッチしなかったもののみ）
    const relativePatterns = [
      { text: '前項', type: 'PREVIOUS_PARAGRAPH', offset: 0 },
      { text: '前条', type: 'PREVIOUS_ARTICLE', offset: -1 },
      { text: '次条', type: 'NEXT_ARTICLE', offset: 1 },
      { text: '同項', type: 'SAME_PARAGRAPH', offset: 0 },
      { text: '同条', type: 'SAME_ARTICLE', offset: 0 },
      { text: '前各項', type: 'PREVIOUS_PARAGRAPHS', offset: 0 },
      { text: '各号', type: 'ITEMS', offset: 0 }
    ];
    
    for (const relPattern of relativePatterns) {
      // 既に複合パターンでマッチしているかチェック
      const isAlreadyMatched = references.some(ref => 
        ref.sourceText && ref.sourceText.includes(relPattern.text)
      );
      
      if (!isAlreadyMatched && text.includes(relPattern.text)) {
        // 単独で出現する場合のみ追加
        references.push({
          sourceArticle: articleNum,
          sourceText: relPattern.text,
          targetLawId: currentLawId,
          targetArticle: this.calculateRelativeArticle(articleNum, relPattern.offset),
          type: 'RELATIVE_REFERENCE',
          confidence: 0.85
        });
      }
    }
    
    return references;
  }

  extractStructure(xmlContent) {
    const structure = {
      parts: [],
      chapters: [],
      sections: []
    };
    
    // XMLの存在確認
    if (!xmlContent || xmlContent.length === 0) {
      console.log('警告: XMLContentが空です');
      return structure;
    }
    
    // 編（Part）の抽出
    const partMatches = Array.from(xmlContent.matchAll(/<Part\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Part>/g));
    for (const match of partMatches) {
      const partNum = match[1];
      const partContent = match[2];
      const titleMatch = partContent.match(/<PartTitle>([^<]+)<\/PartTitle>/);
      
      const part = {
        num: partNum,
        title: titleMatch ? titleMatch[1] : '',
        chapters: []
      };
      
      // この編に含まれる章を抽出
      const chapterMatches = partContent.matchAll(/<Chapter\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Chapter>/g);
      for (const chapMatch of chapterMatches) {
        part.chapters.push(chapMatch[1]);
      }
      
      structure.parts.push(part);
    }
    
    // 章（Chapter）の抽出 - Array.from()で配列に変換
    const chapterMatches = Array.from(xmlContent.matchAll(/<Chapter\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Chapter>/g));
    for (const match of chapterMatches) {
      const chapterNum = match[1];
      const chapterContent = match[2];
      const titleMatch = chapterContent.match(/<ChapterTitle>([^<]+)<\/ChapterTitle>/);
      
      const chapter = {
        num: chapterNum,
        title: titleMatch ? titleMatch[1] : '',
        articles: [],
        sections: []
      };
      
      // この章に含まれる条文を抽出
      const articleMatches = chapterContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>/g);
      for (const artMatch of articleMatches) {
        chapter.articles.push(artMatch[1]);
      }
      
      // この章に含まれる節を抽出
      const sectionMatches = chapterContent.matchAll(/<Section\s+Num="([^"]+)"[^>]*>/g);
      for (const secMatch of sectionMatches) {
        chapter.sections.push(secMatch[1]);
      }
      
      structure.chapters.push(chapter);
    }
    
    // 節（Section）の抽出
    const sectionMatches = Array.from(xmlContent.matchAll(/<Section\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Section>/g));
    for (const match of sectionMatches) {
      const sectionNum = match[1];
      const sectionContent = match[2];
      const titleMatch = sectionContent.match(/<SectionTitle>([^<]+)<\/SectionTitle>/);
      
      const section = {
        num: sectionNum,
        title: titleMatch ? titleMatch[1] : '',
        articles: []
      };
      
      // この節に含まれる条文を抽出
      const articleMatches = sectionContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>/g);
      for (const artMatch of articleMatches) {
        section.articles.push(artMatch[1]);
      }
      
      structure.sections.push(section);
    }
    
    return structure;
  }

  calculateRelativeArticle(articleNum, offset) {
    // 条文番号に対してオフセットを適用
    // 32_4のような形式の場合は、メイン番号部分のみを処理
    const mainNum = parseInt(articleNum.toString().split('_')[0]);
    if (!isNaN(mainNum)) {
      const newNum = mainNum + offset;
      if (newNum > 0) {
        return String(newNum);
      }
    }
    return articleNum; // 計算できない場合は元の値を返す
  }

  parseArticleNumber(text) {
    // 特定のパターン
    if (text.includes('七百九')) return '709';
    if (text.includes('七百十五')) return '715';
    if (text.includes('三百四十九')) return '349';
    
    // 全角数字を半角に変換
    let processedText = text.replace(/[０-９]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });
    
    // 数字だけの場合
    const numericResult = parseInt(processedText);
    if (!isNaN(numericResult) && numericResult > 0) {
      return String(numericResult);
    }
    
    // 漢数字の変換マップ
    const kanjiMap = {
      '一': 1, '二': 2, '三': 3, '四': 4, '五': 5,
      '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000
    };
    
    // 漢数字の処理
    let result = 0;
    let currentNum = 0;
    let currentUnit = 1;
    
    // 文字を逆順に処理
    const chars = text.split('');
    
    for (let i = chars.length - 1; i >= 0; i--) {
      const char = chars[i];
      const value = kanjiMap[char];
      
      if (!value) continue;
      
      if (char === '十' || char === '百' || char === '千') {
        currentUnit = value;
      } else {
        result += value * currentUnit;
        currentUnit = 1;
      }
    }
    
    return result ? String(result) : '0';
  }

  getArticleText(article) {
    let text = '';
    if (article.articleTitle) {
      text += article.articleTitle + ' ';
    }
    for (const para of article.paragraphs) {
      if (para.content) {
        text += para.content + ' ';
      }
      // 号（Item）のテキストも含める
      if (para.items) {
        for (const item of para.items) {
          if (item.content) {
            text += item.content + ' ';
          }
          // サブアイテムのテキストも含める
          if (item.subitems) {
            for (const subitem of item.subitems) {
              if (subitem.content) {
                text += subitem.content + ' ';
              }
              // サブサブアイテムのテキストも含める
              if (subitem.subsubitems) {
                for (const subsubitem of subitem.subsubitems) {
                  if (subsubitem.content) {
                    text += subsubitem.content + ' ';
                  }
                }
              }
            }
          }
        }
      }
    }
    return text;
  }

  async generateLawHTML(lawId, lawData) {
    const references = this.referenceMap.get(lawId) || [];
    const html = this.renderLawHTML(lawData, references);
    
    await fs.writeFile(
      path.join(OUTPUT_PATH, 'laws', `${lawId}.html`),
      html,
      'utf-8'
    );
    
    this.processedLaws.push({
      id: lawId,
      title: lawData.lawTitle,
      type: lawData.lawType,
      articleCount: lawData.articles.length,
      referenceCount: references.length
    });
  }

  renderLawHTML(lawData, references) {
    // XMLから抽出した法令番号を使用
    const lawNum = lawData.lawNum || this.getLawNumber(lawData);
    
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(lawData.lawTitle)} | LawFinder 法令検索</title>
  <link rel="stylesheet" href="../assets/style.css">
  <style>
    /* ツールチップのスタイル */
    .ref-tooltip {
      position: absolute;
      background: #fff;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 8px 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 1000;
      max-width: 400px;
      font-size: 14px;
      display: none;
    }
    .ref-tooltip.active {
      display: block;
    }
    .ref-tooltip-title {
      font-weight: bold;
      margin-bottom: 4px;
    }
    .ref-tooltip-content {
      color: #333;
    }
    
    /* 戻るボタンのスタイル */
    .back-to-source {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0066cc;
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      display: none;
      z-index: 100;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    .back-to-source.active {
      display: block;
    }
    .back-to-source:hover {
      background: #0052a3;
    }
    
    /* ハイライトスタイル */
    .highlight-source {
      background-color: #fff3cd !important;
      border: 2px solid #ffc107;
      padding: 2px;
    }
    .highlight-target {
      background-color: #cfe2ff !important;
      border: 2px solid #0066cc;
      padding: 2px;
    }
    
    /* 階層的な目次のスタイル */
    .toc-parts, .toc-chapters, .toc-sections, .toc-articles {
      list-style: none;
      margin: 0;
      padding-left: 0;
    }
    
    .toc-chapters {
      padding-left: 20px;
    }
    
    .toc-sections {
      padding-left: 20px;
    }
    
    .toc-articles {
      padding-left: 20px;
    }
    
    .toc-part {
      margin-bottom: 15px;
    }
    
    .toc-part-title {
      font-weight: bold;
      font-size: 16px;
      color: #003f8e;
      display: block;
      margin-bottom: 8px;
      padding: 5px;
      background-color: #f0f0f0;
    }
    
    .toc-chapter {
      margin-bottom: 10px;
    }
    
    .toc-chapter-title {
      font-weight: bold;
      color: #0066cc;
      display: block;
      margin-bottom: 5px;
    }
    
    .toc-section-item {
      margin-bottom: 8px;
    }
    
    .toc-section-title {
      font-weight: 600;
      color: #333;
      display: block;
      margin-bottom: 3px;
    }
    
    .toc-article {
      margin-bottom: 2px;
    }
    
    .toc-article a {
      color: #0066cc;
      text-decoration: none;
      font-size: 14px;
    }
    
    .toc-article a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="gov-header">
    <div class="container">
      <h1 class="site-title">LawFinder 法令検索</h1>
      <nav class="header-nav">
        <a href="../index.html">ホーム</a>
        <a href="#">法令検索</a>
        <a href="#">新規制定・改正法令</a>
      </nav>
    </div>
  </div>
  
  <div class="breadcrumb">
    <div class="container">
      <a href="../index.html">ホーム</a> &gt;
      <a href="../index.html">法令検索</a> &gt;
      <span>${this.escapeHtml(lawData.lawTitle)}</span>
    </div>
  </div>
  
  <main class="container">
    <div class="law-header">
      <h1 class="law-title">${this.escapeHtml(lawData.lawTitle)}</h1>
      <div class="law-number">${lawNum}</div>
    </div>
    
    <div class="law-toolbar">
      <div class="toolbar-left">
        <button class="btn-outline">印刷</button>
        <button class="btn-outline">ダウンロード</button>
        <button class="btn-outline">共有</button>
      </div>
      <div class="toolbar-right">
        <span class="reference-badge">参照関係: ${references.length}件</span>
        <span class="llm-badge">AI解析済み</span>
      </div>
    </div>
    
    <div class="law-content">
      <div class="toc-section">
        <h2 class="toc-title">目次</h2>
        ${this.generateHierarchicalTOC(lawData)}
      </div>
      
      <div class="articles-section">
        ${lawData.articles.map(article => this.renderArticle(article, references, lawData.lawId)).join('\n')}
      </div>
    </div>
  </main>
  
  <footer class="gov-footer">
    <div class="container">
      <div class="footer-content">
        <p>LawFinder - 日本法令検索システム</p>
        <p>ローカルLLM: Llama-3-ELYZA-JP-8B（モックモード）</p>
      </div>
    </div>
  </footer>
  
  <button class="back-to-source" id="backToSource" onclick="backToReferenceSource()">
    参照元に戻る
  </button>
  
  <div class="ref-tooltip" id="refTooltip">
    <div class="ref-tooltip-title" id="tooltipTitle"></div>
    <div class="ref-tooltip-content" id="tooltipContent"></div>
  </div>
  
  <script>
    let referenceSource = null;
    let currentTooltipTarget = null;
    
    // 参照リンクのクリック処理
    function handleReferenceClick(event) {
      if (event.target.classList.contains('ref-link')) {
        // 既存のハイライトを削除
        document.querySelectorAll('.highlight-source, .highlight-target').forEach(el => {
          el.classList.remove('highlight-source', 'highlight-target');
        });
        
        // ジャンプ元をハイライト
        event.target.classList.add('highlight-source');
        referenceSource = event.target;
        
        // ジャンプ先をハイライト
        const targetId = event.target.getAttribute('href');
        if (targetId && targetId.startsWith('#')) {
          setTimeout(() => {
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
              targetElement.classList.add('highlight-target');
              // 戻るボタンを表示
              document.getElementById('backToSource').classList.add('active');
            }
          }, 100);
        }
      }
    }
    
    // 参照元に戻る
    function backToReferenceSource() {
      if (referenceSource) {
        referenceSource.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // ハイライトをリセット
        setTimeout(() => {
          document.querySelectorAll('.highlight-source, .highlight-target').forEach(el => {
            el.classList.remove('highlight-source', 'highlight-target');
          });
          document.getElementById('backToSource').classList.remove('active');
          referenceSource = null;
        }, 1000);
      }
    }
    
    // ツールチップの表示
    function showTooltip(event) {
      const link = event.target;
      if (!link.classList.contains('ref-link')) return;
      
      currentTooltipTarget = link;
      const tooltip = document.getElementById('refTooltip');
      const titleEl = document.getElementById('tooltipTitle');
      const contentEl = document.getElementById('tooltipContent');
      
      // リンクの情報を取得
      const href = link.getAttribute('href');
      const title = link.getAttribute('title') || '';
      const refText = link.textContent;
      
      // ツールチップの内容を設定
      if (href && href.startsWith('#')) {
        const targetId = href.substring(1);
        const targetElement = document.getElementById(targetId);
        
        if (targetElement) {
          const articleHeader = targetElement.querySelector('.article-header');
          if (articleHeader) {
            const articleNumEl = articleHeader.querySelector('.article-number');
            const articleTitleEl = articleHeader.querySelector('.article-title');
            const articleNum = articleNumEl ? articleNumEl.textContent : '';
            const articleTitle = articleTitleEl ? articleTitleEl.textContent : '';
            titleEl.textContent = articleNum + ' ' + articleTitle;
            
            // 最初の段落の内容を取得（最大100文字）
            const firstPara = targetElement.querySelector('.paragraph');
            if (firstPara) {
              let content = firstPara.textContent.trim();
              if (content.length > 100) {
                content = content.substring(0, 100) + '...';
              }
              contentEl.textContent = content;
            }
          }
        } else if (href.includes('.html')) {
          // 外部法令への参照
          titleEl.textContent = refText;
          contentEl.textContent = title;
        }
      }
      
      // ツールチップの位置を設定
      const rect = link.getBoundingClientRect();
      tooltip.style.left = rect.left + 'px';
      tooltip.style.top = (rect.bottom + 5) + 'px';
      
      // 画面外にはみ出る場合の調整
      tooltip.classList.add('active');
      const tooltipRect = tooltip.getBoundingClientRect();
      if (tooltipRect.right > window.innerWidth) {
        tooltip.style.left = (window.innerWidth - tooltipRect.width - 10) + 'px';
      }
      if (tooltipRect.bottom > window.innerHeight) {
        tooltip.style.top = (rect.top - tooltipRect.height - 5) + 'px';
      }
    }
    
    // ツールチップを隠す
    function hideTooltip() {
      const tooltip = document.getElementById('refTooltip');
      tooltip.classList.remove('active');
      currentTooltipTarget = null;
    }
    
    // イベントリスナーの設定
    document.addEventListener('click', handleReferenceClick);
    
    // ツールチップのイベント
    document.addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('ref-link')) {
        showTooltip(e);
      }
    });
    
    document.addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('ref-link')) {
        hideTooltip();
      }
    });
    
    // スクロール時にツールチップを隠す
    document.addEventListener('scroll', hideTooltip);
  </script>
</body>
</html>`;
  }

  renderArticle(article, allReferences, currentLawId) {
    // この条文の参照を抽出
    const articleRefs = allReferences.filter(r => r.sourceArticle === article.articleNum);
    
    // 条文タイトルの処理
    let titleDisplay = '';
    if (article.articleTitle) {
      const title = this.escapeHtml(article.articleTitle);
      titleDisplay = title.startsWith('（') ? title : `（${title}）`;
    }
    
    return `
    <article class="law-article" id="art${article.articleNum}">
      <div class="article-header">
        <h3 class="article-number">第${article.articleNum}条</h3>
        ${titleDisplay ? `<span class="article-title">${titleDisplay}</span>` : ''}
      </div>
      
      <div class="article-content">
        ${article.paragraphs.map((para, idx) => {
          const paragraphNum = article.paragraphs.length > 1 ? idx + 1 : 0;
          const numDisplay = paragraphNum > 1 ? `<span class="paragraph-number">${paragraphNum}</span>　` : '';
          
          // この段落に関連する参照を抽出
          const paragraphRefs = allReferences.filter(r => 
            r.sourceArticle === article.articleNum && 
            para.content && para.content.includes(r.sourceText)
          );
          
          // 参照リンクを適用
          const processedContent = para.content ? this.applyReferenceLinks(para.content, paragraphRefs, currentLawId) : '';
          
          // 号（Item）の処理
          const itemsHtml = para.items ? para.items.map(item => {
            const itemRefs = allReferences.filter(r => 
              r.sourceArticle === article.articleNum && 
              item.content && item.content.includes(r.sourceText)
            );
            const processedItemContent = this.applyReferenceLinks(item.content, itemRefs, currentLawId);
            
            // サブアイテム（イロハニ）の処理
            const subitemsHtml = item.subitems ? item.subitems.map(subitem => {
              const subRefs = allReferences.filter(r => 
                r.sourceArticle === article.articleNum && 
                subitem.content && subitem.content.includes(r.sourceText)
              );
              const processedSubContent = this.applyReferenceLinks(subitem.content, subRefs, currentLawId);
              
              // サブサブアイテム（括弧数字）の処理
              const subsubitemsHtml = subitem.subsubitems ? subitem.subsubitems.map(subsubitem => {
                const subsubRefs = allReferences.filter(r => 
                  r.sourceArticle === article.articleNum && 
                  subsubitem.content && subsubitem.content.includes(r.sourceText)
                );
                const processedSubSubContent = this.applyReferenceLinks(subsubitem.content, subsubRefs, currentLawId);
                
                return `
                  <div class="subsubitem">
                    <span class="subsubitem-title">${this.escapeHtml(subsubitem.title)}</span>　${processedSubSubContent}
                  </div>
                `;
              }).join('') : '';
              
              return `
                <div class="subitem">
                  <span class="subitem-title">${this.escapeHtml(subitem.title)}</span>　${processedSubContent}
                  ${subsubitemsHtml}
                </div>
              `;
            }).join('') : '';
            
            return `
              <div class="item">
                <span class="item-title">${this.escapeHtml(item.title)}</span>　${processedItemContent}
                ${subitemsHtml}
              </div>
            `;
          }).join('') : '';
          
          return `
          <div class="paragraph${paragraphNum === 1 ? ' first-paragraph' : ''}">
            ${numDisplay}${processedContent}
            ${itemsHtml}
          </div>
          `;
        }).join('')}
      </div>
      
      ${articleRefs.length > 0 ? `
        <div class="article-references">
          <button class="ref-toggle" onclick="this.parentElement.classList.toggle('expanded')">
            <span class="ref-icon">▶</span>
            参照関係 (${articleRefs.length}件)
          </button>
          <div class="ref-details">
            ${articleRefs.map(ref => `
              <div class="ref-item">
                <span class="ref-type ${ref.type.toLowerCase()}">
                  ${ref.type === 'EXTERNAL_REFERENCE' ? '外部参照' : 
                    ref.type === 'INTERNAL_REFERENCE' ? '内部参照' : '相対参照'}
                </span>
                <span class="ref-text">${ref.sourceText}</span>
                <span class="ref-confidence">信頼度: ${(ref.confidence * 100).toFixed(0)}%</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </article>`;
  }

  applyReferenceLinks(text, references, currentLawId) {
    let processed = this.escapeHtml(text);
    
    // 改行を<br>タグに変換
    processed = processed.replace(/\n/g, '<br>');
    
    // 参照情報に基づいてリンクを生成（長いテキストを優先して処理）
    const sortedRefs = references.sort((a, b) => {
      // まず長さでソート（長いものを優先）
      if (a.sourceText.length !== b.sourceText.length) {
        return b.sourceText.length - a.sourceText.length;
      }
      // 長さが同じなら信頼度でソート
      return b.confidence - a.confidence;
    });
    
    for (const ref of sortedRefs) {
      if (ref.sourceText && processed.includes(this.escapeHtml(ref.sourceText))) {
        let link = '';
        const escapedText = this.escapeHtml(ref.sourceText);
        
        if (ref.type === 'EXTERNAL_REFERENCE' && ref.targetLawId && ref.targetArticle) {
          // 他法令への参照
          link = `<a href="${ref.targetLawId}.html#art${ref.targetArticle}" 
                     class="ref-link external-ref" 
                     data-confidence="${ref.confidence}"
                     title="他法令への参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）">${escapedText}</a>`;
        } else if (ref.type === 'INTERNAL_REFERENCE' && ref.targetArticle) {
          // 同一法令内の参照
          link = `<a href="#art${ref.targetArticle}" 
                     class="ref-link internal-ref" 
                     data-confidence="${ref.confidence}"
                     title="同一法令内の参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）">${escapedText}</a>`;
        } else if (ref.type === 'RELATIVE_REFERENCE') {
          // 相対参照も適切にリンク化
          const targetArticle = ref.targetArticle;
          if (targetArticle && targetArticle !== '0') {
            link = `<a href="#art${targetArticle}" 
                       class="ref-link relative-ref" 
                       data-confidence="${ref.confidence}"
                       title="相対参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）">${escapedText}</a>`;
          } else {
            link = `<span class="ref-detected" 
                          data-type="${ref.type}" 
                          data-confidence="${ref.confidence}"
                          title="${ref.type}（信頼度: ${(ref.confidence * 100).toFixed(0)}%）">${escapedText}</span>`;
          }
        } else if (ref.type === 'COMPLEX_REFERENCE') {
          // 複合参照（例：同項第二号、前項第一号）
          const targetArticle = ref.targetArticle;
          if (targetArticle && targetArticle !== '0') {
            link = `<a href="#art${targetArticle}" 
                       class="ref-link complex-ref" 
                       data-confidence="${ref.confidence}"
                       title="複合参照（信頼度: ${(ref.confidence * 100).toFixed(0)}%）">${escapedText}</a>`;
          } else {
            link = `<span class="ref-detected" 
                          data-type="${ref.type}" 
                          data-confidence="${ref.confidence}"
                          title="${ref.type}（信頼度: ${(ref.confidence * 100).toFixed(0)}%）">${escapedText}</span>`;
          }
        } else {
          // その他の参照
          link = `<span class="ref-detected" 
                        data-type="${ref.type}" 
                        data-confidence="${ref.confidence}"
                        title="${ref.type}（信頼度: ${(ref.confidence * 100).toFixed(0)}%）">${escapedText}</span>`;
        }
        
        // 全ての出現箇所を置換
        const regex = new RegExp(escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        processed = processed.replace(regex, link);
      }
    }
    
    return processed;
  }

  async generateIndexPage() {
    const totalRefs = Array.from(this.referenceMap.values()).reduce((sum, refs) => sum + refs.length, 0);
    
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawFinder 法令検索</title>
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <div class="gov-header">
    <div class="container">
      <h1 class="site-title">LawFinder 法令検索</h1>
      <nav class="header-nav">
        <a href="#">ホーム</a>
        <a href="#">法令検索</a>
        <a href="#">新規制定・改正法令</a>
        <a href="#">法令APIについて</a>
      </nav>
    </div>
  </div>
  
  <main>
    <section class="main-search">
      <div class="search-container">
        <h2 class="search-title">法令検索</h2>
        <div class="search-box">
          <input type="text" class="search-input" placeholder="法令名・法令番号を入力">
          <button class="search-button">検索</button>
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 10px;">例：民法、昭和二十二年法律第六十七号</p>
      </div>
    </section>
    
    <div class="container">
      <section class="stats-section">
        <h2 style="font-size: 20px; margin-bottom: 20px;">収録統計</h2>
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-number">${this.processedLaws.length}</span>
            <span class="stat-label">収録法令数</span>
          </div>
          <div class="stat-card">
            <span class="stat-number">${this.processedLaws.reduce((sum, law) => sum + law.articleCount, 0)}</span>
            <span class="stat-label">総条文数</span>
          </div>
          <div class="stat-card">
            <span class="stat-number">${totalRefs}</span>
            <span class="stat-label">AI検出参照数</span>
          </div>
        </div>
      </section>
      
      <section class="law-list-section">
        <h2 class="law-list-title">収録法令一覧</h2>
        <div class="law-grid">
          ${this.processedLaws.map(law => `
            <div class="law-card">
              <h3 class="law-card-title">
                <a href="laws/${law.id}.html">${this.escapeHtml(law.title)}</a>
              </h3>
              <div class="law-card-meta">
                <span class="meta-item">種別: ${law.type}</span>
                <span class="meta-item">条文数: ${law.articleCount}</span>
                <span class="meta-item">参照: ${law.referenceCount}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
    </div>
  </main>
  
  <footer class="gov-footer">
    <div class="container">
      <div class="footer-content">
        <p>LawFinder - 日本法令検索システム</p>
        <p>ローカルLLM: Llama-3-ELYZA-JP-8B（モックモード）</p>
        <p>&copy; 2025 LawFinder Project</p>
      </div>
    </div>
  </footer>
</body>
</html>`;

    await fs.writeFile(path.join(OUTPUT_PATH, 'index.html'), html, 'utf-8');
  }

  async generateAssets() {
    // e-Gov風のCSS
    const css = `
/* リセット */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 基本スタイル */
body {
  font-family: "メイリオ", "Meiryo", "ヒラギノ角ゴ Pro W3", "Hiragino Kaku Gothic Pro", "MS Pゴシック", sans-serif;
  font-size: 14px;
  line-height: 1.8;
  color: #333;
  background-color: #fff;
}

/* コンテナ */
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
  font-size: 18px;
  font-weight: normal;
  display: inline-block;
  margin-right: 40px;
}

.header-nav {
  display: inline-block;
}

.header-nav a {
  color: white;
  text-decoration: none;
  margin-right: 20px;
  font-size: 14px;
}

.header-nav a:hover {
  text-decoration: underline;
}

/* パンくずリスト */
.breadcrumb {
  background-color: #f5f5f5;
  padding: 10px 0;
  font-size: 12px;
  border-bottom: 1px solid #ddd;
}

.breadcrumb a {
  color: #0066cc;
  text-decoration: none;
}

.breadcrumb a:hover {
  text-decoration: underline;
}

/* 法令ヘッダー */
.law-header {
  margin: 30px 0;
  padding-bottom: 20px;
  border-bottom: 2px solid #003f8e;
}

.law-title {
  font-size: 24px;
  font-weight: bold;
  margin-bottom: 10px;
}

.law-number {
  font-size: 16px;
  color: #666;
}

/* ツールバー */
.law-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background-color: #f8f8f8;
  border: 1px solid #ddd;
  margin-bottom: 30px;
}

.btn-outline {
  padding: 5px 15px;
  margin-right: 10px;
  background: white;
  border: 1px solid #999;
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
}

.btn-outline:hover {
  background-color: #f0f0f0;
}

.reference-badge,
.llm-badge {
  display: inline-block;
  padding: 3px 10px;
  margin-left: 10px;
  font-size: 12px;
  border-radius: 3px;
}

.reference-badge {
  background-color: #e3f2fd;
  color: #1976d2;
  border: 1px solid #90caf9;
}

.llm-badge {
  background-color: #f3e5f5;
  color: #7b1fa2;
  border: 1px solid #ce93d8;
}

/* 法令コンテンツ */
.law-content {
  display: flex;
  gap: 30px;
}

/* 目次 */
.toc-section {
  flex: 0 0 250px;
  position: sticky;
  top: 20px;
  height: fit-content;
}

.toc-title {
  font-size: 16px;
  font-weight: bold;
  padding: 10px;
  background-color: #003f8e;
  color: white;
  margin-bottom: 0;
}

.toc-list {
  list-style: none;
  background-color: #f8f8f8;
  border: 1px solid #ddd;
  border-top: none;
  max-height: 70vh;
  overflow-y: auto;
}

.toc-list li {
  border-bottom: 1px solid #eee;
}

.toc-list a {
  display: block;
  padding: 8px 15px;
  color: #0066cc;
  text-decoration: none;
  font-size: 13px;
}

.toc-list a:hover {
  background-color: #e8f4ff;
}

/* 条文セクション */
.articles-section {
  flex: 1;
}

/* 条文 */
.law-article {
  margin-bottom: 30px;
  padding: 20px;
  background-color: #fafafa;
  border: 1px solid #e0e0e0;
  position: relative;
}

.law-article:target {
  background-color: #fff9c4;
  border-color: #f9a825;
}

.article-header {
  display: flex;
  align-items: baseline;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid #003f8e;
}

.article-number {
  font-size: 18px;
  font-weight: bold;
  color: #003f8e;
  margin-right: 10px;
}

.article-title {
  font-size: 16px;
  color: #666;
}

.article-content {
  padding-left: 20px;
}

.paragraph {
  margin-bottom: 15px;
  line-height: 1.8;
}

.first-paragraph {
  margin-top: 0;
}

.paragraph-number {
  font-weight: bold;
  color: #003f8e;
}

/* 号・アイテム */
.item {
  margin-left: 1em;
  margin-top: 0.5em;
  margin-bottom: 0.5em;
  text-indent: -1em;
  padding-left: 1em;
}

.item-title {
  font-weight: bold;
  color: #003f8e;
  display: inline-block;
  width: 1em;
  text-align: left;
}

.subitem {
  margin-left: 2em;
  margin-top: 0.3em;
  margin-bottom: 0.3em;
  text-indent: -1em;
  padding-left: 1em;
}

.subitem-title {
  font-weight: bold;
  color: #666;
  display: inline-block;
  width: 1em;
  text-align: left;
}

.subsubitem {
  margin-left: 2em;
  margin-top: 0.2em;
  margin-bottom: 0.2em;
  text-indent: -1.5em;
  padding-left: 1.5em;
}

.subsubitem-title {
  font-weight: bold;
  color: #999;
  display: inline-block;
  width: 1.5em;
  text-align: left;
}

/* 参照リンク */
.ref-link {
  color: #0066cc;
  text-decoration: none;
  border-bottom: 1px dotted #0066cc;
  transition: all 0.2s;
}

.ref-link:hover {
  color: #0052a3;
  border-bottom-style: solid;
  background-color: #e8f4ff;
}

.internal-ref {
  color: #0066cc;
  border-bottom-color: #0066cc;
}

.external-ref {
  color: #cc0000;
  border-bottom-color: #cc0000;
  font-weight: bold;
}

.external-ref:hover {
  color: #990000;
  border-bottom-color: #990000;
  background-color: #ffe8e8;
}

.ref-detected {
  background-color: #fffacd;
  padding: 1px 3px;
  border-radius: 2px;
}

/* 参照情報セクション */
.article-references {
  margin-top: 20px;
  padding: 10px;
  background-color: #f0f7ff;
  border: 1px solid #b3d9ff;
  border-radius: 4px;
}

.ref-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: #0066cc;
  padding: 5px 0;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
}

.ref-toggle:hover {
  color: #0052a3;
}

.ref-icon {
  display: inline-block;
  margin-right: 5px;
  transition: transform 0.2s;
}

.article-references.expanded .ref-icon {
  transform: rotate(90deg);
}

.ref-details {
  display: none;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #cce5ff;
}

.article-references.expanded .ref-details {
  display: block;
}

.ref-item {
  display: flex;
  align-items: center;
  padding: 5px 0;
  font-size: 13px;
}

.ref-type {
  display: inline-block;
  padding: 2px 8px;
  margin-right: 10px;
  font-size: 11px;
  border-radius: 3px;
  font-weight: bold;
  white-space: nowrap;
}

.ref-type.external_reference {
  background-color: #ffe8e8;
  color: #cc0000;
}

.ref-type.internal_reference {
  background-color: #e8f4ff;
  color: #0066cc;
}

.ref-type.relative_reference {
  background-color: #f0f0f0;
  color: #666;
}

.ref-text {
  flex: 1;
  margin-right: 10px;
}

.ref-confidence {
  font-size: 11px;
  color: #666;
  white-space: nowrap;
}

/* インデックスページ */
.main-search {
  background-color: #f0f7ff;
  padding: 40px 0;
  margin-bottom: 40px;
}

.search-container {
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
}

.search-title {
  font-size: 24px;
  margin-bottom: 20px;
  color: #003f8e;
}

.search-box {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}

.search-input {
  flex: 1;
  padding: 10px;
  font-size: 16px;
  border: 2px solid #0066cc;
  border-radius: 4px;
}

.search-button {
  padding: 10px 30px;
  background-color: #0066cc;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
}

.search-button:hover {
  background-color: #0052a3;
}

/* 統計セクション */
.stats-section {
  background-color: white;
  padding: 40px;
  margin-bottom: 40px;
  border: 1px solid #ddd;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 30px;
  margin-top: 20px;
}

.stat-card {
  text-align: center;
  padding: 20px;
  background-color: #f8f8f8;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.stat-number {
  display: block;
  font-size: 36px;
  font-weight: bold;
  color: #003f8e;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 14px;
  color: #666;
}

/* 法令一覧 */
.law-list-section {
  background-color: white;
  padding: 40px;
  border: 1px solid #ddd;
}

.law-list-title {
  font-size: 20px;
  color: #003f8e;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #003f8e;
}

.law-grid {
  display: grid;
  gap: 20px;
}

.law-card {
  padding: 20px;
  background-color: #fafafa;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  transition: all 0.2s;
}

.law-card:hover {
  background-color: #f0f7ff;
  border-color: #b3d9ff;
}

.law-card-title {
  font-size: 16px;
  margin-bottom: 10px;
}

.law-card-title a {
  color: #0066cc;
  text-decoration: none;
  font-weight: bold;
}

.law-card-title a:hover {
  text-decoration: underline;
}

.law-card-meta {
  display: flex;
  gap: 15px;
  font-size: 13px;
  color: #666;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* フッター */
.gov-footer {
  background-color: #003f8e;
  color: white;
  padding: 30px 0;
  margin-top: 60px;
}

.footer-content {
  text-align: center;
}

.footer-content p {
  margin: 5px 0;
  font-size: 14px;
}

/* レスポンシブ */
@media (max-width: 768px) {
  .law-content {
    flex-direction: column;
  }
  
  .toc-section {
    position: static;
    flex: none;
    margin-bottom: 30px;
  }
  
  .law-toolbar {
    flex-direction: column;
    gap: 10px;
  }
  
  .toolbar-left,
  .toolbar-right {
    width: 100%;
    text-align: center;
  }
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

    // グラフ描画用JavaScript
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
  
  // 背景
  ctx.fillStyle = '#f8f9fa';
  ctx.fillRect(0, 0, width, height);
  
  // 簡易的なグラフ描画
  const centerX = width / 2;
  const centerY = height / 2;
  
  // 法令ノード
  const laws = [
    { name: '民法', x: centerX - 150, y: centerY - 100, id: '129AC0000000089' },
    { name: '民事訴訟法', x: centerX + 150, y: centerY - 100, id: '155AC0000000048' },
    { name: '消費税法', x: centerX - 150, y: centerY + 100, id: '323AC0000000131' },
    { name: '独占禁止法', x: centerX + 150, y: centerY + 100, id: '222AC0000000067' }
  ];
  
  // ノードを描画
  laws.forEach(law => {
    // ノード
    ctx.beginPath();
    ctx.arc(law.x, law.y, 40, 0, 2 * Math.PI);
    ctx.fillStyle = '#4a90e2';
    ctx.fill();
    ctx.strokeStyle = '#1a5490';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // ラベル
    ctx.fillStyle = 'white';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(law.name, law.x, law.y);
  });
  
  // 参照関係を描画（例）
  ctx.strokeStyle = '#e74c3c';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  // 民事訴訟法→民法
  ctx.beginPath();
  ctx.moveTo(laws[1].x - 40, laws[1].y);
  ctx.lineTo(laws[0].x + 40, laws[0].y);
  ctx.stroke();
  
  // 独占禁止法→民法
  ctx.beginPath();
  ctx.moveTo(laws[3].x - 40, laws[3].y - 20);
  ctx.lineTo(laws[0].x + 20, laws[0].y + 40);
  ctx.stroke();
  
  // 凡例
  ctx.setLineDash([]);
  ctx.fillStyle = '#666';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('● 法令', 20, height - 40);
  ctx.fillText('--- 参照関係', 20, height - 20);
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
          confidence: ref.confidence,
          analysis: {
            model: 'llama3-elyza-jp-8b',
            version: 'mock-1.0',
            timestamp: new Date().toISOString()
          }
        });
      }
    }
    
    await fs.writeFile(
      path.join(OUTPUT_PATH, 'data', 'references.json'),
      JSON.stringify(allReferences, null, 2),
      'utf-8'
    );
  }

  getLawNumber(lawData) {
    // 法令番号の生成（フォールバック用）
    const lawNumMap = {
      '129AC0000000089': '明治二十九年法律第八十九号',
      '155AC0000000048': '平成八年法律第百九号',
      '222AC0000000067': '昭和二十二年法律第六十七号',
      '323AC0000000131': '昭和二十三年法律第百三十一号'
    };
    return lawNumMap[lawData.lawId] || '法令番号不明';
  }

  generateHierarchicalTOC(lawData) {
    let tocHtml = '';
    const structure = lawData.structure || { parts: [], chapters: [], sections: [] };
    
    // 既に表示した条文を追跡
    const displayedArticles = new Set();
    
    // 編がある場合
    if (structure.parts.length > 0) {
      tocHtml += '<ul class="toc-parts">';
      for (const part of structure.parts) {
        tocHtml += `<li class="toc-part">
          <span class="toc-part-title">${this.escapeHtml(part.title)}</span>`;
        
        // この編に属する章を表示
        const partChapters = structure.chapters.filter(ch => part.chapters.includes(ch.num));
        if (partChapters.length > 0) {
          tocHtml += this.generateChapterList(partChapters, structure, lawData.articles, displayedArticles);
        }
        
        tocHtml += '</li>';
      }
      tocHtml += '</ul>';
    } else if (structure.chapters.length > 0) {
      // 編がなく章だけの場合
      tocHtml += this.generateChapterList(structure.chapters, structure, lawData.articles, displayedArticles);
    } else {
      // 階層構造がない場合は従来の条文リスト
      tocHtml += '<ul class="toc-list">';
      for (const article of lawData.articles) {
        if (!displayedArticles.has(article.articleNum)) {
          tocHtml += `<li class="toc-article">
            <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
          </li>`;
          displayedArticles.add(article.articleNum);
        }
      }
      tocHtml += '</ul>';
    }
    
    return tocHtml;
  }
  
  generateChapterList(chapters, structure, articles, displayedArticles = new Set()) {
    let html = '<ul class="toc-chapters">';
    
    for (const chapter of chapters) {
      html += `<li class="toc-chapter">
        <span class="toc-chapter-title">${this.escapeHtml(chapter.title)}</span>`;
      
      // この章に属する節を表示
      const chapterSections = structure.sections.filter(sec => chapter.sections.includes(sec.num));
      if (chapterSections.length > 0) {
        html += '<ul class="toc-sections">';
        for (const section of chapterSections) {
          html += `<li class="toc-section-item">
            <span class="toc-section-title">${this.escapeHtml(section.title)}</span>`;
          
          // この節に属する条文を表示
          const sectionArticles = articles.filter(art => 
            section.articles.includes(art.articleNum) && 
            !displayedArticles.has(art.articleNum)
          );
          if (sectionArticles.length > 0) {
            html += '<ul class="toc-articles">';
            for (const article of sectionArticles) {
              html += `<li class="toc-article">
                <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
              </li>`;
              displayedArticles.add(article.articleNum);
            }
            html += '</ul>';
          }
          
          html += '</li>';
        }
        html += '</ul>';
      }
      
      // 節に属さない条文を表示
      const chapterArticles = articles.filter(art => 
        chapter.articles.includes(art.articleNum) &&
        !chapterSections.some(sec => sec.articles.includes(art.articleNum)) &&
        !displayedArticles.has(art.articleNum)
      );
      if (chapterArticles.length > 0) {
        html += '<ul class="toc-articles">';
        for (const article of chapterArticles) {
          html += `<li class="toc-article">
            <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
          </li>`;
          displayedArticles.add(article.articleNum);
        }
        html += '</ul>';
      }
      
      html += '</li>';
    }
    
    html += '</ul>';
    return html;
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
  const generator = new MockStaticSiteGenerator();
  generator.generate().catch(console.error);
}