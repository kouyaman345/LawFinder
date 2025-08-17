#!/bin/bash

echo "==================================="
echo "PostgreSQL セットアップ手順"
echo "==================================="
echo ""
echo "以下のコマンドをコピーして実行してください："
echo ""
echo "sudo -u postgres psql"
echo ""
echo "その後、psqlプロンプトで以下を実行："
echo ""
cat << 'SQL'
-- coffeeユーザーを作成
CREATE USER coffee WITH PASSWORD 'coffee';

-- lawfinderユーザーも作成
CREATE USER lawfinder WITH PASSWORD 'lawfinder123';

-- データベースを作成
CREATE DATABASE lawfinder OWNER lawfinder;

-- 権限付与
GRANT ALL PRIVILEGES ON DATABASE lawfinder TO lawfinder;
GRANT ALL PRIVILEGES ON DATABASE lawfinder TO coffee;

-- 確認
\du
\l

-- 終了
\q
SQL

echo ""
echo "==================================="
echo "実行後、以下でテスト："
echo "psql -U lawfinder -h localhost -d lawfinder"
echo "==================================="