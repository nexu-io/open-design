# Proposal: Fix scroll performance, Docker image, and cssRules devtools error

**Status**: draft  
**Created**: 2026-06-11  
**SDD Change**: `fix-perf-docker-devtools`

## Problem Statement

Three independent issues are degrading the Open Design product experience:

### 1. Web scroll lag (performance)
Users report severe lag when scrolling through conversations in the web UI. The DOM grows unbounded as messages accumulate, with no virtualization below 80 messages — a threshold far too high for rich content (attachments, tool calls, code blocks, file previews). Even short conversations with 20-40 rich messages create hundreds of DOM nodes and become sluggish.

### 2. Docker image naming and tagging (CI/CD)
The GitHub Actions workflow (`docker-image.yml`) publishes images as `ghcr.io/<owner>/od` instead of `ghcr.io/<owner>/open-design`. Additionally, the `:latest` tag is only applied on version tags (`v*.*.*`), never on `main` pushes. The user wants a single image name (`open-design`) with `:latest` always pointing to the most recent `main` build.

### 3. cssRules null reference in devtools
The browser console shows `Uncaught TypeError: Cannot read properties of null (reading 'cssRules')` at `index.js:5239`. This originates from the palette bridge's `applyVarTint` function in `apps/web/src/runtime/srcdoc.ts`, which iterates `document.styleSheets` (a live collection). When a stylesheet is removed from the DOM during iteration (e.g., by React re-rendering), the corresponding entry in the live list becomes null, and the `sheet.cssRules` access throws before the existing try/catch can guard it.

## Scope

| Area | In scope | Out of scope |
|------|----------|--------------|
| Scroll perf | Lower virtualization threshold, add memoization to message rendering | Full React 19 migration, server-side rendering changes |
| Docker image | Fix image name to `open-design`, always tag `:latest` on main, keep multi-arch | Dockerfile base image changes, docker-compose changes |
| cssRules | Add null guard in `applyVarTint` | Full CSP policy redesign |

## Affected Files

- `apps/web/src/components/ChatPane.tsx` — virtualization threshold + memoization
- `apps/web/src/components/AssistantMessage.tsx` — potential memo/optimization targets
- `apps/web/src/runtime/srcdoc.ts` — null guard for `sheet.cssRules`
- `.github/workflows/docker-image.yml` — image name and tag scheme

## Risks

- **Virtualization threshold change**: Lowering too aggressively could cause layout jank during streaming when messages resize frequently. Use 20 as the new threshold (down from 80).
- **Docker tag change**: Changing the image name is a breaking change for anyone pulling `ghcr.io/<owner>/od`. Since this is an internal tool, the impact is minimal.
- **cssRules fix**: The fix is a one-line null guard — no regression risk.
