#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function testExtraction() {
  const xmlPath = path.join(__dirname, '../laws_data/sample/322AC0000000049.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  
  console.log('Testing article extraction...');
  console.log(`File size: ${(xmlContent.length / 1024).toFixed(2)} KB`);
  
  // Test simple search
  const articleCount = (xmlContent.match(/<Article/g) || []).length;
  console.log(`Simple count of <Article tags: ${articleCount}`);
  
  // Find the first Article tag manually
  const firstArticleIndex = xmlContent.indexOf('<Article');
  if (firstArticleIndex !== -1) {
    console.log(`\nFirst Article tag found at position: ${firstArticleIndex}`);
    console.log('Context:');
    console.log(xmlContent.substring(firstArticleIndex - 50, firstArticleIndex + 200));
    
    // Check for Num attribute
    const numIndex = xmlContent.indexOf('Num=', firstArticleIndex);
    console.log(`\nNum attribute found at: ${numIndex}`);
    if (numIndex !== -1) {
      console.log('Num context:');
      console.log(xmlContent.substring(numIndex - 10, numIndex + 30));
    }
  }
  
  // Test the improved extraction logic
  console.log('\n\nTesting extraction logic...');
  let currentIndex = 0;
  let articlesFound = 0;
  
  while (currentIndex < xmlContent.length && articlesFound < 5) {
    const startIndex = xmlContent.indexOf('<Article', currentIndex);
    if (startIndex === -1) {
      console.log('No more articles found');
      break;
    }
    
    console.log(`\nArticle ${articlesFound + 1} found at position ${startIndex}`);
    
    // Find Num attribute
    const numStart = xmlContent.indexOf('Num="', startIndex);
    console.log(`Num=" found at: ${numStart}`);
    
    if (numStart === -1 || numStart > startIndex + 50) {
      console.log('Num attribute not found within expected range');
      currentIndex = startIndex + 1;
      continue;
    }
    
    const numEnd = xmlContent.indexOf('"', numStart + 5);
    console.log(`Closing quote found at: ${numEnd}`);
    
    if (numEnd === -1) {
      console.log('Closing quote not found');
      currentIndex = startIndex + 1;
      continue;
    }
    
    const articleNum = xmlContent.substring(numStart + 5, numEnd);
    console.log(`Article number: ${articleNum}`);
    
    articlesFound++;
    currentIndex = numEnd;
  }
}

testExtraction().catch(console.error);