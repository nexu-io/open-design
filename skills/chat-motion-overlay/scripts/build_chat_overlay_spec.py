#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


SIDE_MAP = {"left": "left", "right": "right", "左": "left", "右": "right"}
PRESET_KEYS = [
    "female-bunny-pink",
    "female-cat-orange",
    "female-fox-yellow",
    "male-bear-mint",
    "male-penguin-blue",
    "male-koala-lilac",
]

ALLOWED_CONTAINERS = {"none", "wechat", "telegram", "messenger"}
ALLOWED_AVATAR_MODES = {"preset", "upload", "mixed"}
ALLOWED_DEVICE_FRAMES = {"none", "iphone-dynamic-island"}
ALLOWED_NICKNAME_MODES = {"hidden", "first-message-only", "always"}
ALLOWED_DELIVERY_FORMATS = {"mov", "webm", "json", "remotion", "hyperframe", "preview"}
DELIVERY_TO_OUTPUT = {
    "mov": "mov-alpha",
    "webm": "webm-alpha",
    "json": "json-spec",
    "remotion": "remotion-component",
    "hyperframe": "hyperframe-ready",
    "preview": "preview-only",
}

DEFAULT_CONFIG = {
    "container": "wechat",
    "avatarMode": "preset",
    "deviceFrame": "iphone-dynamic-island",
    "nicknameMode": "hidden",
    "deliveryFormat": "mov",
    "showTimestamp": True,
    "participants": {},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a configurable chat motion overlay scene spec.")
    parser.add_argument("--input", required=True, help="Path to transcript text file")
    parser.add_argument("--config", help="Path to scene config JSON")
    parser.add_argument("--output", help="Path to output JSON file")
    return parser.parse_args()


def parse_transcript(path: Path) -> dict:
    metadata = {"title": "聊天记录", "time": "今天", "start": 15, "gap": 18, "hold": 36}
    raw_messages: list[dict] = []
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        meta_match = re.match(r"^(title|time|start|gap|hold)\s*[:：]\s*(.+)$", line, flags=re.IGNORECASE)
        if meta_match:
            key = meta_match.group(1).strip().lower()
            value = meta_match.group(2).strip()
            metadata[key] = int(value) if key in {"start", "gap", "hold"} else value
            continue
        raw_messages.append(parse_message_line(line))
    return {"metadata": metadata, "messages": raw_messages}


def parse_message_line(line: str) -> dict:
    parts = [part.strip() for part in line.split("|")] if "|" in line else []
    if not parts:
        match = re.match(r"^([^:：]{1,30})[:：]\s*(.+)$", line)
        if not match:
            raise ValueError(f"Cannot parse line: {line}")
        parts = [match.group(1).strip(), match.group(2).strip()]
    result = {"speaker": parts[0], "side": None, "avatar": None, "text": "", "highlight": False}
    if len(parts) == 2:
        result["text"] = parts[1]
        return result
    if len(parts) == 3:
        if is_flag(parts[2]):
            result["text"] = parts[1]
            result["highlight"] = True
            return result
        if is_side(parts[1]):
            result["side"] = SIDE_MAP[parts[1]]
            result["text"] = parts[2]
            return result
        result["text"] = parts[1]
        result["avatar"] = parts[2]
        return result
    if len(parts) >= 4 and is_side(parts[1]):
        result["side"] = SIDE_MAP[parts[1]]
        result["avatar"] = parts[2]
        result["text"] = parts[3]
        result["highlight"] = len(parts) > 4 and is_flag(parts[4])
        return result
    raise ValueError(f"Unsupported message line shape: {line}")


def is_side(value: str) -> bool:
    return value in SIDE_MAP


def is_flag(value: str) -> bool:
    return value.strip().lower() == "highlight"


def load_config(path: str | None) -> dict:
    config = json.loads(json.dumps(DEFAULT_CONFIG))
    if not path:
        validate_config(config)
        return config
    user = json.loads(Path(path).read_text(encoding="utf-8"))
    config.update(user)
    validate_config(config)
    return config


def validate_config(config: dict) -> None:
    if config["container"] not in ALLOWED_CONTAINERS:
        raise ValueError(f"Unsupported container: {config['container']}")
    if config["avatarMode"] not in ALLOWED_AVATAR_MODES:
        raise ValueError(f"Unsupported avatarMode: {config['avatarMode']}")
    if config["deviceFrame"] not in ALLOWED_DEVICE_FRAMES:
        raise ValueError(f"Unsupported deviceFrame: {config['deviceFrame']}")
    if config["nicknameMode"] not in ALLOWED_NICKNAME_MODES:
        raise ValueError(f"Unsupported nicknameMode: {config['nicknameMode']}")
    if config["deliveryFormat"] not in ALLOWED_DELIVERY_FORMATS:
        raise ValueError(f"Unsupported deliveryFormat: {config['deliveryFormat']}")
    if config["container"] == "none" and config["deviceFrame"] == "iphone-dynamic-island":
        raise ValueError("container=none does not support deviceFrame=iphone-dynamic-island; use deviceFrame=none or choose an app container")

    for speaker, participant in config.get("participants", {}).items():
        side = participant.get("side")
        if side and side not in {"left", "right"}:
            raise ValueError(f"Unsupported side for participant {speaker}: {side}")
        preset_key = participant.get("preset")
        if preset_key and preset_key not in PRESET_KEYS:
            raise ValueError(f"Unsupported preset for participant {speaker}: {preset_key}")
        upload_path = participant.get("uploadPath")
        if participant.get("uploadAsset"):
            raise ValueError(f"Participant {speaker} config must use uploadPath, not uploadAsset")
        if config["avatarMode"] == "preset" and upload_path:
            raise ValueError(f"avatarMode=preset does not allow uploadPath for participant {speaker}")
        if config["avatarMode"] == "upload" and not upload_path:
            raise ValueError(f"avatarMode=upload requires uploadPath for participant {speaker}")


def auto_avatar_for_participant(participant_index: int, used_avatar_keys: set[str]) -> str:
    preferred = [*PRESET_KEYS[participant_index:], *PRESET_KEYS[:participant_index]]
    for avatar_key in preferred:
        if avatar_key not in used_avatar_keys:
            return avatar_key
    return PRESET_KEYS[participant_index % len(PRESET_KEYS)]


def configured_participant(speaker: str, config: dict) -> dict:
    return config.get("participants", {}).get(speaker, {})


def build_spec(parsed: dict, config: dict) -> dict:
    meta = parsed["metadata"]
    participants = {}
    used_participant_ids = set()
    order = []
    messages = []
    start = int(meta["start"])
    gap = int(meta["gap"])
    for index, message in enumerate(parsed["messages"]):
        speaker = message["speaker"]
        if speaker not in participants:
            order.append(speaker)
            configured = configured_participant(speaker, config)
            inferred_side = "left" if len(order) == 1 else "right" if len(order) == 2 else "left"
            side = configured.get("side") or message["side"] or inferred_side
            avatar_key = configured.get("preset") or message["avatar"] or auto_avatar_for_participant(
                len(order) - 1, {p["avatarKey"] for p in participants.values()}
            )
            if avatar_key not in PRESET_KEYS:
                raise ValueError(f"Unsupported avatar key for participant {speaker}: {avatar_key}")
            participant = {
                "id": unique_slug(slugify(speaker), used_participant_ids),
                "name": speaker,
                "side": side,
                "avatarKey": avatar_key,
            }
            used_participant_ids.add(participant["id"])
            if config["avatarMode"] in {"upload", "mixed"} and configured.get("uploadPath"):
                participant["uploadPath"] = configured["uploadPath"]
            if config["avatarMode"] == "upload" and not participant.get("uploadPath"):
                raise ValueError(f"avatarMode=upload requires uploadPath for participant {speaker}")
            participants[speaker] = participant
        participant = participants[speaker]
        side = message["side"] or participant["side"]
        if side != participant["side"]:
            raise ValueError(f"Participant {speaker} appears on both {participant['side']} and {side}; use one side per participant")
        avatar_key = participant["avatarKey"]
        if message["avatar"] and message["avatar"] != participant["avatarKey"] and not configured_participant(speaker, config).get("preset"):
            raise ValueError(f"Participant {speaker} has conflicting transcript avatar hints: {participant['avatarKey']} and {message['avatar']}; set a config preset to override")
        messages.append(
            {
                "id": f"msg-{index + 1}",
                "speaker": speaker,
                "text": message["text"].strip(),
                "side": side,
                "avatarKey": avatar_key,
                "appearAt": start + index * gap,
                "highlight": bool(message["highlight"]),
            }
        )
    if config["avatarMode"] == "mixed" and not any(participant.get("uploadPath") for participant in participants.values()):
        raise ValueError("avatarMode=mixed requires at least one upload path")
    duration = start + max(len(messages) - 1, 0) * gap + int(meta["hold"])
    runtime_output = DELIVERY_TO_OUTPUT[config["deliveryFormat"]]
    scene_config = {key: value for key, value in config.items() if key != "participants"}
    return {
        "title": meta["title"],
        "timestamp": meta["time"],
        "durationInFrames": duration,
        "timing": {"start": start, "gap": gap, "hold": int(meta["hold"])},
        "sceneConfig": {**scene_config, "output": runtime_output},
        "participants": list(participants.values()),
        "messages": messages,
    }


def slugify(text: str) -> str:
    lowered = text.strip().lower()
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "-", lowered).strip("-") or "speaker"


def unique_slug(base: str, used: set[str]) -> str:
    if base not in used:
        return base
    index = 2
    while f"{base}-{index}" in used:
        index += 1
    return f"{base}-{index}"


def main() -> None:
    args = parse_args()
    parsed = parse_transcript(Path(args.input))
    config = load_config(args.config)
    spec = build_spec(parsed, config)
    output = json.dumps(spec, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
