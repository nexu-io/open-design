#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-docker.io}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-vanjayak}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-open-design}"
NODE_BASE_IMAGE="${NODE_BASE_IMAGE:-docker.io/library/node:22-alpine}"
RUNTIME_BASE_IMAGE="${RUNTIME_BASE_IMAGE:-docker.io/library/alpine:3.22}"
PUSH_STRATEGY="${PUSH_STRATEGY:-skopeo}"
PRELOAD_BASE_IMAGES="${PRELOAD_BASE_IMAGES:-1}"
DRY_RUN="${DRY_RUN:-0}"
INSPECT_AFTER_PUSH="${INSPECT_AFTER_PUSH:-1}"
SKOPEO_AUTHFILE="${SKOPEO_AUTHFILE:-$HOME/.docker/config.json}"
EFFECTIVE_SKOPEO_AUTHFILE="$SKOPEO_AUTHFILE"
TEMP_SKOPEO_AUTHFILE=""
IMAGE="${IMAGE:-}"

HTTP_PROXY="${HTTP_PROXY:-${http_proxy:-}}"
HTTPS_PROXY="${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-}}}"
NO_PROXY="${NO_PROXY:-${no_proxy:-}}"
BUILD_HTTP_PROXY=""
BUILD_HTTPS_PROXY=""
BUILD_NO_PROXY=""

cleanup_temp_artifacts() {
  if [[ -n "$TEMP_SKOPEO_AUTHFILE" && -f "$TEMP_SKOPEO_AUTHFILE" ]]; then
    rm -f "$TEMP_SKOPEO_AUTHFILE"
  fi
}

trap cleanup_temp_artifacts EXIT

usage() {
  cat <<'EOF'
Usage: publish-images.sh [options]

Options:
  --platforms <list>              default: linux/amd64,linux/arm64
  --arch <amd64|arm64>            shorthand for a single platform
  --image_tag <tag>               default: latest
  --registry <registry>           default: docker.io
  --image_namespace <namespace>   default: vanjayak
  --image_repository <name>       default: open-design
  --image <image-ref>             override full image ref
  --node_base_image <image-ref>   default: docker.io/library/node:22-alpine
  --runtime_base_image <image-ref> default: docker.io/library/alpine:3.22
  --push_strategy <skopeo|buildx> default: skopeo
  --preload_base_images <0|1>     default: 1
  --skopeo_authfile <path>        default: ~/.docker/config.json
  --inspect_after_push <0|1>      default: 1
  --dry_run
  -h, --help

Examples:
  deploy/scripts/publish-images.sh --arch arm64
  deploy/scripts/publish-images.sh --image_tag 0.1.0
EOF
}

log() {
  printf '[publish-images] %s\n' "$*" >&2
}

die() {
  printf '[publish-images] ERROR: %s\n' "$*" >&2
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

detect_proxy_if_available() {
  if [[ -n "$HTTP_PROXY" || -n "$HTTPS_PROXY" ]]; then
    return 0
  fi

  if command_exists nc && nc -vz -w 2 127.0.0.1 7890 >/dev/null 2>&1; then
    HTTP_PROXY="http://127.0.0.1:7890"
    HTTPS_PROXY="http://127.0.0.1:7890"
    NO_PROXY="${NO_PROXY:-kugou.net,tmeoa.com}"
    export http_proxy="$HTTP_PROXY" HTTP_PROXY
    export https_proxy="$HTTPS_PROXY" HTTPS_PROXY
    export no_proxy="$NO_PROXY" NO_PROXY
    log "using local proxy $HTTP_PROXY for registry and build network access"
  fi
}

normalize_proxy_for_build() {
  local proxy_url="${1:-}"

  if [[ -z "$proxy_url" ]]; then
    printf '%s' ""
    return 0
  fi

  printf '%s' "$proxy_url" | perl -pe 's#(https?://)(?:127\.0\.0\.1|localhost)(:\d+)?#$1host.docker.internal$2#g'
}

normalize_arch_to_platform() {
  case "$1" in
    amd64|x86_64)
      printf 'linux/amd64'
      ;;
    arm64|aarch64)
      printf 'linux/arm64'
      ;;
    *)
      return 1
      ;;
  esac
}

