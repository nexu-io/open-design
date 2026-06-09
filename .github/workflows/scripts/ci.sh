#!/usr/bin/env bash
set -Eeuo pipefail

mode="${1:-${OD_CI_MODE:-}}"

if [ -z "$mode" ]; then
  echo "usage: $0 <probe|setup|core|policy|unit|typecheck|daemon|daemon-shard|daemon-parallel|web|build|browser>" >&2
  exit 2
fi

ci_root="${GITHUB_WORKSPACE:-$(pwd)}"
out_dir="$ci_root/.od/ci"
manifest="$out_dir/$mode-manifest.json"
summary="${GITHUB_STEP_SUMMARY:-}"

mkdir -p "$out_dir"

append_summary() {
  if [ -n "$summary" ]; then
    printf '%s\n' "$*" >> "$summary"
  fi
}

append_toolchain_storage_summary() {
  append_summary ""
  append_summary "### Toolchain"
  append_summary ""
  append_summary "| Tool | Version |"
  append_summary "| --- | --- |"
  append_summary "| git | \`$git_version\` |"
  append_summary "| node | \`$node_version\` |"
  append_summary "| npm | \`$npm_version\` |"
  append_summary "| corepack | \`$corepack_version\` |"
  append_summary "| pnpm | \`$pnpm_version\` |"
  append_summary "| docker | \`$docker_version\` |"
  append_summary ""
  append_summary "### Storage"
  append_summary ""
  append_summary "| Path | Available |"
  append_summary "| --- | --- |"
  append_summary "| / | \`$disk_root\` |"
  append_summary "| workspace | \`$workspace_disk\` |"
  append_summary "| pnpm store | \`$pnpm_store\` |"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/}"
  printf '%s' "$value"
}

capture_cmd() {
  local name="$1"
  shift
  local value
  if value="$("$@" 2>/dev/null | head -1)"; then
    printf '%s' "$value"
  else
    printf ''
  fi
}

require_mode() {
  case "$mode" in
    probe | setup | core | policy | unit | typecheck | daemon | daemon-shard | daemon-parallel | web | build | browser) ;;
    *)
      echo "unknown CI mode: $mode" >&2
      exit 2
      ;;
  esac
}

require_mode

lane="${OD_CI_LANE:-unknown}"
allow_docker="${OD_CI_ALLOW_DOCKER:-0}"
install_timeout_seconds="${OD_CI_INSTALL_TIMEOUT_SECONDS:-1500}"
pnpm_fetch_retries="${OD_CI_PNPM_FETCH_RETRIES:-6}"
pnpm_fetch_retry_maxtimeout="${OD_CI_PNPM_FETCH_RETRY_MAXTIMEOUT:-120000}"
pnpm_fetch_retry_mintimeout="${OD_CI_PNPM_FETCH_RETRY_MINTIMEOUT:-20000}"
pnpm_install_flags="${OD_CI_PNPM_INSTALL_FLAGS:---frozen-lockfile}"
pnpm_network_timeout="${OD_CI_PNPM_NETWORK_TIMEOUT:-180000}"
pnpm_store_dir="${OD_CI_PNPM_STORE_DIR:-}"
playwright_install_flags="${OD_CI_PLAYWRIGHT_INSTALL_FLAGS:-chromium}"
step_timeout_seconds="${OD_CI_STEP_TIMEOUT_SECONDS:-600}"
corepack_home="${COREPACK_HOME:-}"
daemon_shard="${OD_CI_DAEMON_SHARD:-}"
daemon_max_workers="${OD_CI_DAEMON_MAX_WORKERS:-}"
runner_name="${RUNNER_NAME:-unknown}"
runner_os="${RUNNER_OS:-unknown}"
runner_arch="${RUNNER_ARCH:-unknown}"
github_sha="${GITHUB_SHA:-unknown}"
github_ref="${GITHUB_REF:-unknown}"
github_run_id="${GITHUB_RUN_ID:-unknown}"

echo "ci mode: $mode"
echo "ci lane: $lane"
echo "runner: $runner_name / $runner_os / $runner_arch"
echo "ref: $github_ref"
echo "sha: $github_sha"

if [ -n "$corepack_home" ]; then
  mkdir -p "$corepack_home"
  export COREPACK_HOME="$corepack_home"
fi
export COREPACK_ENABLE_DOWNLOAD_PROMPT="${COREPACK_ENABLE_DOWNLOAD_PROMPT:-0}"

append_summary "## CI runner"
append_summary ""
append_summary "| Field | Value |"
append_summary "| --- | --- |"
append_summary "| Lane | \`$lane\` |"
append_summary "| Mode | \`$mode\` |"
append_summary "| Runner | \`$runner_name\` |"
append_summary "| Runner OS | \`$runner_os\` |"
append_summary "| Runner arch | \`$runner_arch\` |"
append_summary "| Ref | \`$github_ref\` |"
append_summary "| SHA | \`$github_sha\` |"
if [ -n "$daemon_shard" ]; then
  append_summary "| Daemon shard | \`$daemon_shard\` |"
fi
if [ -n "$daemon_max_workers" ]; then
  append_summary "| Daemon max workers | \`$daemon_max_workers\` |"
fi

