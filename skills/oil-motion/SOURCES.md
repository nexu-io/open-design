# Source and adaptation

- Upstream: https://github.com/oil-oil/oil-motion/tree/07e31f2265f80caa8f2c1df825d85ac24a46307c
- Commit: `07e31f2265f80caa8f2c1df825d85ac24a46307c`
- License: MIT; see LICENSE.

## Open Design changes

- Preserved all local media processing scripts, controller assets and relevant reference guides.
- Replaced provider-specific generation and credential setup with host tools; excluded upstream image/video clients and credential UI.
- requirements.txt contains only local processing dependencies; no credential dependency.
- Adapted entrypoint, prompting and Alpha QA wording; normalized trailing whitespace.
- Demo media, README art, standalone service tests and credential configuration are not shipped.
- Replaced removed FFmpeg `-vsync 0` with output-scoped `-fps_mode passthrough` in frame extraction; requires FFmpeg with fps_mode support, as does the upstream compiler; verified with FFmpeg 9.0.1.
