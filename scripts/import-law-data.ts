#!/usr/bin/env npx tsx

/**
 * 法令データ一括投入パイプライン
 *
 * 使用方法:
 *   npx tsx scripts/import-law-data.ts             # 全法令を投入
 *   npx tsx scripts/import-law-data.ts 129AC0000000089  # 特定法令のみ
 *   npx tsx scripts/import-law-data.ts --metadata-only  # メタデータのみ（高速）
 *   npx tsx scripts/import-law-data.ts --neo4j-titles   # Neo4jタイトル補完のみ
 *   npx tsx scripts/import-law-data.ts --fix-titles     # Neo4j欠損タイトル修復（e-Gov API + 参照テキスト解析）
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import axios from 'axios';

const prisma = new PrismaClient({
  log: ['error'],
});

const LAWS_DIR = path.join(process.cwd(), 'laws_data');
const BATCH_SIZE = 50;   // LawMaster/Version batch size
const ARTICLE_BATCH = 200; // Article createMany batch size

// ═══════════════════════════════════════════════════
// XML Metadata Extraction
// ═══════════════════════════════════════════════════

interface LawMetadata {
  lawId: string;
  title: string;
  lawNumber: string;
  lawType: string;
  xmlPath: string;
  versionDate: string;
  amendmentLawId: string;
}

/** LawType mapping from XML attribute to Japanese */
const LAW_TYPE_MAP: Record<string, string> = {
  'Act': '法律',
  'CabinetOrder': '政令',
  'ImperialOrder': '勅令',
  'MinisterialOrdinance': '省令',
  'Rule': '規則',
  'Regulation': '規則',
  'Constitution': '憲法',
};

/** Scan laws_data/ and group directories by lawId, pick latest version */
function scanLawDirectories(filterLawId?: string): LawMetadata[] {
  const dirs = fs.readdirSync(LAWS_DIR).filter(d => {
    if (!fs.statSync(path.join(LAWS_DIR, d)).isDirectory()) return false;
    if (filterLawId && !d.startsWith(filterLawId + '_')) return false;
    return true;
  });

  // Group by lawId (first segment before _)
  const byLawId = new Map<string, string[]>();
  for (const dir of dirs) {
    const parts = dir.split('_');
    if (parts.length < 3) continue;
    const lawId = parts[0];
    if (!byLawId.has(lawId)) byLawId.set(lawId, []);
    byLawId.get(lawId)!.push(dir);
  }

  const results: LawMetadata[] = [];
  for (const [lawId, lawDirs] of byLawId) {
    // Sort to get the latest version (by directory name which includes date)
    lawDirs.sort();
    const latestDir = lawDirs[lawDirs.length - 1];
    const xmlPath = path.join(LAWS_DIR, latestDir, `${latestDir}.xml`);
    if (!fs.existsSync(xmlPath)) continue;

    // Parse version date and amendment law ID from directory name
    const parts = latestDir.split('_');
    const versionDate = parts[1] || '19000101';
    const amendmentLawId = parts[2] || '';

    // Quick metadata extraction from first 2KB of XML
    const fd = fs.openSync(xmlPath, 'r');
    const buf = Buffer.alloc(4096);
    fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const header = buf.toString('utf-8');

    // Extract title
    const titleMatch = header.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract law number
    const lawNumMatch = header.match(/<LawNum>([^<]+)<\/LawNum>/);
    const lawNumber = lawNumMatch ? lawNumMatch[1].trim() : '';

    // Extract law type
    const lawTypeMatch = header.match(/LawType="([^"]+)"/);
    const rawType = lawTypeMatch ? lawTypeMatch[1] : '';
    const lawType = LAW_TYPE_MAP[rawType] || rawType;

    results.push({
      lawId,
      title: title || lawId,
      lawNumber,
      lawType,
      xmlPath,
      versionDate,
      amendmentLawId,
    });
  }

  console.log(`Scanned ${results.length} laws from ${dirs.length} directories`);
  return results;
}

// ═══════════════════════════════════════════════════
// Article Extraction (reuse existing logic, optimized)
// ═══════════════════════════════════════════════════

interface ArticleData {
  articleNumber: string;
  articleTitle?: string;
  content: string;
  paragraphs: {
    paragraphNumber: number;
    content: string;
    items: { itemNumber: string; content: string; }[];
  }[];
  division?: string;
  sortOrder: number;
  isDeleted?: boolean;
}

/** Extract all Sentence text within a node */
function extractSentenceText(xml: string): string {
  const matches = xml.matchAll(/<Sentence[^>]*>([^<]*)<\/Sentence>/g);
  let text = '';
  for (const m of matches) {
    text += m[1];
  }
  return text.trim();
}

