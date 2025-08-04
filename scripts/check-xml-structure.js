#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function checkXMLStructure() {
  const xmlPath = path.join(__dirname, '../laws_data/sample/132AC0000000048.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  
  // Find all articles
  const articleMatches = Array.from(xmlContent.matchAll(/<Article Num="([^"]+)"/g));
  
  console.log(`Total articles found: ${articleMatches.length}`);
  
  // Check for gaps
  let prevNum = 0;
  let gaps = [];
  
  for (const match of articleMatches) {
    const num = parseInt(match[1]);
    if (!isNaN(num)) {
      if (num > prevNum + 1 && prevNum > 0) {
        gaps.push({ from: prevNum, to: num });
      }
      prevNum = num;
    }
  }
  
  console.log('\nGaps found:');
  for (const gap of gaps) {
    console.log(`  Articles ${gap.from + 1} to ${gap.to - 1} are missing`);
  }
  
  // Check specific range
  console.log('\nChecking articles 30-35:');
  for (let i = 30; i <= 35; i++) {
    const regex = new RegExp(`<Article Num="${i}"[^>]*>`, 'g');
    const found = xmlContent.match(regex);
    console.log(`  Article ${i}: ${found ? 'Found' : 'Not found'}`);
  }
  
  console.log('\nChecking articles 495-505:');
  for (let i = 495; i <= 505; i++) {
    const regex = new RegExp(`<Article Num="${i}"[^>]*>`, 'g');
    const found = xmlContent.match(regex);
    console.log(`  Article ${i}: ${found ? 'Found' : 'Not found'}`);
  }
  
  // Check for special patterns
  console.log('\nChecking for deleted articles:');
  const deletedMatches = xmlContent.matchAll(/<Article Num="(\d+)"[^>]*>\s*<ArticleCaption>削除<\/ArticleCaption>/g);
  let deletedCount = 0;
  for (const match of deletedMatches) {
    console.log(`  Article ${match[1]}: Deleted (削除)`);
    deletedCount++;
  }
  console.log(`Total deleted articles: ${deletedCount}`);
}

checkXMLStructure().catch(console.error);