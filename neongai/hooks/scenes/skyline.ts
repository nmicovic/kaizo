// The strip above the prompt: a side view of a neon city at night, made for a
// band only a few rows tall. The skyline scrolls by at Claude's pace, the sun
// sinks and reddens as the context fills, a sign drives past for each tool
// call, and the car's lights say whose turn it is.

import { get, glitch, mix, put, sparkles } from '../frame'
import type { Frame } from '../frame'
import { SIGN_COLORS, clamp } from '../signals'
import type { Mode, RGB, Sim } from '../signals'

const P = {
  skyTop: [10, 2, 30], skyMid: [56, 10, 96], skyLow: [150, 24, 110], horizon: [255, 96, 80],
  sunTop: [255, 224, 48], sunBot: [255, 40, 128], sunLate: [255, 70, 40],
  far: [40, 12, 78], near: [20, 6, 44], edge: [0, 200, 230], lit: [255, 190, 90], litCool: [120, 220, 255],
  road: [16, 4, 30], curb: [255, 46, 214], dash: [255, 120, 230], pole: [60, 20, 90],
  star: [255, 240, 255], body: [96, 56, 170], window: [20, 14, 50], tail: [255, 40, 70], alarm: [255, 40, 60],
  wheel: [6, 2, 12], head: [255, 245, 200], smoke: [120, 110, 140],
} as const satisfies Record<string, RGB>

// How far the road moves, in pixels, per unit of `sim.dist`.
const PX_PER_UNIT = 12

const CAR = [
  '....eeee....',
  '..eewwwwee..',
  'tbbbbbbbbbbh',
  '.kk......kk.',
]

/** A cheap repeatable hash in [0, 1): the same building always gets the same shape. */
function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return (x >>> 0) / 4294967296
}

/** One row of buildings, `scroll` pixels along; windows come and go every few seconds. */
function buildings(f: Frame, scroll: number, base: number, minH: number, maxH: number, slot: number, seed: number, body: RGB, edge: RGB | null, rate: number, t: number) {
  for (let x = 0; x < f.W; x++) {
    const wx = Math.floor(x + scroll)
    const i = Math.floor(wx / slot), at = wx - i * slot
    if (at >= slot - 1 - Math.floor(hash(i * 7 + seed) * 3)) continue
    const h = minH + Math.floor(hash(i * 13 + seed) * (maxH - minH + 1))
    const hasEdge = edge !== null && hash(i * 5 + seed) < .25
    const epoch = Math.floor(t / 5 + hash(i + seed) * 5)
    for (let k = 0; k < h; k++) {
      let c = body
      if (k === h - 1 && hasEdge && edge) c = mix(edge, body, .35)
      else if (k < h - 1 && at % 2 === 1 && k % 2 === 1 && hash(i * 31 + k * 7 + at + seed + epoch * 101) < rate) {
        c = mix(hash(i + seed) < .7 ? P.lit : P.litCool, body, .35)
      }
      put(f, x, base - k, c)
    }
  }
}

