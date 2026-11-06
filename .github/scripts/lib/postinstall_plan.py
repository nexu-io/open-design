"""Resolve the canonical workspace state requested by a postinstall intent.

The Plan describes the delivered state. Invocation IDs, concurrency and cache
strategy stay outside it. Bump PLAN_SCHEMA_VERSION when the meaning of a
serialized Plan changes without changing its serialized target state.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from typing import Any


PLAN_SCHEMA_VERSION = 2
INSTALL_PROFILES = {
    "workspace",
    "source-web",
    "release-executor",
    "release-tools",
    "release-validation",
    "mac-runtime",
}

JsonLoader = Callable[[str], dict[str, Any]]


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def _targets(config: dict[str, Any]) -> list[str]:
    if config.get("schemaVersion") != PLAN_SCHEMA_VERSION:
        raise ValueError("postinstall workflow config has an unsupported schemaVersion")
    targets = config.get("targets")
    if not isinstance(targets, list) or not targets or any(not isinstance(item, str) or not item for item in targets):
        raise ValueError("postinstall workflow config requires non-empty string targets")
    if len(set(targets)) != len(targets):
        raise ValueError("postinstall workflow targets must be unique")
    return targets


def _dependency_map(load_json: JsonLoader, targets: list[str]) -> dict[str, list[str]]:
    names: dict[str, str] = {}
    manifests: dict[str, dict[str, Any]] = {}
    for target in targets:
        manifest = load_json(f"{target}/package.json")
        manifests[target] = manifest
        name = manifest.get("name")
        if isinstance(name, str) and name:
            names[name] = target

    result: dict[str, list[str]] = {}
    for target in targets:
        dependencies: list[str] = []
        for field in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
            values = manifests[target].get(field, {})
            if not isinstance(values, dict):
                continue
            for name, specifier in values.items():
                dependency = names.get(name)
                if dependency and isinstance(specifier, str) and specifier.startswith("workspace:"):
                    dependencies.append(dependency)
        result[target] = list(dict.fromkeys(dependencies))
    return result


def _closure(load_json: JsonLoader, requested: list[str], targets: list[str]) -> list[str]:
    unknown = [target for target in requested if target not in targets]
    if unknown:
        raise ValueError(f"postinstall intent references unknown targets: {unknown}")
    dependencies = _dependency_map(load_json, targets)
    selected: set[str] = set()

    def include(target: str) -> None:
        if target in selected:
            return
        selected.add(target)
        for dependency in dependencies[target]:
            include(dependency)

    for target in requested:
        include(target)
    return [target for target in targets if target in selected]


def resolve_plan(intent: str, load_json: JsonLoader) -> dict[str, Any]:
    """Return the cache and invocation independent target state for an intent."""
    workflow_config = load_json(".github/config/postinstall.json")
    if workflow_config.get("schemaVersion") != PLAN_SCHEMA_VERSION:
        raise ValueError("postinstall workflow config has an unsupported schemaVersion")
    intents = workflow_config.get("intents")
    if not isinstance(intents, dict) or intent not in intents:
        raise ValueError(f"unknown postinstall intent: {intent}")
    recipe = intents[intent]
    if not isinstance(recipe, dict) or set(recipe) != {"installProfile", "requestedTargets"}:
        raise ValueError(f"postinstall intent {intent} has an invalid recipe")
    install_profile = recipe["installProfile"]
    if install_profile not in INSTALL_PROFILES:
        raise ValueError(f"postinstall intent {intent} has an invalid install profile")

    targets = _targets(workflow_config)
    requested_value = recipe["requestedTargets"]
    requested = list(targets) if requested_value == "all" else requested_value
    if not isinstance(requested, list) or any(not isinstance(item, str) or not item for item in requested):
        raise ValueError(f"postinstall intent {intent} has invalid requestedTargets")
    requested = list(dict.fromkeys(requested))
    partial = install_profile != "workspace"
    return {
        "schemaVersion": PLAN_SCHEMA_VERSION,
        "installProfile": install_profile,
        "requestedTargets": requested,
        "resolvedTargets": _closure(load_json, requested, targets),
        "requirements": {
            "materializeDomToPptx": not partial,
            "probeNativeDependencies": not partial,
        },
    }


def plan_digest(plan: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(plan).encode("utf-8")).hexdigest()
