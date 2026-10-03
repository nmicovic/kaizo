import { describe, expect, test } from 'claude-code/testing'

import { MODES, addSign, hudLine, newSim, paint, plain, step } from '../hooks/scene'
import type { Mode, Notes, SignKind } from '../hooks/scene'

const NOTES: Notes = { mode: 'tool', ctx: 63, last: 'Bash npm test', tools: 7, elapsed: '0:14' }
const MODE_LIST = Object.keys(MODES) as Mode[]
const KINDS: SignKind[] = ['read', 'edit', 'bash', 'web', 'agent', 'fail']
const base64Length = (cells: number) => Math.ceil((cells * 12) / 3) * 4

describe('paint', () => {
  test('makes exactly one cell per column and row, at any pane size', () => {
    for (const [cols, rows] of [[60, 20], [62, 45], [20, 3], [100, 5], [200, 80]] as const) {
      expect(paint(newSim(), NOTES, 1, cols, rows).cells).toHaveLength(base64Length(cols * rows))
    }
  })

  test('stays under the 1024 color pairs a Raster paints at once', () => {
    const sim = newSim(40)
    let most = 0
    for (let frame = 0; frame < 12 * 60; frame++) {
      const t = frame / 12
      const mode = MODE_LIST[Math.floor(frame / 120) % MODE_LIST.length]!
      step(sim, mode, (frame / 7) % 100, 1 / 12)
      if (frame % 19 === 0) addSign(sim, KINDS[frame % KINDS.length]!)
      if (frame % 100 === 0) sim.glitchUntil = t + .9
      if (mode === 'done') sim.doneUntil = t + 1
      most = Math.max(most, paint(sim, { ...NOTES, mode }, t, 62, 45).pairs)
    }
    expect(most).toBeLessThan(1024)
  })
})

describe('step', () => {
  test('the grid speeds up for tools and stops when Claude needs you', () => {
    const sim = newSim()
    for (let i = 0; i < 60; i++) step(sim, 'tool', null, .1)
    expect(sim.speed).toBeGreaterThan(.75)
    for (let i = 0; i < 60; i++) step(sim, 'waiting', null, .1)
    expect(sim.speed).toBeLessThan(.01)
  })

  test('signs drive past and leave the road', () => {
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
