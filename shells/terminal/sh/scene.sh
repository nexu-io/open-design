#!/bin/sh
set -eu

fail() { printf '%s\n' "terminal scene: $*" >&2; exit 1; }
sha256_file() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
  else fail "sha256 utility unavailable"; fi
}
file_size() { wc -c < "$1" | tr -d ' '; }
json_escape() {
  [ "$(printf '%s' "$1" | LC_ALL=C tr -d '[:cntrl:]')" = "$1" ] || fail "JSON value contains control characters"
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

request_file=''
receipt_file=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --request) request_file=$2; shift 2;; --receipt) receipt_file=$2; shift 2;; *) fail "unknown argument: $1";;
  esac
done
[ -n "$request_file" ] && [ -f "$request_file" ] && [ -n "$receipt_file" ] || fail "--request and --receipt are required"
command -v plutil >/dev/null 2>&1 || fail "macOS plutil is required to read Terminal contracts"
extract_request() { plutil -extract "$1" raw "$request_file" 2>/dev/null || fail "invalid scene request field: $1"; }
[ "$(extract_request schemaVersion)" = "1" ] || fail "unsupported scene request schema"
[ "$(extract_request operation)" = "terminal.scene.build" ] || fail "invalid scene request operation"
target=$(extract_request target)
shell_version=$(extract_request shellVersion)
node_version=$(extract_request node.version)
node_archive=$(extract_request node.archiveFile)
node_archive_sha256=$(extract_request node.archiveSha256)
closure_file=$(extract_request closureArtifactFile)
standalone_directory=$(extract_request standaloneDirectory)
sidecar_directory=$(extract_request sidecarDirectory)
platform_directory=$(extract_request platformDirectory)
scene_directory=$(extract_request sceneDirectory)
case "$target" in darwin-arm64|darwin-x64) :;; *) fail "sh scene only supports Darwin targets";; esac
printf '%s\n' "$shell_version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "invalid Shell version"
printf '%s\n' "$node_archive_sha256" | grep -Eq '^[a-f0-9]{64}$' || fail "invalid Node archive digest"
for path in "$node_archive" "$closure_file" "$standalone_directory" "$sidecar_directory" "$platform_directory" "$scene_directory" "$receipt_file"; do json_escape "$path" >/dev/null; done
[ -f "$node_archive" ] && [ -f "$closure_file" ] && [ -f "$standalone_directory/index.mjs" ] \
  && [ -f "$sidecar_directory/index.mjs" ] && [ -f "$sidecar_directory/supervisor.mjs" ] \
  && [ -f "$platform_directory/index.mjs" ] || fail "scene input missing"
terminal_source=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
locked_version=$(plutil -extract version raw "$terminal_source/node-lock.json")
locked_archive=$(plutil -extract "targets.$target.archive" raw "$terminal_source/node-lock.json" 2>/dev/null) || fail "Node lock does not support $target"
locked_sha256=$(plutil -extract "targets.$target.sha256" raw "$terminal_source/node-lock.json")
[ "$node_version" = "$locked_version" ] || fail "official Node version differs from lock"
[ "$(basename -- "$node_archive")" = "$locked_archive" ] || fail "official Node archive name differs from lock"
[ "$node_archive_sha256" = "$locked_sha256" ] || fail "official Node archive digest differs from lock"
[ "$(sha256_file "$node_archive")" = "$node_archive_sha256" ] || fail "official Node archive digest mismatch"

