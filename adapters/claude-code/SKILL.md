---
name: design
description: Open Design local-first AI design tool
model: sonnet
---

# /design — Open Design

Launch or connect to your local Open Design instance.

## Prerequisites

- Open Design installed at `/Applications/Open Design.app` (macOS)
- Or running via `pnpm tools-dev` in the repo

## Usage

1. Check if Open Design is running:
   ```bash
   curl -sf http://localhost:7457/api/health || echo "Not running"
   ```

2. If not running, start it:
   - **Desktop app**: Open "Open Design" from Launchpad
   - **Dev mode**: `cd <repo> && pnpm tools-dev run web`

3. Open in browser:
   ```bash
   open http://localhost:7457
   ```

## Ports

- Daemon: `7456` (default)
- Web UI: `7457` (default)
- Custom: `pnpm tools-dev run web --daemon-port <port> --web-port <port>`
