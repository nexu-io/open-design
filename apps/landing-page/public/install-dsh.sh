#!/usr/bin/env sh
set -eu

NODE_VERSION='24.19.0'
DSH_VERSION='0.1.1-rc.2'
PNPM_VERSION='11.7.0'
# Freeze npm's view of the registry to just after DSH_VERSION was published.
#
# Every @deepseek-ai/dsh-* package declares its ~190 siblings with a caret
# range (^0.1.0-rc.N). npm reads a caret whose floor carries a prerelease tag
# as "this prerelease or any newer version", so pinning the top-level package
# alone lets the entire tree float onto whichever release candidate is newest.
# The generations are mutually exclusive — an rc.8 package peer-requires
# rc.8 siblings — so a mixed tree sends npm into an ERESOLVE backtrack across
# a combinatorial search space that never converges: the install appears to
# hang while scrolling warnings forever.
#
# The cutoff must stay LATER than DSH_VERSION's publish time and EARLIER than
# the next release candidate's. Update both values together.
DSH_RESOLUTION_CUTOFF='2026-08-21T13:00:00Z'

NO_LAUNCH=0

usage() {
  cat <<'EOF'
Install the DeepSeek Harness toolchain supported by OpenDesign.

Usage:
  install-dsh.sh [--no-launch]

Options:
  --no-launch  Install and verify dsh without starting its Web UI.
  -h, --help   Show this help.
EOF
}

fail() {
  printf 'DeepSeek Harness installer: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-launch) NO_LAUNCH=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "unknown option: $1" ;;
  esac
  shift
done

[ -n "${HOME:-}" ] || fail 'HOME is not set.'

INSTALL_ROOT=${OD_DSH_INSTALL_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/open-design/toolchains/dsh}
BIN_DIR=${OD_DSH_INSTALL_BIN_DIR:-$HOME/.local/bin}
LAUNCHER=$BIN_DIR/dsh
DIST_BASE=${OD_DSH_INSTALL_DIST_BASE:-https://nodejs.org/dist/v$NODE_VERSION}
NODE_TARGET_BASE=$INSTALL_ROOT/node-v$NODE_VERSION
RUNTIME_TARGET=$INSTALL_ROOT/runtime-dsh-$DSH_VERSION

command_output() {
  "$@" 2>/dev/null | head -n 1 | tr -d '\r'
}

node_is_supported() {
  version=${1#v}
  major=${version%%.*}
  remainder=${version#*.}
  minor=${remainder%%.*}
  case "$major:$minor" in
    22:*) [ "$minor" -ge 19 ] 2>/dev/null ;;
    2[4-9]:*|[3-9][0-9]:*) return 0 ;;
    *) return 1 ;;
  esac
}

same_command() {
  [ "${1:-}" = "${2:-}" ]
}

write_managed_launcher() {
  node_bin_dir=$1
  runtime_bin_dir=$2
  mkdir -p "$BIN_DIR"
  launcher_tmp=$BIN_DIR/.dsh.tmp.$$
  {
    printf '%s\n' '#!/usr/bin/env sh' 'set -eu'
    printf "NODE_BIN_DIR='%s'\n" "$(printf '%s' "$node_bin_dir" | sed "s/'/'\\\\''/g")"
    printf "RUNTIME_BIN_DIR='%s'\n" "$(printf '%s' "$runtime_bin_dir" | sed "s/'/'\\\\''/g")"
    printf '%s\n' 'PATH="$RUNTIME_BIN_DIR:$NODE_BIN_DIR:${PATH:-}"' 'export PATH' 'exec "$RUNTIME_BIN_DIR/dsh" "$@"'
  } > "$launcher_tmp"
  chmod 755 "$launcher_tmp"
  mv "$launcher_tmp" "$LAUNCHER"
}

write_existing_launcher() {
  node_path=$1
  dsh_path=$2
  pnpm_path=$3
  node_bin_dir=$(dirname "$node_path")
  dsh_bin_dir=$(dirname "$dsh_path")
  pnpm_bin_dir=$(dirname "$pnpm_path")
  mkdir -p "$BIN_DIR"
  launcher_tmp=$BIN_DIR/.dsh.tmp.$$
  {
    printf '%s\n' '#!/usr/bin/env sh' 'set -eu'
    printf "NODE_BIN_DIR='%s'\n" "$(printf '%s' "$node_bin_dir" | sed "s/'/'\\\\''/g")"
    printf "DSH_BIN_DIR='%s'\n" "$(printf '%s' "$dsh_bin_dir" | sed "s/'/'\\\\''/g")"
    printf "PNPM_BIN_DIR='%s'\n" "$(printf '%s' "$pnpm_bin_dir" | sed "s/'/'\\\\''/g")"
    printf "DSH_BIN='%s'\n" "$(printf '%s' "$dsh_path" | sed "s/'/'\\\\''/g")"
    printf '%s\n' 'PATH="$PNPM_BIN_DIR:$NODE_BIN_DIR:$DSH_BIN_DIR:${PATH:-}"' 'export PATH' 'exec "$DSH_BIN" "$@"'
  } > "$launcher_tmp"
  chmod 755 "$launcher_tmp"
  mv "$launcher_tmp" "$LAUNCHER"
}

finish() {
  label=$1
  info "DeepSeek Harness $DSH_VERSION is ready ($label)."
  info "Command: $LAUNCHER"
  info 'OpenDesign can discover this command without editing your shell profile.'
  if [ "$NO_LAUNCH" -eq 1 ]; then
    return 0
  fi
  info 'Starting dsh web. Configure your API key in Settings → Models; press Ctrl+C to stop.'
  exec "$LAUNCHER" web
}

managed_node_dir=''
if [ -n "${OD_DSH_INSTALL_PLATFORM:-}" ]; then
  platform=$OD_DSH_INSTALL_PLATFORM
else
  os=$(uname -s 2>/dev/null || true)
  arch=$(uname -m 2>/dev/null || true)
  case "$os" in
    Darwin) os=darwin ;;
    Linux)
      os=linux
      [ ! -f /etc/alpine-release ] || fail 'Alpine Linux is not supported by the official Node.js archive. Install Node.js 24 and run npx @deepseek-ai/dsh@0.1.0-rc.6 web.'
      ;;
    *) fail "unsupported operating system: $os" ;;
  esac
  case "$arch" in
    x86_64|amd64) arch=x64 ;;
    arm64|aarch64) arch=arm64 ;;
    *) fail "unsupported CPU architecture: $arch" ;;
  esac
  platform=$os-$arch
