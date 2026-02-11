#!/usr/bin/env bash
set -euo pipefail

SESSION="meemi"

if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "Session '$SESSION' already exists. Attaching..."
  exec tmux attach -t "$SESSION"
fi

tmux new-session -d -s "$SESSION" -c "$PWD/frontend"
tmux send-keys -t "$SESSION" 'pnpm dev' Enter

tmux split-window -h -t "$SESSION" -c "$PWD/backend"
tmux send-keys -t "$SESSION" 'bacon run' Enter

tmux select-pane -t "$SESSION:.0"
exec tmux attach -t "$SESSION"
