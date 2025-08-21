#!/usr/bin/env npx tsx

/**
 * e-GovとLawFinderの参照検出差異分析スクリプト
 */

import { UltimateReferenceDetector } from './detector';
import * as fs from 'fs';
import chalk from 'chalk';

// 実際のe-Gov法令データからの検証用テストケース
const testCases = [
  {
    lawId: '129AC0000000089',
    lawName: '民法',
    articleNum: '第94条',
    text: '相手方と通じてした虚偽の意思表示は、無効とする。前項の規定による意思表示の無効は、善意の第三者に対抗することができない。',
    egovReferences: [
      { type: 'relative', target: '前項', resolved: '第94条第1項' }
    ]
  },
  {
    lawId: '417AC0000000086',
    lawName: '会社法',
    articleNum: '第349条',
    text: '取締役は、株式会社を代表する。ただし、他に代表取締役その他株式会社を代表する者を定めた場合は、この限りでない。前項本文の取締役が二人以上ある場合には、取締役は、各自、株式会社を代表する。株式会社（取締役会設置会社を除く。）は、定款、定款の定めに基づく取締役の互選又は株主総会の決議によって、取締役の中から代表取締役を定めることができる。代表取締役は、株式会社の業務に関する一切の裁判上又は裁判外の行為をする権限を有する。前項の権限に加えた制限は、善意の第三者に対抗することができない。',
    egovReferences: [
      { type: 'relative', target: '前項本文', resolved: '第349条第1項本文' },
      { type: 'relative', target: '前項', resolved: '第349条第4項' }
    ]
  },
  {
    lawId: '140AC0000000045',
    lawName: '刑法',
    articleNum: '第60条',
    text: '二人以上共同して犯罪を実行した者は、すべて正犯とする。',
    egovReferences: []  // 参照なし
  },
  {
    lawId: '323AC0000000131',
    lawName: '刑事訴訟法',
    articleNum: '第189条',
    text: '警察官は、それぞれ、他の法律又は国家公安委員会若しくは都道府県公安委員会の定めるところにより、司法警察職員として職務を行う。司法警察職員は、犯罪があると思料するときは、犯人及び証拠を捜査するものとする。',
    egovReferences: []  // 他の法律への参照（不特定）
  },
  {
    lawId: '129AC0000000089',
    lawName: '民法',
    articleNum: '第570条',
    text: '売買の目的物に隠れた瑕疵があったときは、第五百六十六条の規定を準用する。ただし、強制競売の場合は、この限りでない。',
    egovReferences: [
      { type: 'external', target: '第五百六十六条', resolved: '第566条' }
    ]
  },
  {
    lawId: '408AC0000000109',
    lawName: '民事訴訟法',
    articleNum: '第89条',
    text: '当事者が裁判所において和解をすることができる事件については、第二百七十五条の規定により和解を試みることができる場合を除き、裁判所は、訴訟がいかなる程度にあるかを問わず、和解を試み、又は受命裁判官若しくは受託裁判官に和解を試みさせることができる。',
    egovReferences: [
      { type: 'internal', target: '第二百七十五条', resolved: '第275条' }
    ]
  },
  {
    lawId: '322AC0000000049',
    lawName: '労働基準法',
    articleNum: '第36条',
    text: '使用者は、当該事業場に、労働者の過半数で組織する労働組合がある場合においてはその労働組合、労働者の過半数で組織する労働組合がない場合においては労働者の過半数を代表する者との書面による協定をし、厚生労働大臣に届け出た場合においては、第三十二条から第三十二条の五まで若しくは第四十条の労働時間（以下この条において「労働時間」という。）又は前条の休日（以下この条において「休日」という。）に関する規定にかかわらず、その協定で定めるところによつて労働時間を延長し、又は休日に労働させることができる。',
    egovReferences: [
      { type: 'range', target: '第三十二条から第三十二条の五まで', resolved: '第32条-第32条の5' },
      { type: 'internal', target: '第四十条', resolved: '第40条' },
      { type: 'relative', target: '前条', resolved: '第35条' }
    ]
  },
  {
    lawId: '129AC0000000089',
    lawName: '民法',
    articleNum: '第717条',
    text: '土地の工作物の設置又は保存に瑕疵があることによって他人に損害を生じたときは、その工作物の占有者は、被害者に対してその損害を賠償する責任を負う。ただし、占有者が損害の発生を防止するのに必要な注意をしたときは、所有者がその損害を賠償しなければならない。前項の規定は、竹木の栽植又は支持に瑕疵がある場合について準用する。前二項の場合において、損害の原因について他にその責任を負う者があるときは、占有者又は所有者は、その者に対して求償権を行使することができる。',
    egovReferences: [
      { type: 'relative', target: '前項', resolved: '第717条第1項' },
      { type: 'relative', target: '前二項', resolved: '第717条第1項及び第2項' }
    ]
  },
  {
    lawId: '417AC0000000086',
    lawName: '会社法',
    articleNum: '第447条',
    text: '株式会社は、次に掲げる額の合計額から第四号から第六号までに掲げる額の合計額を減じて得た額を限度として、剰余金の配当をすることができる。',
    egovReferences: [
      { type: 'list', target: '第四号から第六号まで', resolved: '第447条第4号-第6号' }
    ]
  },
  {
    lawId: '129AC0000000089',
    lawName: '民法',
    articleNum: '第1条',
    text: '私権は、公共の福祉に適合しなければならない。権利の行使及び義務の履行は、信義に従い誠実に行わなければならない。権利の濫用は、これを許さない。',
    egovReferences: []  // 参照なし（一般原則）
  }
];

