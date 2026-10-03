// The neon district, painted as half-block cells for a Raster: each cell is
// `▀` with the top pixel as its foreground and the bottom pixel as its
// background, so a pane of C x R cells is a picture of C x 2R pixels. The last
// row is the status line, drawn as text cells.
//
// Pure: paint() turns the scene and the time into cells, step() moves the
// scene on. register.tsx tells them what Claude is doing.

export type Mode = 'idle' | 'thinking' | 'tool' | 'writing' | 'waiting' | 'done'
export type SignKind = 'read' | 'edit' | 'bash' | 'web' | 'agent' | 'fail'

type RGB = readonly [number, number, number]

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

/** One neon sign by the road: how far away, which side, what kind of call. */
export type Sign = { z: number; side: number; kind: SignKind }

/** The scene's own motion. Times are scene seconds, as paint() gets `t`. */
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

const P = {
  skyTop: [10, 2, 30], skyMid: [56, 10, 96], skyLow: [176, 24, 112], horizon: [255, 112, 64],
  sunTop: [255, 224, 48], sunBot: [255, 40, 128], mtnFar: [46, 12, 88], mtnNear: [24, 6, 52],
  edge: [0, 230, 255], ground: [12, 0, 28], grid: [255, 46, 214], gridFar: [84, 18, 116],
  star: [255, 240, 255], body: [62, 36, 118], window: [14, 10, 36], tail: [255, 40, 70],
  wheel: [6, 2, 12], plate: [255, 224, 48],
} as const satisfies Record<string, RGB>

const SIGN_COLORS: Record<SignKind, RGB> = {
  read: [0, 230, 255], edit: [255, 60, 200], bash: [255, 170, 40],
  web: [80, 255, 160], agent: [200, 160, 255], fail: [255, 40, 40],
}

const HUD_BG = 0x12002A
const HUD_TEXT = 0xDEDEDE
const HUD_MUTED = 0xA3A3A3

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const mix = (a: RGB, b: RGB, f: number): RGB =>
  [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]

let seed = 11
const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const STARS = Array.from({ length: 110 }, () => ({ x: srnd(), y: srnd(), ph: srnd() * 6.283, sp: 1 + srnd() * 2.5, k: srnd() }))
const PEAKS_FAR = [[.03, .95], [.13, .7], [.22, .5], [.31, .3], [.69, .35], [.78, .55], [.88, .8], [.97, .6]] as const
const PEAKS_NEAR = [[.08, .55], [.18, .4], [.27, .22], [.74, .25], [.84, .45], [.94, .5]] as const
const CAR = ['...eeeeeee...', '..ewwwwwwwe..', '.bbbbbbbbbbb.', 'ttbbbpppbbbtt', 'kk.........kk']

export function newSim(ctx: number | null = null): Sim {
  return { speed: MODES.idle.speed, dist: 0, ctxShown: ctx ?? 30, side: 1, signs: [], glitchUntil: 0, doneUntil: 0, flashUntil: 0 }
}

/** Moves the scene on by `dt` seconds: the grid eases to the mode's speed. */
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

// Pixel and cell buffers, kept while the size stays.
let W = 0, H = 0, ROWS = 0
let px = new Uint32Array(0)
let words = new Uint32Array(0)

function size(cols: number, rows: number) {
  if (cols === W && rows === ROWS) return
  W = cols
  ROWS = rows
  H = Math.max(0, (rows - 1) * 2)
  px = new Uint32Array(W * H)
  words = new Uint32Array(cols * rows * 3)
}

const pack = (c: RGB) =>
  (clamp(Math.round(c[0]), 0, 255) << 16) | (clamp(Math.round(c[1]), 0, 255) << 8) | clamp(Math.round(c[2]), 0, 255)
const unpack = (v: number): RGB => [(v >> 16) & 255, (v >> 8) & 255, v & 255]

function put(x: number, y: number, c: RGB) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= W || y >= H) return
  px[y * W + x] = pack(c)
}
const get = (x: number, y: number) => unpack(px[y * W + x] ?? 0)

/**
 * One frame: `cols` x `rows` cells (rows at least 1), the scene above and the
 * status line in the last row. `pairs` counts the distinct color pairs (the Raster paints
 * 1024 at once).
 */
export function paint(sim: Sim, notes: Notes, t: number, cols: number, rows: number) {
  size(cols, rows)
  if (H > 0) scene(sim, notes.mode, t)
  return toCells(notes)
}

