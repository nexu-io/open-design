# Electron Shell

The native macOS and Windows launcher for Open Design. It owns Electron-native
capabilities and launcher/update policy, then enters the independently built
`apps/standalone` Web + daemon closure through `@open-design/standalone-proto`.

Build and test the package directly:

```bash
pnpm --filter @open-design/shell-electron build
pnpm --filter @open-design/shell-electron test
pnpm --filter @open-design/shell-electron typecheck
```
