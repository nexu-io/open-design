# Electron Capsule

Follow the root and packages/AGENTS.md guidance.

Own reusable, independently updatable loading/startup implementation. Shell
composition supplies product appearance, media, resource bindings and handlers.
Do not own OS identity, trusted module loading, physical platform installation,
release/cache policy, or another Standalone/Sidecar authority.

The carrier owns permission to present: never create a window before the
interactive-only factory is invoked. Keep failed mounts exception-safe.
Tests use the @/ source alias and live beside src under tests/.
