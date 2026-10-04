---
name: mod-workflow
description: Build or change a mod in this repo and check it really works on screen. Use when adding a mod, adding a feature or scene to one, fixing a mod bug, or tuning how a mod looks.
---

# Building and checking a kaizo mod

For the mod API itself, also load the built-in `plugin-authoring` skill. The facts this repo learned live in `.claude/rules/` and load on their own when you touch `hooks/` or `tests/`.

## 1. Before you write code
- Read the mod's `README.md` and the files you will touch.
- Grep the generated types (`<mod>/.claude-plugin/types/claude-code/index.d.ts`) for every event, prop and `$` method you plan to use. Don't trust memory: the API changes between releases.

## 2. Write it
- Logic that can be pure goes in `hooks/*.ts` with no `$`. `register.tsx` only connects events to it.
- Read time from `$.clock.now()`, not `Date.now()`, so tests can move it.
- Commands: accept the words people will try (`list`, `help`), and make every error say how to see the options. In docs, write the exact command and keep verbs away from it: "`/neongai scene` lists them" was typed as `/neongai scene lists`.
- **Drawing at 2x4 pixels per cell** (neongai's `frame.ts` picks each cell's character from blocks and braille): size fixed things in design pixels (`block()` with `S`) so they keep their size, and keep 1-pixel lines for what should look fine (stars, rain, wireframes). A 1-pixel border on a small box breaks up into braille dots, so give small shapes at least one design pixel.
- Code that runs per cell or per pixel must not allocate: returning a small object per call made frames 8x slower. Use module variables or typed arrays.
- Values a drawing reads belong in `$.state`, declared in `types/index.d.ts`. The values must be written out inside `interface PluginState { <mod>: { ... } }`. The file may not import anything, and must export at least one type of its own.

## 3. Check it
1. `npx -y -p typescript tsc -p <mod>`
2. `claude plugin validate <mod>`, and `claude plugin validate .` if you touched `marketplace.json`
3. `claude plugin test <mod>`

## 4. See it for real
Tests can't show what a person sees. Open the mod in a hidden Claude Code window and save the screen:
```
.claude/skills/mod-workflow/scripts/look.sh ./neongai "/neongai" 3 /tmp/look
```
- This writes `/tmp/look.txt` (the text), `/tmp/look.ansi` (with colors) and `/tmp/look.png` (every cell drawn as pixels; read the PNG to look at it).
- It needs tmux. Local slash commands cost no tokens.
- If the command changed a saved setting (neongai remembers whether its strip is on), run it again in a second `look.sh` call to switch it back before you finish.

To compare many states without Claude Code, paint frames offline and render them:
```
bun neongai/tools/preview.ts skyline 179 6 | python3 .claude/skills/mod-workflow/scripts/cells-to-png.py --cells 179x6 /tmp/preview.png
```
- A mod with a painter keeps a `tools/preview.ts` like neongai's. It calls the pure painter and prints one base64 `cells` string per line; Claude Code never loads `tools/`.
- Don't keep such scripts in the session scratchpad: it is wiped between days.
- The PNG rounds colors to #RGB, as the Raster does.
- Try each scene in each shape it might be drawn in (neongai: the 6-row strip and the tall pane). A scene that looks right in one can be unreadable in the other. A layout made for a tall view usually needs a short variant rather than a ban: fewer bands, sizes taken from the height, lines spaced at least 3 pixels apart, sprites at one pixel per sprite pixel (neongai's sunset does this below 48 pixels).

## 5. GIFs for the README
The README GIFs come from the painter, not from screen recordings, so every state shows up in a few seconds, and they show the mod in context:
- `neongai/tools/turn.ts` is one scripted turn: a prompt, reads, an edit, a failure, a question for you, a pass and the end.
- `neongai/tools/showcase.ts` plays it as neongai looks inside Claude Code (the strip above the prompt, the side view docked on the right), and `showcase-to-gif.py` draws a mock Claude Code window around it with the transcript filling in step by step.
- `neongai/tools/gifs.sh` rebuilds one showcase per scene from the scene list in the code and checks that none is stale or missing.
- For a single view, `tools/demo.ts` plus `cells-to-gif.py --cells COLSxROWS` makes a GIF of just the cells.
- Keep the media in `.github/media/` so it isn't installed with the mod. Look at a few frames before committing (open the GIF and `seek()` with Pillow), and keep the whole set under ~10 MB.

## 6. Before you finish
- Learned something that would have saved time? Write it down now: API facts go in `.claude/rules/mod-api.md`, testing facts in `.claude/rules/mod-testing.md`, and better steps in this skill or a new one.
- To ship it, follow the `mod-release` skill.
