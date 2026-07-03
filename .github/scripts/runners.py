#!/usr/bin/env python3

import json
import os
from pathlib import Path


GITHUB_HOSTED = ["ubuntu-24.04"]
WINDOWS_HOSTED = ["windows-latest"]
CONTABO_CONTROL = ["self-hosted", "Linux", "X64", "od-persistent-ci", "od-ci-hot-poc"]
BLACKSMITH_4V = ["blacksmith-4vcpu-ubuntu-2404"]


def compact_json(value):
    return json.dumps(value, separators=(",", ":"))


def normalize_mode(raw_mode):
    mode = (raw_mode or "default").strip().lower()
    if mode in {"default", "performance", "economic"}:
        return mode
    return "default"


def resolve_contract(mode):
    general_medium = BLACKSMITH_4V if mode == "performance" else GITHUB_HOSTED
    hot_path = GITHUB_HOSTED if mode == "economic" else BLACKSMITH_4V
    control = CONTABO_CONTROL if mode == "default" else GITHUB_HOSTED

    return {
        "runs_on": {
            "control": control,
            "general_medium": general_medium,
            "workspace_unit": GITHUB_HOSTED,
            "windows_tools": WINDOWS_HOSTED,
            "js_hot": hot_path,
            "ui_hot": hot_path,
            "visual_hot": hot_path,
        },
        "decision": {
            "schema_version": 1,
            "mode": mode,
        },
    }


def main():
    contract = resolve_contract(normalize_mode(os.environ.get("OD_CI_RUNNER_MODE")))
    output_path = os.environ.get("GITHUB_OUTPUT")
    lines = [
        f"{key}={value if isinstance(value, str) else compact_json(value)}"
        for key, value in contract.items()
    ]

    if output_path:
        with Path(output_path).open("a", encoding="utf-8") as output:
            for line in lines:
                output.write(f"{line}\n")
    else:
        for line in lines:
            print(line)


if __name__ == "__main__":
    main()
