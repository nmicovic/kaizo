#!/usr/bin/env python3
"""Draws terminal cells as pixels, so you can look at what a mod painted.

Two inputs:
  cells-to-png.py <capture.ansi> <out.png>
      A `tmux capture-pane -e -p` capture. Each `▀` cell becomes two pixels
      (foreground on top, background below); other cells show their background.
  cells-to-png.py --cells COLSxROWS <out.png>   (base64 Raster cells on stdin, one frame per line)
      Frames painted offline. The last row (the status line) is skipped, and
      colors are rounded to #RGB the way the Raster rounds them.

Needs Pillow (pip install pillow).
"""
import base64
import re
import struct
import sys

from PIL import Image

SCALE = 6
DEFAULT_BG = (24, 24, 24)
SGR = re.compile(r'\x1b\[([0-9;]*)m|(.)', re.S)


def xterm256(n):
    if n < 16:
        base = [(0, 0, 0), (128, 0, 0), (0, 128, 0), (128, 128, 0), (0, 0, 128), (128, 0, 128), (0, 128, 128), (192, 192, 192)]
        return base[n] if n < 8 else tuple(min(255, c + 127) for c in base[n - 8])
    if n < 232:
        n -= 16
        level = [0, 95, 135, 175, 215, 255]
        return (level[n // 36], level[(n // 6) % 6], level[n % 6])
    g = 8 + (n - 232) * 10
    return (g, g, g)


def parse_capture(path):
    """Returns rows of pixel pairs (top, bottom), one per cell."""
    rows = []
    for line in open(path, encoding='utf-8', errors='replace').read().split('\n'):
        fg, bg, cells = None, None, []
        for m in SGR.finditer(line):
            if m.group(1) is not None:
                codes = [int(x) for x in m.group(1).split(';') if x != ''] or [0]
                i = 0
                while i < len(codes):
                    c = codes[i]
                    if c == 0:
                        fg = bg = None
                    elif c == 39:
                        fg = None
                    elif c == 49:
                        bg = None
                    elif c in (38, 48) and i + 1 < len(codes) and codes[i + 1] == 2:
                        rgb = tuple(codes[i + 2:i + 5])
                        fg, bg = (rgb, bg) if c == 38 else (fg, rgb)
                        i += 4
                    elif c in (38, 48) and i + 1 < len(codes) and codes[i + 1] == 5:
                        rgb = xterm256(codes[i + 2])
                        fg, bg = (rgb, bg) if c == 38 else (fg, rgb)
                        i += 2
                    i += 1
            else:
                back = bg or DEFAULT_BG
                cells.append((fg or back, back) if m.group(2) == '▀' else (back, back))
        rows.append(cells)
    return rows


def parse_cells(spec):
    """Returns frames of pixel-pair rows from base64 cells on stdin."""
    cols, rows = (int(v) for v in spec.lower().split('x'))
    rnd = lambda v: tuple(round(((v >> s) & 255) / 17) * 17 for s in (16, 8, 0))
    out = []
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        raw = base64.b64decode(line)
        words = struct.unpack('<%dI' % (len(raw) // 4), raw)
        for row in range(rows - 1):
            out.append([(rnd(words[(row * cols + x) * 3 + 1]), rnd(words[(row * cols + x) * 3 + 2])) for x in range(cols)])
        out.append([])  # a gap between frames
    return out


def main():
    if sys.argv[1] == '--cells':
        rows, dest = parse_cells(sys.argv[2]), sys.argv[3]
    else:
        rows, dest = parse_capture(sys.argv[1]), sys.argv[2]
    width = max((len(r) for r in rows), default=1)
    img = Image.new('RGB', (width * SCALE, len(rows) * 2 * SCALE), (40, 40, 40))
    for y, row in enumerate(rows):
        for x, (top, bottom) in enumerate(row):
            img.paste(top, (x * SCALE, y * 2 * SCALE, (x + 1) * SCALE, (y * 2 + 1) * SCALE))
            img.paste(bottom, (x * SCALE, (y * 2 + 1) * SCALE, (x + 1) * SCALE, (y * 2 + 2) * SCALE))
    img.save(dest)


if __name__ == '__main__':
    main()
