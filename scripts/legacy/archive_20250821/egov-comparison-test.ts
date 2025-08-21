#!/usr/bin/env npx tsx

import { UltimateReferenceDetector } from './detector';
import * as fs from 'fs';

// テスト用の法令テキスト（実際の条文とe-Govでの参照リンク）
const testTexts = [
  {
    id: '民法第90条',
    text: '公の秩序又は善良の風俗に反する法律行為は、無効とする。',
    egov_refs: [] // e-Govではこの条文に参照リンクなし
  },
  {
    id: '民法第709条', 
    text: '故意又は過失によって他人の権利又は法律上保護される利益を侵害した者は、これによって生じた損害を賠償する責任を負う。',
    egov_refs: [] // e-Govではこの条文に参照リンクなし
  },
  {
    id: '民法第415条',
    text: '債務者がその債務の本旨に従った履行をしないとき又は債務の履行が不能であるときは、債権者は、これによって生じた損害の賠償を請求することができる。ただし、その債務の不履行が契約その他の債務の発生原因及び取引上の社会通念に照らして債務者の責めに帰することができない事由によるものであるときは、この限りでない。',
    egov_refs: [] 
  },
  {
    id: '商法第4条',
    text: 'この法律において「商人」とは、自己の名をもって商行為をすることを業とする者をいう。',
    egov_refs: []
  },
  {
    id: '会社法第26条',
    text: '会社法人等番号は、次の各号に掲げる会社の区分に応じ、当該各号に定める番号とする。一 設立の登記をした会社（次号に掲げる会社を除く。） 当該設立の登記における会社法人等番号 二 組織変更、合併又は会社分割（第七百五十八条第八号、第七百六十条第八号、第七百六十五条第一項第八号又は第七百六十七条第一項第六号に掲げる事項を定めたものを除く。）により設立された会社 当該組織変更、合併又は会社分割前の会社の会社法人等番号',
    egov_refs: ['第七百五十八条第八号', '第七百六十条第八号', '第七百六十五条第一項第八号', '第七百六十七条第一項第六号']
  },
  {
    id: '刑法第199条',
    text: '人を殺した者は、死刑又は無期若しくは五年以上の懲役に処する。',
    egov_refs: []
  },
  {
    id: '労働基準法第32条',
    text: '使用者は、労働者に、休憩時間を除き一週間について四十時間を超えて、労働させてはならない。使用者は、一週間の各日については、労働者に、休憩時間を除き一日について八時間を超えて、労働させてはならない。',
    egov_refs: []
  },
  {
    id: '民事訴訟法第133条',
    text: '訴状は、被告に送達しなければならない。前条第一項の規定により訴状を却下した場合も、同様とする。',
    egov_refs: ['前条第一項']
  },
  {
    id: '刑事訴訟法第212条',
    text: '現に罪を行い、又は現に罪を行い終つた者を現行犯人とする。左の各号の一にあたる者が、罪を行い終つてから間がないと明らかに認められるときは、これを現行犯人とみなす。一 犯人として追呼されているとき。二 贓物又は明らかに犯罪の用に供したと思われる兇器その他の物を所持しているとき。三 身体又は被服に犯罪の顕著な証跡があるとき。四 誰何されて逃走しようとするとき。',
    egov_refs: []
  },
  {
    id: '行政手続法第5条',
    text: '行政庁は、審査基準を定めるに当たっては、許認可等の性質に照らしてできる限り具体的なものとしなければならない。行政庁は、行政上特別の支障があるときを除き、法令により申請の提出先とされている機関の事務所における備付けその他の適当な方法により審査基準を公にしておかなければならない。',
    egov_refs: []
  }
];

