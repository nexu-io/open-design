#!/usr/bin/env python3
"""为 Pilot 批准与多段视频首尾帧链提供可审计的硬门。"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
import yaml

from media_edges import extract_first_frame, extract_last_frame

PILOT_ARTIFACTS = (
    "conceptContract",
    "firstFrame",
    "lastFrame",
    "pilotVideo",
    "pageEvidence",
)

class UniqueKeyLoader(yaml.SafeLoader):
    """拒绝 YAML 重复键，避免后值静默覆盖已经批准的合同语义。"""


def construct_unique_mapping(
    loader: UniqueKeyLoader,
    node: yaml.nodes.MappingNode,
    deep: bool = False,
) -> dict[Any, Any]:
    loader.flatten_mapping(node)
    mapping: dict[Any, Any] = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise ValueError(f"Concept Contract 包含重复字段：{key}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    construct_unique_mapping,
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_record(raw_path: str | Path) -> dict[str, Any]:
    path = Path(raw_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"验收工件不存在：{path}")
    return {
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }


def validate_artifact(
    record: dict[str, Any],
    label: str,
    require_exact_hash: bool = True,
    force: bool = False,
) -> None:
    path = Path(str(record.get("path", ""))).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"{label} 工件不存在：{path}")
    if path.stat().st_size == 0:
        raise ValueError(f"{label} 工件为空文件：{path}")
    if require_exact_hash:
        actual_size = path.stat().st_size
        actual_hash = sha256_file(path)
        if actual_size != record.get("bytes") or actual_hash != record.get("sha256"):
            if force:
                print(
                    f"警告：{label} 工件哈希已变化，已通过 --force 忽略差异：{path}",
                    file=sys.stderr,
                )
            else:
                raise ValueError(f"{label} 工件已变化，Pilot 批准失效：{path}")


def contract_continuity_mode(raw_path: str | Path) -> str:
    path = Path(raw_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"Concept Contract 不存在：{path}")
    try:
        contract = yaml.load(
            path.read_text(encoding="utf-8"),
            Loader=UniqueKeyLoader,
        )
    except yaml.YAMLError as error:
        raise ValueError(f"Concept Contract YAML 无效：{error}") from error
    if not isinstance(contract, dict):
        raise ValueError("Concept Contract 顶层必须是 YAML 对象")
    mode = contract.get("clip_continuity")
    if mode not in {"chain", "independent"}:
        raise ValueError(
            "Concept Contract 顶层必须显式包含 "
            "clip_continuity: chain | independent"
        )
    return mode


def create_pilot_approval(args: argparse.Namespace) -> dict[str, Any]:
    if args.decision != "pass":
        raise ValueError("只有明确传入 --decision pass 才能生成 Pilot 批准文件")
    continuity_mode = contract_continuity_mode(args.contract)
    artifacts = {
        "conceptContract": artifact_record(args.contract),
        "firstFrame": artifact_record(args.first_frame),
        "lastFrame": artifact_record(args.last_frame),
        "pilotVideo": artifact_record(args.video),
        "pageEvidence": artifact_record(args.page_evidence),
    }
    if args.identity_bible:
        artifacts["identityBible"] = artifact_record(args.identity_bible)
    report = {
        "schemaVersion": 1,
        "passed": True,
        "approvedAt": datetime.now(timezone.utc).isoformat(),
        "reviewer": args.reviewer,
        "continuityMode": continuity_mode,
        "notes": args.notes or "",
        "artifacts": artifacts,
    }
    output = Path(args.output).expanduser().resolve()
    if output.exists() and not args.force:
        raise FileExistsError(f"Pilot 批准文件已存在：{output}；确认后使用 --force")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return report


def validate_pilot_approval(
    raw_path: str | Path,
    force: bool = False,
) -> dict[str, Any]:
    path = Path(raw_path).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"缺少 Pilot 批准文件：{path}")
    report = json.loads(path.read_text(encoding="utf-8"))
    if report.get("schemaVersion") != 1 or report.get("passed") is not True:
        raise ValueError(f"Pilot 尚未通过：{path}")
    if not str(report.get("reviewer", "")).strip():
        raise ValueError(f"Pilot 批准缺少 reviewer：{path}")
    artifacts = report.get("artifacts")
    if not isinstance(artifacts, dict):
        raise ValueError(f"Pilot 批准缺少 artifacts：{path}")
    for label in PILOT_ARTIFACTS:
        record = artifacts.get(label)
        if not isinstance(record, dict):
            raise ValueError(f"Pilot 批准缺少 {label}：{path}")
        is_strict = label != "pageEvidence"
        validate_artifact(record, label, require_exact_hash=is_strict, force=force)
    approved_mode = report.get("continuityMode")
    if approved_mode not in {"chain", "independent"}:
        raise ValueError(f"Pilot 批准缺少有效 continuityMode：{path}")
    contract_path = artifacts["conceptContract"]["path"]
    actual_mode = contract_continuity_mode(contract_path)
    if actual_mode != approved_mode:
        if force:
            print(
                f"警告：Concept Contract 连续模式已由 {approved_mode} 变为 {actual_mode}，已通过 --force 允许执行",
                file=sys.stderr,
            )
        else:
            raise ValueError(f"Concept Contract 连续模式已变化，Pilot 批准失效：{path}")
    identity = artifacts.get("identityBible")
    if identity is not None:
        if not isinstance(identity, dict):
            raise ValueError(f"Pilot identityBible 记录无效：{path}")
        validate_artifact(identity, "identityBible", force=force)
    return report


def verify_frame_chain(
    previous_tail: str | Path,
    next_first: str | Path,
    segment_index: int,
    manifest_path: str | Path | None = None,
    force: bool = False,
) -> dict[str, Any]:
    if segment_index < 2:
        raise ValueError("帧链只用于第 2 段及之后的片段")
    previous = artifact_record(previous_tail)
    current = artifact_record(next_first)
    exact_match = (
        previous["bytes"] == current["bytes"]
        and previous["sha256"] == current["sha256"]
    )
    if not exact_match:
        if force:
            print(
                f"警告：第 {segment_index} 段首帧与上一段尾帧哈希不一致，已通过 --force 忽略差异继续执行",
                file=sys.stderr,
            )
        else:
            raise ValueError(
                "连续帧链断裂：下一段 --first-frame 不是上一段验收尾帧的原文件"
            )
    link = {
        "segmentIndex": segment_index,
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "exactSha256Match": exact_match,
        "previousTail": previous,
        "nextFirst": current,
    }
    if manifest_path is not None:
        manifest = Path(manifest_path).expanduser().resolve()
        if manifest.is_file():
            payload = json.loads(manifest.read_text(encoding="utf-8"))
        else:
            payload = {"schemaVersion": 1, "links": []}
        links = payload.setdefault("links", [])
        if not isinstance(links, list):
            raise ValueError(f"帧链清单格式错误：{manifest}")
        links = [
            item
            for item in links
            if item.get("segmentIndex") != segment_index
        ]
        links.append(link)
        payload["links"] = sorted(links, key=lambda item: item["segmentIndex"])
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return link


def frame_similarity(previous: Path, current: Path) -> dict[str, float]:
    with Image.open(previous) as opened:
        first = np.asarray(opened.convert("RGB"), dtype=np.float64) / 255.0
    with Image.open(current) as opened:
        second = np.asarray(opened.convert("RGB"), dtype=np.float64) / 255.0
    if first.shape != second.shape:
        raise ValueError(
            f"相邻成片尺寸不同：{first.shape[1]}x{first.shape[0]} 与 "
            f"{second.shape[1]}x{second.shape[0]}"
        )
    mae = float(np.mean(np.abs(first - second)))
    first_mean = np.mean(first, axis=(0, 1))
    second_mean = np.mean(second, axis=(0, 1))
    first_variance = np.var(first, axis=(0, 1))
    second_variance = np.var(second, axis=(0, 1))
    covariance = np.mean(
        (first - first_mean) * (second - second_mean), axis=(0, 1)
    )
    c1 = 0.01**2
    c2 = 0.03**2
    ssim = np.mean(
        ((2 * first_mean * second_mean + c1) * (2 * covariance + c2))
        / (
            (first_mean**2 + second_mean**2 + c1)
            * (first_variance + second_variance + c2)
        )
    )
    return {"ssim": round(float(ssim), 6), "normalizedMae": round(mae, 6)}


def verify_output_chain(
    previous_video: str | Path,
    next_video: str | Path,
    segment_index: int,
    manifest_path: str | Path,
    evidence_directory: str | Path,
    minimum_ssim: float = 0.97,
    maximum_mae: float = 0.04,
) -> dict[str, Any]:
    if segment_index < 2:
        raise ValueError("成片接缝只用于第 2 段及之后的片段")
    if not 0 <= minimum_ssim <= 1 or not 0 <= maximum_mae <= 1:
        raise ValueError("SSIM 与 MAE 阈值必须在 0..1")
    evidence = Path(evidence_directory).expanduser().resolve()
    previous_tail = evidence / f"segment-{segment_index - 1:02d}-tail.png"
    next_head = evidence / f"segment-{segment_index:02d}-head.png"
    extract_last_frame(previous_video, previous_tail)
    extract_first_frame(next_video, next_head)
    metrics = frame_similarity(previous_tail, next_head)
    passed = (
        metrics["ssim"] >= minimum_ssim
        and metrics["normalizedMae"] <= maximum_mae
    )
    link = {
        "segmentIndex": segment_index,
        "verifiedAt": datetime.now(timezone.utc).isoformat(),
        "passed": passed,
        "thresholds": {
            "minimumSsim": minimum_ssim,
            "maximumNormalizedMae": maximum_mae,
        },
        "metrics": metrics,
        "previousTail": artifact_record(previous_tail),
        "nextHead": artifact_record(next_head),
        "previousVideo": artifact_record(previous_video),
        "nextVideo": artifact_record(next_video),
    }
    manifest = Path(manifest_path).expanduser().resolve()
    if manifest.is_file():
        payload = json.loads(manifest.read_text(encoding="utf-8"))
    else:
        payload = {"schemaVersion": 1, "links": [], "outputLinks": []}
    output_links = payload.setdefault("outputLinks", [])
    if not isinstance(output_links, list):
        raise ValueError(f"帧链清单 outputLinks 格式错误：{manifest}")
    output_links = [
        item for item in output_links if item.get("segmentIndex") != segment_index
    ]
    output_links.append(link)
    payload["outputLinks"] = sorted(
        output_links, key=lambda item: item["segmentIndex"]
    )
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    if not passed:
        raise ValueError(
            "相邻成片接缝不连续："
            f"SSIM {metrics['ssim']:.4f}，MAE {metrics['normalizedMae']:.4f}"
        )
    return link


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description="校验 oil-motion 生产硬门")
    commands = result.add_subparsers(dest="command", required=True)

    approve = commands.add_parser("approve-pilot", help="生成可校验的 Pilot 批准文件")
    approve.add_argument("--contract", required=True)
    approve.add_argument("--identity-bible")
    approve.add_argument("--first-frame", required=True)
    approve.add_argument("--last-frame", required=True)
    approve.add_argument("--video", required=True)
    approve.add_argument("--page-evidence", required=True)
    approve.add_argument("--reviewer", required=True)
    approve.add_argument("--notes")
    approve.add_argument("--decision", choices=("pass", "reject"), required=True)
    approve.add_argument("--output", required=True)
    approve.add_argument("--force", action="store_true")

    check = commands.add_parser("check-pilot", help="复核 Pilot 工件未变化")
    check.add_argument("approval")

    chain = commands.add_parser("verify-chain", help="验证并记录相邻片段帧链")
    chain.add_argument("--previous-tail", required=True)
    chain.add_argument("--next-first", required=True)
    chain.add_argument("--segment-index", type=int, required=True)
    chain.add_argument("--manifest", required=True)

    output_chain = commands.add_parser(
        "verify-output-chain", help="验证相邻成片解码后的实际接缝"
    )
    output_chain.add_argument("--previous-video", required=True)
    output_chain.add_argument("--next-video", required=True)
    output_chain.add_argument("--segment-index", type=int, required=True)
    output_chain.add_argument("--manifest", required=True)
    output_chain.add_argument("--evidence-dir", required=True)
    output_chain.add_argument("--min-ssim", type=float, default=0.97)
    output_chain.add_argument("--max-mae", type=float, default=0.04)
    return result


def main() -> int:
    args = parser().parse_args()
    if args.command == "approve-pilot":
        create_pilot_approval(args)
        print(f"Pilot 已批准：{Path(args.output).expanduser().resolve()}")
    elif args.command == "check-pilot":
        validate_pilot_approval(args.approval)
        print(f"Pilot 工件有效：{Path(args.approval).expanduser().resolve()}")
    elif args.command == "verify-chain":
        verify_frame_chain(
            args.previous_tail,
            args.next_first,
            args.segment_index,
            args.manifest,
        )
        print(f"帧链已验证：segment {args.segment_index}")
    else:
        verify_output_chain(
            args.previous_video,
            args.next_video,
            args.segment_index,
            args.manifest,
            args.evidence_dir,
            args.min_ssim,
            args.max_mae,
        )
        print(f"成片接缝已验证：segment {args.segment_index}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (
        FileNotFoundError,
        FileExistsError,
        RuntimeError,
        ValueError,
        json.JSONDecodeError,
    ) as error:
        print(f"错误：{error}")
        raise SystemExit(1) from error
