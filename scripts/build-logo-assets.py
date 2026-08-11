"""Derive the shipped logo files from Joe's original artwork.

    python scripts/build-logo-assets.py

Writes public/logo-mark.png, public/logo-mark-reversed.png and
public/apple-touch-icon.png. Needs Pillow (`python -m pip install Pillow`),
which is a local tool only — it is deliberately not a project dependency,
because this runs when the artwork changes and never at build time.

WHY THE ARTWORK CANNOT SIMPLY HAVE ITS WHITE DELETED
----------------------------------------------------
The circuit traces, the scales and the channel between the hemispheres are all
PAINTED white in the original. A global "remove white" punches holes through
every one of them. So the white is removed by flooding inward from the four
corners, which takes only the white connected to the outside edge and leaves
interior strokes alone.

The first attempt at this cropped to a box with a negative y coordinate. PIL
pads out-of-bounds with BLACK, so the corners the flood started from were black
padding rather than white, and the fill ate the padding and stopped — clearing
27.5% of the image while the actual plate survived untouched. It looked plausible
at 36px and was completely wrong. Hence `assert` on the coverage below: this is
exactly the kind of fault that passes a build and ships.

WHY THERE IS A SECOND, LIGHTER FILE
-----------------------------------
With the plate gone the mark's dark hemisphere (hue 215) sits on a sidebar of
hue 214. Measured: the darkest ink came out at 1.13:1 against #0d1b2e, and 13.7%
of the mark fell under the 3:1 that a graphic needs to be seen at all. So the
reversed file lifts shadows and leaves highlights alone (L' = a + (1-a)L, applied
in HLS so hue and saturation are untouched) — the same gradient read in a lighter
register, not a different logo. `a` is solved for, not chosen by eye.

An SVG from Joe would replace this whole script.
"""

import colorsys
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "docs", "MiZanova Logo (Original) (4000 Pixels).png")
PUBLIC = os.path.join(ROOT, "public")

SIDEBAR = (13, 27, 46)  # --color-sidebar
WHITE = (255, 255, 255)
SIZE = 160  # a 40px mark at 4x; larger is bytes nobody sees
COLOURS = 96  # quantised: no banding at this size, ~10x smaller file


