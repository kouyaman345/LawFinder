#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function testXmlParsing() {
  const xmlPath = path.join(__dirname, '../laws_data/sample/132AC0000000048.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  
  console.log(`File size: ${(xmlContent.length / 1024 / 1024).toFixed(2)} MB`);
  
  // Test 1: Count total articles
  const articleCount = (xmlContent.match(/<Article\s+Num="/g) || []).length;
  console.log(`Total articles in XML: ${articleCount}`);
  
  // Test 2: Try matchAll with full content
  console.log('\nTesting matchAll with full content...');
  const startTime = Date.now();
  
  try {
    const mainProvisionMatch = xmlContent.match(/<MainProvision[^>]*>([\s\S]*?)<\/MainProvision>/);
    const mainContent = mainProvisionMatch ? mainProvisionMatch[1] : xmlContent;
    
    const articleMatches = Array.from(mainContent.matchAll(/<Article\s+Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g));
    console.log(`matchAll found: ${articleMatches.length} articles`);
    console.log(`Time taken: ${Date.now() - startTime}ms`);
    
    // Show first and last matched article numbers
    if (articleMatches.length > 0) {
      console.log(`First article: ${articleMatches[0][1]}`);
      console.log(`Last article: ${articleMatches[articleMatches.length - 1][1]}`);
    }
  } catch (error) {
    console.error('Error during matchAll:', error.message);
  }
  
  // Test 3: Check if the XML is complete
  console.log('\nChecking XML structure...');
  const lastArticleMatch = xmlContent.match(/<Article\s+Num="([^"]+)"[^>]*>[\s\S]*?<\/Article>(?![\s\S]*<Article)/);
  if (lastArticleMatch) {
    console.log(`Last article in XML file: ${lastArticleMatch[1]}`);
  }
  
  // Test 4: Check for nested articles or malformed XML
  const nestedArticles = xmlContent.match(/<Article[\s\S]*?<Article/);
  if (nestedArticles) {
    console.log('WARNING: Found nested Article tags!');
  }
  
  // Test 5: Alternative parsing approach - chunk by chunk
  console.log('\nTesting chunk-based parsing...');
  const chunkStartTime = Date.now();
  let articleCount2 = 0;
  let lastIndex = 0;
  
  while (true) {
    const startMatch = xmlContent.indexOf('<Article', lastIndex);
    if (startMatch === -1) break;
    
    const endMatch = xmlContent.indexOf('</Article>', startMatch);
    if (endMatch === -1) break;
    
    articleCount2++;
    lastIndex = endMatch + 10;
  }
  
  console.log(`Chunk parsing found: ${articleCount2} articles`);
  console.log(`Time taken: ${Date.now() - chunkStartTime}ms`);
}

testXmlParsing().catch(console.error);