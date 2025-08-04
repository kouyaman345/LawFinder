#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function testLargeXML() {
  const xmlPath = path.join(__dirname, '../laws_data/sample/132AC0000000048.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  
  console.log(`File size: ${(xmlContent.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Count all Article tags
  const allArticles = xmlContent.match(/<Article\s+Num="/g) || [];
  console.log(`Total Article tags: ${allArticles.length}`);
  
  // Test extraction
  const articles = [];
  let currentIndex = 0;
  let lastArticleNum = '';
  
  while (currentIndex < xmlContent.length) {
    const startIndex = xmlContent.indexOf('<Article ', currentIndex);
    if (startIndex === -1) break;
    
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
    lastArticleNum = articleNum;
    articles.push(articleNum);
    
    // Find closing tag (simplified - just move past this article)
    const closeIndex = xmlContent.indexOf('</Article>', tagEndIndex);
    if (closeIndex === -1) break;
    
    currentIndex = closeIndex + 10;
  }
  
  console.log(`\nExtracted ${articles.length} articles`);
  console.log(`First article: ${articles[0]}`);
  console.log(`Last article: ${lastArticleNum}`);
  
  // Check if there are more articles after the last one found
  const lastCloseIndex = xmlContent.lastIndexOf('</Article>');
  const lastArticleIndex = xmlContent.lastIndexOf('<Article ', lastCloseIndex);
  if (lastArticleIndex !== -1) {
    const lastTag = xmlContent.substring(lastArticleIndex, xmlContent.indexOf('>', lastArticleIndex));
    console.log(`\nActual last article tag: ${lastTag}`);
  }
  
  // Find where extraction stopped
  console.log(`\nExtraction stopped at position ${currentIndex} of ${xmlContent.length}`);
  console.log(`Progress: ${(currentIndex / xmlContent.length * 100).toFixed(1)}%`);
}

testLargeXML().catch(console.error);