#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-docker.io}"
IMAGE_NAMESPACE="${IMAGE_NAMESPACE:-vanjayak}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-open-design}"
NODE_BASE_IMAGE="${NODE_BASE_IMAGE:-docker.io/library/node:24-alpine}"
RUNTIME_BASE_IMAGE="${RUNTIME_BASE_IMAGE:-docker.io/library/node:24-alpine}"
PUSH_STRATEGY="${PUSH_STRATEGY:-skopeo}"
PRELOAD_BASE_IMAGES="${PRELOAD_BASE_IMAGES:-1}"
DRY_RUN="${DRY_RUN:-0}"
INSPECT_AFTER_PUSH="${INSPECT_AFTER_PUSH:-1}"
SKOPEO_AUTHFILE="${SKOPEO_AUTHFILE:-$HOME/.docker/config.json}"
EFFECTIVE_SKOPEO_AUTHFILE="$SKOPEO_AUTHFILE"
TEMP_SKOPEO_AUTHFILE=""
TEMP_AUTH_ROOT=""
TEMP_ROOT=""
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

  if [[ -n "$TEMP_AUTH_ROOT" && -d "$TEMP_AUTH_ROOT" ]]; then
    case "$TEMP_AUTH_ROOT" in
      /dev/shm/publish-auth.*|"${TMPDIR:-/tmp}"/publish-auth.*|/tmp/publish-auth.*)
        rm -rf "$TEMP_AUTH_ROOT"
        ;;
    esac
  fi

  if [[ -n "$TEMP_ROOT" && -d "$TEMP_ROOT" ]]; then
    case "$TEMP_ROOT" in
      "${TMPDIR:-/tmp}"/publish-images.*|/tmp/publish-images.*)
        rm -rf "$TEMP_ROOT"
        ;;
    esac
  fi
}

ensure_temp_root() {
  if [[ -n "$TEMP_ROOT" ]]; then
    return 0
  fi

  TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/publish-images.XXXXXX")"
  chmod 700 "$TEMP_ROOT"
}

ensure_temp_auth_root() {
  if [[ -n "$TEMP_AUTH_ROOT" ]]; then
    return 0
  fi

  if [[ -d /dev/shm && -w /dev/shm ]]; then
    TEMP_AUTH_ROOT="$(mktemp -d /dev/shm/publish-auth.XXXXXX)"
  else
    TEMP_AUTH_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/publish-auth.XXXXXX")"
  fi
  chmod 700 "$TEMP_AUTH_ROOT"
}

make_temp_dir() {
  local target_var="$1"
  local template="$2"
  local temp_dir

  ensure_temp_root
  temp_dir="$(mktemp -d "$TEMP_ROOT/${template}.XXXXXX")"
  chmod 700 "$temp_dir"
  printf -v "$target_var" '%s' "$temp_dir"
}

make_temp_auth_file() {
  local target_var="$1"
  local template="$2"
  local temp_file

  ensure_temp_auth_root
  temp_file="$(mktemp "$TEMP_AUTH_ROOT/${template}.XXXXXX")"
  chmod 600 "$temp_file"
  printf -v "$target_var" '%s' "$temp_file"
}

trap cleanup_temp_artifacts EXIT

