-- PostgreSQLに管理者として接続してから実行してください
-- sudo -u postgres psql

-- lawfinderユーザーにデータベース作成権限を付与
ALTER USER lawfinder CREATEDB;

-- 確認
\du lawfinder

-- 終了
\q