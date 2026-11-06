#!/bin/bash
# Optional developer fallback; ordinary use goes through motion_open_preview.
set -euo pipefail
motion_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
motion_installed="$(node "$motion_root/scripts/resolve-installed.mjs" "$motion_root")"
motion_ffmpeg="${FFMPEG_PATH:-}"
if [ -z "$motion_ffmpeg" ] && [ -x "$motion_root/.tools/ffmpeg" ]; then motion_ffmpeg="$motion_root/.tools/ffmpeg"; fi
if [ -z "$motion_ffmpeg" ]; then motion_ffmpeg="$(command -v ffmpeg || true)"; fi
FFMPEG_PATH="$motion_ffmpeg" node --experimental-strip-types "$motion_installed/preview.ts"
