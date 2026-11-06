# Source and adaptation

- Upstream: https://github.com/alchaincyf/huashu-art-motion/tree/d861767d180008d27675819932070a670a3ae43f
- Commit: `d861767d180008d27675819932070a670a3ae43f`
- License: MIT; see LICENSE.

## Open Design changes

- Replaced the upstream orchestration entrypoint with a functional host adapter; removed model-tier routing, forced three-way selection, independent-agent review and standalone export requirements.
- Grouped all 35 numbered style cards, all nine grammar cards and 11 craft references into ASCII-named Markdown bundles; original card bodies are preserved as upstream reference, explicitly not local commands.
- Bundled seven generic Canvas library sources unchanged in canvas-helpers.md; added only the densify/resample/ribbon geometry subset of kit.js needed by brush.js, excluding character/RIG helpers.
- Excluded renderer, demo scenes, characters, media/voice providers, fonts and assets with separate terms. This is the craft/helper adapter, not the complete upstream film application.
