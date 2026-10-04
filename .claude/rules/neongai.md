---
paths:
  - "neongai/**"
---

# neongai: how it is built

A scene above the prompt (the strip) and in a side pane (the side view) that shows what Claude is doing. Watch-only: every hook passes its event on unchanged.

## The pieces

| File | What it does |
|---|---|
| `hooks/register.tsx` | Connects Claude Code to everything else: the `/neongai` command, the events that say what Claude is doing, the 12 fps timer, and drawing the strip and the side view. |
| `hooks/signals.ts` | What every scene shows: the mode (`idle`, `thinking`, `tool`, `writing`, `waiting`, `done`), the context, the signs (one per tool call), `step()` for the motion, and the status line. Pure. |
| `hooks/frame.ts` | The canvas: 2 x 4 pixels per cell, `put`/`block`/`line`/`glyph`, the shared sparkles and glitch, and `finish()`, which picks each cell's character (blocks or braille). Pure. |
| `hooks/paint.ts` | The scene list (`SCENES`: painter, where it fits, a one-line description) and `paint()`. |
| `hooks/scenes/*.ts` | One painter per scene: `(frame, sim, mode, t) => void`. |
| `types/index.d.ts` | The `$.state` contract: `isBandOn`, `isBandAwake`. |
| `tests/` | `scene.test.ts` checks every scene in every view; `band.test.ts` and `pane.test.ts` drive the commands and drawings through the engine. |
| `tools/` | Dev tools, never loaded by Claude Code: `preview.ts` (frames to look at), `turn.ts` (the scripted turn), `showcase.ts` and `showcase-to-gif.py` (README GIFs), `gifs.sh` (rebuild them all). |

## How a frame happens

1. Events set what Claude is doing:
   - `prompt.submit` starts a turn.
   - The `Spinner` render gives the phase.
   - `tool.call` puts up a sign, and turns it red on failure.
   - An `AskUserQuestion` call, or a `tool.check` `ask` open for 2 s, means Claude is waiting for you.
   - `turn.complete` ends the turn.
   - `session.measure` gives the context.
2. Every 83 ms the timer works out the mode, moves the scene on (`step`), paints each open view with its scene, and blits it. A view whose blit is refused (hidden) gets one try a second.
3. The `ui.render` hooks draw the Raster only when a view appears or changes size; after that, blits do the work.

Saved in `$.store`:
- `band`: whether the strip is on
- `scene.strip` and `scene.pane`: each view's scene

The strip is 6 rows while Claude works, or briefly after a switch or the end of a turn (`isBandAwake`), and one row otherwise.

## Adding a scene

1. **Write `hooks/scenes/<id>.ts`.** Its header comment says how it shows each of the five things below.
2. **Show all five things,** the same in every scene:
   - **context left:** from `sim.ctxShown`
   - **how busy Claude is:** move things by `sim.dist` (the motion then stops by itself while Claude waits)
   - **one mark per tool call:** from `sim.signs`, where `z` runs from 9 down to 0.65 over its life, `id` gives it a steady place, and `kind` picks its color from `SIGN_COLORS`, which never changes
   - **Claude needs you:** `mode === 'waiting'`, shown in red
   - **the end of a turn:** `t < sim.doneUntil`
   - also: a failure shows while `t < sim.glitchUntil`, and the prompt flash while `t < sim.flashUntil`
3. **Draw for the 2 x 4 grid:**
   - Fixed-size things go in design pixels: `block(f, x * S, y * S, S, S, c)`.
   - Fine detail stays 1 pixel thin.
   - Step backgrounds per cell row, using colors that are multiples of 17 (the Raster's #RGB grid).
   - Letters go through `glyph()`, as plain ASCII.
   - Give the strip a short layout (under 48 pixels tall).
4. **Register it in `SCENES` in `paint.ts`,** with `fits` and `about`.
5. **Look at it in both shapes:** `bun neongai/tools/preview.ts <id> 120 6` and `... <id> 62 30`, through `cells-to-png.py` (see the `mod-workflow` skill). The tests in `scene.test.ts` pick it up by themselves: cell counts, under 1024 color pairs, characters the Raster accepts, and each signal changing the picture.
6. **Document it:**
   - Add a section and a table row to `README.md`.
   - Run `neongai/tools/gifs.sh`.
   - Bump the minor version in `plugin.json`, `.claude-plugin/marketplace.json` and the root README table.
