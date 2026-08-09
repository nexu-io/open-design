#!/usr/bin/env python3

import json
import os
from pathlib import Path


GITHUB_HOSTED = ["ubuntu-24.04"]
WINDOWS_HOSTED = ["windows-latest"]
BLACKSMITH_4VCPU = ["blacksmith-4vcpu-ubuntu-2404"]
BLACKSMITH_8VCPU = ["blacksmith-8vcpu-ubuntu-2404"]
NEXU_SMALL = ["nexu-runners-small"]
NEXU_MEDIUM = ["nexu-runners-medium"]
NEXU_LARGE = ["nexu-runners-large"]
NEXU_XLARGE = ["nexu-runners-xlarge"]


def compact_json(value):
    return json.dumps(value, separators=(",", ":"))


def normalize_mode(raw_mode):
    mode = raw_mode or "default"
    if mode in {"default", "performance", "economic", "blacksmith"}:
        return mode
    return "default"


def resolve_contract(mode):
    if mode == "economic":
        control = GITHUB_HOSTED
        workload = GITHUB_HOSTED
        browser_workload = GITHUB_HOSTED
        ui_p0_workload = GITHUB_HOSTED
        ui_p0_heavy_workload = GITHUB_HOSTED
    elif mode == "blacksmith":
        control = BLACKSMITH_4VCPU
        workload = BLACKSMITH_4VCPU
        browser_workload = BLACKSMITH_8VCPU
        # Blacksmith has no xlarge tier; keep both UI P0 classes on 8vcpu.
        ui_p0_workload = BLACKSMITH_8VCPU
        ui_p0_heavy_workload = BLACKSMITH_8VCPU
    else:
        control = NEXU_SMALL
        workload = NEXU_MEDIUM
        browser_workload = NEXU_LARGE
        # Measured UI P0 shards fit medium (mem well under 14Gi lim). Keep a
        # dedicated heavy class for multi-client collab, which has hit large/xlarge
        # memory ceilings and is not covered by the medium right-size evidence.
        ui_p0_workload = NEXU_MEDIUM
        ui_p0_heavy_workload = NEXU_XLARGE

    return {
        "runs_on": {
            "control": control,
            "general_medium": workload,
            "workspace_unit": workload,
            "windows_tools": WINDOWS_HOSTED,
            "js_hot": workload,
            "ui_hot": browser_workload,
            "ui_p0": ui_p0_workload,
            "ui_p0_heavy": ui_p0_heavy_workload,
            "visual_hot": browser_workload,
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
