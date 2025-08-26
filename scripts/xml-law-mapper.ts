#!/usr/bin/env npx tsx

/**
 * XMLファイルと法令IDのマッピング作成
 * 
 * laws_dataディレクトリをスキャンして、
 * 法令IDとXMLファイルパスの対応表を作成
 */

import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';
import chalk from 'chalk';

interface LawMapping {
  lawId: string;
  xmlPath: string;
  lawNumber?: string;
  lawTitle?: string;
  promulgationDate?: string;
  enforcementDate?: string;
  era?: string;
  year?: number;
  num?: number;
  lawType?: string;
  articleCount?: number;
  fileSize?: number;
  lastModified?: Date;
}

export class XmlLawMapper {
  private lawsDataPath: string;
  private mappings: Map<string, LawMapping> = new Map();
  private parser: XMLParser;

  constructor(lawsDataPath: string = path.join(process.cwd(), 'laws_data')) {
    this.lawsDataPath = lawsDataPath;
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      textNodeName: '#text',
      parseTagValue: true,
      trimValues: true
    });
  }

  /**
   * laws_dataディレクトリをスキャン
   */
  async scanLawsDirectory(): Promise<void> {
    console.log(chalk.blue(`📂 スキャン開始: ${this.lawsDataPath}`));
    
    if (!fs.existsSync(this.lawsDataPath)) {
      throw new Error(`ディレクトリが存在しません: ${this.lawsDataPath}`);
    }

    const dirs = fs.readdirSync(this.lawsDataPath);
    let processed = 0;
    let errors = 0;

    for (const dir of dirs) {
      const dirPath = path.join(this.lawsDataPath, dir);
      const stats = fs.statSync(dirPath);
      
      if (!stats.isDirectory()) continue;
      if (dir === 'sample' || dir.startsWith('.')) continue;

      // ディレクトリ名から法令IDを抽出（最初の_まで）
      const lawIdMatch = dir.match(/^([^_]+)/);
      if (!lawIdMatch) continue;
      
      const lawId = lawIdMatch[1];
      
      // XMLファイルを探す
      const xmlFiles = fs.readdirSync(dirPath).filter(f => f.endsWith('.xml'));
      
      if (xmlFiles.length === 0) {
        console.log(chalk.yellow(`  ⚠️ XMLなし: ${dir}`));
        errors++;
        continue;
      }

      const xmlFile = xmlFiles[0]; // 通常は1つのみ
      const xmlPath = path.join(dirPath, xmlFile);
      
      try {
        const mapping = await this.extractLawMetadata(lawId, xmlPath);
        this.mappings.set(lawId, mapping);
        processed++;
        
        if (processed % 100 === 0) {
          console.log(chalk.gray(`  処理済み: ${processed}件`));
        }
      } catch (error) {
        console.error(chalk.red(`  ❌ エラー: ${lawId}`), error.message);
        errors++;
      }
    }

    console.log(chalk.green(`✅ スキャン完了: ${processed}件の法令, ${errors}件のエラー`));
  }

  /**
   * XMLファイルから法令メタデータを抽出
   */
  private async extractLawMetadata(lawId: string, xmlPath: string): Promise<LawMapping> {
    const stats = fs.statSync(xmlPath);
    const mapping: LawMapping = {
      lawId,
      xmlPath,
      fileSize: stats.size,
      lastModified: stats.mtime
    };

    try {
      const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
      const parsed = this.parser.parse(xmlContent);
      
      // 法令情報を抽出
      const law = parsed.Law || parsed.法令 || {};
      
      // 法令番号
      if (law['@_LawNum'] || law['@_Num']) {
        mapping.lawNumber = law['@_LawNum'] || law['@_Num'];
      }
      
      // 法令名（LawBodyのTitle要素から）
      const lawBody = law.LawBody || law.法令本体 || {};
      if (lawBody.LawTitle || lawBody.題名) {
        const title = lawBody.LawTitle || lawBody.題名;
        mapping.lawTitle = typeof title === 'string' ? title : title['#text'] || '';
      }
      
      // 法令種別
      if (law['@_LawType']) {
        mapping.lawType = law['@_LawType'];
      }
      
      // 公布日・施行日
      if (law['@_PromulgateDate']) {
        mapping.promulgationDate = law['@_PromulgateDate'];
      }
      if (law['@_EnforcementDate']) {
        mapping.enforcementDate = law['@_EnforcementDate'];
      }
      
      // 元号・年・番号
      if (law['@_Era']) {
        mapping.era = law['@_Era'];
      }
      if (law['@_Year']) {
        mapping.year = parseInt(law['@_Year']);
      }
      if (law['@_Num']) {
        mapping.num = parseInt(law['@_Num']);
      }
      
      // 条文数をカウント
      mapping.articleCount = this.countArticles(lawBody);
      
    } catch (error) {
      // XMLパースエラーでも基本情報は保持
      console.warn(chalk.yellow(`  XMLパースエラー: ${lawId}`));
    }

    return mapping;
  }

  /**
   * 条文数をカウント
   */
  private countArticles(lawBody: any): number {
    let count = 0;
    
    const countRecursive = (obj: any) => {
      if (!obj) return;
      
      // Article要素を探す
      if (obj.Article || obj.条) {
        const articles = Array.isArray(obj.Article) ? obj.Article : 
                        Array.isArray(obj.条) ? obj.条 : 
                        [obj.Article || obj.条];
        count += articles.filter(a => a).length;
      }
      
      // 子要素を再帰的に探索
      const childKeys = ['Part', 'Chapter', 'Section', 'Subsection', 'Division', 
                        '編', '章', '節', '款', '目', 'MainProvision', '本則'];
      
      for (const key of childKeys) {
        if (obj[key]) {
          const children = Array.isArray(obj[key]) ? obj[key] : [obj[key]];
          children.forEach(child => countRecursive(child));
        }
      }
    };
    
    countRecursive(lawBody);
    return count;
  }

  /**
   * マッピング結果を取得
   */
  getMappings(): Map<string, LawMapping> {
    return this.mappings;
  }

  /**
   * 法令IDからマッピングを取得
   */
  getMapping(lawId: string): LawMapping | undefined {
    return this.mappings.get(lawId);
  }

  /**
   * マッピングをJSONファイルに保存
   */
  async saveToJson(outputPath: string = 'law-mappings.json'): Promise<void> {
    const data = Array.from(this.mappings.entries()).map(([id, mapping]) => ({
      ...mapping,
      id
    }));
    
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(chalk.green(`✅ マッピングを保存: ${outputPath}`));
  }

  /**
   * 統計情報を表示
   */
  showStatistics(): void {
    const mappings = Array.from(this.mappings.values());
    
    console.log(chalk.cyan('\n📊 XML法令マッピング統計'));
    console.log(chalk.gray('='.repeat(50)));
    
    console.log(`総法令数: ${mappings.length}`);
    
    // 法令種別ごとの集計
    const byType = new Map<string, number>();
    mappings.forEach(m => {
      const type = m.lawType || '不明';
      byType.set(type, (byType.get(type) || 0) + 1);
    });
    
    console.log('\n法令種別:');
    Array.from(byType.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([type, count]) => {
        console.log(`  ${type}: ${count}件`);
      });
    
    // 条文数統計
    const withArticles = mappings.filter(m => m.articleCount && m.articleCount > 0);
    const totalArticles = withArticles.reduce((sum, m) => sum + (m.articleCount || 0), 0);
    
    console.log('\n条文統計:');
    console.log(`  条文データあり: ${withArticles.length}件`);
    console.log(`  総条文数: ${totalArticles}`);
    if (withArticles.length > 0) {
      console.log(`  平均条文数: ${Math.round(totalArticles / withArticles.length)}`);
    }
    
    // ファイルサイズ統計
    const totalSize = mappings.reduce((sum, m) => sum + (m.fileSize || 0), 0);
    console.log('\nファイルサイズ:');
    console.log(`  合計: ${Math.round(totalSize / 1024 / 1024)}MB`);
    console.log(`  平均: ${Math.round(totalSize / mappings.length / 1024)}KB`);
    
    console.log(chalk.gray('='.repeat(50)));
  }
}

// CLI実行
if (require.main === module) {
  const mapper = new XmlLawMapper();
  
  (async () => {
    try {
      await mapper.scanLawsDirectory();
      mapper.showStatistics();
      
      // マッピングを保存
      await mapper.saveToJson('xml-law-mappings.json');
      
      // サンプル表示
      console.log(chalk.blue('\n📝 マッピングサンプル（最初の3件）:'));
      const samples = Array.from(mapper.getMappings().entries()).slice(0, 3);
      samples.forEach(([id, mapping]) => {
        console.log(chalk.gray(`\n${id}:`));
        console.log(`  法令名: ${mapping.lawTitle || '不明'}`);
        console.log(`  法令番号: ${mapping.lawNumber || '不明'}`);
        console.log(`  条文数: ${mapping.articleCount || 0}`);
        console.log(`  XMLパス: ${mapping.xmlPath}`);
      });
      
    } catch (error) {
      console.error(chalk.red('エラー:'), error);
      process.exit(1);
    }
  })();
}

export default XmlLawMapper;