node_version="$(capture_cmd node node --version)"
npm_version="$(capture_cmd npm npm --version)"
corepack_version="$(capture_cmd corepack corepack --version)"
git_version="$(capture_cmd git git --version)"
docker_version="$(capture_cmd docker docker --version)"
kernel="$(capture_cmd uname uname -a)"
disk_root="$(df -h / | awk 'NR==2 {print $4 " available of " $2}')"
workspace_disk="$(df -h "$ci_root" | awk 'NR==2 {print $4 " available of " $2}')"
pnpm_version="not-prepared"
pnpm_store=""

if [ -z "$node_version" ] || [ -z "$npm_version" ] || [ -z "$corepack_version" ]; then
  echo "missing required Node package-manager toolchain" >&2
  exit 1
fi

node_major="${node_version#v}"
node_major="${node_major%%.*}"
if [ "$node_major" != "24" ]; then
  echo "Node 24 is required for CI, got $node_version" >&2
  exit 1
fi

if [ -n "$pnpm_store_dir" ]; then
  mkdir -p "$pnpm_store_dir"
  export npm_config_store_dir="$pnpm_store_dir"
fi
export npm_config_fetch_retries="$pnpm_fetch_retries"
export npm_config_fetch_retry_maxtimeout="$pnpm_fetch_retry_maxtimeout"
export npm_config_fetch_retry_mintimeout="$pnpm_fetch_retry_mintimeout"
export npm_config_network_timeout="$pnpm_network_timeout"

if [ "$mode" = "probe" ]; then
  append_toolchain_storage_summary
fi

docker_status="skipped"
if [ "$allow_docker" = "1" ]; then
  timeout 30s docker ps >/dev/null
  docker_status="ok"
fi

append_summary ""
append_summary "### Docker"
append_summary ""
append_summary "Docker smoke: \`$docker_status\`"

install_status="skipped"
install_seconds="0"
install_exit_code="0"
node_modules_size="not-created"
pnpm_store_size="unknown"
corepack_prepare_status="skipped"
corepack_prepare_exit_code="0"
corepack_prepare_seconds="0"
policy_status="skipped"
policy_exit_code="0"
policy_seconds="0"
guard_exit_code="0"
guard_seconds="0"
i18n_exit_code="0"
i18n_seconds="0"
unit_status="skipped"
unit_exit_code="0"
unit_seconds="0"
contracts_test_exit_code="0"
contracts_test_seconds="0"
host_test_exit_code="0"
host_test_seconds="0"
platform_test_exit_code="0"
platform_test_seconds="0"
sidecar_test_exit_code="0"
sidecar_test_seconds="0"
sidecar_proto_test_exit_code="0"
sidecar_proto_test_seconds="0"
tools_dev_test_exit_code="0"
tools_dev_test_seconds="0"
tools_pack_test_exit_code="0"
tools_pack_test_seconds="0"
typecheck_status="skipped"
typecheck_exit_code="0"
typecheck_seconds="0"
daemon_build_exit_code="0"
daemon_build_seconds="0"
desktop_build_exit_code="0"
desktop_build_seconds="0"
web_sidecar_build_exit_code="0"
web_sidecar_build_seconds="0"
workspace_typecheck_exit_code="0"
workspace_typecheck_seconds="0"
scripts_typecheck_exit_code="0"
scripts_typecheck_seconds="0"
daemon_status="skipped"
daemon_exit_code="0"
daemon_seconds="0"
daemon_test_exit_code="0"
daemon_test_seconds="0"
web_status="skipped"
web_exit_code="0"
web_seconds="0"
web_test_exit_code="0"
web_test_seconds="0"
build_status="skipped"
build_exit_code="0"
build_seconds="0"
workspace_build_exit_code="0"
workspace_build_seconds="0"
browser_status="skipped"
browser_exit_code="0"
browser_seconds="0"
playwright_install_exit_code="0"
playwright_install_seconds="0"
e2e_vitest_exit_code="0"
e2e_vitest_seconds="0"
playwright_critical_exit_code="0"
playwright_critical_seconds="0"

if [ "$mode" = "setup" ] || [ "$mode" = "core" ] || [ "$mode" = "policy" ] || [ "$mode" = "unit" ] || [ "$mode" = "typecheck" ] || [ "$mode" = "daemon" ] || [ "$mode" = "daemon-shard" ] || [ "$mode" = "daemon-parallel" ] || [ "$mode" = "web" ] || [ "$mode" = "build" ] || [ "$mode" = "browser" ]; then
  package_manager="$(node -p "require('./package.json').packageManager")"
  append_summary ""
  append_summary "### Corepack"
  append_summary ""
  append_summary "Command: \`corepack prepare $package_manager --activate\`"
  append_summary ""

  echo "corepack home: ${COREPACK_HOME:-default}"
  echo "corepack package manager: $package_manager"

  corepack_prepare_start="$(date +%s)"
  set +e
  timeout 180s bash -c 'corepack enable && corepack prepare "$1" --activate' _ "$package_manager"
  corepack_prepare_exit_code="$?"
  set -e
  corepack_prepare_seconds="$(( $(date +%s) - corepack_prepare_start ))"
  if [ "$corepack_prepare_exit_code" = "0" ]; then
    corepack_prepare_status="ok"
    pnpm_version="$(capture_cmd pnpm pnpm --version)"
    pnpm_store="$(capture_cmd pnpm-store pnpm store path --silent)"
  else
    corepack_prepare_status="failed"
  fi

  if [ "$corepack_prepare_exit_code" = "0" ] && [ -z "$pnpm_version" ]; then
    echo "missing required pnpm shim after corepack prepare" >&2
    exit 1
  fi

  append_toolchain_storage_summary

  append_summary ""
  append_summary "### Install"
  append_summary ""
  append_summary "Command: \`pnpm install $pnpm_install_flags\`"
  append_summary ""

  echo "pnpm store: $pnpm_store"
  echo "pnpm install flags: $pnpm_install_flags"
  echo "install timeout seconds: $install_timeout_seconds"
  echo "pnpm fetch retries: $pnpm_fetch_retries"
  echo "pnpm fetch retry min timeout: $pnpm_fetch_retry_mintimeout"
  echo "pnpm fetch retry max timeout: $pnpm_fetch_retry_maxtimeout"
  echo "pnpm network timeout: $pnpm_network_timeout"

  install_start="$(date +%s)"
  set +e
  # shellcheck disable=SC2086
  timeout "${install_timeout_seconds}s" pnpm install $pnpm_install_flags
  install_exit_code="$?"
  set -e
  install_seconds="$(( $(date +%s) - install_start ))"
  if [ "$install_exit_code" = "0" ]; then
    install_status="ok"
  else
    install_status="failed"
  fi

  if [ -d "$ci_root/node_modules" ]; then
    node_modules_size="$(du -sh "$ci_root/node_modules" 2>/dev/null | awk '{print $1}')"
  fi
