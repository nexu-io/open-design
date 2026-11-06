#!/usr/bin/env python3

import os
import sys
from pathlib import Path
from typing import Optional

from lib.config import (
    ConfigError,
    array_value,
    compact_json,
    exact_keys,
    load_json,
    object_value,
    repository_root,
    schema_v1,
    string_value,
)
from lib.github import append_outputs


EXPECTED_CLASSES = {
    "control",
    "general_medium",
    "workspace_unit",
    "windows_tools",
    "js_hot",
    "ui_hot",
    "ui_p0",
    "ui_p0_heavy",
    "visual_hot",
}


def load_contract(path: Path):
    config = object_value(load_json(path), "runners")
    exact_keys(
        config,
        {"schema", "defaultMode", "aliases", "profiles", "modes"},
        "runners",
    )
    schema_v1(config, "runners")
    default_mode = string_value(config["defaultMode"], "runners.defaultMode")
    aliases = object_value(config["aliases"], "runners.aliases")
    profiles = object_value(config["profiles"], "runners.profiles")
    modes = object_value(config["modes"], "runners.modes")

    normalized_profiles = {}
    for name, labels in profiles.items():
        string_value(name, "runners.profiles key")
        labels = array_value(labels, f"runners.profiles.{name}")
        if not labels:
            raise ConfigError(f"runners.profiles.{name} must not be empty")
        normalized_profiles[name] = [
            string_value(label, f"runners.profiles.{name}[]") for label in labels
        ]

    normalized_modes = {}
    for name, assignments in modes.items():
        string_value(name, "runners.modes key")
        assignments = object_value(assignments, f"runners.modes.{name}")
        exact_keys(assignments, EXPECTED_CLASSES, f"runners.modes.{name}")
        normalized_modes[name] = {}
        for runner_class, profile in assignments.items():
            profile = string_value(profile, f"runners.modes.{name}.{runner_class}")
            if profile not in normalized_profiles:
                raise ConfigError(
                    f"runners.modes.{name}.{runner_class} references unknown profile {profile}"
                )
            normalized_modes[name][runner_class] = normalized_profiles[profile]

    if default_mode not in normalized_modes:
        raise ConfigError(f"runners.defaultMode references unknown mode {default_mode}")
    for alias, target in aliases.items():
        string_value(alias, "runners.aliases key")
        target = string_value(target, f"runners.aliases.{alias}")
        if target not in normalized_modes:
            raise ConfigError(f"runners.aliases.{alias} references unknown mode {target}")

    return default_mode, aliases, normalized_modes


def resolve(path: Path, requested_mode: Optional[str]):
    default_mode, aliases, modes = load_contract(path)
    selected = requested_mode or default_mode
    selected = aliases.get(selected, selected)
    if selected not in modes:
        raise ConfigError(f"unknown runner mode: {selected}")
    return {
        "runs_on": modes[selected],
        "decision": {"schema_version": 1, "mode": selected},
    }


def main() -> int:
    root = repository_root(__file__)
    config_path = root / ".github/config/runners.json"
    try:
        contract = resolve(config_path, os.environ.get("OD_CI_RUNNER_MODE"))
    except ConfigError as error:
        print(f"runner configuration error: {error}", file=sys.stderr)
        return 2
    append_outputs({key: compact_json(value) for key, value in contract.items()})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
