#!/usr/bin/env python3
"""根据交互方式、显示尺寸和资源预算自动选择网页动画交付方案。"""

from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import asdict, dataclass
from pathlib import Path


def parse_size(value: str) -> tuple[int, int]:
    normalized = value.lower().replace("×", "x").strip()
    try:
        width_text, height_text = normalized.split("x", 1)
        width, height = int(width_text), int(height_text)
    except (ValueError, AttributeError) as exc:
        raise argparse.ArgumentTypeError("尺寸必须写成 WIDTHxHEIGHT") from exc
    if width <= 0 or height <= 0:
        raise argparse.ArgumentTypeError("宽高必须大于 0")
    return width, height


@dataclass(frozen=True)
class SizeCheck:
    width: int
    height: int
    required_width: int
    required_height: int
    width_ratio: float
    height_ratio: float
    passes: bool


def check_size(size: tuple[int, int], required: tuple[int, int]) -> SizeCheck:
    width, height = size
    required_width, required_height = required
    return SizeCheck(
        width=width,
        height=height,
        required_width=required_width,
        required_height=required_height,
        width_ratio=round(width / required_width, 3),
        height_ratio=round(height / required_height, 3),
        passes=width >= required_width and height >= required_height,
    )


def resolve_access(args: argparse.Namespace) -> str:
    if args.access != "auto":
        return args.access
    if args.time_control in {"segment-play", "autonomous"}:
        return "sequential"
    if args.parameter_space == "linear" and args.driver in {
        "scroll",
        "audio",
    }:
        return "sequential"
    return "random"


def select_delivery(
    args: argparse.Namespace,
    capacity: int,
    sheets: int | None,
    decoded_mib: float,
    access: str,
) -> dict[str, object]:
    atlas_within_budget = (
        capacity > 0
        and sheets is not None
        and sheets == 1
        and decoded_mib <= args.atlas_max_memory_mib
    )
    reason_codes: list[str] = []

    if args.background_owner == "video":
        selected = "baked-video"
        reason_codes.append("background-baked-into-video")
        if args.parameter_space in {"2d", "discrete"}:
            reason_codes.append("baked-video-needs-independent-clips")
        if (
            access == "sequential"
            and args.parameter_space == "linear"
            and args.frames >= args.linear_video_min_frames
        ):
            reason_codes.append("long-linear-sequence")
    elif args.parameter_space == "2d":
        selected = "alpha-atlas"
        reason_codes.append("two-dimensional-parameter-needs-discrete-frames")
        if not atlas_within_budget:
            reason_codes.append("atlas-needs-budget-optimization")
    elif args.parameter_space == "discrete":
        selected = "alpha-atlas"
        reason_codes.append("discrete-states-need-independent-assets")
        if not atlas_within_budget:
            reason_codes.append("states-need-separate-budgets")
    elif access == "random" and atlas_within_budget:
        selected = "alpha-atlas"
        reason_codes.append("random-access-fits-atlas-budget")
    elif (
        access == "sequential"
        and args.parameter_space == "linear"
        and args.frames >= args.linear_video_min_frames
    ):
        selected = "chroma-video"
        reason_codes.append("long-linear-sequence")
    elif not atlas_within_budget:
        selected = "chroma-video"
        reason_codes.append("atlas-budget-exceeded")
    else:
        selected = "alpha-atlas"
        reason_codes.append("small-asset-fits-atlas-budget")

    return {
        "selected": selected,
        "reasonCodes": reason_codes,
        "atlasWithinBudget": atlas_within_budget,
        "thresholds": {
            "atlasMaxSheets": 1,
            "atlasMaxDecodedMemoryMiB": args.atlas_max_memory_mib,
            "linearVideoMinFrames": args.linear_video_min_frames,
        },
    }


