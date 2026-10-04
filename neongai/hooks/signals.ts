// What every scene shows, whatever it looks like: Claude's phase, the context
// left, one sign per tool call, "needs you", and the end of a turn. register.tsx
// feeds this from Claude Code's events; the scenes only draw it.

export type Mode = 'idle' | 'thinking' | 'tool' | 'writing' | 'waiting' | 'done'
export type SignKind = 'read' | 'edit' | 'bash' | 'web' | 'agent' | 'fail'
export type RGB = readonly [number, number, number]

/** What Claude is doing, as the status line tells it. */
export type Notes = {
  mode: Mode
  /** Percent of the context window in use; null before the first reading. */
  ctx: number | null
  /** The latest tool call, `Bash npm test`. */
  last: string | null
  /** Tool calls this turn. */
  tools: number
  /** `0:14`: this turn so far, or the turn just finished. */
  elapsed: string | null
}

/** One sign per tool call: `z` runs from 9 (just put up) down to 0.65 (gone). */
export type Sign = { z: number; side: number; kind: SignKind }

/** The scene's own motion. Times are scene seconds, as the painters get `t`. */
export type Sim = {
  speed: number
  dist: number
  ctxShown: number
  side: number
  signs: Sign[]
  glitchUntil: number
  doneUntil: number
  flashUntil: number
}

export const MODES: Record<Mode, { speed: number; label: string; color: number }> = {
  idle: { speed: .04, label: 'PARKED', color: 0xA3A3A3 },
  thinking: { speed: .32, label: 'THINKING', color: 0x6FE6FF },
  tool: { speed: .8, label: 'TOOL', color: 0xF0A030 },
  writing: { speed: .5, label: 'WRITING', color: 0xFF5AC8 },
  waiting: { speed: 0, label: 'YOUR MOVE', color: 0xFF5A47 },
  done: { speed: .15, label: 'STAGE CLEAR', color: 0x4FB39B },
}

/** The same in every scene, so the README's legend always holds. */
export const SIGN_COLORS: Record<SignKind, RGB> = {
  read: [0, 230, 255], edit: [255, 60, 200], bash: [255, 170, 40],
  web: [80, 255, 160], agent: [200, 160, 255], fail: [255, 40, 40],
}

const HUD_TEXT = 0xDEDEDE
const HUD_MUTED = 0xA3A3A3

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function newSim(ctx: number | null = null): Sim {
  return { speed: MODES.idle.speed, dist: 0, ctxShown: ctx ?? 30, side: 1, signs: [], glitchUntil: 0, doneUntil: 0, flashUntil: 0 }
}

/** Moves the scene on by `dt` seconds: the speed eases to the mode's. */
export function step(sim: Sim, mode: Mode, ctx: number | null, dt: number) {
  dt = clamp(dt, 0, .25)
  sim.speed += (MODES[mode].speed - sim.speed) * Math.min(1, dt * 2.4)
  const dd = sim.speed * dt * 2.2
  sim.dist += dd
  for (const s of sim.signs) s.z -= dd
  sim.signs = sim.signs.filter(s => s.z > .65)
  if (ctx !== null) sim.ctxShown += (ctx - sim.ctxShown) * Math.min(1, dt * 3)
}

/** Puts up a sign far down the road, on the other side from the last one. */
export function addSign(sim: Sim, kind: SignKind): Sign {
  sim.side = -sim.side
  const sign: Sign = { z: 9, side: sim.side, kind }
  sim.signs.push(sign)
  if (sim.signs.length > 12) sim.signs.shift()
  return sign
}

/**
 * The status line, exactly `cols` characters (one cell each) with a color
 * per character: `◢ TOOL  ▸ Bash npm test    ctx 63% · 0:14 · 7 tools`.
 */
export function hudLine(notes: Notes, cols: number): { text: string; colors: number[] } {
  const m = MODES[notes.mode]
  let middle = ''
  if (notes.mode === 'idle') middle = 'waiting for your prompt'
  else if (notes.mode === 'waiting') middle = 'Claude needs you'
  else if (notes.mode === 'done') middle = notes.elapsed ? `· ${notes.elapsed}` : ''
  else if (notes.last) middle = `▸ ${plain(notes.last)}`

  const isBusy = notes.mode !== 'idle' && notes.mode !== 'done'
  const stats = [
    notes.ctx === null ? '' : `ctx ${Math.round(notes.ctx)}%`,
    isBusy && notes.elapsed ? notes.elapsed : '',
    notes.mode !== 'idle' && notes.tools ? `${notes.tools} tool${notes.tools === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ')

  const label = ` ◢ ${m.label}  `
  const right = stats ? `  ${stats} ` : ' '
  let room = cols - label.length - right.length
  let shownRight = right
  if (room < 8) {
    // Too narrow for both: the stats go first.
    shownRight = ' '
    room = cols - label.length - 1
  }
  const mid = middle.length > room ? `${middle.slice(0, Math.max(0, room - 1))}…` : middle.padEnd(Math.max(0, room))
  const text = (label + mid + shownRight).slice(0, cols).padEnd(cols)

  const colors: number[] = []
  const midColor = notes.mode === 'waiting' ? m.color : HUD_TEXT
  for (let x = 0; x < cols; x++) {
    colors.push(x < label.length ? m.color : x < label.length + mid.length ? midColor : HUD_MUTED)
  }
  return { text, colors }
}

/** One line of plain ASCII: anything else (newlines, emoji, wide CJK) would break the cell grid. */
export const plain = (s: string) => s.replace(/\s+/g, ' ').replace(/[^\x20-\x7E]/gu, '?').trim()