async function analyzeDetectionGaps() {
  console.log(chalk.cyan.bold('===== e-Gov vs LawFinder 参照検出差異分析 =====\n'));
  
  const detector = new UltimateReferenceDetector(false);
  
  // 分析結果を格納
  const results = {
    egovOnly: [] as any[],        // e-Govのみが検出
    lawfinderOnly: [] as any[],   // LawFinderのみが検出
    both: [] as any[],            // 両方が検出
    neither: [] as any[],         // どちらも検出せず
    statistics: {
      totalCases: testCases.length,
      totalEgovRefs: 0,
      totalLawfinderRefs: 0,
      matchedRefs: 0,
      egovOnlyRefs: 0,
      lawfinderOnlyRefs: 0
    }
  };
  
  for (const testCase of testCases) {
    console.log(chalk.yellow(`\n[${testCase.lawName} ${testCase.articleNum}]`));
    console.log(chalk.gray(`条文: ${testCase.text.substring(0, 50)}...`));
    
    // LawFinderで検出
    const detectedRefs = await detector.detectReferences(
      testCase.text,
      testCase.lawId,
      testCase.lawName,
      testCase.articleNum
    );
    
    // e-Govの参照をSetに変換
    const egovTargets = new Set(testCase.egovReferences.map(r => r.resolved || r.target));
    
    // LawFinderの参照をSetに変換
    const lawfinderTargets = new Set(
      detectedRefs
        .filter(r => r.targetArticle)
        .map(r => r.targetArticle)
    );
    
    // 統計を更新
    results.statistics.totalEgovRefs += egovTargets.size;
    results.statistics.totalLawfinderRefs += lawfinderTargets.size;
    
    // e-Govのみが検出した参照
    const egovOnly = Array.from(egovTargets).filter(ref => !lawfinderTargets.has(ref));
    if (egovOnly.length > 0) {
      console.log(chalk.red(`  ❌ e-Govのみ検出: ${egovOnly.join(', ')}`));
      results.egovOnly.push({
        law: `${testCase.lawName} ${testCase.articleNum}`,
        references: egovOnly,
        context: testCase.text.substring(0, 100)
      });
      results.statistics.egovOnlyRefs += egovOnly.length;
    }
    
    // LawFinderのみが検出した参照
    const lawfinderOnly = Array.from(lawfinderTargets).filter(ref => !egovTargets.has(ref));
    if (lawfinderOnly.length > 0) {
      console.log(chalk.blue(`  🔍 LawFinderのみ検出: ${lawfinderOnly.join(', ')}`));
      
      // 詳細情報を取得
      const details = lawfinderOnly.map(target => {
        const ref = detectedRefs.find(r => r.targetArticle === target);
        return {
          target,
          type: ref?.type,
          confidence: ref?.confidence,
          text: ref?.text
        };
      });
      
      results.lawfinderOnly.push({
        law: `${testCase.lawName} ${testCase.articleNum}`,
        references: details,
        context: testCase.text.substring(0, 100)
      });
      results.statistics.lawfinderOnlyRefs += lawfinderOnly.length;
    }
    
    // 両方が検出した参照
    const matched = Array.from(egovTargets).filter(ref => lawfinderTargets.has(ref));
    if (matched.length > 0) {
      console.log(chalk.green(`  ✅ 両方が検出: ${matched.join(', ')}`));
      results.both.push({
        law: `${testCase.lawName} ${testCase.articleNum}`,
        references: matched
      });
      results.statistics.matchedRefs += matched.length;
    }
    
    // どちらも検出しなかった場合
    if (egovTargets.size === 0 && lawfinderTargets.size === 0) {
      console.log(chalk.gray(`  - 参照なし（両システム一致）`));
      results.neither.push(`${testCase.lawName} ${testCase.articleNum}`);
    }
  }
  
  // サマリー表示
  console.log(chalk.cyan.bold('\n\n===== 分析結果サマリー =====\n'));
  
  console.log(chalk.yellow('【統計】'));
  console.log(`  テストケース数: ${results.statistics.totalCases}`);
  console.log(`  e-Gov検出参照数: ${results.statistics.totalEgovRefs}`);
  console.log(`  LawFinder検出参照数: ${results.statistics.totalLawfinderRefs}`);
  console.log(`  一致した参照数: ${results.statistics.matchedRefs}`);
  console.log(`  e-Govのみ: ${results.statistics.egovOnlyRefs}`);
  console.log(`  LawFinderのみ: ${results.statistics.lawfinderOnlyRefs}`);
  
  const precision = results.statistics.matchedRefs / results.statistics.totalLawfinderRefs || 0;
  const recall = results.statistics.matchedRefs / results.statistics.totalEgovRefs || 0;
  const f1 = 2 * (precision * recall) / (precision + recall) || 0;
  
  console.log(chalk.green(`\n【精度指標】`));
  console.log(`  精度(Precision): ${(precision * 100).toFixed(1)}%`);
  console.log(`  再現率(Recall): ${(recall * 100).toFixed(1)}%`);
  console.log(`  F1スコア: ${(f1 * 100).toFixed(1)}%`);
  
  // e-Govのみが検出した参照の詳細
  if (results.egovOnly.length > 0) {
    console.log(chalk.red.bold('\n【e-Govのみが検出した参照（LawFinderの課題）】'));
    for (const item of results.egovOnly) {
      console.log(`\n  ${item.law}:`);
      console.log(`    未検出: ${item.references.join(', ')}`);
      console.log(chalk.gray(`    条文: "${item.context}..."`));
    }
  }
  
  // LawFinderのみが検出した参照の詳細
  if (results.lawfinderOnly.length > 0) {
    console.log(chalk.blue.bold('\n【LawFinderのみが検出した参照（潜在的な優位性）】'));
    for (const item of results.lawfinderOnly) {
      console.log(`\n  ${item.law}:`);
      for (const ref of item.references) {
        console.log(`    ${ref.target} (${ref.type}, 信頼度: ${(ref.confidence * 100).toFixed(0)}%)`);
        if (ref.text) {
          console.log(chalk.gray(`      抽出テキスト: "${ref.text}"`));
        }
      }
    }
  }
  
  // 結果をJSONファイルに保存
  const reportData = {
    timestamp: new Date().toISOString(),
    statistics: results.statistics,
    precision,
    recall,
    f1Score: f1,
    egovOnlyReferences: results.egovOnly,
    lawfinderOnlyReferences: results.lawfinderOnly,
    matchedReferences: results.both,
    noReferences: results.neither
  };
  
  fs.writeFileSync(
    'Report/detection_gap_analysis.json',
    JSON.stringify(reportData, null, 2)
  );
  
  console.log(chalk.green('\n\n✅ 詳細レポートをReport/detection_gap_analysis.jsonに保存しました'));
  
  return reportData;
}

// メイン実行
analyzeDetectionGaps().catch(console.error);