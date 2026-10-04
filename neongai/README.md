# neongai ネオン街

A neon city at night that shows what Claude is doing at a glance.

## Install

```
/plugin marketplace add nmicovic/kaizo
/plugin install neongai@kaizo
```

## Two views

| Command | What you get |
|---|---|
| `/neongai` | **The strip**: a neon skyline just above the prompt, as wide as the conversation. It is 6 rows tall while Claude works and shrinks to one status line when Claude is idle. Fold it away with `ctrl+x ctrl+a`. It stays on in your next sessions until you run `/neongai` again. |
| `/neongai pane` | **The side view**: a road running into a synthwave sunset, in a pane beside the conversation. Run it again to close the pane. |

## Reading the scene

| You see | It means |
|---|---|
| **Sun** | Context left: high in the sky means plenty, low and red means almost full |
| **Speed** (the city scrolling past, or the road rolling) | Crawling: idle. Rolling: thinking. Racing: running tools. Steady: writing. Stopped: Claude needs you |
| **Neon signs** | One per tool call. Cyan: read or search. Pink: edit or write. Amber: command. Green: web or MCP. Violet: agent or skill. Red: failed |
| **Car lights** | Flash when you send a prompt, pulse red when Claude needs you |
| **Stars** | More come out as the context fills |
| **Status line** | `◢ TOOL  ▸ Bash npm test   ctx 63% · 0:14 · 7 tools` |

"Claude needs you" means a question is waiting for your answer, or a permission prompt has been open for 2 seconds. Claude Code's own status line says so too, in case a dialog covers the view.

## Good to know

- **Terminal only.** The desktop app shows a short note instead.
- **tmux.** Inside tmux, Claude Code draws only 256 colors unless it is started with this variable:
  ```
  export CLAUDE_CODE_TMUX_TRUECOLOR=1
  ```
  tmux itself also needs 24-bit color for your terminal, for example `set -as terminal-features ',xterm-256color:RGB'`.
- **Cost.** Watch-only: every event passes through unchanged, it uses no tokens, and it stops drawing when both views are off.

## License

MIT
