# P0 — 리브랜딩 (OD → Marketing AX) Implementation Plan (v2 — 실측 규모 반영)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans 또는 superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) 추적.
>
> **v2 개정 이유 (2026-06-22)**: v1은 규모를 ~50배 과소평가했다. 실측: `@open-design/` 스코프 **1037곳/512파일**(import 동반 필수 — tsconfig path alias 없음, 모듈 해석이 package `name` 기반), env `OD_` **distinct 202키 / `process.env.OD_*` 읽기 ~880곳**(중앙화 안 됨), `"Open Design"` 텍스트 **7157곳/386파일**. v1의 "const 1곳 + sweep" 전제는 거짓 → 컴파일·게이트 둘 다 실패. v2는 **카테고리 전역 치환**으로 재설계. 근거: `FORK-GUIDE.md §3`(v2 교정본).

**Goal:** OD 기능 식별자를 Marketing AX로 전역 치환하고 빌드·타입체크·가드가 그린.

**Architecture:** 카테고리 단위 repo-wide 치환. 카테고리끼리 같은 파일을 공유하므로 **치환은 순차**(병렬 sed = 동시 편집 충돌). 각 카테고리 = 앵커링된 perl 치환 → 카테고리 grep 0 → `pnpm typecheck`.

**Tech Stack:** pnpm 10.33.2 monorepo, TS 5.9/6.0, Node 24, esbuild, electron-builder.

---

## 결정 (이 플랜의 전제 — 변경 시 해당 줄만 교체)

- **[Q1 = A] 텍스트 범위**: 기능 식별자는 전역. `"Open Design"` 브랜드 텍스트는 **apps/web(18개 i18n 로케일 포함) + 앱 UI + 패키징 제품명**까지. **apps/landing-page 마케팅 사이트(4903곳) 제외**(별도 P 단계). `LICENSE`/`docs/*.md`/`CHANGELOG.md`/`*.md` 제외(Apache-2.0 attribution).
- **[Q2 = A] mocks/**: **건드리지 않음**. 익명 replay fixture 무결성 보존. sweep/게이트 제외.
- **마켓플레이스 repo/URL**: 자체 도메인 미정 → placeholder + env 오버라이드. (전면 비활성화는 P2.)

## 식별자 치환 매핑 (verbatim)

| 카테고리 | from | to | 앵커 주의 |
|---|---|---|---|
| 1 npm 스코프 | `@open-design/` | `@marketing-ax/` | `/` 포함 → URL 안 걸림 |
| 1 루트 name | `"name": "open-design"` | `"name": "marketing-ax"` | 루트 package.json만 |
| 2 env 접두사 | `OD_` | `MAX_` | **`\bOD_`** (word-boundary). `PROD_`/`METHOD_`/`PERIOD_` 오염 금지 |
| 3 appId | `io.open-design.desktop` | `io.marketing-ax.desktop` | 채널접미사 `.beta/.preview/.nightly` 유지 |
| 4 URL origin | `releases.open-design.ai` | `releases.marketing-ax.example`(placeholder) | env 오버라이드 가능 |
| 4 URL public | `open-design.ai` | placeholder 또는 P2 | |
| 4 marketplace repo | `nexu-io/open-design` | `marketing-ax/marketing-ax`(placeholder) | |
| 5 ipcBase | `/tmp/open-design/ipc` | `/tmp/marketing-ax/ipc` | |
| 5 windowsPipePrefix | `open-design` | `marketing-ax` | 값만(상수명 유지) |
| 5 세션 파티션 | `persist:open-design-design-browser` | `persist:marketing-ax-design-browser` | 2곳 |
| 6 스킴 | `od://` + `OD_SCHEME = "od"` | `max://` + `"max"` | 값만 |
| 6 host 글로벌 | `__od__` | `__max__` | |
| 7 데이터 디렉터리 | `.od` | `.max` | **앵커 필수**: `'.od'`/`"/.od"`/`.od/`/regex만. `.odd` 등 오염 금지 |
| 8 제품명 | `Open Design` | `Marketing AX` | **Q1 범위 한정** (landing-page/docs/mocks 제외) |

## Global Constraints

- **macOS = BSD sed → `\b` 미지원.** 모든 앵커 치환은 **`perl -pi -e`** 사용(PCRE `\b` 지원). `sed -i ''`는 단순 비앵커 치환에만.
- 치환 대상 파일 글롭: `*.ts *.tsx *.mts *.cts *.json *.mjs *.cjs *.css`, 디렉터리 `apps packages tools scripts e2e` + 루트 package.json. **제외**: `node_modules`, `**/dist`, `apps/landing-page`(Q1), `mocks/`(Q2), `*.md`, `LICENSE`.
- 각 카테고리 종료 시 **카테고리 grep 0**(허용 잔존 제외) + `pnpm typecheck` 그린. 전체 종료 시 `pnpm guard`.
- 라이선스(Apache-2.0): 루트 `LICENSE` 유지, 수정 파일 변경 표시 허용, "Open Design" **상표** 잔존 0(코드/UI). 문서 attribution 잔존은 의도적 허용.
- 기존 로컬 `.od/` 런타임 데이터는 무시(신규 `.max/` 생성).

## 잔존 검증 헬퍼 (재사용)

```bash
# /tmp/odsweep.sh — 카테고리 grep (제외 규칙 통일)
cd /Users/gyumin/Project/open-design
odgrep() { grep -rn "$1" --include="*.ts" --include="*.tsx" --include="*.mts" --include="*.cts" \
  --include="*.json" --include="*.mjs" --include="*.cjs" --include="*.css" \
  apps packages tools scripts e2e package.json 2>/dev/null \
  | grep -v node_modules | grep -v '/dist/' | grep -v 'apps/landing-page/' | grep -v '/mocks/'; }