fi

case "$platform" in
  darwin-x64|darwin-arm64|linux-x64|linux-arm64) ;;
  *) fail "unsupported platform: $platform" ;;
esac

managed_node_dir=$NODE_TARGET_BASE-$platform
managed_runtime_bin=$RUNTIME_TARGET/node_modules/.bin

if [ -x "$LAUNCHER" ] && [ -x "$managed_node_dir/bin/node" ] && [ -x "$managed_runtime_bin/dsh" ] && [ -x "$managed_runtime_bin/pnpm" ]; then
  installed_dsh=$(command_output "$LAUNCHER" --version || true)
  installed_node=$(command_output "$managed_node_dir/bin/node" --version || true)
  installed_pnpm=$(command_output "$managed_node_dir/bin/node" -e 'console.log(require(process.argv[1]).version)' "$RUNTIME_TARGET/node_modules/pnpm/package.json" || true)
  if [ "$installed_dsh" = "$DSH_VERSION" ] && node_is_supported "$installed_node" && [ "$installed_pnpm" = "$PNPM_VERSION" ]; then
    info "DeepSeek Harness $DSH_VERSION is already installed."
    finish 'managed toolchain'
    exit 0
  fi
fi

existing_node=$(command -v node 2>/dev/null || true)
existing_dsh=$(command -v dsh 2>/dev/null || true)
existing_pnpm=$(command -v pnpm 2>/dev/null || true)
if [ -n "$existing_node" ] && [ -n "$existing_dsh" ] && [ -n "$existing_pnpm" ] && ! same_command "$existing_dsh" "$LAUNCHER"; then
  existing_node_version=$(command_output "$existing_node" --version || true)
  existing_dsh_version=$(command_output "$existing_dsh" --version || true)
  existing_pnpm_version=$(command_output "$existing_pnpm" --version || true)
  if node_is_supported "$existing_node_version" && [ "$existing_dsh_version" = "$DSH_VERSION" ] && [ "$existing_pnpm_version" = "$PNPM_VERSION" ]; then
    write_existing_launcher "$existing_node" "$existing_dsh" "$existing_pnpm"
    finish 'existing Node, dsh, and pnpm'
    exit 0
  fi
