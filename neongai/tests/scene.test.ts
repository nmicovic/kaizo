import { describe, expect, test } from 'claude-code/testing'

import { SCENES, paint } from '../hooks/paint'
import type { SceneId } from '../hooks/paint'
import { MODES, addSign, hudLine, newSim, plain, step } from '../hooks/signals'
import type { Mode, Notes, SignKind } from '../hooks/signals'

const NOTES: Notes = { mode: 'tool', ctx: 63, last: 'Bash npm test', tools: 7, elapsed: '0:14' }
const MODE_LIST = Object.keys(MODES) as Mode[]
const KINDS: SignKind[] = ['read', 'edit', 'bash', 'web', 'agent', 'fail']
const SCENE_LIST = Object.keys(SCENES) as SceneId[]
// Where each scene is drawn: the side pane, and the band above the prompt.
const SIZE: Record<SceneId, [number, number]> = { sunset: [62, 45], skyline: [179, 6] }
const base64Length = (cells: number) => Math.ceil((cells * 12) / 3) * 4

describe('paint', () => {
  for (const scene of SCENE_LIST) {
    test(`${scene}: one cell per column and row, at any size`, () => {
      for (const [cols, rows] of [[60, 20], [62, 45], [20, 3], [100, 5], [179, 6], [200, 1]] as const) {
        expect(paint(scene, newSim(), NOTES, 1, cols, rows).cells).toHaveLength(base64Length(cols * rows))
      }
    })

    test(`${scene}: stays under the 1024 color pairs a Raster paints at once`, () => {
      const sim = newSim(40)
      const [cols, rows] = SIZE[scene]
      let most = 0
      for (let frame = 0; frame < 12 * 60; frame++) {
        const t = frame / 12
        const mode = MODE_LIST[Math.floor(frame / 120) % MODE_LIST.length]!
        step(sim, mode, (frame / 7) % 100, 1 / 12)
        if (frame % 19 === 0) addSign(sim, KINDS[frame % KINDS.length]!)
        if (frame % 100 === 0) sim.glitchUntil = t + .9
        if (mode === 'done') sim.doneUntil = t + 1
        most = Math.max(most, paint(scene, sim, { ...NOTES, mode }, t, cols, rows).pairs)
      }
      expect(most).toBeLessThan(1024)
    })

    test(`${scene}: the context, a tool call and "needs you" each change the picture`, () => {
      const [cols, rows] = SIZE[scene]
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
