#!/usr/bin/env bash
#
# Provision / repair the self-hosted agent-pr-explore runner.
#
# The runner that powers `.github/workflows/agent-pr-explore-sandbox.yml` is a
# self-hosted macOS host. Several pieces of its setup are layered on top of the
# base toolchain and are easy to lose on a rebuild (most importantly the
# codex-acp pin -- see below). This script makes that layer reproducible and
# idempotent: run it on the runner, any time, to bring it back to a working
# state. It never prints or embeds secrets.
#
# Run as the runner user (e.g. `mashu`) on the runner host:
#   bash provision-agent-pr-explore-runner.sh
#
# ─────────────────────────────────────────────────────────────────────────────
# MANUAL prerequisites this script does NOT do (one-time, need a human/secret):
#
#  A. Base toolchain (user-local, no sudo). Install once into ~/agent-pr-explore-bin
#     + ~/.npm-global if missing: docker CLI, colima, lima, node, npm, gh,
#     expect-cli. Then start colima (give the VM real resources):
#       colima start --runtime docker --cpu 8 --memory 13 --disk 80 \
#         --vm-type=vz --mount-type=virtiofs --network-address=false
#     (Playwright Chromium for the host user is auto-installed by the sandbox
#      script's fallback on first run.)
#
#  B. Codex ChatGPT login (interactive OAuth, cannot be scripted):
#       codex login          # complete ChatGPT auth in a browser
#     On a headless box, log in on a workstation and copy ~/.codex/auth.json here.
#     This script verifies login status and warns if absent.
#
#  C. Register the read-only deploy key (printed by this script) on the repo:
#       gh api repos/${BASE_REPO}/keys -X POST -f title='agent-pr-explore runner' \
#         -f key="$(cat ~/.ssh/od_agent_deploy.pub)" -F read_only=true
#     (Needs repo admin. Required so the host can SSH-fetch PR source — the one
#      git transport GFW does not reset.)
#
#  D. Register + service-install the GitHub Actions runner (token-based):
#       ./config.sh --url https://github.com/${BASE_REPO} --token <RUNNER_TOKEN> \
#         --labels self-hosted,agent-pr-explore --name macmini-agent-pr-explore
#     then install it as a launchd service so it survives reboot.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

# --- config (override via env) -----------------------------------------------
BASE_REPO="${BASE_REPO:-nexu-io/open-design}"
CODEX_MODEL="${CODEX_MODEL:-gpt-5.4}"
ACP_VERSION="${ACP_VERSION:-0.15.0}"
ACP_ARCH_PKG="${ACP_ARCH_PKG:-@zed-industries/codex-acp-darwin-arm64}"  # match the runner arch
NPM_MIRROR="${NPM_MIRROR:-https://registry.npmmirror.com}"
DEPLOY_KEY="${DEPLOY_KEY:-$HOME/.ssh/od_agent_deploy}"
MIRROR_DIR="${OD_SANDBOX_REPO_MIRROR:-$HOME/.cache/agent-pr-explore/open-design.git}"
TOOLS_DIR="$HOME/agent-pr-explore-tools"
export PATH="$TOOLS_DIR/lima-2.1.1/bin:$HOME/agent-pr-explore-bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ok()   { printf '  \033[32m✔\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m⚠\033[0m %s\n' "$*"; }
step() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

# --- 0. sanity: base tools present -------------------------------------------
step "0. base toolchain"
missing=0
for c in node npm docker expect-cli; do
  if command -v "$c" >/dev/null 2>&1; then ok "$c: $(command -v "$c")"; else warn "$c MISSING — see manual step A"; missing=1; fi
done
[ "$missing" = 1 ] && warn "install the missing base tools first (manual step A), then re-run."

# --- 1. codex CLI ------------------------------------------------------------
step "1. codex CLI"
if command -v codex >/dev/null 2>&1; then
  ok "codex present: $(codex --version 2>&1 | head -1)"
else
  warn "installing @openai/codex via mirror…"
  npm_config_registry="$NPM_MIRROR" npm install -g @openai/codex >/dev/null 2>&1 \
    && ok "codex installed: $(codex --version 2>&1 | head -1)" || warn "codex install FAILED"
fi

# --- 2. codex model pin (ChatGPT account rejects -codex / gpt-5 models) -------
step "2. codex model pin -> $CODEX_MODEL"
mkdir -p "$HOME/.codex"
cfg="$HOME/.codex/config.toml"
touch "$cfg"
if grep -q "^model *= *\"$CODEX_MODEL\"" "$cfg"; then
  ok "config.toml already pins model = \"$CODEX_MODEL\""
