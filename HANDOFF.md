---
status: in_progress
position: P0 리브랜딩 v5 실행 중 — Task1~5 구현 완료(1~4 리뷰승인, 5 미리뷰). daemon 99-실패 triage 대기.
last_updated: 2026-06-25T11:30:00Z
---

# Blocking Constraints — 재개 시 먼저 읽고 자기말로 표명 후 진행
- [ ] CONSTRAINT: node@24 필수 — 모든 pnpm/node 앞 `export PATH="/opt/homebrew/opt/node@24/bin:$PATH"`. 시스템 node 충돌.
- [ ] CONSTRAINT: grep = `grep -rnE`(ERE) 강제 + grep에 PCRE 룩어헤드 `(?!…)` 절대 금지(BSD grep crash/무음). 보존 예외는 `| grep -vE "$PRESERVE"` 후필터. 룩어헤드는 perl만.
- [ ] CONSTRAINT: perl 치환 = shell-safe + regex-correct 둘 다 실코드 대조. `.od`는 `\.od`. 복잡앵커는 단일쿼트 heredoc.
- [ ] CONSTRAINT(신규/사고기반): **서브에이전트 git 규율** — 모든 구현자 디스패치에 `git checkout/switch/reset/rebase/pull/fetch/merge/stash/worktree/branch` 금지 + 커밋 전 `git rev-parse HEAD`로 기대 base 확인 + 커밋 후 `git rev-parse HEAD~1`로 부모 검증을 명시. (Task5 1차 실행이 옛 커밋 위에 작업해 브랜치 orphan 사고 발생 → 복구함.)

## 현재 상태
**브랜치 `feat/p0-rebrand`. HEAD = `55b97ee2b`(Task5). 체인 정상(부모검증 통과).**
- merge-base(최종 whole-branch 리뷰 BASE) = `bf7047292`.
- rebrand 시작점(bookkeeping) = `1f0009a7b`.
- **durable ledger = `.superpowers/sdd/rebrand/progress.md`** (gitignored, 모든 task 커밋 SHA 기록 — compaction/clear 후 이게 recovery map. git log와 대조).
- 활성 플랜 = `docs/superpowers/plans/2026-06-24-p0-rebranding-v5.md` (gitignored, 디스크영속, 직접 Read).
- task brief/global-constraints 추출본 = `.superpowers/sdd/task-N-brief.md`, `.superpowers/sdd/rebrand/global-constraints.md`.
- 스킬 스크립트: `~/.claude/plugins/cache/claude-plugins-official/superpowers/6.0.3/skills/subagent-driven-development/scripts/{task-brief,review-package}`.

## 완료 (이번 세션)
- **방법론**: subagent-driven-development 스킬. 구현자 sonnet → review-package → task-reviewer sonnet → fix loop. 메인 컨텍스트는 파일핸드오프(brief/report/diff)로 보존.
- **Task1**(`443f6d25c`): npm scope @open-design/→@marketing-ax/ + lock/nix. 리뷰 Approved. nix hash stale→CI 위임.
- **Task1 miss-class fix**(`aa2bd2e3c`): Task1이 `@open-design/`(슬래시) 패턴만 매칭해 놓친 2종 — (a) `path.join(root,"@open-design","web")` 분리인자(패키징 경로 깨짐) (b) `@open-design\/` regex 리터럴(guard/테스트핀). 실테스트 검증.
- **Task2**(`a730a7b2b`): env OD_→MAX_, OPEN_DESIGN_→MARKETING_AX_. collision MAX_CHAT_RUN 해소(namespace 분리). OD_MOCKS_/OD_LANDING_NOINDEX 보존. 리뷰 Approved.
- **Task3**(`8d07ea7da`): appId io.open-design→io.marketing-ax, 채널 4개 구분 보존. 리뷰 Approved.
- **Task4**(`30af8a2c3` + fix `70a0c8cbf`): URL/마켓→placeholder, 이메일 open-design.ai 보존. red-test(파생 파일명 단언) fix, web 3284 pass. 리뷰 Approved(fix후).
- **Task5**(`55b97ee2b`): ipc/pipe/session partition. 잔존0·typecheck0·sidecar-proto15·tools-pack194·daemon-IPC25 PASS. **부모검증 통과. 단 task-review 아직 안함.**

