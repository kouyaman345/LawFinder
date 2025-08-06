import { LawXMLParser } from '../src/lib/xml-parser';
import { promises as fs } from 'fs';
import path from 'path';

async function testParser() {
  const xmlPath = path.join(process.cwd(), 'laws_data/sample/132AC0000000048.xml');
  
  try {
    console.log(`Reading XML file: ${xmlPath}`);
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    console.log(`XML content length: ${xmlContent.length} bytes`);
    
    const parser = new LawXMLParser();
    const lawData = parser.parseLawXML(xmlContent, '132AC0000000048.xml');
    
    console.log('\nParsed law data:');
    console.log(`- Title: ${lawData.lawTitle}`);
    console.log(`- Number: ${lawData.lawNum}`);
    console.log(`- Articles: ${lawData.articles.length}`);
    console.log(`- Structure parts: ${lawData.structure.parts?.length || 0}`);
    
    // 最初の5条文を表示
    console.log('\nFirst 5 articles:');
    lawData.articles.slice(0, 5).forEach(article => {
      console.log(`- Article ${article.articleNum}: ${article.articleTitle || '(No title)'}`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testParser();