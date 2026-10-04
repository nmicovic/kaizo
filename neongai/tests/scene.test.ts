import { describe, expect, test } from 'claude-code/testing'

import { SCENES, paint } from '../hooks/paint'
import type { SceneId, View } from '../hooks/paint'
import { MODES, addSign, hudLine, newSim, plain, step } from '../hooks/signals'
import type { Mode, Notes, SignKind } from '../hooks/signals'

const NOTES: Notes = { mode: 'tool', ctx: 63, last: 'Bash npm test', tools: 7, elapsed: '0:14' }
const MODE_LIST = Object.keys(MODES) as Mode[]
const KINDS: SignKind[] = ['read', 'edit', 'bash', 'web', 'agent', 'fail']
const SCENE_LIST = Object.keys(SCENES) as SceneId[]
// The two places a scene is drawn: the strip above the prompt and the side pane.
const SIZE: Record<View, [number, number]> = { strip: [179, 6], pane: [62, 45] }
const base64Length = (cells: number) => Math.ceil((cells * 12) / 3) * 4

/** The code points of a frame's cells, read back out of the base64. */
function codePoints(cells: string) {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  for (let i = 0; i < cells.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | Math.max(0, ALPHA.indexOf(cells[i + k] ?? 'A')), 0)
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  const out: number[] = []
  for (let at = 0; at + 3 < bytes.length; at += 12) out.push((bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16))
  return out
}

// One width-1 character per cell: block elements, plain ASCII, half-width
// katakana, braille dots, and the status line's ◢ ▸ · …
const isNarrow = (cp: number) =>
  (cp >= 0x2580 && cp <= 0x259F) || (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xFF66 && cp <= 0xFF9D) || (cp >= 0x2801 && cp <= 0x28FF) ||
  [0x25E2, 0x25B8, 0xB7, 0x2026].includes(cp)

describe('paint', () => {
  for (const scene of SCENE_LIST) {
    test(`${scene}: one cell per column and row, at any size`, () => {
      for (const [cols, rows] of [[60, 20], [62, 45], [20, 3], [100, 5], [179, 6], [200, 1]] as const) {
        expect(paint(scene, newSim(), NOTES, 1, cols, rows).cells).toHaveLength(base64Length(cols * rows))
      }
    })

    for (const view of SCENES[scene].fits) {
    test(`${scene} in the ${view}: stays under the 1024 color pairs, one narrow character per cell`, () => {
      const sim = newSim(40)
      const [cols, rows] = SIZE[view]
      let most = 0
      let wide = 0
      for (let frame = 0; frame < 12 * 30; frame++) {
        const t = frame / 12
        const mode = MODE_LIST[Math.floor(frame / 60) % MODE_LIST.length]!
        step(sim, mode, (frame / 7) % 100, 1 / 12)
        if (frame % 19 === 0) addSign(sim, KINDS[frame % KINDS.length]!)
        if (frame % 100 === 0) sim.glitchUntil = t + .9
        if (mode === 'done') sim.doneUntil = t + 1
        const painted = paint(scene, sim, { ...NOTES, mode }, t, cols, rows)
        most = Math.max(most, painted.pairs)
        if (frame % 60 === 0) wide += codePoints(painted.cells).filter(cp => !isNarrow(cp)).length
      }
      expect(most).toBeLessThan(1024)
      expect(wide).toBe(0)
    })

    test(`${scene} in the ${view}: the context, a tool call and "needs you" each change the picture`, () => {
      const [cols, rows] = SIZE[view]
      const frame = (ctx: number, mode: Mode, withSign = false) => {
        const sim = newSim(ctx)
        if (withSign) {
          addSign(sim, 'bash')
          sim.signs[0]!.z = 4
        }
        return paint(scene, sim, { ...NOTES, mode, ctx }, 1, cols, rows).cells
      }
      expect(frame(10, 'tool')).not.toBe(frame(90, 'tool'))
      expect(frame(40, 'tool', true)).not.toBe(frame(40, 'tool'))
      expect(frame(40, 'waiting')).not.toBe(frame(40, 'tool'))
    })
    }
  }
})

describe('step', () => {
  test('the scene speeds up for tools and stops when Claude needs you', () => {
    const sim = newSim()
    for (let i = 0; i < 60; i++) step(sim, 'tool', null, .1)
    expect(sim.speed).toBeGreaterThan(.75)
    for (let i = 0; i < 60; i++) step(sim, 'waiting', null, .1)
    expect(sim.speed).toBeLessThan(.01)
  })

  test('signs drive past and leave', () => {
    const sim = newSim()
    addSign(sim, 'bash')
    addSign(sim, 'read')
    expect(sim.signs.map(s => s.side)).toEqual([-1, 1])
    for (let i = 0; i < 200; i++) step(sim, 'tool', null, .1)
    expect(sim.signs).toHaveLength(0)
  })

  test('the sun follows the context', () => {
    const sim = newSim(10)
    for (let i = 0; i < 40; i++) step(sim, 'idle', 80, .1)
    expect(Math.round(sim.ctxShown)).toBe(80)
  })
})

describe('the status line', () => {
  test('fills the width exactly, one color per character', () => {
    for (const cols of [20, 40, 62, 120]) {
      const line = hudLine(NOTES, cols)
      expect(line.text).toHaveLength(cols)
      expect(line.colors).toHaveLength(cols)
    }
  })

  test('says what Claude is doing', () => {
    const line = hudLine(NOTES, 62).text
    expect(line).toStartWith(' ◢ TOOL  ▸ Bash npm test')
    expect(line).toContain('ctx 63% · 0:14 · 7 tools')
  })

  test('says when Claude needs you', () => {
    expect(hudLine({ ...NOTES, mode: 'waiting' }, 62).text).toContain('YOUR MOVE  Claude needs you')
  })

  test('shows the turn time at the end of a turn', () => {
    expect(hudLine({ ...NOTES, mode: 'done' }, 62).text).toContain('STAGE CLEAR  · 0:14')
  })

  test('drops the numbers before the words when narrow', () => {
    const line = hudLine(NOTES, 30).text
    expect(line).toContain('TOOL')
    expect(line).not.toContain('ctx')
  })

  test('keeps commands on one plain line', () => {
    expect(plain('git commit -m "fix"\n  && echo 完了 🎉')).toBe('git commit -m "fix" && echo ?? ?')
  })
})
