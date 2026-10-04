// A rainy street in the neon district: the scene the mod is named after. It
// works in the strip and the pane. Apartment windows go dark as the context
// fills. The rain comes down harder the busier Claude is and stops when Claude
// needs you, when the light over the door pulses red. Each tool call lights a
// vertical neon sign spelling its kind in its kind's color, reflected in the
// wet street; a failed one sparks red. A finished turn lights every window.

import { glitch, glyph, hash, line, mix, put, sparkles } from '../frame'
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
  const night = clamp(sim.ctxShown / 100, 0, 1)
  const pulse = mode === 'waiting' ? .5 + .5 * Math.sin(t * 7) : 0
  const isParty = t < sim.doneUntil
  const curb = H - 2

  // sky, stepped per cell row
  for (let y = 0; y < H; y++) {
    const c = SKY[Math.min(SKY.length - 1, Math.floor((Math.floor(y / 2) / Math.max(1, rows - 1)) * SKY.length))] ?? STREET
    for (let x = 0; x < W; x++) put(f, x, y, c)
  }

  // the buildings: facades side by side, a one-pixel gap between them
  let doorX = -1
  for (let x = 0, b = 0; x < W; b++) {
    const w = 7 + Math.floor(hash(b * 7 + 1) * 8)
    const h = Math.round(H * (.55 + hash(b * 13 + 2) * .35))
    const top = Math.max(0, curb - h)
    const wall = WALLS[Math.floor(hash(b * 3 + 5) * WALLS.length)] ?? WALLS[0]!
    for (let y = top; y < curb; y++) for (let xx = x; xx < x + w - 1; xx++) put(f, xx, y, wall)
    // windows: lit ones go dark as the context fills, all light up when a turn ends
    for (let wy = top + 1; wy < curb - 2; wy += 2) {
      for (let wx = x + 1; wx < x + w - 2; wx += 2) {
        const k = hash(b * 977 + wy * 31 + wx)
        const isLit = isParty || k > .1 + night * .85
        put(f, wx, wy, isLit ? LIGHTS[Math.floor(hash(k * 1e6) * LIGHTS.length)] ?? LIGHTS[0]! : DARK_WINDOW)
      }
    }
    if (doorX < 0 && x + w > W / 2) doorX = Math.min(x + w - 4, Math.max(x + 1, Math.round(W / 2) - 1))
    x += w
  }

  // two neon tubes that are always there, flickering now and then
  TUBES.forEach((tube, i) => {
    const tx = Math.round(W * (i === 0 ? .17 : .83))
    const isOff = Math.sin(t * 3 + i * 5) > .97
    for (let y = Math.round(H * .3); y < Math.round(H * .3) + Math.max(2, Math.round(H * .25)); y++) put(f, tx, y, isOff ? mix(tube, BOARD, .7) : tube)
  })

  // the door, with its light: warm, or pulsing red while Claude needs you
  if (doorX >= 0 && H >= 6) {
    for (let y = curb - 3; y < curb; y++) for (let x = doorX; x < doorX + 2; x++) put(f, x, y, DOOR)
    const lamp = mode === 'waiting' ? mix(ALARM, [255, 160, 160], pulse * .5) : LAMP
    put(f, doorX, curb - 4, lamp)
    put(f, doorX + 1, curb - 4, lamp)
    put(f, doorX - 1, curb - 4, mix(lamp, BOARD, .6))
    put(f, doorX + 2, curb - 4, mix(lamp, BOARD, .6))
  }

  // the street: a curb and the wet road, which mirrors the lights above
  for (let x = 0; x < W; x++) {
    put(f, x, curb, CURB)
    put(f, x, H - 1, STREET)
  }
  if (doorX >= 0) {
    const lamp = mode === 'waiting' ? mix(ALARM, STREET, .4 - pulse * .3) : mix(LAMP, STREET, .6)
    put(f, doorX, H - 1, lamp)
    put(f, doorX + 1, H - 1, lamp)
  }

  // tool calls: a vertical neon sign lights up, flickering on, then fading out
  const slots = Math.max(3, Math.floor(W / 10))
  // Consecutive signs step through the spots by a stride that shares no factor
  // with their number, so they never land on the same spot until all are used.
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const stride = [5, 7, 11, 13].find(n => gcd(n, slots) === 1) ?? 1
  const topRow = Math.floor(rows * .25)
  for (const s of sim.signs) {
    const sx = Math.round((((s.id * stride) % slots) + .5) * (W / slots))
    const word = LABEL[s.kind]
    const letters = Math.max(1, Math.min(word.length, rows - topRow - 1))
    const life = (9 - s.z) / 8.35
    const on = life < .08 ? (Math.sin(t * 40 + s.id) > 0 ? 1 : .3) : life > .85 ? (1 - life) / .15 : 1
    const color = mix(BOARD, SIGN_COLORS[s.kind], .25 + .75 * on)
    for (let y = topRow * 2 - 1; y <= (topRow + letters) * 2; y++) {
      put(f, sx - 1, y, color)
      put(f, sx + 1, y, color)
      put(f, sx, y, y === topRow * 2 - 1 || y === (topRow + letters) * 2 ? color : BOARD)
    }
    for (let r = 0; r < letters; r++) glyph(f, sx, topRow + r, word[r] ?? ' ', color)
    for (let dx = -1; dx <= 1; dx++) put(f, sx + dx, H - 1, mix(STREET, color, dx === 0 ? .55 : .3))
    if (s.kind === 'fail' && life < .5) {
      for (let k = 0; k < 4; k++) {
        const n = s.id * 13 + k + Math.floor(t * 12) * 5
        put(f, sx + Math.round(hash(n) * 6 - 3), topRow * 2 + hash(n + 1) * letters * 2, mix(ALARM, [255, 220, 120], hash(n + 2)))
      }
    }
  }

  // rain in fine braille streaks: harder the busier Claude is, none while Claude waits
  const wd = W * 2, hd = rows * 4
  const drops = Math.round(clamp(sim.speed / .8, 0, 1.2) * ((wd * hd) / 70))
  const fall = sim.dist * 30
  const slant = .25 + sim.speed * .3
  for (let i = 0; i < drops; i++) {
    const len = 2 + hash(i * 5) * 2
    const y = ((hash(i * 3 + 2) * (hd + len) + fall * (.8 + hash(i * 7) * .4)) % (hd + len)) - len
    const x = hash(i * 3 + 1) * (wd + hd * slant) - y * slant
    line(f, x + len * slant, y - len, x, y, RAIN)
  }

  if (isParty) sparkles(f, sim, t, Math.max(1, Math.round(H * .3)))
  glitch(f, sim, t)
}
