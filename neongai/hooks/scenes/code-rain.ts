// Green code raining down, Matrix style. It works in the strip and the pane.
// The rain falls at Claude's pace and freezes, heads pulsing red, when Claude
// needs you. Settled code piles up from the bottom as the context fills. Each
// tool call falls as its kind's name in its kind's color, and a finished turn
// spells STAGE CLEAR.
//
// The characters are half-width katakana (U+FF66-FF9D): one cell wide, but not
// every terminal font has them, so the README says how to check.

import { block, glyph, hash, mix } from '../frame'
import type { Frame } from '../frame'
import { SIGN_COLORS, clamp } from '../signals'
import type { Mode, RGB, SignKind, Sim } from '../signals'

const KANA = Array.from({ length: 0xFF9D - 0xFF66 + 1 }, (_, i) => String.fromCharCode(0xFF66 + i))
// Mostly katakana, a few digits, as in the films.
const GLYPHS = [...KANA, ...KANA, ...'0123456789']

const BG: RGB = [2, 10, 6]
const HEAD: RGB = [210, 255, 220]
const TRAIL: RGB = [40, 230, 90]
const DEEP: RGB = [0, 50, 18]
const PILE: RGB = [20, 110, 50]
const ALARM: RGB = [255, 50, 60]

// How many rows the rain falls per unit of `sim.dist`.
const ROWS_PER_UNIT = 6

const LABEL: Record<SignKind, string> = { read: 'READ', edit: 'EDIT', bash: 'BASH', web: 'WEB', agent: 'AGENT', fail: 'FAIL' }

export function codeRain(f: Frame, sim: Sim, mode: Mode, t: number) {
  const cols = f.cols, rows = f.rows - 1
  block(f, 0, 0, f.W, f.H, BG)

  const tick = Math.floor(t * 8)
  const char = (n: number) => GLYPHS[Math.floor(hash(n) * GLYPHS.length)] ?? '0'
  const pulse = mode === 'waiting' ? .5 + .5 * Math.sin(t * 7) : 0

  // settled code: the pile grows up to 60% of the height as the context fills
  const pile = Math.round(rows * .6 * clamp(sim.ctxShown / 100, 0, 1))
  const sky = rows - pile
  for (let y = sky; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const k = hash(x * 131 + y * 7919)
      if (k < .55) glyph(f, x, y, char(x * 31 + y * 17), y === sky ? mix(PILE, TRAIL, .5) : mix(PILE, DEEP, k))
    }
  }

  // the rain: denser and faster the busier Claude is
  const fall = sim.dist * ROWS_PER_UNIT
  const density = clamp(.25 + sim.speed * .8, .25, .9)
  for (let x = 0; x < cols; x++) {
    if (hash(x * 17 + 3) > density) continue
    const len = 3 + Math.floor(hash(x * 29 + 5) * Math.max(2, rows * .6))
    const speed = .6 + hash(x * 37 + 7) * .8
    const head = Math.floor((hash(x * 41 + 11) * (sky + len) + fall * speed) % (sky + len))
    for (let k = 0; k < len; k++) {
      const y = head - k
      if (y < 0 || y >= sky) continue
      const isHead = k === 0
      let c = isHead ? HEAD : mix(TRAIL, DEEP, k / len)
      if (isHead && pulse) c = mix(c, ALARM, pulse)
      // characters flicker; heads change every frame
      const flicker = isHead ? tick : Math.floor(tick / (2 + hash(x + y * 3) * 6))
      glyph(f, x, y, char(x * 977 + y * 131 + flicker * 7), c)
    }
  }

  // tool calls: the kind's name falls down its own column in its kind's color
  for (const s of sim.signs) {
    const word = LABEL[s.kind]
    const color = SIGN_COLORS[s.kind]
    const x = Math.floor(hash(s.id * 97 + 13) * cols)
    const head = Math.floor(((9 - s.z) / 8.35) * (sky + word.length))
    for (let k = 0; k < word.length; k++) {
      const y = head - (word.length - 1 - k)
      if (y >= 0 && y < sky) glyph(f, x, y, word[k] ?? ' ', k === word.length - 1 ? mix(color, [255, 255, 255], .4) : color)
    }
  }

  // end of a turn: STAGE CLEAR settles out of scrambled code
  if (t < sim.doneUntil) {
    const text = 'STAGE CLEAR'
    const y = Math.max(0, Math.floor((sky - 1) / 2))
    const x0 = Math.floor((cols - text.length) / 2)
    const left = (sim.doneUntil - t) / 3
    for (let i = 0; i < text.length; i++) {
      const isSettled = hash(i * 7 + 1) > left * 1.2 - .2
      glyph(f, x0 + i, y, isSettled ? text[i] ?? ' ' : char(i + tick * 13), isSettled ? HEAD : TRAIL)
    }
  }

  // a failed tool: columns scramble red for a moment
  if (t < sim.glitchUntil) {
    for (let x = 0; x < cols; x++) {
      if (hash(x * 7 + tick) > .25) continue
      for (let y = 0; y < sky; y++) {
        if (hash(x * 13 + y + tick * 3) < .4) glyph(f, x, y, char(x + y + tick), ALARM)
      }
    }
  }
}
