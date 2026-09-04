#!/usr/bin/env python3
"""Bake the board's CSS blend + filter stack into the image files.

The design prototype paints each of the 80 card faces with

    background-blend-mode: multiply   (image x background-color)
    filter: grayscale(1) contrast(1.03)      -- the 愁哥哥 front
    filter: saturate(1.12)                   -- the 笑弟弟 back

That is 80 filtered, blended compositing layers on the projector machine.
The same pixels can be produced once, ahead of time, so the browser only has
to draw a plain bitmap. Output is byte-for-byte what the CSS stack produces
(verified against Chromium by tools/verify-parity.js).

Usage: python3 tools/bake-assets.py
"""

import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "project" / "assets"
OUT = ROOT / "public" / "assets"

# Luminance coefficients used by the CSS grayscale()/saturate() matrices
# (filter-effects spec, operating in sRGB).
LR, LG, LB = 0.2126, 0.7152, 0.0722


def multiply_over(im, bg):
    """background-blend-mode: multiply against an opaque background-color.

    Both source images are fully opaque, so the general Porter-Duff form
    collapses to a plain channel-wise product in sRGB.
    """
    r, g, b = im.convert("RGB").split()
    return Image.merge(
        "RGB",
        (
            r.point(lambda v, c=bg[0]: round(v * c / 255)),
            g.point(lambda v, c=bg[1]: round(v * c / 255)),
            b.point(lambda v, c=bg[2]: round(v * c / 255)),
        ),
    )


def color_matrix(im, m):
    """Apply a 3x3 sRGB colour matrix, the way feColorMatrix does."""
    return im.convert(
        "RGB",
        (
            m[0][0], m[0][1], m[0][2], 0,
            m[1][0], m[1][1], m[1][2], 0,
            m[2][0], m[2][1], m[2][2], 0,
        ),
    )


def grayscale(im):
    """CSS grayscale(1)."""
    row = [LR, LG, LB]
    return color_matrix(im, [row, row, row])


def saturate(im, s):
    """CSS saturate(s)."""
    return color_matrix(
        im,
        [
            [LR + (1 - LR) * s, LG - LG * s, LB - LB * s],
            [LR - LR * s, LG + (1 - LG) * s, LB - LB * s],
            [LR - LR * s, LG - LG * s, LB + (1 - LB) * s],
        ],
    )


def contrast(im, amount):
    """CSS contrast(a): a linear transfer with slope a, intercept .5-.5a."""
    intercept = (0.5 - 0.5 * amount) * 255
    return im.point(lambda v: max(0, min(255, round(v * amount + intercept))))


def save(im, name, **kw):
    path = OUT / name
    im.save(path, **kw)
    return path, path.stat().st_size


def main():
    if not SRC.is_dir():
        sys.exit(f"missing source assets: {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)

    sau = Image.open(SRC / "sau.png")
    siu = Image.open(SRC / "siu-m.png")
    before = (SRC / "sau.png").stat().st_size + (SRC / "siu-m.png").stat().st_size

    # 愁哥哥 front face: multiply over #D3D7E0, then grayscale(1) contrast(1.03).
    front = contrast(grayscale(multiply_over(sau, (0xD3, 0xD7, 0xE0))), 1.03)

    # 笑弟弟 back face: multiply over #FFE07A, then saturate(1.12).
    back = saturate(multiply_over(siu, (0xFF, 0xE0, 0x7A)), 1.12)

    # q95 keeps the board within a couple of levels of the prototype's own
    # rendering (tools/verify-parity.js measures it) at ~5% of the PNG weight.
    total = 0
    for im, name in ((front, "sau.webp"), (back, "siu.webp")):
        _, size = save(im, name, quality=95, method=6)
        total += size

    # The phone's idle illustration renders at most 140 CSS px wide; ship it at
    # 3x for dense screens instead of the 1236px board sheet. Its own filter
    # (grayscale(1) brightness(1.03)) is baked in the same way.
    thumb = sau.convert("RGB").resize((420, 673), Image.LANCZOS)
    thumb = grayscale(thumb).point(lambda v: max(0, min(255, round(v * 1.03))))
    _, size = save(thumb, "sau-thumb.webp", quality=86, method=6)
    total += size

    # Home-screen icons for the phones: a square crop centred on 笑弟弟's face.
    face = siu.convert("RGB").crop((150, 540, 1230, 1620))
    for px in (192, 512):
        face.resize((px, px), Image.LANCZOS).save(
            OUT.parent / f"icon-{px}.png", optimize=True
        )

    print(f"source PNG   {before / 1024:8.0f} KB")
    print(f"baked WebP   {total / 1024:8.0f} KB   ({total / before:.0%} of source)")
    for p in sorted(OUT.glob("*.webp")):
        print(f"  {p.name:16} {p.stat().st_size / 1024:7.0f} KB")


if __name__ == "__main__":
    main()
