import { LawXMLParser } from '../src/lib/xml-parser';
import { promises as fs } from 'fs';
import path from 'path';

async function testLawParsing(lawId: string) {
  const xmlPath = path.join(process.cwd(), 'laws_data/sample', `${lawId}.xml`);
  
  console.log(`Testing law: ${lawId}`);
  console.log(`XML path: ${xmlPath}`);
  
  try {
    // ファイルの存在確認
    const stats = await fs.stat(xmlPath);
    console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // XMLファイルの読み込み
    console.log('Reading XML file...');
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    console.log(`XML content length: ${xmlContent.length} characters`);
    
    // XMLパース
    console.log('Parsing XML...');
    const parser = new LawXMLParser();
    const startTime = Date.now();
    const lawData = parser.parseLawXML(xmlContent, `${lawId}.xml`);
    const parseTime = Date.now() - startTime;
    
    console.log(`Parse completed in ${parseTime}ms`);
    console.log(`Law title: ${lawData.lawTitle}`);
    console.log(`Law number: ${lawData.lawNum}`);
    console.log(`Number of articles: ${lawData.articles.length}`);
    console.log(`Number of parts: ${lawData.structure.parts.length}`);
    console.log(`Number of chapters: ${lawData.structure.chapters.length}`);
    console.log(`Number of sections: ${lawData.structure.sections.length}`);
    
  } catch (error) {
    console.error('Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
}

// 会社法をテスト
testLawParsing('417AC0000000086').catch(console.error);