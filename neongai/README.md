# neongai ネオン街

A neon synthwave scene in a side pane that shows what Claude is doing at a glance.

## Install

```
/plugin marketplace add nmicovic/kaizo
/plugin install neongai@kaizo
```

Then `/neongai` shows or hides the pane.

## Reading the scene

| You see | It means |
|---|---|
| **Sun** | Context left: high in the sky means plenty, at the horizon means almost full |
| **Grid speed** | Crawling: idle. Rolling: thinking. Racing: running tools. Steady: writing. Stopped: Claude needs you |
| **Neon signs** | One per tool call. Cyan: read or search. Pink: edit or write. Amber: command. Green: web or MCP. Violet: agent or skill. Red: failed |
| **Tail lights** | Flash when you send a prompt, pulse red when Claude needs you |
| **Stars** | More come out as the context fills |
| **Status line** | `◢ TOOL  ▸ Bash npm test   ctx 63% · 0:14 · 7 tools` |

"Claude needs you" means a question is waiting for your answer, or a permission prompt has been open for 2 seconds. Claude Code's own status line says so too, in case the pane is covered.

## Good to know

- **Terminal only.** The desktop app shows a short note in the pane instead.
- **Where the pane sits.** In a wide fullscreen terminal it docks beside the conversation. In a narrow one it sits above the prompt, where Claude Code's dialogs cover it while they're open.
- **tmux.** Inside tmux, Claude Code draws only 256 colors unless it is started with this variable:
  ```
  export CLAUDE_CODE_TMUX_TRUECOLOR=1
  ```
  tmux itself also needs 24-bit color for your terminal, for example `set -as terminal-features ',xterm-256color:RGB'`.
- **Cost.** Watch-only: every event passes through unchanged, it uses no tokens, and it stops drawing when the pane is closed.

## License

MIT
