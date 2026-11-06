#!/bin/bash
set -euo pipefail
motion_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
"$motion_root/runtime/node/bin/node" "$motion_root/scripts/configure-plugin.mjs"
codex plugin marketplace add "$motion_root"
codex plugin add motion@openmotion-test
codex plugin list --marketplace openmotion-test