elif grep -q '^model *=' "$cfg"; then
  # Replace just the model line in place; leave any other settings intact.
  tmp="$(mktemp)" && sed "s|^model *=.*|model = \"$CODEX_MODEL\"|" "$cfg" > "$tmp" && mv "$tmp" "$cfg"
  ok "updated model -> \"$CODEX_MODEL\" (other config.toml settings preserved)"
else
  printf 'model = "%s"\n' "$CODEX_MODEL" >> "$cfg"
  ok "appended model = \"$CODEX_MODEL\" to config.toml"
fi

# --- 3. codex login (verify only; interactive — manual step B) ---------------
step "3. codex login (ChatGPT OAuth)"
if codex login status 2>&1 | grep -qi 'logged in'; then
  ok "$(codex login status 2>&1 | head -1)"
else
  warn "codex NOT logged in — run 'codex login' (manual step B) or copy ~/.codex/auth.json here."
fi

# --- 4. codex-acp pin (CRITICAL: expect-cli bundles 0.10 which is incompatible
#        with ChatGPT-account auth; reinstalling expect-cli reverts this). -----
step "4. codex-acp pin -> $ACP_VERSION (the fragile one)"
zed="$(npm root -g 2>/dev/null)/expect-cli/node_modules/@zed-industries"
cur="$(cat "$zed/codex-acp/package.json" 2>/dev/null | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)"
if [ "$cur" = "$ACP_VERSION" ]; then
  ok "codex-acp already $ACP_VERSION"
