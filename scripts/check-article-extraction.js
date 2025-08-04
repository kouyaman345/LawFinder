const fs = require('fs').promises;
const path = require('path');

async function checkArticleExtraction() {
  const xmlPath = path.join(__dirname, '../laws_data/sample/140AC0000000045.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  
  // MainProvisionの範囲を確認
  const mainStart = xmlContent.indexOf('<MainProvision>');
  const mainEnd = xmlContent.indexOf('</MainProvision>');
  
  if (mainStart !== -1 && mainEnd !== -1) {
    const mainProvision = xmlContent.substring(mainStart, mainEnd + '</MainProvision>'.length);
    
    // Article要素を数える
    const articleMatches = mainProvision.matchAll(/<Article[^>]*Num="([^"]+)"/g);
    const articles = Array.from(articleMatches);
    
    console.log(`MainProvision内の条文数: ${articles.length}`);
    console.log(`最初の条文: 第${articles[0]?.[1]}条`);
    console.log(`最後の条文: 第${articles[articles.length - 1]?.[1]}条`);
  }
  
  // SupplProvisionの数を確認
  const supplMatches = xmlContent.matchAll(/<SupplProvision[^>]*AmendLawNum="([^"]+)"/g);
  const supplProvisions = Array.from(supplMatches);
  
  console.log(`\n附則の数: ${supplProvisions.length}`);
  console.log(`最初の附則: ${supplProvisions[0]?.[1]}`);
  console.log(`最後の附則: ${supplProvisions[supplProvisions.length - 1]?.[1]}`);
  
  // 全体のArticle要素を数える（本文＋附則）
  const allArticleMatches = xmlContent.matchAll(/<Article[^>]*Num="([^"]+)"/g);
  const allArticles = Array.from(allArticleMatches);
  
  console.log(`\n全体のArticle要素数: ${allArticles.length}`);
  
  // 附則内のArticle要素があるか確認
  const supplStart = xmlContent.indexOf('<SupplProvision');
  if (supplStart !== -1) {
    const supplSection = xmlContent.substring(supplStart);
    const supplArticleMatches = supplSection.matchAll(/<Article[^>]*Num="([^"]+)"/g);
    const supplArticles = Array.from(supplArticleMatches);
    
    console.log(`附則内のArticle要素数: ${supplArticles.length}`);
    if (supplArticles.length > 0) {
      console.log(`附則内の最初のArticle: 第${supplArticles[0][1]}条`);
    }
  }
}

checkArticleExtraction().catch(console.error);