fi

for required in tar awk mktemp; do
  command -v "$required" >/dev/null 2>&1 || fail "$required is required but was not found."
done
if command -v curl >/dev/null 2>&1; then
  download() { curl -fL --retry 3 --connect-timeout 20 --output "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -O "$2" "$1"; }
else
  fail 'curl or wget is required to download Node.js.'
fi

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/od-dsh-install.XXXXXX")
cleanup() { rm -rf "$tmp_dir"; }
trap cleanup EXIT HUP INT TERM

archive_name=node-v$NODE_VERSION-$platform.tar.gz
archive=$tmp_dir/$archive_name
checksums=$tmp_dir/SHASUMS256.txt
managed_node_version=$(command_output "$managed_node_dir/bin/node" --version || true)
if [ -x "$managed_node_dir/bin/npm" ] && node_is_supported "$managed_node_version"; then
  info "Using the verified managed Node.js $managed_node_version already on this machine."
else
  info "Downloading official Node.js v$NODE_VERSION for $platform..."
  download "$DIST_BASE/SHASUMS256.txt" "$checksums"
  download "$DIST_BASE/$archive_name" "$archive"

  expected=$(awk -v name="$archive_name" '$2 == name { print $1; exit }' "$checksums")
  [ -n "$expected" ] || fail "checksum entry missing for $archive_name."
  if command -v sha256sum >/dev/null 2>&1; then
    actual=$(sha256sum "$archive" | awk '{ print $1 }')
  elif command -v shasum >/dev/null 2>&1; then
    actual=$(shasum -a 256 "$archive" | awk '{ print $1 }')
  else
    fail 'sha256sum or shasum is required to verify the Node.js download.'
  fi
  [ "$actual" = "$expected" ] || fail "checksum verification failed for $archive_name."
  info 'Node.js checksum verified.'

  tar -xzf "$archive" -C "$tmp_dir"
  extracted=$tmp_dir/node-v$NODE_VERSION-$platform
  [ -x "$extracted/bin/node" ] || fail 'the Node.js archive did not contain the expected executable.'
  [ -x "$extracted/bin/npm" ] || fail 'the Node.js archive did not contain npm.'

  mkdir -p "$INSTALL_ROOT"
  if [ -e "$managed_node_dir" ]; then
    mv "$managed_node_dir" "$managed_node_dir.incomplete.$$"
  fi
  mv "$extracted" "$managed_node_dir"
fi

runtime_staging=$INSTALL_ROOT/.runtime-dsh-$DSH_VERSION.$$
mkdir -p "$runtime_staging"
info "Installing dsh $DSH_VERSION and pnpm $PNPM_VERSION in OpenDesign's user toolchain..."
PATH="$managed_node_dir/bin:${PATH:-}" "$managed_node_dir/bin/npm" install \
  --prefix "$runtime_staging" \
  --no-save \
  --no-package-lock \
  --omit=dev \
  --before "$DSH_RESOLUTION_CUTOFF" \
  "@deepseek-ai/dsh@$DSH_VERSION" \
  "pnpm@$PNPM_VERSION"

staging_bin=$runtime_staging/node_modules/.bin
[ -x "$staging_bin/dsh" ] || fail 'npm completed without creating the dsh executable.'
[ -x "$staging_bin/pnpm" ] || fail 'npm completed without creating the pnpm executable.'
verified_dsh=$(PATH="$managed_node_dir/bin:$staging_bin:${PATH:-}" command_output "$staging_bin/dsh" --version || true)
verified_pnpm=$(command_output "$managed_node_dir/bin/node" -e 'console.log(require(process.argv[1]).version)' "$runtime_staging/node_modules/pnpm/package.json" || true)
[ "$verified_dsh" = "$DSH_VERSION" ] || fail "installed dsh reported '$verified_dsh', expected '$DSH_VERSION'."
[ "$verified_pnpm" = "$PNPM_VERSION" ] || fail "installed pnpm reported '$verified_pnpm', expected '$PNPM_VERSION'."

if [ -e "$RUNTIME_TARGET" ]; then
  mv "$RUNTIME_TARGET" "$RUNTIME_TARGET.previous.$$"
fi
mv "$runtime_staging" "$RUNTIME_TARGET"
write_managed_launcher "$managed_node_dir/bin" "$managed_runtime_bin"

finish 'managed Node.js toolchain'