/** Extract articles from XML (MainProvision + SupplProvision) */
function extractArticlesFromXML(xmlContent: string): ArticleData[] {
  const articles: ArticleData[] = [];
  let sortOrder = 0;

  // Process both MainProvision and SupplProvision
  const sections: { pattern: RegExp; division: string; prefix: string }[] = [
    { pattern: /<MainProvision>([\s\S]*?)<\/MainProvision>/g, division: '本則', prefix: '' },
    { pattern: /<SupplProvision[^>]*>([\s\S]*?)<\/SupplProvision>/g, division: '附則', prefix: '附則' },
  ];

  for (const { pattern, division, prefix } of sections) {
    const sectionMatches = xmlContent.matchAll(pattern);
    let supplCount = 0;
    for (const sectionMatch of sectionMatches) {
      const sectionContent = sectionMatch[1];
      // For SupplProvision, track which amendment it belongs to
      let supplPrefix = prefix;
      if (division === '附則') {
        supplCount++;
        if (supplCount > 1) {
          // Extract amendment info from SupplProvision tag
          const amendMatch = sectionMatch[0].match(/AmendLawNum="([^"]+)"/);
          supplPrefix = `附則${supplCount}_`;
        }
      }
      const articleMatches = sectionContent.matchAll(/<Article\s+[^>]*>([\s\S]*?)<\/Article>/g);

      for (const match of articleMatches) {
        const articleXml = match[0];
        const articleContent = match[1];

        const numMatch = articleXml.match(/Num="([^"]+)"/);
        if (!numMatch) continue;

        const rawNum = numMatch[1].replace(/[第条]/g, '');
        const articleNumber = supplPrefix ? `${supplPrefix}${rawNum}` : rawNum;

        const captionMatch = articleContent.match(/<ArticleCaption[^>]*>([^<]+)<\/ArticleCaption>/);
        const articleTitle = captionMatch ? captionMatch[1] : undefined;

        const isDeleted = articleXml.includes('Delete="true"') || articleContent.includes('削除');

        // Extract paragraphs
        const paragraphs: ArticleData['paragraphs'] = [];
        const paragraphMatches = articleContent.matchAll(/<Paragraph\s+[^>]*>([\s\S]*?)<\/Paragraph>/g);

        let paragraphNumber = 0;
        for (const pMatch of paragraphMatches) {
          paragraphNumber++;
          const paragraphContent = pMatch[1];
          const content = extractSentenceText(paragraphContent);

          // Extract items
          const items: { itemNumber: string; content: string }[] = [];
          const itemMatches = paragraphContent.matchAll(/<Item\s+[^>]*>([\s\S]*?)<\/Item>/g);
          for (const iMatch of itemMatches) {
            const itemNumMatch = iMatch[0].match(/Num="([^"]+)"/);
            if (itemNumMatch) {
              items.push({
                itemNumber: itemNumMatch[1],
                content: extractSentenceText(iMatch[1]),
              });
            }
          }

          paragraphs.push({ paragraphNumber, content, items });
        }

        // Build full content text
        let fullContent = '';
        if (articleTitle) fullContent = `（${articleTitle}）\n`;
        for (const para of paragraphs) {
          if (para.content) fullContent += para.content + '\n';
          for (const item of para.items) {
            fullContent += `${item.itemNumber} ${item.content}\n`;
          }
        }

        articles.push({
          articleNumber,
          articleTitle,
          content: fullContent.trim() || (isDeleted ? '削除' : ''),
          paragraphs,
          division,
          sortOrder: sortOrder++,
          isDeleted,
        });
      }
    }
  }

  return articles;
}

// ═══════════════════════════════════════════════════
// Database Import (Batch Operations)
// ═══════════════════════════════════════════════════

/** Convert YYYYMMDD string to Date */
function parseVersionDate(dateStr: string): Date {
  const y = dateStr.substring(0, 4);
  const m = dateStr.substring(4, 6);
  const d = dateStr.substring(6, 8);
  return new Date(`${y}-${m}-${d}`);
}

/** Phase 1: Import LawMaster + LawVersion records (metadata only, no XML) */
async function importMetadata(laws: LawMetadata[]): Promise<void> {
  console.log(`\nPhase 1: Importing ${laws.length} LawMaster + LawVersion records...`);

  // Get existing law IDs to skip
  const existingLaws = await prisma.lawMaster.findMany({ select: { id: true } });
  const existingIds = new Set(existingLaws.map(l => l.id));
  const newLaws = laws.filter(l => !existingIds.has(l.lawId));
  console.log(`  Existing: ${existingIds.size}, New: ${newLaws.length}`);

  let processed = 0;
  for (let i = 0; i < newLaws.length; i += BATCH_SIZE) {
    const batch = newLaws.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(async (tx) => {
      for (const law of batch) {
        const versionId = `${law.lawId}_v_${law.versionDate}`;
        const versionDate = parseVersionDate(law.versionDate);

        // Create LawMaster (without currentVersionId first)
        await tx.lawMaster.create({
          data: {
            id: law.lawId,
            title: law.title || law.lawId,
            lawType: law.lawType || null,
            lawNumber: law.lawNumber || null,
            currentVersionId: null,
          },
        });

        // Create LawVersion (xmlContent as empty placeholder for now)
        await tx.lawVersion.create({
          data: {
            id: versionId,
            lawId: law.lawId,
            versionDate,
            amendmentLawId: law.amendmentLawId || null,
            xmlContent: '', // Will be populated in Phase 2
            status: '現行',
            isLatest: true,
          },
        });

        // Update currentVersionId
        await tx.lawMaster.update({
          where: { id: law.lawId },
          data: { currentVersionId: versionId },
        });
      }
    }, { timeout: 60000 });

    processed += batch.length;
    if (processed % 500 === 0 || processed === newLaws.length) {
      console.log(`  Progress: ${processed}/${newLaws.length} (${(processed / newLaws.length * 100).toFixed(1)}%)`);
    }
  }

  console.log(`Phase 1 complete: ${processed} laws imported`);
}

