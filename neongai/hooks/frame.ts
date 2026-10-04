// The canvas every scene paints on: a picture of 2 x 4 pixels per cell above a
// one-row status line. finish() turns each cell's 8 pixels into the character
// that draws them best: a plain cell for a flat area, a half or quarter block
// (▀ ▄ ▌ ▐ ▘ ▝ ▖ ▗ ▚ ▞ ▙ ▛ ▜ ▟) for an edge, or braille dots for fine detail
// such as stars, rain and thin lines. That is up to four times the detail of
// one half block per cell, in any terminal. A scene can also put a character
// in a cell (glyph()).
//
// The pixels are square. Things with a fixed size should be drawn S pixels to
// one design pixel (block()), so they keep their size on screen; smooth shapes
// (circles, lines, gradients) use the full resolution.

import { clamp, hudLine } from './signals'
import type { Notes, RGB, Sim } from './signals'

/** Pixels per design pixel: one cell is 1 x 2 design pixels and 2 x 4 pixels. */
export const S = 2

export type Frame = {
  /** Pixels across and down: 2 per cell across, 4 per scene row down. */
  W: number
  H: number
  cols: number
  /** Rows of cells, the status line included. */
  rows: number
  px: Uint32Array
  /** A character per scene cell, 0 for none; its color is in glyphFg. */
  glyphs: Uint32Array
  glyphFg: Uint32Array
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
    const sceneRows = Math.max(0, rows - 1)
    f = {
      W: cols * 2, H: sceneRows * 4, cols, rows,
      px: new Uint32Array(cols * 2 * sceneRows * 4),
      glyphs: new Uint32Array(cols * sceneRows), glyphFg: new Uint32Array(cols * sceneRows),
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

export const get = (f: Frame, x: number, y: number) => unpack(f.px[Math.round(y) * f.W + Math.round(x)] ?? 0)

/** Fills a rectangle of pixels: `block(f, x * S, y * S, S, S, c)` draws one design pixel. */
export function block(f: Frame, x: number, y: number, w: number, h: number, c: RGB) {
  const v = pack(c)
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y))
  const x1 = Math.min(f.W, Math.round(x + w)), y1 = Math.min(f.H, Math.round(y + h))
  for (let yy = y0; yy < y1; yy++) f.px.fill(v, yy * f.W + x0, yy * f.W + Math.max(x0, x1))
}

/** A one-pixel line: thin, so it comes out as braille dots or fine block edges. */
export function line(f: Frame, x0: number, y0: number, x1: number, y1: number, c: RGB) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  for (let k = 0; k <= steps; k++) put(f, x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, c)
}

/** Puts a character in a scene cell (column, row), drawn in color `c`. It must be one width-1 character. */
export function glyph(f: Frame, col: number, row: number, ch: string, c: RGB) {
  if (col < 0 || row < 0 || col >= f.cols || row >= f.rows - 1) return
  const i = row * f.cols + col
  f.glyphs[i] = ch.codePointAt(0) ?? 0x20
  f.glyphFg[i] = pack(c)
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
  for (let i = 0; i < 14 * Math.max(1, f.cols / 60); i++) {
    const c = mix([255, 240, 150], [255, 80, 210], Math.random())
    block(f, Math.random() * f.W, Math.random() * skyBottom, Math.random() < .3 ? S : 1, Math.random() < .3 ? S : 1, c)
  }
}

/** The VHS glitch when a tool fails: rows jump sideways and turn red. */
export function glitch(f: Frame, sim: Sim, t: number) {
  if (t >= sim.glitchUntil) return
  const amt = (sim.glitchUntil - t) / .9
  for (let y = 0; y < f.H; y += S) {
    if (Math.random() > .35 * amt) continue
    const sh = Math.round((Math.random() * 2 - 1) * 4) * S
    for (let yy = y; yy < Math.min(f.H, y + S); yy++) {
      const row = f.px.slice(yy * f.W, (yy + 1) * f.W)
      for (let x = 0; x < f.W; x++) {
        const c = unpack(row[((x - sh) % f.W + f.W) % f.W] ?? 0)
        f.px[yy * f.W + x] = pack([c[0] + 70, c[1] * .7, c[2]])
      }
    }
  }
  const ny = Math.floor(Math.random() * (f.H / S)) * S
  for (let x = 0; x < f.W; x++) {
    const g = 120 + Math.random() * 135
    block(f, x, ny, 1, S, [g, g, g])
  }
}

// A cell's pixels are numbered y * 2 + x. The quadrant blocks cover 2 x 2 of
// them each.
const UL = 0b00000101, UR = 0b00001010, LL = 0b01010000, LR = 0b10100000
const BLOCKS: readonly (readonly [number, number])[] = [
  [UL | UR, 0x2580], [LL | LR, 0x2584], [UL | LL, 0x258C], [UR | LR, 0x2590],
  [UL, 0x2598], [UR, 0x259D], [LL, 0x2596], [LR, 0x2597], [UL | LR, 0x259A], [UR | LL, 0x259E],
  [UL | LL | LR, 0x2599], [UL | UR | LL, 0x259B], [UL | UR | LR, 0x259C], [UR | LL | LR, 0x259F],
]
// The braille dot for each pixel of a cell.
const BRAILLE_BIT = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80]
// Braille dots look lighter than solid blocks, so they win only when a block
// would blur real detail.
const BRAILLE_PENALTY = 900

