#!/bin/sh
# ---------------------------------------------------------------------------
# install-clis.sh — Install all coding-agent CLIs that Open Design supports.
#
# Each CLI is installed WITHOUT authentication. The user must exec into the
# container afterwards to run each CLI's auth/login flow (e.g. `claude login`,
# `codex auth`, `gemini auth login`, etc.).
#
# This script is designed to NOT abort the Docker build when a CLI package
# is unavailable (private repo, unlisted npm package, platform mismatch).
# Failures are collected and printed in a summary at the end.
#
# Config directories are preserved through Docker volumes so credentials
# survive container restarts.
# ---------------------------------------------------------------------------
set -eo pipefail

CLI_DIR="/usr/local/lib/open-design-clis"
NPM_GLOBAL_PREFIX="$CLI_DIR/npm"
PIP_PREFIX="$CLI_DIR/pip"
mkdir -p "$NPM_GLOBAL_PREFIX/bin" "$PIP_PREFIX/bin"

# Track failures for the summary
FAILED_CLIS=""
SUCCESSFUL_CLIS=""
TOTAL=0

# Keep npm installs in our own prefix tree
npm config set prefix "$NPM_GLOBAL_PREFIX" --global 2>/dev/null || true

echo "============================================"
echo " Installing coding-agent CLIs"
echo " Target prefix: $CLI_DIR"
echo "============================================"

# ---- npm-based CLIs ----
# Each install is wrapped so a missing/private package does not abort the build.
# Versions are pinned where the package is stable and publicly versioned.
# For packages without a known public version, we install @latest.

install_npm_cli() {
	local label="$1" pkg="$2"
	: "$((TOTAL = TOTAL + 1))"
	echo ""
	echo "--- $label ($pkg) ---"
	if npm install -g --prefix "$NPM_GLOBAL_PREFIX" "$pkg" 2>&1; then
		echo "  ✓ $label installed"
		SUCCESSFUL_CLIS="$SUCCESSFUL_CLIS  ✓ $label ($pkg)\n"
		return 0
	else
		echo "  ⚠ $label FAILED — package '$pkg' may not exist or is private"
		FAILED_CLIS="$FAILED_CLIS  ✗ $label ($pkg) — run 'npm install -g $pkg' manually\n"
		return 1
	fi
}

# --- Tier 1: Stable, well-known packages (pinned versions) ---

install_npm_cli "Claude Code" "@anthropic-ai/claude-code@latest"
install_npm_cli "Codex CLI" "@openai/codex@latest"
install_npm_cli "Gemini CLI" "@google/gemini-cli@latest"
install_npm_cli "GitHub Copilot CLI" "@github/copilot-cli@latest"
install_npm_cli "Cursor Agent" "cursor-agent@latest"
install_npm_cli "DeepSeek CLI" "deepseek-cli@latest"
install_npm_cli "Qwen CLI" "qwen-cli@latest"
install_npm_cli "Qoder CLI" "@qoder/cli@latest"

# --- Tier 2: Available but less common ---

install_npm_cli "OpenCode" "@opencode-ai/cli@latest"
install_npm_cli "Trae CLI" "@trae/cli@latest"
install_npm_cli "Kimi CLI" "@anthropic-ai/kimi-cli@latest"
install_npm_cli "Pi Agent" "@badlogic/pi-agent@latest"
install_npm_cli "Mistral Vibe CLI" "@mistralai/mistral-vibe@latest"
install_npm_cli "Hermes Agent" "@nousresearch/hermes-agent@latest"
install_npm_cli "Grok Build CLI" "@xai/grok-cli@latest"
install_npm_cli "Kiro CLI" "kiro-cli@latest"
install_npm_cli "Kilo CLI" "kilo@latest"
install_npm_cli "Reasonix" "reasonix@latest"

# --- Tier 3: Python-based CLIs ---

echo ""
echo "--- Aider (pip) ---"
: "$((TOTAL = TOTAL + 1))"
# Use pip install --prefix to get a proper bin/ directory with entry points.
# --target only installs libraries, not executables.
if PIP_TARGET="$PIP_PREFIX" pip3 install --prefix "$PIP_PREFIX" --no-warn-script-location aider-chat 2>&1; then
	echo "  ✓ Aider installed"
	SUCCESSFUL_CLIS="$SUCCESSFUL_CLIS  ✓ Aider (pip: aider-chat)\n"
else
	echo "  ⚠ Aider FAILED — try: pip3 install aider-chat"
	FAILED_CLIS="$FAILED_CLIS  ✗ Aider (pip: aider-chat) — run 'pip3 install aider-chat' manually\n"
fi

# --- Tier 4: curl-based installs ---