fi

run_ci_command() {
  local label="$1"
  shift
  local started
  local exit_code
  local seconds

  echo "running: $label"
  started="$(date +%s)"
  set +e
  timeout "${step_timeout_seconds}s" "$@"
  exit_code="$?"
  set -e
  seconds="$(( $(date +%s) - started ))"
  echo "completed: $label exit=$exit_code seconds=$seconds"
  echo "OD_CI_COMMAND {\"lane\":\"$(json_escape "$lane")\",\"mode\":\"$(json_escape "$mode")\",\"label\":\"$(json_escape "$label")\",\"exitCode\":$exit_code,\"seconds\":$seconds}"

  last_command_exit_code="$exit_code"
  last_command_seconds="$seconds"
}

if { [ "$mode" = "policy" ] || [ "$mode" = "core" ]; } && [ "$install_exit_code" = "0" ]; then
  append_summary ""
  append_summary "### Policy checks"
  append_summary ""
  append_summary "| Check | Exit code | Seconds |"
  append_summary "| --- | ---: | ---: |"

  policy_status="ok"
  policy_start="$(date +%s)"

  run_ci_command "pnpm guard" pnpm guard
  guard_exit_code="$last_command_exit_code"
  guard_seconds="$last_command_seconds"
  append_summary "| \`pnpm guard\` | \`$guard_exit_code\` | \`$guard_seconds\` |"
  if [ "$guard_exit_code" != "0" ]; then
    policy_status="failed"
  fi

  run_ci_command "pnpm i18n:check" pnpm i18n:check
  i18n_exit_code="$last_command_exit_code"
  i18n_seconds="$last_command_seconds"
  append_summary "| \`pnpm i18n:check\` | \`$i18n_exit_code\` | \`$i18n_seconds\` |"
  if [ "$i18n_exit_code" != "0" ]; then
    policy_status="failed"
  fi

  policy_seconds="$(( $(date +%s) - policy_start ))"
  if [ "$policy_status" != "ok" ]; then
    if [ "$guard_exit_code" != "0" ]; then
      policy_exit_code="$guard_exit_code"
    else
      policy_exit_code="$i18n_exit_code"
    fi
  fi
fi

record_unit_result() {
  local label="$1"
  local exit_code="$2"
  local seconds="$3"

  append_summary "| \`$label\` | \`$exit_code\` | \`$seconds\` |"
  if [ "$exit_code" != "0" ] && [ "$unit_status" = "ok" ]; then
    unit_status="failed"
    unit_exit_code="$exit_code"
  fi
}

if { [ "$mode" = "unit" ] || [ "$mode" = "core" ]; } && [ "$install_exit_code" = "0" ]; then
  append_summary ""
  append_summary "### Workspace unit tests"
  append_summary ""
  append_summary "| Check | Exit code | Seconds |"
  append_summary "| --- | ---: | ---: |"

  unit_status="ok"
  unit_start="$(date +%s)"

  run_ci_command "@open-design/contracts test" pnpm --filter @open-design/contracts test
  contracts_test_exit_code="$last_command_exit_code"
  contracts_test_seconds="$last_command_seconds"
  record_unit_result "@open-design/contracts" "$contracts_test_exit_code" "$contracts_test_seconds"

  run_ci_command "@open-design/host test" pnpm --filter @open-design/host test
  host_test_exit_code="$last_command_exit_code"
  host_test_seconds="$last_command_seconds"
  record_unit_result "@open-design/host" "$host_test_exit_code" "$host_test_seconds"

  run_ci_command "@open-design/platform test" pnpm --filter @open-design/platform test
  platform_test_exit_code="$last_command_exit_code"
  platform_test_seconds="$last_command_seconds"
  record_unit_result "@open-design/platform" "$platform_test_exit_code" "$platform_test_seconds"

  run_ci_command "@open-design/sidecar test" pnpm --filter @open-design/sidecar test
  sidecar_test_exit_code="$last_command_exit_code"
  sidecar_test_seconds="$last_command_seconds"
  record_unit_result "@open-design/sidecar" "$sidecar_test_exit_code" "$sidecar_test_seconds"

  run_ci_command "@open-design/sidecar-proto test" pnpm --filter @open-design/sidecar-proto test
  sidecar_proto_test_exit_code="$last_command_exit_code"
  sidecar_proto_test_seconds="$last_command_seconds"
  record_unit_result "@open-design/sidecar-proto" "$sidecar_proto_test_exit_code" "$sidecar_proto_test_seconds"

  run_ci_command "@open-design/tools-dev test" pnpm --filter @open-design/tools-dev test
  tools_dev_test_exit_code="$last_command_exit_code"
  tools_dev_test_seconds="$last_command_seconds"
  record_unit_result "@open-design/tools-dev" "$tools_dev_test_exit_code" "$tools_dev_test_seconds"

  run_ci_command "@open-design/tools-pack test" pnpm --filter @open-design/tools-pack test
  tools_pack_test_exit_code="$last_command_exit_code"
  tools_pack_test_seconds="$last_command_seconds"
  record_unit_result "@open-design/tools-pack" "$tools_pack_test_exit_code" "$tools_pack_test_seconds"

  unit_seconds="$(( $(date +%s) - unit_start ))"