export function skyline(f: Frame, sim: Sim, mode: Mode, t: number) {
  const { W, H } = f
  const p = (x: number, y: number, c: RGB) => put(f, x, y, c)
  const night = clamp(sim.ctxShown / 100, 0, 1)
  const base = H - 3
  const scroll = sim.dist * PX_PER_UNIT

  // sky
  for (let y = 0; y <= base; y++) {
    const k = y / Math.max(1, base)
    let c = k < .45 ? mix(P.skyTop, P.skyMid, k / .45) : k < .8 ? mix(P.skyMid, P.skyLow, (k - .45) / .35) : mix(P.skyLow, P.horizon, (k - .8) / .2)
    c = mix(c, P.skyTop, night * .5 * (1 - k * .5))
    for (let x = 0; x < W; x++) p(x, y, c)
  }
  // stars: more of them as the context fills
  const stars = Math.round((W / 6) * (.3 + .7 * night))
  for (let i = 0; i < stars; i++) {
    const sx = Math.floor((((hash(i * 3 + 1) * W * 4 - scroll * .1) % W) + W) % W)
    const sy = Math.floor(hash(i * 3 + 2) * Math.max(1, base - 3))
    const b = .5 + .5 * Math.sin(t * (1 + hash(i) * 2) + i)
    if (b < .3) continue
    p(sx, sy, mix(get(f, sx, sy), P.star, b * .8))
  }
  // sun: high while there's plenty of context, set when it's full
  const r = Math.max(2, Math.round(H * .5))
  const cx = W * .72
  const cy = base - r * .9 + night * r * 1.7
  const pulse = mode === 'waiting' ? .5 + .5 * Math.sin(t * 7) : 0
  const flare = t < sim.doneUntil ? .4 * (sim.doneUntil - t) / 3 : 0
  const top = mix(P.sunTop, P.sunLate, night)
  const off = Math.floor(t * .8)
  for (let y = Math.max(0, Math.floor(cy - r - 2)); y <= base; y++) {
    for (let x = Math.floor(cx - r - 3); x <= Math.ceil(cx + r + 3); x++) {
      if (x < 0 || x >= W) continue
      const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= r) {
        if (r >= 6 && dy > r * .2 && (y + off) % 3 === 0) continue
        let c = mix(top, P.sunBot, clamp((dy + r) / (2 * r), 0, 1))
        if (pulse) c = mix(c, [255, 0, 200], pulse * .6)
        if (flare) c = mix(c, [255, 255, 230], flare)
        p(x, y, c)
      } else if (dist <= r + 2.5) {
        p(x, y, mix(get(f, x, y), P.sunBot, .22 * (1 - (dist - r) / 2.5)))
      }
    }
  }
  // the city, in two layers that scroll at different speeds
  buildings(f, scroll * .25, base, Math.max(1, Math.round(H * .2)), Math.max(2, Math.round(H * .4)), 7, 11, P.far, null, .18, t)
  buildings(f, scroll * .5, base, Math.max(1, Math.round(H * .1)), Math.max(1, Math.round(H * .3)), 9, 23, P.near, P.edge, .3, t)
  // neon signs: one per tool call, driving past from right to left
  const boxH = Math.max(2, Math.round(H * .25))
  for (const s of sim.signs) {
    const color = SIGN_COLORS[s.kind]
    const x0 = Math.round(W + 4 - ((9 - s.z) / 8.35) * (W + 12))
    const boxTop = Math.max(0, base - boxH - Math.round(H * .25) + (s.side > 0 ? 0 : 1))
    for (let y = boxTop + boxH; y <= base; y++) p(x0 + 2, y, P.pole)
    for (let y = boxTop; y < boxTop + boxH; y++) {
      for (let x = x0; x < x0 + 5; x++) {
        const isBorder = y === boxTop || y === boxTop + boxH - 1 || x === x0 || x === x0 + 4
        p(x, y, isBorder ? color : mix(color, [0, 0, 0], .6))
      }
    }
  }
  // the road: a neon curb and lane dashes rolling by; the curb pulses red when Claude needs you
  const curb = mode === 'waiting' ? mix(mix(P.curb, P.road, .35), P.alarm, .45 + .55 * pulse) : mix(P.curb, P.road, .35)
  for (let x = 0; x < W; x++) {
    p(x, H - 2, curb)
    const wx = Math.floor(x + scroll)
    p(x, H - 1, ((wx % 6) + 6) % 6 < 3 ? mix(P.dash, P.road, .5) : P.road)
  }
  // the car: tail lights pulse red when Claude needs you, everything flashes on a prompt
  if (H >= 6) {
    const left = Math.round(W * .16), carTop = base - 3
    let tail = mix(P.tail, [0, 0, 0], .5)
    if (mode === 'waiting') tail = mix(P.tail, [255, 190, 200], .5 + .5 * Math.sin(t * 7))
    else if (sim.speed > .1) tail = P.tail
    let head: RGB = sim.speed > .1 ? P.head : mix(P.head, [0, 0, 0], .5)
    if (t < sim.flashUntil) {
      tail = [255, 245, 245]
      head = [255, 255, 255]
    }
    if (sim.speed > .1) {
      for (let i = 1; i <= 4; i++) p(left + 11 + i, carTop + 2, mix(get(f, left + 11 + i, carTop + 2), P.head, .5 - i * .1))
    }
    const map: Record<string, RGB> = { e: P.edge, w: P.window, b: P.body, t: tail, h: head, k: P.wheel }
    CAR.forEach((row, ry) => [...row].forEach((ch, rx) => {
      const c = map[ch]
      if (c) p(left + rx, carTop + ry, c)
    }))
    if (sim.speed > .2 && Math.floor(t * 10) % 3) p(left - 1 - (Math.floor(t * 10) % 3), carTop + 2, P.smoke)
  }
  sparkles(f, sim, t, Math.max(1, base - 2))
  glitch(f, sim, t)
}
