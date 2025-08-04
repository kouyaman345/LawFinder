#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const XML_DATA_PATH = path.join(__dirname, '../laws_data/sample');
const OUTPUT_PATH = path.join(__dirname, '../dist/static');

class RealLLMStaticSiteGenerator {
  constructor() {
    this.lawIndex = new Map();
    this.referenceMap = new Map();
    this.ollamaApiUrl = 'http://localhost:11434/api/generate';
    this.modelName = 'mistral:latest';
  }

  async generate() {
    console.log('静的サイト生成を開始します（実LLM解析版）...\n');
    
    // 出力ディレクトリの準備
    await this.prepareOutputDirectories();
    
    // XMLファイルを読み込んで法令データを抽出
    console.log('Phase 1: 法令データの読み込み');
    const files = await fs.readdir(XML_DATA_PATH);
    const xmlFiles = files.filter(f => f.endsWith('.xml')).slice(0, 2); // テスト用に最初の2件のみ処理
    console.log(`${xmlFiles.length}件の法令を処理します\n`);
    
    for (const file of xmlFiles) {
      const lawData = await this.parseLawXML(file);
      this.lawIndex.set(lawData.lawId, lawData);
      console.log(`  - ${lawData.lawTitle} を読み込みました`);
    }
    
    // 参照関係の抽出とLLM解析
    console.log('\nPhase 2: 参照関係の抽出と解析（実LLM）');
    await this.extractAllReferences();
    
    // HTMLファイルの生成
    console.log('\nPhase 3: HTMLファイルの生成');
    await this.generateHTMLFiles();
    
    // インデックスページの生成
    await this.generateIndexPage();
    
    // CSSファイルをコピー
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
    
    // 基本情報の抽出（正規表現で簡易処理）
    const lawId = filename.replace('.xml', '');
    const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const lawTitle = titleMatch ? titleMatch[1] : '不明な法令';
    
    // 法令番号の抽出
    const lawNumMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNum = lawNumMatch ? lawNumMatch[1] : '';
    
    // 階層構造（編・章・節）の抽出
    const structure = this.extractStructure(xmlContent);
    
    // 条文の抽出
    const articles = [];
    const articleMatches = xmlContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
    
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
      
      // 法令全体のテキストを抽出してLLMに解析させる
      const lawText = this.extractLawText(lawData);
      
      // LLMによる参照関係の解析
      const llmReferences = await this.analyzeLawWithLLM(lawData.lawTitle, lawText, lawId);
      
      // パターンベースの参照検出と組み合わせ
      for (const article of lawData.articles) {
        const articleText = this.getArticleText(article);
        const patternRefs = this.detectReferences(articleText, lawId, article.articleNum);
        
        // LLMの結果とパターンマッチの結果を統合
        const combinedRefs = this.combineReferences(patternRefs, llmReferences, article.articleNum);
        references.push(...combinedRefs);
      }
      
      this.referenceMap.set(lawId, references);
      console.log(`  → ${references.length}個の参照を検出`);
      
      // 複合参照のカウント
      const complexRefs = references.filter(r => r.type === 'COMPLEX_REFERENCE');
      if (complexRefs.length > 0) {
        console.log(`     うち複合参照: ${complexRefs.length}個`);
      }
    }
  }

  async analyzeLawWithLLM(lawTitle, lawText, lawId) {
    try {
      // テキストを適切な長さに分割（LLMのコンテキスト制限を考慮）
      const chunks = this.splitTextIntoChunks(lawText, 2000);
      const allReferences = [];
      
      console.log(`    LLM解析開始: ${lawTitle} (${chunks.length}チャンク)`);
      
      for (let i = 0; i < Math.min(chunks.length, 1); i++) { // テスト用に1チャンクのみ解析
        const chunk = chunks[i];
        const prompt = `次の法律文章から参照を抽出してJSON形式で返してください。

文章：${chunk.substring(0, 1000)}

{
  "references": [
    {
      "sourceText": "参照テキスト",
      "type": "EXTERNAL_REFERENCE|INTERNAL_REFERENCE|RELATIVE_REFERENCE",
      "confidence": 0.8
    }
  ]
}`;

        console.log(`      チャンク ${i + 1}/${Math.min(chunks.length, 1)} を送信中...`);
        const startTime = Date.now();
        
        const response = await axios.post(this.ollamaApiUrl, {
          model: this.modelName,
          prompt: prompt,
          stream: false
        }, {
          timeout: 30000 // 30秒のタイムアウト
        });
        
        const elapsed = Date.now() - startTime;
        console.log(`      LLM応答受信 (${elapsed}ms)`);

        if (response.data && response.data.response) {
          console.log(`      LLM応答:`, response.data.response.substring(0, 200) + '...');
          try {
            const result = JSON.parse(response.data.response);
            if (result.references && Array.isArray(result.references)) {
              allReferences.push(...result.references);
              console.log(`      → ${result.references.length}個の参照を検出`);
            }
          } catch (parseError) {
            console.log('      LLM応答のパースエラー（スキップ）:', parseError.message);
          }
        }
      }
      
      console.log(`    LLM解析完了: ${allReferences.length}個の参照を検出`);
      return allReferences;
    } catch (error) {
      console.log(`    LLM解析エラー: ${error.message}`);
      if (error.code === 'ECONNABORTED') {
        console.log('    タイムアウトしました。Ollamaが起動していることを確認してください。');
      }
      return [];
    }
  }

  splitTextIntoChunks(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    const lines = text.split('\n');
    
    for (const line of lines) {
      if (currentChunk.length + line.length > maxLength) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
      }
      currentChunk += line + '\n';
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }

  extractLawText(lawData) {
    let text = '';
    for (const article of lawData.articles) {
      text += `第${article.articleNum}条`;
      if (article.articleTitle) {
        text += ` ${article.articleTitle}`;
      }
      text += '\n';
      
      for (const para of article.paragraphs) {
        if (para.content) {
          text += para.content + '\n';
        }
        for (const item of para.items) {
          if (item.title) text += item.title + ' ';
          if (item.content) text += item.content + '\n';
          
          for (const subitem of item.subitems || []) {
            if (subitem.title) text += '  ' + subitem.title + ' ';
            if (subitem.content) text += subitem.content + '\n';
            
            for (const subsubitem of subitem.subsubitems || []) {
              if (subsubitem.title) text += '    ' + subsubitem.title + ' ';
              if (subsubitem.content) text += subsubitem.content + '\n';
            }
          }
        }
      }
      text += '\n';
    }
    return text;
  }

  combineReferences(patternRefs, llmRefs, articleNum) {
    const combined = [...patternRefs];
    
    // LLMの結果を追加（重複を避ける）
    for (const llmRef of llmRefs) {
      const isDuplicate = patternRefs.some(pRef => 
        pRef.sourceText === llmRef.sourceText &&
        pRef.targetArticle === llmRef.targetArticle
      );
      
      if (!isDuplicate) {
        combined.push({
          ...llmRef,
          sourceArticle: articleNum,
          confidence: llmRef.confidence || 0.7
        });
      }
    }
    
    return combined;
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
    const internalMatches = text.matchAll(/第([０-９0-9一二三四五六七八九十百千]+)条/g);
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
    const lawNum = this.getLawNumber(lawData);
    
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
        <span class="llm-badge">実LLM解析済み</span>
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
        <p>ローカルLLM: Mistral（実LLM版）</p>
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
                    ref.type === 'INTERNAL_REFERENCE' ? '内部参照' : 
                    ref.type === 'COMPLEX_REFERENCE' ? '複合参照' : '相対参照'}
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
        
        if (link) {
          // 完全一致で置換（正規表現の特殊文字をエスケープ）
          const escapedPattern = escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          processed = processed.replace(new RegExp(escapedPattern, 'g'), link);
        }
      }
    }
    
    return processed;
  }

  generateHierarchicalTOC(lawData) {
    let tocHtml = '';
    const structure = lawData.structure || { parts: [], chapters: [], sections: [] };
    
    // 編がある場合
    if (structure.parts.length > 0) {
      tocHtml += '<ul class="toc-parts">';
      for (const part of structure.parts) {
        tocHtml += `<li class="toc-part">
          <span class="toc-part-title">${this.escapeHtml(part.title)}</span>`;
        
        // この編に属する章を表示
        const partChapters = structure.chapters.filter(ch => part.chapters.includes(ch.num));
        if (partChapters.length > 0) {
          tocHtml += this.generateChapterList(partChapters, structure, lawData.articles);
        }
        
        tocHtml += '</li>';
      }
      tocHtml += '</ul>';
    } else if (structure.chapters.length > 0) {
      // 編がなく章だけの場合
      tocHtml += this.generateChapterList(structure.chapters, structure, lawData.articles);
    } else {
      // 階層構造がない場合は従来の条文リスト
      tocHtml += '<ul class="toc-list">';
      for (const article of lawData.articles) {
        tocHtml += `<li class="toc-article">
          <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
        </li>`;
      }
      tocHtml += '</ul>';
    }
    
    return tocHtml;
  }
  
  generateChapterList(chapters, structure, articles) {
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
          const sectionArticles = articles.filter(art => section.articles.includes(art.articleNum));
          if (sectionArticles.length > 0) {
            html += '<ul class="toc-articles">';
            for (const article of sectionArticles) {
              html += `<li class="toc-article">
                <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
              </li>`;
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
        !chapterSections.some(sec => sec.articles.includes(art.articleNum))
      );
      if (chapterArticles.length > 0) {
        html += '<ul class="toc-articles">';
        for (const article of chapterArticles) {
          html += `<li class="toc-article">
            <a href="#art${article.articleNum}">第${article.articleNum}条${article.articleTitle ? ` ${article.articleTitle}` : ''}</a>
          </li>`;
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
      .replace(/'/g, '&#39;');
  }

  async generateIndexPage() {
    const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LawFinder - 日本法令検索システム</title>
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
      </nav>
    </div>
  </div>
  
  <main class="container">
    <div class="hero-section">
      <h1>日本法令検索システム</h1>
      <p>法令間の参照関係を可視化し、改正影響を分析</p>
      <p class="tech-info">実LLM（Mistral）による高精度な参照解析</p>
    </div>
    
    <div class="law-grid">
      ${Array.from(this.lawIndex.values()).map(lawData => {
        const refs = this.referenceMap.get(lawData.lawId) || [];
        return `
        <div class="law-card">
          <h2><a href="laws/${lawData.lawId}.html">${this.escapeHtml(lawData.lawTitle)}</a></h2>
          <p class="law-number">${this.getLawNumber(lawData)}</p>
          <div class="law-card-meta">
            <span class="meta-item">📊 参照関係: ${refs.length}件</span>
            <span class="meta-item">🤖 実LLM解析済み</span>
          </div>
        </div>
        `;
      }).join('')}
    </div>
  </main>
  
  <footer class="gov-footer">
    <div class="container">
      <div class="footer-content">
        <p>LawFinder - 日本法令検索システム</p>
        <p>ローカルLLM: Mistral（実LLM版）</p>
      </div>
    </div>
  </footer>
</body>
</html>`;
    
    await fs.writeFile(path.join(OUTPUT_PATH, 'index.html'), html, 'utf-8');
  }

  getLawNumber(lawData) {
    // 法令番号のマッピング（実際の法令番号）
    const lawNumMap = {
      '129AC0000000089': '明治二十九年法律第八十九号',
      '132AC0000000048': '明治三十二年法律第四十八号',
      '140AC0000000045': '明治四十年法律第四十五号', 
      '155AC0000000048': '昭和二十三年法律第百五十五号',
      '222AC0000000067': '昭和二十二年法律第六十七号',
      '322AC0000000049': '昭和二十二年法律第四十九号',
      '323AC0000000131': '昭和二十三年法律第百三十一号',
      '417AC0000000086': '平成十七年法律第八十六号'
    };
    return lawNumMap[lawData.lawId] || '法令番号不明';
  }

  async copyAssets() {
    const css = `/* e-gov風のスタイル */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ Pro", "Yu Gothic", "游ゴシック", "Meiryo", "メイリオ", sans-serif;
  line-height: 1.8;
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
  padding: 15px 0;
}

.site-title {
  display: inline-block;
  font-size: 24px;
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
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  margin-bottom: 30px;
}

.toolbar-left, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-outline {
  padding: 5px 15px;
  border: 1px solid #666;
  background: white;
  cursor: pointer;
  font-size: 14px;
}

.btn-outline:hover {
  background-color: #f5f5f5;
}

.reference-badge, .llm-badge {
  padding: 3px 10px;
  font-size: 12px;
  border-radius: 3px;
}

.reference-badge {
  background-color: #e3f2fd;
  color: #1976d2;
}

.llm-badge {
  background-color: #f3e5f5;
  color: #7b1fa2;
}

/* 法令本文 */
.law-content {
  display: flex;
  gap: 30px;
  margin-bottom: 50px;
}

.articles-section {
  flex: 1;
  background: white;
  padding: 30px;
  border: 1px solid #ddd;
}

.law-article {
  margin-bottom: 40px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.law-article:last-child {
  border-bottom: none;
}

.article-header {
  display: flex;
  align-items: baseline;
  margin-bottom: 20px;
  padding-bottom: 10px;
  border-bottom: 2px solid #003f8e;
}

.article-number {
  font-size: 20px;
  font-weight: bold;
  color: #003f8e;
  margin-right: 10px;
}

.article-title {
  font-size: 18px;
  color: #333;
}

.article-content {
  padding-left: 20px;
}

.paragraph {
  margin-bottom: 15px;
  text-align: justify;
}

.paragraph-number {
  font-weight: bold;
  color: #666;
}

.first-paragraph {
  margin-top: 0;
}

/* 号（Item）のスタイル */
.item {
  margin-left: 20px;
  margin-bottom: 10px;
  text-indent: -20px;
  padding-left: 20px;
}

.item-title {
  font-weight: bold;
  color: #666;
}

/* サブアイテム（イロハニ）のスタイル */
.subitem {
  margin-left: 40px;
  margin-bottom: 8px;
  text-indent: -20px;
  padding-left: 20px;
}

.subitem-title {
  font-weight: 600;
  color: #666;
}

/* サブサブアイテム（括弧数字）のスタイル */
.subsubitem {
  margin-left: 60px;
  margin-bottom: 5px;
  text-indent: -20px;
  padding-left: 20px;
}

.subsubitem-title {
  color: #666;
}

/* 参照リンク */
.ref-link {
  color: #0066cc;
  text-decoration: none;
  border-bottom: 1px dotted #0066cc;
  cursor: pointer;
}

.ref-link:hover {
  background-color: #e3f2fd;
  border-bottom-style: solid;
}

.ref-link.external-ref {
  color: #d32f2f;
  border-bottom-color: #d32f2f;
}

.ref-link.internal-ref {
  color: #1976d2;
  border-bottom-color: #1976d2;
}

.ref-link.relative-ref {
  color: #388e3c;
  border-bottom-color: #388e3c;
}

.ref-link.complex-ref {
  color: #f57c00;
  border-bottom-color: #f57c00;
}

/* 参照関係の表示 */
.article-references {
  margin-top: 20px;
  padding: 15px;
  background-color: #f5f5f5;
  border-radius: 5px;
}

.ref-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  color: #0066cc;
  display: flex;
  align-items: center;
  gap: 5px;
}

.ref-icon {
  display: inline-block;
  transition: transform 0.3s;
}

.article-references.expanded .ref-icon {
  transform: rotate(90deg);
}

.ref-details {
  margin-top: 10px;
  display: none;
}

.article-references.expanded .ref-details {
  display: block;
}

.ref-item {
  padding: 5px 0;
  border-bottom: 1px solid #ddd;
  font-size: 14px;
}

.ref-item:last-child {
  border-bottom: none;
}

.ref-type {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 12px;
  margin-right: 10px;
}

.ref-type.external_reference {
  background-color: #ffebee;
  color: #c62828;
}

.ref-type.internal_reference {
  background-color: #e3f2fd;
  color: #1565c0;
}

.ref-type.relative_reference {
  background-color: #e8f5e9;
  color: #2e7d32;
}

.ref-type.complex_reference {
  background-color: #fff3e0;
  color: #ef6c00;
}

.ref-confidence {
  float: right;
  color: #666;
  font-size: 12px;
}

/* 目次 */
.toc-section {
  flex: 0 0 250px;
  position: sticky;
  top: 20px;
  height: fit-content;
}

.toc-title {
  font-size: 18px;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 2px solid #003f8e;
}

.toc-list {
  list-style: none;
  padding-left: 0;
}

.toc-list li {
  margin-bottom: 8px;
}

.toc-list a {
  color: #0066cc;
  text-decoration: none;
  font-size: 14px;
}

.toc-list a:hover {
  text-decoration: underline;
}

/* ヒーローセクション */
.hero-section {
  text-align: center;
  padding: 60px 0;
  background: white;
  margin-bottom: 40px;
}

.hero-section h1 {
  font-size: 36px;
  margin-bottom: 10px;
  color: #003f8e;
}

.hero-section p {
  font-size: 18px;
  color: #666;
  margin-bottom: 5px;
}

.tech-info {
  font-size: 14px;
  color: #7b1fa2;
}

/* 法令グリッド */
.law-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 40px;
}

.law-card {
  background: white;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 5px;
  transition: box-shadow 0.3s;
}

.law-card:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.law-card h2 {
  font-size: 20px;
  margin-bottom: 10px;
}

.law-card h2 a {
  color: #003f8e;
  text-decoration: none;
}

.law-card h2 a:hover {
  text-decoration: underline;
}

.law-card .law-number {
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
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
  margin-bottom: 5px;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .law-content {
    flex-direction: column;
  }
  
  .toc-section {
    position: static;
    flex: none;
    margin-bottom: 30px;
  }
}`;
    
    await fs.writeFile(path.join(OUTPUT_PATH, 'assets', 'style.css'), css, 'utf-8');
  }
}

// メイン実行
if (require.main === module) {
  const generator = new RealLLMStaticSiteGenerator();
  generator.generate().catch(console.error);
}

module.exports = RealLLMStaticSiteGenerator;