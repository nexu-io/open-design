"""绿幕视频编译与 WebGL 运行时共享的 dominance-v2 色键规范。"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image


@dataclass(frozen=True)
class ChromaKeyParameters:
    algorithm: str
    mode: str
    key_color: tuple[int, int, int]
    similarity: float = 0.12
    smoothness: float = 0.06
    dominance_start: float = 0.0
    dominance_end: float = 0.12
    spill_start: float = -0.005
    spill_end: float = 0.06
    spill: float = 1.0

    def manifest(self) -> dict[str, Any]:
        data = asdict(self)
        return {
            "algorithm": data["algorithm"],
            "mode": data["mode"],
            "keyColor": list(data["key_color"]),
            "similarity": data["similarity"],
            "smoothness": data["smoothness"],
            "dominanceStart": data["dominance_start"],
            "dominanceEnd": data["dominance_end"],
            "spillStart": data["spill_start"],
            "spillEnd": data["spill_end"],
            "spill": data["spill"],
        }


def key_mode(key: tuple[int, int, int]) -> str:
    red, green, blue = key
    if green >= red + 40 and green >= blue + 40:
        return "green"
    if red >= green + 40 and blue >= green + 40:
        return "magenta"
    raise ValueError("色键不是可识别的绿色或洋红色")


def default_parameters(key: tuple[int, int, int]) -> ChromaKeyParameters:
    return ChromaKeyParameters(
        algorithm="dominance-v2",
        mode=key_mode(key),
        key_color=key,
    )


def _smoothstep(edge0: float, edge1: float, value: np.ndarray) -> np.ndarray:
    width = max(0.0001, edge1 - edge0)
    normalized = np.clip((value - edge0) / width, 0.0, 1.0)
    return normalized * normalized * (3.0 - 2.0 * normalized)


def _chroma(colors: np.ndarray) -> np.ndarray:
    luminance = (
        colors[..., 0] * 0.299
        + colors[..., 1] * 0.587
        + colors[..., 2] * 0.114
    )
    return np.stack(
        (colors[..., 2] - luminance, colors[..., 0] - luminance),
        axis=-1,
    )


def _dominance(colors: np.ndarray, mode: str) -> np.ndarray:
    if mode == "green":
        return colors[..., 1] - np.maximum(colors[..., 0], colors[..., 2])
    return np.minimum(colors[..., 0], colors[..., 2]) - colors[..., 1]


def apply_key(
    rgb: np.ndarray,
    parameters: ChromaKeyParameters,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """返回去溢色 RGB、Alpha 和原始色键通道优势，数值范围均为 0..1。"""
    colors = np.asarray(rgb, dtype=np.float32)
    if colors.size and float(colors.max()) > 1.0:
        colors = colors / 255.0
    key = np.asarray(parameters.key_color, dtype=np.float32) / 255.0
    distance = np.linalg.norm(_chroma(colors) - _chroma(key), axis=-1)
    distance_alpha = _smoothstep(
        parameters.similarity,
        parameters.similarity + parameters.smoothness,
        distance,
    )
    dominance = _dominance(colors, parameters.mode)
    dominance_mask = _smoothstep(
        parameters.dominance_start,
        parameters.dominance_end,
        dominance,
    )
    alpha = np.minimum(distance_alpha, 1.0 - dominance_mask)
    dominance_spill = _smoothstep(
        parameters.spill_start,
        parameters.spill_end,
        dominance,
    )
    spill_mask = np.clip(
        np.maximum(dominance_spill, (1.0 - alpha) * parameters.spill),
        0.0,
        1.0,
    )
    output = colors.copy()
    if parameters.mode == "green":
        neutral = np.maximum(colors[..., 0], colors[..., 2])
        output[..., 1] = colors[..., 1] * (1.0 - spill_mask) + neutral * spill_mask
    else:
        neutral = colors[..., 1]
        output[..., 0] = colors[..., 0] * (1.0 - spill_mask) + neutral * spill_mask
        output[..., 2] = colors[..., 2] * (1.0 - spill_mask) + neutral * spill_mask
    return np.clip(output, 0.0, 1.0), np.clip(alpha, 0.0, 1.0), dominance


def key_image(
    source: Path,
    output: Path,
    parameters: ChromaKeyParameters,
) -> dict[str, int]:
    rgb = np.asarray(Image.open(source).convert("RGB"), dtype=np.float32) / 255.0
    color, alpha, _ = apply_key(rgb, parameters)
    rgba = np.dstack(
        (
            np.rint(color * 255).astype(np.uint8),
            np.rint(alpha * 255).astype(np.uint8),
        )
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(output)
    return {
        "transparentPixels": int(np.count_nonzero(alpha <= 0.01)),
        "partialPixels": int(np.count_nonzero((alpha > 0.01) & (alpha < 0.99))),
    }


def analyze_frame(
    source: Path,
    parameters: ChromaKeyParameters,
) -> dict[str, float | int]:
    rgb = np.asarray(Image.open(source).convert("RGB"), dtype=np.float32) / 255.0
    output, alpha, dominance = apply_key(rgb, parameters)
    key_like = dominance > 0.02
    visible_key = key_like & (alpha > 0.01)
    opaque_key = key_like & (alpha > 0.5)
    border = np.zeros(alpha.shape, dtype=bool)
    band = max(2, min(alpha.shape) // 80)
    border[:band] = True
    border[-band:] = True
    border[:, :band] = True
    border[:, -band:] = True
    edge = (alpha > 0.02) & (alpha < 0.98)
    output_dominance = _dominance(output, parameters.mode)

    def percentile(values: np.ndarray, quantile: float) -> float:
        return float(np.quantile(values, quantile)) if values.size else 0.0

    key_count = max(1, int(np.count_nonzero(key_like)))
    return {
        "keyLikePixels": int(np.count_nonzero(key_like)),
        "keyLikeAlphaP99": percentile(alpha[key_like], 0.99),
        "visibleKeyPixelRatio": float(np.count_nonzero(visible_key) / key_count),
        "opaqueKeyPixelRatio": float(np.count_nonzero(opaque_key) / key_count),
        "borderAlphaP99": percentile(alpha[border], 0.99),
        "edgeKeyDominanceP95": max(0.0, percentile(output_dominance[edge], 0.95)),
        "meanAlpha": float(alpha.mean()),
    }
