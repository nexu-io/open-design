# Plugin Architecture Builder Demo

Permissions requested: none.

Settings: none.

This demo plugin registers a small text transformation feature. Its `run()` method trims input and prefixes it with `demo:` so the loader test can prove load, use, disable, re-enable, and uninstall behavior without touching repo state.
