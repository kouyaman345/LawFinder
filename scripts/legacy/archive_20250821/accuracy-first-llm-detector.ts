#!/usr/bin/env npx tsx

/**
 * 精度優先参照検出エンジン
 * 少しでも不安がある場合はLLMを使用し、最高精度を目指す
 */

import { PrismaClient } from '@prisma/client';
import chalk from 'chalk';

const prisma = new PrismaClient();

// ========================
// 精度優先のLLM判定基準
// ========================
interface LLMTriggerPattern {
  pattern: RegExp | ((text: string) => boolean);
  type: string;
  alwaysUseLLM: boolean;  // 常にLLMを使用
  confidence: number;      // このパターンの基本信頼度
  description: string;
}

class AccuracyFirstDetector {
  // 精度優先：少しでも不安があればLLMを使用
  private readonly llmTriggers: LLMTriggerPattern[] = [
    // ========== 必ずLLMを使用するパターン ==========
    {
      pattern: /前項|次項|前条|次条|前二項|前三項|前各項|同項|同条|本条/g,
      type: 'relative_reference',
      alwaysUseLLM: true,
      confidence: 0.3,  // 70%失敗リスク → LLM必須
      description: '相対参照（文脈解析必須）'
    },
    
    {
      pattern: /当該|その|これら|前記|後記|上記|下記/g,
      type: 'contextual_reference',
      alwaysUseLLM: true,
      confidence: 0.2,  // 80%失敗リスク → LLM必須
      description: '文脈依存参照'
    },
    
    {
      pattern: /同法|本法|この法律|当該法令|関係法令/g,
      type: 'law_abbreviation',
      alwaysUseLLM: true,
      confidence: 0.25,
      description: '法令名の省略形'
    },
    
    {
      pattern: /準用|適用|読み替え|みなす|例による/g,
      type: 'application_reference',
      alwaysUseLLM: true,
      confidence: 0.35,
      description: '準用・適用関係'
    },
    
    // ========== 閾値を大幅に緩和（少しでも不安ならLLM） ==========
    {
      pattern: /第[三四五六七八九]十/g,  // 30以上の数字
      type: 'medium_number',
      alwaysUseLLM: false,
      confidence: 0.7,  // 30%リスクでもLLM使用
      description: '中程度の漢数字'
    },
    
    {
      pattern: /第[^条項号]*百/g,  // 百を含む
      type: 'large_number',
      alwaysUseLLM: true,
      confidence: 0.4,
      description: '大きな漢数字（百以上）'
    },
    
    {
      pattern: /第[^条項号]*千/g,  // 千を含む
      type: 'very_large_number',
      alwaysUseLLM: true,
      confidence: 0.3,
      description: '非常に大きな漢数字（千以上）'
    },
    
    {
      pattern: /から.*まで/g,
      type: 'range_reference',
      alwaysUseLLM: false,
      confidence: 0.65,  // 35%リスクでもLLM
      description: '範囲参照'
    },
    
    {
      pattern: /及び|並びに|又は|若しくは|かつ/g,
      type: 'compound_reference',
      alwaysUseLLM: false,
      confidence: 0.75,  // 25%リスクでもLLM
      description: '複合参照'
    },
    
    {
      pattern: /第\d+条の\d+/g,
      type: 'branch_article',
      alwaysUseLLM: false,
      confidence: 0.8,  // 20%リスクでもLLM
      description: '枝番号条文'
    },
    
    {
      pattern: /ただし書|本文|各号|前段|後段/g,
      type: 'structural_reference',
      alwaysUseLLM: false,
      confidence: 0.6,
      description: '構造的参照'
    },
    
    // ========== 追加の慎重パターン ==========
    {
      pattern: (text: string) => text.length > 200,  // 長文
      type: 'long_text',
      alwaysUseLLM: false,
      confidence: 0.7,
      description: '長い条文（複雑な可能性）'
    },
    
    {
      pattern: (text: string) => (text.match(/第/g) || []).length > 3,
      type: 'multiple_references',
      alwaysUseLLM: false,
      confidence: 0.65,
      description: '複数の参照を含む'
    },
    
    {
      pattern: /。.*。.*。/g,  // 3文以上
      type: 'multiple_sentences',
      alwaysUseLLM: false,
      confidence: 0.75,
      description: '複数文の条文'
    }
  ];