def build_report(args: argparse.Namespace) -> dict[str, object]:
    display_width, display_height = args.display
    required = (
        math.ceil(display_width * args.dpr),
        math.ceil(display_height * args.dpr),
    )
    required_width, required_height = required
    max_columns = args.max_texture // required_width
    max_rows = args.max_texture // required_height
    capacity = max_columns * max_rows
    sheets = math.ceil(args.frames / capacity) if capacity else None
    decoded_mib = (
        required_width * required_height * args.frames * 4 / 1024 / 1024
    )
    access = resolve_access(args)
    delivery = select_delivery(args, capacity, sheets, decoded_mib, access)
    runtime = {
        "renderer": {
            "alpha-atlas": "css-alpha-atlas",
            "chroma-video": "webgl-chroma-video",
            "baked-video": "baked-video",
        }[str(delivery["selected"])],
        "controller": {
            "scrub": "frame-scrub",
            "segment-play": "segment-playback",
            "autonomous": "autonomous-playback",
        }[args.time_control],
    }

    failures: list[str] = []
    source_check = check_size(args.source, required) if args.source else None
    cell_check = check_size(args.cell, required) if args.cell else None
    if source_check and not source_check.passes:
        failures.append("源素材低于最终显示所需像素")
    if (
        cell_check
        and delivery["selected"] == "alpha-atlas"
        and not cell_check.passes
    ):
        failures.append("图集单帧低于最终显示所需像素")
    if delivery["selected"] == "alpha-atlas" and capacity == 0:
        failures.append("单帧已超过纹理尺寸上限")
    if (
        delivery["selected"] == "baked-video"
        and args.parameter_space in {"2d", "discrete"}
    ):
        failures.append(
            "烘焙视频是一条线性时间轴，二维或离散参数必须拆成多条独立片段分别预算"
        )
    if (
        delivery["selected"] == "alpha-atlas"
        and not delivery["atlasWithinBudget"]
    ):
        if args.parameter_space == "discrete":
            failures.append("离散状态合并后超预算，需要拆成独立状态或转场并分别预算")
        else:
            failures.append(
                "二维 Alpha 图集超出单图集或内存预算，需要降低参数采样密度、"
                "拆分参数轴，或在用户确认的显示范围内重新预算"
            )

    temporal_check = None
    if args.scroll_pages is not None:
        required_frames = math.ceil(args.scroll_pages * args.frames_per_page)
        frames_per_page = args.frames / args.scroll_pages
        temporal_check = {
            "scrollPages": args.scroll_pages,
            "framesPerPage": round(frames_per_page, 2),
            "targetFramesPerPage": args.frames_per_page,
            "requiredFrames": required_frames,
            "passes": args.frames >= required_frames,
        }
        if not temporal_check["passes"]:
            failures.append(
                f"滚动采样密度不足：需要至少 {required_frames} 帧"
            )

    return {
        "display": {
            "width": display_width,
            "height": display_height,
            "dpr": args.dpr,
        },
        "requiredCell": {
            "width": required_width,
            "height": required_height,
        },
        "frames": args.frames,
        "texture": {
            "maxSize": args.max_texture,
            "columnsPerSheet": max_columns,
            "rowsPerSheet": max_rows,
            "framesPerSheet": capacity,
            "sheetCount": sheets,
        },
        "decodedFrameMemoryMiB": round(decoded_mib, 1),
        "sourceCheck": asdict(source_check) if source_check else None,
        "cellCheck": asdict(cell_check) if cell_check else None,
        "temporalCheck": temporal_check,
        "driver": args.driver,
        "parameterSpace": args.parameter_space,
        "timeControl": args.time_control,
        "access": access,
        "backgroundOwner": args.background_owner,
        "delivery": delivery,
        "runtime": runtime,
        "failures": failures,
        "passes": not failures,
    }


