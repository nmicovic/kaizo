#!/usr/bin/env bash
# Re-tests the lessons in .claude/rules/ that work around Claude Code's own
# behavior, using hidden tmux windows. Sends one tiny prompt ("Reply with just
# the word ok"), so it costs a few tokens. Takes about 90 seconds. Needs tmux.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
log=$(mktemp)
[ -n "${TMUX:-}" ] || { echo "check-lessons.sh needs to run inside tmux" >&2; exit 1; }

wait_for_prompt() {
  for _ in $(seq 1 60); do
    tmux capture-pane -p -t "$1" 2>/dev/null | grep -q '❯' && return
    sleep 0.5
  done
}

echo "Claude Code $(claude --version | cut -d' ' -f1)"

# 1. Colors in tmux without CLAUDE_CODE_TMUX_TRUECOLOR.
tmux new-window -d -n lessons-colors "env -u CLAUDE_CODE_TMUX_TRUECOLOR claude"
wait_for_prompt lessons-colors
sleep 2
screen=$(tmux capture-pane -e -p -t lessons-colors)
tmux kill-window -t lessons-colors
echo "tmux without the variable: $(grep -o $'\e\[[0-9;]*[34]8;2;' <<< "$screen" | wc -l) 24-bit codes, $(grep -o $'\e\[[0-9;]*[34]8;5;' <<< "$screen" | wc -l) 256-color codes"

# 2. Classic events and timer pauses, from the probe mod.
tmux new-window -d -n lessons-probe "KAIZO_PROBE_LOG=$log CLAUDE_CODE_TMUX_TRUECOLOR=1 claude --plugin-dir $here/lesson-probe"
trap 'tmux kill-window -t lessons-probe 2>/dev/null || true; rm -f "$log"' EXIT
wait_for_prompt lessons-probe
tmux send-keys -t lessons-probe 'Reply with just the word ok'
sleep 1
tmux send-keys -t lessons-probe Enter
sleep 80
echo "probe log (expect prompt.submit and turn.complete; any classic.* line means classic events now reach mods):"
sed 's/^/  /' "$log"
