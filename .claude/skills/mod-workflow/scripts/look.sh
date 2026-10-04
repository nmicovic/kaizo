#!/usr/bin/env bash
# Opens a mod in a hidden Claude Code window, runs one slash command, and saves
# what the screen shows: <out>.txt (text), <out>.ansi (with colors) and
# <out>.png (every cell drawn as pixels). Needs tmux.
#
# Usage: look.sh <mod-folder> "<slash command>" [seconds to wait] [out prefix]
set -euo pipefail

mod=${1:?mod folder}
cmd=${2:?slash command}
wait=${3:-3}
out=${4:-/tmp/mod-look}
win="mod-look-$$"
here=$(cd "$(dirname "$0")" && pwd)

[ -n "${TMUX:-}" ] || { echo "look.sh needs to run inside tmux" >&2; exit 1; }

tmux new-window -d -n "$win" -c "$PWD" "CLAUDE_CODE_TMUX_TRUECOLOR=1 claude --plugin-dir $mod"
trap 'tmux kill-window -t "$win" 2>/dev/null || true' EXIT

# Wait for the prompt, then type the command. Enter goes separately, once the
# command menu has opened, or the menu swallows it.
for _ in $(seq 1 60); do
  tmux capture-pane -p -t "$win" 2>/dev/null | grep -q '❯' && break
  sleep 0.5
done
tmux send-keys -t "$win" "$cmd"
sleep 1
tmux send-keys -t "$win" Enter
sleep "$wait"

tmux capture-pane -p -t "$win" > "$out.txt"
tmux capture-pane -e -p -t "$win" > "$out.ansi"
python3 "$here/cells-to-png.py" "$out.ansi" "$out.png"
echo "saved $out.txt, $out.ansi and $out.png"
