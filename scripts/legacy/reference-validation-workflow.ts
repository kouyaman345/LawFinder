#!/usr/bin/env npx tsx
/**
 * 参照検出検証ワークフロー
 *
 * このスクリプトは以下のサイクルを実行します：
 * 1. 法令データから参照を検出
 * 2. Neo4jに参照関係を保存
 * 3. Next.jsでHTMLを生成
 * 4. HTMLをClaude Codeで確認して抜け漏れを特定
 * 5. フィードバックを基にアルゴリズムを改善
 */

import { PrismaClient } from "@prisma/client";
import { ComprehensiveReferenceDetector, DetectedReference } from "../src/domain/services/ComprehensiveReferenceDetector";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface ValidationReport {
  lawId: string;
  lawTitle: string;
  timestamp: string;
  detectedReferences: DetectedReference[];
  htmlPath: string;
  neo4jSyncStatus: "pending" | "completed" | "failed";
  validationStatus: "pending" | "in_progress" | "completed";
  missedReferences?: MissedReference[];
}

interface MissedReference {
  text: string; // 見逃した参照テキスト
  context: string; // 参照が含まれる文脈
  type: string; // 参照の種類
  reason?: string; // 見逃した理由の推測
}

class ReferenceValidationWorkflow {
  private prisma: PrismaClient;
  private detector: ComprehensiveReferenceDetector;
  private reportsDir = "/home/coffee/projects/LawFinder/validation-reports";

  constructor() {
    this.prisma = new PrismaClient();
    this.detector = new ComprehensiveReferenceDetector();
  }

