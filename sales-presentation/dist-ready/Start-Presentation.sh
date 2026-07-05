#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
echo "Starting Strata Workflow App presentation..."
echo "Open http://localhost:${PORT} in your browser"
echo "Press Ctrl+C to stop."
if command -v python3 >/dev/null 2>&1; then
  (sleep 1 && xdg-open "http://localhost:${PORT}" 2>/dev/null || open "http://localhost:${PORT}" 2>/dev/null || true) &
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  (sleep 1 && xdg-open "http://localhost:${PORT}" 2>/dev/null || open "http://localhost:${PORT}" 2>/dev/null || true) &
  exec python -m SimpleHTTPServer "$PORT"
else
  echo "Python not found. Open index.html after installing Python, or use npm run preview from source."
  exit 1
fi
