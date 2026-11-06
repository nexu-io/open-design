#!/bin/sh
set -eu

feedback_file=

emit_shell_feedback() {
  [ -n "$feedback_file" ] || return 0
  mkdir -p "$(dirname -- "$feedback_file")"
  printf '{"phase":"%s","schemaVersion":1,"source":"shell","state":"%s"}\n' "$1" "$2" >> "$feedback_file"
}

fail() {
  emit_shell_feedback "shell-bootstrap" "failed"
  printf '%s\n' "terminal: $*" >&2
  exit 1
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    fail "sha256 utility unavailable"
  fi
}

lock_value() {
  key=$1
  value=$(sed -n "s/^${key}=//p" "$terminal_root/carrier.lock")
  [ -n "$value" ] || fail "carrier.lock lacks $key"
  case "$value" in *[!A-Za-z0-9._/-]*) fail "unsafe carrier.lock value for $key";; esac
  printf '%s\n' "$value"
}

json_escape() {
  [ "$(printf '%s' "$1" | LC_ALL=C tr -d '[:cntrl:]')" = "$1" ] || fail "JSON value contains control characters"
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

terminal_root=
channel=
namespace=
operation=start
attachment_id=
attachment_capability=
store_root=
channel_head_url=
activation_policy=
result_file=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --root) [ "$#" -ge 2 ] || fail "--root requires a value"; terminal_root=$2; shift 2;;
    --channel) [ "$#" -ge 2 ] || fail "--channel requires a value"; channel=$2; shift 2;;
    --namespace) [ "$#" -ge 2 ] || fail "--namespace requires a value"; namespace=$2; shift 2;;
    --operation) [ "$#" -ge 2 ] || fail "--operation requires a value"; operation=$2; shift 2;;
    --attachment-id) [ "$#" -ge 2 ] || fail "--attachment-id requires a value"; attachment_id=$2; shift 2;;
    --attachment-capability) [ "$#" -ge 2 ] || fail "--attachment-capability requires a value"; attachment_capability=$2; shift 2;;
    --store-root) [ "$#" -ge 2 ] || fail "--store-root requires a value"; store_root=$2; shift 2;;
    --channel-head-url) [ "$#" -ge 2 ] || fail "--channel-head-url requires a value"; channel_head_url=$2; shift 2;;
    --activation-policy) [ "$#" -ge 2 ] || fail "--activation-policy requires a value"; activation_policy=$2; shift 2;;
    --result) [ "$#" -ge 2 ] || fail "--result requires a value"; result_file=$2; shift 2;;
    --feedback) [ "$#" -ge 2 ] || fail "--feedback requires a value"; feedback_file=$2; shift 2;;
    *) fail "unknown argument: $1";;
  esac
done

[ -n "$terminal_root" ] || terminal_root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
terminal_root=$(CDPATH='' cd -- "$terminal_root" && pwd)
[ -f "$terminal_root/carrier.lock" ] || fail "carrier.lock not found"
[ -f "$terminal_root/install-manifest.json" ] || fail "install-manifest.json not found"
[ -f "$terminal_root/install-manifest.sha256" ] || fail "install-manifest.sha256 not found"

case "$channel" in ""|local|*[!a-z0-9]* ) fail "invalid exact channel";; esac
[ "${#channel}" -le 12 ] || fail "invalid exact channel"
case "$namespace" in ""|*[!A-Za-z0-9._-]*|[-._]*) fail "invalid namespace";; esac
[ "${#namespace}" -le 128 ] || fail "invalid namespace"
case "$operation" in probe|start|heartbeat|release|stop|status|prepare-update|apply-update|apply-update-force|shell-update-status|shell-update-check|shell-update-download|shell-update-install|shell-update-later|shell-update-force|shell-update-confirm|shell-update-abandon) :;; *) fail "invalid operation";; esac
case "$activation_policy" in ""|observe|authorize-silent|authorize-user|revoke-silent) :;; *) fail "invalid activation policy";; esac
if [ "$operation" = "prepare-update" ] && [ -z "$activation_policy" ]; then fail "prepare-update requires an explicit activation policy"; fi
if [ -n "$attachment_id" ]; then case "$attachment_id" in *[!A-Za-z0-9._-]*) fail "invalid attachment id";; esac; fi
if [ -n "$attachment_capability" ]; then case "$attachment_capability" in *[!a-f0-9]*) fail "invalid attachment capability";; esac; [ "${#attachment_capability}" -eq 64 ] || fail "invalid attachment capability"; fi

