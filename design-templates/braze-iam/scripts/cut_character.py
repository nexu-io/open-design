#!/usr/bin/env python3
"""
Role: 단색(크로마키) 배경 이미지를 투명 PNG로 키잉 — 캐릭터 컷아웃·오브제 폴백 공용
Key Features: 배경색 자동 추정(4꼭짓점 최빈값) 또는 --color 지정, 거리 기반 알파,
              threshold~1.6x 선형 램프로 소프트 엣지 보존
Dependencies: Pillow
Notes: gpt-5.5가 투명 배경 생성을 못 하는 경우의 폴백 경로 — 단색 배경으로 생성한 뒤
       본 스크립트로 키잉한다 (imagegen-pipeline.md 폴백 절). 소프트 섀도가 배경색과
       섞인 경계는 램프가 반투명으로 살린다 — 품질 실측은 실제 렌더로 확인.
"""
import argparse
import sys
from collections import Counter
from pathlib import Path

from PIL import Image


def parse_hex(value: str) -> tuple[int, int, int]:
    # "#RRGGBB" → (r, g, b)
    v = value.lstrip('#')
    if len(v) != 6:
        raise argparse.ArgumentTypeError(f'invalid color: {value} (expect #RRGGBB)')
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def estimate_bg(img: Image.Image) -> tuple[int, int, int]:
    # 4꼭짓점 최빈값 — 오브제가 프레임 중앙 히어로라는 전제(레이아웃 문법)에 기댄 추정
    w, h = img.size
    corners = [img.getpixel(p)[:3] for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    return Counter(corners).most_common(1)[0][0]


def key_out(img: Image.Image, bg: tuple[int, int, int], threshold: int) -> Image.Image:
    rgba = img.convert('RGBA')
    px = rgba.load()
    soft = threshold * 1.6  # 램프 상한 — 경계 반투명 보존
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            dist = ((r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2) ** 0.5
            if dist <= threshold:
                px[x, y] = (r, g, b, 0)
            elif dist < soft:
                px[x, y] = (r, g, b, int(a * (dist - threshold) / (soft - threshold)))
    return rgba


def main() -> int:
    parser = argparse.ArgumentParser(description='크로마키 배경 → 투명 PNG')
    parser.add_argument('src', type=Path)
    parser.add_argument('dst', type=Path)
    parser.add_argument('--color', type=parse_hex, default=None)
    parser.add_argument('--threshold', type=int, default=40)
    args = parser.parse_args()

    img = Image.open(args.src).convert('RGBA')  # palette/grayscale PNGs 반환 int → RGB 튜플로 변환 위해
    bg = args.color or estimate_bg(img)
    out = key_out(img, bg, args.threshold)
    out.save(args.dst, 'PNG')

    alpha_zero = sum(1 for a in out.getchannel('A').getdata() if a == 0)
    total = out.width * out.height
    print(f'OK {args.dst} bg=#{bg[0]:02x}{bg[1]:02x}{bg[2]:02x} transparent={alpha_zero * 100 // total}%')
    return 0


if __name__ == '__main__':
    sys.exit(main())