fi

record_typecheck_result() {
  local label="$1"
  local exit_code="$2"
  local seconds="$3"

  append_summary "| \`$label\` | \`$exit_code\` | \`$seconds\` |"
  if [ "$exit_code" != "0" ] && [ "$typecheck_status" = "ok" ]; then
    typecheck_status="failed"
    typecheck_exit_code="$exit_code"
  fi
}

if [ "$mode" = "typecheck" ] && [ "$install_exit_code" = "0" ]; then
  append_summary ""
  append_summary "### Typecheck"
  append_summary ""
  append_summary "| Check | Exit code | Seconds |"
  append_summary "| --- | ---: | ---: |"

  typecheck_status="ok"
  typecheck_start="$(date +%s)"

  run_ci_command "@open-design/daemon build" pnpm --filter @open-design/daemon build
  daemon_build_exit_code="$last_command_exit_code"
  daemon_build_seconds="$last_command_seconds"
  record_typecheck_result "@open-design/daemon build" "$daemon_build_exit_code" "$daemon_build_seconds"

  run_ci_command "@open-design/desktop build" pnpm --filter @open-design/desktop build
  desktop_build_exit_code="$last_command_exit_code"
  desktop_build_seconds="$last_command_seconds"
  record_typecheck_result "@open-design/desktop build" "$desktop_build_exit_code" "$desktop_build_seconds"

  run_ci_command "@open-design/web build:sidecar" pnpm --filter @open-design/web build:sidecar
  web_sidecar_build_exit_code="$last_command_exit_code"
  web_sidecar_build_seconds="$last_command_seconds"
  record_typecheck_result "@open-design/web build:sidecar" "$web_sidecar_build_exit_code" "$web_sidecar_build_seconds"

  run_ci_command "workspace typecheck" pnpm -r --filter '!open-design' --filter '!@open-design/landing-page' --workspace-concurrency=4 --if-present run typecheck
  workspace_typecheck_exit_code="$last_command_exit_code"
  workspace_typecheck_seconds="$last_command_seconds"
  record_typecheck_result "workspace typecheck" "$workspace_typecheck_exit_code" "$workspace_typecheck_seconds"

  run_ci_command "scripts typecheck" pnpm exec tsc -p scripts/tsconfig.json --noEmit
  scripts_typecheck_exit_code="$last_command_exit_code"
  scripts_typecheck_seconds="$last_command_seconds"
  record_typecheck_result "scripts typecheck" "$scripts_typecheck_exit_code" "$scripts_typecheck_seconds"

  typecheck_seconds="$(( $(date +%s) - typecheck_start ))"
fi

record_daemon_result() {
  local label="$1"
  local exit_code="$2"
  local seconds="$3"

  append_summary "| \`$label\` | \`$exit_code\` | \`$seconds\` |"
  if [ "$exit_code" != "0" ] && [ "$daemon_status" = "ok" ]; then
    daemon_status="failed"
    daemon_exit_code="$exit_code"
  fi
}

if { [ "$mode" = "daemon" ] || [ "$mode" = "daemon-shard" ] || [ "$mode" = "daemon-parallel" ]; } && [ "$install_exit_code" = "0" ]; then
  append_summary ""
  append_summary "### Daemon workspace tests"
  append_summary ""
  append_summary "| Check | Exit code | Seconds |"
  append_summary "| --- | ---: | ---: |"

  daemon_status="ok"
  daemon_start="$(date +%s)"

  run_ci_command "@open-design/daemon build" pnpm --filter @open-design/daemon build
  daemon_build_exit_code="$last_command_exit_code"
  daemon_build_seconds="$last_command_seconds"
  record_daemon_result "@open-design/daemon build" "$daemon_build_exit_code" "$daemon_build_seconds"

  if [ "$mode" = "daemon-shard" ]; then
    run_ci_command "@open-design/daemon test shard $daemon_shard" pnpm --filter @open-design/daemon exec vitest run -c vitest.config.ts --shard "$daemon_shard"
  elif [ "$mode" = "daemon-parallel" ]; then
    run_ci_command "@open-design/daemon test parallel workers ${daemon_max_workers:-4}" pnpm --filter @open-design/daemon exec vitest run -c vitest.parallel.config.ts
  else
    run_ci_command "@open-design/daemon test" pnpm --filter @open-design/daemon test
  fi
  daemon_test_exit_code="$last_command_exit_code"
  daemon_test_seconds="$last_command_seconds"
  record_daemon_result "@open-design/daemon test${daemon_shard:+ shard $daemon_shard}" "$daemon_test_exit_code" "$daemon_test_seconds"

  daemon_seconds="$(( $(date +%s) - daemon_start ))"
