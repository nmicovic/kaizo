import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { SCENES, fits } from '../hooks/paint'
import type { SceneId } from '../hooks/paint'

const band = (isWorking: boolean, hasSurvey = false) => ({
  hasSurvey,
  isWorking,
  maxRows: 25,
  bodyColumns: 179,
  scroll: { offset: 0, bodyRows: 25 },
  view: {},
})

/** The world beneath the plugin: a clock, a store and no tmux. */
function world(on: On) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, {})
  on('ui.blit', () => ({ value: {} }))
  // The engine draws nothing of its own in the band: an empty Box stands for that.
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' as const }))
  return clock
}

const neongai = ($: Engine) =>
  $.command.run({ command: 'neongai', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })

async function strip($: Engine, isWorking: boolean, hasSurvey = false) {
  const ui = await $.ui.mount({ plugin: 'neongai', surface: 'terminal', component: 'AbovePrompt', requestId: 'band', props: band(isWorking, hasSurvey) })
  const raster = await ui.find({ type: 'Raster', key: 'strip' })
  await ui.unmount()
  return raster?.props as { columns: number; rows: number } | undefined
}

test('the band stays out of the way until /neongai', async ($, on) => {
  world(on)
  expect(await strip($, true)).toBeUndefined()
})

test('/neongai shows the strip tall for a moment, then as one row while idle', async ($, on) => {
  const clock = world(on)
  await neongai($)
  expect(await strip($, false)).toMatchObject({ columns: 179, rows: 6 })
  await clock.advance(5000)
  expect(await strip($, false)).toMatchObject({ columns: 179, rows: 1 })
})

test('the strip is tall and full width while Claude works', async ($, on) => {
  const clock = world(on)
  await neongai($)
  await clock.advance(5000)
  expect(await strip($, true)).toMatchObject({ columns: 179, rows: 6 })
})

test('a survey gets the band to itself', async ($, on) => {
  world(on)
  await neongai($)
  expect(await strip($, true, true)).toBeUndefined()
})

test('/neongai again switches it off', async ($, on) => {
  world(on)
  await neongai($)
  await neongai($)
  expect(await strip($, true)).toBeUndefined()
})

test('a new session brings the strip back if it was on', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  mock.store(on, { band: true })
  mock.env(on, {})
  on('ui.blit', () => ({ value: {} }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box' as const }))
  on('command.register', () => ({ value: { command: 'neongai' } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.usage', () => new Promise(() => {}))
  on('session.start', () => ({ cwd: '/tmp' }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  expect(await strip($, true)).toMatchObject({ columns: 179, rows: 6 })
})

test('/neongai scene code-rain turns the strip into code rain', async ($, on) => {
  world(on)
  const { text } = await $.command.run({ command: 'neongai', args: 'scene code-rain', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })
  expect(text).toContain('The strip now shows code-rain')
  // The engine checks every character of the drawing: half-width katakana pass.
  expect(await strip($, true)).toMatchObject({ columns: 179, rows: 6 })
})

test('/neongai scene with an unknown name says how to see them all', async ($, on) => {
  world(on)
  const { text } = await $.command.run({ command: 'neongai', args: 'scene sunrise', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })
  expect(text).toContain("There's no scene called sunrise")
  expect(text).toContain('/neongai scene to see them all')
})

test('/neongai scene lists the scenes', async ($, on) => {
  world(on)
  const { text } = await $.command.run({ command: 'neongai', args: 'scene', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })
  expect(text).toContain('code-rain')
  expect(text).toContain('sunset')
})

test('switching scenes shows the new look for a moment even while idle', async ($, on) => {
  const clock = world(on)
  await neongai($)
  await clock.advance(5000)
  expect(await strip($, false)).toMatchObject({ rows: 1 })
  await $.command.run({ command: 'neongai', args: 'scene code-rain', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })
  expect(await strip($, false)).toMatchObject({ rows: 6 })
})

test('/neongai scene list and other natural words show the list too', async ($, on) => {
  world(on)
  for (const word of ['list', 'lists', 'help']) {
    const { text } = await $.command.run({ command: 'neongai', args: `scene ${word}`, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })
    expect(text).toContain('neongai scenes')
  }
})

test('every scene that fits the strip draws there, every character accepted by the engine', async ($, on) => {
  world(on)
  for (const scene of (Object.keys(SCENES) as SceneId[]).filter(one => fits(one, 'strip'))) {
    const { text } = await $.command.run({ command: 'neongai', args: `scene ${scene}`, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 179 } })
    expect(text).toContain(`The strip now shows ${scene}`)
    expect(await strip($, true)).toMatchObject({ columns: 179, rows: 6 })
  }
})
