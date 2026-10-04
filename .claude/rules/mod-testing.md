---
paths:
  - "**/tests/**"
  - "**/hooks/**"
---

# Testing a mod (learned on Claude Code 2.1.288, rechecked on 2.1.289)

To see a mod on screen, use the `mod-workflow` skill (step 4). These are the facts about `claude plugin test`.

- Read time from `$.clock.now()`, not `Date.now()`, so a test can move it with `mock.clock(on)`. Without `mock.clock` a test has no clock at all.
- In a test, the test's own hooks stand in for Claude Code. Anything the mod calls that nothing answers fails with "no implementation for <event>". Answer each call the code path makes:
  - `mock.clock`, `mock.store` and `mock.env` cover `$.clock`, `$.store` and `$.env`.
  - Other calls need `on('<event>', ...)`, and the answer is wrapped as `{ value }`: `on('ui.blit', () => ({ value: {} }))`, `on('ui.panes', () => ({ value: [] }))`, `on('command.register', () => ({ value: { command: 'x' } }))`.
  - A mod timer started under `mock.clock` really ticks on `advance()`. Answer `ui.blit` or every frame fails.
  - A component the mod passes on (`next(e)`) needs a drawing from beneath: `on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' as const }))`.
- The test's `$` has no `store` to read back. To test a saved setting, start the test with `mock.store(on, { key: value })`, then raise `$.session.start({ cwd, surface: 'terminal', isInteractive: true })`.
- To run a slash command: `$.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })`.
- One pane or band id mounts once at a time: `unmount()` before mounting again. Mounting again is how a test sees state that changed without a redraw.
- Inside a hook, `$.tool.check` is a plugin's query and carries no `tool_use_id`. To act like Claude Code, raise it from the test body's own `$`.
- To run a test with settings: `test(name, { options: { key: value } }, body)`.