fi

record_web_result() {
  local label="$1"
  local exit_code="$2"
  local seconds="$3"

  append_summary "| \`$label\` | \`$exit_code\` | \`$seconds\` |"
  if [ "$exit_code" != "0" ] && [ "$web_status" = "ok" ]; then
    web_status="failed"
    web_exit_code="$exit_code"
  fi
}

if [ "$mode" = "web" ] && [ "$install_exit_code" = "0" ]; then
  append_summary ""
  append_summary "### Web workspace tests"
  append_summary ""
  append_summary "| Check | Exit code | Seconds |"
  append_summary "| --- | ---: | ---: |"

  web_status="ok"
  web_start="$(date +%s)"

  run_ci_command "@open-design/web build:sidecar" pnpm --filter @open-design/web build:sidecar
  web_sidecar_build_exit_code="$last_command_exit_code"
  web_sidecar_build_seconds="$last_command_seconds"
  record_web_result "@open-design/web build:sidecar" "$web_sidecar_build_exit_code" "$web_sidecar_build_seconds"

  run_ci_command "@open-design/web test" pnpm --filter @open-design/web test
  web_test_exit_code="$last_command_exit_code"
  web_test_seconds="$last_command_seconds"
  record_web_result "@open-design/web test" "$web_test_exit_code" "$web_test_seconds"

  web_seconds="$(( $(date +%s) - web_start ))"
fi

record_build_result() {
  local label="$1"
  local exit_code="$2"
  local seconds="$3"

  append_summary "| \`$label\` | \`$exit_code\` | \`$seconds\` |"
  if [ "$exit_code" != "0" ] && [ "$build_status" = "ok" ]; then
    build_status="failed"
    build_exit_code="$exit_code"
  fi
}

if [ "$mode" = "build" ] && [ "$install_exit_code" = "0" ]; then
  append_summary ""
  append_summary "### Build workspaces"
  append_summary ""
  append_summary "| Check | Exit code | Seconds |"
  append_summary "| --- | ---: | ---: |"

  build_status="ok"
  build_start="$(date +%s)"

  run_ci_command "@open-design/daemon build" pnpm --filter @open-design/daemon build
  daemon_build_exit_code="$last_command_exit_code"
  daemon_build_seconds="$last_command_seconds"
  record_build_result "@open-design/daemon build" "$daemon_build_exit_code" "$daemon_build_seconds"

  run_ci_command "@open-design/desktop build" pnpm --filter @open-design/desktop build
  desktop_build_exit_code="$last_command_exit_code"
  desktop_build_seconds="$last_command_seconds"
  record_build_result "@open-design/desktop build" "$desktop_build_exit_code" "$desktop_build_seconds"

  run_ci_command "@open-design/web build:sidecar" pnpm --filter @open-design/web build:sidecar
  web_sidecar_build_exit_code="$last_command_exit_code"
  web_sidecar_build_seconds="$last_command_seconds"
  record_build_result "@open-design/web build:sidecar" "$web_sidecar_build_exit_code" "$web_sidecar_build_seconds"

  run_ci_command "workspace build" pnpm -r --filter '!@open-design/landing-page' --workspace-concurrency=1 --if-present run build
  workspace_build_exit_code="$last_command_exit_code"
  workspace_build_seconds="$last_command_seconds"
  record_build_result "workspace build" "$workspace_build_exit_code" "$workspace_build_seconds"

  build_seconds="$(( $(date +%s) - build_start ))"
fi

record_browser_result() {
  local label="$1"
  local exit_code="$2"
  local seconds="$3"

  append_summary "| \`$label\` | \`$exit_code\` | \`$seconds\` |"
  if [ "$exit_code" != "0" ] && [ "$browser_status" = "ok" ]; then
    browser_status="failed"
    browser_exit_code="$exit_code"
  fi
}

if [ "$mode" = "browser" ] && [ "$install_exit_code" = "0" ]; then
  append_summary ""
  append_summary "### Browser tests"
  append_summary ""
  append_summary "Playwright install flags: \`$playwright_install_flags\`"
  append_summary ""
  append_summary "| Check | Exit code | Seconds |"
  append_summary "| --- | ---: | ---: |"

  browser_status="ok"
  browser_start="$(date +%s)"

  # shellcheck disable=SC2086
  run_ci_command "playwright install" pnpm -C e2e exec playwright install $playwright_install_flags
  playwright_install_exit_code="$last_command_exit_code"
  playwright_install_seconds="$last_command_seconds"
  record_browser_result "playwright install" "$playwright_install_exit_code" "$playwright_install_seconds"

  run_ci_command "@open-design/daemon build" pnpm --filter @open-design/daemon build
  daemon_build_exit_code="$last_command_exit_code"
  daemon_build_seconds="$last_command_seconds"
  record_browser_result "@open-design/daemon build" "$daemon_build_exit_code" "$daemon_build_seconds"

  run_ci_command "@open-design/desktop build" pnpm --filter @open-design/desktop build
  desktop_build_exit_code="$last_command_exit_code"
  desktop_build_seconds="$last_command_seconds"
  record_browser_result "@open-design/desktop build" "$desktop_build_exit_code" "$desktop_build_seconds"

  run_ci_command "@open-design/web build:sidecar" pnpm --filter @open-design/web build:sidecar
  web_sidecar_build_exit_code="$last_command_exit_code"
  web_sidecar_build_seconds="$last_command_seconds"
  record_browser_result "@open-design/web build:sidecar" "$web_sidecar_build_exit_code" "$web_sidecar_build_seconds"

  run_ci_command "e2e vitest" pnpm --filter @open-design/e2e test
  e2e_vitest_exit_code="$last_command_exit_code"
  e2e_vitest_seconds="$last_command_seconds"
  record_browser_result "e2e vitest" "$e2e_vitest_exit_code" "$e2e_vitest_seconds"

  run_ci_command "playwright clean" pnpm -C e2e exec tsx scripts/playwright.ts clean
  record_browser_result "playwright clean" "$last_command_exit_code" "$last_command_seconds"

  run_ci_command "playwright critical" pnpm -C e2e run test:ui:critical
  playwright_critical_exit_code="$last_command_exit_code"
  playwright_critical_seconds="$last_command_seconds"
  record_browser_result "playwright critical" "$playwright_critical_exit_code" "$playwright_critical_seconds"

  browser_seconds="$(( $(date +%s) - browser_start ))"
