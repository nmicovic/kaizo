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
| `/neongai` | **The strip**: a scene just above the prompt, as wide as the conversation. It is 6 rows tall while Claude works and shrinks to one status line when Claude is idle. Fold it away with `ctrl+x ctrl+a`. It stays on in your next sessions until you run `/neongai` again. |
| `/neongai pane` | **The side view**: a tall scene in a pane beside the conversation. Run it again to close the pane. |

## Scenes

| Scene | What it looks like | Where |
|---|---|---|
| `skyline` | a neon city scrolling past at night | the strip (default) and the side view |
| `sunset` | a road running into a synthwave sunset | the side view (default) |
| `code-rain` | green code raining down, Matrix style | the strip and the side view |
| `wireframe` | a spinning 3D wireframe with a ring of light, Tron style | the strip and the side view |
| `warp` | stars streaming past a ship at warp speed | the strip and the side view |
| `alley` | a rainy neon street, windows going dark one by one | the strip and the side view |

- `/neongai scene` (or `/neongai scene list`) shows every scene and what each view has now.
- `/neongai scene <name>` changes the strip.
- `/neongai pane <name>` opens the side view with that scene.

Each view remembers its scene across sessions.

## Reading the scene

Every scene shows the same five things:

| Scene | Context left | Busier | A tool call | Claude needs you | A turn ends |
|---|---|---|---|---|---|
| skyline, sunset | the sun sets; more stars | the city or road moves faster | a neon sign drives past | everything stops; lights pulse red | sparkles |
| code-rain | settled code piles up | the rain falls faster and thicker | the tool's kind falls as a word | the rain freezes; heads pulse red | STAGE CLEAR settles out |
| wireframe | the ring's light shrinks | the solid spins faster | a small cube orbits once | the spin stops; edges blink red | it bursts into points and back |
| warp | the planet ahead grows | stars stretch into streaks | a comet flies past | out of warp; a red alert frame | a flash |
| alley | windows go dark | the rain comes down harder | a neon sign spells the tool's kind | the rain stops; the door light pulses red | every window lights up |

- **Tool colors, in every scene:** cyan for read or search, pink for edit or write, amber for a command, green for web or MCP, violet for an agent or skill, red for a failure.
- **The status line,** in every scene: `◢ TOOL  ▸ Bash npm test   ctx 63% · 0:14 · 7 tools`.

"Claude needs you" means a question is waiting for your answer, or a permission prompt has been open for 2 seconds. Claude Code's own status line says so too, in case a dialog covers the view.

## Good to know

- **Terminal only.** The desktop app shows a short note instead.
- **Fonts.** code-rain needs half-width katakana, and wireframe and warp need braille. To check, run `printf 'ｱｲｳｴｵ ﾊﾋﾌﾍﾎ ⠁⠃⠇⡇⣇⣿\n'`. If you see boxes or question marks, pick another scene.
- **tmux.** Inside tmux, Claude Code draws only 256 colors unless it is started with this variable:
  ```
  export CLAUDE_CODE_TMUX_TRUECOLOR=1
  ```
  tmux itself also needs 24-bit color for your terminal, for example `set -as terminal-features ',xterm-256color:RGB'`.
- **Cost.** Watch-only: every event passes through unchanged, it uses no tokens, and it stops drawing when both views are off.

## License

MIT