async function main() {
  console.log('===== e-Gov参照検出精度比較テスト =====\n');

  // 1. 単純パターン検出（Phase 1のみ）
  console.log('【1. 単純パターン検出（正規表現のみ）】\n');
  const simpleDetector = new UltimateReferenceDetector(false);
  simpleDetector.enabledPhases = { pattern: true, context: false, llm: false };

  let simpleCorrect = 0;
  let simpleFalsePositive = 0;
  let simpleFalseNegative = 0;

  for (const test of testTexts) {
    const refs = await simpleDetector.detectReferences(test.text, '129AC0000000089', '民法', test.id);
    const detectedRefs = refs.map(r => r.targetArticle).filter(r => r);
    
    // e-Govの参照と比較
    const egov = new Set(test.egov_refs);
    const detected = new Set(detectedRefs);
    
    const truePositive = Array.from(detected).filter(r => egov.has(r)).length;
    const falsePositive = Array.from(detected).filter(r => !egov.has(r)).length;
    const falseNegative = Array.from(egov).filter(r => !detected.has(r)).length;
    
    simpleCorrect += truePositive;
    simpleFalsePositive += falsePositive;
    simpleFalseNegative += falseNegative;
    
    console.log(`${test.id}: 検出${detected.size}件, e-Gov${egov.size}件 (TP:${truePositive}, FP:${falsePositive}, FN:${falseNegative})`);
  }

  const simplePrecision = simpleCorrect / (simpleCorrect + simpleFalsePositive) || 0;
  const simpleRecall = simpleCorrect / (simpleCorrect + simpleFalseNegative) || 0;
  const simpleF1 = 2 * (simplePrecision * simpleRecall) / (simplePrecision + simpleRecall) || 0;

  console.log(`\n単純パターン検出結果:`);
  console.log(`  精度(Precision): ${(simplePrecision * 100).toFixed(1)}%`);
  console.log(`  再現率(Recall): ${(simpleRecall * 100).toFixed(1)}%`);
  console.log(`  F1スコア: ${(simpleF1 * 100).toFixed(1)}%\n`);

  // 2. コンテキスト強化検出（Phase 1 + Phase 2）
  console.log('【2. コンテキスト強化検出（正規表現+文脈解析）】\n');
  const contextDetector = new UltimateReferenceDetector(false);
  contextDetector.enabledPhases = { pattern: true, context: true, llm: false };

  let contextCorrect = 0;
  let contextFalsePositive = 0;
  let contextFalseNegative = 0;

  for (const test of testTexts) {
    const refs = await contextDetector.detectReferences(test.text, '129AC0000000089', '民法', test.id);
    const detectedRefs = refs.map(r => r.targetArticle).filter(r => r);
    
    const egov = new Set(test.egov_refs);
    const detected = new Set(detectedRefs);
    
    const truePositive = Array.from(detected).filter(r => egov.has(r)).length;
    const falsePositive = Array.from(detected).filter(r => !egov.has(r)).length;
    const falseNegative = Array.from(egov).filter(r => !detected.has(r)).length;
    
    contextCorrect += truePositive;
    contextFalsePositive += falsePositive;
    contextFalseNegative += falseNegative;
    
    console.log(`${test.id}: 検出${detected.size}件, e-Gov${egov.size}件 (TP:${truePositive}, FP:${falsePositive}, FN:${falseNegative})`);
  }

  const contextPrecision = contextCorrect / (contextCorrect + contextFalsePositive) || 0;
  const contextRecall = contextCorrect / (contextCorrect + contextFalseNegative) || 0;
  const contextF1 = 2 * (contextPrecision * contextRecall) / (contextPrecision + contextRecall) || 0;

  console.log(`\nコンテキスト強化検出結果:`);
  console.log(`  精度(Precision): ${(contextPrecision * 100).toFixed(1)}%`);
  console.log(`  再現率(Recall): ${(contextRecall * 100).toFixed(1)}%`);
  console.log(`  F1スコア: ${(contextF1 * 100).toFixed(1)}%\n`);

  // 結果をJSONファイルに保存
  const results = {
    timestamp: new Date().toISOString(),
    testCases: testTexts.length,
    totalEgovReferences: testTexts.reduce((sum, t) => sum + t.egov_refs.length, 0),
    simplePattern: {
      precision: simplePrecision,
      recall: simpleRecall,
      f1Score: simpleF1,
      truePositive: simpleCorrect,
      falsePositive: simpleFalsePositive,
      falseNegative: simpleFalseNegative
    },
    contextEnhanced: {
      precision: contextPrecision,
      recall: contextRecall,
      f1Score: contextF1,
      truePositive: contextCorrect,
      falsePositive: contextFalsePositive,
      falseNegative: contextFalseNegative
    },
    improvement: {
      precisionGain: contextPrecision - simplePrecision,
      recallGain: contextRecall - simpleRecall,
      f1Gain: contextF1 - simpleF1
    }
  };

  fs.writeFileSync('Report/egov_comparison_results.json', JSON.stringify(results, null, 2));
  console.log('\n結果をReport/egov_comparison_results.jsonに保存しました');
}

main().catch(console.error);