/** Phase 2: Import XML content + Articles for each law */
async function importArticles(laws: LawMetadata[], skipExisting: boolean = true): Promise<void> {
  console.log(`\nPhase 2: Importing articles for ${laws.length} laws...`);

  // Get versions that already have articles
  let skipVersionIds = new Set<string>();
  if (skipExisting) {
    const versionsWithArticles = await prisma.$queryRaw<{versionId: string}[]>`
      SELECT DISTINCT "versionId" FROM "Article" LIMIT 100000
    `;
    skipVersionIds = new Set(versionsWithArticles.map(v => v.versionId));
    console.log(`  Skipping ${skipVersionIds.size} versions that already have articles`);
  }

  let processed = 0;
  let totalArticles = 0;
  let totalParagraphs = 0;
  let totalItems = 0;
  let errors = 0;

  for (const law of laws) {
    const versionId = `${law.lawId}_v_${law.versionDate}`;

    if (skipVersionIds.has(versionId)) {
      processed++;
      continue;
    }

    try {
      // Check if version exists
      const version = await prisma.lawVersion.findUnique({
        where: { id: versionId },
        select: { id: true },
      });
      if (!version) {
        processed++;
        continue;
      }

      // Read XML content
      const xmlContent = fs.readFileSync(law.xmlPath, 'utf-8');

      // Update XML content in version
      await prisma.lawVersion.update({
        where: { id: versionId },
        data: { xmlContent },
      });

      // Extract articles
      const articles = extractArticlesFromXML(xmlContent);
      if (articles.length === 0) {
        processed++;
        continue;
      }

      // Delete existing articles for this version
      await prisma.article.deleteMany({ where: { versionId } });

      // Batch create articles
      for (let ai = 0; ai < articles.length; ai += ARTICLE_BATCH) {
        const articleBatch = articles.slice(ai, ai + ARTICLE_BATCH);

        // Create articles with createMany
        const articleRecords = articleBatch.map(a => ({
          id: randomUUID(),
          versionId,
          articleNumber: a.articleNumber,
          articleTitle: a.articleTitle || null,
          content: a.content,
          division: a.division || null,
          sortOrder: a.sortOrder,
          isDeleted: a.isDeleted || false,
        }));

        await prisma.article.createMany({ data: articleRecords, skipDuplicates: true });

        // Create paragraphs for this batch
        const paragraphRecords: {
          id: string;
          articleId: string;
          paragraphNumber: number;
          content: string;
        }[] = [];

        const itemRecords: {
          id: string;
          paragraphId: string;
          itemNumber: string;
          content: string;
        }[] = [];

        for (let j = 0; j < articleBatch.length; j++) {
          const article = articleBatch[j];
          const articleId = articleRecords[j].id;

          for (const para of article.paragraphs) {
            const paragraphId = randomUUID();
            paragraphRecords.push({
              id: paragraphId,
              articleId,
              paragraphNumber: para.paragraphNumber,
              content: para.content,
            });

            for (const item of para.items) {
              itemRecords.push({
                id: randomUUID(),
                paragraphId,
                itemNumber: item.itemNumber,
                content: item.content,
              });
            }
          }
        }

        if (paragraphRecords.length > 0) {
          // Get actual article IDs that were inserted (some may be skipped)
          const insertedArticles = await prisma.article.findMany({
            where: { versionId },
            select: { id: true },
          });
          const validArticleIds = new Set(insertedArticles.map(a => a.id));

          // Filter paragraph records to only reference existing articles
          const validParagraphs = paragraphRecords.filter(p => validArticleIds.has(p.articleId));

          for (let pi = 0; pi < validParagraphs.length; pi += 500) {
            await prisma.paragraph.createMany({
              data: validParagraphs.slice(pi, pi + 500),
              skipDuplicates: true,
            });
          }
          totalParagraphs += validParagraphs.length;

          // Filter item records to reference valid paragraphs
          const validParagraphIds = new Set(validParagraphs.map(p => p.id));
          const validItems = itemRecords.filter(i => validParagraphIds.has(i.paragraphId));

          for (let ii = 0; ii < validItems.length; ii += 500) {
            await prisma.item.createMany({
              data: validItems.slice(ii, ii + 500),
              skipDuplicates: true,
            });
          }
          totalItems += validItems.length;
        }
      }

      totalArticles += articles.length;
    } catch (err) {
      errors++;
      if (errors <= 10) {
        console.error(`  Error processing ${law.lawId}: ${String(err).substring(0, 100)}`);
      }
    }

    processed++;
    if (processed % 200 === 0 || processed === laws.length) {
      console.log(`  Progress: ${processed}/${laws.length} (${(processed / laws.length * 100).toFixed(1)}%) | Articles: ${totalArticles} | Paragraphs: ${totalParagraphs} | Items: ${totalItems} | Errors: ${errors}`);
    }
  }

  console.log(`Phase 2 complete: ${totalArticles} articles, ${totalParagraphs} paragraphs, ${totalItems} items (${errors} errors)`);
}

