#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/install-unsafe-dmg.sh [--force] [--name <file.dmg>] <dmg-url>

Internal helper for installing non-notarized macOS DMGs during beta-s validation.
It downloads with curl, mounts the DMG, copies the single app bundle to
/Applications, and removes quarantine/provenance xattrs from the installed app.

Options:
  --force          Overwrite an existing ~/Downloads DMG and /Applications app.
  --name <file>    DMG filename to use under ~/Downloads. Required when the URL
                   path does not end in a parseable .dmg filename.
  -h, --help       Show this help.
EOF
}

fail() {
  echo "install-unsafe-dmg: $*" >&2
  exit 1
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  fail "this script only runs on macOS"
fi

force=0
dmg_name=""
url=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      force=1
      shift
      ;;
    --name)
      [[ $# -ge 2 ]] || fail "--name requires a value"
      dmg_name="$2"
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    --*)
      fail "unknown option: $1"
      ;;
    *)
      [[ -z "$url" ]] || fail "expected exactly one DMG URL"
      url="$1"
      shift
      ;;
  esac
done

[[ -n "$url" ]] || {
  usage >&2
  exit 1
}

if [[ -z "$dmg_name" ]]; then
  dmg_name="$(
    URL="$url" node --input-type=module <<'NODE'
const raw = process.env.URL ?? "";
try {
  const parsed = new URL(raw);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const last = parts.at(-1);
  process.stdout.write(last == null ? "" : decodeURIComponent(last));
} catch {
  process.stdout.write("");
}
NODE
  )"
fi

[[ -n "$dmg_name" ]] || fail "could not infer DMG filename from URL; pass --name <file.dmg>"
[[ "$dmg_name" != */* ]] || fail "--name must be a filename, not a path: $dmg_name"
[[ "$dmg_name" == *.dmg ]] || fail "DMG filename must end with .dmg: $dmg_name"

downloads_dir="$HOME/Downloads"
download_path="$downloads_dir/$dmg_name"
partial_path="$download_path.partial.$$"
mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/open-design-unsafe-dmg.XXXXXX")"
mounted=0

cleanup() {
  local status=$?
  if [[ "$mounted" -eq 1 ]]; then
    hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || hdiutil detach "$mount_dir" -force -quiet >/dev/null 2>&1 || true
  fi
  rm -f "$partial_path"
  rmdir "$mount_dir" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT

mkdir -p "$downloads_dir"

if [[ -e "$download_path" && "$force" -ne 1 ]]; then
  fail "download target already exists: $download_path (pass --force to overwrite)"
fi

echo "Downloading DMG:"
echo "  url:  $url"
echo "  path: $download_path"
curl -fL --output "$partial_path" "$url"
mv -f "$partial_path" "$download_path"

echo "Mounting DMG:"
echo "  path:  $download_path"
echo "  mount: $mount_dir"
hdiutil attach "$download_path" -mountpoint "$mount_dir" -nobrowse -quiet
mounted=1

mapfile -t apps < <(find "$mount_dir" -maxdepth 1 -type d -name "*.app" -print | sort)
if [[ "${#apps[@]}" -eq 0 ]]; then
  fail "no .app bundle found at DMG root"
fi
if [[ "${#apps[@]}" -gt 1 ]]; then
  printf 'install-unsafe-dmg: multiple .app bundles found at DMG root:\n' >&2
  printf '  %s\n' "${apps[@]}" >&2
  fail "refusing to guess which app to install"
fi

source_app="${apps[0]}"
app_name="$(basename "$source_app")"
target_app="/Applications/$app_name"

if [[ -e "$target_app" && "$force" -ne 1 ]]; then
  fail "target app already exists: $target_app (pass --force to overwrite)"
fi

if [[ -e "$target_app" ]]; then
  echo "Removing existing app:"
  echo "  path: $target_app"
  rm -rf "$target_app"
fi

echo "Installing app:"
echo "  from: $source_app"
echo "  to:   $target_app"
ditto "$source_app" "$target_app"

echo "Removing unsafe-install xattrs:"
echo "  path: $target_app"
xattr -dr com.apple.quarantine "$target_app" 2>/dev/null || true
xattr -dr com.apple.provenance "$target_app" 2>/dev/null || true
xattr -dr com.apple.macl "$target_app" 2>/dev/null || true

echo "Installed unsafe DMG app:"
echo "  app: $target_app"