```

---

## Task 1: npm 스코프 + 루트 패키지명 (전역)

**규모:** `@open-design/` 1037곳 / 512파일 (package.json name+deps + import 문 + 설정).

- [ ] **Step 1: 현황 확인** — `odgrep '@open-design/' | wc -l` (≈1037), `odgrep '@open-design/' | cut -d: -f1 | sort -u | wc -l` (≈512)
- [ ] **Step 2: 전역 치환**
```bash
odgrep '@open-design/' | cut -d: -f1 | sort -u | xargs perl -pi -e 's#\@open-design/#\@marketing-ax/#g'
```
- [ ] **Step 3: 루트 name** — `perl -pi -e 's/"name": "open-design"/"name": "marketing-ax"/' package.json`
- [ ] **Step 4: 잔존 0** — `odgrep '@open-design/'` 출력 없음, `grep -n '"name": "open-design"' package.json` 없음
- [ ] **Step 5: 재설치** — `pnpm install` (워크스페이스 링크 `@marketing-ax/*` 재해소)
- [ ] **Step 6: 타입체크** — `pnpm typecheck` PASS (import·deps 동반 치환됐으므로 해소)
- [ ] **Step 7: 커밋** — `git add -A && git commit -m "Rebrand npm scope @open-design/ -> @marketing-ax/ repo-wide — fork identity (P0 task1)"`

---

## Task 2: env 접두사 `OD_` → `MAX_` (전역, word-boundary)

**규모:** distinct 202키 / `process.env.OD_*` 읽기 ~880곳 + 정의 테이블. **중앙화 안 됨 — 전역 치환 필수.**

- [ ] **Step 1: 현황** — `odgrep '\bOD_' | wc -l`. 오염 후보 점검: `odgrep '\bOD_'` 결과에 `PROD_`/`METHOD_`/`PERIOD_` 같은 부분일치 없는지 육안 확인(없어야 함 — `\b` 앵커)
- [ ] **Step 2: 전역 치환 (perl `\b`)**
```bash
odgrep '\bOD_' | cut -d: -f1 | sort -u | xargs perl -pi -e 's/\bOD_/MAX_/g'
```
> 주의: `OD_MAX_DEVLOOP_ITERATIONS` → `MAX_MAX_DEVLOOP_ITERATIONS` 정상(리네임). 의도된 동작.
- [ ] **Step 3: 잔존 0** — `odgrep '\bOD_'` 없음
- [ ] **Step 4: 타입체크** — `pnpm typecheck` PASS
- [ ] **Step 5: 커밋** — `git add -A && git commit -m "Rebrand env prefix OD_ -> MAX_ repo-wide (P0 task2)"`

---

## Task 3: appId (패키징 번들 식별자)

**Files:** `tools/pack/src/mac/identity.ts:48-52`, `tools/pack/src/win/identity.ts`, `tools/pack/src/linux.ts:542`.

- [ ] **Step 1** — `odgrep 'io\.open-design'` (≈11곳) 위치 확인
- [ ] **Step 2: 치환** — `odgrep 'io\.open-design' | cut -d: -f1 | sort -u | xargs perl -pi -e 's/io\.open-design\.desktop/io.marketing-ax.desktop/g'` (채널접미사 자동 보존)
- [ ] **Step 3: 잔존 0 + typecheck** — `odgrep 'io\.open-design'` 없음, `pnpm typecheck` PASS
- [ ] **Step 4: 커밋** — `git commit -am "Rebrand appId io.open-design.desktop -> io.marketing-ax.desktop (P0 task3)"`

---

## Task 4: 하드코딩 URL / 마켓플레이스 (placeholder)

**Files:** `apps/desktop/src/main/updater.ts:81`, `apps/daemon/src/plugins/marketplaces.ts:76-80`, 그 외 `nexu-io/open-design` 참조처(`HandoffButton.tsx`, `amr-guidance.ts`, `EntryShell.tsx`, `PrivacyConsentModal.tsx`).

- [ ] **Step 1** — `odgrep 'releases\.open-design\.ai'`, `odgrep 'open-design\.ai'`, `odgrep 'nexu-io/open-design'` 위치 확인
- [ ] **Step 2: 치환**
```bash
odgrep 'releases\.open-design\.ai' | cut -d: -f1 | sort -u | xargs perl -pi -e 's#releases\.open-design\.ai#releases.marketing-ax.example#g'
odgrep 'nexu-io/open-design' | cut -d: -f1 | sort -u | xargs perl -pi -e 's#nexu-io/open-design#marketing-ax/marketing-ax#g'
odgrep 'open-design\.ai' | cut -d: -f1 | sort -u | xargs perl -pi -e 's#open-design\.ai#marketing-ax.example#g'
```
- [ ] **Step 3: 잔존 0 + typecheck** — 위 3패턴 grep 없음(placeholder만), `pnpm typecheck` PASS
- [ ] **Step 4: 커밋** — `git commit -am "Rebrand hardcoded release/marketplace URLs to placeholders (P0 task4)"`

---

## Task 5: ipc / 파이프 / 세션 파티션

**Files:** `packages/sidecar-proto/src/index.ts:64,67`, `apps/web/src/components/DesignBrowserPanel.tsx:229`, `apps/desktop/src/main/runtime.ts:245`.

- [ ] **Step 1: 치환**
```bash
odgrep '/tmp/open-design/ipc' | cut -d: -f1 | sort -u | xargs perl -pi -e 's#/tmp/open-design/ipc#/tmp/marketing-ax/ipc#g'
odgrep 'persist:open-design-design-browser' | cut -d: -f1 | sort -u | xargs perl -pi -e 's/persist:open-design-design-browser/persist:marketing-ax-design-browser/g'
# windowsPipePrefix 값 "open-design" (sidecar-proto:67) — 정확 라인 확인 후
perl -pi -e 's/windowsPipePrefix: "open-design"/windowsPipePrefix: "marketing-ax"/' packages/sidecar-proto/src/index.ts
```
- [ ] **Step 2: 잔존 0 + typecheck** — 위 패턴 grep 없음, `pnpm typecheck` PASS
- [ ] **Step 3: 커밋** — `git commit -am "Rebrand ipc base/pipe prefix/session partition (P0 task5)"`

---

## Task 6: 프로토콜 스킴 + host 글로벌

**Files:** `apps/packaged/src/protocol.ts:3-17,84`, `packages/host/src/index.ts:1`.

- [ ] **Step 1: 스킴** — `apps/packaged/src/protocol.ts:3` `OD_SCHEME = "od"` → `"max"` (상수명 유지, `OD_ENTRY_URL`/등록/핸들러 자동 전파). `perl -pi -e 's/(SCHEME = )"od"/$1"max"/' apps/packaged/src/protocol.ts`
- [ ] **Step 2: host 글로벌** — `odgrep '__od__' | cut -d: -f1 | sort -u | xargs perl -pi -e 's/__od__/__max__/g'` (값; `OPEN_DESIGN_HOST_GLOBAL` 상수명 유지)
- [ ] **Step 3: 잔존 `od://` 검증** — `odgrep 'od://'`·`odgrep '__od__'` 없음 (단 Task2에서 `MAX_`로 바뀐 env는 무관)
- [ ] **Step 4: typecheck** — `pnpm typecheck` PASS
- [ ] **Step 5: 커밋** — `git commit -am "Rebrand protocol scheme max:// + host global __max__ (P0 task6)"`

---

## Task 7: 데이터 디렉터리 `.od` → `.max` (앵커 치환)

**Files:** `apps/web/src/artifacts/validate.ts:41`(예약경로 regex), `scripts/guard.ts:50`(skip-list), 데몬 데이터루트 helper(`AGENTS.md` 데이터디렉터리 contract — `apps/daemon/src/server.ts` `RUNTIME_DATA_DIR` 해석부 / `db.ts`).

- [ ] **Step 1: `.od` 참조 전수** — `odgrep "[\"'./]\.od\b"` 로 데이터 디렉터리 참조만 추출(확장자 `.odd` 등 오염 없는 앵커). 결과 검토 후 치환 대상 확정
- [ ] **Step 2: 예약경로 regex** — `validate.ts:41` `\.od` → `\.max` (정규식 리터럴 내)
- [ ] **Step 3: guard skip** — `scripts/guard.ts:50` `".od"` → `".max"` (인접 `.od-e2e` 있으면 `.max-e2e` 동반)
- [ ] **Step 4: 데이터루트 helper** — Step1에서 찾은 `.od` 생성/해석 코드를 `.max`로 (데이터디렉터리 contract 준수 — `RUNTIME_DATA_DIR` 경유 유지)
- [ ] **Step 5: 잔존 0 + typecheck** — `odgrep "[\"'./]\.od\b"` 의도외 0, `pnpm typecheck` PASS
- [ ] **Step 6: 커밋** — `git commit -am "Rebrand data dir .od -> .max + reserved paths + guard skip (P0 task7)"`

---

## Task 8: 제품명 "Open Design" → "Marketing AX" (Q1 범위 한정)

**규모/위험:** `"Open Design"` 7157곳. **위험 계층 분리** — 테스트 단언/스냅샷이 옛 문자열에 의존하면 깨짐. 단계적으로.

- [ ] **Step 1: 패키징/UI 제품명 상수 (확실·안전)** — 먼저 1급 식별자만:
  - `packages/sidecar-proto/src/index.ts:70` `OPEN_DESIGN_PRODUCT_NAME` 값 → `"Marketing AX"` (상수명 유지 → Windows 레지스트리 키 자동 전파)
  - `tools/pack/src/mac/constants.ts:1`, `win/constants.ts:1` `PRODUCT_NAME` → `"Marketing AX"`, `tools/pack/src/linux.ts:37` 동일
  - `apps/web/app/layout.tsx:9` `title: 'Open Design'` → `'Marketing AX'`
  - typecheck PASS 확인 후 커밋
- [ ] **Step 2: 범위 산정** — `odgrep 'Open Design' | cut -d/ -f1-2 | sort | uniq -c | sort -rn` 로 분포 확인. (landing-page·mocks는 odgrep에서 이미 제외.) 남은 분포 = apps/web(i18n 포함), apps/daemon(프롬프트/주석), 패키징, e2e
- [ ] **Step 3: i18n 로케일 치환** — `apps/web/src/i18n/locales/*.ts` 의 사용자 노출 "Open Design" → "Marketing AX" (18개 로케일 동일 키). `odgrep 'Open Design' apps/web/src/i18n` 대상
- [ ] **Step 4: 앱 UI 문자열 치환** — `apps/web/src` 잔여(컴포넌트 표시 문자열). **주의**: 주석은 선택. 치환 후 `pnpm --filter @marketing-ax/web typecheck` + `pnpm --filter @marketing-ax/web test`
- [ ] **Step 5: 데몬 프롬프트/도메인 문자열** — `apps/daemon/src/prompts/*` 등 에이전트에 제품을 "Open Design"으로 소개하는 문자열 → 새 브랜드. `pnpm --filter @marketing-ax/daemon test`
- [ ] **Step 6: 테스트 단언 처리** — `odgrep 'Open Design'` 에 남은 e2e/단위 테스트의 단언/스냅샷: 제품명을 검증하는 것이면 새 값으로 갱신, fixture면 검토. **테스트 그린 유지가 게이트.**
- [ ] **Step 7: 잔존 검증** — `odgrep 'Open Design'` = 의도된 잔존(있다면 명시)만. `pnpm typecheck` PASS
- [ ] **Step 8: 커밋** — `git commit -am "Rebrand product name Open Design -> Marketing AX (app UI + i18n + packaging, P0 task8)"`

---

## Task 9: 전역 sweep + 가드 + 기동 (게이트)

- [ ] **Step 1: 기능식별자 sweep 0**
```bash
odgrep 'open-design|Open Design|\bOD_|__od__|od://|io\.open-design'
```
Expected: 0 (apps/landing-page·mocks·*.md 제외 — odgrep 규칙). 잔존 시 해당 카테고리 규칙 재적용.
> landing-page/docs/mocks의 "Open Design"은 의도적 잔존(Q1/Q2 + attribution).
- [ ] **Step 2: guard** — `pnpm guard` PASS (web import isolation, style policy)
- [ ] **Step 3: typecheck** — `pnpm typecheck` PASS
- [ ] **Step 4: 기동 검증** — `pnpm tools-dev run web` → 데몬+웹 기동, 데이터 디렉터리 `.max/` 생성, 스킴 `max://` 동작, HTML title "Marketing AX", 기존 기능(프로젝트 생성·디자인시스템 목록) 정상
- [ ] **Step 5: (선택) 패키징 스모크** — `pnpm tools-pack mac build` 로 appId/제품명 산출물 확인 (GUI 머신)
- [ ] **Step 6: 최종 커밋** — `git commit -am "Verify rebrand sweep + guard + dev boot green (P0 complete)"`

---

## 병렬화 메모

- 카테고리 치환은 **순차** (Task1→9). 같은 파일이 여러 카테고리 문자열을 보유 → 병렬 sed = 동시 편집 충돌.
- 병렬 가능: 각 Task **후** 검증/리뷰(읽기 전용)는 병렬. Task8 Step3~5(i18n/UI/daemon)는 디렉터리 분리되면 부분 병렬 가능하나 같은 파일 위험 있으면 순차.

## Self-Review 체크

- **규모 정합**: v1 과소평가(14파일) → v2 실측(스코프 512 / env 272 / 제품명 386 파일). FORK-GUIDE §3 v2 교정본과 일치. ✅
- **컴파일 보장**: Task1(import 동반)·Task2(env 880 읽기) 전역 치환으로 typecheck 그린 확보. ✅
- **게이트 정합**: T9 sweep 제외규칙(landing-page/mocks/*.md) = Q1/Q2 결정과 일치. surgical 모순 제거. ✅
- **앵커 안전**: env `\bOD_`(perl), 데이터디렉터리 `.od` 앵커 — 부분일치 오염 방지. BSD sed 회피(perl). ✅
- **placeholder**: 릴리스/마켓플레이스 도메인 미정 → placeholder + env 오버라이드 명시. ✅
- **위험**: Task8 테스트 단언 의존 — Step6에서 테스트 그린으로 흡수. ⚠️ 실행 중 재확인.
