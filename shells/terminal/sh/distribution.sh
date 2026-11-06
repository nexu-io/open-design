#!/bin/sh
set -eu

fail() { printf '%s\n' "terminal distribution: $*" >&2; exit 1; }
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

request_file='' receipt=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    --request) request_file=$2; shift 2;; --receipt) receipt=$2; shift 2;; *) fail "unknown argument: $1";;
  esac
done
[ -n "$request_file" ] && [ -f "$request_file" ] && [ -n "$receipt" ] || fail "--request and --receipt are required"
command -v plutil >/dev/null 2>&1 || fail "macOS plutil is required to read Terminal contracts"
extract_request() { plutil -extract "$1" raw "$request_file" 2>/dev/null || fail "invalid distribution request field: $1"; }
[ "$(extract_request schemaVersion)" = "1" ] || fail "unsupported distribution request schema"
[ "$(extract_request operation)" = "terminal.distribution.build" ] || fail "invalid distribution request operation"
target=$(extract_request target)
scene=$(extract_request sceneDirectory)
scene_sha=$(extract_request sceneManifestSha256)
documents=$(extract_request releaseDocumentsDirectory)
trust=$(extract_request trustFile)
release_channel=$(extract_request release.channel)
release_version=$(extract_request release.releaseVersion)
release_commit=$(extract_request release.sourceCommit)
release_published_at=$(extract_request release.publishedAt)
release_artifact_base_url=$(extract_request release.artifactBaseUrl)
output=$(extract_request outputDirectory)
case "$target" in darwin-arm64|darwin-x64) :;; *) fail "sh distribution only supports Darwin targets";; esac
case "$release_channel" in ""|local|*[!a-z0-9]*) fail "invalid exact release channel";; esac
[ "${#release_channel}" -le 12 ] || fail "invalid exact release channel"
printf '%s\n' "$release_version" | grep -Eq "^[0-9]+\.[0-9]+\.[0-9]+-${release_channel}\.[0-9]+$" || fail "release version does not belong to channel"
printf '%s\n' "$scene_sha" | grep -Eq '^[a-f0-9]{64}$' || fail "invalid scene manifest digest"
printf '%s\n' "$release_commit" | grep -Eq '^[a-f0-9]{40}$' || fail "invalid release source commit"
for value in "$scene" "$documents" "$trust" "$release_published_at" "$release_artifact_base_url" "$output" "$receipt"; do json_escape "$value" >/dev/null; done
[ "$(sha256_file "$scene/scene.json")" = "$scene_sha" ] || fail "scene manifest digest mismatch"
[ -f "$documents/content-metadata.json" ] || fail "release document missing: content-metadata.json"
[ -f "$trust" ] || fail "trust document missing"
extract_metadata() { plutil -extract "$1" raw "$documents/content-metadata.json" 2>/dev/null || fail "invalid content metadata field: $1"; }
[ "$(extract_metadata metadata.channel)" = "$release_channel" ] || fail "content metadata channel differs from release request"
[ "$(extract_metadata metadata.releaseVersion)" = "$release_version" ] || fail "content metadata version differs from release request"
[ "$(extract_metadata metadata.sourceCommit)" = "$release_commit" ] || fail "content metadata commit differs from release request"
[ "$(extract_metadata metadata.publishedAt)" = "$release_published_at" ] || fail "content metadata publication time differs from release request"
case "$release_artifact_base_url" in http://*|https://*) :;; *) fail "release artifact base URL must use HTTP(S)";; esac

