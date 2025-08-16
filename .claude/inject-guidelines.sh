#!/usr/bin/env bash
cat <<'TXT'
【プロジェクト標準】
- 実装に着手する前に、必ず `docs/` 配下の要件定義・仕様書（.md）や `CLAUDE.md` を最新化し、それに基づいてタスクを進めてください。
- Python を使う場合は、常に venv を作成・有効化し、手順とコマンドを明示してください（例: `python -m venv .venv && source .venv/bin/activate`）。
- レポートを生成する際は、`Report/` ディレクトリ内に `yyyymmdd_reportname.md` の形式で作成してください
- ポートが使用されている時には kill で終了させましょう (pkill -f "next-server" && pkill -f "next dev")
- 実装に着手する前に、必ず `docs/` 配下の要件定義・仕様書（.md）や `CLAUDE.md` を最新化し、それに基づいてタスクを進めてください
- .gitignore も適宜追加更新すること

TXT
exit 0
