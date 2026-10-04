// Dev tool, not loaded by Claude Code: paints a scene in a few states without
// opening Claude Code, one base64 frame per line. Turn the output into an image:
//
//   bun neongai/tools/preview.ts skyline 179 6 \
//     | python3 .claude/skills/mod-workflow/scripts/cells-to-png.py --cells 179x6 /tmp/skyline.png
//
// Arguments: scene, columns, rows. The states are fixed below: little context
// with tools running, half full while thinking, nearly full while Claude waits
// for you, and the end of a turn.

import { SCENES, paint } from '../hooks/paint'
import type { SceneId } from '../hooks/paint'
import { addSign, newSim, step } from '../hooks/signals'
import type { Mode } from '../hooks/signals'

declare const process: { argv: string[] }

const scene = (process.argv[2] ?? 'skyline') as SceneId
const cols = Number(process.argv[3] ?? 179)
const rows = Number(process.argv[4] ?? 6)
if (!(scene in SCENES)) throw new Error(`unknown scene ${scene}; try ${Object.keys(SCENES).join(', ')}`)

const states: [number, Mode][] = [[10, 'tool'], [55, 'thinking'], [90, 'waiting'], [30, 'done']]
for (const [ctx, mode] of states) {
  const sim = newSim(ctx)
  for (let i = 0; i < 60; i++) step(sim, mode === 'waiting' ? 'tool' : mode, ctx, 1 / 12)
  if (mode === 'done') sim.doneUntil = 5
  addSign(sim, 'bash')
  addSign(sim, 'edit')
  addSign(sim, 'fail')
  sim.signs[0]!.z = 6.5
  sim.signs[1]!.z = 4
  sim.signs[2]!.z = 1.6
  console.log(paint(scene, sim, { mode, ctx, last: 'Bash npm test', tools: 3, elapsed: '0:14' }, 3.3, cols, rows).cells)
}
