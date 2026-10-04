// The canvas every scene paints on: a picture of `cols` x 2*(rows-1) pixels
// above a one-row status line. finish() packs it into Raster cells: each cell
// is `▀` with the top pixel as its foreground and the bottom pixel as its
// background, and the last row is the status line as text cells. A scene can
// also put a character in a cell (glyph()), or braille dots (dot(), line()):
// 2 x 4 fine dots per cell, for thin lines and stars. Either is drawn over the
// cell's top pixel as its background, a character winning over dots.

import { clamp, hudLine } from './signals'
import type { Notes, RGB, Sim } from './signals'

export type Frame = {
  W: number
  H: number
  rows: number
  px: Uint32Array
  /** A character per scene cell, 0 for none; its color is in glyphFg. */
  glyphs: Uint32Array
  glyphFg: Uint32Array
  /** Braille dots per scene cell (one bit per dot), and their color. */
  dots: Uint8Array
  dotFg: Uint32Array
  words: Uint32Array
}

const HUD_BG = 0x12002A
const frames = new Map<string, Frame>()

/** A frame of this size, kept while the size stays (the pane and the band each have one). */
export function frameFor(cols: number, rows: number): Frame {
  const id = `${cols}x${rows}`
  let f = frames.get(id)
  if (!f) {
    if (frames.size >= 4) frames.clear()
    const H = Math.max(0, (rows - 1) * 2)
    const cells = cols * Math.max(0, rows - 1)
    f = {
      W: cols, H, rows, px: new Uint32Array(cols * H),
      glyphs: new Uint32Array(cells), glyphFg: new Uint32Array(cells),
      dots: new Uint8Array(cells), dotFg: new Uint32Array(cells),
      words: new Uint32Array(cols * rows * 3),
    }
    frames.set(id, f)
  }
  return f
}

export const mix = (a: RGB, b: RGB, k: number): RGB =>
  [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

const pack = (c: RGB) =>
  (clamp(Math.round(c[0]), 0, 255) << 16) | (clamp(Math.round(c[1]), 0, 255) << 8) | clamp(Math.round(c[2]), 0, 255)
const unpack = (v: number): RGB => [(v >> 16) & 255, (v >> 8) & 255, v & 255]

export function put(f: Frame, x: number, y: number, c: RGB) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= f.W || y >= f.H) return
  f.px[y * f.W + x] = pack(c)
}

export const get = (f: Frame, x: number, y: number) => unpack(f.px[y * f.W + x] ?? 0)

/** Puts a character in a scene cell (column, row), drawn in color `c`. It must be one width-1 character. */
export function glyph(f: Frame, col: number, row: number, ch: string, c: RGB) {
  if (col < 0 || row < 0 || col >= f.W || row >= f.rows - 1) return
  const i = row * f.W + col
  f.glyphs[i] = ch.codePointAt(0) ?? 0x20
  f.glyphFg[i] = pack(c)
}

// Braille bit for each dot of a cell, by column (0, 1) then row (0 to 3).
const BRAILLE = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]] as const

/** Lights one braille dot. Dots run 2 per cell across and 4 per cell down. */
export function dot(f: Frame, x: number, y: number, c: RGB) {
  x = Math.round(x)
  y = Math.round(y)
  if (x < 0 || y < 0 || x >= f.W * 2 || y >= (f.rows - 1) * 4) return
  const i = (y >> 2) * f.W + (x >> 1)
  f.dots[i] = (f.dots[i] ?? 0) | (BRAILLE[x & 1]?.[y & 3] ?? 0)
  f.dotFg[i] = pack(c)
}

/** A line of braille dots, in dot coordinates. */
export function line(f: Frame, x0: number, y0: number, x1: number, y1: number, c: RGB) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  for (let k = 0; k <= steps; k++) dot(f, x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, c)
}

/** A cheap repeatable hash in [0, 1): the same input always gives the same shape. */
export function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/** Sparkles in the sky at the end of a turn. */
export function sparkles(f: Frame, sim: Sim, t: number, skyBottom: number) {
  if (t >= sim.doneUntil) return
  for (let i = 0; i < 14 * Math.max(1, f.W / 60); i++) {
    put(f, Math.random() * f.W, Math.random() * skyBottom, mix([255, 240, 150], [255, 80, 210], Math.random()))
  }
}

/** The VHS glitch when a tool fails: rows jump sideways and turn red. */
export function glitch(f: Frame, sim: Sim, t: number) {
  if (t >= sim.glitchUntil) return
  const amt = (sim.glitchUntil - t) / .9
  for (let y = 0; y < f.H; y++) {
    if (Math.random() > .35 * amt) continue
    const sh = Math.round((Math.random() * 2 - 1) * 4), row = f.px.slice(y * f.W, (y + 1) * f.W)
    for (let x = 0; x < f.W; x++) {
      const c = unpack(row[((x - sh) % f.W + f.W) % f.W] ?? 0)
      f.px[y * f.W + x] = pack([c[0] + 70, c[1] * .7, c[2]])
    }
  }
  const ny = Math.floor(Math.random() * f.H)
  for (let x = 0; x < f.W; x++) {
    const g = 120 + Math.random() * 135
    put(f, x, ny, [g, g, g])
  }
}

/**
 * Packs the picture and the status line into Raster cells. `pairs` counts the
 * distinct color pairs: the Raster paints 1024 at once.
 */
export function finish(f: Frame, notes: Notes) {
  const pairs = new Set<number>()
  let i = 0
  for (let row = 0; row < f.rows - 1; row++) {
    for (let x = 0; x < f.W; x++) {
      const top = f.px[row * 2 * f.W + x] ?? 0, bot = f.px[(row * 2 + 1) * f.W + x] ?? 0
      const mask = f.dots[row * f.W + x] ?? 0
      const ch = f.glyphs[row * f.W + x] || (mask ? 0x2800 + mask : 0)
      const fg = f.glyphs[row * f.W + x] ? f.glyphFg[row * f.W + x] ?? 0 : mask ? f.dotFg[row * f.W + x] ?? 0 : top
      const bg = ch ? top : bot
      f.words[i++] = ch || 0x2580
      f.words[i++] = fg
      f.words[i++] = bg
      pairs.add(fg * 0x1000000 + bg)
    }
  }
  const line = hudLine(notes, f.W)
  for (let x = 0; x < f.W; x++) {
    const fg = line.colors[x] ?? 0xDEDEDE
    f.words[i++] = line.text.codePointAt(x) ?? 0x20
    f.words[i++] = fg
    f.words[i++] = HUD_BG
    pairs.add(fg * 0x1000000 + HUD_BG)
  }
  return { cells: base64(new Uint8Array(f.words.buffer)), pairs: pairs.size }
}

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
