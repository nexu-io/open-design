#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the chat-motion-overlay test matrix.")
    parser.add_argument("--skill-root", required=True, help="Path to the skill root")
    parser.add_argument("--work-dir", required=True, help="Directory for generated test artifacts")
    parser.add_argument("--node-modules", required=True, help="Resolved node_modules directory with remotion/react/typescript")
    parser.add_argument("--render", action="store_true", help="Render representative still frames with Remotion")
    return parser.parse_args()


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run(cmd: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True)


def read_generated_chat_spec(path: Path) -> dict:
    content = path.read_text(encoding="utf-8").strip()
    prefix = "export const chatSpec = "
    suffix = " as const;"
    if not content.startswith(prefix) or not content.endswith(suffix):
        raise ValueError("Generated chatSpec.ts has an unexpected shape")
    return json.loads(content[len(prefix) : -len(suffix)])


def participant(side: str, preset: str, upload_path: str | None = None) -> dict:
    value = {"side": side, "preset": preset}
    if upload_path:
        value["uploadPath"] = upload_path
    return value


def base_config(
    *,
    container: str = "wechat",
    avatar_mode: str = "preset",
    device_frame: str = "iphone-dynamic-island",
    nickname_mode: str = "hidden",
    delivery_format: str = "mov",
    show_timestamp: bool = True,
    participants: dict | None = None,
) -> dict:
    return {
        "container": container,
        "avatarMode": avatar_mode,
        "deviceFrame": device_frame,
        "nicknameMode": nickname_mode,
        "deliveryFormat": delivery_format,
        "showTimestamp": show_timestamp,
        "participants": participants or {
            "闺蜜": participant("left", "female-bunny-pink"),
            "老婆": participant("right", "female-cat-orange"),
        },
    }


