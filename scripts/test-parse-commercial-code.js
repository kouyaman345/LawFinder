const fs = require('fs');
const path = require('path');

// XMLパーサーの簡易版
class LawXMLParser {
  parseLawXML(xmlContent, filename) {
    try {
      console.log(`Parsing ${filename}...`);
      console.log(`XML content length: ${xmlContent.length} bytes`);
      
      // 法令タイトルを抽出
      const titleMatch = xmlContent.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
      const lawTitle = titleMatch ? titleMatch[1] : 'Unknown';
      console.log(`Law title: ${lawTitle}`);
      
      // 法令番号を抽出
      const lawNumMatch = xmlContent.match(/<LawNum>([^<]+)<\/LawNum>/);
      const lawNum = lawNumMatch ? lawNumMatch[1] : '';
      console.log(`Law number: ${lawNum}`);
      
      // 条文数をカウント
      const articles = xmlContent.match(/<Article[^>]*>/g);
      const articleCount = articles ? articles.length : 0;
      console.log(`Article count: ${articleCount}`);
      
      return {
        lawTitle,
        lawNum,
        articleCount,
        success: true
      };
    } catch (error) {
      console.error('Parse error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

async function testParse() {
  const xmlPath = path.join(__dirname, '../laws_data/sample/132AC0000000048.xml');
  
  try {
    console.log(`Reading XML file: ${xmlPath}`);
    const xmlContent = await fs.promises.readFile(xmlPath, 'utf-8');
    
    const parser = new LawXMLParser();
    const result = parser.parseLawXML(xmlContent, '132AC0000000048.xml');
    
    console.log('\nParse result:', result);
  } catch (error) {
    console.error('Error reading file:', error.message);
  }
}

testParse();