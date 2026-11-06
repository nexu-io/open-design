#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "usage: $0 <image-ref> [expected-platforms]" >&2
  exit 64
fi

IMAGE_REF="$1"
EXPECTED_PLATFORMS="${2:-linux/amd64,linux/arm64}"

inspect_output="$(skopeo inspect --raw "docker://${IMAGE_REF}")"
printf '%s\n' "$inspect_output"

missing=0
IFS=',' read -r -a expected <<<"$EXPECTED_PLATFORMS"
for platform in "${expected[@]}"; do
  os="${platform%/*}"
  arch="${platform#*/}"
  if ! jq -e --arg os "$os" --arg arch "$arch" '
    (.mediaType == "application/vnd.docker.distribution.manifest.list.v2+json" or
     .mediaType == "application/vnd.oci.image.index.v1+json") and
    any(.manifests[]?; .platform.os == $os and .platform.architecture == $arch)
  ' >/dev/null <<<"$inspect_output"; then
    echo "missing platform in manifest: $platform" >&2
    missing=1
  fi
done

exit "$missing"