def print_human(report: dict[str, object]) -> None:
    display = report["display"]
    required = report["requiredCell"]
    texture = report["texture"]
    print(
        f"显示尺寸：{display['width']}×{display['height']} CSS px，"
        f"DPR {display['dpr']}"
    )
    print(f"最低单帧：{required['width']}×{required['height']} px")
    print(
        f"纹理预算：每片最多 {texture['columnsPerSheet']}×"
        f"{texture['rowsPerSheet']} 帧，共需 {texture['sheetCount']} 片"
    )
    print(f"全部帧解码内存理论值：{report['decodedFrameMemoryMiB']} MiB")
    delivery = report["delivery"]
    runtime = report["runtime"]
    print(
        f"背景归属：{report['backgroundOwner']}；"
        f"媒体：{delivery['selected']}；"
        f"控制器：{runtime['controller']}；渲染器：{runtime['renderer']}"
    )
    print("选择依据：" + "、".join(delivery["reasonCodes"]))

    for label, key in (("源素材", "sourceCheck"), ("当前单帧", "cellCheck")):
        check = report[key]
        if check:
            status = "通过" if check["passes"] else "不通过"
            print(
                f"{label}：{check['width']}×{check['height']} px，{status}"
                f"（宽 {check['width_ratio']}×，高 {check['height_ratio']}×）"
            )

    temporal = report["temporalCheck"]
    if temporal:
        status = "通过" if temporal["passes"] else "不通过"
        print(
            f"滚动采样：{temporal['framesPerPage']} 帧/屏，{status}"
            f"（目标 {temporal['targetFramesPerPage']} 帧/屏，"
            f"至少 {temporal['requiredFrames']} 帧）"
        )

    failures = report["failures"]
    if failures:
        print("阻断项：")
        for failure in failures:
            print(f"- {failure}")
    else:
        print("结果：通过")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "根据 Concept Contract 的背景归属、交互参数、CSS 尺寸、DPR、帧数和纹理预算"
            "自动选择烘焙场景视频、Alpha 图集或绿幕视频。"
        )
    )
    parser.add_argument("--frames", type=int, required=True, help="总帧数")
    parser.add_argument(
        "--display", type=parse_size, required=True, help="最终 CSS 尺寸，如 268x468"
    )
    parser.add_argument("--dpr", type=float, default=2.0, help="目标设备 DPR")
    parser.add_argument(
        "--max-texture", type=int, default=4096, help="保守纹理边长上限"
    )
    parser.add_argument(
        "--driver",
        choices=(
            "pointer",
            "scroll",
            "drag",
            "touch",
            "orientation",
            "audio",
            "data",
            "state",
            "time",
        ),
        default="scroll",
        help="Motion Brief 中的交互驱动，默认 scroll",
    )
    parser.add_argument(
        "--parameter-space",
        choices=("linear", "circular", "2d", "discrete"),
        default="linear",
        help="Motion Brief 中的参数空间，默认 linear",
    )
    parser.add_argument(
        "--time-control",
        choices=("scrub", "segment-play", "autonomous"),
        required=True,
        help="Concept Contract 中的时间控制方式，必须显式传入",
    )
    parser.add_argument(
        "--access",
        choices=("auto", "random", "sequential"),
        default="auto",
        help="运行时主要访问方式；默认根据 driver 与 parameter-space 自动推断",
    )
    parser.add_argument(
        "--background-owner",
        choices=("page", "video"),
        required=True,
        help=(
            "背景归属，来自 Concept Contract：video 表示背景与主体在同一视频中"
            "烘焙生成（baked-video，默认场景路线）；page 表示主体需要透明复用，"
            "由预算在 alpha-atlas 与 chroma-video 之间选择。必须显式传入，"
            "禁止因遗漏参数而静默回退到绿幕路线"
        ),
    )
    parser.add_argument(
        "--atlas-max-memory-mib",
        type=float,
        default=192.0,
        help="自动优先选择 Alpha 图集时允许的理论解码内存，默认 192 MiB",
    )
    parser.add_argument(
        "--linear-video-min-frames",
        type=int,
        default=180,
        help="一维顺序动画自动优先视频的帧数门槛，默认 180",
    )
    parser.add_argument("--source", type=parse_size, help="源视频或母版帧尺寸")
    parser.add_argument("--cell", type=parse_size, help="当前图集单帧尺寸")
    parser.add_argument(
        "--scroll-pages",
        type=float,
        help="滚动驱动覆盖的视口屏数；传入后同时检查时间采样密度",
    )
    parser.add_argument(
        "--frames-per-page",
        type=float,
        default=24.0,
        help="每屏目标帧数，默认 24",
    )
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--report", type=Path, help="同时把完整 JSON 报告写入指定路径")
    parser.add_argument(
        "--strict", action="store_true", help="存在阻断项时返回非零退出码"
    )
    args = parser.parse_args()

    if args.frames <= 0:
        parser.error("--frames 必须大于 0")
    if args.dpr <= 0:
        parser.error("--dpr 必须大于 0")
    if args.max_texture <= 0:
        parser.error("--max-texture 必须大于 0")
    if args.atlas_max_memory_mib <= 0:
        parser.error("--atlas-max-memory-mib 必须大于 0")
    if args.linear_video_min_frames <= 0:
        parser.error("--linear-video-min-frames 必须大于 0")
    if args.scroll_pages is not None and args.scroll_pages <= 0:
        parser.error("--scroll-pages 必须大于 0")
    if args.frames_per_page <= 0:
        parser.error("--frames-per-page 必须大于 0")

    report = build_report(args)
    if args.report:
        report_path = args.report.expanduser().resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print_human(report)
    return 2 if args.strict and not report["passes"] else 0


if __name__ == "__main__":
    sys.exit(main())
