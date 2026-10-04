#!/usr/bin/env python3
"""Turns Raster frames into an animated GIF drawn with real fonts, for READMEs.

  cells-to-gif.py --cells COLSxROWS [--fps 12] [--cell 8x16] <out.gif>

Reads base64 Raster cells on stdin, one frame per line (a mod's tools/demo.ts
prints them). Cells are drawn as the terminal draws them: block elements as
exact rectangles, braille as its dots, any other character in a monospace font
(with a fallback font for characters the first one lacks, such as half-width
katakana). Colors are rounded to #RGB the way the Raster rounds them. Needs
Pillow and ffmpeg.
"""
import os
import sys
import tempfile

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cellart import draw_cell, frames_to_gif, load_fonts, parse_frames  # noqa: E402


def main():
    args = sys.argv[1:]
    spec = args[args.index('--cells') + 1]
    fps = int(args[args.index('--fps') + 1]) if '--fps' in args else 12
    cw, ch = (int(v) for v in (args[args.index('--cell') + 1] if '--cell' in args else '8x16').split('x'))
    out = args[-1]
    font, fallback = load_fonts(int(ch * .8))
    if font is None:
        sys.exit('no monospace font found; add one to FONTS')

    tmp = tempfile.mkdtemp()
    n = 0
    for frame in parse_frames(spec, sys.stdin):
        img = Image.new('RGB', (len(frame[0]) * cw, len(frame) * ch))
        draw = ImageDraw.Draw(img)
        for y, row in enumerate(frame):
            for x, (cp, fg, bg) in enumerate(row):
                draw_cell(draw, x * cw, y * ch, cw, ch, cp, fg, bg, font, fallback)
        img.save(os.path.join(tmp, '%05d.png' % n))
        n += 1
    if not n:
        sys.exit('no frames on stdin')
    print(f'{out}: {n} frames, {frames_to_gif(tmp, fps, out) // 1024} KB')


if __name__ == '__main__':
    main()
