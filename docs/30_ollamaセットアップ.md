# Ollama LLM API セットアップ

## 概要
LawFinderは法令文書の参照関係を分析するためにローカルLLM（Ollama）を使用します。

## 現在の設定

### インストール済みモデル
- **Mistral** - 参照関係の分析に使用

### サービス状態
Ollamaはsystemdサービスとして設定されており、システム起動時に自動的に開始されます。

```bash
# サービス状態の確認
systemctl status ollama

# サービスの再起動
sudo systemctl restart ollama

# ログの確認
journalctl -u ollama -f
```

### API エンドポイント
- URL: `http://localhost:11434/api/generate`
- モデル: `mistral`

## 使用方法

### 静的サイト生成（実LLM版）
```bash
node scripts/build-static-llm.js
```

### モデルの管理
```bash
# インストール済みモデルの確認
ollama list

# 新しいモデルのインストール
ollama pull model-name

# モデルの削除
ollama rm model-name
```

## トラブルシューティング

### LLMタイムアウトエラー
法令が大きい場合、LLM処理がタイムアウトすることがあります。
`scripts/build-static-llm.js`で以下の設定を調整してください：

1. チャンクサイズの調整（現在: 2000文字）
2. タイムアウト時間の延長（現在: 30秒）
3. 処理するチャンク数の制限（現在: 1チャンク）

### メモリ不足
大きなモデルを使用する場合、十分なメモリが必要です。
現在のメモリ使用量: 約8.1GB

## 自動起動の確認
システム再起動後、以下のコマンドで自動起動を確認できます：

```bash
# 再起動後
systemctl status ollama
curl http://localhost:11434/api/tags
```