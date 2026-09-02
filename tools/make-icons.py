#!/usr/bin/env python3
"""icons/source.png 에서 확장 아이콘을 다시 만든다.

큰 크기(48·128)는 원본을 줄이고, 작은 크기(16·32)는 다시 그린다.
줄이기만 하면 16px 에서 매듭이 초록 덩어리로 뭉개져 아무것도 못 읽는다 —
아이콘은 크기별로 다시 그리는 게 정석이다.

    python3 tools/make-icons.py
"""
from PIL import Image, ImageDraw
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'icons' / 'source.png'
OUT = ROOT / 'icons'

BG = (13, 17, 23, 255)      # --gt-bg-1
GREEN = (7, 221, 139, 255)  # 원본에서 뽑은 값


def prompt_icon(size):
    """작은 크기용 — 매듭 대신 >_ 만 크게."""
    S = size * 8                     # 8배로 그리고 줄여서 계단을 없앤다
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    w = max(2, int(S * 0.085))
    x0, ytop, ymid, ybot = int(S * 0.26), int(S * 0.26), int(S * 0.47), int(S * 0.68)
    d.line([(x0, ytop), (int(S * 0.50), ymid)], fill=GREEN, width=w, joint='curve')
    d.line([(int(S * 0.50), ymid), (x0, ybot)], fill=GREEN, width=w, joint='curve')
    d.line([(int(S * 0.56), int(S * 0.70)), (int(S * 0.80), int(S * 0.70))], fill=GREEN, width=w)
    return im.resize((size, size), Image.LANCZOS)


def main():
    src = Image.open(SRC).convert('RGBA')
    for n in (48, 128):
        src.resize((n, n), Image.LANCZOS).save(OUT / f'icon{n}.png')
    for n in (16, 32):
        prompt_icon(n).save(OUT / f'icon{n}.png')
    print('icons/icon{16,32,48,128}.png 갱신')


if __name__ == '__main__':
    main()
