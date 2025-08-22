/**
 * 参照検出の拡張型定義
 * 詳細な位置情報を含む
 */

/**
 * 参照タイプ
 */
export type ReferenceType = 
  | 'external'     // 外部法令参照
  | 'internal'     // 内部参照
  | 'relative'     // 相対参照（前条、次項など）
  | 'structural'   // 構造参照（章、節など）
  | 'range'        // 範囲参照
  | 'multiple'     // 複数参照
  | 'application'  // 準用・読替え
  | 'contextual'   // 文脈依存
  | 'conditional'  // 条件付き参照
  | 'defined';     // 定義参照

/**
 * 検出方法
 */
export type DetectionMethod = 
  | 'pattern'      // パターンマッチング
  | 'dictionary'   // 辞書ベース
  | 'context'      // 文脈解析
  | 'llm'          // LLM推論
  | 'definition'   // 定義追跡
  | 'lawNumber'    // 法令番号
  | 'relative';    // 相対解決

/**
 * 法令構造内の位置
 */
export interface StructuralPosition {
  lawId: string;
  lawName?: string;
  
  // 階層構造
  part?: string;           // 編
  chapter?: string;        // 章
  section?: string;        // 節
  subsection?: string;     // 款
  division?: string;       // 目
  
  // 条文構造
  articleNumber: string;   // 第X条（必須）
  articleTitle?: string;   // 条文見出し
  paragraphNumber?: number;// 第Y項
  itemNumber?: string;     // 第Z号
  subItemNumber?: string;  // イ、ロ、ハ等
  
  // 補足構造
  supplementaryProvision?: boolean; // 附則かどうか
  tableNumber?: string;    // 別表番号
}

/**
 * テキスト内の位置情報
 */
export interface TextPosition {
  text: string;           // マッチしたテキスト
  startPosition: number;  // 開始文字位置（0ベース）
  endPosition: number;    // 終了文字位置
  lineNumber?: number;    // 行番号（1ベース）
  columnNumber?: number;  // 列番号（1ベース）
}

/**
 * 範囲参照の情報
 */
export interface ReferenceRange {
  start: {
    articleNumber: string;
    paragraphNumber?: number;
    itemNumber?: string;
  };
  end: {
    articleNumber: string;
    paragraphNumber?: number;
    itemNumber?: string;
  };
  inclusive: boolean;  // 「まで」が含むかどうか
}

/**
 * 拡張参照情報（完全な位置情報付き）
 */
export interface EnhancedReference {
  // 一意識別子
  id: string;
  
  // === 参照元の情報 ===
  source: {
    position: TextPosition;           // テキスト位置
    structural: StructuralPosition;   // 構造的位置
    context?: string;                 // 周辺のコンテキスト（前後100文字）
  };
  
  // === 参照先の情報 ===
  target: {
    lawId: string;
    lawName: string;
    structural: Partial<StructuralPosition>;  // 参照先の構造的位置
    
    // 範囲参照の場合
    range?: ReferenceRange;
    
    // 複数参照の場合
    multiple?: Array<{
      lawId?: string;
      articleNumber: string;
      paragraphNumber?: number;
    }>;
    
    // 準用・読替えの場合
    application?: {
      type: 'junyo' | 'yomikae';
      originalText?: string;      // 元のテキスト
      replacementText?: string;   // 読替え後のテキスト
      conditions?: string;         // 適用条件
    };
  };
  
  // === メタデータ ===
  metadata: {
    type: ReferenceType;
    confidence: number;           // 0.0-1.0
    detectionMethod: DetectionMethod;
    detectedAt: Date;
    version: string;              // 検出エンジンのバージョン
    
    // 検証情報
    validation?: {
      isValid: boolean;
      validatedAt?: Date;
      validatedBy?: 'auto' | 'human' | 'llm';
      errors?: string[];
    };
    
    // LLM使用情報
    llm?: {
      model: string;
      prompt?: string;
      response?: string;
      processingTime?: number;
    };
  };
}

/**
 * 既存の後方互換用インターフェース
 */
export interface DetectedReference {
  type: ReferenceType;
  text: string;
  targetLaw?: string;
  targetLawId?: string;
  targetArticle?: string;
  targetParagraph?: number;
  articleNumber?: number;
  confidence: number;
  resolutionMethod: DetectionMethod;
  position?: number;
  
  // 範囲参照用
  rangeStart?: string;
  rangeEnd?: string;
  
  // 新フィールド（オプション）
  enhanced?: EnhancedReference;
}

/**
 * EnhancedReferenceをDetectedReferenceに変換
 */
export function toDetectedReference(enhanced: EnhancedReference): DetectedReference {
  return {
    type: enhanced.metadata.type,
    text: enhanced.source.position.text,
    targetLaw: enhanced.target.lawName,
    targetLawId: enhanced.target.lawId,
    targetArticle: enhanced.target.structural.articleNumber,
    targetParagraph: enhanced.target.structural.paragraphNumber,
    articleNumber: enhanced.source.structural.articleNumber ? 
      parseInt(enhanced.source.structural.articleNumber.replace(/[^0-9]/g, '')) : undefined,
    confidence: enhanced.metadata.confidence,
    resolutionMethod: enhanced.metadata.detectionMethod,
    position: enhanced.source.position.startPosition,
    enhanced: enhanced
  };
}

/**
 * 位置情報を含む参照検出結果
 */
export interface ReferenceDetectionResult {
  references: EnhancedReference[];
  statistics: {
    total: number;
    byType: Record<ReferenceType, number>;
    byConfidence: {
      high: number;      // >= 0.9
      medium: number;    // >= 0.7
      low: number;       // < 0.7
    };
    byMethod: Record<DetectionMethod, number>;
  };
  processingTime: number;
  errors?: Array<{
    position: number;
    message: string;
    type: string;
  }>;
}