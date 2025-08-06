import { LawXMLParser } from '../src/lib/xml-parser';
import { promises as fs } from 'fs';
import path from 'path';

async function testHierarchy() {
  // 商法で階層構造を確認
  const xmlPath = path.join(process.cwd(), 'laws_data/sample/132AC0000000048.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  const parser = new LawXMLParser();
  const lawData = parser.parseLawXML(xmlContent, '132AC0000000048.xml');
  
  console.log('商法の階層構造:\n');
  
  // 編の確認
  console.log('編（Parts）:');
  lawData.structure.parts.forEach(part => {
    console.log(`  第${part.num}編: ${part.title}`);
    console.log(`    含まれる章: ${part.chapters.join(', ')}`);
  });
  
  console.log('\n章（Chapters）:');
  // 最初の5章だけ表示
  lawData.structure.chapters.slice(0, 5).forEach(chapter => {
    console.log(`  第${chapter.num}章: ${chapter.title}`);
    console.log(`    含まれる節: ${chapter.sections.join(', ')}`);
    console.log(`    直接含まれる条文: ${chapter.articles.slice(0, 5).join(', ')}...`);
  });
  
  console.log('\n節（Sections）:');
  // 最初の5節だけ表示
  lawData.structure.sections.slice(0, 5).forEach(section => {
    console.log(`  第${section.num}節: ${section.title}`);
    console.log(`    含まれる条文: ${section.articles.slice(0, 5).join(', ')}...`);
  });
  
  console.log('\n階層の期待値:');
  console.log('- 編（レベル0）');
  console.log('  - 章（レベル1）');
  console.log('    - 節（レベル2）');
  console.log('      - 条文（レベル3）');
  console.log('    - 条文（レベル2）※節がない場合');
}

testHierarchy().catch(console.error);