// Spinning 3D wireframes in one-pixel lines, Tron style. It works in the
// strip and the pane. The solid spins at Claude's pace and stops, its edges
// blinking red, when Claude needs you. The ring around it is lit for the
// context left. Each tool call is a small cube in its kind's color that orbits
// once along the ring, and a finished turn bursts the solid into points that
// fly back together.

import { S, block, glitch, hash, line, mix, put, sparkles } from '../frame'
import type { Frame } from '../frame'
import { SIGN_COLORS, clamp } from '../signals'
import type { Mode, RGB, Sim } from '../signals'

type V3 = readonly [number, number, number]

const PHI = (1 + Math.sqrt(5)) / 2
const unit = (v: V3[]): V3[] => v.map(([x, y, z]) => {
  const n = Math.hypot(x, y, z)
  return [x / n, y / n, z / n] as V3
})
const ICO = unit([
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
])
const CUBE = unit([-1, 1].flatMap(x => [-1, 1].flatMap(y => [-1, 1].map(z => [x, y, z] as V3))))

/** The edges of a solid with equal edges: every pair of corners at the shortest distance. */
function edgesOf(v: V3[]): [number, number][] {
  const d = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
  let shortest = Infinity
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) shortest = Math.min(shortest, d(v[i]!, v[j]!))
  const out: [number, number][] = []
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) if (d(v[i]!, v[j]!) < shortest * 1.001) out.push([i, j])
  return out
}
const ICO_EDGES = edgesOf(ICO)
const CUBE_EDGES = edgesOf(CUBE)

// The background steps through colors on the Raster's #RGB grid: a smooth dark
// gradient would round to a dull red band halfway down.
const BG: readonly RGB[] = [[0, 0, 17], [0, 0, 34], [17, 0, 34]]
const BG_BOTTOM: RGB = [17, 0, 34]
const EDGE: RGB = [0, 230, 255]
const EDGE_FAR: RGB = [0, 70, 120]
const RING: RGB = [255, 60, 200]
const RING_OFF: RGB = [60, 16, 70]
const ALARM: RGB = [255, 50, 60]

/** Turns around the vertical axis by `a`, then tips toward you by `b`. */
function turn([x, y, z]: V3, a: number, b: number): V3 {
  const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = z * Math.cos(a) - x * Math.sin(a)
  return [x1, y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)]
}

export function wireframe(f: Frame, sim: Sim, mode: Mode, t: number) {
  const { W, H } = f
  const wd = W, hd = H
  const cx = wd / 2, cy = hd / 2
  const night = clamp(sim.ctxShown / 100, 0, 1)
  const pulse = mode === 'waiting' ? .5 + .5 * Math.sin(t * 7) : 0
  const isFailing = t < sim.glitchUntil

  // background: a dark gradient with a few stars. It steps per cell row, so a
  // cell holding dots (drawn over its top pixel) matches the cells beside it.
  for (let row = 0; row < f.rows - 1; row++) {
    const c = BG[Math.min(BG.length - 1, Math.floor((row / Math.max(1, f.rows - 1)) * BG.length))] ?? BG_BOTTOM
    block(f, 0, row * 4, W, 4, c)
  }
  for (let i = 0; i < W / S / 4; i++) {
    if (Math.sin(t * (1 + hash(i)) + i) > .2) put(f, hash(i * 3 + 1) * W, hash(i * 3 + 2) * H, [120, 120, 170])
  }

  const R = Math.max(3, Math.min(hd * .36, wd * .2))
  // In a wide strip the ring stretches across, so the tool cubes travel the whole width.
  const rx = Math.min(wd * .45, Math.max(R * 1.9, wd * .35))
  const ry = Math.min(hd * .45, Math.max(R * .55, hd * .3))
  // A point in 3D, `size` dots across, seen from a little way off.
  const project = (v: V3, size: number, ox = cx, oy = cy) => {
    const k = 4 / (4 + v[2])
    return [ox + v[0] * size * k, oy - v[1] * size * k, v[2]] as const
  }

  // the ring: lit for the context left. Its back half is drawn behind the solid.
  const ringDot = (isFront: boolean) => {
    const steps = Math.ceil((rx + ry) * 3)
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * Math.PI * 2
      if ((Math.sin(a) > 0) !== isFront) continue
      const isLit = k / steps < 1 - night
      put(f, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, isLit ? mix(RING, ALARM, pulse) : RING_OFF)
    }
  }
  ringDot(false)

  // the solid: spins with Claude's pace (sim.dist), so it stops when Claude waits
  const a = sim.dist * .9 + .3, b = .5 + sim.dist * .23
  const burst = t < sim.doneUntil ? Math.sin(((sim.doneUntil - t) / 3) * Math.PI) : 0
  const pts = ICO.map(v => turn(v, a, b)).map(v => project(v, R * (1 + burst * 1.4)))
  let color = mix(EDGE, ALARM, pulse)
  if (isFailing) color = ALARM
  if (burst > .25) {
    for (const p of pts) put(f, p[0], p[1], mix(color, [255, 255, 255], .4))
  } else {
    const edges = ICO_EDGES.map(([i, j]) => [pts[i]!, pts[j]!] as const).sort((e1, e2) => e2[0][2] + e2[1][2] - e1[0][2] - e1[1][2])
    for (const [p, q] of edges) {
      const depth = clamp(((p[2] + q[2]) / 2 + 1) / 2, 0, 1)
      line(f, p[0], p[1], q[0], q[1], mix(color, EDGE_FAR, depth * .8))
    }
  }

  // tool calls: a small cube per call, orbiting once along the ring
  const signs = sim.signs.map(s => {
    const angle = hash(s.id * 7 + 1) * Math.PI * 2 + ((9 - s.z) / 8.35) * Math.PI * 2
    return { s, angle, isFront: Math.sin(angle) > 0 }
  })
  const cube = (angle: number, color: RGB) => {
    const ox = cx + Math.cos(angle) * rx, oy = cy + Math.sin(angle) * ry
    const size = Math.max(1.5, R * .28 * (1 + .3 * Math.sin(angle)))
    const corners = CUBE.map(v => turn(v, t * 2, .6)).map(v => project(v, size, ox, oy))
    for (const [i, j] of CUBE_EDGES) line(f, corners[i]![0], corners[i]![1], corners[j]![0], corners[j]![1], color)
  }
  for (const one of signs) if (!one.isFront) cube(one.angle, mix(SIGN_COLORS[one.s.kind], BG_BOTTOM, .35))
  ringDot(true)
  for (const one of signs) if (one.isFront) cube(one.angle, SIGN_COLORS[one.s.kind])

  sparkles(f, sim, t, H)
  glitch(f, sim, t)
}
