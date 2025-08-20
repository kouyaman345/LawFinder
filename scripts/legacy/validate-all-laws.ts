#!/usr/bin/env tsx

/**
 * 全法令データ検証スクリプト
 * laws_data内の全XMLファイルに対してv4.1.0の検出性能を測定
 */

import { EnhancedReferenceDetectorV41 } from '../src/domain/services/EnhancedReferenceDetectorV41';
import { EnhancedReferenceDetectorV37 } from '../src/domain/services/EnhancedReferenceDetectorV37';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

interface LawStatistics {
  lawId: string;
  lawName: string;
  totalArticles: number;
  v37References: number;
  v41References: number;
  improvement: number;
  abbreviationExpanded: number;
  deletedArticles: number;
  nestedReferences: number;
  processingTimeMs: number;
  cacheHits: number;
}

interface CategoryStatistics {
  category: string;
  lawCount: number;
  totalArticles: number;
  totalV37References: number;
  totalV41References: number;
  averageImprovement: number;
  processingTimeMs: number;
}

class AllLawsValidator {
  private detectorV41: EnhancedReferenceDetectorV41;
  private detectorV37: EnhancedReferenceDetectorV37;
  private lawsDataPath = '/home/coffee/projects/LawFinder/laws_data';
  private sampleSize = 100; // サンプリングサイズ（全件は時間がかかるため）
  private fullAnalysis = false; // フル分析モード
  
  constructor(options: { sampleSize?: number; fullAnalysis?: boolean } = {}) {
    this.detectorV41 = new EnhancedReferenceDetectorV41({ enableCache: true });
    this.detectorV37 = new EnhancedReferenceDetectorV37();
    this.sampleSize = options.sampleSize || 100;
    this.fullAnalysis = options.fullAnalysis || false;
  }
  
  /**
   * 全法令の検証を実行
   */
  async validateAllLaws(): Promise<void> {
    console.log('='.repeat(80));
    console.log('📚 全法令データ検証レポート');
    console.log('='.repeat(80));
    console.log(`実行日時: ${new Date().toISOString()}`);
    console.log(`検証モード: ${this.fullAnalysis ? '全件分析' : `サンプリング（${this.sampleSize}件）`}`);
    console.log();
    
    // 法令ディレクトリの取得
    const lawDirs = this.getLawDirectories();
    console.log(`総法令数: ${lawDirs.length}件`);
    
    // サンプリング
    const targetDirs = this.fullAnalysis 
      ? lawDirs 
      : this.sampleLaws(lawDirs, this.sampleSize);
    
    console.log(`検証対象: ${targetDirs.length}件`);
    console.log();
    
    const statistics: LawStatistics[] = [];
    const startTime = Date.now();
    
    // プログレスバー用の変数
    let processed = 0;
    const progressInterval = Math.ceil(targetDirs.length / 20);
    
    console.log('検証開始...');
    console.log('[' + ' '.repeat(20) + ']');
    process.stdout.write('\r[');
    
    for (const dir of targetDirs) {
      const stat = await this.validateSingleLaw(dir);
      if (stat) {
        statistics.push(stat);
      }
      
      processed++;
      if (processed % progressInterval === 0 || processed === targetDirs.length) {
        const progress = Math.floor((processed / targetDirs.length) * 20);
        process.stdout.write('\r[' + '='.repeat(progress) + ' '.repeat(20 - progress) + ']');
      }
    }
    
    console.log('\n');
    const totalTime = Date.now() - startTime;
    
    // 結果の集計と表示
    this.displayResults(statistics, totalTime);
    
    // カテゴリ別分析
    this.analyzeByCategory(statistics);
    
    // 特筆すべき改善事例
    this.highlightImprovements(statistics);
    
    // キャッシュ統計
    this.displayCacheStatistics();
  }
  
  /**
   * 法令ディレクトリの取得
   */
  private getLawDirectories(): string[] {
    const entries = readdirSync(this.lawsDataPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => entry.name)
      .filter(name => name !== 'sample' && name !== 'all_law_list.csv');
  }
  
  /**
   * ランダムサンプリング
   */
  private sampleLaws(laws: string[], size: number): string[] {
    const shuffled = [...laws].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  }
  