fi

if [ -n "$pnpm_store" ] && [ -d "$pnpm_store" ]; then
  pnpm_store_size="$(du -sh "$pnpm_store" 2>/dev/null | awk '{print $1}')"
fi

append_summary ""
append_summary "### Dependency setup"
append_summary ""
append_summary "| Field | Value |"
append_summary "| --- | --- |"
append_summary "| Install status | \`$install_status\` |"
append_summary "| Corepack prepare status | \`$corepack_prepare_status\` |"
append_summary "| Corepack prepare seconds | \`$corepack_prepare_seconds\` |"
append_summary "| Install exit code | \`$install_exit_code\` |"
append_summary "| Install seconds | \`$install_seconds\` |"
append_summary "| node_modules size | \`$node_modules_size\` |"
append_summary "| pnpm store size | \`$pnpm_store_size\` |"
append_summary "| Policy status | \`$policy_status\` |"
append_summary "| Policy seconds | \`$policy_seconds\` |"
append_summary "| Unit status | \`$unit_status\` |"
append_summary "| Unit seconds | \`$unit_seconds\` |"
append_summary "| Typecheck status | \`$typecheck_status\` |"
append_summary "| Typecheck seconds | \`$typecheck_seconds\` |"
append_summary "| Daemon status | \`$daemon_status\` |"
append_summary "| Daemon seconds | \`$daemon_seconds\` |"
append_summary "| Web status | \`$web_status\` |"
append_summary "| Web seconds | \`$web_seconds\` |"
append_summary "| Build status | \`$build_status\` |"
append_summary "| Build seconds | \`$build_seconds\` |"
append_summary "| Browser status | \`$browser_status\` |"
append_summary "| Browser seconds | \`$browser_seconds\` |"

emit_ci_metric() {
  local name="$1"
  local status="$2"
  local exit_code="$3"
  local seconds="$4"
  echo "OD_CI_METRIC {\"lane\":\"$(json_escape "$lane")\",\"mode\":\"$(json_escape "$mode")\",\"name\":\"$(json_escape "$name")\",\"status\":\"$(json_escape "$status")\",\"exitCode\":$exit_code,\"seconds\":$seconds}"
}

