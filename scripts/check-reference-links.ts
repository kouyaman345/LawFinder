import { promises as fs } from 'fs';
import path from 'path';

// ブラウザで実際にリンクが生成されているか確認
async function checkReferenceLinks() {
  const lawId = '140AC0000000045'; // 刑法
  const articleId = '77'; // 第77条（内乱）
  
  console.log('参照リンク生成確認\n');
  console.log(`対象: 刑法 第${articleId}条`);
  console.log('期待される参照: "第七十七条から第七十九条まで"がリンクになっているか\n');
  
  // curlでHTMLを取得
  const command = `curl -s http://localhost:3000/laws/${lawId} | grep -A 10 -B 10 'art${articleId}'`;
  
  console.log('実行コマンド:', command);
  console.log('\n結果:');
  
  // 特定の参照パターンのリンク化を確認
  const patterns = [
    '第七十七条から第七十九条まで', // 範囲参照
    '前条',                          // 相対参照
    '同条',                          // 相対参照
    '次に掲げる',                    // 複合参照
    '第二号',                        // 号のみの参照（検出されていない）
    '附則第三条'                     // 附則への参照（検出されていない）
  ];
  
  console.log('\n検出確認対象のパターン:');
  patterns.forEach(pattern => {
    console.log(`- ${pattern}`);
  });
  
  console.log('\n開発サーバーで http://localhost:3000/laws/140AC0000000045#art77 にアクセスして確認してください。');
  console.log('特に以下を確認:');
  console.log('1. "第七十七条から第七十九条まで" がリンクになっているか');
  console.log('2. "前条"、"同条" などの相対参照がハイライトされているか');
  console.log('3. "第二号" などの号への参照がリンクになっているか（現在は未対応）');
}

// 特定の条文のHTMLを取得して参照リンクを確認
async function analyzeArticleHTML() {
  const testCases = [
    { lawId: '140AC0000000045', articleId: '77', expectedRefs: ['第七十七条から第七十九条まで'] },
    { lawId: '322AC0000000049', articleId: '32', expectedRefs: ['第三十二条の二から第三十二条の五まで'] },
    { lawId: '132AC0000000048', articleId: '1', expectedRefs: ['民法第一条'] }
  ];
  
  console.log('\n\n=== 各法令の参照リンク生成状況 ===\n');
  
  for (const testCase of testCases) {
    console.log(`【${testCase.lawId} 第${testCase.articleId}条】`);
    console.log('期待される参照:', testCase.expectedRefs.join(', '));
    console.log('URL:', `http://localhost:3000/laws/${testCase.lawId}#art${testCase.articleId}`);
    console.log('---');
  }
}

checkReferenceLinks();
analyzeArticleHTML();