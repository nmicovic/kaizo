---
paths:
  - "**/hooks/**"
---

# Mod API lessons (learned on Claude Code 2.1.288, rechecked on 2.1.289)

Learned the hard way. The API changes between releases, so recheck against the generated types after an update, and add new lessons here.

## Knowing what Claude is doing
- `classic.*` events (Notification, PermissionRequest, UserPromptSubmit, PostToolUse, even the `classic.*` catch-all) never reach a hooks module. Don't build on them.
- Claude is **waiting for the person** while:
  - a `tool.call` with `e.tool === 'AskUserQuestion'` is open (it stays open until answered), or
  - a `tool.check` whose `await next(e)` gave `{ decision: 'ask' }` is still open after about 2 s. In auto mode the classifier settles the same `ask` in under a second, so only an ask that stays open is a dialog.
- `Spinner` render `e.props.mode` is Claude's phase: `requesting`, `thinking`, `responding`, `tool-input`, `tool-use`. It does not change during a permission dialog.
- `turn.complete` has `reason` (`answer`, `aborted`, `refusal`, `error`), `durationMs`, and `agentId` for a subagent's turn.
- Tool arguments are spread on the event: `e.command` once `e.tool === 'Bash'`.

## Panes and drawing
- Size content from `e.props.bodyColumns` and `e.props.scroll.bodyRows`. `e.viewport.rows` is the whole screen.
- The pane's frame stays Claude Code's gray `#262626`: the left divider and the frame's own rows, which `bodyRows` already leaves out (2.1.289 documents them: an inline border's two, the tab row while one shows, a docked pane's row for the ✕). More rows than `bodyRows` just scroll the bottom row away.
- A pane above the prompt (narrow terminal) is unmounted while a dialog is open; a docked pane stays. Blits to an unmounted pane are refused, so slow down instead of painting every frame.
- The Raster rounds colors to #RGB (16 levels per channel); Text keeps 24-bit. A Raster cell holds one width-1 character, so turn user text into plain ASCII first. Half-width katakana (U+FF66-FF9D) and braille (U+2800-28FF) pass the check (2.1.289); whether the person's font has them is another matter.
- Because of the #RGB rounding, a smooth dark gradient can pass through an odd hue: navy to purple rounds to a dull red in the middle. Step dark backgrounds through colors that are already multiples of 17.
- **The resolution ceiling.** In characters, a cell gives at most 2x4 dots (braille, one color plus background) or 2x2 solid blocks (quadrants `▘▝▖▗▚▞▙▛▜▟`, two colors). The finer sextant and octant blocks are outside the BMP, so the Raster refuses them. Sharper still means the `Image` element, which sends real pixels but only over the kitty graphics protocol: Ghostty or kitty, not Windows Terminal. The intermission mod does this (a 640x360 `rgb` frame through `shm`, swapped with `$.ui.blit`).
- Drawing at a higher resolution shrinks everything sized in pixels. Size objects in cells if a scene should work at more than one resolution.
- `$.ui.invalidate('ui.render')` redraws every component the mod hooks (an open question dialog too), not only its pane.
- On desktop `'Raster' in $.ui.resolve(e)` is true but draws nothing: check `e.surface === 'terminal'`.
- Inside tmux, Claude Code draws 256 colors unless started with `CLAUDE_CODE_TMUX_TRUECOLOR=1`. To check what reaches the screen, count `38;2;` against `38;5;` codes in `tmux capture-pane -e -p`.

## The band above the prompt (`AbovePrompt`)
- It is as wide as `e.props.bodyColumns`: the conversation's column (narrower while a pane is docked) minus the 5 columns where Claude Code draws its `[-]` fold mark. It is as tall as the tree you return, up to `e.props.maxRows`. The person can fold it with ctrl+x ctrl+a or the `[-]`.
- `e.props.isWorking` is true while a turn runs, and a change to it redraws the band. That's enough to grow the band while Claude works and shrink it when idle.
- Pass (`return next(e)`) while `e.props.hasSurvey` is true: the band belongs to Claude Code's survey then.
- A Raster in the band is repainted with `$.ui.blit({ requestId: e.requestId, ... })`, like a pane's.

## State
- A value read with `read($, atom)` inside a `ui.render` hook subscribes that drawing; `update($, atom, fn)` from any other hook redraws it. This beats `$.ui.invalidate`, which redraws every component the mod hooks.
- The contract (`types/index.d.ts`, named in `plugin.json` as `"types"`) is picky:
  - each value must be written out inside `interface PluginState { <mod>: { ... } }`, not through a named type
  - the file may not import anything
  - it must export at least one type of its own, or `declare module` replaces Claude Code's types instead of extending them
- `$.store` keeps values across sessions; restore them in `session.start`.

## Timers
- `$.clock.every(83)` plus `$.ui.blit` holds 12 frames a second for about 2 ms a frame.
- Code in a hooks module ran about 7 times slower than the same code in bun (2.1.288), so budget per-frame work from a bun benchmark times 7.
- Claude Code pauses every mod's timers for 1.1 to 1.6 s roughly every 34 s, and `$.clock.after` runs late by as much. Not a bug in the mod.
