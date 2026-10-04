import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { paint } from './paint'
import type { SceneId } from './paint'
import { addSign, newSim, step } from './signals'
import type { Mode, Notes, Sign, SignKind } from './signals'

const PANE = 'neongai'
const FRAME_MS = 83 // 12 frames a second
// tool.check answers `ask` both when a person will see a dialog and when auto
// mode's classifier decides (that takes well under a second). An ask still
// open after this long is a dialog waiting for you.
const ASK_GRACE_MS = 2000
const TOOL_HOLD_MS = 1600
const DONE_MS = 3000
const INTRO_MS = 4000
// The band is this tall while Claude works and one row (the status line) otherwise.
const BAND_ROWS = 6
const MIN_COLS = 20
const MIN_ROWS = 3

const isBandOn = atom({ plugin: 'neongai', key: 'isBandOn' } as const, false)
const isBandAwake = atom({ plugin: 'neongai', key: 'isBandAwake' } as const, false)

const KIND: Record<string, SignKind> = {
  Read: 'read', Grep: 'read', Glob: 'read', LS: 'read', ToolSearch: 'read', NotebookRead: 'read',
  Edit: 'edit', Write: 'edit', MultiEdit: 'edit', NotebookEdit: 'edit',
  Bash: 'bash', BashOutput: 'bash', KillShell: 'bash', PowerShell: 'bash', Monitor: 'bash',
  WebFetch: 'web', WebSearch: 'web',
  Agent: 'agent', Task: 'agent', Skill: 'agent', Workflow: 'agent',
}
const kindOf = (tool: string): SignKind => KIND[tool] ?? (tool.startsWith('mcp__') ? 'web' : 'read')

const SPINNER: Record<string, Mode> = {
  requesting: 'thinking', thinking: 'thinking', responding: 'writing', 'tool-input': 'tool', 'tool-use': 'tool',
}

// What Claude is doing. Module variables: the render hooks that feed them may
// not write $.state, and a hot reload only loses the current turn's details.
let inTurn = false
let turnStart = 0
let phase: Mode = 'thinking'
let toolUntil = 0
let doneUntil = 0
let doneTime: string | null = null
let tools = 0
let last: string | null = null
let ctx: number | null = null
let questions = 0
const asks = new Map<string, number>()
const signs = new Map<string, Sign>()

/** A place the scene is drawn: the side pane or the band above the prompt. */
type Target = {
  scene: SceneId
  key: string
  requestId: string
  cols: number
  rows: number
  last: string
  isBusy: boolean
  isHidden: boolean
  hiddenTicks: number
}
const target = (scene: SceneId, key: string, requestId = ''): Target =>
  ({ scene, key, requestId, cols: 0, rows: 0, last: '', isBusy: false, isHidden: false, hiddenTicks: 0 })
const pane = target('sunset', 'scene', PANE)
const band = target('skyline', 'strip')

// The scene and its timer. Time comes from $.clock, so tests can move it.
let epoch: number | undefined
const sim = newSim()
let timer: { cancel: () => void } | undefined
let isPaneOpen = false
let isBandShown = false
let lastFrame = 0
let awakeToken = 0
let isWaitingShown = false
let isHintDone = false

async function nowOf($: EngineInterface) {
  const now = await $.clock.now()
  epoch ??= now
  return now
}
const seconds = (now: number) => (now - (epoch ?? now)) / 1000
const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function modeAt(now: number): Mode {
  if (questions > 0) return 'waiting'
  for (const at of asks.values()) if (now - at > ASK_GRACE_MS) return 'waiting'
  if (now < doneUntil) return 'done'
  if (now < toolUntil) return 'tool'
  if (!inTurn) return 'idle'
  return phase
}

const notesAt = (now: number, mode: Mode): Notes =>
  ({ mode, ctx, last, tools, elapsed: inTurn ? clock(now - turnStart) : doneTime })

