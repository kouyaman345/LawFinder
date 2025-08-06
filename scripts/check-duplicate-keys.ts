import { LawXMLParser } from '../src/lib/xml-parser';
import { promises as fs } from 'fs';
import path from 'path';

async function checkDuplicateKeys() {
  const XML_DATA_PATH = path.join(process.cwd(), 'laws_data/sample');
  const files = await fs.readdir(XML_DATA_PATH);
  const xmlFiles = files.filter(f => f.endsWith('.xml'));
  
  console.log('重複キーの可能性を確認\n');
  
  for (const file of xmlFiles) {
    const xmlPath = path.join(XML_DATA_PATH, file);
    const xmlContent = await fs.readFile(xmlPath, 'utf-8');
    const parser = new LawXMLParser();
    const lawData = parser.parseLawXML(xmlContent, file);
    
    console.log(`【${lawData.lawTitle}】（${file}）`);
    
    // 条文番号の重複をチェック
    const articleNums = lawData.articles.map(a => a.articleNum);
    const duplicates = articleNums.filter((num, index) => articleNums.indexOf(num) !== index);
    
    if (duplicates.length > 0) {
      console.log(`  ⚠️  重複する条文番号: ${[...new Set(duplicates)].join(', ')}`);
    }
    
    // 階層構造での重複をチェック
    const chapterArticles: Record<string, string[]> = {};
    const sectionArticles: Record<string, string[]> = {};
    
    for (const chapter of lawData.structure.chapters) {
      chapterArticles[chapter.num] = chapter.articles;
      
      // 同じ章内での条文番号の重複
      const chapDuplicates = chapter.articles.filter((num, index) => chapter.articles.indexOf(num) !== index);
      if (chapDuplicates.length > 0) {
        console.log(`  ⚠️  第${chapter.num}章内で重複: ${[...new Set(chapDuplicates)].join(', ')}`);
      }
    }
    
    for (const section of lawData.structure.sections) {
      sectionArticles[section.num] = section.articles;
      
      // 同じ節内での条文番号の重複
      const secDuplicates = section.articles.filter((num, index) => section.articles.indexOf(num) !== index);
      if (secDuplicates.length > 0) {
        console.log(`  ⚠️  第${section.num}節内で重複: ${[...new Set(secDuplicates)].join(', ')}`);
      }
    }
    
    // 構造の詳細を表示
    console.log(`  編: ${lawData.structure.parts.length}個`);
    console.log(`  章: ${lawData.structure.chapters.length}個`);
    console.log(`  節: ${lawData.structure.sections.length}個`);
    console.log(`  条文: ${lawData.articles.length}条`);
    
    // 最初の5つの条文番号を表示
    console.log(`  最初の条文番号: ${articleNums.slice(0, 5).join(', ')}...`);
    
    console.log();
  }
}

checkDuplicateKeys().catch(console.error);