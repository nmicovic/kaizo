// One frame of a scene: the scene paints the picture, the frame adds the
// status line and packs it all into Raster cells.

import { finish, frameFor } from './frame'
import type { Frame } from './frame'
import { alley } from './scenes/alley'
import { codeRain } from './scenes/code-rain'
import { skyline } from './scenes/skyline'
import { sunset } from './scenes/sunset'
import { warp } from './scenes/warp'
import { wireframe } from './scenes/wireframe'
import type { Mode, Notes, Sim } from './signals'

/** Where a scene can be drawn: the short strip above the prompt, or the tall side pane. */
export type View = 'strip' | 'pane'

type Scene = {
  paint: (f: Frame, sim: Sim, mode: Mode, t: number) => void
  /** Where it reads well. The sunset's road needs height, so it isn't offered in the strip. */
  fits: readonly View[]
  /** For `/neongai scene`, in plain words. */
  about: string
}

export const SCENES = {
  skyline: { paint: skyline, fits: ['strip', 'pane'], about: 'a neon city scrolling past at night' },
  sunset: { paint: sunset, fits: ['pane'], about: 'a road running into a synthwave sunset' },
  'code-rain': { paint: codeRain, fits: ['strip', 'pane'], about: 'green code raining down, Matrix style' },
  wireframe: { paint: wireframe, fits: ['strip', 'pane'], about: 'a spinning 3D wireframe with a ring of light, Tron style' },
  warp: { paint: warp, fits: ['strip', 'pane'], about: 'stars streaming past a ship at warp speed' },
  alley: { paint: alley, fits: ['strip', 'pane'], about: 'a rainy neon street, windows going dark one by one' },
} as const satisfies Record<string, Scene>

export type SceneId = keyof typeof SCENES

export const isScene = (name: string): name is SceneId => Object.hasOwn(SCENES, name)
export const fits = (scene: SceneId, view: View) => (SCENES[scene].fits as readonly View[]).includes(view)

/** `cols` x `rows` cells (rows at least 1): the scene above, the status line in the last row. */
export function paint(scene: SceneId, sim: Sim, notes: Notes, t: number, cols: number, rows: number) {
  const f = frameFor(cols, rows)
  f.glyphs.fill(0)
  f.dots.fill(0)
  if (f.H > 0) SCENES[scene].paint(f, sim, notes.mode, t)
  return finish(f, notes)
}