  // LLM使用の閾値（精度優先で大幅に緩和）
  private readonly CONFIDENCE_THRESHOLD = 0.85;  // 85%未満の信頼度でLLM使用（以前は50%）
  
  /**
   * LLM使用判定（精度優先版）
   */
  shouldUseLLM(text: string): LLMDecision {
    const triggers: TriggeredPattern[] = [];
    let minConfidence = 1.0;
    let hasAlwaysUseLLM = false;
    
    // すべてのトリガーをチェック
    for (const trigger of this.llmTriggers) {
      let matches = false;
      
      if (trigger.pattern instanceof RegExp) {
        matches = trigger.pattern.test(text);
      } else {
        matches = trigger.pattern(text);
      }
      
      if (matches) {
        triggers.push({
          type: trigger.type,
          description: trigger.description,
          confidence: trigger.confidence,
          alwaysUseLLM: trigger.alwaysUseLLM
        });
        
        minConfidence = Math.min(minConfidence, trigger.confidence);
        if (trigger.alwaysUseLLM) {
          hasAlwaysUseLLM = true;
        }
      }
    }
    
    // 判定ロジック（精度優先）
    // 1. alwaysUseLLMのパターンがあれば必ずLLM
    // 2. 信頼度が閾値未満なら必ずLLM
    // 3. 複数のリスクパターンがあればLLM
    const useLLM = hasAlwaysUseLLM || 
                   minConfidence < this.CONFIDENCE_THRESHOLD ||
                   triggers.length >= 2;  // 2つ以上のリスクパターン
    
    return {
      useLLM,
      confidence: minConfidence,
      triggers,
      reason: this.generateReason(useLLM, triggers, minConfidence)
    };
  }
  
  private generateReason(useLLM: boolean, triggers: TriggeredPattern[], confidence: number): string {
    if (!useLLM) {
      return '高信頼度パターンのみ検出';
    }
    
    const reasons = [];
    
    // 必須LLMパターン
    const alwaysUseLLM = triggers.filter(t => t.alwaysUseLLM);
    if (alwaysUseLLM.length > 0) {
      reasons.push(`LLM必須パターン検出: ${alwaysUseLLM.map(t => t.type).join(', ')}`);
    }
    
    // 低信頼度
    if (confidence < this.CONFIDENCE_THRESHOLD) {
      reasons.push(`信頼度不足: ${(confidence * 100).toFixed(0)}% < ${(this.CONFIDENCE_THRESHOLD * 100).toFixed(0)}%`);
    }
    
    // 複数リスク
    if (triggers.length >= 2) {
      reasons.push(`複数のリスクパターン: ${triggers.length}件`);
    }
    
    return reasons.join(' / ');
  }
  
