#!/usr/bin/env tsx

/**
 * 改善版参照検出のテスト
 * e-Govの実際の参照と同じように検出
 */

interface DetectedReference {
  type: 'external' | 'internal' | 'relative' | 'structural';
  text: string;
  targetLaw?: string;
  targetLawId?: string;
  targetArticle?: string;
  confidence: number;
}

class ImprovedDetector {
  // 主要法令のマッピング
  private readonly LAW_ID_MAP: Record<string, string> = {
    '民法': '129AC0000000089',
    '刑法': '140AC0000000045',
    '商法': '132AC0000000048',
    '会社法': '417AC0000000086',
    '労働基準法': '322AC0000000049',
    '民事訴訟法': '408AC0000000109',
    '刑事訴訟法': '323AC0000000131',
    '憲法': '321CO0000000000',
    '日本国憲法': '321CO0000000000',
  };
  
  detectReferences(text: string): DetectedReference[] {
    const references: DetectedReference[] = [];
    
    // パターン1: 法令名（括弧付き）
    // 例: 民法（明治二十九年法律第八十九号）
    const pattern1 = /([^、。\s（）]*法)（([^）]+)）/g;
    let match;
    
    while ((match = pattern1.exec(text)) !== null) {
      const lawName = match[1];
      const lawNumber = match[2];
      
      references.push({
        type: 'external',
        text: match[0],
        targetLaw: lawName,
        targetLawId: this.LAW_ID_MAP[lawName] || null,
        confidence: 0.95
      });
    }
    
    // パターン2: 法令名＋条文
    // 例: 民法第九十条
    const pattern2 = /([^、。\s（）]*法)第([一二三四五六七八九十百千]+)条/g;
    
    while ((match = pattern2.exec(text)) !== null) {
      const lawName = match[1];
      const articleNum = match[2];
      
      // 既に括弧付きで検出済みの場合はスキップ
      const alreadyDetected = references.some(ref => 
        ref.text.includes(lawName) && ref.text.includes('（')
      );
      
      if (!alreadyDetected) {
        references.push({
          type: 'external',
          text: match[0],
          targetLaw: lawName,
          targetLawId: this.LAW_ID_MAP[lawName] || null,
          targetArticle: `第${articleNum}条`,
          confidence: 0.9
        });
      }
    }
    
    // パターン3: この法律、同法など（内部参照）
    const pattern3 = /(この法律|同法)(?:第([一二三四五六七八九十百千]+)条)?/g;
    
    while ((match = pattern3.exec(text)) !== null) {
      references.push({
        type: 'internal',
        text: match[0],
        targetArticle: match[2] ? `第${match[2]}条` : null,
        confidence: 0.85
      });
    }
    
    // パターン4: 単独の条文番号（内部参照の可能性）
    const pattern4 = /(?<![法令])第([一二三四五六七八九十百千]+)条/g;
    
    while ((match = pattern4.exec(text)) !== null) {
      // 前後に法令名がない場合は内部参照
      const before = text.substring(Math.max(0, match.index - 20), match.index);
      const after = text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 20));
      
      if (!before.match(/[^、。\s]+法/) && !after.match(/^[^、。\s]*法/)) {
        // 既に検出済みでないか確認
        const alreadyDetected = references.some(ref => 
          ref.text.includes(match[0])
        );
        
        if (!alreadyDetected) {
          references.push({
            type: 'internal',
            text: match[0],
            targetArticle: match[0],
            confidence: 0.7
          });
        }
      }
    }
    
    return references;
  }
}

// テスト実行
function runTest() {
  console.log('='.repeat(80));
  console.log('📊 改善版参照検出テスト');
  console.log('='.repeat(80));
  
  const testCases = [
    {
      name: '商法第1条第2項',
      text: '商事に関し、この法律に定めがない事項については商慣習に従い、商慣習がないときは、民法（明治二十九年法律第八十九号）の定めるところによる。'
    },
    {
      name: '複数法令の参照',
      text: '民法第九十条及び会社法第二条の規定により、刑法第三十五条を準用する。'
    },
    {
      name: '内部参照',
      text: 'この法律第三条の規定により、前条及び次条の定めるところによる。'
    }
  ];
  
  const detector = new ImprovedDetector();
  
  testCases.forEach((testCase, i) => {
    console.log(`\n【テストケース${i + 1}】${testCase.name}`);
    console.log('テキスト:', testCase.text);
    console.log('\n検出結果:');
    
    const refs = detector.detectReferences(testCase.text);
    
    if (refs.length === 0) {
      console.log('  （参照が検出されませんでした）');
    } else {
      refs.forEach((ref, j) => {
        console.log(`  ${j + 1}. "${ref.text}"`);
        console.log(`     タイプ: ${ref.type}`);
        if (ref.targetLaw) {
          console.log(`     対象法令: ${ref.targetLaw} (ID: ${ref.targetLawId || '未特定'})`);
        }
        if (ref.targetArticle) {
          console.log(`     対象条文: ${ref.targetArticle}`);
        }
        console.log(`     信頼度: ${(ref.confidence * 100).toFixed(0)}%`);
      });
    }
  });
  
  // e-Govとの比較
  console.log('\n' + '='.repeat(80));
  console.log('📌 e-Gov実データとの比較');
  console.log('='.repeat(80));
  console.log('\n商法第1条第2項でe-Govが検出する参照:');
  console.log('  ✅ 民法（明治二十九年法律第八十九号） → 129AC0000000089');
  
  const article1Para2 = '商事に関し、この法律に定めがない事項については商慣習に従い、商慣習がないときは、民法（明治二十九年法律第八十九号）の定めるところによる。';
  const detected = detector.detectReferences(article1Para2);
  
  console.log('\n本システムの検出:');
  const minpoRef = detected.find(ref => ref.targetLaw === '民法');
  if (minpoRef) {
    console.log(`  ✅ ${minpoRef.text} → ${minpoRef.targetLawId}`);
    console.log('  🎉 e-Govと一致！');
  } else {
    console.log('  ❌ 民法への参照が検出されませんでした');
  }
}

runTest();