/**
 * 法令略称辞書
 * 日本の法令でよく使用される略称と正式名称のマッピング
 */

export interface AbbreviationEntry {
  abbreviation: string;      // 略称
  fullName: string;          // 正式名称
  lawNumber?: string;        // 法令番号（あれば）
  category: 'procedure' | 'commercial' | 'criminal' | 'civil' | 'administrative' | 'special';
  commonArticles?: string[]; // よく参照される条文
  aliases?: string[];        // 他の略称
}

export class AbbreviationDictionary {
  private static instance: AbbreviationDictionary;
  private dictionary: Map<string, AbbreviationEntry>;
  private regexPatterns: Map<string, RegExp>;
  
  private constructor() {
    this.dictionary = new Map();
    this.regexPatterns = new Map();
    this.initializeDictionary();
  }
  
  static getInstance(): AbbreviationDictionary {
    if (!AbbreviationDictionary.instance) {
      AbbreviationDictionary.instance = new AbbreviationDictionary();
    }
    return AbbreviationDictionary.instance;
  }
  
  /**
   * 辞書の初期化
   */
  private initializeDictionary(): void {
    const entries: AbbreviationEntry[] = [
      // 訴訟法関連
      {
        abbreviation: '民訴',
        fullName: '民事訴訟法',
        lawNumber: '平成八年法律第百九号',
        category: 'procedure',
        commonArticles: ['第二百四十八条', '第百条', '第百十七条'],
        aliases: ['民訴法', '民事訴訟']
      },
      {
        abbreviation: '刑訴',
        fullName: '刑事訴訟法',
        lawNumber: '昭和二十三年法律第百三十一号',
        category: 'procedure',
        commonArticles: ['第三百条', '第二百条'],
        aliases: ['刑訴法', '刑事訴訟']
      },
      {
        abbreviation: '民執',
        fullName: '民事執行法',
        lawNumber: '昭和五十四年法律第四号',
        category: 'procedure',
        commonArticles: ['第二十条', '第二十二条'],
        aliases: ['民執法', '民事執行']
      },
      {
        abbreviation: '民保',
        fullName: '民事保全法',
        lawNumber: '平成元年法律第九十一号',
        category: 'procedure',
        commonArticles: ['第二十条', '第二十三条'],
        aliases: ['民保法', '民事保全']
      },
      
      // 商事法関連
      {
        abbreviation: '金商法',
        fullName: '金融商品取引法',
        lawNumber: '昭和二十三年法律第二十五号',
        category: 'commercial',
        commonArticles: ['第二条', '第百九十七条'],
        aliases: ['金融商品取引', '証取法']
      },
      {
        abbreviation: '独禁法',
        fullName: '私的独占の禁止及び公正取引の確保に関する法律',
        lawNumber: '昭和二十二年法律第五十四号',
        category: 'commercial',
        commonArticles: ['第三条', '第十九条'],
        aliases: ['独占禁止法', '反トラスト法']
      },
      {
        abbreviation: '下請法',
        fullName: '下請代金支払遅延等防止法',
        lawNumber: '昭和三十一年法律第百二十号',
        category: 'commercial',
        commonArticles: ['第三条', '第四条'],
        aliases: ['下請代金法']
      },
      
      // 倒産法関連
      {
        abbreviation: '破産法',
        fullName: '破産法',
        lawNumber: '平成十六年法律第七十五号',
        category: 'commercial',
        commonArticles: ['第二条', '第百六十条'],
        aliases: ['破産']
      },
      {
        abbreviation: '民再法',
        fullName: '民事再生法',
        lawNumber: '平成十一年法律第二百二十五号',
        category: 'commercial',
        commonArticles: ['第二条', '第百七十四条'],
        aliases: ['民事再生', '民再']
      },
      {
        abbreviation: '会更法',
        fullName: '会社更生法',
        lawNumber: '平成十四年法律第百五十四号',
        category: 'commercial',
        commonArticles: ['第二条', '第二百条'],
        aliases: ['会社更生', '会更']
      },
      
      // 労働法関連
      {
        abbreviation: '労基法',
        fullName: '労働基準法',
        lawNumber: '昭和二十二年法律第四十九号',
        category: 'administrative',
        commonArticles: ['第三十二条', '第三十六条'],
        aliases: ['労働基準', '労基']
      },
      {
        abbreviation: '労契法',
        fullName: '労働契約法',
        lawNumber: '平成十九年法律第百二十八号',
        category: 'administrative',
        commonArticles: ['第十六条', '第十七条'],
        aliases: ['労働契約']
      },
      {
        abbreviation: '労組法',
        fullName: '労働組合法',
        lawNumber: '昭和二十四年法律第百七十四号',
        category: 'administrative',
        commonArticles: ['第七条', '第十四条'],
        aliases: ['労働組合']
      },
      
      // 知的財産法関連
      {
        abbreviation: '特許法',
        fullName: '特許法',
        lawNumber: '昭和三十四年法律第百二十一号',
        category: 'special',
        commonArticles: ['第百五条', '第百五条の三'],
        aliases: ['特許']
      },
      {
        abbreviation: '著作権法',
        fullName: '著作権法',
        lawNumber: '昭和四十五年法律第四十八号',
        category: 'special',
        commonArticles: ['第二条', '第百十四条'],
        aliases: ['著作権', '著作']
      },
      {
        abbreviation: '商標法',
        fullName: '商標法',
        lawNumber: '昭和三十四年法律第百二十七号',
        category: 'special',
        commonArticles: ['第二条', '第三十八条'],
        aliases: ['商標']
      },
      
      // 税法関連
      {
        abbreviation: '所得税法',
        fullName: '所得税法',
        lawNumber: '昭和四十年法律第三十三号',
        category: 'administrative',
        commonArticles: ['第二条', '第三十六条'],
        aliases: ['所得税', '所税']
      },
      {
        abbreviation: '法人税法',
        fullName: '法人税法',
        lawNumber: '昭和四十年法律第三十四号',
        category: 'administrative',
        commonArticles: ['第二条', '第二十二条'],
        aliases: ['法人税', '法税']
      },
      {
        abbreviation: '消費税法',
        fullName: '消費税法',
        lawNumber: '昭和六十三年法律第百八号',
        category: 'administrative',
        commonArticles: ['第二条', '第二十八条'],
        aliases: ['消費税', '消税']
      },
      
      // 行政法関連
      {
        abbreviation: '行政手続法',
        fullName: '行政手続法',
        lawNumber: '平成五年法律第八十八号',
        category: 'administrative',
        commonArticles: ['第二条', '第十二条'],
        aliases: ['行手法', '行政手続']
      },
      {
        abbreviation: '行政事件訴訟法',
        fullName: '行政事件訴訟法',
        lawNumber: '昭和三十七年法律第百三十九号',
        category: 'administrative',
        commonArticles: ['第三条', '第九条'],
        aliases: ['行訴法', '行訴']
      },
      {
        abbreviation: '国家賠償法',
        fullName: '国家賠償法',
        lawNumber: '昭和二十二年法律第百二十五号',
        category: 'administrative',
        commonArticles: ['第一条', '第二条'],
        aliases: ['国賠法', '国賠']
      },
      
      // 特別措置法関連
      {
        abbreviation: '特措法',
        fullName: '特別措置法',
        category: 'special',
        aliases: ['特別措置']
      },
      {
        abbreviation: '暫定措置法',
        fullName: '暫定措置法',
        category: 'special',
        aliases: ['暫定措置']
      },
      
      // その他頻出法令
      {
        abbreviation: '建基法',
        fullName: '建築基準法',
        lawNumber: '昭和二十五年法律第二百一号',
        category: 'administrative',
        commonArticles: ['第二条', '第六条'],
        aliases: ['建築基準']
      },
      {
        abbreviation: '都計法',
        fullName: '都市計画法',
        lawNumber: '昭和四十三年法律第百号',
        category: 'administrative',
        commonArticles: ['第四条', '第二十九条'],
        aliases: ['都市計画']
      },
      {
        abbreviation: '景表法',
        fullName: '不当景品類及び不当表示防止法',
        lawNumber: '昭和三十七年法律第百三十四号',
        category: 'commercial',
        commonArticles: ['第四条', '第五条'],
        aliases: ['景品表示法', '不当表示防止法']
      },
      {
        abbreviation: '個情法',
        fullName: '個人情報の保護に関する法律',
        lawNumber: '平成十五年法律第五十七号',
        category: 'administrative',
        commonArticles: ['第二条', '第二十三条'],
        aliases: ['個人情報保護法', '個人情報法']
      },
      
      // 追加分（2025年8月18日）
      // 環境法関連
      {
        abbreviation: '環境基本法',
        fullName: '環境基本法',
        lawNumber: '平成五年法律第九十一号',
        category: 'administrative',
        commonArticles: ['第二条', '第十四条'],
        aliases: ['環境法']
      },
      {
        abbreviation: '廃掃法',
        fullName: '廃棄物の処理及び清掃に関する法律',
        lawNumber: '昭和四十五年法律第百三十七号',
        category: 'administrative',
        commonArticles: ['第二条', '第十四条'],
        aliases: ['廃棄物処理法', '廃棄物法']
      },
      {
        abbreviation: '大防法',
        fullName: '大気汚染防止法',
        lawNumber: '昭和四十三年法律第九十七号',
        category: 'administrative',
        commonArticles: ['第二条', '第十八条'],
        aliases: ['大気汚染法']
      },
      {
        abbreviation: '水濁法',
        fullName: '水質汚濁防止法',
        lawNumber: '昭和四十五年法律第百三十八号',
        category: 'administrative',
        commonArticles: ['第二条', '第十二条'],
        aliases: ['水質汚濁法']
      },
      
      // 福祉法関連
      {
        abbreviation: '生活保護法',
        fullName: '生活保護法',
        lawNumber: '昭和二十五年法律第百四十四号',
        category: 'administrative',
        commonArticles: ['第一条', '第七条'],
        aliases: ['生保法', '生活保護']
      },
      {
        abbreviation: '児福法',
        fullName: '児童福祉法',
        lawNumber: '昭和二十二年法律第百六十四号',
        category: 'administrative',
        commonArticles: ['第一条', '第六条'],
        aliases: ['児童福祉', '児童法']
      },
      {
        abbreviation: '介護保険法',
        fullName: '介護保険法',
        lawNumber: '平成九年法律第百二十三号',
        category: 'administrative',
        commonArticles: ['第一条', '第七条'],
        aliases: ['介護法', '介護保険']
      },
      {
        abbreviation: '障害者総合支援法',
        fullName: '障害者の日常生活及び社会生活を総合的に支援するための法律',
        lawNumber: '平成十七年法律第百二十三号',
        category: 'administrative',
        commonArticles: ['第一条', '第四条'],
        aliases: ['障害者支援法', '総合支援法']
      },
      
      // 教育法関連
      {
        abbreviation: '教基法',
        fullName: '教育基本法',
        lawNumber: '平成十八年法律第百二十号',
        category: 'administrative',
        commonArticles: ['第一条', '第二条'],
        aliases: ['教育基本', '教育法']
      },
      {
        abbreviation: '学教法',
        fullName: '学校教育法',
        lawNumber: '昭和二十二年法律第二十六号',
        category: 'administrative',
        commonArticles: ['第一条', '第二十九条'],
        aliases: ['学校教育', '学校法']
      },
      
      // 医療法関連
      {
        abbreviation: '医療法',
        fullName: '医療法',
        lawNumber: '昭和二十三年法律第二百五号',
        category: 'administrative',
        commonArticles: ['第一条', '第七条'],
        aliases: ['医療']
      },
      {
        abbreviation: '薬機法',
        fullName: '医薬品、医療機器等の品質、有効性及び安全性の確保等に関する法律',
        lawNumber: '昭和三十五年法律第百四十五号',
        category: 'administrative',
        commonArticles: ['第二条', '第十四条'],
        aliases: ['薬事法', '医薬品医療機器法', '薬機']
      },
      {
        abbreviation: '健保法',
        fullName: '健康保険法',
        lawNumber: '大正十一年法律第七十号',
        category: 'administrative',
        commonArticles: ['第一条', '第六十三条'],
        aliases: ['健康保険', '健保']
      },
      
      // 金融法関連（追加）
      {
        abbreviation: '銀行法',
        fullName: '銀行法',
        lawNumber: '昭和五十六年法律第五十九号',
        category: 'commercial',
        commonArticles: ['第一条', '第四条'],
        aliases: ['銀行']
      },
      {
        abbreviation: '保険業法',
        fullName: '保険業法',
        lawNumber: '平成七年法律第百五号',
        category: 'commercial',
        commonArticles: ['第一条', '第三条'],
        aliases: ['保険業', '保険法']
      },
      {
        abbreviation: '資金決済法',
        fullName: '資金決済に関する法律',
        lawNumber: '平成二十一年法律第五十九号',
        category: 'commercial',
        commonArticles: ['第二条', '第三十七条'],
        aliases: ['資金決済', '決済法']
      },
      
      // 国際関係法
      {
        abbreviation: '入管法',
        fullName: '出入国管理及び難民認定法',
        lawNumber: '昭和二十六年政令第三百十九号',
        category: 'administrative',
        commonArticles: ['第二条', '第二十二条'],
        aliases: ['出入国管理法', '入管難民法', '入管']
      },
      {
        abbreviation: '外為法',
        fullName: '外国為替及び外国貿易法',
        lawNumber: '昭和二十四年法律第二百二十八号',
        category: 'commercial',
        commonArticles: ['第一条', '第二十五条'],
        aliases: ['外国為替法', '外為']
      },
      
      // その他重要法令
      {
        abbreviation: '公選法',
        fullName: '公職選挙法',
        lawNumber: '昭和二十五年法律第百号',
        category: 'administrative',
        commonArticles: ['第一条', '第九条'],
        aliases: ['公職選挙', '選挙法']
      },
      {
        abbreviation: '地自法',
        fullName: '地方自治法',
        lawNumber: '昭和二十二年法律第六十七号',
        category: 'administrative',
        commonArticles: ['第一条', '第二条'],
        aliases: ['地方自治', '自治法']
      },
      {
        abbreviation: '国公法',
        fullName: '国家公務員法',
        lawNumber: '昭和二十二年法律第百二十号',
        category: 'administrative',
        commonArticles: ['第一条', '第七十五条'],
        aliases: ['国家公務員', '公務員法']
      },
      {
        abbreviation: '地公法',
        fullName: '地方公務員法',
        lawNumber: '昭和二十五年法律第二百六十一号',
        category: 'administrative',
        commonArticles: ['第一条', '第二十九条'],
        aliases: ['地方公務員']
      },
      {
        abbreviation: '情公開法',
        fullName: '行政機関の保有する情報の公開に関する法律',
        lawNumber: '平成十一年法律第四十二号',
        category: 'administrative',
        commonArticles: ['第一条', '第五条'],
        aliases: ['情報公開法', '情報公開', '行政情報公開法']
      },
      {
        abbreviation: '公文管理法',
        fullName: '公文書等の管理に関する法律',
        lawNumber: '平成二十一年法律第六十六号',
        category: 'administrative',
        commonArticles: ['第一条', '第四条'],
        aliases: ['公文書管理法', '文書管理法']
      },
      
      // 消費者法関連
      {
        abbreviation: '消契法',
        fullName: '消費者契約法',
        lawNumber: '平成十二年法律第六十一号',
        category: 'civil',
        commonArticles: ['第一条', '第四条'],
        aliases: ['消費者契約', '消費者法']
      },
      {
        abbreviation: '特商法',
        fullName: '特定商取引に関する法律',
        lawNumber: '昭和五十一年法律第五十七号',
        category: 'commercial',
        commonArticles: ['第一条', '第九条'],
        aliases: ['特定商取引法', '訪問販売法']
      },
      {
        abbreviation: '割販法',
        fullName: '割賦販売法',
        lawNumber: '昭和三十六年法律第百五十九号',
        category: 'commercial',
        commonArticles: ['第一条', '第三十条'],
        aliases: ['割賦販売', 'クレジット法']
      },
      
      // 不動産関連法
      {
        abbreviation: '宅建業法',
        fullName: '宅地建物取引業法',
        lawNumber: '昭和二十七年法律第百七十六号',
        category: 'commercial',
        commonArticles: ['第一条', '第三十五条'],
        aliases: ['宅建法', '宅地建物取引法']
      },
      {
        abbreviation: '借地借家法',
        fullName: '借地借家法',
        lawNumber: '平成三年法律第九十号',
        category: 'civil',
        commonArticles: ['第一条', '第二十八条'],
        aliases: ['借地借家', '借家法']
      },
      {
        abbreviation: '区分所有法',
        fullName: '建物の区分所有等に関する法律',
        lawNumber: '昭和三十七年法律第六十九号',
        category: 'civil',
        commonArticles: ['第一条', '第三十条'],
        aliases: ['マンション法', '区分所有']
      },
      {
        abbreviation: '不登法',
        fullName: '不動産登記法',
        lawNumber: '平成十六年法律第百二十三号',
        category: 'procedure',
        commonArticles: ['第一条', '第十六条'],
        aliases: ['不動産登記', '登記法']
      }
    ];
    
    // 辞書に登録
    entries.forEach(entry => {
      // 主要な略称で登録
      this.dictionary.set(entry.abbreviation, entry);
      
      // エイリアスも登録
      if (entry.aliases) {
        entry.aliases.forEach(alias => {
          this.dictionary.set(alias, entry);
        });
      }
      
      // 正規表現パターンを作成
      const patterns = [entry.abbreviation, ...(entry.aliases || [])];
      patterns.forEach(pattern => {
        // 法令名の後に条文番号が続くパターン
        const regex = new RegExp(
          `(${this.escapeRegex(pattern)})(第[一二三四五六七八九十百千万\\d]+条(?:の[一二三四五六七八九十\\d]+)?)?`,
          'g'
        );
        this.regexPatterns.set(pattern, regex);
      });
    });
  }
  
