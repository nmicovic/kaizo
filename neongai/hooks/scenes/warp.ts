// A starfield seen from a ship at warp, in one-pixel stars and streaks. It works in the
// strip and the pane. Stars stream past at Claude's pace and stretch into
// streaks when it's busy. The planet ahead grows as the context fills. Each
// tool call is a comet in its kind's color, and when Claude needs you the ship
// drops out of warp under a red alert. A finished turn flashes.

import { S, block, glitch, hash, line, mix, put, sparkles } from '../frame'
import type { Frame } from '../frame'
import { SIGN_COLORS, clamp } from '../signals'
import type { Mode, RGB, Sim } from '../signals'

const SPACE: RGB = [2, 2, 12]
const SPACE_LOW: RGB = [6, 2, 20]
const STAR: RGB = [220, 230, 255]
const STAR_FAR: RGB = [50, 60, 110]
const PLANET_LIT: RGB = [120, 90, 220]
const PLANET_DARK: RGB = [20, 10, 50]
const AIR: RGB = [0, 200, 230]
const ALARM: RGB = [255, 40, 50]

export function warp(f: Frame, sim: Sim, mode: Mode, t: number) {
  const { W, H } = f
  const wd = W, hd = H
  const cx = wd / 2, cy = hd / 2
  const night = clamp(sim.ctxShown / 100, 0, 1)
  const pulse = mode === 'waiting' ? .5 + .5 * Math.sin(t * 7) : 0
  const flash = t < sim.doneUntil ? clamp((sim.doneUntil - t) / 3, 0, 1) : 0

  // space, flashing pale at the end of a turn. It steps per cell row, so a cell
  // holding dots (drawn over its top pixel) matches the cells beside it.
  for (let row = 0; row < f.rows - 1; row++) {
    const c = mix(mix(SPACE, SPACE_LOW, row / Math.max(1, f.rows - 2)), [150, 160, 230], flash * flash * .45)
    block(f, 0, row * 4, W, 4, c)
  }

  // the planet ahead: it grows as the context fills
  const pr = Math.max(1, Math.min(W, H) * (.06 + .3 * night))
  const pcx = W / 2, pcy = H / 2
  for (let y = Math.floor(pcy - pr - 2 * S); y <= pcy + pr + 2 * S; y++) {
    for (let x = Math.floor(pcx - pr - 2 * S); x <= pcx + pr + 2 * S; x++) {
      const d = Math.hypot(x - pcx, y - pcy)
      if (d <= pr) put(f, x, y, mix(PLANET_DARK, PLANET_LIT, clamp(.55 - (x - pcx) / (pr * 2) - (y - pcy) / (pr * 3), 0, 1)))
      else if (d <= pr + 1.5 * S) put(f, x, y, mix(SPACE, AIR, .35 * (1 - (d - pr) / (1.5 * S))))
    }
  }
  // The planet's disc hides the stars behind it.
  const isBehindPlanet = (x: number, y: number) => Math.hypot(x - pcx, y - pcy) < pr

  // stars: each one cycles from far (z = 1) to here (z = 0) as the ship travels
  const stars = Math.min(400, Math.round((wd * hd) / 40))
  const isWarping = sim.speed > .25
  for (let i = 0; i < stars; i++) {
    const angle = hash(i * 3 + 1) * Math.PI * 2
    const z = 1 - ((hash(i * 3 + 2) + sim.dist * .35) % 1)
    if (z < .03) continue
    const at = (depth: number) => {
      const r = .04 / depth
      return [cx + Math.cos(angle) * r * cx, cy + Math.sin(angle) * r * cy] as const
    }
    const [x, y] = at(z)
    if (isBehindPlanet(x, y)) continue
    const c = mix(STAR_FAR, STAR, 1 - z)
    if (isWarping) {
      const [px, py] = at(Math.min(1, z + sim.speed * .08))
      line(f, px, py, x, y, c)
    } else {
      put(f, x, y, c)
    }
  }

  // tool calls: a comet flying out from the center, in its kind's color
  for (const s of sim.signs) {
    const angle = hash(s.id * 11 + 5) * Math.PI * 2
    const p = (9 - s.z) / 8.35
    const head = (q: number) => [cx + Math.cos(angle) * q * cx * 1.1, cy + Math.sin(angle) * q * cy * 1.1] as const
    const color = SIGN_COLORS[s.kind]
    for (let k = 5; k >= 0; k--) {
      const [x, y] = head(Math.max(0, p * p - k * .025))
      block(f, x, y, k === 0 ? S : 1, k === 0 ? S : 1, k === 0 ? mix(color, [255, 255, 255], .4) : mix(color, SPACE, k / 7))
    }
  }

  // red alert while Claude needs you: the edges of the view pulse red
  if (pulse || mode === 'waiting') {
    const c = mix(SPACE, ALARM, .35 + .5 * pulse)
    block(f, 0, 0, W, S, c)
    block(f, 0, H - S, W, S, c)
    block(f, 0, 0, S, H, c)
    block(f, W - S, 0, S, H, c)
  }

  sparkles(f, sim, t, H)
  glitch(f, sim, t)
}
