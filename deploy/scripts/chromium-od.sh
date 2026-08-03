#!/bin/sh
# Chromium launcher for the opt-in browser image (deploy/Dockerfile, --target browser).
#
# Two things bite in this image, and both fail silently with a bare SIGTRAP and
# no useful log line. Neither is specific to a hardened host: they reproduce on
# a plain `docker run` of the stock image.
#
# 1. HOME is not writable. The runtime user is created with `adduser -H`, so
#    /home/open-design is never created, yet HOME still points at it. Chromium
#    derives its crashpad --database path from HOME, gets nothing, and dies
#    before logging anything except:
#        chrome_crashpad_handler: --database is required
#    deploy/docker-compose.yml also sets `read_only: true`, so even if the
#    directory existed it would not be writable. /tmp is a tmpfs there, which
#    is why HOME is redirected into it here.
#
# 2. CHROMIUM_FLAGS does nothing. Alpine's /usr/bin/chromium-browser wrapper
#    sources /etc/chromium/*.conf before anything else, which overwrites that
#    variable. The user-supplied equivalent is CHROMIUM_USER_FLAGS. We exec the
#    real binary directly and sidestep the wrapper entirely.
#
# --no-sandbox is required because deploy/docker-compose.yml sets
# `no-new-privileges:true`, which blocks Chromium's SUID sandbox.
#
# --user-data-dir is deliberately NOT set: Playwright supplies its own, and
# forcing one here collides with it.
set -eu

# Scratch paths are per-uid on purpose. A fixed /tmp/chrome-home is owned by
# whichever uid touches it first, and every later uid then fails to write it,
# which reproduces failure 1 above in a way that is even harder to read.
_od_uid="$(id -u)"
_od_tmp="${TMPDIR:-/tmp}/od-chromium-${_od_uid}"

export HOME="${OD_CHROMIUM_HOME:-${_od_tmp}/home}"
mkdir -p "$HOME" "${_od_tmp}/crashes" 2>/dev/null || true

exec /usr/lib/chromium/chrome \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --crash-dumps-dir="${_od_tmp}/crashes" \
  "$@"
