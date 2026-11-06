#!/bin/sh
set -eu
motion_root="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$motion_root"
exec "$motion_root/runtime/node/bin/node" --experimental-strip-types --import "$motion_root/bootstrap.mjs" "$motion_root/mcp.ts"
