# Spec: Fix scroll performance, Docker image, and cssRules devtools error

**SDD Change**: `fix-perf-docker-devtools`  
**Depends on**: [proposal.md](./proposal.md) ✅  
**Status**: draft

---

## SC-1: Scroll performance — lower virtualization threshold

### Acceptance criteria
- **SC-1.1** `CHAT_MESSAGE_VIRTUALIZE_THRESHOLD` lowered from 80 to 20.
- **SC-1.2** Conversations with 20+ messages use the existing `useMeasuredVirtualWindow` virtualizer.
- **SC-1.3** Conversations with fewer than 20 messages continue to render all items inline (no virtualizer overhead for tiny chats).
- **SC-1.4** Scroll position is preserved when virtualization activates (no jump) — the existing `scrollRestoreKey` mechanism must continue working.
- **SC-1.5** Streaming messages (real-time token-by-token) correctly update measured heights via `ResizeObserver` in `VirtualChatRow`.
- **SC-1.6** `AssistantMessage` receives `React.memo` with a shallow comparison on its props to avoid re-rendering unchanged messages during scroll.

### Verification
```bash
cd apps/web && npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)"
```

---

## SC-2: Docker image naming and tagging

### Acceptance criteria
- **SC-2.1** Image is published as `ghcr.io/<owner>/open-design` (was `ghcr.io/<owner>/od`).
- **SC-2.2** Every push to `main` publishes `:latest` tag (was only on version tags `v*.*.*`).
- **SC-2.3** `:sha-<short>` tags continue to be published on every push for traceability.
- **SC-2.4** Multi-platform build (`linux/amd64,linux/arm64`) is preserved.
- **SC-2.5** PR builds still smoke-test without pushing.

### Verification
Manual: inspect the workflow YAML. No automated test applicable.

---

## SC-3: cssRules null reference

### Acceptance criteria
- **SC-3.1** `applyVarTint` in `apps/web/src/runtime/srcdoc.ts` adds a null guard on `sheet` before accessing `.cssRules`: `if (!sheet) continue;`
- **SC-3.2** The existing `try/catch` is preserved as a defense-in-depth measure for cross-origin stylesheet access (which throws `SecurityError`, not `TypeError`).
- **SC-3.3** The palette bridge (color re-skinning) continues to work correctly after the fix — CSS variable tints and element-level color shifts are applied without regression.

### Verification
```bash
cd apps/web && npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|Tests:)"
```

---

## Non-functional requirements

- **NFR-1** No new dependencies added.
- **NFR-2** No breaking changes to the Docker consumer contract beyond the intentional image name change.
- **NFR-3** TypeScript typecheck passes: `cd apps/web && npm run typecheck`.
- **NFR-4** Repository guard passes: `pnpm guard`.
