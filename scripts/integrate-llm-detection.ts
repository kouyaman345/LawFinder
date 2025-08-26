#!/usr/bin/env npx tsx

/**
 * LLM検出結果をNeo4jに統合
 * 
 * detector.tsやollamaの検出結果を
 * source: "xml-llm"として追加
 */

import { initNeo4jDriver } from '../src/lib/neo4j';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

interface LLMDetectedReference {
  sourceLawId: string;
  sourceArticle: string;
  targetLawId?: string;
  targetLawName?: string;
  targetArticle?: string;
  referenceText: string;
  confidence: number;
  detectionMethod: 'ollama' | 'gpt' | 'detector' | 'rule-based';
}

class LLMDetectionIntegrator {
  private driver: any;
  
  constructor() {
    this.driver = initNeo4jDriver();
  }

  /**
   * detector.tsの結果を読み込み
   */
  private loadDetectorResults(lawId: string): LLMDetectedReference[] {
    const references: LLMDetectedReference[] = [];
    
    // detector.tsの出力ファイルを探す（仮の実装）
    const detectorPath = path.join(process.cwd(), 'detection_results', `${lawId}.json`);
    
    if (fs.existsSync(detectorPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(detectorPath, 'utf-8'));
        
        data.references?.forEach((ref: any) => {
          references.push({
            sourceLawId: lawId,
            sourceArticle: ref.sourceArticle || '',
            targetLawId: ref.targetLawId,
            targetLawName: ref.targetLawName,
            targetArticle: ref.targetArticle,
            referenceText: ref.text,
            confidence: ref.confidence || 0.85,
            detectionMethod: 'detector'
          });
        });
      } catch (error) {
        console.error(chalk.red(`検出結果読み込みエラー: ${lawId}`));
      }
    }
    
