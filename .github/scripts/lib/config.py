import json
from pathlib import Path


class ConfigError(ValueError):
    pass


def repository_root(script_file: str) -> Path:
    return Path(script_file).resolve().parents[2]


def load_json(path: Path):
    try:
        with path.open(encoding="utf-8") as source:
            return json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigError(f"cannot load {path}: {error}") from error


def object_value(value, label: str):
    if not isinstance(value, dict):
        raise ConfigError(f"{label} must be an object")
    return value


def array_value(value, label: str):
    if not isinstance(value, list):
        raise ConfigError(f"{label} must be an array")
    return value


def string_value(value, label: str):
    if not isinstance(value, str) or not value:
        raise ConfigError(f"{label} must be a non-empty string")
    return value


def exact_keys(value: dict, expected: set[str], label: str):
    actual = set(value)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ConfigError(f"{label} keys differ (missing={missing}, extra={extra})")


def schema_v1(value: dict, label: str):
    schema = object_value(value.get("schema"), f"{label}.schema")
    exact_keys(schema, {"version"}, f"{label}.schema")
    if schema["version"] != 1:
        raise ConfigError(f"{label}.schema.version must be 1")


def compact_json(value) -> str:
    return json.dumps(value, separators=(",", ":"), sort_keys=True)
