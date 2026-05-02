#!/bin/sh
set -eu

mkdir -p /app/.agent-home /app/.od /app/.tmp
chown -R node:node /app/.agent-home /app/.od /app/.tmp

export HOME="${HOME:-/app/.agent-home}"

exec gosu node "$@"