platform_to_arch() {
  case "$1" in
    linux/amd64)
      printf 'amd64'
      ;;
    linux/arm64)
      printf 'arm64'
      ;;
    *)
      return 1
      ;;
  esac
}

image_with_arch_suffix() {
  local image="$1"
  local platform="$2"
  local arch
  local repo
  local tag

  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  repo="${image%:*}"
  tag="${image##*:}"
  printf '%s:%s-%s' "$repo" "$tag" "$arch"
}

node_local_base_image() {
  local platform="$1"
  local arch
  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  printf 'open-design-base-node:22-alpine-%s' "$arch"
}

runtime_local_base_image() {
  local platform="$1"
  local arch
  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  printf 'open-design-runtime-base:3.22-%s' "$arch"
}

node_image_for_platform() {
  local platform="$1"
  if [[ "$PRELOAD_BASE_IMAGES" == "1" ]]; then
    node_local_base_image "$platform"
  else
    printf '%s' "$NODE_BASE_IMAGE"
  fi
}

runtime_image_for_platform() {
  local platform="$1"
  if [[ "$PRELOAD_BASE_IMAGES" == "1" ]]; then
    runtime_local_base_image "$platform"
  else
    printf '%s' "$RUNTIME_BASE_IMAGE"
  fi
}

docker_image_exists() {
  docker image inspect "$1" >/dev/null 2>&1
}

registry_auth_key() {
  case "$REGISTRY" in
    docker.io)
      printf 'https://index.docker.io/v1/'
      ;;
    *)
      printf '%s' "$REGISTRY"
      ;;
  esac
}

ensure_skopeo() {
  command_exists skopeo || die "'skopeo' is required when PUSH_STRATEGY=skopeo"
  [[ -f "$SKOPEO_AUTHFILE" ]] || die "skopeo authfile not found: $SKOPEO_AUTHFILE"
  EFFECTIVE_SKOPEO_AUTHFILE="$SKOPEO_AUTHFILE"

  local creds_store=""
  if command_exists jq; then
    creds_store="$(jq -r '.credsStore // empty' "$SKOPEO_AUTHFILE" 2>/dev/null || true)"
  fi

  if [[ -n "$creds_store" ]]; then
    local helper_bin="docker-credential-$creds_store"
    local registry_key
    local creds_json
    local username
    local secret
    local auth

    command_exists jq || die "'jq' is required to translate Docker credential helpers into a skopeo authfile"
    command_exists "$helper_bin" || die "docker credential helper not found: $helper_bin"

    registry_key="$(registry_auth_key)"
    creds_json="$(printf '%s' "$registry_key" | "$helper_bin" get)"
    username="$(printf '%s' "$creds_json" | jq -r '.Username // empty')"
    secret="$(printf '%s' "$creds_json" | jq -r '.Secret // empty')"

    [[ -n "$username" ]] || die "failed to resolve Docker registry username from $helper_bin"
    [[ -n "$secret" ]] || die "failed to resolve Docker registry secret from $helper_bin"

    auth="$(printf '%s:%s' "$username" "$secret" | base64 | tr -d '\n')"
    TEMP_SKOPEO_AUTHFILE="$(mktemp "${TMPDIR:-/tmp}/skopeo-auth.XXXXXX")"
    printf '{ "auths": { "%s": { "auth": "%s" } } }\n' "$registry_key" "$auth" >"$TEMP_SKOPEO_AUTHFILE"
    EFFECTIVE_SKOPEO_AUTHFILE="$TEMP_SKOPEO_AUTHFILE"
  fi
}

