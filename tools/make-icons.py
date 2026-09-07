#!/usr/bin/env python3
"""확장 아이콘을 그린다.

    python3 tools/make-icons.py

원본 이미지를 줄이는 방식이 아니라 **크기마다 직접 그린다.**
줄이기만 하면 16px 에서 획이 뭉개져 아무것도 안 읽힌다.
그래서 작은 크기일수록 획을 두껍게, 여백을 좁게 잡는다.

모티프는 프롬프트 `>_` 하나다. 다른 제품의 마크를 닮은 요소를 쓰지 않는다.
"""
from PIL import Image, ImageDraw
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'icons'

GREEN = (63, 185, 80, 255)    # --gt-green
INK = (13, 17, 23, 255)       # --gt-bg-1
SS = 8                        # 8배로 그리고 줄여 계단을 없앤다

# 크기별 비율. 작을수록 획을 두껍고 크게 잡는다.
#            radius  stroke  chevron(x, ymid, half)      underscore(x0, x1, y)
TUNE = {
    16:  (0.20, 0.115, (0.20, 0.44, 0.21), (0.52, 0.82, 0.71)),
    32:  (0.21, 0.105, (0.21, 0.45, 0.21), (0.53, 0.80, 0.71)),
    48:  (0.22, 0.100, (0.22, 0.455, 0.205), (0.535, 0.79, 0.705)),
    128: (0.22, 0.095, (0.24, 0.46, 0.20), (0.54, 0.78, 0.70)),
}


def draw(size):
    radius, stroke, (cx, cy, half), (ux0, ux1, uy) = TUNE[size]
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=GREEN)

    w = max(2, int(S * stroke))
    x, ymid, h = int(S * cx), int(S * cy), int(S * half)
    d.line([(x, ymid - h), (x + h, ymid)], fill=INK, width=w, joint='curve')
    d.line([(x + h, ymid), (x, ymid + h)], fill=INK, width=w, joint='curve')
    d.line([(int(S * ux0), int(S * uy)), (int(S * ux1), int(S * uy))], fill=INK, width=w)
    return im.resize((size, size), Image.LANCZOS)


def main():
    for n in (16, 32, 48, 128):
        draw(n).save(OUT / f'icon{n}.png')
        print(f'  icons/icon{n}.png')
    # 스토어 리스팅용 큰 아이콘 (128 과 같은 비율로 그린다)
    TUNE[512] = TUNE[128]
    draw(512).save(OUT / 'icon512.png')
    print('  icons/icon512.png  (스토어 리스팅용)')


if __name__ == '__main__':
    main()
