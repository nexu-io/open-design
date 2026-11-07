#!/usr/bin/env bash
# Container setup — runs once after container creation
set -euo pipefail

# Install infisical CLI if not present
if ! command -v infisical >/dev/null 2>&1; then
  curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | bash
  apt-get install -y infisical 2>/dev/null || true
fi

# Ensure zsh is default shell
if command -v zsh >/dev/null 2>&1; then
  sudo chsh -s "$(command -v zsh)" vscode 2>/dev/null || true
fi

echo "devcontainer ready"