## 사고 + 복구 (이번 세션 — 반드시 인지)
Task5 1차 구현자(tool_uses:1 단일 거대 bash)가 커밋 `b693bf90d`를 **옛 pre-rebrand 커밋 `c54e49aae`(브랜치 base의 조상) 위에** 만들어 브랜치 포인터가 거기로 이동 → Task1~4 orphan. `git reset --hard 70a0c8cbf`로 복구(모든 커밋 reflog 안전). Task5 재실행해 정상 체인에 안착. 재발방지 = 위 CONSTRAINT(신규).

## 잔여 — 다음 세션 작업 (우선순위 순)
1. **[최우선] daemon 99-실패 triage.** Task5 구현자 보고: `pnpm --filter @marketing-ax/daemon test` 전체스위트 **99건 실패**, "prompt content / MAX_NODE_BIN" 유래. 진단: env rename은 정합(OD_NODE_BIN 잔존0, MAX_NODE_BIN 105, source+test 일치) → 원인은 **daemon prompt 스냅샷/스트링 테스트가 옛 문자열 단언**(rebrand이 prompt 소스 변경). per-task 리뷰가 타깃핀+typecheck만 돌려 누적 드리프트 미포착("baseline 대조" 갭).
   - 액션: (a) base `1f0009a7b`에서 daemon 스위트 돌려 **rebrand-induced 실패만 격리**(base에도 실패하면 pre-existing). (b) 대부분 테스트핀 갱신(env/문자열) — 플랜 Task9 코드게이트 소관이거나 owning task로 흡수. (c) 진짜 회귀 있으면 별도.
2. **Task5 task-review** (review-package `70a0c8cbf 55b97ee2b` → task-reviewer). 7파일 ipc/pipe/session 정합 확인.
3. **Task6~9 순차** (파일공유). Task6/7/8은 값+테스트핀 변경 → `pnpm --filter @marketing-ax/<pkg> test` 게이트 전진. 각 종료게이트(grep0 후필터 + typecheck + 테스트핀).
4. **Task10·11·12·12b·12c·14 병렬** (사용자 결정: **worktree 격리 병렬**). disjoint 디렉터리(.github/·nix/·deploy/·helm+charts·telemetry-worker·AGENTS). Task9 후 분기, 각 worktree 커밋 후 합류.
5. **Task13 최종 surface 게이트** (합류 후 단방향 검증).
6. **최종 whole-branch 리뷰** (review-package `bf7047292 HEAD`, 가장 강한 모델). ledger의 MINOR-CARRY 전달.
7. **finishing-a-development-branch** 스킬로 마무리(PR/merge 결정).

## ⚠️ 실행 중 사람판단 대기 (플랜 표기)
- Task7: 데이터루트 `RUNTIME_DATA_DIR` escape 판정(registry.ts:53 등) — AGENTS.md 데이터디렉터리 contract 엄격. 불명확 시 메인테이너(사용자) 확인.
- Task7: `.od-data` alias 결정.

## MINOR-CARRY (최종 triage 전달)
- `vercel.json:3` `OD_WEB_OUTPUT_MODE` 루트라 어느 태스크 스코프도 아님 — code가 MAX_로 읽으면 바인딩 깨질 잠재 갭. final서 config↔code env 정합 확인.
- Task2 report "dist 커밋" 표현 부정확(무해, dist gitignored).

## Uncommitted
```
(없음 — 워킹트리 clean. .superpowers/** 는 gitignored 스크래치, 커밋 안함.)
# main 대비: feat/p0-rebrand 미푸시. .gitignore 무관 gstack 변경은 복구 과정서 사라짐(무해, gstack 재생성).
```

## Next Action
1. `/resume-work` → Blocking Constraints 4건 자기말로 표명(특히 신규 git 규율).
2. `git rev-parse HEAD` = `55b97ee2b` 확인. ledger Read.
3. daemon 99-실패 triage부터 (잔여 #1). base 대조로 rebrand-induced 격리.
4. Task5 review → Task6~9 순차 → 10~14 worktree 병렬 → Task13 → 최종리뷰.