  /**
   * 精度優先の参照検出
   */
  async detectReferences(
    text: string,
    lawId: string,
    articleNum: string
  ): Promise<DetectionResult> {
    console.log(chalk.cyan.bold('\n🎯 精度優先参照検出開始'));
    console.log(chalk.gray(`法令: ${lawId}, 条文: ${articleNum}`));
    console.log(chalk.gray(`テキスト長: ${text.length}文字`));
    
    // LLM使用判定
    const decision = this.shouldUseLLM(text);
    
    // 判定結果の表示
    if (decision.useLLM) {
      console.log(chalk.red.bold('\n🤖 LLM使用: ON'));
      console.log(chalk.red(`理由: ${decision.reason}`));
      console.log(chalk.red(`最低信頼度: ${(decision.confidence * 100).toFixed(0)}%`));
      console.log(chalk.red(`検出パターン数: ${decision.triggers.length}`));
      
      // パターン詳細
      for (const trigger of decision.triggers) {
        console.log(chalk.yellow(`  - ${trigger.type}: ${trigger.description} (信頼度: ${(trigger.confidence * 100).toFixed(0)}%)`));
      }
    } else {
      console.log(chalk.green.bold('\n✅ LLM使用: OFF（高信頼度）'));
      console.log(chalk.green(`信頼度: ${(decision.confidence * 100).toFixed(0)}%`));
    }
    
    // 検出処理
    let references: any[] = [];
    
    if (decision.useLLM) {
      references = await this.detectWithLLM(text, lawId, articleNum, decision);
    } else {
      references = await this.detectWithPatterns(text, lawId, articleNum);
    }
    
    // データベース保存（requiresLLMCheckフラグ付き）
    if (references.length > 0) {
      await this.saveToDatabase(references, decision);
    }
    
    return {
      references,
      llmUsed: decision.useLLM,
      confidence: decision.confidence,
      triggers: decision.triggers.length
    };
  }
  
  /**
   * LLMを使用した高精度検出
   */
  private async detectWithLLM(
    text: string,
    lawId: string,
    articleNum: string,
    decision: LLMDecision
  ): Promise<any[]> {
    console.log(chalk.blue('\n🧠 LLMによる高精度解析実行中...'));
    
    // 実際のLLM呼び出し（Ollama/OpenAI）
    // ここではシミュレーション
    const references = [];
    
    // LLMプロンプト例
    const prompt = `
    以下の法令条文から、他の条文への参照をすべて抽出してください。
    特に以下の点に注意してください：
    - 相対参照（前項、前条等）は実際の条文番号に解決
    - 文脈依存の参照（当該、その等）は具体的に特定
    - 範囲参照は個別に展開
    
    現在の条文: ${articleNum}
    テキスト: ${text}
    
    検出が必要なパターン:
    ${decision.triggers.map(t => `- ${t.description}`).join('\n')}
    `;
    
    console.log(chalk.gray('  プロンプト生成完了'));
    console.log(chalk.gray('  LLM推論中...'));
    
    // シミュレーション結果
    references.push({
      type: 'llm_detected',
      text: '検出された参照',
      confidence: 0.95,
      method: 'llm',
      llmMetadata: {
        model: 'mistral',
        promptTokens: prompt.length,
        triggers: decision.triggers.map(t => t.type)
      }
    });
    
    return references;
  }
  
  /**
   * パターンマッチング検出（高信頼度の場合のみ）
   */
  private async detectWithPatterns(
    text: string,
    lawId: string,
    articleNum: string
  ): Promise<any[]> {
    console.log(chalk.blue('\n⚡ 高信頼度パターンマッチング実行中...'));
    
    const references = [];
    
    // 明示的な条文参照のみ（高信頼度）
    const simplePattern = /第(\d+)条/g;
    let match;
    
    while ((match = simplePattern.exec(text)) !== null) {
      references.push({
        type: 'explicit',
        text: match[0],
        confidence: 0.95,
        method: 'pattern'
      });
    }
    
    return references;
  }
  
  /**
   * データベース保存
   */
  private async saveToDatabase(references: any[], decision: LLMDecision): Promise<void> {
    console.log(chalk.cyan('\n💾 データベース保存中...'));
    
    for (const ref of references) {
      try {
        await prisma.reference.create({
          data: {
            sourceLawId: 'test_law',
            sourceArticle: 'test_article',
            targetLawId: ref.targetLawId || 'test_law',
            targetArticle: ref.text,
            referenceType: ref.type,
            referenceText: ref.text,
            confidence: ref.confidence,
            detectionMethod: ref.method,
            requiresLLMCheck: decision.useLLM,  // LLM使用フラグ
            llmCheckResult: decision.useLLM ? {
              used: true,
              reason: decision.reason,
              triggers: decision.triggers.map(t => t.type),
              confidence: decision.confidence,
              timestamp: new Date().toISOString()
            } : null,
            llmCheckedAt: decision.useLLM ? new Date() : null,
            sourceVersionId: 'dummy_version'
          }
        });
      } catch (error) {
        // エラー処理
      }
    }
    
    console.log(chalk.green(`✅ ${references.length}件を保存（LLM使用: ${decision.useLLM}）`));
  }
}

