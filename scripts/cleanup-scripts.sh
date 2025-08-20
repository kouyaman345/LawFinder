#!/bin/bash

# scripts/ディレクトリのクリーンアップスクリプト
# 実行前に必ずバックアップを取ってください

echo "==================================="
echo "scripts/ディレクトリのクリーンアップ"
echo "==================================="

# legacyディレクトリの確認
if [ -d "scripts/legacy" ]; then
    echo "✓ legacyディレクトリが存在します"
    echo "  ファイル数: $(ls -1 scripts/legacy/*.ts 2>/dev/null | wc -l)"
else
    echo "⚠ legacyディレクトリが見つかりません"
    exit 1
fi

# 削除確認
echo ""
echo "以下のファイルをlegacyディレクトリから削除します:"
echo "-----------------------------------"
ls -la scripts/legacy/*.ts 2>/dev/null | head -20
echo "..."
echo ""

read -p "legacyディレクトリ内のファイルを削除しますか？ (y/N): " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
    echo "削除を実行中..."
    
    # legacyディレクトリの削除
    rm -rf scripts/legacy
    echo "✓ legacyディレクトリを削除しました"
    
    # 追加の重複ファイル削除（存在する場合）
    rm -f scripts/populate-references.ts 2>/dev/null
    rm -f scripts/populate-references-simple.ts 2>/dev/null
    rm -f scripts/import-all-laws-improved.ts 2>/dev/null
    
    echo ""
    echo "✅ クリーンアップが完了しました"
    echo ""
    echo "現在のscripts/ディレクトリ:"
    echo "-----------------------------------"
    ls -la scripts/*.ts | wc -l
    echo "個のTypeScriptファイル"
    
else
    echo "キャンセルしました"
fi

echo ""
echo "推奨: 統合スクリプトの使用方法"
echo "-----------------------------------"
echo "# 法令管理"
echo "npx tsx scripts/unified/law-manager.ts --help"
echo ""
echo "# 検証スイート"
echo "npx tsx scripts/unified/validation-suite.ts --help"
echo ""
echo "# 参照管理（既存）"
echo "npx tsx scripts/reference-manager.ts --help"