# --- WCAG contrast, the same maths as scripts/contrast-check.mjs -------------
def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(r, g, b):
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(fg, bg):
    a, b = luminance(*fg), luminance(*bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


def worst_ink(img, bg):
    """Lowest contrast of any COLOURED opaque pixel against `bg`.

    Only SATURATED pixels count — the actual brand ink. Two kinds of pixel are
    excluded, both because measuring them says nothing about the artwork:

      interior linework   white, but enclosed by brand colour on every side, so
                          it is never seen against the page at all
      antialiased edge    every logo edge fades continuously into its background
                          by design, so "the worst pixel" would always be
                          whichever blend sits just inside the cutoff — a fact
                          about antialiasing, not about legibility

    Blends lose chroma toward the background, brand ink does not, so chroma
    separates them. Chroma and not HLS saturation: HLS saturation is unstable
    near white, scoring (255,254,250) as fully saturated, which would drag an
    all-but-white edge pixel back into the measurement."""
    px = img.convert("RGBA").load()
    w, h = img.size
    lowest = 99.0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 250:
                continue
            if (max(r, g, b) - min(r, g, b)) / 255 < 0.15:
                continue
            lowest = min(lowest, contrast((r, g, b), bg))
    return lowest


def find_bands(im, tol=246, step=4):
    """Rows of the artwork that carry no ink, used to separate the brain from
    the wordmark beneath it rather than hard-coding a crop."""
    px = im.load()
    w, h = im.size
    blank = []
    for y in range(0, h, step):
        if all(
            px[x, y][0] >= tol and px[x, y][1] >= tol and px[x, y][2] >= tol
            for x in range(0, w, step)
        ):
            blank.append(y)
    runs, start, prev = [], None, None
    for y in blank:
        if start is None:
            start = y
        elif y - prev > step:
            runs.append((start, prev))
            start = y
        prev = y
    if start is not None:
        runs.append((start, prev))
    return [r for r in runs if r[1] - r[0] >= 60]


def cut_out_mark(src):
    """The brain alone, on transparency."""
    bands = find_bands(src)
    top, below = bands[0][1], bands[1][0]  # margin above, band above the wordmark
    region = src.crop((0, top, src.width, below))
    bbox = region.convert("L").point(lambda v: 0 if v >= 246 else 255).getbbox()
    brain = region.crop(bbox)

    side = max(brain.size) + 80
    square = Image.new("RGB", (side, side), WHITE)  # WHITE padding, not black
    square.paste(brain, ((side - brain.width) // 2, (side - brain.height) // 2))

    work = square.convert("L")
    for seed in [(0, 0), (side - 1, 0), (0, side - 1), (side - 1, side - 1)]:
        ImageDraw.floodfill(work, seed, 0, thresh=32)

    filled, light = work.load(), square.convert("L").load()
    alpha = Image.new("L", (side, side), 255)
    ap = alpha.load()
    cleared = 0
    for y in range(side):
        for x in range(side):
            # Filled pixels read 0; so would genuinely black artwork, hence the
            # second test that the pixel was light to begin with.
            if filled[x, y] == 0 and light[x, y] > 200:
                ap[x, y] = 0
                cleared += 1

    coverage = cleared / (side * side)
    assert coverage > 0.5, (
        f"only {coverage:.1%} of the artwork was cleared — the flood fill did not "
        "reach the plate. See the note at the top of this file."
    )
    mark = square.convert("RGBA")
    mark.putalpha(alpha)
    return mark.resize((SIZE, SIZE), Image.LANCZOS), coverage


def lift_shadows(img, a):
    """L' = a + (1-a)L in HLS: shadows rise, highlights stay, hue is untouched."""
    out = img.copy()
    px = out.load()
    cache = {}
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, alpha = px[x, y]
            if alpha == 0:
                continue
            key = (r, g, b)
            if key not in cache:
                hue, light, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
                rr, gg, bb = colorsys.hls_to_rgb(hue, a + (1 - a) * light, sat)
                cache[key] = (round(rr * 255), round(gg * 255), round(bb * 255))
            px[x, y] = cache[key] + (alpha,)
    return out


def save(img, name):
    path = os.path.join(PUBLIC, name)
    img.quantize(colors=COLOURS, method=Image.FASTOCTREE).save(path, optimize=True)
    return path


def main():
    src = Image.open(SOURCE).convert("RGB")
    mark, coverage = cut_out_mark(src)
    print(f"plate removed: {coverage:.1%} of the square is now transparent")
    # Only the dark surface is reported. On white the mark is dark ink and its
    # legibility was never in question; the collision is entirely on the sidebar,
    # where the mark's hue 215 meets a background of hue 214.
    print(f"mark on sidebar, as-is : {worst_ink(mark, SIDEBAR):.2f}:1  <- why a second file exists")

    # Smallest lift that clears 3:1 with a margin. Solved, not eyeballed.
    lo, hi = 0.0, 0.8
    for _ in range(8):
        mid = (lo + hi) / 2
        if worst_ink(lift_shadows(mark, mid), SIDEBAR) >= 3.1:
            hi = mid
        else:
            lo = mid
    reversed_mark = lift_shadows(mark, round(hi, 3))
    print(f"shadow lift a = {hi:.3f}")

    save(mark, "logo-mark.png")
    save(reversed_mark, "logo-mark-reversed.png")

    # iOS ignores transparency on a touch icon and composites onto black, which
    # would put the navy hemisphere on black. This one keeps a plate, for the one
    # surface that needs it. iOS rounds the corners itself, hence the padding.
    side, pad = 180, 20
    icon = Image.new("RGB", (side, side), WHITE)
    inner = mark.resize((side - 2 * pad, side - 2 * pad), Image.LANCZOS)
    icon.paste(inner, (pad, pad), inner)
    icon.save(os.path.join(PUBLIC, "apple-touch-icon.png"), optimize=True)

    for name in ("logo-mark.png", "logo-mark-reversed.png", "apple-touch-icon.png"):
        print(f"{name:26} {os.path.getsize(os.path.join(PUBLIC, name)):6,} bytes")

    shipped = worst_ink(Image.open(os.path.join(PUBLIC, "logo-mark-reversed.png")), SIDEBAR)
    print(f"reversed mark on the sidebar: {shipped:.2f}:1 (floor is 3:1)")
    assert shipped >= 3.0, "the reversed mark is under the 3:1 floor on the sidebar"


if __name__ == "__main__":
    main()
