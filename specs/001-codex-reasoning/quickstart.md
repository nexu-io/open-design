# Validation quickstart

Use Node 24 and corepack pnpm 10.33.2; run pnpm install --frozen-lockfile first.

1. Run focused daemon reasoning/CLI/MCP and web picker tests listed in validation.md.
2. Run pnpm tools-dev run web --namespace reasoning-5402 --daemon-port 18456 --web-port 18573.
3. Open the model switcher: choose Codex, Sol, then max/ultra. Switch to GPT-5.5:
   unsupported reasoning becomes Default. Repeat in avatar and execution settings.
4. `od run start --project ID --agent codex --model gpt-5.6-sol --reasoning max
   --prompt-file prompt.txt --json` returns a run ID. Inspect its events/argv via the
   fixture acceptance harness; unsupported selections must never spawn the child.
5. Run pnpm guard and pnpm typecheck. Stop the namespace through tools-dev.