const R = new Float64Array(8), G = new Float64Array(8), B = new Float64Array(8)
// Rounds to the Raster's #RGB grid, which keeps the color pairs few.
const snap = (v: number) => Math.round(v / 17) * 17
const packSnapped = (r: number, g: number, b: number) => (snap(r) << 16) | (snap(g) << 8) | snap(b)

// What fit() found; module variables, so picking a cell allocates nothing.
let fitErr = 0, fitFg = 0, fitBg = 0

/** How well two colors split by `mask` draw the cell: sets fitErr (lower is better), fitFg and fitBg. */
function fit(mask: number, penalty: number, best: number) {
  let n1 = 0, r1 = 0, g1 = 0, b1 = 0, r0 = 0, g0 = 0, b0 = 0
  for (let k = 0; k < 8; k++) {
    if (mask >> k & 1) { n1++; r1 += R[k]!; g1 += G[k]!; b1 += B[k]! } else { r0 += R[k]!; g0 += G[k]!; b0 += B[k]! }
  }
  const n0 = 8 - n1
  r1 /= n1; g1 /= n1; b1 /= n1; r0 /= n0; g0 /= n0; b0 /= n0
  let err = penalty
  for (let k = 0; k < 8 && err < best; k++) {
    const on = mask >> k & 1
    const dr = R[k]! - (on ? r1 : r0), dg = G[k]! - (on ? g1 : g0), db = B[k]! - (on ? b1 : b0)
    err += dr * dr + dg * dg + db * db
  }
  fitErr = err
  // Colors only matter when this split beats the best so far.
  if (err < best) {
    fitFg = packSnapped(r1, g1, b1)
    fitBg = packSnapped(r0, g0, b0)
  }
}

// What pickCell() chose.
let pickCh = 0x20, pickFg = 0, pickBg = 0

/** The best character for the 8 pixels in R, G, B: sets pickCh, pickFg and pickBg. */
function pickCell() {
  let best = Infinity
  for (const [mask, ch] of BLOCKS) {
    fit(mask, 0, best)
    if (fitErr < best) {
      best = fitErr
      pickCh = ch
      pickFg = fitFg
      pickBg = fitBg
    }
    if (best === 0) return
  }
  // Braille: split the pixels into a light and a dark group; the smaller group is drawn as dots.
  let lo = 0, hi = 0
  for (let k = 1; k < 8; k++) {
    const l = R[k]! + G[k]! + B[k]!
    if (l < R[lo]! + G[lo]! + B[lo]!) lo = k
    if (l > R[hi]! + G[hi]! + B[hi]!) hi = k
  }
  let mask = 0
  for (let k = 0; k < 8; k++) {
    const dl = (R[k]! - R[lo]!) ** 2 + (G[k]! - G[lo]!) ** 2 + (B[k]! - B[lo]!) ** 2
    const dh = (R[k]! - R[hi]!) ** 2 + (G[k]! - G[hi]!) ** 2 + (B[k]! - B[hi]!) ** 2
    if (dh < dl) mask |= 1 << k
  }
  let dots = 0
  for (let k = 0; k < 8; k++) if (mask >> k & 1) dots++
  if (dots > 4) mask ^= 0xFF
  if (mask && mask !== 0xFF) {
    fit(mask, BRAILLE_PENALTY, best)
    if (fitErr < best) {
      let bits = 0
      for (let k = 0; k < 8; k++) if (mask >> k & 1) bits |= BRAILLE_BIT[k]!
      pickCh = 0x2800 + bits
      pickFg = fitFg
      pickBg = fitBg
    }
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
    for (let col = 0; col < f.cols; col++) {
      let isFlat = true
      const first = f.px[row * 4 * f.W + col * 2] ?? 0
      for (let k = 0; k < 8; k++) {
        const v = f.px[(row * 4 + (k >> 1)) * f.W + col * 2 + (k & 1)] ?? 0
        if (v !== first) isFlat = false
        R[k] = (v >> 16) & 255
        G[k] = (v >> 8) & 255
        B[k] = v & 255
      }
      let ch: number, fg: number, bg: number
      const g = f.glyphs[row * f.cols + col] ?? 0
      if (g) {
        let r = 0, gg = 0, b = 0
        for (let k = 0; k < 8; k++) { r += R[k]!; gg += G[k]!; b += B[k]! }
        ;[ch, fg, bg] = [g, f.glyphFg[row * f.cols + col] ?? 0, packSnapped(r / 8, gg / 8, b / 8)]
      } else if (isFlat) {
        const c = packSnapped((first >> 16) & 255, (first >> 8) & 255, first & 255)
        ;[ch, fg, bg] = [0x20, c, c]
      } else {
        pickCell()
        ;[ch, fg, bg] = [pickCh, pickFg, pickBg]
      }
      f.words[i++] = ch
      f.words[i++] = fg
      f.words[i++] = bg
      pairs.add(fg * 0x1000000 + bg)
    }
  }
  const line = hudLine(notes, f.cols)
  for (let x = 0; x < f.cols; x++) {
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
