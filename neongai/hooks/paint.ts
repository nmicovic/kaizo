// One frame of a scene: the scene paints the picture, the frame adds the
// status line and packs it all into Raster cells.

import { finish, frameFor } from './frame'
import { skyline } from './scenes/skyline'
import { sunset } from './scenes/sunset'
import type { Notes, Sim } from './signals'

export const SCENES = { sunset, skyline }
export type SceneId = keyof typeof SCENES

/** `cols` x `rows` cells (rows at least 1): the scene above, the status line in the last row. */
export function paint(scene: SceneId, sim: Sim, notes: Notes, t: number, cols: number, rows: number) {
  const f = frameFor(cols, rows)
  if (f.H > 0) SCENES[scene](f, sim, notes.mode, t)
  return finish(f, notes)
}
