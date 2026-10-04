// A rainy street in the neon district: the scene the mod is named after. It
// works in the strip and the pane. Apartment windows go dark as the context
// fills. The rain comes down harder the busier Claude is and stops when Claude
// needs you, when the light over the door pulses red. Each tool call lights a
// vertical neon sign spelling its kind in its kind's color, reflected in the
// wet street; a failed one sparks red. A finished turn lights every window.
//
// Buildings, windows, the door and the street are drawn in design pixels
// (S x S), so they keep their size; the rain and the signs' neon tubes are one
// pixel thin.

import { S, block, glitch, glyph, hash, line, mix, put, sparkles } from '../frame'
import type { Frame } from '../frame'
import { SIGN_COLORS, clamp } from '../signals'
import type { Mode, RGB, SignKind, Sim } from '../signals'

// Colors already on the Raster's #RGB grid, so nothing rounds to an odd hue.
const SKY: readonly RGB[] = [[0, 0, 17], [17, 0, 34], [34, 17, 51]]
const WALLS: readonly RGB[] = [[17, 17, 34], [34, 17, 51], [17, 0, 34], [34, 34, 51]]
const DARK_WINDOW: RGB = [0, 0, 17]
const LIGHTS: readonly RGB[] = [[255, 187, 102], [255, 187, 102], [255, 170, 85], [136, 204, 255], [255, 136, 187]]
const STREET: RGB = [17, 0, 34]
const CURB: RGB = [51, 34, 68]
const BOARD: RGB = [17, 0, 17]
const RAIN: RGB = [102, 136, 204]
const DOOR: RGB = [0, 0, 0]
const LAMP: RGB = [255, 204, 119]
const ALARM: RGB = [255, 40, 50]
const TUBES: readonly RGB[] = [[170, 34, 136], [0, 136, 170]]

// Plain letters, so the signs read in any font.
const LABEL: Record<SignKind, string> = { read: 'READ', edit: 'EDIT', bash: 'BASH', web: 'WEB', agent: 'AGENT', fail: 'FAIL' }

