"""Actions-cache descriptors for tool preparation, independent of Plan results."""

import hashlib
import json
import os
from pathlib import Path
import subprocess


def describe(root: Path) -> dict:
    # Postinstall owns the dependency graph; do not duplicate its closure rules.
    targets = json.loads(subprocess.check_output(
        ["node", "scripts/postinstall.mjs", "describe"], cwd=root, text=True,
    ))
    if not targets or any(not target.startswith(("tools/", "packages/")) for target in targets):
        raise ValueError("tool cache requires an explicit tools/packages build closure")
    controls = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json",
                "scripts/postinstall.mjs",
                ".github/scripts/postinstall.py", ".github/config/postinstall.json", ".github/scripts/workspace.py",
                ".github/actions/setup-workspace/action.yml", "packages/metatool"]
    tracked = subprocess.check_output(
        ["git", "ls-files", "-z", "--", *controls, *targets], cwd=root,
    ).decode().split("\0")
    digest = hashlib.sha256()
    digest.update(json.dumps({"schema": 1, "targets": targets}, sort_keys=True).encode())
    for name in sorted(filter(None, tracked)):
        if "/tests/" in name or "/dist/" in name or "/node_modules/" in name:
            continue
        digest.update(name.encode() + b"\0")
        digest.update((root / name).read_bytes())
        digest.update(b"\0")
    manifests = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "scripts/postinstall.mjs",
                 ".github/scripts/postinstall.py",
                 ".github/config/postinstall.json", ".github/scripts/workspace.py",
                 ".github/actions/setup-workspace/action.yml"]
    manifests += sorted(path.relative_to(root).as_posix() for pattern in (
        "apps/*/package.json", "packages/*/package.json", "tools/*/package.json",
        "shells/*/package.json", "e2e/package.json",
    ) for path in root.glob(pattern))
    dependencies = hashlib.sha256()
    # pnpm command shims and native installers may capture absolute paths.
    # Do not claim relocation across workspace layouts or runner images.
    dependencies.update(json.dumps({"schema": 1, "root": str(root.resolve()),
                                   "image": os.environ.get("ImageOS", "")}, sort_keys=True).encode())
    for name in manifests:
        dependencies.update(name.encode() + b"\0" + (root / name).read_bytes() + b"\0")
    return {"key": digest.hexdigest(), "paths": [f"{target}/dist" for target in targets],
            "dependencies-key": dependencies.hexdigest()}


if __name__ == "__main__":
    result = describe(Path.cwd())
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"key={result['key']}\npaths<<WORKSPACE_PATHS\n")
        output.write("\n".join(result["paths"]) + "\nWORKSPACE_PATHS\n")
        output.write(f"dependencies-key={result['dependencies-key']}\n")
