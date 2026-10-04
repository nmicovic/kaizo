"""Shared by cells-to-png.py and cells-to-gif.py: reads terminal cells and draws
them the way a terminal does.

A cell is (code point, foreground, background). Block elements (▀ ▄ ▌ ▐ and the
quadrants ▘ ▝ ▖ ▗ ▚ ▞ ▙ ▛ ▜ ▟) are drawn as exact rectangles, braille as its
dots, and any other character with a font when one is given, else as a block
of its color.
"""
import base64
import os
import re
import shutil
import struct
import subprocess

FONTS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf',
    '/mnt/c/Windows/Fonts/CascadiaMono.ttf',
    '/System/Library/Fonts/Menlo.ttc',
]
# For characters the first font lacks, such as half-width katakana.
FALLBACKS = [
    '/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf',
    '/mnt/c/Windows/Fonts/msgothic.ttc',
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
]


def load_fonts(size):
    """A monospace font and a fallback at `size` pixels, or (None, None) when none is installed."""
    from PIL import ImageFont

    def first(paths):
        for path in paths:
            if os.path.exists(path):
                return ImageFont.truetype(path, size)
        return None
    font = first(FONTS)
    return font, first(FALLBACKS) or font


def frames_to_gif(folder, fps, out):
    """Encodes folder/00000.png, 00001.png ... as a looping GIF with one shared palette (needs ffmpeg)."""
    subprocess.run([
        'ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(fps), '-i', os.path.join(folder, '%05d.png'),
        '-vf', 'split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=none',
        '-loop', '0', out,
    ], check=True)
    shutil.rmtree(folder)
    return os.path.getsize(out)

# The quadrants each block element fills: upper-left, upper-right, lower-left, lower-right.
QUADS = {
    0x2580: 'UL UR', 0x2584: 'LL LR', 0x2588: 'UL UR LL LR', 0x258C: 'UL LL', 0x2590: 'UR LR',
    0x2596: 'LL', 0x2597: 'LR', 0x2598: 'UL', 0x2599: 'UL LL LR', 0x259A: 'UL LR', 0x259B: 'UL UR LL',
    0x259C: 'UL UR LR', 0x259D: 'UR', 0x259E: 'UR LL', 0x259F: 'UR LL LR',
}
BRAILLE_BITS = [(0, 0, 0x01), (0, 1, 0x02), (0, 2, 0x04), (1, 0, 0x08), (1, 1, 0x10), (1, 2, 0x20), (0, 3, 0x40), (1, 3, 0x80)]
DEFAULT_BG = (24, 24, 24)
SGR = re.compile(r'\x1b\[([0-9;]*)m|(.)', re.S)


def rgb(v, snap=False):
    c = ((v >> 16) & 255, (v >> 8) & 255, v & 255)
    return tuple(round(x / 17) * 17 for x in c) if snap else c


def draw_cell(draw, x, y, cw, ch, cp, fg, bg, font=None, fallback=None):
    draw.rectangle([x, y, x + cw - 1, y + ch - 1], fill=bg)
    if cp in QUADS:
        hw, hh = cw // 2, ch // 2
        for q in QUADS[cp].split():
            qx = x + (hw if q[1] == 'R' else 0)
            qy = y + (hh if q[0] == 'L' else 0)
            draw.rectangle([qx, qy, qx + (cw - hw if q[1] == 'R' else hw) - 1, qy + (ch - hh if q[0] == 'L' else hh) - 1], fill=fg)
    elif 0x2800 < cp <= 0x28FF:
        dw, dh = cw / 2, ch / 4
        for dx, dy, bit in BRAILLE_BITS:
            if (cp - 0x2800) & bit:
                x0, y0 = x + dx * dw, y + dy * dh
                draw.rectangle([round(x0), round(y0), round(x0 + dw) - 2, round(y0 + dh) - 2], fill=fg)
    elif cp > 0x20:
        if font is not None:
            use = fallback if fallback is not None and 0xFF00 <= cp <= 0xFFEF else font
            draw.text((x + cw / 2, y + ch / 2), chr(cp), font=use, fill=fg, anchor='mm')
        else:
            m = max(1, cw // 3)
            draw.rectangle([x + m, y + m, x + cw - 1 - m, y + ch - 1 - m], fill=fg)


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
    """A `tmux capture-pane -e -p` capture as rows of (code point, fg, bg) cells."""
    rows = []
    for line in open(path, encoding='utf-8', errors='replace').read().split('\n'):
        fg, bg, cells = None, None, []
        for m in SGR.finditer(line):
            if m.group(1) is not None:
                codes = [int(c) for c in m.group(1).split(';') if c != ''] or [0]
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
                        color = tuple(codes[i + 2:i + 5])
                        fg, bg = (color, bg) if c == 38 else (fg, color)
                        i += 4
                    elif c in (38, 48) and i + 1 < len(codes) and codes[i + 1] == 5:
                        color = xterm256(codes[i + 2])
                        fg, bg = (color, bg) if c == 38 else (fg, color)
                        i += 2
                    i += 1
            else:
                back = bg or DEFAULT_BG
                cells.append((ord(m.group(2)), fg or (200, 200, 200), back))
        rows.append(cells)
    return rows


def parse_frames(spec, lines):
    """Base64 Raster cells, one frame per line, as frames of rows of (code point, fg, bg) cells."""
    cols, rows = (int(v) for v in spec.lower().split('x'))
    frames = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        raw = base64.b64decode(line)
        words = struct.unpack('<%dI' % (len(raw) // 4), raw)
        frames.append([[(words[(r * cols + c) * 3], rgb(words[(r * cols + c) * 3 + 1], True), rgb(words[(r * cols + c) * 3 + 2], True))
                        for c in range(cols)] for r in range(rows)])
    return frames
