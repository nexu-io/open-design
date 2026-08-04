#!/bin/sh
#
# Open Design native server bootstrap for macOS and Linux.
# Release placement, smoke checks, and current-pointer updates are owned by the
# bundled installer/install-core.mjs. This script only selects Node, verifies
# archives, extracts the payload into a temporary directory, and hands off.

set -eu

LC_ALL=C
export LC_ALL
unset TAR_OPTIONS

NODE_VERSION="24.14.1"
NODE_DIST_BASE_URL="https://nodejs.org/dist/v${NODE_VERSION}"
DEFAULT_RELEASE_BASE_URL="https://releases.open-design.ai/server"

_OD_TMP=""

log() {
  printf '%s\n' "open-design: $*"
}

die() {
  printf '%s\n' "open-design: error: $*" >&2
  exit 1
}

cleanup() {
  if [ -n "$_OD_TMP" ] && [ -d "$_OD_TMP" ]; then
    rm -rf "$_OD_TMP"
  fi
}

trap cleanup 0
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

http_get() {
  _od_http_url=$1
  _od_http_output=$2
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 15 --max-time 1200 \
      -o "$_od_http_output" "$_od_http_url"
    return
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -q -O "$_od_http_output" "$_od_http_url"
    return
  fi
  die "curl or wget is required to download release files"
}

sha256_file() {
  _od_sha_file=$1
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$_od_sha_file" | awk '{print $1}'
    return
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$_od_sha_file" | awk '{print $1}'
    return
  fi
  if command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$_od_sha_file" | awk '{print $NF}'
    return
  fi
  die "shasum, sha256sum, or openssl is required to verify downloads"
}

normalize_sha256() {
  _od_normalized_sha=$(printf '%s' "$1" | tr 'A-F' 'a-f')
  case "$_od_normalized_sha" in
    ''|*[!0-9a-f]*)
      die "invalid SHA-256 value"
      ;;
  esac
  if [ "${#_od_normalized_sha}" -ne 64 ]; then
    die "invalid SHA-256 value (expected 64 hexadecimal characters)"
  fi
  printf '%s' "$_od_normalized_sha"
}

verify_sha256() {
  _od_verify_file=$1
  _od_verify_expected=$(normalize_sha256 "$2")
  _od_verify_actual=$(normalize_sha256 "$(sha256_file "$_od_verify_file")")
  if [ "$_od_verify_actual" != "$_od_verify_expected" ]; then
    die "SHA-256 mismatch for $(basename "$_od_verify_file") (expected $_od_verify_expected, got $_od_verify_actual)"
  fi
  printf '%s' "$_od_verify_actual"
}

named_checksum() {
  _od_sums_file=$1
  _od_sums_name=$2
  awk -v expected="$_od_sums_name" '
    {
      name = $2
      sub(/^\*/, "", name)
      sub(/\r$/, "", name)
      if (name == expected) {
        count += 1
        value = $1
      }
    }
    END {
      if (count != 1) exit 1
      print value
    }
  ' "$_od_sums_file"
}

read_single_value() {
  _od_value_file=$1
  awk '
    {
      sub(/\r$/, "")
      if (length($0) > 0) {
        count += 1
        value = $0
      }
    }
    END {
      if (count != 1) exit 1
      print value
    }
  ' "$_od_value_file"
}

normalize_version() {
  _od_normalized_version=$1
  case "$_od_normalized_version" in
    v*) _od_normalized_version=${_od_normalized_version#v} ;;
  esac
  case "$_od_normalized_version" in
    ''|*[!A-Za-z0-9._+-]*)
      die "invalid release version: $1"
      ;;
  esac
  case "$_od_normalized_version" in
    [A-Za-z0-9]*) ;;
    *) die "invalid release version: $1" ;;
  esac
  case "$_od_normalized_version" in
    *..*) die "invalid release version: $1" ;;
  esac
  printf '%s' "$_od_normalized_version"
}

is_truthy() {
  _od_truth_value=$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')
  case "$_od_truth_value" in
    1|true|yes|on) return 0 ;;
    ''|0|false|no|off) return 1 ;;
    *) die "OPEN_DESIGN_FORCE_PRIVATE_NODE must be 1/0, true/false, yes/no, or on/off" ;;
  esac
}

