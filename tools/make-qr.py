#!/usr/bin/env python3
"""Render the phone URL as a QR code SVG for the landing page.

    python3 tools/make-qr.py https://your-project.web.app/play

Writes public/qr.svg. Re-run whenever the hosting URL or custom domain
changes — the landing page prints the URL as text from location.origin, so
only the code itself needs rebuilding.
"""

import pathlib
import sys

import qrcode

OUT = pathlib.Path(__file__).resolve().parent.parent / "public" / "qr.svg"

INK = "#40301B"
QUIET = 2  # modules of quiet zone; 4 is the spec, 2 scans fine on a poster


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    url = sys.argv[1]

    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=QUIET)
    q.add_data(url)
    q.make(fit=True)
    matrix = q.get_matrix()
    size = len(matrix)

    # One path of 1x1 squares: no per-module elements, no CSS, scales cleanly.
    parts = []
    for y, row in enumerate(matrix):
        x = 0
        while x < size:
            if not row[x]:
                x += 1
                continue
            run = x
            while run < size and row[run]:
                run += 1
            parts.append(f"M{x} {y}h{run - x}v1h{-(run - x)}z")
            x = run

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'shape-rendering="crispEdges" role="img" aria-label="{url}">'
        f'<rect width="{size}" height="{size}" fill="#fff"/>'
        f'<path fill="{INK}" d="{"".join(parts)}"/>'
        f"</svg>\n"
    )
    OUT.write_text(svg, encoding="utf-8")
    print(f"{OUT}  ({size}x{size} modules, version {q.version}, {len(svg)} bytes)")
    print(f"encodes: {url}")


if __name__ == "__main__":
    main()
