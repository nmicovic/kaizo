// Dev tool, not loaded by Claude Code: one scripted turn, shared by demo.ts and
// showcase.ts. In 15 seconds it shows everything a scene can: a prompt,
// thinking, reads, an edit, a failed command, Claude waiting for you, a
// command that passes, writing, and the end of the turn, while the context
// fills from 20% to 75%.

import { addSign, newSim, step } from '../hooks/signals'
import type { Mode, Notes, Sim, SignKind } from '../hooks/signals'

export const LENGTH = 15
const PROMPT = .8
const DONE = 11.5
const ASK = [7.5, 9.5] as const

const CALLS: { at: number; kind: SignKind; label: string }[] = [
  { at: 2, kind: 'read', label: 'Read src/login.ts' },
  { at: 3, kind: 'read', label: 'Grep validateToken' },
  { at: 4, kind: 'edit', label: 'Edit src/login.ts' },
  { at: 6, kind: 'fail', label: 'Bash npm test' },
  { at: 9.5, kind: 'bash', label: 'Bash npm test' },
]

/** What the transcript shows, line by line, as the turn plays. */
export type Line = { at: number; text: string; kind: 'you' | 'tool' | 'claude' | 'error' | 'ok' | 'ask' | 'dim'; until?: number; after?: string }

export const STORY: Line[] = [
  { at: PROMPT, text: '> fix the failing login test', kind: 'you' },
  { at: 2, text: '● Read(src/login.ts)', kind: 'tool' },
  { at: 3, text: '● Grep("validateToken")', kind: 'tool' },
  { at: 4, text: '● Update(src/login.ts)', kind: 'tool' },
  { at: 5, text: '● Empty tokens slip through the check. Fixing that.', kind: 'claude' },
  { at: 6, text: '● Bash(npm test)', kind: 'tool' },
  { at: 6.7, text: '  └ 1 test failed', kind: 'error' },
  { at: ASK[0], text: '? Run the full test suite too?   > Yes   No', kind: 'ask', until: ASK[1], after: '? Run the full test suite too?   Yes' },
  { at: ASK[1], text: '● Bash(npm test)', kind: 'tool' },
  { at: 10.4, text: '  └ 14 passed', kind: 'ok' },
  { at: 10.7, text: '● Fixed: empty tokens are rejected, and a test covers it.', kind: 'claude' },
  { at: DONE, text: '* Done in 0:10', kind: 'dim' },
]

function modeAt(t: number): Mode {
  if (t >= DONE && t < DONE + 3) return 'done'
  if (t < PROMPT || t >= DONE) return 'idle'
  if (t >= ASK[0] && t < ASK[1]) return 'waiting'
  if (CALLS.some(call => t >= call.at && t < call.at + 1.2)) return 'tool'
  if ((t >= 5 && t < 6) || (t >= 10.7 && t < DONE)) return 'writing'
  return 'thinking'
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** Plays the turn at `fps`, handing each frame's time, scene state and status line to `frame`. */
export function play(fps: number, frame: (t: number, sim: Sim, notes: Notes) => void) {
  const sim = newSim(20)
  let fired = 0
  for (let n = 0; n < LENGTH * fps; n++) {
    const t = n / fps
    const ctx = Math.round(20 + 55 * Math.min(1, t / DONE))
    while (fired < CALLS.length && t >= CALLS[fired]!.at) {
      const call = CALLS[fired++]!
      addSign(sim, call.kind)
      if (call.kind === 'fail') sim.glitchUntil = t + .9
    }
    if (Math.abs(t - PROMPT) < .5 / fps) sim.flashUntil = t + .5
    if (Math.abs(t - DONE) < .5 / fps) sim.doneUntil = t + 3
    const mode = modeAt(t)
    step(sim, mode, ctx, 1 / fps)
    const done = CALLS.filter(call => call.at <= t)
    frame(t, sim, {
      mode,
      ctx,
      last: done.at(-1)?.label ?? null,
      tools: done.length,
      elapsed: t < PROMPT ? null : clock(Math.min(t, DONE) - PROMPT),
    })
  }
}