  /**
   * 単一法令の検証
   */
  private async validateSingleLaw(dirName: string): Promise<LawStatistics | null> {
    const lawPath = join(this.lawsDataPath, dirName);
    const xmlFiles = readdirSync(lawPath).filter(f => f.endsWith('.xml'));
    
    if (xmlFiles.length === 0) return null;
    
    const xmlPath = join(lawPath, xmlFiles[0]);
    
    try {
      const xmlContent = readFileSync(xmlPath, 'utf-8');
      const dom = new JSDOM(xmlContent, { contentType: 'text/xml' });
      const document = dom.window.document;
      
      // 法令名の取得
      const lawNameElement = document.querySelector('LawName');
      const lawName = lawNameElement?.textContent || dirName;
      
      // 条文の取得（最大10条まで）
      const articles = Array.from(document.querySelectorAll('Article')).slice(0, 10);
      
      let totalV37 = 0;
      let totalV41 = 0;
      let abbreviationExpanded = 0;
      let deletedArticles = 0;
      let nestedReferences = 0;
      
      const startTime = Date.now();
      
      for (const article of articles) {
        const articleContent = article.textContent || '';
        const articleNum = article.getAttribute('Num') || '';
        
        // v3.7で検出
        const refsV37 = this.detectorV37.detectReferences(articleContent);
        totalV37 += refsV37.length;
        
        // v4.1で検出
        const refsV41 = this.detectorV41.detectReferences(articleContent, articleNum);
        totalV41 += refsV41.length;
        
        // 特殊検出のカウント
        refsV41.forEach(ref => {
          if (ref.metadata?.expandedFrom) abbreviationExpanded++;
          if (ref.metadata?.isDeleted || ref.type === 'deleted' || ref.type === 'deleted_range') deletedArticles++;
          if (ref.type === 'nested_range' || ref.metadata?.nestedLevel) nestedReferences++;
        });
      }
      
      const processingTime = Date.now() - startTime;
      
      // キャッシュヒット数の取得
      const cacheStats = this.detectorV41.getCacheStatistics();
      
      return {
        lawId: dirName.split('_')[0],
        lawName,
        totalArticles: articles.length,
        v37References: totalV37,
        v41References: totalV41,
        improvement: totalV41 - totalV37,
        abbreviationExpanded,
        deletedArticles,
        nestedReferences,
        processingTimeMs: processingTime,
        cacheHits: cacheStats.totalHits
      };
      
    } catch (error) {
      // エラーは無視して次へ
      return null;
    }
  }
  
  /**
   * 結果の表示
   */
  private displayResults(statistics: LawStatistics[], totalTime: number): void {
    const validStats = statistics.filter(s => s !== null);
    
    if (validStats.length === 0) {
      console.log('有効なデータがありませんでした。');
      return;
    }
    
    // 総合統計
    const totalV37 = validStats.reduce((sum, s) => sum + s.v37References, 0);
    const totalV41 = validStats.reduce((sum, s) => sum + s.v41References, 0);
    const totalImprovement = totalV41 - totalV37;
    const improvementRate = totalV37 > 0 ? ((totalV41 / totalV37 - 1) * 100) : 0;
    
    const totalAbbreviations = validStats.reduce((sum, s) => sum + s.abbreviationExpanded, 0);
    const totalDeleted = validStats.reduce((sum, s) => sum + s.deletedArticles, 0);
    const totalNested = validStats.reduce((sum, s) => sum + s.nestedReferences, 0);
    
    console.log('## 総合統計');
    console.log('─'.repeat(60));
    console.log(`検証法令数: ${validStats.length}件`);
    console.log(`検証条文数: ${validStats.reduce((sum, s) => sum + s.totalArticles, 0)}条`);
    console.log();
    
    console.log('### 検出数比較');
    console.log(`v3.7.0: ${totalV37.toLocaleString()}件`);
    console.log(`v4.1.0: ${totalV41.toLocaleString()}件`);
    console.log(`改善数: ${totalImprovement >= 0 ? '+' : ''}${totalImprovement.toLocaleString()}件`);
    console.log(`改善率: ${improvementRate >= 0 ? '+' : ''}${improvementRate.toFixed(1)}%`);
    console.log();
    
    console.log('### v4.1.0新機能の貢献');
    console.log(`略称展開: ${totalAbbreviations.toLocaleString()}件`);
    console.log(`削除条文: ${totalDeleted.toLocaleString()}件`);
    console.log(`入れ子参照: ${totalNested.toLocaleString()}件`);
    console.log();
    
    console.log('### パフォーマンス');
    console.log(`総処理時間: ${(totalTime / 1000).toFixed(1)}秒`);
    console.log(`平均処理時間: ${(totalTime / validStats.length).toFixed(0)}ms/法令`);
    
    // 推定値の計算（サンプリングの場合）
    if (!this.fullAnalysis) {
      const estimatedTotal = Math.round(totalV41 * (10586 / this.sampleSize));
      console.log();
      console.log('### 全件推定値');
      console.log(`推定総参照数: ${estimatedTotal.toLocaleString()}件`);
      console.log(`推定改善数: ${Math.round(totalImprovement * (10586 / this.sampleSize)).toLocaleString()}件`);
    }
  }
  
