#!/usr/bin/env python3
"""縦長スクショを、背景色だけの行（＝カードの隙間）で分割する。

Slack に貼るとき、1枚が長すぎると縮小されて読めなくなるため。
カードの途中で切らないことだけが要件で、等分である必要はない。
"""
import os
import sys

import numpy as np
from PIL import Image

TARGET = 2400
MIN_TAIL = 500


def blank_rows(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im)
    bg = a[5, 5]
    return im, np.all(np.all(np.abs(a.astype(int) - bg.astype(int)) < 6, axis=2), axis=1)


def gap_centers(blank, min_gap=8):
    centers = []
    i = 0
    while i < len(blank):
        if blank[i]:
            j = i
            while j < len(blank) and blank[j]:
                j += 1
            if j - i >= min_gap:
                centers.append((i + j) // 2)
            i = j
        else:
            i += 1
    return centers


def main(path, prefix):
    im, blank = blank_rows(path)
    gaps = gap_centers(blank)

    cuts = [0]
    while cuts[-1] + TARGET < im.height:
        lo, hi = cuts[-1] + TARGET * 0.45, cuts[-1] + TARGET * 1.3
        cand = [g for g in gaps if lo < g < hi]
        if not cand:
            break
        cuts.append(min(cand, key=lambda g: abs(g - (cuts[-1] + TARGET))))
    cuts.append(im.height)

    if len(cuts) > 2 and cuts[-1] - cuts[-2] < MIN_TAIL:
        cuts.pop(-2)

    out = os.path.dirname(path) or "."
    for n, (s, e) in enumerate(zip(cuts, cuts[1:]), 1):
        p = os.path.join(out, f"{prefix}-{n}.png")
        im.crop((0, s, im.width, e)).save(p)
        print(f"{p} {im.width}x{e - s} {os.path.getsize(p) / 1e6:.2f}MB")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
