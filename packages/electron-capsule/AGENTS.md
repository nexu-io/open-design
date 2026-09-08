# Electron Capsule

Follow the root and packages/AGENTS.md guidance.

Own reusable, independently updatable loading and startup/session orchestration. Shell
composition supplies product appearance, media, resource bindings and handlers.
Do not own OS identity, trusted module loading, physical platform installation,
release/cache policy, or another Standalone/Sidecar authority.

The carrier owns permission to present: never create a window before the
interactive-only factory is invoked. Keep failed mounts exception-safe.
Consume the established carrier session and register cleanup before acquiring
runtime/window owners. Identity, platform verification, activation recording and
the quit barrier precede Capsule execution. Do not recreate them here or rely on
error-class identity across independently bundled carrier/Capsule modules.
Tests use the @/ source alias and live beside src under tests/.