export function alley(f: Frame, sim: Sim, mode: Mode, t: number) {
  const { W, H } = f
  const rows = f.rows - 1
  // In design pixels: one per cell across, two per cell down.
  const wd = Math.floor(W / S), hd = Math.floor(H / S)
  const px = (x: number, y: number, c: RGB) => block(f, x * S, y * S, S, S, c)
  const night = clamp(sim.ctxShown / 100, 0, 1)
  const pulse = mode === 'waiting' ? .5 + .5 * Math.sin(t * 7) : 0
  const isParty = t < sim.doneUntil
  const curb = hd - 2

  // sky, stepped per cell row
  for (let row = 0; row < rows; row++) {
    const c = SKY[Math.min(SKY.length - 1, Math.floor((row / Math.max(1, rows - 1)) * SKY.length))] ?? STREET
    block(f, 0, row * 2 * S, W, 2 * S, c)
  }

  // the buildings: facades side by side, a gap between them
  let doorX = -1
  for (let x = 0, b = 0; x < wd; b++) {
    const w = 7 + Math.floor(hash(b * 7 + 1) * 8)
    const h = Math.round(hd * (.55 + hash(b * 13 + 2) * .35))
    const top = Math.max(0, curb - h)
    const wall = WALLS[Math.floor(hash(b * 3 + 5) * WALLS.length)] ?? WALLS[0]!
    block(f, x * S, top * S, (w - 1) * S, (curb - top) * S, wall)
    // windows: lit ones go dark as the context fills, all light up when a turn ends
    for (let wy = top + 1; wy < curb - 2; wy += 2) {
      for (let wx = x + 1; wx < x + w - 2; wx += 2) {
        const k = hash(b * 977 + wy * 31 + wx)
        const isLit = isParty || k > .1 + night * .85
        px(wx, wy, isLit ? LIGHTS[Math.floor(hash(k * 1e6) * LIGHTS.length)] ?? LIGHTS[0]! : DARK_WINDOW)
      }
    }
    if (doorX < 0 && x + w > wd / 2) doorX = Math.min(x + w - 4, Math.max(x + 1, Math.round(wd / 2) - 1))
    x += w
  }

  // two neon tubes that are always there, flickering now and then
  TUBES.forEach((tube, i) => {
    const tx = Math.round(wd * (i === 0 ? .17 : .83))
    const isOff = Math.sin(t * 3 + i * 5) > .97
    block(f, tx * S, Math.round(hd * .3) * S, 1, Math.max(2, Math.round(hd * .25)) * S, isOff ? mix(tube, BOARD, .7) : tube)
  })

  // the door, with its light: warm, or pulsing red while Claude needs you
  const lamp = mode === 'waiting' ? mix(ALARM, [255, 160, 160], pulse * .5) : LAMP
  if (doorX >= 0 && hd >= 6) {
    block(f, doorX * S, (curb - 3) * S, 2 * S, 3 * S, DOOR)
    block(f, doorX * S, (curb - 4) * S, 2 * S, S, lamp)
    px(doorX - 1, curb - 4, mix(lamp, BOARD, .6))
    px(doorX + 2, curb - 4, mix(lamp, BOARD, .6))
  }

  // the street: a curb and the wet road, which mirrors the lights above
  block(f, 0, curb * S, W, S, CURB)
  block(f, 0, (hd - 1) * S, W, S, STREET)
  if (doorX >= 0) block(f, doorX * S, (hd - 1) * S, 2 * S, S, mode === 'waiting' ? mix(ALARM, STREET, .4 - pulse * .3) : mix(LAMP, STREET, .6))

  // tool calls: a vertical neon sign lights up, flickering on, then fading out
  const slots = Math.max(3, Math.floor(wd / 10))
  // Consecutive signs step through the spots by a stride that shares no factor
  // with their number, so they never land on the same spot until all are used.
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const stride = [5, 7, 11, 13].find(n => gcd(n, slots) === 1) ?? 1
  const topRow = Math.floor(rows * .25)
  for (const s of sim.signs) {
    const sx = Math.round((((s.id * stride) % slots) + .5) * (wd / slots))
    const word = LABEL[s.kind]
    const letters = Math.max(1, Math.min(word.length, rows - topRow - 1))
    const life = (9 - s.z) / 8.35
    const on = life < .08 ? (Math.sin(t * 40 + s.id) > 0 ? 1 : .3) : life > .85 ? (1 - life) / .15 : 1
    const color = mix(BOARD, SIGN_COLORS[s.kind], .25 + .75 * on)
    // a dark board behind the letters, framed by a one-pixel neon tube
    const x0 = sx * S - 1, x1 = (sx + 1) * S, y0 = topRow * 4 - 1, y1 = (topRow + letters) * 4
    block(f, x0, y0, x1 - x0 + 1, y1 - y0 + 1, BOARD)
    for (let x = x0; x <= x1; x++) {
      put(f, x, y0, color)
      put(f, x, y1, color)
    }
    for (let y = y0; y <= y1; y++) {
      put(f, x0, y, color)
      put(f, x1, y, color)
    }
    for (let r = 0; r < letters; r++) glyph(f, sx, topRow + r, word[r] ?? ' ', color)
    block(f, (sx - 1) * S, (hd - 1) * S, 3 * S, S, mix(STREET, color, .3))
    block(f, sx * S, (hd - 1) * S, S, S, mix(STREET, color, .55))
    if (s.kind === 'fail' && life < .5) {
      for (let k = 0; k < 6; k++) {
        const n = s.id * 13 + k + Math.floor(t * 12) * 5
        put(f, (sx + hash(n) * 6 - 3) * S, (topRow * 2 + hash(n + 1) * letters * 2) * S, mix(ALARM, [255, 220, 120], hash(n + 2)))
      }
    }
  }

  // rain in thin streaks: harder the busier Claude is, none while Claude waits
  const drops = Math.round(clamp(sim.speed / .8, 0, 1.2) * ((W * H) / 70))
  const fall = sim.dist * 30
  const slant = .25 + sim.speed * .3
  for (let i = 0; i < drops; i++) {
    const len = 2 + hash(i * 5) * 2
    const y = ((hash(i * 3 + 2) * (H + len) + fall * (.8 + hash(i * 7) * .4)) % (H + len)) - len
    const x = hash(i * 3 + 1) * (W + H * slant) - y * slant
    line(f, x + len * slant, y - len, x, y, RAIN)
  }

  if (isParty) sparkles(f, sim, t, Math.max(1, Math.round(H * .3)))
  glitch(f, sim, t)
}
