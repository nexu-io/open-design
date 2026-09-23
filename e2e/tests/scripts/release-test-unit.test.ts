import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("release test unit", () => {
  test("preserves suite commands and validates declared selectors without shell execution", () => {
    const result = spawnSync("python3", ["-c", `
import importlib.util, os, sys
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("release_test_unit", Path(sys.argv[1]))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
module.run = lambda *args: calls.append(args)

with patch.dict(os.environ, {"TEST_SHARED": "true", "WORKSPACE_SOURCES": "[]", "RUNNER_TEMP": "/tmp/release-test"}):
    module.prepare("web")
assert calls[0][:6] == ("pnpm", "exec", "tools-pack", "workspace", "import", "javascript")
assert calls[1] == ("pnpm", "--filter", "@open-design/web", "build:sidecar")
calls.clear()
with patch.dict(os.environ, {"TEST_SHARED": "false"}):
    module.prepare("verify")
assert calls[0] == ("pnpm", "--filter", "@open-design/daemon^...", "--filter", "@open-design/desktop^...", "--workspace-concurrency=4", "--if-present", "run", "build")
assert calls[1:] == [("pnpm", "--filter", "@open-design/daemon", "build"),
                     ("pnpm", "--filter", "@open-design/desktop", "build")]
calls.clear()
module.execute("web", "2", "")
module.execute("daemon", "4", "")
module.execute("ui", "", "project-runtime")
assert calls[0][-1] == "--shard=2/2"
assert calls[1][-1] == "--shard=4/4"
assert calls[2][-2:] == ("run-ui-group", "project-runtime")
for env in ({"TEST_KIND": "web", "TEST_SHARD": "3"},
            {"TEST_KIND": "daemon", "TEST_SHARD": "1", "TEST_GROUP": "extra"},
            {"TEST_KIND": "ui"}):
    with patch.dict(os.environ, env, clear=True):
        try: module.context()
        except ValueError: pass
        else: raise AssertionError("accepted invalid row: " + repr(env))
`, resolve(root, ".github/scripts/release/test_unit.py")], { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  });
});