def main() -> None:
    args = parse_args()
    skill_root = Path(args.skill_root).resolve()
    work_dir = Path(args.work_dir).resolve()
    node_modules = Path(args.node_modules).resolve()
    build_script = skill_root / "scripts" / "build_chat_overlay_spec.py"
    bundle_script = skill_root / "scripts" / "prepare_chat_overlay_bundle.py"
    transcript = skill_root / "assets" / "examples" / "chat-transcript.txt"
    avatar_dir = skill_root / "assets" / "avatar-library"

    if work_dir.exists():
        shutil.rmtree(work_dir)
    work_dir.mkdir(parents=True)

    sample_upload_left = str((avatar_dir / "female-bunny-pink.png").resolve())
    sample_upload_right = str((avatar_dir / "male-penguin-blue.png").resolve())
    missing_upload_right = str((avatar_dir / "missing-avatar-does-not-exist.png").resolve())
    group_transcript = """title: 闺蜜群（6）
time: 星期二 22:19

闺蜜A|左|今天没运动
闺蜜B|左|我也没动
老婆|右|那晚上少喝奶茶
闺蜜C|左|我已经点好了
"""
    side_conflict_transcript = """title: 冲突测试
time: 今天

老婆|right|第一句在右侧
老婆|left|第二句错误地在左侧
"""
    colliding_upload_transcript = """title: 碰撞测试
time: 今天

A!|left|第一个上传头像
A?|right|第二个上传头像
"""

    cases = [
        {
            "name": "default_wechat_phone_preset_hidden",
            "config": base_config(),
            "render": True,
            "render_frames": [14, 15, 120],
            "expect_fail": False,
        },
        {
            "name": "plain_bubbles_no_frame_first_message",
            "config": base_config(container="none", device_frame="none", nickname_mode="first-message-only", delivery_format="remotion", show_timestamp=False),
            "render": True,
            "expect_fail": False,
        },
        {
            "name": "telegram_no_frame_always",
            "config": base_config(
                container="telegram",
                device_frame="none",
                nickname_mode="always",
                delivery_format="webm",
                participants={
                    "闺蜜": participant("left", "female-fox-yellow"),
                    "老婆": participant("right", "male-bear-mint"),
                },
            ),
            "render": True,
            "expect_fail": False,
        },
        {
            "name": "messenger_phone_hidden",
            "config": base_config(
                container="messenger",
                participants={
                    "闺蜜": participant("left", "male-koala-lilac"),
                    "老婆": participant("right", "male-penguin-blue"),
                },
            ),
            "render": True,
            "expect_fail": False,
        },
        {
            "name": "upload_phone_always",
            "config": base_config(
                avatar_mode="upload",
                nickname_mode="always",
                participants={
                    "闺蜜": participant("left", "female-bunny-pink", sample_upload_left),
                    "老婆": participant("right", "female-cat-orange", sample_upload_right),
                },
            ),
            "render": True,
            "expect_fail": False,
        },
        {
            "name": "mixed_wechat_phone_first_message",
            "config": base_config(
                avatar_mode="mixed",
                nickname_mode="first-message-only",
                delivery_format="hyperframe",
                participants={
                    "闺蜜": participant("left", "female-bunny-pink", sample_upload_left),
                    "老婆": participant("right", "male-penguin-blue"),
                },
            ),
            "render": True,
            "expect_fail": False,
        },
        {
            "name": "json_spec_only",
            "config": base_config(delivery_format="json"),
            "render": False,
            "expect_fail": False,
        },
        {
            "name": "group_multi_participant_distinct_presets",
            "transcriptContent": group_transcript,
            "config": base_config(
                nickname_mode="always",
                delivery_format="preview",
                participants={
                    "闺蜜A": participant("left", "female-bunny-pink"),
                    "闺蜜B": participant("left", "female-fox-yellow"),
                    "老婆": participant("right", "female-cat-orange"),
                    "闺蜜C": participant("left", "male-bear-mint"),
                },
            ),
            "render": False,
            "expect_fail": False,
            "assert_distinct_participant_avatars": True,
        },
        {
            "name": "invalid_upload_missing_side",
            "config": base_config(
                avatar_mode="upload",
                nickname_mode="always",
                participants={
                    "闺蜜": participant("left", "female-bunny-pink", sample_upload_left),
                    "老婆": participant("right", "female-cat-orange"),
                },
            ),
            "render": False,
            "expect_fail": True,
            "expected_error": "avatarMode=upload requires uploadPath for participant 老婆",
        },
        {
            "name": "invalid_mixed_without_upload",
            "config": base_config(avatar_mode="mixed", nickname_mode="always"),
            "render": False,
            "expect_fail": True,
            "expected_error": "avatarMode=mixed requires at least one upload path",
        },
        {
            "name": "invalid_upload_missing_file",
            "config": base_config(
                avatar_mode="upload",
                nickname_mode="always",
                participants={
                    "闺蜜": participant("left", "female-bunny-pink", sample_upload_left),
                    "老婆": participant("right", "female-cat-orange", missing_upload_right),
                },
            ),
            "render": False,
            "expect_fail": True,
            "fail_phase": "prepare_bundle",
            "expected_error": "Configured uploadPath for participant 老婆 does not exist",
            "assert_no_partial_spec_on_failure": True,
        },
        {
            "name": "invalid_force_dangerous_output_dir",
            "config": base_config(),
            "render": False,
            "expect_fail": True,
            "fail_phase": "prepare_bundle",
            "output_dir": "__SKILL_ROOT__",
            "expected_error": "Refusing to use dangerous output directory",
        },
        {
            "name": "invalid_participant_side_conflict",
            "transcriptContent": side_conflict_transcript,
            "config": base_config(
                participants={
                    "老婆": participant("right", "female-cat-orange"),
                },
            ),
            "render": False,
            "expect_fail": True,
            "expected_error": "Participant 老婆 appears on both right and left",
        },
       {
           "name": "upload_slug_collision_unique_assets",
           "transcriptContent": colliding_upload_transcript,
           "config": base_config(
               avatar_mode="upload",
               nickname_mode="always",
               participants={
                   "A!": participant("left", "female-bunny-pink", sample_upload_left),
                   "A?": participant("right", "male-penguin-blue", sample_upload_right),
               },
           ),
           "render": False,
           "expect_fail": False,
           "assert_unique_upload_assets": True,
       },
        {
            "name": "invalid_transcript_avatar_key",
            "transcriptContent": "title: 无效头像测试\ntime: 今天\n\nAlice|left|not-a-preset|你好\n",
            "config": base_config(nickname_mode="always"),
            "render": False,
            "expect_fail": True,
            "expected_error": "Unsupported avatar key for participant Alice: not-a-preset",
        },
        {
            "name": "invalid_preset_mode_upload_path",
            "config": base_config(
                avatar_mode="preset",
                nickname_mode="always",
                participants={
                    "闺蜜": participant("left", "female-bunny-pink"),
                    "老婆": participant("right", "female-cat-orange", sample_upload_left),
                },
            ),
            "render": False,
            "expect_fail": True,
            "expected_error": "avatarMode=preset does not allow uploadPath for participant 老婆",
        },
        {
            "name": "config_preset_overrides_transcript_avatar_hint",
            "transcriptContent": "title: \u4f18\u5148\u7ea7\u6d4b\u8bd5\ntime: \u4eca\u5929\n\nAlice|left|male-penguin-blue|\u4f60\u597d\n",
            "config": base_config(
                nickname_mode="always",
                participants={
                    "Alice": participant("left", "female-bunny-pink"),
                },
            ),
            "render": False,
            "expect_fail": False,
            "assert_config_avatar_wins": True,
        },
   ]

    results = []
    tsc_bin = node_modules / ".bin" / "tsc"
    remotion_bin = node_modules / ".bin" / "remotion"

    for case in cases:
        case_dir = work_dir / case["name"]
        case_dir.mkdir(parents=True, exist_ok=True)
        config_path = case_dir / "config.json"
        spec_path = case_dir / "spec.json"
        bundle_dir = skill_root if case.get("output_dir") == "__SKILL_ROOT__" else case_dir / "bundle"
        active_transcript = transcript
        if case.get("transcriptContent"):
            active_transcript = case_dir / "transcript.txt"
            active_transcript.write_text(case["transcriptContent"], encoding="utf-8")
        write_json(config_path, case["config"])

        build_proc = run(
            [sys.executable, str(build_script), "--input", str(active_transcript), "--config", str(config_path), "--output", str(spec_path)],
            cwd=skill_root,
        )

        if case["expect_fail"]:
            fail_phase = case.get("fail_phase", "validation")
            if fail_phase == "validation":
                combined = (build_proc.stdout or "") + (build_proc.stderr or "")
                ok = build_proc.returncode != 0 and case["expected_error"] in combined
                results.append({"case": case["name"], "status": "passed" if ok else "failed", "phase": "validation", "details": combined.strip()})
                continue

            if build_proc.returncode != 0:
                results.append({"case": case["name"], "status": "failed", "phase": "build_spec", "details": build_proc.stderr.strip() or build_proc.stdout.strip()})
                continue

            bundle_proc = run(
                [
                    sys.executable,
                    str(bundle_script),
                    "--transcript",
                    str(transcript),
                    "--config",
                    str(config_path),
                    "--output-dir",
                    str(bundle_dir),
                    "--force",
                ],
                cwd=skill_root,
            )
            combined = (bundle_proc.stdout or "") + (bundle_proc.stderr or "")
            ok = bundle_proc.returncode != 0 and case["expected_error"] in combined
            if ok and case.get("assert_no_partial_spec_on_failure"):
                leaked_spec = bundle_dir / "src" / "chatSpec.ts"
                if leaked_spec.exists():
                    leaked_content = leaked_spec.read_text(encoding="utf-8")
                    if "uploadPath" in leaked_content or "/Users/" in leaked_content:
                        ok = False
                        combined += "\nPartial bundle leaked local upload-path data after failure."
            results.append({"case": case["name"], "status": "passed" if ok else "failed", "phase": "prepare_bundle", "details": combined.strip()})
            continue

        if build_proc.returncode != 0:
            results.append({"case": case["name"], "status": "failed", "phase": "build_spec", "details": build_proc.stderr.strip()})
            continue

        if case.get("assert_distinct_participant_avatars"):
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
            avatar_keys = [participant["avatarKey"] for participant in spec["participants"]]
            if len(set(avatar_keys)) != len(avatar_keys):
                results.append(
                    {
                        "case": case["name"],
                        "status": "failed",
                        "phase": "participant_avatars",
                        "details": f"Expected distinct participant avatars, got {avatar_keys}",
                    }
                )
                continue

        if case.get("assert_config_avatar_wins"):
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
            alice = next(p for p in spec["participants"] if p["name"] == "Alice")
            if alice["avatarKey"] != "female-bunny-pink":
                results.append(
                    {
                        "case": case["name"],
                        "status": "failed",
                        "phase": "config_avatar_precedence",
                        "details": f"Expected config preset female-bunny-pink, got {alice['avatarKey']}",
                    }
                )
                continue

        bundle_proc = run(
            [
                sys.executable,
                str(bundle_script),
                "--transcript",
                str(active_transcript),
                "--config",
                str(config_path),
                "--output-dir",
                str(bundle_dir),
                "--force",
            ],
            cwd=skill_root,
        )
        if bundle_proc.returncode != 0:
            results.append({"case": case["name"], "status": "failed", "phase": "prepare_bundle", "details": bundle_proc.stderr.strip()})
            continue

        generated_spec = (bundle_dir / "src" / "chatSpec.ts").read_text(encoding="utf-8")
        if "uploadPath" in generated_spec or "UploadPath" in generated_spec or "/Users/" in generated_spec:
            results.append(
                {
                    "case": case["name"],
                    "status": "failed",
                    "phase": "bundle_sanitization",
                    "details": "Generated chatSpec.ts leaked local upload-path data.",
                }
            )
            continue

        if case.get("assert_unique_upload_assets"):
            spec = read_generated_chat_spec(bundle_dir / "src" / "chatSpec.ts")
            upload_assets = [participant.get("uploadAsset") for participant in spec["participants"] if participant.get("uploadAsset")]
            if len(upload_assets) != len(set(upload_assets)):
                results.append(
                    {
                        "case": case["name"],
                        "status": "failed",
                        "phase": "upload_asset_collision",
                        "details": f"Expected unique upload assets, got {upload_assets}",
                    }
                )
                continue
            missing_assets = [asset for asset in upload_assets if not (bundle_dir / "public" / asset).exists()]
            if missing_assets:
                results.append(
                    {
                        "case": case["name"],
                        "status": "failed",
                        "phase": "upload_asset_files",
                        "details": f"Generated spec references missing upload assets: {missing_assets}",
                    }
                )
                continue

        if case["name"] == "plain_bubbles_no_frame_first_message":
            bubble_scene_source = (bundle_dir / "src" / "components" / "BubbleScene.tsx").read_text(encoding="utf-8")
            if 'justifyContent: isRight ? "flex-end" : "flex-start"' not in bubble_scene_source:
                results.append(
                    {
                        "case": case["name"],
                        "status": "failed",
                        "phase": "bubble_alignment_style",
                        "details": "Bubble-only template must explicitly justify right-side rows to flex-end.",
                    }
                )
                continue

        if case["name"] == "default_wechat_phone_preset_hidden":
            package_json_source = (bundle_dir / "package.json").read_text(encoding="utf-8")
            if '"render:mov": "remotion render src/index.ts ChatMotionOverlay out/chat-motion-overlay.mov' not in package_json_source:
                results.append(
                    {
                        "case": case["name"],
                        "status": "failed",
                        "phase": "render_command",
                        "details": "render:mov script must include src/index.ts before the composition id.",
                    }
                )
                continue
            if '"render:webm": "remotion render src/index.ts ChatMotionOverlay out/chat-motion-overlay.webm' not in package_json_source:
                results.append(
                    {
                        "case": case["name"],
                        "status": "failed",
                        "phase": "render_command",
                        "details": "render:webm script must include src/index.ts before the composition id.",
                    }
                )
                continue

        symlink_path = bundle_dir / "node_modules"
        if symlink_path.exists() or symlink_path.is_symlink():
            symlink_path.unlink()
        symlink_path.symlink_to(node_modules)

        tsc_proc = run([str(tsc_bin), "--noEmit", "-p", str(bundle_dir / "tsconfig.json")], cwd=bundle_dir)
        if tsc_proc.returncode != 0:
            results.append({"case": case["name"], "status": "failed", "phase": "tsc", "details": tsc_proc.stderr.strip() or tsc_proc.stdout.strip()})
            continue

        if args.render and case["render"]:
            frames = case.get("render_frames", [120])
            for frame in frames:
                preview_path = case_dir / f"preview-frame-{frame}.png"
                render_proc = run(
                    [str(remotion_bin), "still", "src/index.ts", "ChatMotionOverlay", str(preview_path), "--scale=0.15", f"--frame={frame}"],
                    cwd=bundle_dir,
                )
                if render_proc.returncode != 0:
                    results.append(
                        {
                            "case": case["name"],
                            "status": "failed",
                            "phase": "render",
                            "details": f"frame={frame}: " + (render_proc.stderr.strip() or render_proc.stdout.strip()),
                        }
                    )
                    break
            else:
                results.append({"case": case["name"], "status": "passed", "phase": "complete", "details": ""})
                continue

        results.append({"case": case["name"], "status": "passed", "phase": "complete", "details": ""})

    summary = {
        "passed": sum(1 for item in results if item["status"] == "passed"),
        "failed": sum(1 for item in results if item["status"] == "failed"),
        "results": results,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
