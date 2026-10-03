import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const pane = (bodyColumns: number, bodyRows: number) => ({
  title: 'neongai',
  isFocused: false,
  bodyColumns,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows },
  view: {},
})

const mount = ($: Engine, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({ plugin: 'neongai', surface, component: 'Pane', requestId: 'neongai', props: pane(62, 45) })

// The status line is the Raster's last row: read its characters back out.
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
async function statusLine($: Engine) {
  const ui = await mount($)
  const raster = await ui.find({ type: 'Raster', key: 'scene' })
  await ui.unmount()
  const { cells, columns, rows } = raster?.props as { cells: string; columns: number; rows: number }
  const bytes: number[] = []
  for (let i = 0; i < cells.length; i += 4) {
    const n = [0, 1, 2, 3].reduce((acc, k) => (acc << 6) | Math.max(0, ALPHA.indexOf(cells[i + k] ?? 'A')), 0)
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255)
  }
  let text = ''
  for (let x = 0; x < columns; x++) {
    const at = ((rows - 1) * columns + x) * 12
    text += String.fromCodePoint((bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8) | ((bytes[at + 2] ?? 0) << 16))
  }
  return text
}

test('the scene fills the pane body, so none of its gray shows', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const raster = await (await mount($)).find({ type: 'Raster', key: 'scene' })
  expect(raster?.props).toMatchObject({ columns: 62, rows: 45 })
})

test('other surfaces get a note instead of the scene', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  const note = await (await mount($, 'desktop')).find({ type: 'Text' })
  expect(note?.text).toContain('terminal only')
})

test('a tool call shows TOOL and the command', async ($, on) => {
  mock.clock(on, { now: 1_000_000 })
  on('tool.call', () => ({ result: { stdout: 'ok', stderr: '', interrupted: false } }))
  await $.tool.call({ tool: 'Bash', command: 'npm test', tool_use_id: 'call-1' })
  const line = await statusLine($)
  expect(line).toContain('TOOL')
  expect(line).toContain('Bash npm test')
})

test('a question shows YOUR MOVE until it is answered', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  let answer = () => {}
  on('tool.call', () => new Promise(resolve => {
    answer = () => resolve({ result: { questions: [], answers: {} } })
  }))
  const asking = $.tool.call({
    tool: 'AskUserQuestion',
    tool_use_id: 'ask-1',
    questions: [{ question: 'Ship it?', header: 'Ship', multiSelect: false, options: [{ label: 'Yes', description: 'ship' }, { label: 'No', description: 'wait' }] }],
  })
  await clock.settle()
  expect(await statusLine($)).toContain('YOUR MOVE  Claude needs you')
  answer()
  await asking
  expect(await statusLine($)).not.toContain('YOUR MOVE')
})

test('a permission prompt left open shows YOUR MOVE', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  on('tool.check', () => ({ decision: 'ask' as const }))
  let approve = () => {}
  on('tool.call', async (_, e) => {
    await $.tool.check({ tool: e.tool, input: { command: 'rm -rf build' }, tool_use_id: e.tool_use_id })
    return new Promise(resolve => {
      approve = () => resolve({ result: { stdout: '', stderr: '', interrupted: false } })
    })
  })
  const running = $.tool.call({ tool: 'Bash', command: 'rm -rf build', tool_use_id: 'call-2' })
  await clock.advance(300)
  expect(await statusLine($)).not.toContain('YOUR MOVE')
  await clock.advance(2000)
  expect(await statusLine($)).toContain('YOUR MOVE')
  approve()
  await running
})
