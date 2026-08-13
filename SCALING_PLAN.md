# Scaling Plan

## 1. Code design system tokens
Reuse the existing manifest/loader path by treating token packages as plugins whose `entry_point` registers token transforms and exposes `design-system` permissions only when the plugin needs to read or emit design assets. No second manifest or loader is needed.

## 2. Plugins
Keep plugin content on the same loader path by organizing each new capability as a folder with `manifest.json`, an entry module, and a testable uninstall path. The loader remains the single registration mechanism.

## 3. Integrations
Represent external integrations as plugins that request the narrowest permissions needed for API access, filesystem staging, or UI surfaces. The same loader discovers and activates them; integration-specific behavior stays in the plugin module.

## 4. Automations
Model automations as plugins that register scheduled or event-driven actions through the existing host contract. They reuse the same manifest fields, permissions allowlist, and disable/uninstall behavior.

## 5. Background services
Bundle background services as plugins with `background-service` permissions and a module that starts and stops through `register(host)` / `unregister(host)`. The current loader and smoke-load path continue to govern lifecycle.

## 6. Templates / reusable workflows
Treat reusable workflows as plugins that contribute preconfigured actions or templates through the same folder layout and manifest schema. Their extension surface stays inside the existing loader so they can be enabled, disabled, and removed consistently.