echo "OD_CI_SUMMARY {\"lane\":\"$(json_escape "$lane")\",\"mode\":\"$(json_escape "$mode")\",\"runner\":\"$(json_escape "$runner_name")\",\"sha\":\"$(json_escape "$github_sha")\",\"installStatus\":\"$(json_escape "$install_status")\",\"policyStatus\":\"$(json_escape "$policy_status")\",\"unitStatus\":\"$(json_escape "$unit_status")\",\"typecheckStatus\":\"$(json_escape "$typecheck_status")\",\"daemonStatus\":\"$(json_escape "$daemon_status")\",\"webStatus\":\"$(json_escape "$web_status")\",\"buildStatus\":\"$(json_escape "$build_status")\",\"browserStatus\":\"$(json_escape "$browser_status")\"}"
emit_ci_metric "corepack_prepare" "$corepack_prepare_status" "$corepack_prepare_exit_code" "$corepack_prepare_seconds"
emit_ci_metric "install" "$install_status" "$install_exit_code" "$install_seconds"
emit_ci_metric "policy_total" "$policy_status" "$policy_exit_code" "$policy_seconds"
emit_ci_metric "policy_guard" "$policy_status" "$guard_exit_code" "$guard_seconds"
emit_ci_metric "policy_i18n" "$policy_status" "$i18n_exit_code" "$i18n_seconds"
emit_ci_metric "unit_total" "$unit_status" "$unit_exit_code" "$unit_seconds"
emit_ci_metric "unit_contracts" "$unit_status" "$contracts_test_exit_code" "$contracts_test_seconds"
emit_ci_metric "unit_host" "$unit_status" "$host_test_exit_code" "$host_test_seconds"
emit_ci_metric "unit_platform" "$unit_status" "$platform_test_exit_code" "$platform_test_seconds"
emit_ci_metric "unit_sidecar" "$unit_status" "$sidecar_test_exit_code" "$sidecar_test_seconds"
emit_ci_metric "unit_sidecar_proto" "$unit_status" "$sidecar_proto_test_exit_code" "$sidecar_proto_test_seconds"
emit_ci_metric "unit_tools_dev" "$unit_status" "$tools_dev_test_exit_code" "$tools_dev_test_seconds"
emit_ci_metric "unit_tools_pack" "$unit_status" "$tools_pack_test_exit_code" "$tools_pack_test_seconds"
emit_ci_metric "typecheck_total" "$typecheck_status" "$typecheck_exit_code" "$typecheck_seconds"
emit_ci_metric "typecheck_daemon_build" "$typecheck_status" "$daemon_build_exit_code" "$daemon_build_seconds"
emit_ci_metric "typecheck_desktop_build" "$typecheck_status" "$desktop_build_exit_code" "$desktop_build_seconds"
emit_ci_metric "typecheck_web_sidecar_build" "$typecheck_status" "$web_sidecar_build_exit_code" "$web_sidecar_build_seconds"
emit_ci_metric "typecheck_workspace" "$typecheck_status" "$workspace_typecheck_exit_code" "$workspace_typecheck_seconds"
emit_ci_metric "typecheck_scripts" "$typecheck_status" "$scripts_typecheck_exit_code" "$scripts_typecheck_seconds"
emit_ci_metric "daemon_total" "$daemon_status" "$daemon_exit_code" "$daemon_seconds"
emit_ci_metric "daemon_build" "$daemon_status" "$daemon_build_exit_code" "$daemon_build_seconds"
emit_ci_metric "daemon_test" "$daemon_status" "$daemon_test_exit_code" "$daemon_test_seconds"
emit_ci_metric "web_total" "$web_status" "$web_exit_code" "$web_seconds"
emit_ci_metric "web_test" "$web_status" "$web_test_exit_code" "$web_test_seconds"
emit_ci_metric "build_total" "$build_status" "$build_exit_code" "$build_seconds"
emit_ci_metric "build_workspace" "$build_status" "$workspace_build_exit_code" "$workspace_build_seconds"
emit_ci_metric "browser_total" "$browser_status" "$browser_exit_code" "$browser_seconds"
emit_ci_metric "browser_playwright_install" "$browser_status" "$playwright_install_exit_code" "$playwright_install_seconds"
emit_ci_metric "browser_e2e_vitest" "$browser_status" "$e2e_vitest_exit_code" "$e2e_vitest_seconds"
emit_ci_metric "browser_playwright_critical" "$browser_status" "$playwright_critical_exit_code" "$playwright_critical_seconds"

