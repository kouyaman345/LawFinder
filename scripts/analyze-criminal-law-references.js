const fs = require('fs').promises;
const path = require('path');

async function analyzeReferences() {
  console.log('=== 刑法の未検出参照パターン分析 ===\n');
  
  const xmlPath = path.join(__dirname, '../laws_data/sample/140AC0000000045.xml');
  const xmlContent = await fs.readFile(xmlPath, 'utf-8');
  
  // 既存のパターンでは検出できない参照パターンを探す
  const undetectedPatterns = [
    // 1. 範囲参照
    {
      name: '条文範囲参照',
      regex: /第([０-９0-9一二三四五六七八九十百千]+)条から第([０-９0-9一二三四五六七八九十百千]+)条まで/g,
      examples: []
    },
    // 2. 複数条文参照
    {
      name: '複数条文参照（前○条）',
      regex: /前([二三四五六七八九十])条/g,
      examples: []
    },
    // 3. 括弧付き条文詳細
    {
      name: '括弧付き条文説明',
      regex: /第([０-９0-9一二三四五六七八九十百千]+)条(?:から第[０-９0-9一二三四五六七八九十百千]+条まで)?（[^）]+）/g,
      examples: []
    },
    // 4. この章・この編・この節
    {
      name: '構造参照',
      regex: /この(章|編|節|款)/g,
      examples: []
    },
    // 5. 並びに・及び を含む複合参照
    {
      name: '複合参照（並びに・及び）',
      regex: /第([０-９0-9一二三四五六七八九十百千]+)条(、第[０-９0-9一二三四五六七八九十百千]+条)*(?:並びに|及び)第[０-９0-9一二三四五六七八九十百千]+条/g,
      examples: []
    },
    // 6. 同法・当該
    {
      name: '同法・当該参照',
      regex: /(同法|当該).*?第([０-９0-9一二三四五六七八九十百千]+)条/g,
      examples: []
    },
    // 7. ただし書
    {
      name: 'ただし書参照',
      regex: /ただし書/g,
      examples: []
    },
    // 8. 各号列記
    {
      name: '各号列記',
      regex: /次の各号|次に掲げる/g,
      examples: []
    },
    // 9. 準用
    {
      name: '準用規定',
      regex: /準用する/g,
      examples: []
    }
  ];
  
  // 各パターンをテスト
  for (const pattern of undetectedPatterns) {
    const matches = Array.from(xmlContent.matchAll(pattern.regex));
    
    if (matches.length > 0) {
      console.log(`\n【${pattern.name}】 - ${matches.length}件`);
      
      // 最初の5件を表示
      for (let i = 0; i < Math.min(5, matches.length); i++) {
        const match = matches[i];
        // 前後の文脈を取得
        const start = Math.max(0, match.index - 50);
        const end = Math.min(xmlContent.length, match.index + match[0].length + 50);
        const context = xmlContent.substring(start, end)
          .replace(/<[^>]+>/g, '') // XMLタグを除去
          .replace(/\s+/g, ' ')     // 改行をスペースに
          .trim();
        
        console.log(`  ${i + 1}. "${match[0]}"`);
        console.log(`     文脈: ...${context}...`);
      }
      
      if (matches.length > 5) {
        console.log(`  ... 他 ${matches.length - 5} 件`);
      }
    }
  }
  
  // 条文内での参照の統計
  console.log('\n\n=== 条文ごとの参照パターン統計 ===');
  
  const articleMatches = xmlContent.matchAll(/<Article[^>]*Num="([^"]+)"[^>]*>([\s\S]*?)<\/Article>/g);
  const referenceStats = new Map();
  
  for (const match of articleMatches) {
    const articleNum = match[1];
    const articleContent = match[2]
      .replace(/<Ruby>[\s\S]*?<\/Ruby>/g, (rubyMatch) => {
        const rtMatch = rubyMatch.match(/<Rt>([^<]+)<\/Rt>/);
        const baseMatch = rubyMatch.match(/>([^<>]+)<Rt>/);
        if (rtMatch && baseMatch) return baseMatch[1];
        return rubyMatch.replace(/<[^>]+>/g, '');
      })
      .replace(/<[^>]+>/g, '');
    
    const refs = [];
    
    // すべての参照パターンをチェック
    const allPatterns = [
      /第([０-９0-9一二三四五六七八九十百千]+)条/g,
      /前([項条章節編])/g,
      /次([項条章節編])/g,
      /同([項条])/g,
      /この([章編節款])/g
    ];
    
    for (const pattern of allPatterns) {
      const matches = articleContent.matchAll(pattern);
      for (const m of matches) {
        refs.push(m[0]);
      }
    }
    
    if (refs.length > 0) {
      referenceStats.set(articleNum, refs);
    }
  }
  
  // 参照が多い条文トップ10
  const sortedStats = Array.from(referenceStats.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10);
  
  console.log('\n参照が多い条文トップ10:');
  for (const [articleNum, refs] of sortedStats) {
    console.log(`  第${articleNum}条: ${refs.length}件の参照`);
    const uniqueRefs = [...new Set(refs)];
    console.log(`    種類: ${uniqueRefs.slice(0, 5).join(', ')}${uniqueRefs.length > 5 ? ` 他${uniqueRefs.length - 5}種` : ''}`);
  }
  
  console.log('\n✅ 分析完了');
}

// 実行
analyzeReferences().catch(console.error);