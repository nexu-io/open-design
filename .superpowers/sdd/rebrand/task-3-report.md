## Task 3 Report: appId Rebrand

### Summary
`io.open-design.desktop` → `io.marketing-ax.desktop` 치환 완료.

### Files Changed
- `tools/pack/src/mac/identity.ts` — appIdForChannel() 4줄 + fallback 1줄 (총 5줄)
- `tools/pack/src/win/builder.ts:161` — builderConfig.appId
- `tools/pack/src/linux.ts:542` — builderConfig.appId
- `tools/pack/tests/mac-identity.test.ts` — 테스트 핀 4줄

### Residual Grep Gate (ERE)
```
grep -rnE 'io\.open-design' ...  →  0건 (GREEN)
```

### typecheck Gate
```
pnpm typecheck  →  전 패키지 PASS, 에러 0건
```

### Test Gate
```
pnpm vitest run tests/mac-identity.test.ts  →  4/4 PASS (GREEN)

pnpm --filter @marketing-ax/tools-pack test 전체:
  - mac-identity.test.ts: 4 PASS
  - internal-packages-coverage.test.ts: 3 FAIL (PRE-EXISTING — Task 1 npm scope rename 시 정규식 '@open-design/' 미업데이트, 베이스라인 동일 실패)
```

### Channel-Distinct Identity Preservation Proof
| Channel | Before | After |
|---------|--------|-------|
| stable  | `io.open-design.desktop` | `io.marketing-ax.desktop` |
| beta    | `io.open-design.desktop.beta` | `io.marketing-ax.desktop.beta` |
| nightly | `io.open-design.desktop.nightly` | `io.marketing-ax.desktop.nightly` |
| preview | `io.open-design.desktop.preview` | `io.marketing-ax.desktop.preview` |

suffix(.beta/.nightly/.preview) 모두 정확히 보존됨. DMG bundle/uninstall registry key 구분 유지.

### Commit
- SHA: `8d07ea7da`
- Subject: `Rebrand appId (P0 task3)`

### Self-Review
- ERE grep 사용, 룩어헤드 없음 — 규칙 준수
- perl -pi 단순 치환 (복잡 앵커 없음, 직접 명령줄 사용 적정)
- 채널 suffix 구분 확인 완료
- AGENTS.md 채널 구분 정책(stable/beta/preview 별도 identity) 준수

### Concerns
- `internal-packages-coverage.test.ts` 3개 실패 = Task 1 pre-existing. 테스트 내 `loadInternalPackageNames`가 `@open-design/` 문자열을 grep하는데, Task 1에서 실제 소스는 `@marketing-ax/`로 바뀌었으나 테스트 정규식은 미업데이트 상태. Task 3 범위 밖이나 별도 픽스 필요.

---

## Task1 miss-class fix

### Files Changed

**Miss-class A — path segment `"@open-design"` → `"@marketing-ax"`:**
- `tools/pack/resources/web-standalone-after-pack.cjs` lines 784, 835, 848
- `tools/pack/src/mac/report.ts` lines 87, 88, 89
- `tools/pack/src/win/report.ts` line 73
- `tools/pack/src/linux.ts` line 1341 (`@open-design/packaged` → `@marketing-ax/packaged`)
- `tools/pack/tests/web-standalone-after-pack.test.ts` line 44

**Miss-class B — escaped-slash regex literals `@open-design\/` → `@marketing-ax\/`:**
- `scripts/check-cross-app-imports.ts:48` — `/^@open-design\/desktop\/main$/` guard
- `tools/dev/tests/diagnostics.test.ts` lines 27, 97 — both `assert.match` regex pins
- `tools/pack/tests/internal-packages-coverage.test.ts:25` — `matchAll` scan regex

**closure.test.ts:67 — purely cosmetic test description string.** Updated for consistency (`@open-design deps` → `@marketing-ax deps`); zero impact on matching logic.

### Source/Test Consistency Findings
`tools/dev/src/diagnostics.ts` already emits `@marketing-ax/daemon` in all three recommendation strings (lines 47, 67, 74) — Task 1 had already updated the source. The test regex pins in `diagnostics.test.ts` (lines 27, 97) were the only stale side. Fixed: test regex now matches what the source emits.

### Verification Outputs

**`pnpm --filter @marketing-ax/tools-pack test`:** 29 test files passed, 194 tests passed (2 skipped) — GREEN

**`pnpm --filter @marketing-ax/tools-dev test`:** 28 tests passed, 0 failed — GREEN

**`pnpm guard`:** 63 tests passed, 0 failed (includes check-cross-app-imports) — GREEN

**Residual grep (slash-blind):**
```
grep -rnE '@open-design' apps packages tools scripts e2e | grep -vE '/node_modules/|/dist/|/\.claude/worktrees/|\.md:|/landing-page/|open-design\.ai'
→ 0 lines (GREEN)
```

**`pnpm typecheck`:** all packages PASS, 0 errors — GREEN
