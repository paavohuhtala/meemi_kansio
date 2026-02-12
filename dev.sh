#!/usr/bin/env bash
set -euo pipefail

SESSION="meemi_kansio"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists. Attaching..."
  exec tmux attach -t "$SESSION"
fi

# Start Docker Compose databases if not running
if ! docker compose -p meemi_kansio ps --status running --format '{{.Name}}' 2>/dev/null | grep -q .; then
  echo "Starting dev database..."
  docker compose -p meemi_kansio up -d --wait
fi

if ! docker compose -p meemi_kansio_test -f test-db-compose.yaml ps --status running --format '{{.Name}}' 2>/dev/null | grep -q .; then
  echo "Starting test database..."
  docker compose -p meemi_kansio_test -f test-db-compose.yaml up -d --wait
fi

tmux new-session -d -s "$SESSION" -c "$PWD/frontend"
tmux send-keys -t "$SESSION" 'pnpm dev' Enter

tmux split-window -h -t "$SESSION" -c "$PWD/backend"
tmux send-keys -t "$SESSION" 'bacon run' Enter

tmux select-pane -t "$SESSION:.0"
exec tmux attach -t "$SESSION"
