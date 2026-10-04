// Dev tool, not loaded by Claude Code: plays the scripted turn (turn.ts)
// through one scene and prints every frame, one base64 frame per line:
//
//   bun neongai/tools/demo.ts alley 120 6 \
//     | python3 .claude/skills/mod-workflow/scripts/cells-to-gif.py --cells 120x6 --fps 12 alley.gif
//
// Arguments: scene, columns, rows, and optionally frames per second (12).

import { SCENES, paint } from '../hooks/paint'
import type { SceneId } from '../hooks/paint'
import { play } from './turn'

declare const process: { argv: string[] }

const scene = (process.argv[2] ?? 'skyline') as SceneId
const cols = Number(process.argv[3] ?? 120)
const rows = Number(process.argv[4] ?? 6)
const fps = Number(process.argv[5] ?? 12)
if (!(scene in SCENES)) throw new Error(`unknown scene ${scene}; try ${Object.keys(SCENES).join(', ')}`)

play(fps, (t, sim, notes) => console.log(paint(scene, sim, notes, t, cols, rows).cells))