preload_base_image() {
  local platform="$1"
  local source_image="$2"
  local destination_image="$3"
  local arch
  local archive_dir
  local archive_path

  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  archive_dir="$(mktemp -d "${TMPDIR:-/tmp}/publish-base.XXXXXX")"
  archive_path="$archive_dir/image.tar"

  if docker_image_exists "$destination_image"; then
    docker image rm "$destination_image" >/dev/null 2>&1 || true
  fi

  if ! skopeo copy \
    --override-os linux \
    --override-arch "$arch" \
    "docker://$source_image" \
    "docker-archive:$archive_path:$destination_image"; then
    rm -rf "$archive_dir"
    die "failed to preload base image '$source_image' for $platform"
  fi

  if ! docker load -i "$archive_path" >/dev/null; then
    rm -rf "$archive_dir"
    die "failed to docker load preloaded base image '$destination_image'"
  fi

  rm -rf "$archive_dir"
}

ensure_base_images_preloaded() {
  local platform="$1"

  [[ "$PRELOAD_BASE_IMAGES" == "1" ]] || return 0
  [[ "$DRY_RUN" == "1" ]] && return 0

  preload_base_image "$platform" "$NODE_BASE_IMAGE" "$(node_local_base_image "$platform")"
  preload_base_image "$platform" "$RUNTIME_BASE_IMAGE" "$(runtime_local_base_image "$platform")"
}

inspect_remote_image() {
  local image="$1"
  [[ "$INSPECT_AFTER_PUSH" == "1" ]] || return 0

  if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
    skopeo inspect --raw "docker://${image}" >/dev/null
  else
    docker buildx imagetools inspect "$image" >/dev/null
  fi
}

push_local_image_with_skopeo() {
  local image="$1"
  local archive_dir
  local archive_path

  archive_dir="$(mktemp -d "${TMPDIR:-/tmp}/publish-image.XXXXXX")"
  archive_path="$archive_dir/image.tar"

  docker save -o "$archive_path" "$image"
  skopeo copy \
    --dest-authfile "$EFFECTIVE_SKOPEO_AUTHFILE" \
    "docker-archive:$archive_path" \
    "docker://$image"

  rm -rf "$archive_dir"
}

print_build_cmd() {
  local image="$1"
  local platform="$2"
  shift 2
  local args=("$@")

  if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
    printf 'docker buildx build --platform %s -t %s %s --load %s\n' \
      "$platform" "$image" "${args[*]}" "$ROOT_DIR"
    printf 'docker save -o <archive> %s\n' "$image"
    printf 'skopeo copy --dest-authfile %s docker-archive:<archive> docker://%s\n' \
      "$EFFECTIVE_SKOPEO_AUTHFILE" "$image"
    return 0
  fi

  printf 'docker buildx build --platform %s -t %s %s --push %s\n' \
    "$platform" "$image" "${args[*]}" "$ROOT_DIR"
}

run_build() {
  local image="$1"
  local platform="$2"
  shift 2
  local args=("$@")

  if [[ "$DRY_RUN" == "1" ]]; then
    print_build_cmd "$image" "$platform" "${args[@]}"
    return 0
  fi

  if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
    docker buildx build \
      --platform "$platform" \
      --add-host "host.docker.internal=host-gateway" \
      -t "$image" \
      "${args[@]}" \
      --load \
      "$ROOT_DIR"
    push_local_image_with_skopeo "$image"
  else
    docker buildx build \
      --platform "$platform" \
      --add-host "host.docker.internal=host-gateway" \
      -t "$image" \
      "${args[@]}" \
      --push \
      "$ROOT_DIR"
  fi

  inspect_remote_image "$image"
}

merge_manifest_for_image() {
  local final_image="$1"
  shift
  local source_images=("$@")

  if [[ "$DRY_RUN" == "1" ]]; then
    printf 'docker buildx imagetools create --tag %s %s\n' "$final_image" "${source_images[*]}"
    printf 'skopeo inspect --raw docker://%s\n' "$final_image"
    return 0
  fi

  docker buildx imagetools create --tag "$final_image" "${source_images[@]}"
  inspect_remote_image "$final_image"
}

