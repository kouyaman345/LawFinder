#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function generateDeletedArticles() {
  const xmlPath = path.join(__dirname, '../laws_data/sample/132AC0000000048.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  
  // Find all articles
  const articleMatches = Array.from(xmlContent.matchAll(/<Article Num="([^"]+)"/g));
  const existingArticles = new Set(articleMatches.map(m => parseInt(m[1])).filter(n => !isNaN(n)));
  
  // Generate deleted articles info
  const deletedArticles = [];
  
  // Check for gaps
  let prevNum = 0;
  const sortedArticles = Array.from(existingArticles).sort((a, b) => a - b);
  
  for (const num of sortedArticles) {
    if (num > prevNum + 1 && prevNum > 0) {
      for (let i = prevNum + 1; i < num; i++) {
        deletedArticles.push({
          articleNum: i.toString(),
          articleTitle: '削除',
          paragraphs: [{
            content: '削除',
            items: []
          }]
        });
      }
    }
    prevNum = num;
  }
  
  console.log(`Found ${deletedArticles.length} deleted articles`);
  console.log('Sample deleted articles:', deletedArticles.slice(0, 5));
  
  // 商法の第七章の範囲を修正
  console.log('\n商法第七章（代理商）の実際の範囲:');
  console.log('第27条から第31条まで（第32条〜第500条は削除）');
}

generateDeletedArticles().catch(console.error);