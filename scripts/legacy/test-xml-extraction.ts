#!/usr/bin/env tsx

/**
 * XMLからの条文抽出テスト
 */

import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'fs';

class TestExtractor {
  private xmlParser: XMLParser;
  
  constructor() {
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseAttributeValue: true,
      trimValues: true,
      processEntities: true
    });
  }
  
  private extractText(node: any): string {
    if (typeof node === 'string') return node;
    if (!node) return '';
    
    let text = '';
    
    // 項番号
    if (node.ParagraphNum) {
      text += node.ParagraphNum + ' ';
    }
    
    // 項の文章を抽出（これが主要な条文内容）
    if (node.ParagraphSentence) {
      const sentenceNode = node.ParagraphSentence;
      if (sentenceNode.Sentence) {
        const sentences = Array.isArray(sentenceNode.Sentence) ? sentenceNode.Sentence : [sentenceNode.Sentence];
        text += sentences.map((s: any) => this.extractSentenceText(s)).join('');
      }
    }
    
    // 号のタイトル
    if (node.ItemTitle) {
      text += node.ItemTitle + ' ';
    }
    
    // 号の文章
    if (node.ItemSentence) {
      const sentenceNode = node.ItemSentence;
      if (sentenceNode.Sentence) {
        const sentences = Array.isArray(sentenceNode.Sentence) ? sentenceNode.Sentence : [sentenceNode.Sentence];
        text += sentences.map((s: any) => this.extractSentenceText(s)).join('');
      }
    }
    
    // 直接のSentence要素（旧形式のXML対応）
    if (node.Sentence) {
      const sentences = Array.isArray(node.Sentence) ? node.Sentence : [node.Sentence];
      text += sentences.map((s: any) => this.extractSentenceText(s)).join('');
    }
    
    // テキストノード
    if (node['#text']) {
      text += node['#text'];
    }
    
    return text.trim();
  }
  
  private extractSentenceText(sentence: any): string {
    if (typeof sentence === 'string') return sentence;
    if (!sentence) return '';
    
    let text = '';
    if (sentence['#text']) text = sentence['#text'];
    
    // Ruby要素を処理
    if (sentence.Ruby) {
      const rubies = Array.isArray(sentence.Ruby) ? sentence.Ruby : [sentence.Ruby];
      for (const ruby of rubies) {
        if (ruby.Rb) text = text.replace(ruby.Rb, ruby.Rb);
      }
    }
    
    return text;
  }
  
  test() {
    // 商法XMLを読み込み
    const xmlPath = '/home/coffee/projects/LawFinder/laws_data/132AC0000000048_20230401_503AC0000000061/132AC0000000048_20230401_503AC0000000061.xml';
    const xmlContent = readFileSync(xmlPath, 'utf-8');
    const parsed = this.xmlParser.parse(xmlContent);
    
    const lawData = parsed.Law || parsed.RepealedLaw;
    const lawBody = lawData.LawBody;
    
    if (lawBody?.MainProvision?.Chapter) {
      const chapters = Array.isArray(lawBody.MainProvision.Chapter) ? 
        lawBody.MainProvision.Chapter : [lawBody.MainProvision.Chapter];
      
      // 第1章の第1条を取得
      const chapter1 = chapters[0];
      if (chapter1.Article) {
        const articles = Array.isArray(chapter1.Article) ? chapter1.Article : [chapter1.Article];
        const article1 = articles[0];
        
        console.log('='.repeat(80));
        console.log('商法 第1条のテスト');
        console.log('='.repeat(80));
        console.log('\n条番号:', article1['@_Num']);
        console.log('見出し:', article1.ArticleCaption || '');
        console.log('\n--- 項の内容 ---');
        
        if (article1.Paragraph) {
          const paragraphs = Array.isArray(article1.Paragraph) ? 
            article1.Paragraph : [article1.Paragraph];
          
          for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i];
            const content = this.extractText(para);
            console.log(`\n第${i + 1}項:`);
            console.log(content);
            
            // 参照が含まれているか確認
            if (content.includes('民法')) {
              console.log('  → 民法への参照を検出！');
            }
          }
        }
        
        // 第551条も確認（民法への参照が多い）
        console.log('\n' + '='.repeat(80));
        console.log('商法 第551条の確認');
        console.log('='.repeat(80));
        
        // 全条文から第551条を探す
        const allArticles = this.extractAllArticles(lawBody);
        const article551 = allArticles.find(a => a['@_Num'] === '551');
        
        if (article551) {
          console.log('条番号:', article551['@_Num']);
          console.log('見出し:', article551.ArticleCaption || '');
          
          if (article551.Paragraph) {
            const paragraphs = Array.isArray(article551.Paragraph) ? 
              article551.Paragraph : [article551.Paragraph];
            
            const para1 = paragraphs[0];
            const content = this.extractText(para1);
            console.log('\n内容:');
            console.log(content.substring(0, 200) + '...');
            
            // 民法への参照を検出
            const civilLawRefs = content.match(/民法[^、。）]{0,30}/g);
            if (civilLawRefs) {
              console.log('\n民法への参照:');
              civilLawRefs.forEach(ref => console.log('  -', ref));
            }
          }
        }
      }
    }
  }
  
  private extractAllArticles(lawBody: any): any[] {
    const articles: any[] = [];
    
    const processNode = (node: any) => {
      if (node.Article) {
        const arts = Array.isArray(node.Article) ? node.Article : [node.Article];
        articles.push(...arts);
      }
      
      // 再帰的に探索
      ['Part', 'Chapter', 'Section', 'Subsection'].forEach(key => {
        if (node[key]) {
          const children = Array.isArray(node[key]) ? node[key] : [node[key]];
          children.forEach((child: any) => processNode(child));
        }
      });
    };
    
    if (lawBody.MainProvision) {
      processNode(lawBody.MainProvision);
    }
    
    return articles;
  }
}

try {
  const tester = new TestExtractor();
  tester.test();
} catch (error) {
  console.error('エラー:', error);
  process.exit(1);
}