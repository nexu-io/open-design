# shells/electron

Follow the root `AGENTS.md` first.

This workspace is the Electron-specific Shell boundary. Keep product lifecycle,
Closure storage/update policy, and generic sidecar orchestration in their
shell-neutral packages. Code added here may adapt those contracts to Electron;
it must not create a second interpretation of them.

Until an implementation PR lands, this directory is intentionally inert: do
not add build, runtime, packaging, or release entrypoints to the preload branch.