    return references;
  }

  /**
   * Ollamaの検出結果を読み込み（将来実装）
   */
  private async loadOllamaResults(lawId: string): Promise<LLMDetectedReference[]> {
    const references: LLMDetectedReference[] = [];
    
    // Ollama APIを使用した検出（仮の実装）
    const ollamaPath = path.join(process.cwd(), 'ollama_results', `${lawId}.json`);
    
    if (fs.existsSync(ollamaPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(ollamaPath, 'utf-8'));
        
        data.detections?.forEach((det: any) => {
          references.push({
            sourceLawId: lawId,
            sourceArticle: det.article,
            targetLawId: det.targetLaw,
            targetLawName: det.targetLawName,
            targetArticle: det.targetArticle,
            referenceText: det.text,
            confidence: det.confidence || 0.9,
            detectionMethod: 'ollama'
          });
        });
      } catch (error) {
        console.error(chalk.red(`Ollama結果読み込みエラー: ${lawId}`));
      }
    }
    
    return references;
  }

  /**
   * 法令IDから法令名を解決
   */
  private async resolveLawName(lawId: string): Promise<string> {
    const session = this.driver.session();
    
    try {
      const result = await session.run(
        'MATCH (l:Law {lawId: $lawId}) RETURN l.lawTitle as title',
        { lawId }
      );
      
      if (result.records.length > 0) {
        return result.records[0].get('title') || '';
      }
    } finally {
      await session.close();
    }
    
    return '';
  }

  /**
   * LLM検出結果をNeo4jに投入
   */
  async integrateDetection(lawId: string, options: {
    useDetector?: boolean;
    useOllama?: boolean;
    overwrite?: boolean;
  } = { useDetector: true, useOllama: false }): Promise<void> {
    const spinner = ora(`${lawId}のLLM検出結果を統合中...`).start();
    const session = this.driver.session();
    
    try {
      const references: LLMDetectedReference[] = [];
      
      // 各ソースから検出結果を収集
      if (options.useDetector) {
        references.push(...this.loadDetectorResults(lawId));
      }
      
      if (options.useOllama) {
        references.push(...await this.loadOllamaResults(lawId));
      }
      
      if (references.length === 0) {
        spinner.info(`${lawId}: LLM検出結果なし`);
        return;
      }
      
      // トランザクションで投入
      await session.executeWrite(async (tx: any) => {
        // 既存のxml-llm参照を削除（上書きオプション時）
        if (options.overwrite) {
          await tx.run(`
            MATCH (s:Article {lawId: $lawId})-[r:REFERENCES]->()
            WHERE r.source = 'xml-llm'
            DELETE r
          `, { lawId });
        }
        
        // 新しい参照を追加
        for (const ref of references) {
          // ターゲット法令IDを解決（法令名から）
          let targetLawId = ref.targetLawId;
          
          if (!targetLawId && ref.targetLawName) {
            // 法令名から法令IDを検索
            const searchResult = await tx.run(`
              MATCH (l:Law)
              WHERE l.lawTitle CONTAINS $lawName
              RETURN l.lawId as lawId
              LIMIT 1
            `, { lawName: ref.targetLawName });
            
            if (searchResult.records.length > 0) {
              targetLawId = searchResult.records[0].get('lawId');
            }
          }
          
          if (!targetLawId) {
            // 同一法令内参照として処理
            targetLawId = lawId;
          }
          
          // 条文ノードを確保
          if (ref.sourceArticle) {
            await tx.run(`
              MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
            `, {
              lawId,
              articleNumber: ref.sourceArticle
            });
          }
          
          if (ref.targetArticle) {
            await tx.run(`
              MERGE (a:Article {lawId: $lawId, articleNumber: $articleNumber})
            `, {
              lawId: targetLawId,
              articleNumber: ref.targetArticle
            });
          }
          
          // 参照関係を作成
          if (ref.sourceArticle && ref.targetArticle) {
            // 重複チェック
            const existingCheck = await tx.run(`
              MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
              MATCH (t:Article {lawId: $targetLawId, articleNumber: $targetArticle})
              MATCH (s)-[r:REFERENCES]->(t)
              WHERE r.text = $text
              RETURN r
            `, {
              sourceLawId: lawId,
              sourceArticle: ref.sourceArticle,
              targetLawId,
              targetArticle: ref.targetArticle,
              text: ref.referenceText
            });
            
            if (existingCheck.records.length === 0) {
              // 新規参照を追加
              await tx.run(`
                MATCH (s:Article {lawId: $sourceLawId, articleNumber: $sourceArticle})
                MATCH (t:Article {lawId: $targetLawId, articleNumber: $targetArticle})
                CREATE (s)-[r:REFERENCES {
                  text: $text,
                  type: $type,
                  source: 'xml-llm',
                  confidence: $confidence,
                  detectionMethod: $detectionMethod,
                  created: datetime()
                }]->(t)
              `, {
                sourceLawId: lawId,
                sourceArticle: ref.sourceArticle,
                targetLawId,
                targetArticle: ref.targetArticle,
                text: ref.referenceText,
                type: targetLawId === lawId ? 'internal' : 'external',
                confidence: ref.confidence,
                detectionMethod: ref.detectionMethod
              });
            }
          }
        }
        
        // 法令ノードの統計を更新
        await tx.run(`
          MATCH (l:Law {lawId: $lawId})
          MATCH (a:Article {lawId: $lawId})-[r:REFERENCES]->()
          WHERE r.source = 'xml-llm'
          WITH l, count(DISTINCT r) as llmRefs
          SET l.llmReferences = llmRefs
        `, { lawId });
      });
      
      spinner.succeed(`${lawId}: ${references.length}件のLLM検出結果を統合`);
      
    } catch (error) {
      spinner.fail(`${lawId}: エラー`);
      console.error(error);
    } finally {
      await session.close();
    }
  }

  /**
   * バッチ処理
   */
  async integrateAll(options: {
    limit?: number;
    useDetector?: boolean;
    useOllama?: boolean;
  } = {}): Promise<void> {
    console.log(chalk.cyan('\n' + '='.repeat(60)));
    console.log(chalk.cyan('🤖 LLM検出結果統合開始'));
    console.log(chalk.cyan('='.repeat(60)));
    
    const session = this.driver.session();
    
    try {
      // 処理対象の法令を取得
      const result = await session.run(`
        MATCH (l:Law)
        WHERE l.hasXml = true
        RETURN l.lawId as lawId
        ${options.limit ? `LIMIT ${options.limit}` : ''}
      `);
      
      const lawIds = result.records.map(r => r.get('lawId'));
      console.log(chalk.blue(`\n📊 処理対象: ${lawIds.length}件の法令\n`));
      
      let processed = 0;
      let integrated = 0;
      
      for (const lawId of lawIds) {
        await this.integrateDetection(lawId, {
          useDetector: options.useDetector !== false,
          useOllama: options.useOllama === true
        });
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(chalk.gray(`  進捗: ${processed}/${lawIds.length}`));
        }
      }
      
      // 統計を表示
      const stats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        WHERE r.source = 'xml-llm'
        RETURN 
          count(r) as total,
          avg(r.confidence) as avgConfidence,
          count(DISTINCT r.detectionMethod) as methods
      `);
      
      if (stats.records.length > 0) {
        const record = stats.records[0];
        console.log(chalk.cyan('\n' + '='.repeat(60)));
        console.log(chalk.green('✅ 統合完了'));
        console.log(`  LLM検出参照数: ${record.get('total')}件`);
        console.log(`  平均信頼度: ${(record.get('avgConfidence') * 100).toFixed(1)}%`);
        console.log(`  検出手法数: ${record.get('methods')}種類`);
        console.log(chalk.cyan('='.repeat(60)));
      }
      
    } finally {
      await session.close();
    }
  }

  /**
   * 統計情報表示
   */
  async showStatistics(): Promise<void> {
    const session = this.driver.session();
    
    try {
      console.log(chalk.cyan('\n📊 LLM検出統計'));
      console.log(chalk.gray('='.repeat(50)));
      
      // ソース別統計
      const sourceStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        RETURN 
          r.source as source,
          count(r) as count,
          avg(r.confidence) as avgConf
        ORDER BY count DESC
      `);
      
      console.log(chalk.blue('ソース別参照数:'));
      sourceStats.records.forEach(record => {
        const source = record.get('source');
        const count = record.get('count');
        const conf = record.get('avgConf');
        
        console.log(`  ${source}: ${count.toNumber ? count.toNumber() : count}件` +
          (conf ? ` (信頼度${(conf * 100).toFixed(1)}%)` : ''));
      });
      
      // 検出手法別統計（xml-llmのみ）
      const methodStats = await session.run(`
        MATCH ()-[r:REFERENCES]->()
        WHERE r.source = 'xml-llm'
        RETURN 
          r.detectionMethod as method,
          count(r) as count,
          avg(r.confidence) as avgConf
        ORDER BY count DESC
      `);
      
      if (methodStats.records.length > 0) {
        console.log(chalk.blue('\nLLM検出手法別:'));
        methodStats.records.forEach(record => {
          const method = record.get('method');
          const count = record.get('count');
          const conf = record.get('avgConf');
          
          console.log(`  ${method}: ${count.toNumber ? count.toNumber() : count}件` +
            ` (信頼度${(conf * 100).toFixed(1)}%)`);
        });
      }
      
    } finally {
      await session.close();
    }
    
    console.log(chalk.gray('='.repeat(50)));
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}

// CLI実行
if (require.main === module) {
  const integrator = new LLMDetectionIntegrator();
  const command = process.argv[2];
  
  (async () => {
    try {
      switch (command) {
        case 'integrate':
          const lawId = process.argv[3];
          if (lawId) {
            await integrator.integrateDetection(lawId);
          } else {
            await integrator.integrateAll({
              limit: process.argv.includes('--limit') ?
                parseInt(process.argv[process.argv.indexOf('--limit') + 1]) : undefined,
              useOllama: process.argv.includes('--ollama')
            });
          }
          break;
          
        case 'stats':
          await integrator.showStatistics();
          break;
          
        default:
          console.log(chalk.cyan('使用方法:'));
          console.log('  npx tsx scripts/integrate-llm-detection.ts integrate [法令ID]');
          console.log('  npx tsx scripts/integrate-llm-detection.ts stats');
          console.log('\nオプション:');
          console.log('  --limit N  処理数を制限');
          console.log('  --ollama   Ollama結果も統合');
      }
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    } finally {
      await integrator.close();
    }
  })();
}