// Dev tool, not loaded by Claude Code: plays the scripted turn (turn.ts) as
// neongai shows it inside Claude Code, the side view and the strip at once,
// and prints one JSON frame per line for showcase-to-gif.py:
//
//   bun neongai/tools/showcase.ts alley | python3 neongai/tools/showcase-to-gif.py alley.gif
//
// Arguments: scene, and optionally frames per second (12). A scene that
// doesn't fit the strip (sunset) is shown in the side view only.

import { SCENES, fits, paint } from '../hooks/paint'
import type { SceneId } from '../hooks/paint'
import { STORY, play } from './turn'

declare const process: { argv: string[] }

// The window: the conversation on the left with the strip above its prompt,
// and the side view docked on the right.
export const LAYOUT = { rows: 26, left: 72, paneCols: 40, paneRows: 24, stripRows: 6 }

const scene = (process.argv[2] ?? 'alley') as SceneId
const fps = Number(process.argv[3] ?? 12)
if (!(scene in SCENES)) throw new Error(`unknown scene ${scene}; try ${Object.keys(SCENES).join(', ')}`)
const hasStrip = fits(scene, 'strip')
// The GIF starts mid-turn, tools firing, so its first frame (what a README
// shows before it loops, and in still previews) already says something.
const START = 3.5

const frames: string[] = []
play(fps, (t, sim, notes) => {
  const lines = STORY.filter(line => line.at <= t).map(line => ({
    text: line.until !== undefined && t >= line.until ? line.after ?? line.text : line.text,
    kind: line.kind,
  }))
  frames.push(JSON.stringify({
    layout: { ...LAYOUT, stripRows: hasStrip ? LAYOUT.stripRows : 0 },
    pane: paint(scene, sim, notes, t, LAYOUT.paneCols, LAYOUT.paneRows).cells,
    strip: hasStrip ? paint(scene, sim, notes, t, LAYOUT.left, LAYOUT.stripRows).cells : null,
    lines,
  }))
})
const first = Math.round(START * fps)
for (const frame of [...frames.slice(first), ...frames.slice(0, first)]) console.log(frame)