cat > "$manifest" <<JSON
{
  "mode": "$(json_escape "$mode")",
  "lane": "$(json_escape "$lane")",
  "runnerName": "$(json_escape "$runner_name")",
  "runnerOs": "$(json_escape "$runner_os")",
  "runnerArch": "$(json_escape "$runner_arch")",
  "githubRef": "$(json_escape "$github_ref")",
  "githubSha": "$(json_escape "$github_sha")",
  "githubRunId": "$(json_escape "$github_run_id")",
  "daemonShard": "$(json_escape "$daemon_shard")",
  "kernel": "$(json_escape "$kernel")",
  "gitVersion": "$(json_escape "$git_version")",
  "nodeVersion": "$(json_escape "$node_version")",
  "npmVersion": "$(json_escape "$npm_version")",
  "corepackVersion": "$(json_escape "$corepack_version")",
  "pnpmVersion": "$(json_escape "$pnpm_version")",
  "pnpmStore": "$(json_escape "$pnpm_store")",
  "pnpmStoreSize": "$(json_escape "$pnpm_store_size")",
  "pnpmFetchRetries": "$(json_escape "$pnpm_fetch_retries")",
  "pnpmFetchRetryMaxTimeout": "$(json_escape "$pnpm_fetch_retry_maxtimeout")",
  "pnpmFetchRetryMinTimeout": "$(json_escape "$pnpm_fetch_retry_mintimeout")",
  "pnpmInstallFlags": "$(json_escape "$pnpm_install_flags")",
  "pnpmNetworkTimeout": "$(json_escape "$pnpm_network_timeout")",
  "playwrightInstallFlags": "$(json_escape "$playwright_install_flags")",
  "stepTimeoutSeconds": "$(json_escape "$step_timeout_seconds")",
  "corepackHome": "$(json_escape "${COREPACK_HOME:-}")",
  "corepackPrepareStatus": "$(json_escape "$corepack_prepare_status")",
  "corepackPrepareExitCode": "$(json_escape "$corepack_prepare_exit_code")",
  "corepackPrepareSeconds": "$(json_escape "$corepack_prepare_seconds")",
  "installStatus": "$(json_escape "$install_status")",
  "installExitCode": "$(json_escape "$install_exit_code")",
  "installSeconds": "$(json_escape "$install_seconds")",
  "nodeModulesSize": "$(json_escape "$node_modules_size")",
  "policyStatus": "$(json_escape "$policy_status")",
  "policyExitCode": "$(json_escape "$policy_exit_code")",
  "policySeconds": "$(json_escape "$policy_seconds")",
  "guardExitCode": "$(json_escape "$guard_exit_code")",
  "guardSeconds": "$(json_escape "$guard_seconds")",
  "i18nExitCode": "$(json_escape "$i18n_exit_code")",
  "i18nSeconds": "$(json_escape "$i18n_seconds")",
  "unitStatus": "$(json_escape "$unit_status")",
  "unitExitCode": "$(json_escape "$unit_exit_code")",
  "unitSeconds": "$(json_escape "$unit_seconds")",
  "contractsTestExitCode": "$(json_escape "$contracts_test_exit_code")",
  "contractsTestSeconds": "$(json_escape "$contracts_test_seconds")",
  "hostTestExitCode": "$(json_escape "$host_test_exit_code")",
  "hostTestSeconds": "$(json_escape "$host_test_seconds")",
  "platformTestExitCode": "$(json_escape "$platform_test_exit_code")",
  "platformTestSeconds": "$(json_escape "$platform_test_seconds")",
  "sidecarTestExitCode": "$(json_escape "$sidecar_test_exit_code")",
  "sidecarTestSeconds": "$(json_escape "$sidecar_test_seconds")",
  "sidecarProtoTestExitCode": "$(json_escape "$sidecar_proto_test_exit_code")",
  "sidecarProtoTestSeconds": "$(json_escape "$sidecar_proto_test_seconds")",
  "toolsDevTestExitCode": "$(json_escape "$tools_dev_test_exit_code")",
  "toolsDevTestSeconds": "$(json_escape "$tools_dev_test_seconds")",
  "toolsPackTestExitCode": "$(json_escape "$tools_pack_test_exit_code")",
  "toolsPackTestSeconds": "$(json_escape "$tools_pack_test_seconds")",
  "typecheckStatus": "$(json_escape "$typecheck_status")",
  "typecheckExitCode": "$(json_escape "$typecheck_exit_code")",
  "typecheckSeconds": "$(json_escape "$typecheck_seconds")",
  "daemonBuildExitCode": "$(json_escape "$daemon_build_exit_code")",
  "daemonBuildSeconds": "$(json_escape "$daemon_build_seconds")",
  "desktopBuildExitCode": "$(json_escape "$desktop_build_exit_code")",
  "desktopBuildSeconds": "$(json_escape "$desktop_build_seconds")",
  "webSidecarBuildExitCode": "$(json_escape "$web_sidecar_build_exit_code")",
  "webSidecarBuildSeconds": "$(json_escape "$web_sidecar_build_seconds")",
  "workspaceTypecheckExitCode": "$(json_escape "$workspace_typecheck_exit_code")",
  "workspaceTypecheckSeconds": "$(json_escape "$workspace_typecheck_seconds")",
  "scriptsTypecheckExitCode": "$(json_escape "$scripts_typecheck_exit_code")",
  "scriptsTypecheckSeconds": "$(json_escape "$scripts_typecheck_seconds")",
  "daemonStatus": "$(json_escape "$daemon_status")",
  "daemonExitCode": "$(json_escape "$daemon_exit_code")",
  "daemonSeconds": "$(json_escape "$daemon_seconds")",
  "daemonTestExitCode": "$(json_escape "$daemon_test_exit_code")",
  "daemonTestSeconds": "$(json_escape "$daemon_test_seconds")",
  "webStatus": "$(json_escape "$web_status")",
  "webExitCode": "$(json_escape "$web_exit_code")",
  "webSeconds": "$(json_escape "$web_seconds")",
  "webTestExitCode": "$(json_escape "$web_test_exit_code")",
  "webTestSeconds": "$(json_escape "$web_test_seconds")",
  "buildStatus": "$(json_escape "$build_status")",
  "buildExitCode": "$(json_escape "$build_exit_code")",
  "buildSeconds": "$(json_escape "$build_seconds")",
  "workspaceBuildExitCode": "$(json_escape "$workspace_build_exit_code")",
  "workspaceBuildSeconds": "$(json_escape "$workspace_build_seconds")",
  "browserStatus": "$(json_escape "$browser_status")",
  "browserExitCode": "$(json_escape "$browser_exit_code")",
  "browserSeconds": "$(json_escape "$browser_seconds")",
  "playwrightInstallExitCode": "$(json_escape "$playwright_install_exit_code")",
  "playwrightInstallSeconds": "$(json_escape "$playwright_install_seconds")",
  "e2eVitestExitCode": "$(json_escape "$e2e_vitest_exit_code")",
  "e2eVitestSeconds": "$(json_escape "$e2e_vitest_seconds")",
  "playwrightCriticalExitCode": "$(json_escape "$playwright_critical_exit_code")",
  "playwrightCriticalSeconds": "$(json_escape "$playwright_critical_seconds")",
  "dockerVersion": "$(json_escape "$docker_version")",
  "dockerStatus": "$(json_escape "$docker_status")",
  "rootDisk": "$(json_escape "$disk_root")",
  "workspaceDisk": "$(json_escape "$workspace_disk")"
}
JSON

echo "manifest: $manifest"

if [ "$install_exit_code" != "0" ]; then
  exit "$install_exit_code"
fi

if [ "$corepack_prepare_exit_code" != "0" ]; then
  exit "$corepack_prepare_exit_code"
fi

if [ "$policy_exit_code" != "0" ]; then
  exit "$policy_exit_code"
fi

if [ "$unit_exit_code" != "0" ]; then
  exit "$unit_exit_code"
fi

if [ "$typecheck_exit_code" != "0" ]; then
  exit "$typecheck_exit_code"
fi

if [ "$daemon_exit_code" != "0" ]; then
  exit "$daemon_exit_code"
fi

if [ "$web_exit_code" != "0" ]; then
  exit "$web_exit_code"
fi

if [ "$build_exit_code" != "0" ]; then
  exit "$build_exit_code"
fi

if [ "$browser_exit_code" != "0" ]; then
  exit "$browser_exit_code"
fi
