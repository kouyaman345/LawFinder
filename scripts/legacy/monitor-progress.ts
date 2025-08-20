#!/usr/bin/env tsx

/**
 * インポートと参照検出の進捗監視スクリプト
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function monitorProgress() {
  const totalLaws = 8910;
  const totalVersions = 10573;
  
  setInterval(async () => {
    try {
      const stats = {
        lawMaster: await prisma.lawMaster.count(),
        lawVersion: await prisma.lawVersion.count(),
        article: await prisma.article.count(),
        paragraph: await prisma.paragraph.count(),
        reference: await prisma.reference.count()
      };
      
      // 参照タイプ別統計
      const refTypes = await prisma.reference.groupBy({
        by: ['referenceType'],
        _count: true
      });
      
      console.clear();
      console.log('='.repeat(60));
      console.log('📊 LawFinder データベース進捗モニター');
      console.log('='.repeat(60));
      console.log(new Date().toLocaleString('ja-JP'));
      console.log();
      
      console.log('📚 法令インポート:');
      console.log(`  法令マスター: ${stats.lawMaster}/${totalLaws} (${Math.round(stats.lawMaster/totalLaws*100)}%)`);
      console.log(`  バージョン: ${stats.lawVersion}/${totalVersions} (${Math.round(stats.lawVersion/totalVersions*100)}%)`);
      console.log(`  条文: ${stats.article.toLocaleString()}`);
      console.log(`  項: ${stats.paragraph.toLocaleString()}`);
      
      console.log();
      console.log('🔗 参照検出:');
      console.log(`  総参照数: ${stats.reference.toLocaleString()}`);
      
      if (refTypes.length > 0) {
        console.log('  タイプ別:');
        for (const type of refTypes) {
          console.log(`    ${type.referenceType}: ${type._count}`);
        }
      }
      
      // 進捗バー
      console.log();
      console.log('進捗バー:');
      const progress = Math.round(stats.lawMaster / totalLaws * 100);
      const barLength = 40;
      const filled = Math.round(barLength * progress / 100);
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
      console.log(`[${bar}] ${progress}%`);
      
      // 推定残り時間（簡易計算）
      if (stats.lawMaster > 100) {
        const elapsedMinutes = 5; // 仮の値
        const rate = stats.lawMaster / elapsedMinutes;
        const remaining = (totalLaws - stats.lawMaster) / rate;
        console.log(`推定残り時間: 約${Math.round(remaining)}分`);
      }
      
    } catch (error) {
      console.error('モニタリングエラー:', error);
    }
  }, 5000); // 5秒ごとに更新
}

console.log('モニタリング開始... (Ctrl+Cで終了)');
monitorProgress();