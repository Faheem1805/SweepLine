"""
Makes the poster's water: a pale aqua page with soft caustics, and the hero render blended into it
with a wavy lower edge, so the page and the picture are one surface.

    python poster/water.py        # writes poster/images/water.jpg and hero-blend.jpg

Run it again if the hero's position on the page changes (HERO_TOP below and in build.mjs).
"""
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).parent / 'images'
PAGE_MM = (1200, 1600)
HERO_TOP = 150  # mm from the top of the page
BG_W = 3000
BG_H = 4000


def caustics(w, h, scale, t, iters=5, seed=0.0):
    """Tileable water-caustic pattern, 0..1."""
    x = np.linspace(0, scale, w, dtype=np.float32) + seed
    y = np.linspace(0, scale * h / w, h, dtype=np.float32) + seed * 0.7
    px, py = np.meshgrid(x, y)
    px = (px * np.pi * 2) % (np.pi * 2) - 250
    py = (py * np.pi * 2) % (np.pi * 2) - 250
    ix, iy = px.copy(), py.copy()
    c = np.ones_like(px)
    inten = 0.005
    for n in range(iters):
        tt = t * (1 - 3.5 / (n + 1))
        nx = px + np.cos(tt - ix) + np.sin(tt + iy)
        ny = py + np.sin(tt - iy) + np.cos(tt + ix)
        ix, iy = nx, ny
        c += 1 / np.hypot(px / (np.sin(ix + tt) / inten), py / (np.cos(iy + tt) / inten))
    c /= iters
    c = 1.17 - np.power(c, 1.4)
    return np.clip(np.power(np.abs(c), 8), 0, 1)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def page():
    v = np.linspace(0, 1, BG_H, dtype=np.float32)[:, None, None]
    stops = [(0.0, (226, 248, 252)), (0.2, (190, 238, 246)), (0.5, (150, 225, 238)), (0.8, (108, 208, 228)), (1.0, (70, 186, 216))]
    xs = [p for p, _ in stops]
    col = np.stack([np.interp(v[:, 0, 0], xs, [c[i] for _, c in stops]) for i in range(3)], axis=1)[:, None, :].astype(np.float32)
    col = np.repeat(col, BG_W, axis=1)
    # Two sheets of caustics, the larger one softer. Stronger toward the bottom, where the water deepens.
    a = caustics(BG_W, BG_H, 2.4, 11.0)
    b = caustics(BG_W, BG_H, 5.2, 23.0, seed=0.37)
    strength = 0.42 + 0.4 * v
    light = np.clip(a * 1.05 + b * 0.7, 0, 1)[:, :, None] * strength
    col = col + (255 - col) * light
    return np.clip(col, 0, 255).astype(np.uint8)


def hero(bg):
    im = np.asarray(Image.open(HERE / 'hero.jpg').convert('RGB'), dtype=np.float32)
    h, w, _ = im.shape
    hero_h_mm = PAGE_MM[0] * h / w
    # The page behind the hero, at the hero's resolution.
    top = int(BG_H * HERO_TOP / PAGE_MM[1])
    bottom = int(BG_H * (HERO_TOP + hero_h_mm) / PAGE_MM[1])
    crop = Image.fromarray(bg[top:bottom]).resize((w, h), Image.BICUBIC)
    back = np.asarray(crop, dtype=np.float32)
    x = np.linspace(0, 1, w, dtype=np.float32)
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    # Top: dissolve the sky into the water of the page.
    a = smooth(0.26, 0.43, y) * np.ones(w, dtype=np.float32)
    # Bottom: a slow wave.
    wave = 0.945 + 0.024 * np.sin(x * 9.2 + 0.7) + 0.012 * np.sin(x * 21.0 + 2.1) + 0.006 * np.sin(x * 43.0)
    edge = wave[None, :]
    a = a * (1 - smooth(edge - 0.004, edge + 0.004, y))
    out = back * (1 - a[:, :, None]) + im * a[:, :, None]
    # A thin bright crest along the wave.
    crest = np.exp(-(((y - edge - 0.008) / 0.006) ** 2))[:, :, None] * 0.75 * (y > 0.6)[:, :, None]
    out = out + (255 - out) * crest
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(HERE / 'hero-blend.jpg', quality=90, subsampling=0)
    print('hero-blend', w, h)


bg = page()
Image.fromarray(bg).save(HERE / 'water.jpg', quality=88, subsampling=0)
print('water', bg.shape)
hero(bg)