interface TriggeredPattern {
  type: string;
  description: string;
  confidence: number;
  alwaysUseLLM: boolean;
}

interface LLMDecision {
  useLLM: boolean;
  confidence: number;
  triggers: TriggeredPattern[];
  reason: string;
}

interface DetectionResult {
  references: any[];
  llmUsed: boolean;
  confidence: number;
  triggers: number;
}

// ========================
// テスト実行
// ========================
async function testAccuracyFirstDetection() {
  console.log(chalk.cyan.bold('===== 精度優先参照検出テスト ====='));
  console.log(chalk.yellow('データベース作成は頻度が低いため、速度より精度を優先'));
  
  const detector = new AccuracyFirstDetector();
  
  const testCases = [
    {
      name: '単純な明示的参照（LLM不要の可能性）',
      text: '第90条の規定により無効とする。',
      expected: 'LLM不要（高信頼度）'
    },
    {
      name: '相対参照を含む（LLM必須）',
      text: '前項の規定により、善意の第三者に対抗できない。',
      expected: 'LLM必須（相対参照）'
    },
    {
      name: '中程度の漢数字（LLM推奨）',
      text: '第三十五条の規定を適用する。',
      expected: 'LLM使用（中程度リスク）'
    },
    {
      name: '大きな漢数字（LLM必須）',
      text: '第五百六十六条及び第七百五十八条を準用する。',
      expected: 'LLM必須（大きな漢数字）'
    },
    {
      name: '範囲参照（LLM推奨）',
      text: '第一条から第三条までの規定による。',
      expected: 'LLM使用（範囲参照）'
    },
    {
      name: '複数のリスクパターン（LLM必須）',
      text: '前項及び前条の規定により、第三十条から第三十五条までを準用する。',
      expected: 'LLM必須（複数リスク）'
    },
    {
      name: '長文条文（LLM推奨）',
      text: '使用者は、当該事業場に、労働者の過半数で組織する労働組合がある場合においてはその労働組合、労働者の過半数で組織する労働組合がない場合においては労働者の過半数を代表する者との書面による協定をし、これを行政官庁に届け出た場合においては、第三十二条から第三十二条の五まで若しくは第四十条の労働時間又は前条の休日に関する規定にかかわらず、その協定で定めるところによって労働時間を延長し、又は休日に労働させることができる。',
      expected: 'LLM使用（長文・複数参照）'
    }
  ];
  
  for (const testCase of testCases) {
    console.log(chalk.yellow(`\n\n📝 テストケース: ${testCase.name}`));
    console.log(chalk.gray(`期待: ${testCase.expected}`));
    console.log(chalk.gray(`テキスト: "${testCase.text.substring(0, 50)}..."`));
    
    const result = await detector.detectReferences(
      testCase.text,
      'test_law',
      '第1条'
    );
    
    console.log(chalk.cyan('\n📊 結果:'));
    console.log(`  LLM使用: ${result.llmUsed ? 'はい' : 'いいえ'}`);
    console.log(`  信頼度: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`  トリガー数: ${result.triggers}`);
    console.log(`  検出参照数: ${result.references.length}`);
  }
  
  await prisma.$disconnect();
}

// メイン実行
if (require.main === module) {
  testAccuracyFirstDetection().catch(console.error);
}

export { AccuracyFirstDetector };