function scene(sim: Sim, mode: Mode, t: number) {
  // S scales the sun, mountains, signs and car, so a tall pane doesn't grow a
  // sun wider than the road.
  const S = Math.min(H, W * .67)
  const hz = Math.round(H * .56), Gh = H - hz, cx = (W - 1) / 2
  const night = clamp(sim.ctxShown / 100, 0, 1)

  // sky, in 9 retro bands
  for (let y = 0; y < hz; y++) {
    const f = Math.floor((y / Math.max(1, hz - 1)) * 9) / 9
    let c = f < .5 ? mix(P.skyTop, P.skyMid, f * 2) : f < .85 ? mix(P.skyMid, P.skyLow, (f - .5) / .35) : mix(P.skyLow, P.horizon, (f - .85) / .15)
    c = mix(c, P.skyTop, night * .55 * (1 - f * .6))
    for (let x = 0; x < W; x++) put(x, y, c)
  }
  // stars: more of them as the context fills
  for (const s of STARS) {
    if (s.k > .3 + .7 * night) continue
    const sx = Math.floor(s.x * W), sy = Math.floor(s.y * hz * .62)
    const b = .5 + .5 * Math.sin(t * s.sp + s.ph)
    if (b < .3) continue
    put(sx, sy, mix(get(sx, sy), P.star, b * .9))
  }
  // sun: its height is the context left
  const r = Math.max(3, Math.round(S * .27))
  const cy = hz - r * .9 + night * r * 2
  const pulse = mode === 'waiting' ? .5 + .5 * Math.sin(t * 7) : 0
  const flare = t < sim.doneUntil ? .4 * (sim.doneUntil - t) / 3 : 0
  const off = Math.floor(t * .8)
  for (let y = Math.max(0, Math.floor(cy - r - 3)); y < hz; y++) {
    for (let x = Math.floor(cx - r - 3); x <= Math.ceil(cx + r + 3); x++) {
      if (x < 0 || x >= W) continue
      const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= r) {
        const rel = dy / r
        if ((rel > -.35 && (y + off) % 4 === 0) || (rel > .2 && (y + off) % 4 === 2)) continue
        let c = mix(P.sunTop, P.sunBot, clamp((dy + r) / (2 * r), 0, 1))
        if (pulse) c = mix(c, [255, 0, 200], pulse * .6)
        if (flare) c = mix(c, [255, 255, 230], flare)
        put(x, y, c)
      } else if (dist <= r + 2.6) {
        put(x, y, mix(get(x, y), P.sunBot, .24 * (1 - (dist - r) / 2.6)))
      }
    }
  }
  // mountains, low in the middle so the sun stays visible
  const mh = S * .2
  const ridge = (pk: readonly (readonly [number, number])[], u: number, w: number) =>
    pk.reduce((m, p) => Math.max(m, p[1] * (1 - Math.abs(u - p[0]) / w)), 0)
  for (let x = 0; x < W; x++) {
    const u = x / Math.max(1, W - 1)
    const h1 = Math.round(mh * ridge(PEAKS_FAR, u, .11)), h2 = Math.round(mh * .75 * ridge(PEAKS_NEAR, u, .09))
    for (let k = 0; k < h1; k++) put(x, hz - 1 - k, k === h1 - 1 && h1 > 1 ? mix(P.mtnFar, P.edge, .5) : P.mtnFar)
    for (let k = 0; k < h2; k++) put(x, hz - 1 - k, k === h2 - 1 && h2 > 1 ? P.edge : P.mtnNear)
  }
  // ground and the rolling grid: its speed is how busy Claude is
  const gcol = (y: number) => mix(mix(P.horizon, [0, 0, 0], .62), P.ground, Math.min(1, ((y - hz) / Gh) * 3))
  for (let y = hz; y < H; y++) {
    const c = gcol(y)
    for (let x = 0; x < W; x++) put(x, y, c)
  }
  for (let k = -9; k <= 9; k++) {
    const xb = cx + k * W * .2
    for (let y = hz + 1; y < H; y++) {
      const f = (y - hz) / Gh
      if (f < .1) continue
      put(cx + (xb - cx) * f, y, mix(gcol(y), P.grid, clamp(f * 1.3, .2, 1)))
    }
  }
  const ph = sim.dist % 1
  for (let j = 0; j < 14; j++) {
    const z = j + 1 - ph
    if (z < .5) continue
    const y = hz + Math.round(Gh / z)
    if (y >= H || y <= hz) continue
    const c = mix(gcol(y), P.grid, clamp(1.6 / z, .18, 1))
    for (let x = 0; x < W; x++) put(x, y, c)
  }
  for (let x = 0; x < W; x++) put(x, hz, mix(P.horizon, P.grid, .25))
  // neon signs: one per tool call, colored by kind
  for (const s of sim.signs.slice().sort((a, b) => b.z - a.z)) {
    const color = SIGN_COLORS[s.kind]
    const f = 1 / s.z, base = hz + Math.round(Gh * f), x0 = Math.round(cx + s.side * W * .34 * f)
    const w = Math.max(2, Math.round(S * 1.5 * .15 * f)), h = Math.max(1, Math.round(S * .12 * f)), pole = Math.max(1, Math.round(S * .07 * f))
    for (let y = base - pole; y <= base; y++) put(x0, y, mix(P.gridFar, [0, 0, 0], .2))
    const top = base - pole - h, left = x0 - Math.floor(w / 2)
    for (let yy = top; yy < top + h; yy++) {
      for (let xx = left; xx < left + w; xx++) {
        const border = yy === top || yy === top + h - 1 || xx === left || xx === left + w - 1
        let c = border ? color : mix(color, [0, 0, 0], .72)
        if (!border && h >= 3 && yy === top + (h >> 1) && (xx - left) % 2 === 1) c = mix(color, [255, 255, 255], .35)
        put(xx, yy, c)
      }
    }
  }
  // the car: its tail lights say whose turn it is
  if (H >= 12) {
    const bob = sim.speed > .15 && Math.floor(t * 8) % 2 ? 1 : 0
    const left = Math.round(cx - 6), top = H - 6 - bob
    let tail = mix(P.tail, [0, 0, 0], .5)
    if (mode === 'waiting') tail = mix(P.tail, [255, 190, 200], .5 + .5 * Math.sin(t * 7))
    else if (sim.speed > .1) tail = P.tail
    if (t < sim.flashUntil) tail = [255, 245, 245]
    const map: Record<string, RGB> = { e: P.edge, w: P.window, b: P.body, t: tail, k: P.wheel, p: P.plate }
    CAR.forEach((row, ry) => [...row].forEach((ch, rx) => {
      const c = map[ch]
      if (c) put(left + rx, top + ry, c)
    }))
    if (sim.speed > .2 && Math.floor(t * 10) % 3) {
      put(left - 1, H - 2, [120, 110, 140])
      put(left + 13, H - 2, [120, 110, 140])
    }
  }
  // sparkles at the end of a turn
  if (t < sim.doneUntil) {
    for (let i = 0; i < 14; i++) put(Math.random() * W, Math.random() * hz * .8, mix([255, 240, 150], [255, 80, 210], Math.random()))
  }
  // VHS glitch when a tool fails
  if (t < sim.glitchUntil) {
    const amt = (sim.glitchUntil - t) / .9
    for (let y = 0; y < H; y++) {
      if (Math.random() > .35 * amt) continue
      const sh = Math.round((Math.random() * 2 - 1) * 4), row = px.slice(y * W, (y + 1) * W)
      for (let x = 0; x < W; x++) {
        const c = unpack(row[((x - sh) % W + W) % W] ?? 0)
        px[y * W + x] = pack([c[0] + 70, c[1] * .7, c[2]])
      }
    }
    const ny = Math.floor(Math.random() * H)
    for (let x = 0; x < W; x++) {
      const g = 120 + Math.random() * 135
      put(x, ny, [g, g, g])
    }
  }
}

