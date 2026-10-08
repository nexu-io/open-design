# Model picker fork

This fork adds explicit Claude model versions and model-specific reasoning effort
to the Local CLI settings and the chat model picker. Haiku 5.5, Sonnet 5.5,
Opus 5.5, and Fable 5.1 offer Low, Medium, High, Extra high, and Max. CLI default
omits `--effort`, preserving Claude Code's own settings. Legacy models hide
unsupported effort controls. CLI aliases and custom model IDs remain available.

Claude Code must support the selected model and `--effort`; Haiku 5.5 requires
Claude Code 2.1.293 or newer. Open Design forwards the model ID and effort to
Claude Code, which handles account and provider availability. The authoritative
capability reference is [Claude Code model configuration](https://code.claude.com/docs/en/model-config).

![Local CLI settings with Haiku 5.5 and Medium effort](screenshots/model-picker/settings.png)

![The chat model picker with model-specific reasoning](screenshots/model-picker/chat.png)

The command-line entry point supports the same selection:

```sh
od run start --project <project-id> --agent claude \
  --model claude-haiku-5-5 --reasoning medium
```

## Build a separate macOS app

Use Node 24 and the repository's pinned pnpm version:

```sh
pnpm --filter @open-design/tools-pack build
OD_UPDATE_ENABLED=0 pnpm tools-pack mac build \
  --namespace model-picker --app-version 0.24.1-fork.1 --to dmg
pnpm tools-pack mac install --namespace model-picker --app-version 0.24.1-fork.1
pnpm tools-pack mac start --namespace model-picker --app-version 0.24.1-fork.1
```

The fork version produces a separate `Open Design Fork.app`. Lifecycle commands
must use the same namespace and app version as the build. The build
bakes the updater opt-out into the app so normal Finder launches preserve the
fork. Ordinary builds retain the existing updater behavior, and an explicit
launcher environment value can override the baked policy.

Packaged daemon storage follows the [Daemon data directory contract](../AGENTS.md#daemon-data-directory-contract).
Packaged logs and Electron settings follow the existing namespace isolation in
[tools/pack](../tools/pack/README.md). The official app is not replaced.