parent=$(dirname -- "$scene_directory")
mkdir -p "$parent" "$(dirname -- "$receipt_file")"
stage="$parent/.terminal-scene-$$"
extract="$parent/.terminal-node-$$"
trap 'rm -rf "$stage" "$extract"' EXIT HUP INT TERM
mkdir "$stage" "$extract"
tar -xzf "$node_archive" -C "$extract"
node_root=
for candidate in "$extract"/*; do
  [ -d "$candidate" ] || continue
  [ -z "$node_root" ] || fail "official Node archive has multiple roots"
  node_root=$candidate
done
[ -n "$node_root" ] && [ -x "$node_root/bin/node" ] || fail "official Node executable missing"
[ "$("$node_root/bin/node" --version)" = "v$node_version" ] || fail "official Node version mismatch"

mkdir -p "$stage/carrier" "$stage/runtime/standalone" \
  "$stage/runtime/node_modules/@open-design/sidecar/dist" \
  "$stage/runtime/node_modules/@open-design/platform/dist" \
  "$stage/seed" "$stage/sh" "$stage/ps1" "$stage/contract"
mv "$node_root" "$stage/carrier/node"
cp "$standalone_directory/index.mjs" "$stage/runtime/standalone/index.mjs"
cp "$sidecar_directory/index.mjs" "$sidecar_directory/supervisor.mjs" "$stage/runtime/node_modules/@open-design/sidecar/dist/"
cp "$platform_directory/index.mjs" "$stage/runtime/node_modules/@open-design/platform/dist/index.mjs"
printf '%s\n' '{"name":"@open-design/sidecar","type":"module","exports":{".":"./dist/index.mjs"}}' > "$stage/runtime/node_modules/@open-design/sidecar/package.json"
printf '%s\n' '{"name":"@open-design/platform","type":"module","exports":{".":"./dist/index.mjs"}}' > "$stage/runtime/node_modules/@open-design/platform/package.json"
cp "$closure_file" "$stage/seed/closure.mjs"
cp "$terminal_source/runtime/fossil.mjs" "$terminal_source/runtime/sidecar-bootstrap.mjs" "$terminal_source/runtime/sidecar-host.mjs" "$terminal_source/runtime/fixture-lifecycle.mjs" "$terminal_source/runtime/fixture-shell-updater.mjs" "$stage/runtime/"
cp "$terminal_source/sh/terminal.sh" "$terminal_source/sh/install.sh" "$stage/sh/"
cp "$terminal_source/ps1/terminal.ps1" "$terminal_source/ps1/install.ps1" "$stage/ps1/"
cp "$terminal_source"/contract/*.json "$stage/contract/"
node_sha=$(sha256_file "$stage/carrier/node/bin/node")
fossil_sha=$(sha256_file "$stage/runtime/fossil.mjs")
sidecar_host_sha=$(sha256_file "$stage/runtime/sidecar-host.mjs")
sidecar_bootstrap_sha=$(sha256_file "$stage/runtime/sidecar-bootstrap.mjs")
fixture_lifecycle_sha=$(sha256_file "$stage/runtime/fixture-lifecycle.mjs")
fixture_shell_updater_sha=$(sha256_file "$stage/runtime/fixture-shell-updater.mjs")
standalone_sha=$(sha256_file "$stage/runtime/standalone/index.mjs")
closure_sha=$(sha256_file "$stage/seed/closure.mjs")
printf '{"files":[' > "$stage/runtime/modules.json"
first=true
for module_file in \
  runtime/node_modules/@open-design/platform/dist/index.mjs \
  runtime/node_modules/@open-design/platform/package.json \
  runtime/node_modules/@open-design/sidecar/dist/index.mjs \
  runtime/node_modules/@open-design/sidecar/dist/supervisor.mjs \
  runtime/node_modules/@open-design/sidecar/package.json; do
  if [ "$first" = true ]; then first=false; else printf ',' >> "$stage/runtime/modules.json"; fi
  printf '{"file":"%s","sha256":"%s"}' "$module_file" "$(sha256_file "$stage/$module_file")" >> "$stage/runtime/modules.json"
done
printf '],"schemaVersion":1}\n' >> "$stage/runtime/modules.json"
runtime_modules_sha=$(sha256_file "$stage/runtime/modules.json")
printf '%s\n' "schema=1" "target=$target" "shell_version=$shell_version" "node_version=$node_version" "node_executable=carrier/node/bin/node" "node_sha256=$node_sha" "fossil_entrypoint=runtime/fossil.mjs" > "$stage/carrier.lock"
shell_build_inputs="$stage/.shell-build-inputs"
printf '%s\n' \
  "carrier_lock=$(sha256_file "$stage/carrier.lock")" \
  "fixture_lifecycle=$fixture_lifecycle_sha" \
  "fixture_shell_updater=$fixture_shell_updater_sha" \
  "fossil=$fossil_sha" \
  "runtime_modules=$runtime_modules_sha" \
  "sidecar_host=$sidecar_host_sha" \
  "sidecar_bootstrap=$sidecar_bootstrap_sha" \
  "node_archive=$node_archive_sha256" \
  "node_executable=$node_sha" \
  "ps_install=$(sha256_file "$stage/ps1/install.ps1")" \
  "ps_terminal=$(sha256_file "$stage/ps1/terminal.ps1")" \
  "sh_install=$(sha256_file "$stage/sh/install.sh")" \
  "sh_terminal=$(sha256_file "$stage/sh/terminal.sh")" \
  "standalone=$standalone_sha" \
  "target=$target" > "$shell_build_inputs"
for contract in "$stage"/contract/*.json; do printf 'contract/%s=%s\n' "$(basename -- "$contract")" "$(sha256_file "$contract")" >> "$shell_build_inputs"; done
shell_build_hash=$(sha256_file "$shell_build_inputs")
rm "$shell_build_inputs"
printf '{"closure":{"file":"seed/closure.mjs","sha256":"%s","size":%s},"fixtureLifecycle":{"entrypoint":"runtime/fixture-lifecycle.mjs","sha256":"%s"},"fixtureShellUpdater":{"entrypoint":"runtime/fixture-shell-updater.mjs","sha256":"%s"},"fossil":{"entrypoint":"runtime/fossil.mjs","sha256":"%s"},"node":{"archiveSha256":"%s","executable":"carrier/node/bin/node","executableSha256":"%s","version":"%s"},"runtimeModules":{"file":"runtime/modules.json","sha256":"%s"},"schemaVersion":1,"shellBuildHash":"%s","shellVersion":"%s","sidecarBootstrap":{"entrypoint":"runtime/sidecar-bootstrap.mjs","sha256":"%s"},"sidecarHost":{"entrypoint":"runtime/sidecar-host.mjs","sha256":"%s"},"standalone":{"entrypoint":"runtime/standalone/index.mjs","sha256":"%s"},"target":"%s"}\n' \
  "$closure_sha" "$(file_size "$stage/seed/closure.mjs")" "$fixture_lifecycle_sha" "$fixture_shell_updater_sha" "$fossil_sha" "$node_archive_sha256" "$node_sha" "$node_version" "$runtime_modules_sha" "$shell_build_hash" "$shell_version" "$sidecar_bootstrap_sha" "$sidecar_host_sha" "$standalone_sha" "$target" > "$stage/scene.json"
scene_sha=$(sha256_file "$stage/scene.json")
if [ -e "$scene_directory" ]; then fail "scene destination already exists"; fi
mv "$stage" "$scene_directory"
trap 'rm -rf "$extract"' EXIT HUP INT TERM
printf '{"operation":"terminal.scene.build","products":[{"name":"scene.json","sha256":"%s","size":%s}],"sceneDirectory":"%s","sceneManifestSha256":"%s","schemaVersion":1,"target":"%s"}\n' \
  "$scene_sha" "$(file_size "$scene_directory/scene.json")" "$(json_escape "$scene_directory")" "$scene_sha" "$target" > "$receipt_file"
