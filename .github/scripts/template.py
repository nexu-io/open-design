#!/usr/bin/env python3
"""Render strict text templates owned by GitHub automation."""

from __future__ import annotations

import re
import sys
from pathlib import Path


TEMPLATES_ROOT = Path(__file__).resolve().parents[1] / "templates"
ALLOWED_SUFFIXES = {".md", ".txt"}
PLACEHOLDER = re.compile(r"{{\s*([a-z][a-z0-9_]*)\s*}}")


class TemplateError(ValueError):
    pass


def resolve_template(path_value: str) -> Path:
    relative = Path(path_value)
    if relative.is_absolute():
        raise TemplateError("template path must be relative to .github/templates")
    path = (TEMPLATES_ROOT / relative).resolve()
    try:
        path.relative_to(TEMPLATES_ROOT.resolve())
    except ValueError as error:
        raise TemplateError("template path must stay within .github/templates") from error
    if path.suffix not in ALLOWED_SUFFIXES:
        raise TemplateError("template must use a .md or .txt extension")
    if not path.is_file():
        raise TemplateError(f"template does not exist: {path_value}")
    return path


def template_parameters(source: str) -> set[str]:
    parameters = set(PLACEHOLDER.findall(source))
    remainder = PLACEHOLDER.sub("", source)
    if "{{" in remainder or "}}" in remainder:
        raise TemplateError("template contains an invalid placeholder")
    return parameters


def render_template(path_value: str, params: dict[str, str]) -> str:
    source = resolve_template(path_value).read_text(encoding="utf-8")
    expected = template_parameters(source)
    missing = sorted(expected - params.keys())
    unknown = sorted(params.keys() - expected)
    if missing:
        raise TemplateError(f"missing template parameters: {', '.join(missing)}")
    if unknown:
        raise TemplateError(f"unknown template parameters: {', '.join(unknown)}")
    return PLACEHOLDER.sub(lambda match: params[match.group(1)], source)


def parse_args(argv: list[str]) -> tuple[str, dict[str, str], Path | None]:
    if not argv or argv[0] in {"-h", "--help"}:
        print(
            "usage: template.py <path> [--params-<name> <value>]... [--output <path>]",
            file=sys.stdout,
        )
        raise SystemExit(0)

    path_value = argv[0]
    params: dict[str, str] = {}
    output: Path | None = None
    index = 1
    while index < len(argv):
        argument = argv[index]
        if "=" in argument:
            option, value = argument.split("=", 1)
            consumed = 1
        else:
            option = argument
            if index + 1 >= len(argv):
                raise TemplateError(f"missing value for {option}")
            value = argv[index + 1]
            consumed = 2

        if option == "--output":
            if output is not None:
                raise TemplateError("--output may only be provided once")
            output = Path(value)
        elif option.startswith("--params-"):
            name = option.removeprefix("--params-").replace("-", "_")
            if not re.fullmatch(r"[a-z][a-z0-9_]*", name):
                raise TemplateError(f"invalid template parameter option: {option}")
            if name in params:
                raise TemplateError(f"duplicate template parameter: {name}")
            params[name] = value
        else:
            raise TemplateError(f"unknown option: {option}")
        index += consumed
    return path_value, params, output


def main(argv: list[str] | None = None) -> int:
    try:
        path_value, params, output = parse_args(sys.argv[1:] if argv is None else argv)
        rendered = render_template(path_value, params)
        if output is None:
            sys.stdout.write(rendered)
        else:
            output.write_text(rendered, encoding="utf-8")
        return 0
    except TemplateError as error:
        print(f"template error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
