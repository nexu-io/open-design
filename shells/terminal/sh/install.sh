#!/bin/sh
set -eu

fail() { printf '%s\n' "terminal install: $*" >&2; exit 1; }
sha256_file() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else fail "sha256 utility unavailable"; fi
}

source_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
install_root=
channel=
namespace=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --source) [ "$#" -ge 2 ] || fail "--source requires a value"; source_root=$2; shift 2;;
    --root) [ "$#" -ge 2 ] || fail "--root requires a value"; install_root=$2; shift 2;;
    --channel) [ "$#" -ge 2 ] || fail "--channel requires a value"; channel=$2; shift 2;;
    --namespace) [ "$#" -ge 2 ] || fail "--namespace requires a value"; namespace=$2; shift 2;;
    *) fail "unknown argument: $1";;
  esac
done
[ -n "$install_root" ] || fail "--root is required"
[ -n "$channel" ] || fail "--channel is required"
[ -n "$namespace" ] || fail "--namespace is required"
source_root=$(CDPATH='' cd -- "$source_root" && pwd)
[ -f "$source_root/install-manifest.json" ] || fail "source manifest missing"
expected=$(sed -n '1{s/[[:space:]].*$//;p;}' "$source_root/install-manifest.sha256")
[ "$(sha256_file "$source_root/install-manifest.json")" = "$expected" ] || fail "source manifest digest mismatch"

parent=$(dirname -- "$install_root")
mkdir -p "$parent"
stage="$parent/.terminal-install-$$"
trap 'rm -rf "$stage"' EXIT HUP INT TERM
mkdir "$stage"
(cd "$source_root" && tar -cf - .) | (cd "$stage" && tar -xf -)
"$stage/sh/terminal.sh" --root "$stage" --channel "$channel" --namespace "$namespace" --operation probe >/dev/null
if [ -e "$install_root" ]; then
  previous="$parent/.terminal-previous-$$"
  mv "$install_root" "$previous"
  if ! mv "$stage" "$install_root"; then mv "$previous" "$install_root"; fail "atomic install failed"; fi
  rm -rf "$previous"
else
  mv "$stage" "$install_root"
fi
trap - EXIT HUP INT TERM
"$install_root/sh/terminal.sh" --root "$install_root" --channel "$channel" --namespace "$namespace" --operation probe
