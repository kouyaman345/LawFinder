#!/usr/bin/env npx tsx

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

const prisma = new PrismaClient();

/**
 * 主要法令のリスト
 */
const MAJOR_LAWS = [
  { id: '129AC0000000089', title: '民法', type: '法律' },
  { id: '132AC0000000048', title: '商法', type: '法律' },
  { id: '140AC0000000045', title: '刑法', type: '法律' },
  { id: '417AC0000000086', title: '会社法', type: '法律' },
  { id: '322AC0000000049', title: '労働基準法', type: '法律' }
];

/**
 * XMLファイルを探して読み込む
 */
function findAndReadXML(lawId: string): string | null {
  const lawsDir = path.join(process.cwd(), 'laws_data');
  
  try {
    const dirs = fs.readdirSync(lawsDir).filter(d => d.startsWith(lawId));
    
    if (dirs.length === 0) {
      console.warn(chalk.yellow(`XMLファイルが見つかりません: ${lawId}`));
      return null;
    }
    
    // 最新のディレクトリを選択
    const latestDir = dirs.sort().reverse()[0];
    const xmlPath = path.join(lawsDir, latestDir, `${latestDir}.xml`);
    
    if (fs.existsSync(xmlPath)) {
      return fs.readFileSync(xmlPath, 'utf-8');
    }
  } catch (error) {
    console.error(chalk.red(`XMLファイル読み込みエラー: ${error}`));
  }
  
  return null;
}

/**
 * XMLから法令番号と公布日を抽出
 */
function extractLawMetadata(xmlContent: string) {
  const lawNumberMatch = xmlContent.match(/LawNum="([^"]+)"/);
  const promulgationDateMatch = xmlContent.match(/PromulgateDate="([^"]+)"/);
  
  return {
    lawNumber: lawNumberMatch ? lawNumberMatch[1] : null,
    promulgationDate: promulgationDateMatch ? new Date(promulgationDateMatch[1].replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) : null
  };
}

/**
 * 法令マスタとバージョンを作成
 */
async function createLawMasterAndVersion(law: typeof MAJOR_LAWS[0]) {
  const xmlContent = findAndReadXML(law.id);
  
  if (!xmlContent) {
    console.error(chalk.red(`${law.title}のXMLファイルが見つかりません`));
    return;
  }
  
  const metadata = extractLawMetadata(xmlContent);
  
  // LawMasterを作成
  const lawMaster = await prisma.lawMaster.upsert({
    where: { id: law.id },
    update: {
      title: law.title,
      lawType: law.type,
      lawNumber: metadata.lawNumber
    },
    create: {
      id: law.id,
      title: law.title,
      lawType: law.type,
      lawNumber: metadata.lawNumber
    }
  });
  
  // LawVersionを作成
  const versionId = `${law.id}_v1`;
  const lawVersion = await prisma.lawVersion.upsert({
    where: { id: versionId },
    update: {
      xmlContent,
      promulgationDate: metadata.promulgationDate,
      isLatest: true
    },
    create: {
      id: versionId,
      lawId: law.id,
      versionDate: metadata.promulgationDate || new Date(),
      promulgationDate: metadata.promulgationDate,
      xmlContent,
      isLatest: true
    }
  });
  
  // currentVersionIdを設定
  await prisma.lawMaster.update({
    where: { id: law.id },
    data: { currentVersionId: versionId }
  });
  
  console.log(chalk.green(`✅ ${law.title}を作成しました`));
}

/**
 * メイン処理
 */
async function main() {
  console.log(chalk.cyan('📚 法令マスタデータの初期化を開始します...'));
  
  for (const law of MAJOR_LAWS) {
    await createLawMasterAndVersion(law);
  }
  
  // 統計情報表示
  const masterCount = await prisma.lawMaster.count();
  const versionCount = await prisma.lawVersion.count();
  
  console.log(chalk.cyan('\n📊 統計情報:'));
  console.log(`  法令マスタ: ${masterCount}件`);
  console.log(`  法令バージョン: ${versionCount}件`);
  
  await prisma.$disconnect();
  console.log(chalk.green('\n✨ 初期化完了'));
}

main().catch(console.error);