node_is_compatible() {
  _od_node_candidate=$1
  [ -x "$_od_node_candidate" ] || return 1
  _od_node_identity=$(
    "$_od_node_candidate" -p \
      'process.versions.node.split(".")[0] + " " + process.platform + "-" + process.arch' \
      2>/dev/null
  ) || return 1
  [ "$_od_node_identity" = "24 $PLATFORM-$ARCH" ]
}

node_version_is_pinned() {
  _od_node_candidate=$1
  [ -x "$_od_node_candidate" ] || return 1
  _od_node_identity=$(
    "$_od_node_candidate" -p \
      'process.versions.node + " " + process.platform + "-" + process.arch' \
      2>/dev/null
  ) || return 1
  [ "$_od_node_identity" = "$NODE_VERSION $PLATFORM-$ARCH" ]
}

validate_tar_archive() {
  _od_tar_archive=$1
  _od_tar_top=$2
  _od_tar_reject_links=$3
  _od_tar_counter=${_od_tar_counter:-0}
  _od_tar_counter=$((_od_tar_counter + 1))
  _od_tar_list="$_OD_TMP/tar-list-$_od_tar_counter.txt"
  _od_tar_verbose="$_OD_TMP/tar-verbose-$_od_tar_counter.txt"

  if ! tar -tzf "$_od_tar_archive" >"$_od_tar_list"; then
    die "cannot list archive: $(basename "$_od_tar_archive")"
  fi
  if [ ! -s "$_od_tar_list" ]; then
    die "archive is empty: $(basename "$_od_tar_archive")"
  fi

  _od_tar_seen=0
  while IFS= read -r _od_tar_member || [ -n "$_od_tar_member" ]; do
    case "$_od_tar_member" in
      "$_od_tar_top"|"$_od_tar_top/"|"$_od_tar_top/"*)
        _od_tar_seen=1
        ;;
      *)
        die "archive contains a path outside $_od_tar_top: $_od_tar_member"
        ;;
    esac
    case "$_od_tar_member" in
      /*|*\\*|..|../*|*/..|*/../*|.|./*|*/.|*/./*|*//*)
        die "archive contains an unsafe path: $_od_tar_member"
        ;;
    esac
  done <"$_od_tar_list"
  if [ "$_od_tar_seen" -ne 1 ]; then
    die "archive does not contain $_od_tar_top"
  fi

  if [ "$_od_tar_reject_links" = "1" ]; then
    if ! tar -tvzf "$_od_tar_archive" >"$_od_tar_verbose"; then
      die "cannot inspect archive entry types: $(basename "$_od_tar_archive")"
    fi
    while IFS= read -r _od_tar_line || [ -n "$_od_tar_line" ]; do
      _od_tar_type=$(printf '%.1s' "$_od_tar_line")
      case "$_od_tar_type" in
        -|d) ;;
        *)
          die "application archive contains a link or special filesystem entry"
          ;;
      esac
    done <"$_od_tar_verbose"
  fi
}

official_node_sha256() {
  # Pinned from https://nodejs.org/dist/v24.14.1/SHASUMS256.txt.
  case "$PLATFORM-$ARCH" in
    darwin-arm64)
      printf '%s' "25495ff85bd89e2d8a24d88566d7e2f827c6b0d3d872b2cebf75371f93fcb1fe"
      ;;
    darwin-x64)
      printf '%s' "2526230ad7d922be82d4fdb1e7ee1e84303e133e3b4b0ec4c2897ab31de0253d"
      ;;
    linux-arm64)
      printf '%s' "734ff04fa7f8ed2e8a78d40cacf5ac3fc4515dac2858757cbab313eb483ba8a2"
      ;;
    linux-x64)
      printf '%s' "ace9fa104992ed0829642629c46ca7bd7fd6e76278cb96c958c4b387d29658ea"
      ;;
    *)
      die "no private Node build is pinned for $PLATFORM-$ARCH"
      ;;
  esac
}

private_node_runtime_is_valid() {
  _od_runtime_root=$1
  _od_runtime_sha=$2
  _od_runtime_marker="$_od_runtime_root/.archive-sha256"
  _od_runtime_node="$_od_runtime_root/bin/node"
  [ -f "$_od_runtime_marker" ] || return 1
  _od_runtime_recorded=$(tr -d '\r\n' <"$_od_runtime_marker")
  [ "$_od_runtime_recorded" = "$_od_runtime_sha" ] || return 1
  node_version_is_pinned "$_od_runtime_node"
}

select_private_node() {
  NODE_ARCHIVE_NAME="node-v${NODE_VERSION}-${PLATFORM}-${ARCH}.tar.gz"
  NODE_ARCHIVE_TOP="node-v${NODE_VERSION}-${PLATFORM}-${ARCH}"
  NODE_OFFICIAL_SHA=$(official_node_sha256)
  NODE_EXPECTED_SHA=$NODE_OFFICIAL_SHA

  if [ -n "${OPEN_DESIGN_NODE_ARCHIVE_SHA256:-}" ]; then
    NODE_EXPECTED_SHA=$(normalize_sha256 "$OPEN_DESIGN_NODE_ARCHIVE_SHA256")
  fi

  NODE_RUNTIME="$INSTALL_ROOT/runtime/node-v${NODE_VERSION}-${PLATFORM}-${ARCH}"
  if private_node_runtime_is_valid "$NODE_RUNTIME" "$NODE_EXPECTED_SHA"; then
    SELECTED_NODE="$NODE_RUNTIME/bin/node"
    log "using installed private Node v$NODE_VERSION"
    return
  fi
  if [ -e "$NODE_RUNTIME" ]; then
    die "private Node runtime exists but is incomplete or has different bytes: $NODE_RUNTIME"
  fi

  NODE_ARCHIVE_FILE="$_OD_TMP/$NODE_ARCHIVE_NAME"
  if [ -n "${OPEN_DESIGN_NODE_ARCHIVE:-}" ]; then
    [ -f "$OPEN_DESIGN_NODE_ARCHIVE" ] ||
      die "OPEN_DESIGN_NODE_ARCHIVE is not a file: $OPEN_DESIGN_NODE_ARCHIVE"
    [ -n "${OPEN_DESIGN_NODE_ARCHIVE_SHA256:-}" ] ||
      die "OPEN_DESIGN_NODE_ARCHIVE_SHA256 is required with OPEN_DESIGN_NODE_ARCHIVE"
    cp "$OPEN_DESIGN_NODE_ARCHIVE" "$NODE_ARCHIVE_FILE"
    log "using local private Node archive"
  else
    log "downloading private Node v$NODE_VERSION for $PLATFORM-$ARCH"
    http_get "$NODE_DIST_BASE_URL/$NODE_ARCHIVE_NAME" "$NODE_ARCHIVE_FILE"
  fi

  verify_sha256 "$NODE_ARCHIVE_FILE" "$NODE_EXPECTED_SHA" >/dev/null
  NODE_REJECT_LINKS=1
  if [ "$NODE_EXPECTED_SHA" = "$NODE_OFFICIAL_SHA" ]; then
    # Official Node tarballs contain internal npm/corepack symlinks. Their
    # exact bytes are trusted only when they match the embedded official hash.
    NODE_REJECT_LINKS=0
  fi
  validate_tar_archive "$NODE_ARCHIVE_FILE" "$NODE_ARCHIVE_TOP" "$NODE_REJECT_LINKS"

  NODE_EXTRACT_ROOT="$_OD_TMP/node-extract"
  mkdir -p "$NODE_EXTRACT_ROOT"
  tar -xzf "$NODE_ARCHIVE_FILE" -C "$NODE_EXTRACT_ROOT"
  NODE_SOURCE="$NODE_EXTRACT_ROOT/$NODE_ARCHIVE_TOP"
  [ -d "$NODE_SOURCE" ] || die "private Node archive is missing $NODE_ARCHIVE_TOP"
  node_version_is_pinned "$NODE_SOURCE/bin/node" ||
    die "private Node archive did not contain Node v$NODE_VERSION"

  # The embedded JavaScript template expressions are evaluated by Node.
  # shellcheck disable=SC2016
  _od_publish_private_node='
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const [source, destination, expectedSha, expectedVersion] = process.argv.slice(1);
const parent = path.dirname(destination);
const stage = path.join(
  parent,
  `.${path.basename(destination)}.staging-${process.pid}-${crypto.randomUUID()}`,
);
const nodePath = (root) => path.join(
  root,
  process.platform === "win32" ? "node.exe" : "bin/node",
);
const isValid = (root) => {
  try {
    if (
      fs.readFileSync(path.join(root, ".archive-sha256"), "utf8").trim() !==
      expectedSha
    ) return false;
    const probe = childProcess.spawnSync(
      nodePath(root),
      ["-p", "process.versions.node"],
      { encoding: "utf8", windowsHide: true },
    );
    return probe.status === 0 && probe.stdout.trim() === expectedVersion;
  } catch {
    return false;
  }
};
fs.mkdirSync(parent, { recursive: true });
try {
  fs.cpSync(source, stage, { recursive: true, verbatimSymlinks: true });
  if (process.platform !== "win32") fs.chmodSync(nodePath(stage), 0o755);
  fs.writeFileSync(
    path.join(stage, ".archive-sha256"),
    `${expectedSha}\n`,
    { encoding: "ascii", mode: 0o644 },
  );
  if (!isValid(stage)) throw new Error("staged private Node runtime failed validation");
  try {
    fs.renameSync(stage, destination);
  } catch (error) {
    if (!isValid(destination)) throw error;
  }
} finally {
  fs.rmSync(stage, { force: true, maxRetries: 3, recursive: true, retryDelay: 100 });
}
'
  if ! "$NODE_SOURCE/bin/node" -e "$_od_publish_private_node" \
    "$NODE_SOURCE" "$NODE_RUNTIME" "$NODE_EXPECTED_SHA" "$NODE_VERSION"; then
    die "could not atomically publish the private Node runtime: $NODE_RUNTIME"
  fi
  private_node_runtime_is_valid "$NODE_RUNTIME" "$NODE_EXPECTED_SHA" ||
    die "installed private Node runtime failed validation"

  SELECTED_NODE="$NODE_RUNTIME/bin/node"
  log "installed private Node v$NODE_VERSION under the Open Design install root"
}

case "$(uname -s 2>/dev/null || true)" in
  Darwin) PLATFORM="darwin" ;;
  Linux) PLATFORM="linux" ;;
  *) die "this installer supports macOS and Linux; use install.ps1 on Windows" ;;
esac

case "$(uname -m 2>/dev/null || true)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64) ARCH="x64" ;;
  *) die "unsupported architecture: $(uname -m 2>/dev/null || printf unknown)" ;;
esac

[ -n "${HOME:-}" ] || die "HOME is not set"
INSTALL_ROOT=${OPEN_DESIGN_HOME:-"$HOME/.open-design"}
BIN_DIR=${OPEN_DESIGN_BIN_DIR:-"$HOME/.local/bin"}
RELEASE_BASE_URL=${OPEN_DESIGN_RELEASE_BASE_URL:-"$DEFAULT_RELEASE_BASE_URL"}
RELEASE_BASE_URL=${RELEASE_BASE_URL%/}
[ -n "$RELEASE_BASE_URL" ] || die "OPEN_DESIGN_RELEASE_BASE_URL cannot be empty"

_OD_TMP=$(mktemp -d 2>/dev/null || mktemp -d -t open-design-server-install)
[ -d "$_OD_TMP" ] || die "could not create a temporary directory"

VERSION=${OPEN_DESIGN_VERSION:-latest}
if [ -n "${OPEN_DESIGN_ARCHIVE:-}" ] && [ "$VERSION" = "latest" ]; then
  _od_local_name=$(basename "$OPEN_DESIGN_ARCHIVE")
  _od_local_suffix="-$PLATFORM-$ARCH.tar.gz"
  case "$_od_local_name" in
    open-design-server-*"$_od_local_suffix")
      VERSION=${_od_local_name#open-design-server-}
      VERSION=${VERSION%"$_od_local_suffix"}
      ;;
    *)
      die "cannot infer a version from local archive name: $_od_local_name"
      ;;
  esac
elif [ "$VERSION" = "latest" ]; then
  log "resolving the latest server version"
  http_get "$RELEASE_BASE_URL/latest/VERSION" "$_OD_TMP/VERSION"
  VERSION=$(read_single_value "$_OD_TMP/VERSION") ||
    die "latest/VERSION must contain exactly one non-empty line"
fi
VERSION=$(normalize_version "$VERSION")

TOP_NAME="open-design-server-$VERSION-$PLATFORM-$ARCH"
ARCHIVE_NAME="$TOP_NAME.tar.gz"
ARCHIVE_FILE="$_OD_TMP/$ARCHIVE_NAME"

if [ -n "${OPEN_DESIGN_ARCHIVE:-}" ]; then
  [ -f "$OPEN_DESIGN_ARCHIVE" ] ||
    die "OPEN_DESIGN_ARCHIVE is not a file: $OPEN_DESIGN_ARCHIVE"
  [ -n "${OPEN_DESIGN_ARCHIVE_SHA256:-}" ] ||
    die "OPEN_DESIGN_ARCHIVE_SHA256 is required with OPEN_DESIGN_ARCHIVE"
  cp "$OPEN_DESIGN_ARCHIVE" "$ARCHIVE_FILE"
  EXPECTED_ARCHIVE_SHA=$(normalize_sha256 "$OPEN_DESIGN_ARCHIVE_SHA256")
  log "using local server archive $OPEN_DESIGN_ARCHIVE"
else
  if [ -n "${OPEN_DESIGN_ARCHIVE_SHA256:-}" ]; then
    EXPECTED_ARCHIVE_SHA=$(normalize_sha256 "$OPEN_DESIGN_ARCHIVE_SHA256")
  else
    log "downloading checksum metadata for Open Design $VERSION"
    http_get "$RELEASE_BASE_URL/v$VERSION/SHA256SUMS" "$_OD_TMP/SHA256SUMS"
    EXPECTED_ARCHIVE_SHA=$(
      named_checksum "$_OD_TMP/SHA256SUMS" "$ARCHIVE_NAME"
    ) || die "SHA256SUMS does not contain exactly one entry for $ARCHIVE_NAME"
    EXPECTED_ARCHIVE_SHA=$(normalize_sha256 "$EXPECTED_ARCHIVE_SHA")
  fi
  log "downloading Open Design $VERSION for $PLATFORM-$ARCH"
  http_get "$RELEASE_BASE_URL/v$VERSION/$ARCHIVE_NAME" "$ARCHIVE_FILE"
fi

ARCHIVE_SHA=$(verify_sha256 "$ARCHIVE_FILE" "$EXPECTED_ARCHIVE_SHA")
log "server archive SHA-256 verified"

SELECTED_NODE=""
if ! is_truthy "${OPEN_DESIGN_FORCE_PRIVATE_NODE:-0}"; then
  SYSTEM_NODE=$(command -v node 2>/dev/null || true)
  if [ -n "$SYSTEM_NODE" ] && node_is_compatible "$SYSTEM_NODE"; then
    SELECTED_NODE=$SYSTEM_NODE
    log "using compatible system Node ($("$SELECTED_NODE" --version))"
  fi
fi
if [ -z "$SELECTED_NODE" ]; then
  select_private_node
fi

validate_tar_archive "$ARCHIVE_FILE" "$TOP_NAME" "1"
PAYLOAD_EXTRACT_ROOT="$_OD_TMP/payload"
mkdir -p "$PAYLOAD_EXTRACT_ROOT"
tar -xzf "$ARCHIVE_FILE" -C "$PAYLOAD_EXTRACT_ROOT"
PAYLOAD_ROOT="$PAYLOAD_EXTRACT_ROOT/$TOP_NAME"
INSTALL_CORE="$PAYLOAD_ROOT/installer/install-core.mjs"

[ -d "$PAYLOAD_ROOT" ] || die "archive is missing payload root $TOP_NAME"
[ ! -L "$PAYLOAD_ROOT" ] || die "payload root cannot be a symbolic link"
[ -f "$INSTALL_CORE" ] || die "archive is missing installer/install-core.mjs"
[ ! -L "$INSTALL_CORE" ] || die "installer/install-core.mjs cannot be a symbolic link"

log "installing Open Design $VERSION"
"$SELECTED_NODE" "$INSTALL_CORE" install \
  --payload-root "$PAYLOAD_ROOT" \
  --install-root "$INSTALL_ROOT" \
  --bin-dir "$BIN_DIR" \
  --archive-sha256 "$ARCHIVE_SHA" \
  --node-bin "$SELECTED_NODE"

case ":${PATH:-}:" in
  *":$BIN_DIR:"*)
    log "installed; run open-design daemon start --serve-web"
    ;;
  *)
    log "installed launcher directory is not on PATH: $BIN_DIR"
    printf '  export PATH="%s:%s"\n' "$BIN_DIR" "\$PATH"
    log "then run open-design daemon start --serve-web"
    ;;
esac