usage() {
  cat <<'EOF'
Usage: publish-images.sh [options]

Options:
  --platforms <list>              default: linux/amd64,linux/arm64
  --arch <amd64|arm64>            publish a single platform as <tag>-<arch>
  --image_tag <tag>               default: latest
  --registry <registry>           default: docker.io
  --image_namespace <namespace>   default: vanjayak
  --image_repository <name>       default: open-design
  --image <image-ref>             override full image ref
  --node_base_image <image-ref>   default: docker.io/library/node:24-alpine
  --runtime_base_image <image-ref> default: docker.io/library/node:24-alpine
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
  local scheme
  local host
  local port=""

  if [[ -z "$proxy_url" ]]; then
    printf '%s' ""
    return 0
  fi

  if [[ ! "$proxy_url" =~ ^(https?)://([a-zA-Z0-9._-]+)(:([0-9]+))?$ ]]; then
    die "proxy URL must be http(s)://host[:port] with no path, query, or credentials: $proxy_url"
  fi

  scheme="${BASH_REMATCH[1]}"
  host="${BASH_REMATCH[2]}"
  port="${BASH_REMATCH[3]:-}"

  if [[ -n "$port" ]]; then
    local port_number="${port#:}"
    if (( 10#$port_number < 1 || 10#$port_number > 65535 )); then
      die "proxy URL port out of range: $proxy_url"
    fi
  fi

  case "$host" in
    localhost|127.0.0.1)
      host="host.docker.internal"
      ;;
  esac

  printf '%s://%s%s' "$scheme" "$host" "$port"
}

build_proxy_requires_host_gateway() {
  [[ "$BUILD_HTTP_PROXY" == *'://host.docker.internal'* || "$BUILD_HTTPS_PROXY" == *'://host.docker.internal'* ]]
}

should_use_preloaded_base_images() {
  [[ "$PRELOAD_BASE_IMAGES" == "1" && "$PUSH_STRATEGY" == "skopeo" ]]
}

validate_image_name_component() {
  local label="$1"
  local value="$2"

  [[ -n "$value" ]] || die "$label must not be empty"
  [[ "$value" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || die "$label must use lowercase Docker name components only: $value"
}

validate_image_ref_parts() {
  validate_image_name_component "image namespace" "$IMAGE_NAMESPACE"
  validate_image_name_component "image repository" "$IMAGE_REPOSITORY"
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

image_for_single_arch() {
  local image="$1"
  local platform="$2"
  local arch
  local repo
  local tag

  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  repo="${image%:*}"
  tag="${image##*:}"
  case "$tag" in
    *-amd64|*-arm64)
      printf '%s' "$image"
      ;;
    *)
      printf '%s:%s-%s' "$repo" "$tag" "$arch"
      ;;
  esac
}

node_local_base_image() {
  local platform="$1"
  local arch
  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  printf 'open-design-base-node:24-alpine-%s' "$arch"
}

runtime_local_base_image() {
  local platform="$1"
  local arch
  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  printf 'open-design-runtime-base:24-alpine-%s' "$arch"
}

node_image_for_platform() {
  local platform="$1"
  if should_use_preloaded_base_images; then
    node_local_base_image "$platform"
  else
    printf '%s' "$NODE_BASE_IMAGE"
  fi
}

runtime_image_for_platform() {
  local platform="$1"
  if should_use_preloaded_base_images; then
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
    make_temp_auth_file TEMP_SKOPEO_AUTHFILE skopeo-auth
    jq -n --arg registry_key "$registry_key" --arg auth "$auth" \
      '{auths: {($registry_key): {auth: $auth}}}' >"$TEMP_SKOPEO_AUTHFILE"
    EFFECTIVE_SKOPEO_AUTHFILE="$TEMP_SKOPEO_AUTHFILE"
  fi
}

skopeo_inspect_raw() {
  local image="$1"
  skopeo inspect --authfile "$EFFECTIVE_SKOPEO_AUTHFILE" --raw "docker://${image}" >/dev/null
}

skopeo_copy_to_registry() {
  local archive_path="$1"
  local image="$2"
  skopeo copy --dest-authfile "$EFFECTIVE_SKOPEO_AUTHFILE" "docker-archive:$archive_path" "docker://$image"
}

preload_base_image() {
  local platform="$1"
  local source_image="$2"
  local destination_image="$3"
  local arch
  local archive_dir
  local archive_path

  arch="$(platform_to_arch "$platform")" || die "unsupported platform '$platform'"
  make_temp_dir archive_dir publish-base
  archive_path="$archive_dir/image.tar"

  if docker_image_exists "$destination_image"; then
    docker image rm "$destination_image" >/dev/null 2>&1 || true
  fi

  if ! skopeo copy \
    --override-os linux \
    --override-arch "$arch" \
    "docker://$source_image" \
    "docker-archive:$archive_path:$destination_image"; then
    die "failed to preload base image '$source_image' for $platform"
  fi

  if ! docker load -i "$archive_path" >/dev/null; then
    die "failed to docker load preloaded base image '$destination_image'"
  fi
}

ensure_base_images_preloaded() {
  local platform="$1"

  should_use_preloaded_base_images || return 0
  [[ "$DRY_RUN" == "1" ]] && return 0

  preload_base_image "$platform" "$NODE_BASE_IMAGE" "$(node_local_base_image "$platform")"
  preload_base_image "$platform" "$RUNTIME_BASE_IMAGE" "$(runtime_local_base_image "$platform")"
}

inspect_remote_image() {
  local image="$1"
  [[ "$INSPECT_AFTER_PUSH" == "1" ]] || return 0

  if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
    skopeo_inspect_raw "$image"
  else
    docker buildx imagetools inspect "$image" >/dev/null
  fi
}

push_local_image_with_skopeo() {
  local image="$1"
  local archive_dir
  local archive_path

  make_temp_dir archive_dir publish-image
  archive_path="$archive_dir/image.tar"

  docker save -o "$archive_path" "$image"
  skopeo_copy_to_registry "$archive_path" "$image"
}

print_build_cmd() {
  local image="$1"
  local platform="$2"
  shift 2
  local args=("$@")
  local host_arg=""

  if build_proxy_requires_host_gateway; then
    host_arg=' --add-host host.docker.internal=host-gateway'
  fi

  if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
    printf 'docker buildx build --platform %s%s -t %s %s --load %s\n' \
      "$platform" "$host_arg" "$image" "${args[*]}" "$ROOT_DIR"
    printf 'docker save -o <archive> %s\n' "$image"
    printf 'skopeo copy --dest-authfile %s docker-archive:<archive> docker://%s\n' \
      "$EFFECTIVE_SKOPEO_AUTHFILE" "$image"
    return 0
  fi

  printf 'docker buildx build --platform %s%s -t %s %s --push %s\n' \
    "$platform" "$host_arg" "$image" "${args[*]}" "$ROOT_DIR"
}

run_build() {
  local image="$1"
  local platform="$2"
  shift 2
  local args=("$@")
  local host_args=()

  if build_proxy_requires_host_gateway; then
    host_args=(--add-host "host.docker.internal=host-gateway")
  fi

  if [[ "$DRY_RUN" == "1" ]]; then
    print_build_cmd "$image" "$platform" "${args[@]}"
    return 0
  fi

  if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
    docker buildx build \
      --platform "$platform" \
      "${host_args[@]}" \
      -t "$image" \
      "${args[@]}" \
      --load \
      "$ROOT_DIR"
    push_local_image_with_skopeo "$image"
  else
    docker buildx build \
      --platform "$platform" \
      "${host_args[@]}" \
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
    if [[ "$PUSH_STRATEGY" == "skopeo" ]]; then
      printf 'skopeo inspect --authfile %s --raw docker://%s\n' "$EFFECTIVE_SKOPEO_AUTHFILE" "$final_image"
    else
      printf 'docker buildx imagetools inspect %s\n' "$final_image"
    fi
    return 0
  fi

  docker buildx imagetools create --tag "$final_image" "${source_images[@]}"
  inspect_remote_image "$final_image"
}

refresh_image_ref() {
  if [[ -z "$IMAGE" ]]; then
    validate_image_ref_parts
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
  elif [[ -n "$SINGLE_ARCH" ]]; then
    image_for_platform="$(image_for_single_arch "$IMAGE" "$platform")"
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

published_image="$IMAGE"
if [[ "$platform_total" -eq 1 && -n "$SINGLE_ARCH" ]]; then
  published_image="${image_sources[0]}"
fi

log "image: ${published_image}"