refresh_image_ref() {
  if [[ -z "$IMAGE" ]]; then
    IMAGE="${REGISTRY}/${IMAGE_NAMESPACE}/${IMAGE_REPOSITORY}:${IMAGE_TAG}"
  fi
}

SINGLE_ARCH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platforms)
      PLATFORMS="$2"
      shift 2
      ;;
    --arch)
      SINGLE_ARCH="$2"
      shift 2
      ;;
    --image_tag)
      IMAGE_TAG="$2"
      IMAGE=""
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      IMAGE=""
      shift 2
      ;;
    --image_namespace)
      IMAGE_NAMESPACE="$2"
      IMAGE=""
      shift 2
      ;;
    --image_repository)
      IMAGE_REPOSITORY="$2"
      IMAGE=""
      shift 2
      ;;
    --image)
      IMAGE="$2"
      shift 2
      ;;
    --node_base_image)
      NODE_BASE_IMAGE="$2"
      shift 2
      ;;
    --runtime_base_image)
      RUNTIME_BASE_IMAGE="$2"
      shift 2
      ;;
    --push_strategy)
      PUSH_STRATEGY="$2"
      shift 2
      ;;
    --preload_base_images)
      PRELOAD_BASE_IMAGES="$2"
      shift 2
      ;;
    --skopeo_authfile)
      SKOPEO_AUTHFILE="$2"
      EFFECTIVE_SKOPEO_AUTHFILE="$SKOPEO_AUTHFILE"
      shift 2
      ;;
    --inspect_after_push)
      INSPECT_AFTER_PUSH="$2"
      shift 2
      ;;
    --dry_run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "unknown option: $1"
      ;;
  esac
done

if [[ -n "$SINGLE_ARCH" ]]; then
  PLATFORMS="$(normalize_arch_to_platform "$SINGLE_ARCH")" || die "unsupported arch '$SINGLE_ARCH' (use amd64 or arm64)"
fi

case "$PUSH_STRATEGY" in
  skopeo|buildx)
    ;;
  *)
    die "unsupported push strategy: $PUSH_STRATEGY"
    ;;
esac

refresh_image_ref
detect_proxy_if_available

BUILD_HTTP_PROXY="$(normalize_proxy_for_build "$HTTP_PROXY")"
BUILD_HTTPS_PROXY="$(normalize_proxy_for_build "$HTTPS_PROXY")"
BUILD_NO_PROXY="${NO_PROXY}"

build_args=(
  --build-arg "HTTP_PROXY=${BUILD_HTTP_PROXY}"
  --build-arg "HTTPS_PROXY=${BUILD_HTTPS_PROXY}"
  --build-arg "http_proxy=${BUILD_HTTP_PROXY}"
  --build-arg "https_proxy=${BUILD_HTTPS_PROXY}"
  --build-arg "no_proxy=${BUILD_NO_PROXY}"
  --build-arg "NO_PROXY=${BUILD_NO_PROXY}"
)

if [[ "$DRY_RUN" != "1" ]]; then
  docker buildx inspect --bootstrap >/dev/null
  if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
    ensure_skopeo
  fi
fi

IFS=',' read -r -a platform_list <<<"$PLATFORMS"
platform_total="${#platform_list[@]}"
image_sources=()

for platform in "${platform_list[@]}"; do
  ensure_base_images_preloaded "$platform"

  image_for_platform="$IMAGE"
  if [[ "$platform_total" -gt 1 ]]; then
    image_for_platform="$(image_with_arch_suffix "$IMAGE" "$platform")"
  fi

  run_build "$image_for_platform" "$platform" \
    -f "$ROOT_DIR/deploy/Dockerfile" \
    "${build_args[@]}" \
    --build-arg "NODE_IMAGE=$(node_image_for_platform "$platform")" \
    --build-arg "RUNTIME_IMAGE=$(runtime_image_for_platform "$platform")"

  image_sources+=("$image_for_platform")
done

if [[ "$platform_total" -gt 1 ]]; then
  merge_manifest_for_image "$IMAGE" "${image_sources[@]}"
fi

log "image: ${IMAGE}"