function toCells(notes: Notes) {
  const pairs = new Set<number>()
  let i = 0
  for (let row = 0; row < ROWS - 1; row++) {
    for (let x = 0; x < W; x++) {
      const top = px[row * 2 * W + x] ?? 0, bot = px[(row * 2 + 1) * W + x] ?? 0
      words[i++] = 0x2580
      words[i++] = top
      words[i++] = bot
      pairs.add(top * 0x1000000 + bot)
    }
  }
  const line = hudLine(notes, W)
  for (let x = 0; x < W; x++) {
    const fg = line.colors[x] ?? HUD_TEXT
    words[i++] = line.text.codePointAt(x) ?? 0x20
    words[i++] = fg
    words[i++] = HUD_BG
    pairs.add(fg * 0x1000000 + HUD_BG)
  }
  return { cells: base64(new Uint8Array(words.buffer)), pairs: pairs.size }
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

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
type WithBase64 = Uint8Array & { toBase64?: () => string }

export function base64(bytes: Uint8Array): string {
  const native = (bytes as WithBase64).toBase64
  if (native) return native.call(bytes)
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHA[n >> 18]! + ALPHA[(n >> 12) & 63]! + ALPHA[(n >> 6) & 63]! + ALPHA[n & 63]!
  }
  const rest = bytes.length - i
  if (rest) {
    const n = ((bytes[i] ?? 0) << 16) | (rest > 1 ? (bytes[i + 1] ?? 0) << 8 : 0)
    out += ALPHA[n >> 18]! + ALPHA[(n >> 12) & 63]! + (rest > 1 ? ALPHA[(n >> 6) & 63]! : '=') + '='
  }
  return out
}
