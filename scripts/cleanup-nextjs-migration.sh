#!/bin/bash

# Next.js移行に伴い不要になったスクリプトの削除

echo "Next.js移行に伴い不要になったスクリプトを削除します..."

# 削除対象ファイルリスト
files_to_remove=(
  # 静的サイト生成関連
  "scripts/build-static-egov-full.js"
  "scripts/build-static-egov-mainprovision-fixed.js"
  "scripts/build-static-llm.js"
  "scripts/parse-xml.js"
  "scripts/serve.js"
  "scripts/test-pipeline.js"
  "scripts/sample-law-structure.json"
  
  # 旧チェックスクリプト
  "scripts/check-import-results.ts"
  "scripts/check-references.ts"
  "scripts/check-references-by-law.ts"
  
  # クリーンアップ関連
  "scripts/cleanup-files.txt"
  "scripts/cleanup-old-scripts.sh"
)

# 各ファイルの削除
for file in "${files_to_remove[@]}"; do
  if [ -f "$file" ]; then
    echo "削除: $file"
    rm "$file"
  else
    echo "既に削除済み: $file"
  fi
done

echo "クリーンアップが完了しました。"

# 残っているスクリプトを表示
echo -e "\n残っているスクリプト:"
ls -la scripts/

echo -e "\n保持されているスクリプト:"
echo "- startup.sh: LLMサーバー起動用"
echo "- import-laws-to-db-v3.ts: Phase 2用データベースインポート"
echo "- migrate-to-neo4j.ts: Neo4j移行用"
echo "- neo4j-setup.ts: Neo4jセットアップ"
echo "- test-neo4j-queries.ts: Neo4jクエリテスト"