/** `Bash npm test`, `Edit scene.ts`, `github:create_issue`. */
function describe(tool: string, e: object): string {
  const field = (key: string) => {
    const value = (e as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : ''
  }
  const file = (path: string) => path.slice(path.lastIndexOf('/') + 1)
  let what = ''
  if (tool === 'Bash' || tool === 'PowerShell') what = field('command')
  else if (tool === 'Read' || tool === 'Edit' || tool === 'Write' || tool === 'MultiEdit') what = file(field('file_path'))
  else if (tool === 'NotebookEdit') what = file(field('notebook_path'))
  else if (tool === 'Grep' || tool === 'Glob') what = field('pattern')
  else if (tool === 'WebFetch') what = field('url').replace(/^https?:\/\//, '').split('/')[0] ?? ''
  else if (tool === 'WebSearch') what = field('query')
  else if (tool === 'Agent' || tool === 'Task') what = field('description')
  else if (tool === 'Skill') what = field('skill')
  const name = tool.startsWith('mcp__') ? tool.slice(5).replace('__', ':') : tool
  return what ? `${name} ${what}` : name
}

// The status line backup: a dialog can cover the pane or the band.
function showWaiting($: EngineInterface, isWaiting: boolean) {
  if (isWaiting === isWaitingShown) return
  isWaitingShown = isWaiting
  $.ui.status(isWaiting ? '◢ neongai: Claude needs you' : undefined)
}

async function draw($: EngineInterface, at: Target, notes: Notes, t: number) {
  if (!at.cols || at.isBusy) return
  // A hidden target (behind a dialog, folded, or another pane) gets one try a second.
  if (at.isHidden && ++at.hiddenTicks % 12 !== 0) return
  at.isBusy = true
  try {
    const { cells } = paint(at.scene, sim, notes, t, at.cols, at.rows)
    if (cells === at.last && !at.isHidden) return
    const { deny } = await $.ui.blit({ requestId: at.requestId, key: at.key, cells })
    at.isHidden = deny !== undefined
    if (!deny) at.last = cells
  } finally {
    at.isBusy = false
  }
}

async function tick($: EngineInterface) {
  const now = await nowOf($)
  const mode = modeAt(now)
  step(sim, mode, ctx, lastFrame ? (now - lastFrame) / 1000 : 0)
  lastFrame = now
  showWaiting($, mode === 'waiting')
  const notes = notesAt(now, mode)
  await draw($, pane, notes, seconds(now))
  await draw($, band, notes, seconds(now))
}

function start($: EngineInterface) {
  if (timer) return
  lastFrame = 0
  // A frame that fails (the pane closing mid-blit) just skips; the next one tries again.
  timer = $.clock.every(FRAME_MS, () => void tick($).catch(() => {}))
}

function stopIfUnused($: EngineInterface) {
  if (isPaneOpen || isBandShown) return
  timer?.cancel()
  timer = undefined
  showWaiting($, false)
}

/** Keeps the band tall for `ms` although no turn is running. */
async function wake($: EngineInterface, ms: number) {
  const token = ++awakeToken
  await update($, isBandAwake, () => true)
  $.clock.after(ms, () => {
    if (token === awakeToken) void update($, isBandAwake, () => false)
  })
}

async function setBand($: EngineInterface, isOn: boolean) {
  isBandShown = isOn
  await update($, isBandOn, () => isOn)
  await $.store.set('band', isOn)
  if (isOn) {
    start($)
    await wake($, INTRO_MS)
  } else {
    band.cols = 0
    stopIfUnused($)
  }
}

async function hintTmux($: EngineInterface) {
  if (isHintDone) return
  isHintDone = true
  if ((await $.env.get('TMUX')) && !(await $.env.get('CLAUDE_CODE_TMUX_TRUECOLOR'))) {
    $.ui.toast('neongai: inside tmux Claude Code draws only 256 colors. Start it with CLAUDE_CODE_TMUX_TRUECOLOR=1 for the full sunset.')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'neongai',
      description: 'Show or hide a neon strip above the prompt that shows what Claude is doing (pane: the big side view)',
      argumentHint: '[pane]',
    })
    await update($, isBandAwake, () => false)
    if ((await $.store.get('band')) === true) {
      isBandShown = true
      await update($, isBandOn, () => true)
      start($)
    }
    if ((await $.ui.panes()).some(one => one.id === PANE)) {
      isPaneOpen = true
      start($)
    }
    void $.session.usage().then(usage => { ctx = usage.context.percent ?? ctx }, () => {})

    return next(e)
  })

  on('command.run', { command: 'neongai' }, async ($, e) => {
    const verb = e.args.trim().toLowerCase()
    if (verb === 'pane') {
      const shown = (await $.ui.panes()).find(one => one.id === PANE)
      if (shown?.isShown) {
        await $.ui.close({ id: PANE })
        return { text: 'The neongai side view is closed.' }
      }
      await $.ui.open({ id: PANE, title: 'neongai', columns: 60, rows: 20 })
      isPaneOpen = true
      start($)
      await hintTmux($)
      return { text: 'The neongai side view is open. /neongai pane closes it.' }
    }
    if (verb) return { text: '/neongai shows or hides the strip above the prompt. /neongai pane opens the big side view.' }

    const isOn = !(await read($, isBandOn))
    await setBand($, isOn)
    if (!isOn) return { text: 'neongai is off.' }
    await hintTmux($)
    return { text: 'neongai is on: the strip above the prompt grows while Claude works. /neongai pane opens the big side view.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      isPaneOpen = false
      pane.cols = 0
      stopIfUnused($)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface !== 'terminal') {
      const { Text } = $.ui.resolve(e)
      return <Text dimColor>neongai draws in the terminal only, for now.</Text>
    }
    const { Raster } = $.ui.resolve(e)
    // Fill the whole body, so none of the pane's own gray shows.
    pane.cols = Math.min(512, Math.max(MIN_COLS, e.props.bodyColumns))
    pane.rows = Math.min(256, Math.max(MIN_ROWS, e.props.scroll.bodyRows))
    pane.isHidden = false
    const now = await nowOf($)
    const { cells } = paint(pane.scene, sim, notesAt(now, modeAt(now)), seconds(now), pane.cols, pane.rows)
    pane.last = cells

    return <Raster key={pane.key} columns={pane.cols} rows={pane.rows} cells={cells} />
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || !(await read($, isBandOn))) {
      band.cols = 0
      return next(e)
    }
    const { Raster } = $.ui.resolve(e)
    const isTall = e.props.isWorking || (await read($, isBandAwake))
    band.requestId = e.requestId
    band.cols = Math.min(512, Math.max(MIN_COLS, e.props.bodyColumns))
    band.rows = Math.max(1, Math.min(isTall ? BAND_ROWS : 1, e.props.maxRows))
    band.isHidden = false
    const now = await nowOf($)
    const { cells } = paint(band.scene, sim, notesAt(now, modeAt(now)), seconds(now), band.cols, band.rows)
    band.last = cells

    return <Raster key={band.key} columns={band.cols} rows={band.rows} cells={cells} />
  })

  // What Claude is doing. Every hook passes its event on unchanged.
  on('prompt.submit', async ($, e, next) => {
    const now = await nowOf($)
    inTurn = true
    turnStart = now
    phase = 'thinking'
    tools = 0
    last = null
    doneUntil = 0
    sim.flashUntil = seconds(now) + .5
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    phase = SPINNER[e.props.mode] ?? phase
    return next(e)
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'ask' && e.tool_use_id) asks.set(e.tool_use_id, await nowOf($))
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    const id = e.tool_use_id ?? ''
    const isQuestion = e.tool === 'AskUserQuestion'
    if (isQuestion) {
      questions++
    } else {
      tools++
      last = describe(e.tool, e)
      toolUntil = (await nowOf($)) + TOOL_HOLD_MS
      const sign = addSign(sim, kindOf(e.tool))
      if (id) signs.set(id, sign)
    }
    try {
      const result = await next(e)
      if (!isQuestion && (result.deny !== undefined || result.isError)) {
        const sign = signs.get(id)
        if (sign) sign.kind = 'fail'
        sim.glitchUntil = seconds(await nowOf($)) + .9
      }
      return result
    } finally {
      if (isQuestion) questions = Math.max(0, questions - 1)
      asks.delete(id)
      signs.delete(id)
    }
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const now = await nowOf($)
      inTurn = false
      asks.clear()
      questions = 0
      toolUntil = 0
      doneTime = clock(e.durationMs)
      if (e.reason === 'answer') {
        doneUntil = now + DONE_MS
        sim.doneUntil = seconds(now) + DONE_MS / 1000
        if (isBandShown) await wake($, DONE_MS)
      } else if (e.reason !== 'aborted') {
        sim.glitchUntil = seconds(now) + .9
      }
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    ctx = e.context.percent ?? ctx
    return next(e)
  })
}