elif [ -d "$zed" ]; then
  warn "codex-acp is '$cur' — pinning to $ACP_VERSION"
  tmp="$(mktemp -d)"; ( cd "$tmp" && npm_config_registry="$NPM_MIRROR" npm pack \
      "@zed-industries/codex-acp@$ACP_VERSION" "$ACP_ARCH_PKG@$ACP_VERSION" >/dev/null 2>&1 )
  for pair in "codex-acp:@zed-industries/codex-acp" "$(basename "$ACP_ARCH_PKG"):$ACP_ARCH_PKG"; do
    dir="${pair%%:*}"; tgz="$(ls "$tmp"/*"${dir}"-"$ACP_VERSION".tgz 2>/dev/null | head -1)"
    [ -z "$tgz" ] && { warn "tarball for $dir not fetched"; continue; }
    mkdir -p "$tmp/x_$dir"; tar -xzf "$tgz" -C "$tmp/x_$dir"
    rm -rf "$zed/$dir"/* && cp -a "$tmp/x_$dir/package/." "$zed/$dir/"
  done
  chmod +x "$zed/$(basename "$ACP_ARCH_PKG")/bin/"* 2>/dev/null || true
  rm -rf "$tmp"
  now="$(cat "$zed/codex-acp/package.json" 2>/dev/null | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)"
  [ "$now" = "$ACP_VERSION" ] && ok "codex-acp now $ACP_VERSION" || warn "codex-acp pin FAILED (still $now)"
else
  warn "expect-cli not found at $zed — install expect-cli first (manual step A)."
fi

# --- 5. deploy key (generate if missing; registration is manual step C) ------
step "5. SSH deploy key"
if [ -f "$DEPLOY_KEY" ]; then
  ok "deploy key present: $DEPLOY_KEY"
else
  # On a fresh-rebuild host ~/.ssh often does not exist yet; create it first so
  # ssh-keygen doesn't fail with "No such file or directory".
  mkdir -p "$(dirname "$DEPLOY_KEY")" && chmod 700 "$(dirname "$DEPLOY_KEY")" 2>/dev/null || true
  if ssh-keygen -t ed25519 -N "" -C "agent-pr-explore-deploy@$(hostname)" -f "$DEPLOY_KEY" >/dev/null; then
    ok "generated $DEPLOY_KEY"
  else
    warn "ssh-keygen failed — deploy key NOT created; mirror bootstrap will not work until fixed."
  fi
fi
if [ -f "$DEPLOY_KEY.pub" ]; then
  warn "ensure this pubkey is a READ-ONLY deploy key on $BASE_REPO (manual step C):"
  echo "        $(cat "$DEPLOY_KEY.pub")"
fi

# --- 6. base repo git mirror (so per-PR fetches are small deltas) ------------
step "6. git mirror"
export GIT_SSH_COMMAND="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
if [ -d "$MIRROR_DIR" ] && git --git-dir="$MIRROR_DIR" rev-parse HEAD >/dev/null 2>&1; then
  ok "mirror present ($(du -sh "$MIRROR_DIR" 2>/dev/null | cut -f1)); refreshing main…"
  git --git-dir="$MIRROR_DIR" fetch --no-tags --depth=1 origin main >/dev/null 2>&1 && ok "main refreshed" || warn "mirror refresh failed (network?)"
else
  mkdir -p "$(dirname "$MIRROR_DIR")"
  warn "seeding mirror (one-time, ~150MB over SSH)…"
  git clone --bare --depth=1 --single-branch --branch main "git@github.com:${BASE_REPO}.git" "$MIRROR_DIR" >/dev/null 2>&1 \
    && ok "mirror seeded" || warn "mirror clone FAILED (deploy key registered? network?)"
fi
mkdir -p "$HOME/.cache/agent-pr-explore/pnpm-store" "$HOME/.cache/agent-pr-explore/reports"
ok "pnpm-store + reports dirs ready"

# --- 7. base image refresh helper + weekly cron ------------------------------
step "7. sandbox image refresh helper + cron"
mkdir -p "$TOOLS_DIR"
cat > "$TOOLS_DIR/refresh-sandbox-image.sh" <<'RSH'
#!/usr/bin/env bash
# Best-effort refresh of the sandbox base image. The sandbox script skips
# `docker pull` when the image is cached (the runner's docker.io access is
# flaky), so this is the decoupled refresh path; it never fails the host.
set -uo pipefail
export PATH="$HOME/agent-pr-explore-tools/lima-2.1.1/bin:$HOME/agent-pr-explore-bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
image="${OD_SANDBOX_IMAGE:-node:24-bookworm}"
ts() { date "+%Y-%m-%dT%H:%M:%S%z"; }
echo "[$(ts)] refresh start: $image"
colima status >/dev/null 2>&1 || { echo "[$(ts)] colima down; skip"; exit 0; }
before="$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || echo none)"
if docker pull "$image"; then
  after="$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null || echo none)"
  [ "$before" != "$after" ] && { echo "[$(ts)] refreshed $before -> $after"; docker image prune -f >/dev/null 2>&1 || true; } || echo "[$(ts)] up to date"
else
  echo "[$(ts)] pull failed (registry unreachable?); keeping cached $before"
fi
echo "[$(ts)] done"
RSH
chmod +x "$TOOLS_DIR/refresh-sandbox-image.sh"
ok "wrote $TOOLS_DIR/refresh-sandbox-image.sh"
cron_line="17 4 * * 0 $TOOLS_DIR/refresh-sandbox-image.sh >> $TOOLS_DIR/image-refresh.log 2>&1"
if crontab -l 2>/dev/null | grep -qF "refresh-sandbox-image.sh"; then
  ok "weekly refresh cron already installed"
else
  { crontab -l 2>/dev/null; echo "# agent-pr-explore weekly base-image refresh"; echo "$cron_line"; } | crontab - && ok "installed weekly refresh cron"
fi

# --- 8. readiness self-check helper ------------------------------------------
step "8. readiness self-check helper"
cat > "$HOME/check-agent-ready.sh" <<'CHK'
#!/usr/bin/env bash
# Quick readiness check: VPN reaches chatgpt backend + Codex responds.
export PATH="$HOME/agent-pr-explore-tools/lima-2.1.1/bin:$HOME/agent-pr-explore-bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ok=1
echo "1. chatgpt backend: $(curl -sS -m 15 -o /dev/null -w '%{http_code}' https://chatgpt.com/backend-api/ 2>/dev/null || echo FAIL)  (403/200 = reachable)"
echo "2. codex model: $(grep '^model' "$HOME/.codex/config.toml" 2>/dev/null)"
echo "3. codex-acp: $(cat "$(npm root -g)/expect-cli/node_modules/@zed-industries/codex-acp/package.json" 2>/dev/null | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -1)"
out="$(perl -e 'alarm shift; exec @ARGV' 90 codex exec --skip-git-repo-check 'reply with exactly READY_OK' 2>&1)"
if printf '%s' "$out" | grep -q READY_OK; then echo "4. codex: ✅ responds"; else echo "4. codex: ❌ no response"; ok=0; fi
[ "$ok" = 1 ] && echo "==> READY ✅" || echo "==> NOT READY ❌"
CHK
chmod +x "$HOME/check-agent-ready.sh"
ok "wrote ~/check-agent-ready.sh"

step "done — run ~/check-agent-ready.sh after VPN/login to confirm"
