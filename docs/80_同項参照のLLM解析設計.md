# 「同項」参照のLLM解析設計書

## 概要

「同項」は文脈に依存する相対参照であり、直前の文章で言及された項を指します。本設計書では、LLM（Ollama/Mistral）を使用して「同項」の参照先を自動的に特定する機能の実装方針を示します。

## 課題

### 現状の問題点
1. 「同項」は単純なパターンマッチングでは参照先を特定できない
2. 文脈理解が必要（直前の文章で言及された項を追跡）
3. 複数の項が言及されている場合の優先順位判定

### 例
```
第十七条第二項の規定により譲受人が責任を負う場合には、譲渡人の責任は、同項の広告があった日後二年以内に...
```
→ 「同項」は「第十七条第二項」を指す

## 実装設計

### 1. LLMプロンプト設計

```javascript
const prompt = `
以下の法令条文において、「同項」が指している項を特定してください。

【条文】
${contextText}

【質問】
上記の文章内の「同項」は、どの条・項を指していますか？
条番号と項番号を数字で答えてください。

【回答形式】
条番号: [数字]
項番号: [数字]
`;
```

### 2. 文脈抽出アルゴリズム

```javascript
function extractContext(article, paragraphIndex, itemIndex = null) {
  // 1. 現在の項の全文
  let context = article.paragraphs[paragraphIndex].content;
  
  // 2. 前の項があれば追加（最大2項前まで）
  for (let i = Math.max(0, paragraphIndex - 2); i < paragraphIndex; i++) {
    context = article.paragraphs[i].content + '\n' + context;
  }
  
  // 3. 条文のタイトルを追加
  context = `第${article.articleNum}条 ${article.articleTitle || ''}\n` + context;
  
  return context;
}
```

### 3. LLM解析フロー

```javascript
async function resolveSameParagraphReference(text, article, paragraphNum) {
  // 1. 文脈を抽出
  const context = extractContext(article, paragraphNum - 1);
  
  // 2. LLMに問い合わせ
  const response = await ollamaClient.analyze({
    model: 'mistral',
    prompt: buildPrompt(context),
    temperature: 0.1  // 低温度で確実性を重視
  });
  
  // 3. 結果をパース
  const result = parseLLMResponse(response);
  
  // 4. 信頼度チェック
  if (result.confidence > 0.8) {
    return {
      articleNum: result.articleNum,
      paragraphNum: result.paragraphNum,
      confidence: result.confidence
    };
  }
  
  return null;  // 信頼度が低い場合はリンク化しない
}
```

### 4. 参照パターンの拡張

```javascript
// 検出パターンに「同項」を追加
{ 
  regex: /同項/g, 
  type: 'SAME_PARAGRAPH_REFERENCE',
  requiresLLM: true  // LLM解析が必要なフラグ
}
```

### 5. レンダリング時の処理

```javascript
if (ref.type === 'SAME_PARAGRAPH_REFERENCE') {
  if (ref.requiresLLM && !ref.resolvedTarget) {
    // LLM解析を実行（キャッシュがあれば使用）
    const target = await resolveSameParagraphReference(
      ref.sourceText, 
      currentArticle, 
      currentParagraphNum
    );
    
    if (target) {
      replacement = `<a href="#art${target.articleNum}-para${target.paragraphNum}" 
                        class="ref-link internal-ref" 
                        data-confidence="${target.confidence}">
                        ${ref.sourceText}
                     </a>`;
    } else {
      // 解析失敗時は緑色表示
      replacement = `<span class="ref-link relative-ref">${ref.sourceText}</span>`;
    }
  }
}
```

## キャッシュ設計

### キャッシュキー
```javascript
const cacheKey = `${lawId}_${articleNum}_${paragraphNum}_${hashOfContext}`;
```

### キャッシュ構造
```json
{
  "132AC0000000048_17_2_abc123": {
    "targetArticle": 17,
    "targetParagraph": 2,
    "confidence": 0.95,
    "timestamp": "2025-08-04T10:00:00Z"
  }
}
```

## エラーハンドリング

1. **LLMタイムアウト**: 3秒でタイムアウト、緑色表示にフォールバック
2. **解析失敗**: 信頼度が低い場合は緑色表示
3. **キャッシュミス**: LLM解析を実行し、結果をキャッシュ

## パフォーマンス考慮

1. **バッチ処理**: 複数の「同項」を一度にLLMに送信
2. **並列処理**: 条文ごとに並列でLLM解析
3. **段階的処理**: 
   - Phase 1: パターンマッチングのみ（高速）
   - Phase 2: LLM解析（オプション）

## 期待される成果

1. **精度向上**: 95%以上の正確な参照先特定
2. **ユーザビリティ**: 「同項」もクリック可能に
3. **透明性**: 信頼度スコアをツールチップで表示

## 実装優先度

1. **高**: 基本的なLLM統合とプロンプト設計
2. **中**: キャッシュシステム
3. **低**: バッチ処理とパフォーマンス最適化

## 今後の拡張

- 「同号」「同条」の文脈解析
- 「前各号」などの複数参照の解析
- 参照グラフの自動生成