  /**
   * 検証ワークフローの実行
   */
  async runValidation(lawId: string): Promise<ValidationReport> {
    console.log(`\n🔍 法令 ${lawId} の参照検出検証を開始します...\n`);

    // レポートディレクトリの作成
    await fs.mkdir(this.reportsDir, { recursive: true });

    // 1. 法令データの取得
    const law = await this.prisma.law.findUnique({
      where: { id: lawId },
      include: {
        articles: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (!law) {
      throw new Error(`法令が見つかりません: ${lawId}`);
    }

    // 2. 参照検出の実行
    console.log("📋 参照を検出中...");
    const allReferences: DetectedReference[] = [];

    for (const article of law.articles) {
      if (article.isDeleted) continue;

      const references = this.detector.detectAllReferences(article.content);
      allReferences.push(
        ...references.map(
          (ref) =>
            ({
              ...ref,
              sourceArticle: article.articleNumber,
            } as any)
        )
      );
    }

    console.log(`✅ ${allReferences.length}件の参照を検出しました`);

    // 3. 検証レポートの作成
    const report: ValidationReport = {
      lawId: law.id,
      lawTitle: law.title,
      timestamp: new Date().toISOString(),
      detectedReferences: allReferences,
      htmlPath: "",
      neo4jSyncStatus: "pending",
      validationStatus: "pending",
    };

    // 4. Neo4jへの同期
    console.log("🔄 Neo4jに参照関係を同期中...");
    try {
      await this.syncToNeo4j(law.id);
      report.neo4jSyncStatus = "completed";
      console.log("✅ Neo4j同期完了");
    } catch (error) {
      console.error("❌ Neo4j同期エラー:", error);
      report.neo4jSyncStatus = "failed";
    }

    // 5. HTMLの生成
    console.log("🌐 HTMLを生成中...");
    const htmlPath = await this.generateHTML(law.id);
    report.htmlPath = htmlPath;
    console.log(`✅ HTML生成完了: ${htmlPath}`);

    // 6. レポートファイルの保存
    const reportPath = path.join(this.reportsDir, `${law.id}_validation.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    // 7. 検証用の要約情報を出力
    await this.printValidationSummary(report);

    // 8. Claude Codeでの確認指示
    console.log("\n" + "=".repeat(80));
    console.log("📝 Claude Codeでの確認手順:");
    console.log("=".repeat(80));
    console.log(`
1. 生成されたHTMLファイルを確認してください:
   ${htmlPath}

2. HTMLを読み込んで、以下の点を確認してください:
   - リンクになっていない参照テキストがないか
   - 「第○条」「前項」「同号」などの参照表現が見逃されていないか
   - 準用・適用関係が正しく検出されているか

3. 見逃された参照を発見したら、以下のコマンドで報告してください:
   npm run validation:feedback ${law.id}

4. フィードバックファイルに見逃された参照を記録してください:
   ${reportPath.replace(".json", "_feedback.json")}
`);

    return report;
  }

  /**
   * Neo4jへの同期
   */
  private async syncToNeo4j(lawId: string): Promise<void> {
    const { stdout, stderr } = await execAsync(`npx tsx /home/coffee/projects/LawFinder/scripts/sync-to-neo4j.ts ${lawId}`);

    if (stderr && !stderr.includes("Warning")) {
      throw new Error(stderr);
    }
  }

  /**
   * HTMLの生成
   */
  private async generateHTML(lawId: string): Promise<string> {
    // Next.jsの開発サーバーが起動していることを確認
    try {
      await execAsync("curl -s http://localhost:5000 > /dev/null");
    } catch {
      console.log("⚠️  Next.js開発サーバーが起動していません。起動します...");
      // バックグラウンドでNext.jsを起動
      exec("npm run dev", { cwd: "/home/coffee/projects/LawFinder" });
      // サーバー起動を待つ
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // HTMLを取得して保存
    const htmlPath = path.join(this.reportsDir, `${lawId}_generated.html`);
    const { stdout } = await execAsync(`curl -s http://localhost:5000/laws/${lawId} > ${htmlPath}`);

    return htmlPath;
  }

  /**
   * 検証サマリーの出力
   */
  private async printValidationSummary(report: ValidationReport): Promise<void> {
    console.log("\n" + "=".repeat(80));
    console.log("📊 参照検出サマリー");
    console.log("=".repeat(80));
    console.log(`法令: ${report.lawTitle} (${report.lawId})`);
    console.log(`検出日時: ${new Date(report.timestamp).toLocaleString("ja-JP")}`);
    console.log(`検出参照数: ${report.detectedReferences.length}件`);

    // 参照タイプ別の集計
    const typeCount = report.detectedReferences.reduce((acc, ref) => {
      acc[ref.type] = (acc[ref.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log("\n参照タイプ別:");
    Object.entries(typeCount).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}件`);
    });

    // 信頼度の分布
    const confidenceBins = {
      high: report.detectedReferences.filter((r) => r.confidence >= 0.9).length,
      medium: report.detectedReferences.filter((r) => r.confidence >= 0.7 && r.confidence < 0.9).length,
      low: report.detectedReferences.filter((r) => r.confidence < 0.7).length,
    };

    console.log("\n信頼度分布:");
    console.log(`  - 高 (≥0.9): ${confidenceBins.high}件`);
    console.log(`  - 中 (0.7-0.9): ${confidenceBins.medium}件`);
    console.log(`  - 低 (<0.7): ${confidenceBins.low}件`);
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

/**
 * フィードバック処理クラス
 */
class FeedbackProcessor {
  private reportsDir = "/home/coffee/projects/LawFinder/validation-reports";

  /**
   * Claude Codeからのフィードバックを処理
   */
  async processFeedback(lawId: string): Promise<void> {
    const feedbackPath = path.join(this.reportsDir, `${lawId}_validation_feedback.json`);

    try {
      const feedbackData = await fs.readFile(feedbackPath, "utf-8");
      const feedback = JSON.parse(feedbackData);

      console.log("\n📥 フィードバックを受信しました:");
      console.log(`見逃された参照: ${feedback.missedReferences?.length || 0}件`);

      if (feedback.missedReferences && feedback.missedReferences.length > 0) {
        console.log("\n🔧 アルゴリズムの改善提案:");
        await this.generateImprovementSuggestions(feedback.missedReferences);
      }
    } catch (error) {
      console.log(`\n⚠️  フィードバックファイルが見つかりません: ${feedbackPath}`);
      console.log("Claude Codeで検証後、フィードバックファイルを作成してください。");

      // テンプレートファイルの作成
      const template = {
        lawId,
        timestamp: new Date().toISOString(),
        missedReferences: [
          {
            text: "例: 第百条",
            context: "見逃された参照を含む文",
            type: "internal",
            reason: "パターンにマッチしなかった",
          },
        ],
        notes: "Claude Codeでの確認結果をここに記載",
      };

      await fs.writeFile(feedbackPath, JSON.stringify(template, null, 2));
      console.log(`\n✅ フィードバックテンプレートを作成しました: ${feedbackPath}`);
    }
  }

  /**
   * 改善提案の生成
   */
  private async generateImprovementSuggestions(missedRefs: MissedReference[]): Promise<void> {
    const suggestions = new Map<string, string[]>();

    for (const ref of missedRefs) {
      // パターンタイプの推測
      if (ref.text.includes("条") && !ref.text.includes("法")) {
        suggestions.set("内部参照", suggestions.get("内部参照") || []);
        suggestions.get("内部参照")!.push(ref.text);
      } else if (ref.text.includes("法") && ref.text.includes("条")) {
        suggestions.set("外部参照", suggestions.get("外部参照") || []);
        suggestions.get("外部参照")!.push(ref.text);
      } else if (ref.text.match(/前|次|同/)) {
        suggestions.set("相対参照", suggestions.get("相対参照") || []);
        suggestions.get("相対参照")!.push(ref.text);
      }
    }

    suggestions.forEach((examples, type) => {
      console.log(`\n${type}の改善が必要:`);
      examples.slice(0, 3).forEach((ex) => console.log(`  - "${ex}"`));
    });
  }
}

// メイン実行
if (require.main === module) {
  const command = process.argv[2];
  const lawId = process.argv[3];

  if (command === "validate") {
    if (!lawId) {
      console.error("使用法: npm run validation:run <法令ID>");
      process.exit(1);
    }

    const workflow = new ReferenceValidationWorkflow();
    workflow
      .runValidation(lawId)
      .then(() => {
        console.log("\n✅ 検証ワークフローが完了しました");
        return workflow.cleanup();
      })
      .catch((error) => {
        console.error("❌ エラー:", error);
        process.exit(1);
      });
  } else if (command === "feedback") {
    if (!lawId) {
      console.error("使用法: npm run validation:feedback <法令ID>");
      process.exit(1);
    }

    const processor = new FeedbackProcessor();
    processor
      .processFeedback(lawId)
      .then(() => {
        console.log("\n✅ フィードバック処理が完了しました");
      })
      .catch((error) => {
        console.error("❌ エラー:", error);
        process.exit(1);
      });
  } else {
    console.log(`
使用法:
  npm run validation:run <法令ID>     - 検証ワークフローを実行
  npm run validation:feedback <法令ID> - フィードバックを処理
    `);
  }
}

export { ReferenceValidationWorkflow, FeedbackProcessor, ValidationReport, MissedReference };
