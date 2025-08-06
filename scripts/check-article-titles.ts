import { LawXMLParser } from '../src/lib/xml-parser';
import { promises as fs } from 'fs';
import path from 'path';

async function checkArticleTitles() {
  const xmlPath = path.join(process.cwd(), 'laws_data/sample/132AC0000000048.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  const parser = new LawXMLParser();
  const lawData = parser.parseLawXML(xmlContent, '132AC0000000048.xml');
  
  console.log('条文タイトルの確認（商法の最初の5条）:\n');
  
  lawData.articles.slice(0, 5).forEach(article => {
    console.log(`第${article.articleNum}条:`);
    console.log(`  タイトル: "${article.articleTitle}"`);
    console.log(`  括弧含む: ${article.articleTitle?.includes('（') || article.articleTitle?.includes('(')}`);
    console.log();
  });
}

checkArticleTitles().catch(console.error);