  /**
   * 正規表現エスケープ
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * 略称を検索
   */
  lookup(abbreviation: string): AbbreviationEntry | undefined {
    return this.dictionary.get(abbreviation);
  }
  
  /**
   * テキストから略称を検出して展開
   */
  expandAbbreviations(text: string): Array<{
    original: string;
    expanded: string;
    position: { start: number; end: number };
    entry: AbbreviationEntry;
    article?: string;
  }> {
    const results: Array<{
      original: string;
      expanded: string;
      position: { start: number; end: number };
      entry: AbbreviationEntry;
      article?: string;
    }> = [];
    
    // 各略称パターンでテキストを検索
    this.regexPatterns.forEach((regex, pattern) => {
      const entry = this.dictionary.get(pattern);
      if (!entry) return;
      
      let match;
      regex.lastIndex = 0; // リセット
      
      while ((match = regex.exec(text)) !== null) {
        const original = match[0];
        const abbreviation = match[1];
        const article = match[2]; // 条文番号（あれば）
        
        results.push({
          original,
          expanded: entry.fullName + (article || ''),
          position: {
            start: match.index,
            end: match.index + original.length
          },
          entry,
          article
        });
      }
    });
    
    // 重複を除去（同じ位置の検出を除外）
    const uniqueResults = results.filter((result, index, self) =>
      index === self.findIndex(r =>
        r.position.start === result.position.start &&
        r.position.end === result.position.end
      )
    );
    
    // 位置でソート
    return uniqueResults.sort((a, b) => a.position.start - b.position.start);
  }
  
