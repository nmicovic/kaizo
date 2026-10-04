// The big view for the side pane: a road running into a synthwave sunset.
// The sun's height is the context left, the grid's speed is Claude's phase,
// a sign goes up by the road for each tool call, and the car's tail lights say
// whose turn it is.

import { get, glitch, mix, put, sparkles } from '../frame'
import type { Frame } from '../frame'
import { SIGN_COLORS, clamp } from '../signals'
import type { Mode, RGB, Sim } from '../signals'

const P = {
  skyTop: [10, 2, 30], skyMid: [56, 10, 96], skyLow: [176, 24, 112], horizon: [255, 112, 64],
  sunTop: [255, 224, 48], sunBot: [255, 40, 128], mtnFar: [46, 12, 88], mtnNear: [24, 6, 52],
  edge: [0, 230, 255], ground: [12, 0, 28], grid: [255, 46, 214], gridFar: [84, 18, 116],
  star: [255, 240, 255], body: [62, 36, 118], window: [14, 10, 36], tail: [255, 40, 70],
  wheel: [6, 2, 12], plate: [255, 224, 48],
} as const satisfies Record<string, RGB>

let seed = 11
const srnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const STARS = Array.from({ length: 110 }, () => ({ x: srnd(), y: srnd(), ph: srnd() * 6.283, sp: 1 + srnd() * 2.5, k: srnd() }))
const PEAKS_FAR = [[.03, .95], [.13, .7], [.22, .5], [.31, .3], [.69, .35], [.78, .55], [.88, .8], [.97, .6]] as const
const PEAKS_NEAR = [[.08, .55], [.18, .4], [.27, .22], [.74, .25], [.84, .45], [.94, .5]] as const
const CAR = ['...eeeeeee...', '..ewwwwwwwe..', '.bbbbbbbbbbb.', 'ttbbbpppbbbtt', 'kk.........kk']

export function sunset(f: Frame, sim: Sim, mode: Mode, t: number) {
  const { W, H } = f
  const p = (x: number, y: number, c: RGB) => put(f, x, y, c)
  // S scales the sun, mountains, signs and car, so a tall pane doesn't grow a
  // sun wider than the road.
  const S = Math.min(H, W * .67)
  const hz = Math.round(H * .56), Gh = H - hz, cx = (W - 1) / 2
  const night = clamp(sim.ctxShown / 100, 0, 1)

  // sky, in 9 retro bands
  for (let y = 0; y < hz; y++) {
    const k = Math.floor((y / Math.max(1, hz - 1)) * 9) / 9
    let c = k < .5 ? mix(P.skyTop, P.skyMid, k * 2) : k < .85 ? mix(P.skyMid, P.skyLow, (k - .5) / .35) : mix(P.skyLow, P.horizon, (k - .85) / .15)
    c = mix(c, P.skyTop, night * .55 * (1 - k * .6))
    for (let x = 0; x < W; x++) p(x, y, c)
  }
  // stars: more of them as the context fills
  for (const s of STARS) {
    if (s.k > .3 + .7 * night) continue
    const sx = Math.floor(s.x * W), sy = Math.floor(s.y * hz * .62)
    const b = .5 + .5 * Math.sin(t * s.sp + s.ph)
    if (b < .3) continue
    p(sx, sy, mix(get(f, sx, sy), P.star, b * .9))
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
        p(x, y, c)
      } else if (dist <= r + 2.6) {
        p(x, y, mix(get(f, x, y), P.sunBot, .24 * (1 - (dist - r) / 2.6)))
      }
    }
  }
  // mountains, low in the middle so the sun stays visible
  const mh = S * .2
  const ridge = (pk: readonly (readonly [number, number])[], u: number, w: number) =>
    pk.reduce((m, q) => Math.max(m, q[1] * (1 - Math.abs(u - q[0]) / w)), 0)
  for (let x = 0; x < W; x++) {
    const u = x / Math.max(1, W - 1)
    const h1 = Math.round(mh * ridge(PEAKS_FAR, u, .11)), h2 = Math.round(mh * .75 * ridge(PEAKS_NEAR, u, .09))
    for (let k = 0; k < h1; k++) p(x, hz - 1 - k, k === h1 - 1 && h1 > 1 ? mix(P.mtnFar, P.edge, .5) : P.mtnFar)
    for (let k = 0; k < h2; k++) p(x, hz - 1 - k, k === h2 - 1 && h2 > 1 ? P.edge : P.mtnNear)
  }
  // ground and the rolling grid: its speed is how busy Claude is
  const gcol = (y: number) => mix(mix(P.horizon, [0, 0, 0], .62), P.ground, Math.min(1, ((y - hz) / Gh) * 3))
  for (let y = hz; y < H; y++) {
    const c = gcol(y)
    for (let x = 0; x < W; x++) p(x, y, c)
  }
  for (let k = -9; k <= 9; k++) {
    const xb = cx + k * W * .2
    for (let y = hz + 1; y < H; y++) {
      const q = (y - hz) / Gh
      if (q < .1) continue
      p(cx + (xb - cx) * q, y, mix(gcol(y), P.grid, clamp(q * 1.3, .2, 1)))
    }
  }
  const ph = sim.dist % 1
  for (let j = 0; j < 14; j++) {
    const z = j + 1 - ph
    if (z < .5) continue
    const y = hz + Math.round(Gh / z)
    if (y >= H || y <= hz) continue
    const c = mix(gcol(y), P.grid, clamp(1.6 / z, .18, 1))
    for (let x = 0; x < W; x++) p(x, y, c)
  }
  for (let x = 0; x < W; x++) p(x, hz, mix(P.horizon, P.grid, .25))
  // neon signs: one per tool call, colored by kind
  for (const s of sim.signs.slice().sort((a, b) => b.z - a.z)) {
    const color = SIGN_COLORS[s.kind]
    const q = 1 / s.z, base = hz + Math.round(Gh * q), x0 = Math.round(cx + s.side * W * .34 * q)
    const w = Math.max(2, Math.round(S * 1.5 * .15 * q)), h = Math.max(1, Math.round(S * .12 * q)), pole = Math.max(1, Math.round(S * .07 * q))
    for (let y = base - pole; y <= base; y++) p(x0, y, mix(P.gridFar, [0, 0, 0], .2))
    const top = base - pole - h, left = x0 - Math.floor(w / 2)
    for (let yy = top; yy < top + h; yy++) {
      for (let xx = left; xx < left + w; xx++) {
        const border = yy === top || yy === top + h - 1 || xx === left || xx === left + w - 1
        let c = border ? color : mix(color, [0, 0, 0], .72)
        if (!border && h >= 3 && yy === top + (h >> 1) && (xx - left) % 2 === 1) c = mix(color, [255, 255, 255], .35)
        p(xx, yy, c)
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
      if (c) p(left + rx, top + ry, c)
    }))
    if (sim.speed > .2 && Math.floor(t * 10) % 3) {
      p(left - 1, H - 2, [120, 110, 140])
      p(left + 13, H - 2, [120, 110, 140])
    }
  }
  sparkles(f, sim, t, hz * .8)
  glitch(f, sim, t)
}
