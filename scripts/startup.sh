#!/bin/bash
# LawFinder 起動スクリプト

echo "LawFinder 起動スクリプト"
echo "========================"

# Ollamaサービスの確認
echo -n "Ollama サービスの確認... "
if systemctl is-active --quiet ollama; then
    echo "✓ 起動済み"
else
    echo "✗ 停止中"
    echo "Ollama を起動しています..."
    sudo systemctl start ollama
    sleep 5
fi

# Ollama APIの応答確認
echo -n "Ollama API の確認... "
if curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "✓ 応答あり"
else
    echo "✗ 応答なし"
    echo "Ollama APIが応答していません。ログを確認してください："
    echo "sudo journalctl -u ollama -n 50"
    exit 1
fi

# インストール済みモデルの確認
echo -e "\nインストール済みモデル："
ollama list

echo -e "\n準備完了！以下のコマンドで静的サイトを生成できます："
echo "  node scripts/build-static-llm.js"
echo ""
echo "サーバーを起動する場合："
echo "  npm run serve"