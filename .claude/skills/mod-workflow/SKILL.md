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
bun preview.ts | python3 .claude/skills/mod-workflow/scripts/cells-to-png.py --cells 179x6 /tmp/preview.png
```
`preview.ts` is a throwaway script in your scratch space. It calls the mod's pure painter (for neongai, `paint()` from `neongai/hooks/paint.ts`) and prints one base64 `cells` string per line. The PNG rounds colors to #RGB, as the Raster does.

## 5. Before you finish
- Learned something that would have saved time? Write it down now: API facts go in `.claude/rules/mod-api.md`, testing facts in `.claude/rules/mod-testing.md`, and better steps in this skill or a new one.
- To ship it, follow the `mod-release` skill.
