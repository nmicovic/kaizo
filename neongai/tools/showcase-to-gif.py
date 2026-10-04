#!/usr/bin/env python3
"""Dev tool: draws neongai inside a mock Claude Code window, one GIF per scene.

  bun neongai/tools/showcase.ts alley | python3 neongai/tools/showcase-to-gif.py alley.gif

Reads the JSON frames showcase.ts prints. Each frame is the conversation on the
left (the transcript so far, the strip above the prompt, the prompt box) and
the side view docked on the right, all drawn with real fonts. Needs Pillow and
ffmpeg, and the cell drawing in .claude/skills/mod-workflow/scripts/cellart.py.
"""
import json
import os
import sys
import tempfile

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '.claude', 'skills', 'mod-workflow', 'scripts'))
from cellart import draw_cell, frames_to_gif, load_fonts, parse_frames  # noqa: E402

CW, CH = 8, 16
BG = (13, 13, 20)
RULE = (64, 64, 76)
TEXT = {
    'you': ((235, 235, 240), (38, 38, 50)),
    'tool': ((215, 215, 222), None),
    'claude': ((235, 235, 240), None),
    'error': ((255, 120, 120), None),
    'ok': ((130, 210, 140), None),
    'ask': ((255, 205, 120), (52, 40, 20)),
    'dim': ((140, 140, 155), None),
}
BULLET = {'tool': (110, 210, 130), 'claude': (235, 235, 240)}


def main():
    out = sys.argv[1]
    fps = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    font, fallback = load_fonts(int(CH * .8))
    tmp = tempfile.mkdtemp()
    n = 0
    for raw in sys.stdin:
        if not raw.strip():
            continue
        frame = json.loads(raw)
        lay = frame['layout']
        cols = lay['left'] + 1 + lay['paneCols']
        img = Image.new('RGB', (cols * CW, lay['rows'] * CH), BG)
        draw = ImageDraw.Draw(img)

        def text(col, row, s, fg, bg=BG):
            for i, ch in enumerate(s[: lay['left'] - col]):
                draw_cell(draw, (col + i) * CW, row * CH, CW, CH, ord(ch), fg, bg, font, fallback)

        # the prompt box at the bottom, the strip above it, the transcript above that
        prompt_row = lay['rows'] - 2
        text(0, prompt_row - 1, '─' * lay['left'], RULE)
        text(0, prompt_row, '> ', (200, 200, 210))
        text(0, prompt_row + 1, '─' * lay['left'], RULE)
        strip_top = prompt_row - 1 - lay['stripRows']
        if frame['strip']:
            for r, row in enumerate(parse_frames(f"{lay['left']}x{lay['stripRows']}", [frame['strip']])[0]):
                for c, (cp, fg, bg) in enumerate(row):
                    draw_cell(draw, c * CW, (strip_top + r) * CH, CW, CH, cp, fg, bg, font, fallback)
        room = strip_top - 1
        lines = frame['lines'][-room:] if room > 0 else []
        for i, line in enumerate(lines):
            fg, bg = TEXT[line['kind']]
            row = 1 + i
            if bg:
                draw.rectangle([0, row * CH, lay['left'] * CW - 1, row * CH + CH - 1], fill=bg)
            text(1, row, line['text'], fg, bg or BG)
            if line['kind'] in BULLET:
                text(1, row, '●', BULLET[line['kind']], bg or BG)

        # the divider and the docked side view
        for r in range(lay['rows']):
            draw_cell(draw, lay['left'] * CW, r * CH, CW, CH, ord('│'), RULE, BG, font, fallback)
        for r, row in enumerate(parse_frames(f"{lay['paneCols']}x{lay['paneRows']}", [frame['pane']])[0]):
            for c, (cp, fg, bg) in enumerate(row):
                draw_cell(draw, (lay['left'] + 1 + c) * CW, (1 + r) * CH, CW, CH, cp, fg, bg, font, fallback)

        img.save(os.path.join(tmp, '%05d.png' % n))
        n += 1
    if not n:
        sys.exit('no frames on stdin')
    print(f'{out}: {n} frames, {frames_to_gif(tmp, fps, out) // 1024} KB')


if __name__ == '__main__':
    main()
