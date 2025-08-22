# LawFinder - e-Gov風法令検索システム

## 🚀 アクセス方法

開発サーバーは以下のコマンドで起動します：

```bash
npm run dev
```

アクセスURL: http://localhost:3000 (または http://localhost:3001)

## 📚 主要ページ

- **ホーム**: http://localhost:3000/
- **法令一覧**: http://localhost:3000/laws
- **民法**: http://localhost:3000/laws/129AC0000000089
- **商法**: http://localhost:3000/laws/132AC0000000048
- **刑法**: http://localhost:3000/laws/140AC0000000045
- **会社法**: http://localhost:3000/laws/417AC0000000086
- **労働基準法**: http://localhost:3000/laws/322AC0000000049

## ✨ 実装済み機能

### 1. e-Gov風UI
- プロフェッショナルなデザイン
- ヘッダー、検索バー、フッター
- パンくずリスト
- 階層的な目次ナビゲーション

### 2. 参照関係の可視化
- 条文内の参照を自動的にリンク化
- 参照タイプ別の色分け（内部参照、外部参照、相対参照など）
- ツールチップで参照先情報表示
- 位置情報付き参照追跡

### 3. 相対参照解決
- 「前項」「次条」「同条」などを自動的に実際の条文番号に変換
- コンテキスト認識による正確な解決
- 信頼度スコア付き

### 4. 法令一覧機能
- カテゴリフィルタリング
- ソート機能（法令名、法令番号、公布日）
- ページネーション
- リスト/グリッド表示切り替え
- 統計ダッシュボード

### 5. 法令詳細表示
- 3カラムレイアウト（目次、条文、参照情報）
- 条文の階層構造表示（編、章、節、条、項、号）
- 削除条文の表示
- 制定文の表示
- 第一項番号表示オプション

## 🔧 技術スタック

- **フロントエンド**: React + Next.js 15 (App Router)
- **スタイリング**: Tailwind CSS + カスタムCSS
- **データベース**: PostgreSQL (Prisma ORM)
- **グラフDB**: Neo4j (参照関係管理)
- **LLM**: Ollama (Mistral)

## 📦 主要コンポーネント

### クライアントコンポーネント
- `/app/components/LawDetailClient.tsx` - 法令詳細表示
- `/app/components/LawsListClient.tsx` - 法令一覧
- `/app/components/EnhancedReferenceLink.tsx` - 拡張参照リンク
- `/app/components/EgovLayout.tsx` - e-Gov風レイアウト
- `/app/components/LawDetailClientEnhanced.tsx` - 拡張版法令詳細
- `/app/components/LawsListEnhanced.tsx` - 拡張版法令一覧

### サービス
- `/src/services/relative-reference-resolver.ts` - 相対参照解決
- `/src/lib/hybrid-db.ts` - PostgreSQL/Neo4j統合
- `/src/utils/article-normalizer.ts` - 条文番号正規化

## 🗂️ データベース構造

### PostgreSQL (メインデータ)
- `LawMaster` - 法令マスタ
- `LawVersion` - 法令バージョン
- `Article` - 条文
- `Paragraph` - 項
- `Item` - 号
- `Reference` - 参照関係

### Neo4j (グラフ関係)
- 法令間の参照関係
- 条文間の参照関係
- 位置情報付き参照データ

## 🎨 デザイン特徴

- **カラーテーマ**: e-Gov準拠の青色基調（#003f8e）
- **フォント**: UD デジタル教科書体 N-R、BIZ UDゴシック
- **レスポンシブ**: モバイル/タブレット対応
- **アクセシビリティ**: WCAG 2.1準拠を目指す

## 🔍 参照タイプ

| タイプ | 色 | 説明 |
|--------|-----|------|
| internal | 青 | 同一法令内参照 |
| external | 緑 | 他法令参照 |
| relative | 紫 | 相対参照（前項など） |
| range | オレンジ | 範囲参照 |
| multiple | オレンジ | 複数参照 |
| structural | ピンク | 構造参照 |
| application | 紫（太字） | 準用・適用 |

## 📈 パフォーマンス

- 法令一覧: ~200ms
- 法令詳細: ~400ms
- 参照解決: ~100ms
- Neo4j検索: ~180ms (5段階参照)

## 🚧 今後の改善点

1. 全文検索機能の実装
2. 改正履歴の表示
3. PDF/Word出力機能
4. 参照グラフの可視化（D3.js）
5. ユーザー認証とブックマーク機能

## 📝 メモ

- データベースが起動していない場合は `docker compose up -d` を実行
- 参照データが表示されない場合は参照検出スクリプトを実行する必要があります
- ブラウザ拡張機能によるハイドレーションエラーは `suppressHydrationWarning` で対処済み

---

開発者: LawFinder Team
最終更新: 2025年8月22日