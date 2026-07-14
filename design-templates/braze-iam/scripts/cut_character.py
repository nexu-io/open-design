#!/usr/bin/env python3
"""
Role: 단색(크로마키) 배경 이미지를 투명 PNG로 키잉 — 캐릭터 컷아웃·오브제 폴백 공용
Key Features: 테두리 중앙값 배경 추정 + flood fill 연결성분 키잉(비네트·그라디언트 강건),
              폐곡 구멍 2패스, 경계 밴드 에지 언믹싱(혼합색 → 반투명 원색 복원),
              성분 크기 스펙클 필터 (저알파 일괄 제거 없음 — 소프트 에지 보존)
Dependencies: Pillow, numpy (scipy.ndimage 있으면 사용, 없으면 내장 BFS 폴백)
Notes: gpt-5.5가 투명 배경 생성을 못 하는 경우의 폴백 경로 — 단색 배경으로 생성한 뒤
       본 스크립트로 키잉한다 (imagegen-pipeline.md 폴백 절). 권장 크로마 = #B0B0B0
       중성 그레이 (에지 혼합이 색조 오염 없는 탈채도로만 남아 프린지 비가시화) —
       오브제가 그레이·크롬 계열일 때만 마젠타 #FF00FF 폴백.
       ⚠️ 오브제 내부의 배경색 유사 폐곡 영역(그레이 금속 부품 등)은 2패스 구멍
       판정(성분 중앙값 dist ≤ threshold×0.6)에 걸려 제거될 수 있다 — 그런 오브제는
       크로마 색을 바꿔 재생성하라.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

try:
    from scipy import ndimage as _ndi  # 성분 라벨링·팽창 가속 — 없으면 BFS 폴백
except ImportError:  # pragma: no cover
    _ndi = None


def parse_hex(value: str) -> tuple[int, int, int]:
    # "#RRGGBB" → (r, g, b)
    v = value.lstrip('#')
    if len(v) != 6:
        raise argparse.ArgumentTypeError(f'invalid color: {value} (expect #RRGGBB)')
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _label(mask: np.ndarray) -> tuple[np.ndarray, int]:
    # 4-연결 성분 라벨링 — scipy 없으면 BFS
    if _ndi is not None:
        labels, n = _ndi.label(mask)
        return labels, n
    labels = np.zeros(mask.shape, dtype=np.int32)
    n = 0
    from collections import deque
    h, w = mask.shape
    for sy, sx in zip(*np.nonzero(mask & (labels == 0))):
        if labels[sy, sx]:
            continue
        n += 1
        q = deque([(sy, sx)])
        labels[sy, sx] = n
        while q:
            y, x = q.popleft()
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = n
                    q.append((ny, nx))
    return labels, n


def _dilate(mask: np.ndarray, iterations: int) -> np.ndarray:
    # 4-연결 팽창 — scipy 없으면 np.roll 반복
    if _ndi is not None:
        return _ndi.binary_dilation(mask, iterations=iterations)
    out = mask.copy()
    for _ in range(iterations):
        out = out | np.roll(out, 1, 0) | np.roll(out, -1, 0) | np.roll(out, 1, 1) | np.roll(out, -1, 1)
    return out


def key_out(img: Image.Image, bg: tuple[int, int, int] | None, threshold: int,
            min_component: int) -> tuple[Image.Image, tuple[int, int, int]]:
    arr = np.asarray(img.convert('RGBA')).astype(np.float32)
    rgb, alpha = arr[..., :3], arr[..., 3]
    h, w = alpha.shape

    if bg is None:
        # 테두리 2px 밴드 중앙값 — 꼭짓점 최빈값보다 비네트·노이즈에 강건
        band = np.concatenate([rgb[:2].reshape(-1, 3), rgb[-2:].reshape(-1, 3),
                               rgb[:, :2].reshape(-1, 3), rgb[:, -2:].reshape(-1, 3)])
        bg = tuple(int(v) for v in np.median(band, axis=0))
    bgv = np.array(bg, dtype=np.float32)

    dist = np.linalg.norm(rgb - bgv, axis=-1)
    soft = threshold * 1.6
    candidate = dist <= soft

    # 1패스: 테두리 연결 성분만 배경 — 오브제 내부 저채도 영역은 보존
    labels, n = _label(candidate)
    border_ids = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    border_ids = border_ids[border_ids > 0]
    bg_mask = np.isin(labels, border_ids)

    # 2패스: 폐곡 구멍 — 테두리 비연결 성분이라도 성분 중앙값이 배경색에 충분히
    # 가까우면(≤ threshold×0.6) 실제 배경이 비치는 구멍으로 판정해 제거
    for cid in range(1, n + 1):
        if cid in border_ids:
            continue
        comp = labels == cid
        if np.median(dist[comp]) <= threshold * 0.6:
            bg_mask |= comp

    # 에지 언믹싱: 배경 영역 중 전경 인접 밴드(4px)의 혼합 픽셀을 반투명으로 복원
    #   alpha = clamp((dist-threshold)/(soft-threshold))
    fg_mask = ~bg_mask
    edge_zone = bg_mask & _dilate(fg_mask, 4) & (dist > threshold)
    ramp = np.clip((dist - threshold) / (soft - threshold), 0.0, 1.0)

    new_alpha = np.where(bg_mask, 0.0, alpha)
    new_alpha[edge_zone] = ramp[edge_zone] * alpha[edge_zone]

    # 스펙클: 성분 크기 + 본체 원격 필터 — 저알파 일괄 제거는 소프트 에지를
    # 파괴하므로 금지. 판정은 솔리드 전경 기준 (에지 램프 링이 성분 크기를
    # 불리는 것 방지). 소성분이라도 본체 실루엣 근처(12px 이내)의 AA 전이
    # 파편은 오브제 에지의 일부라 보존한다 — 크기 단독 판정이 벨 림 실루엣을
    # 갉아먹은 실측 (2026-07-14 벨 3d-illust, 오삭제 315px). 본체에서 떨어진
    # 진짜 스펙클만 램프 링 포함 팽창 삭제.
    fg_labels, fn = _label(fg_mask)
    if fn:
        sizes = np.bincount(fg_labels.ravel())
        small = np.isin(fg_labels, np.nonzero(sizes < min_component)[0]) & (fg_labels > 0)
        big = fg_mask & ~small
        if small.any() and big.any():
            speckle = small & ~_dilate(big, 12)
            if speckle.any():
                new_alpha[_dilate(speckle, 5)] = 0.0

    # 에지 정련 (2026-07-14 노이즈 실측 개정):
    # ① 색 확장 — 반투명 픽셀 RGB를 최근접 솔리드 전경 픽셀 색으로 대체.
    #    언믹스 나눗셈 (픽셀−(1−α)bg)/α 는 저알파에서 노이즈를 증폭한다
    #    (RGB 표준편차 66 실측) — 색은 본체에서 가져오고 투명도만 램프가
    #    담당하면 원리적으로 조용하다.
    # ② 알파 페더 — dist 램프 밴드가 실측 <1px라 실루엣이 계단으로 남는다.
    #    경계 지대(안팎 2px)만 가우시안(σ0.9)으로 2~3px 소프트 에지 형성.
    semi = (new_alpha > 0) & ~fg_mask
    if semi.any():
        if _ndi is not None:
            _, idx = _ndi.distance_transform_edt(~fg_mask, return_indices=True)
            rgb[semi] = rgb[idx[0][semi], idx[1][semi]]
        else:
            filled = fg_mask.copy()
            for _ in range(6):
                for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
                    take = ~filled & np.roll(filled, sh, ax) & semi
                    rgb[take] = np.roll(rgb, sh, axis=ax)[take]
                    filled |= take
    inner_rim = fg_mask & _dilate(~fg_mask, 1)
    zone = _dilate(semi | inner_rim, 2)
    if zone.any():
        if _ndi is not None:
            blurred = _ndi.gaussian_filter(new_alpha, 0.9)
        else:
            blurred = new_alpha.copy()
            for _ in range(2):
                acc = blurred.copy()
                for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
                    acc = acc + np.roll(blurred, sh, ax)
                blurred = acc / 5.0
        new_alpha[zone] = blurred[zone]

    out = arr.copy()
    out[..., :3] = rgb
    out[..., 3] = new_alpha
    return Image.fromarray(out.astype(np.uint8)), bg


def main() -> int:
    parser = argparse.ArgumentParser(description='크로마키 배경 → 투명 PNG (flood fill + 에지 언믹싱)')
    parser.add_argument('src', type=Path)
    parser.add_argument('dst', type=Path)
    parser.add_argument('--color', type=parse_hex, default=None)
    parser.add_argument('--threshold', type=int, default=40)
    parser.add_argument('--min-component', type=int, default=60,
                        help='이 픽셀 수 미만의 고립 전경 성분은 스펙클로 제거')
    args = parser.parse_args()

    img = Image.open(args.src).convert('RGBA')  # palette/grayscale PNG 대응
    out, bg = key_out(img, args.color, args.threshold, args.min_component)
    out.save(args.dst, 'PNG')

    alpha = np.asarray(out.getchannel('A'))
    transparent = int((alpha == 0).sum() * 100 / alpha.size)
    print(f'OK {args.dst} bg=#{bg[0]:02x}{bg[1]:02x}{bg[2]:02x} transparent={transparent}%')
    return 0


if __name__ == '__main__':
    sys.exit(main())
