import type { Register } from 'claude-code'

// Logs what check-lessons.sh asks about: which classic events reach a hooks
// module, and how late a 1 s timer runs. The log path comes from the
// environment so the script can read it back.
const lines: string[] = []

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const log = await $.env.get('KAIZO_PROBE_LOG')
    const t0 = await $.clock.now()
    let last = t0
    lines.push('session.start')
    $.clock.every(1000, () => void (async () => {
      const now = await $.clock.now()
      if (now - last > 1300) lines.push(`timer late by ${now - last - 1000} ms at ${Math.round((now - t0) / 1000)} s`)
      last = now
      if (log) await $.fs.write(log, lines.join('\n') + '\n')
    })())
    return next(e)
  })
  on('classic.*', async ($, e, next) => {
    lines.push(`classic.${(e as { hook_event_name?: string }).hook_event_name ?? 'PreToolUse'}`)
    return next(e)
  })
  on('prompt.submit', async ($, e, next) => {
    lines.push('prompt.submit')
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    lines.push('turn.complete')
    return next(e)
  })
}