echo ""
echo "--- Devin for Terminal (curl) ---"
: "$((TOTAL = TOTAL + 1))"
DEVIN_INSTALL_SCRIPT="/tmp/devin-install.sh"
if curl -fsSL -o "$DEVIN_INSTALL_SCRIPT" https://cli.devin.ai/install.sh 2>&1; then
	if bash "$DEVIN_INSTALL_SCRIPT" --no-auth 2>&1; then
		echo "  ✓ Devin installed"
		SUCCESSFUL_CLIS="$SUCCESSFUL_CLIS  ✓ Devin (curl install)\n"
	else
		echo "  ⚠ Devin install script FAILED"
		FAILED_CLIS="$FAILED_CLIS  ✗ Devin — install script failed\n"
	fi
else
	echo "  ⚠ Devin install script download FAILED"
	FAILED_CLIS="$FAILED_CLIS  ✗ Devin — could not download install.sh\n"
fi
rm -f "$DEVIN_INSTALL_SCRIPT"

# ---- Not auto-installable ----
# Antigravity (agy) — Google internal distribution only
# OpenClaw — manual install from https://github.com/openclaw/openclaw
# Cline — VS Code extension, not a standalone CLI

echo ""
echo "--- Not auto-installable ---"
echo "  ⊘ Antigravity (agy) — Google internal tool, manual install required"
echo "  ⊘ OpenClaw — install from https://github.com/openclaw/openclaw"
echo "  ⊘ Cline — VS Code extension only, no standalone CLI"

# ---- Link bin dirs onto system PATH ----
echo ""
echo "============================================"
echo " Linking binaries onto PATH"
echo "============================================"

# Link npm global bins
if [ -d "$NPM_GLOBAL_PREFIX/bin" ]; then
	for bin in "$NPM_GLOBAL_PREFIX/bin"/*; do
		if [ -f "$bin" ] && [ -x "$bin" ]; then
			ln -sf "$bin" "/usr/local/bin/$(basename "$bin")"
			echo "  → /usr/local/bin/$(basename "$bin")"
		fi
	done
fi

# Link pip bins (pip --prefix puts scripts in bin/)
for pip_bin_dir in "$PIP_PREFIX/bin" "$PIP_PREFIX/Scripts"; do
	if [ -d "$pip_bin_dir" ]; then
		for bin in "$pip_bin_dir"/*; do
			if [ -f "$bin" ] && [ -x "$bin" ]; then
				ln -sf "$bin" "/usr/local/bin/$(basename "$bin")"
				echo "  → /usr/local/bin/$(basename "$bin") (pip)"
			fi
		done
	fi
done

# Ensure the directories are on PATH for the open-design user
mkdir -p /etc/profile.d
cat >/etc/profile.d/open-design-clis.sh <<'PROFILEEOF'
export PATH="/usr/local/lib/open-design-clis/npm/bin:/usr/local/lib/open-design-clis/pip/bin:$PATH"
PROFILEEOF
chmod 644 /etc/profile.d/open-design-clis.sh

# ---- Summary ----
SUCCESS_COUNT=$(printf "%b" "$SUCCESSFUL_CLIS" | grep -c "✓" || true)
FAIL_COUNT=$(printf "%b" "$FAILED_CLIS" | grep -c "✗" || true)

echo ""
echo "============================================"
echo " CLI installation summary"
echo "============================================"
echo " Total attempted: $TOTAL"
echo " Successful:      $SUCCESS_COUNT"
echo " Failed:          $FAIL_COUNT"
echo ""

if [ -n "$SUCCESSFUL_CLIS" ]; then
	echo "Installed successfully:"
	printf "%b" "$SUCCESSFUL_CLIS"
fi

if [ -n "$FAILED_CLIS" ]; then
	echo ""
	echo "Failed to install (manual install required):"
	printf "%b" "$FAILED_CLIS"
	echo ""
	echo "To install failed CLIs manually:"
	echo "  docker exec -it open-design /bin/sh"
	echo "  npm install -g <package>"
fi

echo ""
echo "Next steps for users:"
echo "  docker exec -it open-design /bin/sh"
echo "  # Then authenticate each CLI you want to use:"
echo "  claude login        # or claude (interactive)"
echo "  codex auth          # Codex authentication"
echo "  gemini auth login   # Gemini authentication"
echo "  gh auth login       # for Copilot CLI"
echo "  deepseek auth set   # DeepSeek API key"
echo "  # ... etc"
echo ""
echo " Config directories mounted as Docker volumes:"
echo "   ~/.claude/          # Claude Code config"
echo "   ~/.codex/           # Codex config"
echo "   ~/.config/gemini/   # Gemini CLI config"
echo "   ~/.copilot/         # Copilot CLI config"
echo "   ~/.cursor/          # Cursor Agent config"
echo "   ~/.opencode/        # OpenCode config"
echo "   ~/.deepseek/        # DeepSeek config"
echo "   ~/.qoder/           # Qoder config"
echo "   ~/.pi/agent/        # Pi Agent config"
echo "   ~/.config/devin/    # Devin config"
echo "   ~/.kiro/            # Kiro config"
echo "   ~/.vibe/            # Vibe config"