  /**
   * 全略称のリストを取得
   */
  getAllAbbreviations(): string[] {
    return Array.from(new Set(
      Array.from(this.dictionary.values()).map(e => e.abbreviation)
    ));
  }
  
  /**
   * カテゴリ別に略称を取得
   */
  getAbbreviationsByCategory(category: AbbreviationEntry['category']): AbbreviationEntry[] {
    const uniqueEntries = new Map<string, AbbreviationEntry>();
    
    this.dictionary.forEach(entry => {
      if (entry.category === category) {
        uniqueEntries.set(entry.fullName, entry);
      }
    });
    
    return Array.from(uniqueEntries.values());
  }
  
  /**
   * 正式名称から略称を逆引き
   */
  getAbbreviationByFullName(fullName: string): string | undefined {
    for (const [abbr, entry] of this.dictionary.entries()) {
      if (entry.fullName === fullName && abbr === entry.abbreviation) {
        return abbr;
      }
    }
    return undefined;
  }
  
  /**
   * カスタム略称を追加
   */
  addCustomAbbreviation(entry: AbbreviationEntry): void {
    this.dictionary.set(entry.abbreviation, entry);
    
    // 正規表現パターンも追加
    const patterns = [entry.abbreviation, ...(entry.aliases || [])];
    patterns.forEach(pattern => {
      const regex = new RegExp(
        `(${this.escapeRegex(pattern)})(第[一二三四五六七八九十百千万\\d]+条(?:の[一二三四五六七八九十\\d]+)?)?`,
        'g'
      );
      this.regexPatterns.set(pattern, regex);
    });
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics(): {
    totalEntries: number;
    byCategory: Record<string, number>;
    withLawNumbers: number;
    withAliases: number;
  } {
    const uniqueEntries = new Map<string, AbbreviationEntry>();
    this.dictionary.forEach(entry => {
      uniqueEntries.set(entry.fullName, entry);
    });
    
    const byCategory: Record<string, number> = {};
    let withLawNumbers = 0;
    let withAliases = 0;
    
    uniqueEntries.forEach(entry => {
      byCategory[entry.category] = (byCategory[entry.category] || 0) + 1;
      if (entry.lawNumber) withLawNumbers++;
      if (entry.aliases && entry.aliases.length > 0) withAliases++;
    });
    
    return {
      totalEntries: uniqueEntries.size,
      byCategory,
      withLawNumbers,
      withAliases
    };
  }
}

// エクスポート用のシングルトンインスタンス
export const abbreviationDictionary = AbbreviationDictionary.getInstance();