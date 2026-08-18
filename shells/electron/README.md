# Electron Shell

This workspace owns the Electron-specific adapter for the shell-neutral
`@open-design/standalone` runtime.

The preload layer intentionally registers only the workspace boundary. It has
no build, runtime, packaging, or release entrypoint until the Electron adapter
is reviewed and landed separately.
