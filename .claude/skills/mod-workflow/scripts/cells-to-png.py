#!/usr/bin/env python3
"""Draws terminal cells as an image, so you can look at what a mod painted.

Two inputs:
  cells-to-png.py <capture.ansi> <out.png>
      A `tmux capture-pane -e -p` capture.
  cells-to-png.py --cells COLSxROWS <out.png>   (base64 Raster cells on stdin, one frame per line)
      Frames painted offline, stacked with a gap between them. The last row
      (the status line) is skipped, and colors are rounded to #RGB the way the
      Raster does.

Block elements are drawn as exact rectangles, braille as its dots, and any
other character as a block of its color, so you can see where text is. For
real letters and a moving picture, use cells-to-gif.py. Needs Pillow.
"""
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cellart import draw_cell, parse_capture, parse_frames  # noqa: E402

CW, CH = 6, 12


def main():
    if sys.argv[1] == '--cells':
        rows = []
        for frame in parse_frames(sys.argv[2], sys.stdin):
            rows += frame[:-1] + [[]]
        dest = sys.argv[3]
    else:
        rows, dest = parse_capture(sys.argv[1]), sys.argv[2]
    width = max((len(r) for r in rows), default=1)
    img = Image.new('RGB', (width * CW, len(rows) * CH), (40, 40, 40))
    draw = ImageDraw.Draw(img)
    for y, row in enumerate(rows):
        for x, (cp, fg, bg) in enumerate(row):
            draw_cell(draw, x * CW, y * CH, CW, CH, cp, fg, bg)
    img.save(dest)


if __name__ == '__main__':
    main()
