#!/usr/bin/env npx tsx

/**
 * 全法令データをNeo4jに投入するバッチ処理
 * 
 * 約8,000法令のXMLとe-Gov参照データを統合
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { Worker } from 'worker_threads';

interface ImportStats {
  totalLaws: number;
  processedLaws: number;
  failedLaws: number;
  totalArticles: number;
  totalReferences: number;
  startTime: number;
  errors: string[];
}

class Neo4jFullImporter {
  private driver: any;
  private parser: XMLParser;
  private stats: ImportStats;
  private batchSize = 100; // 一度に処理する法令数
  
  constructor() {
    this.driver = initNeo4jDriver();
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseTagValue: true,
      trimValues: true
    });
    this.stats = {
      totalLaws: 0,
      processedLaws: 0,
      failedLaws: 0,
      totalArticles: 0,
      totalReferences: 0,
      startTime: Date.now(),
      errors: []
    };
  }

  /**
   * 全法令をスキャンしてリストを作成
   */
  private async scanAllLaws(): Promise<Map<string, string>> {
    const lawsMap = new Map<string, string>();
    const lawsDataPath = path.join(process.cwd(), 'laws_data');
    
    console.log(chalk.blue('📂 法令ディレクトリをスキャン中...'));
    
    const dirs = fs.readdirSync(lawsDataPath);
    
    for (const dir of dirs) {
      if (dir === 'sample' || dir.startsWith('.')) continue;
      
      const dirPath = path.join(lawsDataPath, dir);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      
      // 法令IDを抽出
      const lawIdMatch = dir.match(/^([^_]+)/);
      if (!lawIdMatch) continue;
      
      const lawId = lawIdMatch[1];
      const xmlFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.xml'));
      
      if (xmlFiles.length > 0) {
        lawsMap.set(lawId, path.join(dirPath, xmlFiles[0]));
      }
    }
    
    console.log(chalk.green(`✓ ${lawsMap.size}件の法令を検出`));
    return lawsMap;
  }

  /**
   * XMLから法令データを抽出（簡略版）
   */
  private extractLawBasicInfo(xmlPath: string): any {
    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const parsed = this.parser.parse(xmlContent);
      const law = parsed.Law || {};
      const lawBody = law.LawBody || {};
      
      // 条文数を簡易カウント
      const articleCount = (JSON.stringify(parsed).match(/<Article/g) || []).length;
      
      return {
        lawNumber: law.LawNum || law['@_Num'] || '',
        lawTitle: lawBody.LawTitle?.['#text'] || lawBody.LawTitle || '',
        era: law['@_Era'],
        year: law['@_Year'] ? parseInt(law['@_Year']) : 0,
        num: law['@_Num'] ? parseInt(law['@_Num']) : 0,
        articleCount
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * 法令をバッチ処理
   */
  private async processBatch(lawIds: string[], lawsMap: Map<string, string>): Promise<void> {
    const session = this.driver.session();
    
    try {
      await session.executeWrite(async (tx: any) => {
        for (const lawId of lawIds) {
          const xmlPath = lawsMap.get(lawId);
          
          // XMLメタデータを取得
          const lawInfo = xmlPath ? this.extractLawBasicInfo(xmlPath) : null;
          
          // e-Gov参照データの存在確認
          const refPath = path.join(process.cwd(), 'egov_cache_v2', 'references', `${lawId}.json`);
          const hasReferences = fs.existsSync(refPath);
          let referenceCount = 0;
          
          if (hasReferences) {
            try {
              const refs = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
              referenceCount = refs.length;
            } catch {}
          }
          
          // 法令ノードを作成/更新
          await tx.run(`
            MERGE (l:Law {lawId: $lawId})
            SET l.lawNumber = $lawNumber,
                l.lawTitle = $lawTitle,
                l.xmlPath = $xmlPath,
                l.hasXml = $hasXml,
                l.era = $era,
                l.year = $year,
                l.num = $num,
                l.totalArticles = $totalArticles,
                l.totalReferences = $totalReferences,
                l.source = $source,
                l.updated = datetime()
          `, {
            lawId,
            lawNumber: lawInfo?.lawNumber || '',
            lawTitle: lawInfo?.lawTitle || '',
            xmlPath: xmlPath || '',
            hasXml: !!xmlPath,
            era: lawInfo?.era || '',
            year: lawInfo?.year || 0,
            num: lawInfo?.num || 0,
            totalArticles: lawInfo?.articleCount || 0,
            totalReferences: referenceCount,
            source: xmlPath && hasReferences ? 'both' : 
                    xmlPath ? 'xml' : 
                    hasReferences ? 'egov' : 'none'
          });
          
          this.stats.processedLaws++;
          this.stats.totalArticles += lawInfo?.articleCount || 0;
          this.stats.totalReferences += referenceCount;
        }
      });
    } catch (error) {
      console.error(chalk.red(`バッチ処理エラー`), error.message);
      this.stats.failedLaws += lawIds.length;
      this.stats.errors.push(error.message);
    } finally {
      await session.close();
    }
  }

  /**
   * メイン処理
   */
  async importAll(options: {
    skipExisting?: boolean;
    limit?: number;
    clean?: boolean;
  } = {}): Promise<void> {
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('🚀 Neo4j全法令インポート開始'));
    console.log(chalk.cyan('='.repeat(60)));
    
    // クリーンオプション
    if (options.clean) {
      console.log(chalk.yellow('🗑️ 既存データをクリーンアップ中...'));
      const session = this.driver.session();
      try {
        await session.run('MATCH (n:Law) DETACH DELETE n');
        await session.run('MATCH (n:Article) DETACH DELETE n');
      } finally {
        await session.close();
      }
    }
    
    // 法令をスキャン
    const lawsMap = await this.scanAllLaws();
    const allLawIds = Array.from(lawsMap.keys());
    
    // 制限を適用
    const targetLawIds = options.limit ? 
      allLawIds.slice(0, options.limit) : 
      allLawIds;
    
    this.stats.totalLaws = targetLawIds.length;
    
    console.log(chalk.blue(`\n📊 処理対象: ${targetLawIds.length}件の法令`));
    console.log(chalk.gray(`  バッチサイズ: ${this.batchSize}件`));
    console.log(chalk.gray(`  推定時間: ${Math.ceil(targetLawIds.length / 100)}分\n`));
    
    // プログレスバー
    const progressBar = ora('処理開始...').start();
    
    // バッチ処理
    for (let i = 0; i < targetLawIds.length; i += this.batchSize) {
      const batch = targetLawIds.slice(i, i + this.batchSize);
      
      progressBar.text = `処理中: ${i + 1}-${Math.min(i + this.batchSize, targetLawIds.length)}/${targetLawIds.length}`;
      
      await this.processBatch(batch, lawsMap);
      
      // 進捗表示
      if ((i + this.batchSize) % 500 === 0) {
        const elapsed = (Date.now() - this.stats.startTime) / 1000 / 60;
        const rate = this.stats.processedLaws / elapsed;
        const remaining = (targetLawIds.length - this.stats.processedLaws) / rate;
        
        progressBar.text = chalk.cyan(
          `進捗: ${this.stats.processedLaws}/${targetLawIds.length} ` +
          `(${Math.round(this.stats.processedLaws / targetLawIds.length * 100)}%) ` +
          `残り約${Math.round(remaining)}分`
        );
      }
      
      // レート制限
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    progressBar.succeed('処理完了！');
    
    // 統計表示
    this.showStatistics();
  }

  /**
   * 統計表示
   */
  private showStatistics(): void {
    const elapsed = (Date.now() - this.stats.startTime) / 1000;
    
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('📊 インポート統計'));
    console.log(chalk.cyan('='.repeat(60)));
    
    console.log(chalk.green('\n✅ 成功:'));
    console.log(`  処理済み法令: ${this.stats.processedLaws}/${this.stats.totalLaws}件`);
    console.log(`  総条文数: ${this.stats.totalArticles.toLocaleString()}件`);
    console.log(`  総参照数: ${this.stats.totalReferences.toLocaleString()}件`);
    
    if (this.stats.failedLaws > 0) {
      console.log(chalk.red('\n❌ エラー:'));
      console.log(`  失敗法令: ${this.stats.failedLaws}件`);
      if (this.stats.errors.length > 0) {
        console.log(`  エラー詳細:`);
        this.stats.errors.slice(0, 5).forEach(e => 
          console.log(`    - ${e}`)
        );
      }
    }
    
    console.log(chalk.blue('\n⏱️ パフォーマンス:'));
    console.log(`  処理時間: ${Math.round(elapsed)}秒 (${Math.round(elapsed / 60)}分)`);
    console.log(`  処理速度: ${Math.round(this.stats.processedLaws / elapsed * 60)}法令/分`);
    
    console.log(chalk.cyan('='.repeat(60)));
  }

  /**
   * 参照データの詳細インポート（別途実行）
   */
  async importReferences(lawId: string): Promise<void> {
    const refPath = path.join(process.cwd(), 'egov_cache_v2', 'references', `${lawId}.json`);
    
    if (!fs.existsSync(refPath)) {
      return;
    }
    
    const references = JSON.parse(fs.readFileSync(refPath, 'utf-8'));
    const session = this.driver.session();
    
    try {
      await session.executeWrite(async (tx: any) => {
        for (const ref of references) {
          // 内部参照の修正
          if (!ref.targetLawId || ref.targetLawId === ref.sourceLawId) {
            ref.targetLawId = ref.sourceLawId;
            ref.referenceType = 'internal';
          }
          
          // 条文ノードの作成
          if (ref.sourceArticle) {
            await tx.run(`
              MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
            `, {
              lawId: ref.sourceLawId,
              articleNumber: ref.sourceArticle
            });
          }
          
          if (ref.targetArticle) {
            await tx.run(`
              MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
            `, {
              lawId: ref.targetLawId,
              articleNumber: ref.targetArticle
            });
          }
          
          // 参照関係の作成
          if (ref.sourceArticle && ref.targetArticle) {
            await tx.run(`
              MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
              MATCH (t:Article {lawId: $targetLawId, articleNumber: $targetArticle})
              MERGE (s)-[r:REFERENCES]->(t)
              SET r.text = $text,
                  r.type = $type,
                  r.source = 'egov',
                  r.confidence = 1.0
            `, {
              sourceLawId: ref.sourceLawId,
              sourceArticle: ref.sourceArticle,
              targetLawId: ref.targetLawId,
              targetArticle: ref.targetArticle,
              text: ref.referenceText,
              type: ref.referenceType
            });
          }
        }
      });
    } finally {
      await session.close();
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// CLI実行
if (require.main === module) {
  const importer = new Neo4jFullImporter();
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'import':
          await importer.importAll({
            limit: process.argv.includes('--limit') ? 
              parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : undefined,
            clean: process.argv.includes('--clean')
          });
          break;
          
        case 'test':
          // テストモード（最初の10件のみ）
          await importer.importAll({ limit: 10 });
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/neo4j-full-import.ts import [--limit N] [--clean]');
          console.log('  npx tsx scripts/neo4j-full-import.ts test');
          console.log('\nオプション:');
          console.log('  --limit N  処理する法令数を制限');
          console.log('  --clean    既存データを削除してから実行');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await importer.close();
    }
  })();
}

export default Neo4jFullImporter;