mkdir -p "$output" "$(dirname -- "$receipt")"
stage=$(mktemp -d "${TMPDIR:-/tmp}/nexu-terminal-distribution.XXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
root="$stage/nexu-terminal"
mkdir "$root"
(cd "$scene" && tar -cf - .) | (cd "$root" && tar -xf -)
mkdir -p "$root/release" "$root/trust"
cp "$documents/content-metadata.json" "$root/release/content-metadata.json"
cp "$trust" "$root/trust/keys.json"

first=true
printf '{"files":[' > "$root/contract/index.json"
for contract in "$root"/contract/*.schema.json; do
  [ -f "$contract" ] || fail "contract bundle is empty"
  if [ "$first" = true ]; then first=false; else printf ',' >> "$root/contract/index.json"; fi
  printf '{"file":"contract/%s","sha256":"%s"}' "$(basename -- "$contract")" "$(sha256_file "$contract")" >> "$root/contract/index.json"
done
printf '],"schemaVersion":1}\n' >> "$root/contract/index.json"

shell_version=$(sed -n 's/^shell_version=//p' "$root/carrier.lock")
shell_build_hash=$(plutil -extract shellBuildHash raw "$root/scene.json")
node_version=$(sed -n 's/^node_version=//p' "$root/carrier.lock")
node_executable=$(sed -n 's/^node_executable=//p' "$root/carrier.lock")
node_sha=$(sed -n 's/^node_sha256=//p' "$root/carrier.lock")
fossil_sha=$(sha256_file "$root/runtime/fossil.mjs")
sidecar_host_sha=$(sha256_file "$root/runtime/sidecar-host.mjs")
sidecar_bootstrap_sha=$(sha256_file "$root/runtime/sidecar-bootstrap.mjs")
runtime_modules_sha=$(sha256_file "$root/runtime/modules.json")
fixture_lifecycle_sha=$(sha256_file "$root/runtime/fixture-lifecycle.mjs")
fixture_shell_updater_sha=$(sha256_file "$root/runtime/fixture-shell-updater.mjs")
standalone_sha=$(sha256_file "$root/runtime/standalone/index.mjs")
closure_sha=$(sha256_file "$root/seed/closure.mjs")
content_sha=$(sha256_file "$root/release/content-metadata.json")
trust_sha=$(sha256_file "$root/trust/keys.json")
carrier_lock_sha=$(sha256_file "$root/carrier.lock")
contract_index_sha=$(sha256_file "$root/contract/index.json")
sh_terminal_sha=$(sha256_file "$root/sh/terminal.sh")
sh_install_sha=$(sha256_file "$root/sh/install.sh")
ps_terminal_sha=$(sha256_file "$root/ps1/terminal.ps1")
ps_install_sha=$(sha256_file "$root/ps1/install.ps1")
printf '{"capabilities":{"contentUpdater":"standalone-v4","sharedInstance":"sidecar-v1","shellUpdater":"sidecar-v1"},"carrierLock":{"file":"carrier.lock","sha256":"%s"},"contracts":{"file":"contract/index.json","sha256":"%s"},"fixtureLifecycle":{"entrypoint":"runtime/fixture-lifecycle.mjs","sha256":"%s"},"fixtureShellUpdater":{"entrypoint":"runtime/fixture-shell-updater.mjs","sha256":"%s"},"fossil":{"entrypoint":"runtime/fossil.mjs","sha256":"%s"},"releaseDocuments":{"content":{"file":"release/content-metadata.json","sha256":"%s"}},"runtime":{"executable":"%s","name":"node","sha256":"%s","version":"%s"},"runtimeModules":{"file":"runtime/modules.json","sha256":"%s"},"schemaVersion":1,"seed":{"closure":{"file":"seed/closure.mjs","sha256":"%s"},"standaloneLauncher":{"file":"runtime/standalone/index.mjs","sha256":"%s"}},"shell":{"buildHash":"%s","type":"terminal","version":"%s"},"shellFiles":{"ps1":{"install":{"file":"ps1/install.ps1","sha256":"%s"},"terminal":{"file":"ps1/terminal.ps1","sha256":"%s"}},"sh":{"install":{"file":"sh/install.sh","sha256":"%s"},"terminal":{"file":"sh/terminal.sh","sha256":"%s"}}},"sidecarBootstrap":{"entrypoint":"runtime/sidecar-bootstrap.mjs","sha256":"%s"},"sidecarHost":{"entrypoint":"runtime/sidecar-host.mjs","sha256":"%s"},"standalone":{"entrypoint":"runtime/standalone/index.mjs","sha256":"%s"},"target":"%s","trust":{"file":"trust/keys.json","sha256":"%s"}}\n' \
  "$carrier_lock_sha" "$contract_index_sha" "$fixture_lifecycle_sha" "$fixture_shell_updater_sha" "$fossil_sha" "$content_sha" "$node_executable" "$node_sha" "$node_version" "$runtime_modules_sha" "$closure_sha" "$standalone_sha" "$shell_build_hash" "$shell_version" "$ps_install_sha" "$ps_terminal_sha" "$sh_install_sha" "$sh_terminal_sha" "$sidecar_bootstrap_sha" "$sidecar_host_sha" "$standalone_sha" "$target" "$trust_sha" > "$root/install-manifest.json"
manifest_sha=$(sha256_file "$root/install-manifest.json")
printf '%s  install-manifest.json\n' "$manifest_sha" > "$root/install-manifest.sha256"
archive="$output/nexu-terminal-$target-$release_version.tar.gz"
COPYFILE_DISABLE=1 tar -czf "$archive" -C "$stage" nexu-terminal
archive_sha=$(sha256_file "$archive")
printf '{"archive":{"file":"%s","mediaType":"application/gzip","sha256":"%s","size":%s},"manifestSha256":"%s","operation":"terminal.distribution.build","schemaVersion":1,"target":"%s"}\n' \
  "$(json_escape "$archive")" "$archive_sha" "$(file_size "$archive")" "$manifest_sha" "$target" > "$receipt"
