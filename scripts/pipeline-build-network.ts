#!/usr/bin/env npx tsx

/**
 * 法令ネットワーク構築パイプライン
 *
 * Phase 1: HTMLから参照を高速抽出（正規表現ベース）
 * Phase 2: Neo4jに法令間参照グラフを構築
 *
 * 既存のegov_html_cacheから全法令の参照関係を抽出し、
 * Neo4jに完全な法令ネットワークを構築する。
 */

import fs from 'fs';
import path from 'path';
import neo4j from 'neo4j-driver';

// ============================================
// Types
// ============================================

interface Reference {
  sourceLawId: string;
  sourceArticle: string;
  targetLawId: string;
  targetArticle: string;
  text: string;
  type: 'internal' | 'external';
}

interface LawParseResult {
  lawId: string;
  title: string;
  internalRefs: number;
  externalRefs: Reference[];
}

// ============================================
// Phase 1: Fast HTML Parser (Regex-based)
// ============================================

function parseHTMLFile(htmlPath: string, lawId: string): LawParseResult {
  const html = fs.readFileSync(htmlPath, 'utf-8');

  // Extract title (reject generic e-Gov page titles and relative references)
  const titleMatch = html.match(/<title>([^|<]+)/);
  let title = titleMatch ? titleMatch[1].trim() : '';
  if (title === 'e-Gov 法令検索' || title === 'e-Gov法令検索' || title === 'e-Gov') {
    title = '';
  }
  // Reject titles that are actually relative references (同法, 第X条, 附則, etc.)
  if (/^(同法|同令|同条|同項|同号|前条|次条|改正法|本法)/.test(title)) {
    title = '';
  }
  if (/^第[一二三四五六七八九十百千0-9０-９]+[条項号](?!基礎)/.test(title)) {
    title = '';
  }
  if (/^附則/.test(title)) {
    title = '';
  }

  // Extract all /law/ links
  const linkPattern = /<a[^>]+href=["']\/law\/([^"'#]+)(?:#([^"']*))?["'][^>]*>(.*?)<\/a>/gs;

  const externalRefs: Reference[] = [];
  const seenKeys = new Set<string>();
  let internalRefs = 0;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const targetLawId = match[1];
    const anchor = match[2] || '';
    let text = match[3].replace(/<[^>]+>/g, '').trim();

    if (!text) continue;

    if (targetLawId === lawId) {
      internalRefs++;
      continue;
    }

    // Extract article number from anchor
    let targetArticle = '';
    const atMatch = anchor.match(/At_(\d+)/);
    if (atMatch) {
      targetArticle = atMatch[1];
    }

    // Extract source article context (look backwards in HTML for article ID)
    const beforeLink = html.substring(Math.max(0, match.index - 2000), match.index);
    let sourceArticle = '';
    const articleIdMatches = [...beforeLink.matchAll(/id="[^"]*At_(\d+)[^"]*"/g)];
    if (articleIdMatches.length > 0) {
      sourceArticle = articleIdMatches[articleIdMatches.length - 1][1];
    }

    // Dedup
    const key = `${sourceArticle}-${targetLawId}-${targetArticle}-${text.substring(0, 50)}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    externalRefs.push({
      sourceLawId: lawId,
      sourceArticle,
      targetLawId,
      targetArticle,
      text: text.substring(0, 200),
      type: 'external',
    });
  }

  return { lawId, title, internalRefs, externalRefs };
}

// ============================================
// Phase 2: Neo4j Batch Import
// ============================================

async function importToNeo4j(
  driver: neo4j.Driver,
  results: LawParseResult[],
  progressCallback: (msg: string) => void
): Promise<{ lawNodes: number; refEdges: number }> {
  const session = driver.session();

  try {
    // Create indexes for performance
    progressCallback('Creating indexes...');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (l:Law) ON (l.lawId)');
    await session.run('CREATE INDEX IF NOT EXISTS FOR (a:Article) ON (a.lawId, a.articleNumber)');

    // Collect all unique law IDs and external references
    const allLawIds = new Set<string>();
    const allExternalRefs: Reference[] = [];

    for (const result of results) {
      allLawIds.add(result.lawId);
      for (const ref of result.externalRefs) {
        allLawIds.add(ref.targetLawId);
        allExternalRefs.push(ref);
      }
    }

    // Batch create law title map
    const lawTitleMap = new Map<string, string>();
    for (const result of results) {
      if (result.title) {
        lawTitleMap.set(result.lawId, result.title);
      }
    }

    // Batch upsert Law nodes (1000 at a time)
    const lawIdArray = Array.from(allLawIds);
    const BATCH_SIZE = 500;

    progressCallback(`Creating ${lawIdArray.length} law nodes...`);
    for (let i = 0; i < lawIdArray.length; i += BATCH_SIZE) {
      const batch = lawIdArray.slice(i, i + BATCH_SIZE).map(id => ({
        lawId: id,
        title: lawTitleMap.get(id) || ''
      }));

      await session.run(`
        UNWIND $batch AS item
        MERGE (l:Law {lawId: item.lawId})
        ON CREATE SET l.source = 'egov_pipeline', l.created = datetime()
        SET l.title = CASE WHEN item.title <> '' THEN item.title ELSE l.title END
      `, { batch });
    }

    // Batch create Article nodes for source articles
    const articleNodes = new Set<string>();
    for (const ref of allExternalRefs) {
      if (ref.sourceArticle) {
        articleNodes.add(`${ref.sourceLawId}:${ref.sourceArticle}`);
      }
      if (ref.targetArticle) {
        articleNodes.add(`${ref.targetLawId}:${ref.targetArticle}`);
      }
    }

    const articleArray = Array.from(articleNodes).map(key => {
      const [lawId, articleNumber] = key.split(':');
      return { lawId, articleNumber };
    });

    progressCallback(`Creating ${articleArray.length} article nodes...`);
    for (let i = 0; i < articleArray.length; i += BATCH_SIZE) {
      const batch = articleArray.slice(i, i + BATCH_SIZE);
      await session.run(`
        UNWIND $batch AS item
        MERGE (a:Article {lawId: item.lawId, articleNumber: item.articleNumber})
        ON CREATE SET a.source = 'egov_pipeline', a.created = datetime()
      `, { batch });
    }

    // Batch create REFERENCES edges
    progressCallback(`Creating ${allExternalRefs.length} reference edges...`);

    // Group refs by type: article->article, article->law, law->law
    const artToArt: Reference[] = [];
    const artToLaw: Reference[] = [];
    const lawToLaw: Reference[] = [];

    for (const ref of allExternalRefs) {
      if (ref.sourceArticle && ref.targetArticle) {
        artToArt.push(ref);
      } else if (ref.sourceArticle) {
        artToLaw.push(ref);
      } else {
        lawToLaw.push(ref);
      }
    }

    // Article -> Article references
    if (artToArt.length > 0) {
      progressCallback(`  Article->Article: ${artToArt.length} refs...`);
      for (let i = 0; i < artToArt.length; i += BATCH_SIZE) {
        const batch = artToArt.slice(i, i + BATCH_SIZE).map(r => ({
          sLaw: r.sourceLawId,
          sArt: r.sourceArticle,
          tLaw: r.targetLawId,
          tArt: r.targetArticle,
          text: r.text,
        }));

        await session.run(`
          UNWIND $batch AS item
          MATCH (s:Article {lawId: item.sLaw, articleNumber: item.sArt})
          MATCH (t:Article {lawId: item.tLaw, articleNumber: item.tArt})
          MERGE (s)-[r:REFERENCES]->(t)
          SET r.text = item.text,
              r.type = 'external',
              r.source = 'egov_pipeline',
              r.confidence = 1.0,
              r.created = datetime()
        `, { batch });
      }
    }

    // Article -> Law references
    if (artToLaw.length > 0) {
      progressCallback(`  Article->Law: ${artToLaw.length} refs...`);
      for (let i = 0; i < artToLaw.length; i += BATCH_SIZE) {
        const batch = artToLaw.slice(i, i + BATCH_SIZE).map(r => ({
          sLaw: r.sourceLawId,
          sArt: r.sourceArticle,
          tLaw: r.targetLawId,
          text: r.text,
        }));

        await session.run(`
          UNWIND $batch AS item
          MATCH (s:Article {lawId: item.sLaw, articleNumber: item.sArt})
          MATCH (t:Law {lawId: item.tLaw})
          MERGE (s)-[r:REFERENCES]->(t)
          SET r.text = item.text,
              r.type = 'external',
              r.source = 'egov_pipeline',
              r.confidence = 1.0,
              r.created = datetime()
        `, { batch });
      }
    }

    // Law -> Law references
    if (lawToLaw.length > 0) {
      progressCallback(`  Law->Law: ${lawToLaw.length} refs...`);
      for (let i = 0; i < lawToLaw.length; i += BATCH_SIZE) {
        const batch = lawToLaw.slice(i, i + BATCH_SIZE).map(r => ({
          sLaw: r.sourceLawId,
          tLaw: r.targetLawId,
          text: r.text,
        }));

        await session.run(`
          UNWIND $batch AS item
          MATCH (s:Law {lawId: item.sLaw})
          MATCH (t:Law {lawId: item.tLaw})
          MERGE (s)-[r:REFERENCES]->(t)
          SET r.text = item.text,
              r.type = 'external',
              r.source = 'egov_pipeline',
              r.confidence = 1.0,
              r.created = datetime()
        `, { batch });
      }
    }

    return {
      lawNodes: allLawIds.size,
      refEdges: allExternalRefs.length,
    };
  } finally {
    await session.close();
  }
}

// ============================================
// Main Pipeline
// ============================================

async function main() {
  const htmlDir = path.join(process.cwd(), 'egov_html_cache');
  const outputDir = path.join(process.cwd(), 'egov_parsed_references');

  console.log('='.repeat(60));
  console.log('  法令ネットワーク構築パイプライン');
  console.log('='.repeat(60));

  // List HTML files
  const htmlFiles = fs.readdirSync(htmlDir)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace('.html', ''));

  console.log(`\nHTML files: ${htmlFiles.length}`);

  // ---- Phase 1: Parse all HTML files ----
  console.log('\n--- Phase 1: HTML Parse (regex-based) ---');

  const startTime = Date.now();
  const results: LawParseResult[] = [];
  let totalExternalRefs = 0;
  let totalInternalRefs = 0;
  let errors = 0;

  for (let i = 0; i < htmlFiles.length; i++) {
    const lawId = htmlFiles[i];
    const htmlPath = path.join(htmlDir, `${lawId}.html`);

    try {
      const result = parseHTMLFile(htmlPath, lawId);
      results.push(result);
      totalExternalRefs += result.externalRefs.length;
      totalInternalRefs += result.internalRefs;

      // Save parsed result as JSON
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const jsonPath = path.join(outputDir, `${lawId}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify({
        lawId: result.lawId,
        lawTitle: result.title,
        references: result.externalRefs.map(r => ({
          sourceLawId: r.sourceLawId,
          sourceArticle: r.sourceArticle,
          targetLawId: r.targetLawId,
          targetArticle: r.targetArticle,
          referenceText: r.text,
          referenceType: r.type,
          confidence: 1.0,
        })),
        internalRefCount: result.internalRefs,
        parseDate: new Date().toISOString(),
      }));

    } catch (err: any) {
      errors++;
      if (errors <= 5) {
        console.error(`  Error parsing ${lawId}: ${err.message}`);
      }
    }

    // Progress every 500 files
    if ((i + 1) % 500 === 0 || i === htmlFiles.length - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = ((i + 1) / parseFloat(elapsed)).toFixed(0);
      console.log(`  [${i + 1}/${htmlFiles.length}] ${elapsed}s (${rate} files/s) | External refs: ${totalExternalRefs} | Errors: ${errors}`);
    }
  }

  const parseTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nParse complete: ${results.length} laws, ${totalExternalRefs} external refs, ${totalInternalRefs} internal refs`);
  console.log(`Time: ${parseTime}s | Errors: ${errors}`);

  // Stats
  const lawsWithExtRefs = results.filter(r => r.externalRefs.length > 0);
  console.log(`\nLaws with external references: ${lawsWithExtRefs.length}/${results.length}`);

  // Top referenced laws
  const targetCounts = new Map<string, number>();
  for (const result of results) {
    for (const ref of result.externalRefs) {
      targetCounts.set(ref.targetLawId, (targetCounts.get(ref.targetLawId) || 0) + 1);
    }
  }
  const topTargets = Array.from(targetCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log('\nTop 20 most referenced laws:');
  for (const [lawId, count] of topTargets) {
    const result = results.find(r => r.lawId === lawId);
    const title = result?.title || lawId;
    console.log(`  ${title}: ${count} references`);
  }

  // ---- Phase 2: Import to Neo4j ----
  console.log('\n--- Phase 2: Neo4j Import ---');

  const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const neo4jUser = process.env.NEO4J_USER || 'neo4j';
  const neo4jPassword = process.env.NEO4J_PASSWORD || 'lawfinder123';

  const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));

  try {
    // Verify connection
    const session = driver.session();
    await session.run('RETURN 1');
    await session.close();
    console.log('Neo4j connected.');

    const importStart = Date.now();
    const importResult = await importToNeo4j(driver, results, (msg) => {
      console.log(`  ${msg}`);
    });
    const importTime = ((Date.now() - importStart) / 1000).toFixed(1);

    console.log(`\nImport complete: ${importResult.lawNodes} law nodes, ${importResult.refEdges} reference edges`);
    console.log(`Time: ${importTime}s`);

    // Verify
    const verifySession = driver.session();
    const crossLawRefs = await verifySession.run(`
      MATCH (s)-[r:REFERENCES {source: 'egov_pipeline'}]->(t)
      WHERE s.lawId <> t.lawId
      RETURN count(r) AS count
    `);
    const crossCount = crossLawRefs.records[0].get('count').toNumber();
    console.log(`\nCross-law references created: ${crossCount}`);

    const totalRefs = await verifySession.run(`
      MATCH ()-[r:REFERENCES]->()
      RETURN r.source AS source, count(r) AS count
      ORDER BY count DESC
    `);
    console.log('\nAll reference sources:');
    for (const record of totalRefs.records) {
      console.log(`  ${record.get('source') || 'NULL'}: ${record.get('count').toNumber()}`);
    }

    await verifySession.close();

  } finally {
    await driver.close();
  }

  console.log('\n' + '='.repeat(60));
  console.log('  Pipeline complete!');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
