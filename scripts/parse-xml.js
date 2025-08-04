#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');

const XML_DATA_PATH = process.env.XML_DATA_PATH || './laws_data/sample';

async function parseXMLFile(filePath) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    normalizeTags: true,
    trim: true
  });
  
  try {
    const xmlData = await fs.readFile(filePath, 'utf-8');
    const result = await parser.parseStringPromise(xmlData);
    return result;
  } catch (error) {
    console.error(`Failed to parse ${filePath}:`, error);
    return null;
  }
}

async function analyzeXMLStructure() {
  console.log('XMLファイル構造の解析を開始します...');
  
  const files = await fs.readdir(XML_DATA_PATH);
  const xmlFiles = files.filter(f => f.endsWith('.xml')).slice(0, 5); // 最初の5ファイルをサンプルとして解析
  
  for (const file of xmlFiles) {
    console.log(`\n=== ${file} ===`);
    const filePath = path.join(XML_DATA_PATH, file);
    const parsed = await parseXMLFile(filePath);
    
    if (parsed) {
      console.log('ルート要素:', Object.keys(parsed));
      
      if (parsed.law) {
        const law = parsed.law;
        console.log('法令属性:', law.$ || 'なし');
        console.log('法令タイトル:', law.lawtitle || law.LawTitle || 'なし');
        console.log('法令本体構造:', Object.keys(law).filter(k => k !== '$'));
        
        // 条文構造の確認
        const body = law.lawbody || law.LawBody || law.mainprovision || law.MainProvision;
        if (body) {
          console.log('本文構造:', Object.keys(body));
          
          const articles = body.article || body.Article || body.articles;
          if (articles) {
            const firstArticle = Array.isArray(articles) ? articles[0] : articles;
            console.log('条文構造:', Object.keys(firstArticle));
          }
        }
      }
    }
  }
}

async function extractSampleLaw() {
  console.log('\nサンプル法令データの抽出...');
  
  const files = await fs.readdir(XML_DATA_PATH);
  const xmlFile = files.find(f => f.endsWith('.xml'));
  
  if (xmlFile) {
    const filePath = path.join(XML_DATA_PATH, xmlFile);
    const parsed = await parseXMLFile(filePath);
    
    if (parsed && parsed.law) {
      const sampleData = {
        lawId: xmlFile.replace('.xml', ''),
        structure: JSON.stringify(parsed, null, 2)
      };
      
      await fs.writeFile(
        path.join(__dirname, 'sample-law-structure.json'),
        JSON.stringify(sampleData, null, 2),
        'utf-8'
      );
      
      console.log('サンプルデータを sample-law-structure.json に保存しました');
    }
  }
}

// 実行
if (require.main === module) {
  analyzeXMLStructure()
    .then(() => extractSampleLaw())
    .catch(console.error);
}