#!/usr/bin/env bash
cat <<'TXT'
【プロジェクト標準】
- 実装に着手する前に、必ず `docs/` 配下の要件定義・仕様書（.md）や `CLAUDE.md` を最新化し、それに基づいてタスクを進めてください。
- Python を使う場合は、常に venv を作成・有効化し、手順とコマンドを明示してください（例: `python -m venv .venv && source .venv/bin/activate`）。
TXT
exit 0
