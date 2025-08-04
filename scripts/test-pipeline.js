#!/usr/bin/env node

const path = require('path');

// ビルド済みのクラスをインポート
const { XMLFileDataSource } = require('../dist/infrastructure/persistence/XMLFileDataSource');
const { RegexPatternMatcher } = require('../dist/infrastructure/external/patterns/PatternMatcher');

const XML_DATA_PATH = './laws_data/sample';

async function testPipeline() {
  console.log('=== データ処理パイプラインのテスト ===\n');
  
  try {
    // 1. XMLデータソースのテスト
    console.log('1. XMLデータソースのテスト');
    const dataSource = new XMLFileDataSource(XML_DATA_PATH);
    
    // 法令一覧の取得
    const lawList = await dataSource.fetchLawList();
    console.log(`  - 法令数: ${lawList.laws.length}`);
    console.log(`  - 最初の法令: ${lawList.laws[0]?.lawTitle}`);
    
    // 2. 法令詳細の取得
    console.log('\n2. 法令詳細の取得');
    if (lawList.laws.length > 0) {
      const firstLaw = lawList.laws[0];
      const lawDetail = await dataSource.fetchLawDetail(firstLaw.lawId);
      console.log(`  - 法令ID: ${lawDetail.lawId}`);
      console.log(`  - 法令名: ${lawDetail.lawTitle}`);
      console.log(`  - 条文数: ${lawDetail.articles.length}`);
      
      // 3. パターンマッチングのテスト
      console.log('\n3. パターンマッチングのテスト');
      const patternMatcher = new RegexPatternMatcher();
      
      if (lawDetail.articles.length > 0) {
        const firstArticle = lawDetail.articles[0];
        const articleText = buildArticleText(firstArticle);
        console.log(`  - 第${firstArticle.articleNum}条のテキスト:`, articleText.substring(0, 100) + '...');
        
        const patterns = patternMatcher.findPatterns(articleText);
        console.log(`  - 検出されたパターン数: ${patterns.length}`);
        
        patterns.forEach((pattern, index) => {
          if (index < 5) { // 最初の5つだけ表示
            console.log(`    [${index + 1}] ${pattern.type}: "${pattern.text}" (信頼度: ${pattern.confidence})`);
          }
        });
      }
      
      // 4. 参照関係の検出
      console.log('\n4. 参照関係の検出例');
      // 民事訴訟法のサンプルから参照を探す
      const msLaw = lawList.laws.find(l => l.lawTitle.includes('民事訴訟法'));
      if (msLaw) {
        const msDetail = await dataSource.fetchLawDetail(msLaw.lawId);
        const article30 = msDetail.articles.find(a => a.articleNum === 30);
        if (article30) {
          const text = buildArticleText(article30);
          console.log(`  - 第30条第3項: ${article30.paragraphs[2]?.content}`);
          
          const refs = patternMatcher.findPatterns(text);
          const civilLawRef = refs.find(r => r.text.includes('民法'));
          if (civilLawRef) {
            console.log(`  - 検出された参照: "${civilLawRef.text}"`);
            console.log(`  - 参照タイプ: ${civilLawRef.type}`);
          }
        }
      }
    }
    
    console.log('\n✅ テスト完了');
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
  }
}

function buildArticleText(article) {
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

// 実行
if (require.main === module) {
  testPipeline().catch(console.error);
}