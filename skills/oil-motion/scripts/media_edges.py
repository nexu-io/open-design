#!/usr/bin/env python3
"""确定性提取视频首帧与实际尾帧。"""

from __future__ import annotations

import subprocess
from pathlib import Path


def extract_edge_frame(video: str | Path, output: str | Path, edge: str) -> None:
    source = Path(video).expanduser().resolve()
    target = Path(output).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"视频不存在：{source}")
    if edge not in {"head", "tail"}:
        raise ValueError("edge 必须是 head 或 tail")
    target.parent.mkdir(parents=True, exist_ok=True)
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    if edge == "tail":
        command.extend(["-sseof", "-3", "-i", str(source), "-update", "1"])
    else:
        command.extend(["-i", str(source), "-frames:v", "1"])
    command.append(str(target))
    completed = subprocess.run(command, capture_output=True, text=True)
    if completed.returncode != 0 or not target.is_file() or target.stat().st_size == 0:
        raise RuntimeError(
            f"无法提取视频{edge}帧：{completed.stderr.strip() or source}"
        )


def extract_first_frame(video: str | Path, output: str | Path) -> None:
    extract_edge_frame(video, output, "head")


def extract_last_frame(video: str | Path, output: str | Path) -> None:
    extract_edge_frame(video, output, "tail")
