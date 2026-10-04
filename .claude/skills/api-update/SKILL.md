---
name: api-update
description: Check this repo's mods and lessons after Claude Code updates. Use when `claude --version` is newer than the version in the heading of .claude/rules/mod-api.md, or when a mod breaks after an update.
---

# After a Claude Code update

The mod API is early access: an update can rename events or props, add new ways to do things, or fix the behavior our lessons work around.

1. **Keep the old types to compare.** Before anything reloads the mod, copy `<mod>/.claude-plugin/types/claude-code/index.d.ts` to a scratch file. The folder is regenerated on every load and is not in git. Its first line names the version that wrote it.
   - A session started before the update keeps running the old version (check with `readlink -f /proc/<pid>/exe`), so it neither uses nor writes the new types. The `claude` on your PATH is the new one.
2. **Reload.** Load each mod once with the new version (`claude --plugin-dir <mod>`, or `look.sh` from `mod-workflow`). Then `diff` the old and new types and read the changes to anything the mods use. `claude plugin validate <mod>` lists the hooks and `$` calls each mod uses.
3. **Run the checks** for every mod: tsc, validate, tests. A type error usually means something was renamed; grep the new types.
4. **Re-test the lessons** in `.claude/rules/` that work around Claude Code's behavior:
   - Run `.claude/skills/api-update/scripts/check-lessons.sh`. It takes about 90 s and sends one tiny prompt. It reports:
     - whether tmux still gets 256 colors without `CLAUDE_CODE_TMUX_TRUECOLOR`
     - whether any `classic.*` event reaches a mod
     - how long and how often the mod timers pause
   - Is the Raster still rounded to #RGB, and is the pane frame still gray? Capture with `look.sh` (from `mod-workflow`) and check that every color in the scene is a multiple of 17 per channel; Claude Code's own UI colors aren't.
5. **Update the lessons.** Fix or delete each one that changed, and change the version in the heading of `mod-api.md`.
6. **Look for simpler ways.** Check the diff for new events or props that would replace a workaround.
7. **Ship it** as its own change with `mod-release`.