target=$(lock_value target)
shell_version=$(lock_value shell_version)
node_version=$(lock_value node_version)
node_executable=$(lock_value node_executable)
node_sha256=$(lock_value node_sha256)
fossil_entrypoint=$(lock_value fossil_entrypoint)
case "$target" in darwin-arm64|darwin-x64|win32-x64) :;; *) fail "unsupported carrier target";; esac
for version in "$shell_version" "$node_version"; do
  printf '%s\n' "$version" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || fail "invalid carrier version"
done
case "$node_executable" in carrier/node/*) :;; *) fail "Node executable escaped carrier root";; esac
case "/$node_executable/" in */../*) fail "Node executable escaped carrier root";; esac
[ "$fossil_entrypoint" = "runtime/fossil.mjs" ] || fail "invalid fossil entrypoint"
case "$node_sha256" in *[!a-f0-9]*|'') fail "invalid Node digest";; esac
[ "${#node_sha256}" -eq 64 ] || fail "invalid Node digest"

emit_shell_feedback "node-verification" "begin"
node_path="$terminal_root/$node_executable"
fossil_path="$terminal_root/$fossil_entrypoint"
[ -x "$node_path" ] || fail "verified Node executable is unavailable"
[ -f "$fossil_path" ] || fail "fossil adapter is unavailable"
[ "$(sha256_file "$node_path")" = "$node_sha256" ] || fail "installed Node digest mismatch"
[ "$($node_path --version)" = "v$node_version" ] || fail "installed Node version mismatch"
emit_shell_feedback "node-verification" "complete"
manifest_digest=$(sed -n '1{s/[[:space:]].*$//;p;}' "$terminal_root/install-manifest.sha256")
case "$manifest_digest" in *[!a-f0-9]*|'') fail "invalid manifest digest";; esac
[ "${#manifest_digest}" -eq 64 ] || fail "invalid manifest digest"
[ "$(sha256_file "$terminal_root/install-manifest.json")" = "$manifest_digest" ] || fail "installed manifest digest mismatch"

exchange_root=${TMPDIR:-/tmp}/nexu-terminal-$$
(umask 077 && mkdir "$exchange_root") || fail "cannot create fossil exchange"
trap 'rm -rf "$exchange_root"' EXIT HUP INT TERM
resolution_file=$exchange_root/carrier-resolution.json
request_file=$exchange_root/fossil-request.json
[ -n "$result_file" ] || result_file=$exchange_root/fossil-result.json

printf '{"installRoot":"%s","manifestFile":"%s","runtime":{"digest":"%s","executablePath":"%s","name":"node","version":"%s"},"schemaVersion":1,"shell":{"digest":"%s","type":"terminal","version":"%s"},"target":"%s"}\n' \
  "$(json_escape "$terminal_root")" "$(json_escape "$terminal_root/install-manifest.json")" "$node_sha256" \
  "$(json_escape "$node_path")" "$node_version" "$manifest_digest" "$shell_version" "$target" > "$resolution_file"
attachment_json=
[ -z "$attachment_id" ] || attachment_json=",\"attachmentId\":\"$(json_escape "$attachment_id")\""
attachment_capability_json=
[ -z "$attachment_capability" ] || attachment_capability_json=",\"attachmentCapability\":\"$attachment_capability\""
store_json=
[ -z "$store_root" ] || store_json=",\"storeRoot\":\"$(json_escape "$store_root")\""
head_json=
[ -z "$channel_head_url" ] || head_json=",\"channelHeadUrl\":\"$(json_escape "$channel_head_url")\""
activation_json=
[ -z "$activation_policy" ] || activation_json=",\"activationPolicy\":\"$(json_escape "$activation_policy")\""
update_protocol_json=
case "$operation" in prepare-update|apply-update|apply-update-force) update_protocol_json=',"updateProtocolVersion":3';; esac
feedback_json=
[ -z "$feedback_file" ] || feedback_json=",\"feedbackFile\":\"$(json_escape "$feedback_file")\""
printf '{"carrierResolutionFile":"%s","channel":"%s","namespace":"%s","operation":"%s","schemaVersion":1%s%s%s%s%s%s%s}\n' \
  "$(json_escape "$resolution_file")" "$channel" "$namespace" "$operation" "$attachment_json" "$attachment_capability_json" "$store_json" "$head_json" "$activation_json" "$update_protocol_json" "$feedback_json" > "$request_file"

set +e
OD_TERMINAL_FOSSIL_REQUEST_V1=$request_file OD_TERMINAL_FOSSIL_RESULT_V1=$result_file \
  "$node_path" "$fossil_path"
fossil_status=$?
set -e
[ -f "$result_file" ] || fail "fossil produced no result"
if [ "$result_file" != "$exchange_root/fossil-result.json" ]; then printf '%s\n' "$result_file"; else cat "$result_file"; fi
exit "$fossil_status"