// ═══════════════════════════════════════════════════
// Neo4j Title Completion
// ═══════════════════════════════════════════════════

async function completeNeo4jTitles(laws: LawMetadata[]): Promise<void> {
  console.log(`\nPhase 3: Completing Neo4j law titles...`);

  let neo4j;
  try {
    neo4j = await import('neo4j-driver');
  } catch {
    console.log('  neo4j-driver not available, skipping');
    return;
  }

  const driver = neo4j.default.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.default.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'lawfinder123'
    )
  );

  const session = driver.session();

  try {
    // Build title map from scanned XML laws
    const titleMap = new Map<string, { title: string; lawNumber: string }>();
    for (const law of laws) {
      if (law.title && law.title !== law.lawId) {
        titleMap.set(law.lawId, { title: law.title, lawNumber: law.lawNumber });
      }
    }

    // Also try to extract titles from HTML cache
    const htmlCacheDir = path.join(process.cwd(), 'egov_html_cache');
    if (fs.existsSync(htmlCacheDir)) {
      const htmlFiles = fs.readdirSync(htmlCacheDir).filter(f => f.endsWith('.html'));
      console.log(`  Scanning ${htmlFiles.length} HTML cache files for titles...`);

      for (const file of htmlFiles) {
        const lawId = file.replace('.html', '');
        if (titleMap.has(lawId)) continue; // XML title takes priority

        try {
          const fd = fs.openSync(path.join(htmlCacheDir, file), 'r');
          const buf = Buffer.alloc(4096);
          fs.readSync(fd, buf, 0, 4096, 0);
          fs.closeSync(fd);
          const header = buf.toString('utf-8');

          const titleMatch = header.match(/<title>([^|<]+)/);
          if (titleMatch) {
            const title = titleMatch[1].trim();
            if (title && title !== 'e-Gov 法令検索' && title !== lawId) {
              titleMap.set(lawId, { title, lawNumber: '' });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    console.log(`  Total titles available: ${titleMap.size}`);

    // Update ALL Neo4j law nodes that have a title in our map (not just missing ones)
    // This ensures consistency between PostgreSQL and Neo4j
    const allNodes = await session.run(`
      MATCH (l:Law)
      RETURN l.lawId AS lawId, l.title AS title
    `);

    let updatableCount = 0;
    const allUpdates: { lawId: string; title: string; lawNumber: string }[] = [];
    for (const record of allNodes.records) {
      const lawId = record.get('lawId') as string;
      const currentTitle = record.get('title') as string | null;
      const info = titleMap.get(lawId);
      if (info && (!currentTitle || currentTitle === '' || currentTitle === 'e-Gov 法令検索')) {
        allUpdates.push({ lawId, title: info.title, lawNumber: info.lawNumber });
      }
    }

    console.log(`  ${allUpdates.length} law nodes can be updated with titles`);

    for (let i = 0; i < allUpdates.length; i += 500) {
      const batch = allUpdates.slice(i, i + 500);
      await session.run(`
        UNWIND $batch AS item
        MATCH (l:Law {lawId: item.lawId})
        SET l.title = item.title, l.lawNumber = item.lawNumber
      `, { batch });
    }

    console.log(`  Updated ${allUpdates.length} law node titles in Neo4j`);

    // Report remaining missing
    const stillMissing = await session.run(`
      MATCH (l:Law)
      WHERE l.title IS NULL OR l.title = '' OR l.title = 'e-Gov 法令検索'
      RETURN count(l) AS cnt
    `);
    const missingCount = stillMissing.records[0]?.get('cnt')?.toNumber() || 0;
    if (missingCount > 0) {
      console.log(`  ${missingCount} law nodes still missing titles (no data source)`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

// ═══════════════════════════════════════════════════
// Fix Missing Titles (--fix-titles mode)
// ═══════════════════════════════════════════════════

/** Law type code mapping for lawId format parsing */
const LAW_TYPE_CODE_MAP: Record<string, string> = {
  'AC': '法律',
  'CO': '政令',
  'IO': '勅令',
  'M1': '省令',
  'M3': '省令',
  'M5': '省令',
  'M6': '省令',
  'DF': '太政官布告',
  'DT': '太政官達',
  'RE': '規則',
  'RJ': '規則',
  'RU': '規則',
  'MI': '各省令',
};

/** Convert Japanese era year in lawId to Western year for display */
function parseLawIdEra(yearCode: string): string {
  const num = parseInt(yearCode, 10);
  if (isNaN(num)) return '';
  // lawId year codes: 1xx = 明治(+1867), 2xx = 大正(+1911), 3xx = 昭和(+1925), 4xx = 平成(+1988), 5xx = 令和(+2018)
  if (num >= 500) return `令和${num - 500}年`;
  if (num >= 400) return `平成${num - 400}年`;
  if (num >= 300) return `昭和${num - 300}年`;
  if (num >= 200) return `大正${num - 200}年`;
  if (num >= 100) return `明治${num - 100}年`;
  return '';
}

/** Ministry code mapping for M6 (ministerial ordinance) lawIds.
 *  The 7 hex-like digits after M6 encode the issuing ministry. */
const MINISTRY_CODE_MAP: Record<string, string> = {
  '0000002': '内閣府令',
  '0000004': '復興庁令',
  '0000008': '総務省令',
  '0000010': '法務省令',
  '000000A': '金融庁令',
  '0000028': '総務省令',
  '0000040': '財務省令',
  '0000042': '内閣府令',
  '0000048': '総務省令',
  '000004A': '内閣府令',
  '0000080': '文部科学省令',
  '0000082': '文部科学省令',
  '000008A': '文部科学省令',
  '0000100': '厚生労働省令',
  '0000180': '厚生労働省令',
  '0000182': '厚生労働省令',
  '0000200': '農林水産省令',
  '0000202': '内閣府令',
  '0000240': '財務省令',
  '0000400': '経済産業省令',
  '0000402': '内閣府令',
  '0000408': '総務省令',
  '0000440': '財務省令',
  '0000480': '内閣府令',
  '0000640': '財務省令',
  '0000800': '国土交通省令',
  '0000801': '国土交通省令',
  '0000802': '国土交通省令',
  '0000900': '国土交通省令',
  '0000A00': '国土交通省令',
  '0000C00': '国土交通省令',
  '0001000': '環境省令',
  '0001180': '厚生労働省令',
  '0001200': '農林水産省令',
  '0001400': '経済産業省令',
  '0001800': '環境省令',
  '0001F40': '環境省令',
  '0001FCA': '環境省令',
  '0002000': '防衛省令',
  '0004000': 'デジタル庁令',
  '0004008': '総務省令',
  '0200000': '公正取引委員会規則',
  '0400000': '国家公安委員会規則',
  '2000000': 'カジノ管理委員会規則',
};

/** Generate a descriptive identifier from the lawId format */
function generateTitleFromLawId(lawId: string): string | null {
  // Standard format: {3-digit year}{2-char type}{7 digits ministry}{3 digits number}
  // e.g. 429AC0000000003, 501M60000008002
  // Type code can be 2 alpha (AC, CO) or alpha+digit (M6)
  const match = lawId.match(/^(\d{3})([A-Z][A-Z0-9])(.{7})(\w{3})$/);
  if (!match) return null;

  const [, yearCode, typeCode, middleCode, numStr] = match;
  const era = parseLawIdEra(yearCode);
  if (!era) return null;

  // For M6 (ministerial ordinance), use ministry code map
  if (typeCode === 'M6') {
    const ministry = MINISTRY_CODE_MAP[middleCode] || '省令';
    // Number part may contain hex characters (A-F)
    const num = /^[0-9]+$/.test(numStr) ? parseInt(numStr, 10) : parseInt(numStr, 16);
    return `${era}${ministry}第${num}号`;
  }

  // For RJ (人事院規則), use a special format
  if (typeCode === 'RJ') {
    return `${era}人事院規則`;
  }

  // Standard types: lawId ends with 10 numeric digits (7 middle + 3 number)
  const lawType = LAW_TYPE_CODE_MAP[typeCode];
  if (!lawType) return null;

  const num = parseInt(numStr, 10);
  return `${era}${lawType}第${num}号`;
}

/** Extract law name from reference text.
 *  Examples:
 *   "借地借家法（平成三年法律第九十号）第十条" → "借地借家法"
 *   "地方交付税法等の一部を改正する法律（平成二十九年法律第三号）第三条" → "地方交付税法等の一部を改正する法律"
 *   "所得税法等の一部を改正する法律（平成二十八年法律第十五号。以下…" → "所得税法等の一部を改正する法律"
 */
/** Blacklist: relative references that are NOT valid law names */
const RELATIVE_REF_BLACKLIST = /^(同法|同令|同条|同項|同号|同規則|同政令|同省令|同規程|前条|前項|前号|次条|次項|次号|改正法|改正令|改正規則|本法|本令|本条|本項|この法律|この政令|この省令|この規則|当該|旧法|新法|現行法|前条の規定|同法附則|改正法附則)$/;

/** Blacklist prefix: text starting with these is a relative reference, not a law name */
const RELATIVE_REF_PREFIX = /^(同法|同令|同条|同項|同号|前条|次条|改正法|本法|この法律|この政令|この省令|旧法|新法)/;

function extractLawNameFromRefText(text: string): string | null {
  if (!text || text.length === 0) return null;

  // Early reject: text starting with relative reference prefixes
  if (RELATIVE_REF_PREFIX.test(text)) return null;

  // Pattern 1: "法令名（年号法律第N号）" - extract the name before parentheses
  const p1 = text.match(/^(.+?)[（(](?:明治|大正|昭和|平成|令和)/);
  if (p1 && p1[1].length >= 2 && p1[1].length <= 60) {
    const name = p1[1].trim();
    if (RELATIVE_REF_BLACKLIST.test(name)) return null;
    return name;
  }

  // Pattern 2: "法令名第N条" or "法令名附則" - extract the name before article ref
  const p2 = text.match(/^(.+?)(?:第[一二三四五六七八九十百千]+条|附則)/);
  if (p2 && p2[1].length >= 2 && p2[1].length <= 60) {
    const name = p2[1].replace(/[（(].+$/, '').trim();
    if (name.length >= 2 && !RELATIVE_REF_BLACKLIST.test(name)) return name;
  }

  // Pattern 3: Short reference like "平成二十八年所得税法等改正法" (abbreviated name)
  // These are often short names used inline, less reliable
  if (text.length <= 40 && !text.includes('第') && !text.match(/^\d/)) {
    // It might be just the law name/number itself
    const cleaned = text.replace(/[（(].+?[）)]/g, '').trim();
    if (cleaned.length >= 4 && cleaned.length <= 40 && !RELATIVE_REF_BLACKLIST.test(cleaned)) {
      return cleaned;
    }
  }

  return null;
}

/** Step 1: Fetch all law titles from e-Gov law listing API (categories 1-4) */
async function fetchEgovLawList(): Promise<Map<string, { name: string; lawNo: string }>> {
  const titleMap = new Map<string, { name: string; lawNo: string }>();
  const categories = [1, 2, 3, 4]; // 1=法律, 2=政令, 3=府省令, 4=その他

  for (const cat of categories) {
    console.log(`  Fetching e-Gov category ${cat}...`);
    try {
      const response = await axios.get(`https://laws.e-gov.go.jp/api/1/lawlists/${cat}`, {
        timeout: 60000,
        responseType: 'text',
      });

      const xml = response.data as string;

      // Extract LawNameListInfo entries
      const entries = xml.matchAll(
        /<LawNameListInfo>\s*<LawId>([^<]+)<\/LawId>\s*<LawName>([^<]+)<\/LawName>\s*<LawNo>([^<]*)<\/LawNo>/g
      );

      let count = 0;
      for (const entry of entries) {
        const [, lawId, lawName, lawNo] = entry;
        titleMap.set(lawId, { name: lawName, lawNo });
        count++;
      }
      console.log(`    Category ${cat}: ${count} laws`);
    } catch (err) {
      console.error(`    Failed to fetch category ${cat}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`  Total e-Gov law titles fetched: ${titleMap.size}`);
  return titleMap;
}

/** Main fix-titles function: Steps 1-4 */
async function fixMissingTitles(): Promise<void> {
  console.log('========================================');
  console.log('  Neo4j Missing Title Fix');
  console.log('========================================');

  let neo4j;
  try {
    neo4j = await import('neo4j-driver');
  } catch {
    console.error('neo4j-driver not available. Install with: npm install neo4j-driver');
    return;
  }

  const driver = neo4j.default.driver(
    process.env.NEO4J_URI || 'bolt://localhost:7687',
    neo4j.default.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'lawfinder123'
    )
  );

  const session = driver.session();

  try {
    // ─── Step 0: Count missing ───
    const countResult = await session.run(`
      MATCH (l:Law)
      WHERE l.title IS NULL OR l.title = '' OR l.title = 'e-Gov 法令検索'
      RETURN count(l) AS cnt
    `);
    const totalMissing = countResult.records[0]?.get('cnt')?.toNumber?.() ?? countResult.records[0]?.get('cnt') ?? 0;
    console.log(`\n  Missing titles: ${totalMissing}`);

    if (totalMissing === 0) {
      console.log('  No missing titles. Nothing to do.');
      return;
    }

    // ─── Step 1: Get all missing lawIds ───
    console.log('\n--- Step 1: Fetching missing lawIds from Neo4j ---');
    const missingResult = await session.run(`
      MATCH (l:Law)
      WHERE l.title IS NULL OR l.title = '' OR l.title = 'e-Gov 法令検索'
      RETURN l.lawId AS lawId
    `);

    const missingLawIds = missingResult.records.map(r => r.get('lawId') as string);
    console.log(`  Found ${missingLawIds.length} laws with missing titles`);

    // Track resolution results
    const resolved = new Map<string, { title: string; source: string }>();
    const missingSet = new Set(missingLawIds);

    // ─── Step 2: Batch-fetch titles from e-Gov API ───
    console.log('\n--- Step 2: Fetching titles from e-Gov law listing API ---');
    const egovTitles = await fetchEgovLawList();

    let egovMatches = 0;
    for (const lawId of missingLawIds) {
      const info = egovTitles.get(lawId);
      if (info) {
        resolved.set(lawId, { title: info.name, source: 'egov_api' });
        egovMatches++;
      }
    }
    console.log(`  Matched from e-Gov API: ${egovMatches}/${missingLawIds.length}`);

    // ─── Step 2b: Try individual e-Gov API v1 for remaining ───
    const afterEgov = missingLawIds.filter(id => !resolved.has(id));
    if (afterEgov.length > 0) {
      // Filter out obviously invalid lawIds (like 'test_law')
      const validLawIds = afterEgov.filter(id => /^\d{3}[A-Z]/.test(id));
      console.log(`\n--- Step 2b: Trying individual e-Gov API v1 lookups for ${validLawIds.length} laws ---`);
      let individualMatches = 0;
      let apiNotFound = 0;
      let errors = 0;
      const batchSize = 15;

      for (let i = 0; i < validLawIds.length; i += batchSize) {
        const batch = validLawIds.slice(i, i + batchSize);
        const promises = batch.map(async (lawId) => {
          try {
            const resp = await axios.get(`https://laws.e-gov.go.jp/api/1/lawdata/${lawId}`, {
              timeout: 15000,
              responseType: 'text',
            });
            const xml = resp.data as string;

            // Check if API returned actual data (Code 0 = success, Code 1 = not found)
            const codeMatch = xml.match(/<Code>(\d+)<\/Code>/);
            if (codeMatch && codeMatch[1] !== '0') {
              apiNotFound++;
              return;
            }

            const titleMatch = xml.match(/<LawTitle[^>]*>([^<]+)<\/LawTitle>/);
            if (titleMatch && titleMatch[1].trim()) {
              resolved.set(lawId, { title: titleMatch[1].trim(), source: 'egov_api_individual' });
              individualMatches++;
            } else {
              // Try LawName from LawNum
              const lawNumMatch = xml.match(/<LawNum>([^<]+)<\/LawNum>/);
              if (lawNumMatch && lawNumMatch[1].trim()) {
                resolved.set(lawId, { title: lawNumMatch[1].trim(), source: 'egov_api_lawnum' });
                individualMatches++;
              }
            }
          } catch {
            errors++;
          }
        });

        await Promise.all(promises);

        if ((i + batchSize) % 150 === 0 || i + batchSize >= validLawIds.length) {
          console.log(`    Progress: ${Math.min(i + batchSize, validLawIds.length)}/${validLawIds.length} | Found: ${individualMatches} | NotInAPI: ${apiNotFound} | Errors: ${errors}`);
        }

        // Rate limiting: 150ms between batches (15 concurrent requests)
        if (i + batchSize < validLawIds.length) {
          await new Promise(r => setTimeout(r, 150));
        }
      }
      console.log(`  Individual API matches: ${individualMatches} | Not in API: ${apiNotFound}`);
    }

    // ─── Step 3: Extract law names from reference texts ───
    const afterApi = missingLawIds.filter(id => !resolved.has(id));
    if (afterApi.length > 0) {
      console.log(`\n--- Step 3: Extracting law names from reference texts (${afterApi.length} remaining) ---`);

      // Batch query: get reference texts for all remaining missing laws
      const refTextsResult = await session.run(`
        MATCH (s)-[r:REFERENCES]->(t:Law)
        WHERE t.lawId IN $lawIds AND r.text IS NOT NULL AND r.text <> ''
        RETURN t.lawId AS lawId, collect(DISTINCT r.text)[..10] AS texts
      `, { lawIds: afterApi });

      let refTextMatches = 0;
      for (const record of refTextsResult.records) {
        const lawId = record.get('lawId') as string;
        const texts = record.get('texts') as string[];

        // Try each reference text, pick the best name
        let bestName: string | null = null;
        let bestLen = 0;

        for (const text of texts) {
          const name = extractLawNameFromRefText(text);
          if (name && name.length > bestLen) {
            // Prefer names that end with a law-type suffix
            const hasLawSuffix = /(?:法|令|規則|条例|規程|憲章|協定|条約)$/.test(name);
            if (hasLawSuffix || name.length > bestLen) {
              bestName = name;
              bestLen = name.length;
            }
          }
        }

        if (bestName) {
          resolved.set(lawId, { title: bestName, source: 'reference_text' });
          refTextMatches++;
        }
      }
      console.log(`  Extracted from reference texts: ${refTextMatches}`);
    }

    // ─── Step 4: Generate descriptive titles from lawId format ───
    const afterRefText = missingLawIds.filter(id => !resolved.has(id));
    if (afterRefText.length > 0) {
      console.log(`\n--- Step 4: Generating titles from lawId format (${afterRefText.length} remaining) ---`);
      let generated = 0;
      for (const lawId of afterRefText) {
        const title = generateTitleFromLawId(lawId);
        if (title) {
          resolved.set(lawId, { title, source: 'lawid_format' });
          generated++;
        }
      }
      console.log(`  Generated from lawId format: ${generated}`);

      // Anything truly unresolvable
      const stillMissing = missingLawIds.filter(id => !resolved.has(id));
      if (stillMissing.length > 0) {
        console.log(`  Unresolvable (non-standard lawId): ${stillMissing.length}`);
        for (const id of stillMissing.slice(0, 10)) {
          console.log(`    - ${id}`);
        }
      }
    }

    // ─── Step 5: Apply updates to Neo4j in batches ───
    console.log(`\n--- Step 5: Applying ${resolved.size} title updates to Neo4j ---`);

    const updates = Array.from(resolved.entries()).map(([lawId, info]) => ({
      lawId,
      title: info.title,
      source: info.source,
    }));

    const UPDATE_BATCH = 500;
    let applied = 0;
    for (let i = 0; i < updates.length; i += UPDATE_BATCH) {
      const batch = updates.slice(i, i + UPDATE_BATCH);
      await session.run(`
        UNWIND $batch AS item
        MATCH (l:Law {lawId: item.lawId})
        WHERE item.title IS NOT NULL AND item.title <> ''
          AND NOT item.title STARTS WITH '同'
          AND NOT item.title =~ '^第[一二三四五六七八九十百千0-9０-９]+[条項号](?!基礎).*'
          AND NOT item.title =~ '^附則.*'
          AND NOT item.title =~ '^改正法.*'
          AND NOT item.title =~ '^前[条項号].*'
          AND NOT item.title =~ '^次[条項号].*'
        SET l.title = item.title, l.titleSource = item.source
      `, { batch });
      applied += batch.length;
      console.log(`    Updated ${applied}/${updates.length}`);
    }

    // ─── Summary ───
    const bySource = new Map<string, number>();
    for (const [, info] of resolved) {
      bySource.set(info.source, (bySource.get(info.source) || 0) + 1);
    }

    console.log('\n========================================');
    console.log('  Fix Titles Summary');
    console.log('========================================');
    console.log(`  Total missing:     ${totalMissing}`);
    console.log(`  Total resolved:    ${resolved.size}`);
    for (const [source, count] of bySource) {
      console.log(`    ${source}: ${count}`);
    }
    console.log(`  Still missing:     ${totalMissing - resolved.size}`);

    // Verify final count
    const finalCount = await session.run(`
      MATCH (l:Law)
      WHERE l.title IS NULL OR l.title = '' OR l.title = 'e-Gov 法令検索'
      RETURN count(l) AS cnt
    `);
    const remaining = finalCount.records[0]?.get('cnt')?.toNumber?.() ?? finalCount.records[0]?.get('cnt') ?? 0;
    console.log(`  Verified remaining: ${remaining}`);
    console.log('========================================');

  } finally {
    await session.close();
    await driver.close();
  }
}

// ═══════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const metadataOnly = args.includes('--metadata-only');
  const neo4jTitlesOnly = args.includes('--neo4j-titles');
  const fixTitlesMode = args.includes('--fix-titles');
  const filterLawId = args.find(a => !a.startsWith('--'));

  // --fix-titles mode: standalone operation, no Prisma needed
  if (fixTitlesMode) {
    const startTime = Date.now();
    await fixMissingTitles();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n  Total time: ${elapsed}s`);
    return;
  }

  console.log('========================================');
  console.log('  法令データ一括投入パイプライン');
  console.log('========================================');
  console.log(`  laws_data: ${LAWS_DIR}`);
  console.log(`  Filter: ${filterLawId || 'ALL'}`);
  console.log(`  Mode: ${metadataOnly ? 'metadata-only' : neo4jTitlesOnly ? 'neo4j-titles-only' : 'full'}`);

  const startTime = Date.now();

  // Scan directories
  const laws = scanLawDirectories(filterLawId);

  if (neo4jTitlesOnly) {
    await completeNeo4jTitles(laws);
  } else {
    // Phase 1: Metadata
    await importMetadata(laws);

    // Phase 2: Articles (unless metadata-only)
    if (!metadataOnly) {
      await importArticles(laws);
    }

    // Phase 3: Neo4j titles
    await completeNeo4jTitles(laws);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Final stats
  const lawCount = await prisma.lawMaster.count();
  const versionCount = await prisma.lawVersion.count();
  const articleCount = await prisma.article.count();
  const paragraphCount = await prisma.paragraph.count();
  const itemCount = await prisma.item.count();

  console.log('\n========================================');
  console.log('  Final Database Statistics');
  console.log('========================================');
  console.log(`  LawMaster:  ${lawCount.toLocaleString()}`);
  console.log(`  LawVersion: ${versionCount.toLocaleString()}`);
  console.log(`  Article:    ${articleCount.toLocaleString()}`);
  console.log(`  Paragraph:  ${paragraphCount.toLocaleString()}`);
  console.log(`  Item:       ${itemCount.toLocaleString()}`);
  console.log(`  Time:       ${elapsed}s`);
  console.log('========================================');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