  /**
   * カテゴリ別分析
   */
  private analyzeByCategory(statistics: LawStatistics[]): void {
    console.log('\n## カテゴリ別分析');
    console.log('─'.repeat(60));
    
    // 法令名からカテゴリを推定
    const categories = new Map<string, LawStatistics[]>();
    
    statistics.forEach(stat => {
      let category = 'その他';
      
      if (stat.lawName.includes('刑') || stat.lawName.includes('罰')) {
        category = '刑事法';
      } else if (stat.lawName.includes('民') && !stat.lawName.includes('民主')) {
        category = '民事法';
      } else if (stat.lawName.includes('商') || stat.lawName.includes('会社')) {
        category = '商事法';
      } else if (stat.lawName.includes('労働') || stat.lawName.includes('雇用')) {
        category = '労働法';
      } else if (stat.lawName.includes('税') || stat.lawName.includes('関税')) {
        category = '税法';
      } else if (stat.lawName.includes('省令') || stat.lawName.includes('規則')) {
        category = '省令・規則';
      } else if (stat.lawName.includes('条例')) {
        category = '条例';
      }
      
      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(stat);
    });
    
    // カテゴリ別統計
    const categoryStats: CategoryStatistics[] = [];
    
    categories.forEach((laws, category) => {
      const totalV37 = laws.reduce((sum, l) => sum + l.v37References, 0);
      const totalV41 = laws.reduce((sum, l) => sum + l.v41References, 0);
      const totalTime = laws.reduce((sum, l) => sum + l.processingTimeMs, 0);
      
      categoryStats.push({
        category,
        lawCount: laws.length,
        totalArticles: laws.reduce((sum, l) => sum + l.totalArticles, 0),
        totalV37References: totalV37,
        totalV41References: totalV41,
        averageImprovement: totalV37 > 0 ? ((totalV41 / totalV37 - 1) * 100) : 0,
        processingTimeMs: totalTime
      });
    });
    
    // ソートして表示
    categoryStats.sort((a, b) => b.averageImprovement - a.averageImprovement);
    
    console.log('| カテゴリ | 法令数 | v3.7 | v4.1 | 改善率 |');
    console.log('|----------|--------|------|------|--------|');
    
    categoryStats.forEach(cat => {
      console.log(
        `| ${cat.category} | ${cat.lawCount}件 | ${cat.totalV37References}件 | ${cat.totalV41References}件 | ${cat.averageImprovement >= 0 ? '+' : ''}${cat.averageImprovement.toFixed(1)}% |`
      );
    });
  }
  
  /**
   * 特筆すべき改善事例
   */
  private highlightImprovements(statistics: LawStatistics[]): void {
    console.log('\n## 特筆すべき改善事例');
    console.log('─'.repeat(60));
    
    // 改善率トップ5
    const topImproved = [...statistics]
      .filter(s => s.v37References > 0)
      .sort((a, b) => (b.improvement / b.v37References) - (a.improvement / a.v37References))
      .slice(0, 5);
    
    console.log('### 改善率トップ5');
    topImproved.forEach((law, index) => {
      const rate = ((law.improvement / law.v37References) * 100).toFixed(1);
      console.log(`${index + 1}. ${law.lawName}`);
      console.log(`   ${law.v37References} → ${law.v41References} (+${rate}%)`);
    });
    
    // 略称展開が多い法令
    const abbreviationTop = [...statistics]
      .sort((a, b) => b.abbreviationExpanded - a.abbreviationExpanded)
      .slice(0, 3);
    
    if (abbreviationTop[0]?.abbreviationExpanded > 0) {
      console.log('\n### 略称展開が効果的だった法令');
      abbreviationTop.forEach(law => {
        if (law.abbreviationExpanded > 0) {
          console.log(`- ${law.lawName}: ${law.abbreviationExpanded}件`);
        }
      });
    }
    
    // 削除条文を含む法令
    const deletedLaws = statistics.filter(s => s.deletedArticles > 0);
    if (deletedLaws.length > 0) {
      console.log('\n### 削除条文を検出した法令');
      deletedLaws.slice(0, 5).forEach(law => {
        console.log(`- ${law.lawName}: ${law.deletedArticles}件`);
      });
    }
  }
  
  /**
   * キャッシュ統計の表示
   */
  private displayCacheStatistics(): void {
    const stats = this.detectorV41.getCacheStatistics();
    
    console.log('\n## キャッシュ統計');
    console.log('─'.repeat(60));
    console.log(`ヒット数: ${stats.totalHits}`);
    console.log(`ミス数: ${stats.totalMisses}`);
    console.log(`ヒット率: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`キャッシュサイズ: ${stats.cacheSize}/${stats.maxSize}`);
    
    if (stats.hitRate > 0.3) {
      console.log('✅ キャッシュが効果的に機能しています');
    } else if (stats.hitRate > 0.1) {
      console.log('⚠️ キャッシュ効果は限定的です');
    } else {
      console.log('❌ キャッシュがほとんど機能していません');
    }
  }
}

// メイン実行
async function main() {
  const args = process.argv.slice(2);
  const fullAnalysis = args.includes('--full');
  const sampleSize = fullAnalysis ? undefined : 100;
  
  console.log('検証モード選択:');
  console.log('  --full: 全件分析（時間がかかります）');
  console.log('  デフォルト: 100件サンプリング');
  console.log();
  
  const validator = new AllLawsValidator({ 
    sampleSize, 
    fullAnalysis 
  });
  
  await validator.validateAllLaws();
}

main().catch(console.error);