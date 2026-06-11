# Tasks: Fix scroll performance, Docker image, and cssRules devtools error

**SDD Change**: `fix-perf-docker-devtools`  
**Depends on**: [proposal.md](./proposal.md) ✅ → [spec.md](./spec.md) ✅  
**Status**: ✅ All tasks complete

---

## Implementation tasks

### T-1: Lower virtualization threshold ✅
- [x] `CHAT_MESSAGE_VIRTUALIZE_THRESHOLD` changed from `80` to `20` (line 608).
- [x] Virtualization condition at line 2289 uses this constant — activates at 20+ messages.

**Files**: `apps/web/src/components/ChatPane.tsx`  
**Applied**: 1 line changed

---

### T-2: Add React.memo to AssistantMessage ✅ ALREADY DONE
- [x] `AssistantMessage` is already wrapped in `memo(AssistantMessageImpl, areAssistantMessagePropsEqual)` with a custom comparator.

**Files**: none  
**Applied**: 0 lines (pre-existing)

---

### T-3: Fix Docker image name and tag scheme ✅
- [x] Image name changed from `ghcr.io/<owner>/od` to `ghcr.io/<owner>/open-design`.
- [x] `:latest` tag now published on every `main` push AND version tags.
- [x] `:edge` tag removed (replaced by `:latest` on main).
- [x] `:sha-<short>` tags preserved.
- [x] Multi-platform build preserved.
- [x] PR smoke-builds preserved.

**Files**: `.github/workflows/docker-image.yml`  
**Applied**: 13 lines changed

---

### T-4: Fix cssRules null reference ✅
- [x] Added `if (!sheet) continue;` null guard in `applyVarTint` before accessing `sheet.cssRules`.
- [x] Existing `try/catch` preserved for cross-origin stylesheet errors.
- [x] Fixed biome auto-format regression: restored `/\s+/g` regex as `[\t\n\r ]+` equivalent.

**Files**: `apps/web/src/runtime/srcdoc.ts`  
**Applied**: 3 lines changed

---

### T-5: Validate ✅
- [x] `pnpm guard` — 40/40 pass
- [x] `apps/web` typecheck — clean
- [x] `apps/daemon` typecheck — clean (tsc directly; pnpm resolution issue is pre-existing)
- [x] `apps/web` srcdoc tests — 31/31 pass (srcdoc + palette)
- [x] Biome formatting regressions identified and fixed (regex backslash)

---

## Summary

| Task | Files | Lines | Status |
|------|-------|-------|--------|
| T-1: Lower threshold | `ChatPane.tsx` | 1 | ✅ |
| T-2: React.memo | none | 0 | ✅ (pre-existing) |
| T-3: Docker image | `docker-image.yml` | 13 | ✅ |
| T-4: cssRules fix | `srcdoc.ts` | 3 | ✅ |
| T-5: Validate | — | 0 | ✅ |
| **Total** | **3 files** | **17** | ✅ |

**Review workload**: 17 lines changed — well within the 600-line budget. Single PR is appropriate.
