# Decisions Log

## 2026-06-26 — P1 (startChatRun 정리) = `shouldRunReview()` 명명 헬퍼 (SDD+TDD, 정찰 선행)
- 정찰(p1-recon 워크플로 5에이전트): P1 구조적 의도는 **상류 머지로 이미 ~90% 충족**. prompt-builder closure = `composeDaemonSystemPrompt`(명명 async, server.ts:7561)로 상류 `3fb849d04`(2026-04-30)서 추출 — 스펙(6/22)보다 앞섬. lockstep 3곳은 `critiqueShouldRun` 단일소스로 이미 수렴(상류 Critique Theater Phase 5 `bb2015766a` 2026-05-07). 스펙 line번호(7925/7984/9995)·"shouldRunReview()"는 stale/개념명칭 (출처: git blame + 5병렬 정찰)
- 사용자 결정(AskUserQuestion) = **잔여만 구현**(close-as-done도 god-function 공략도 아님). 잔여 = 인라인 5항 eligibility를 순수 명명 헬퍼로 추출(스펙 문구 "명명 헬퍼/단일 수렴" 선언적 충족)
- 구현: `critique/rollout.ts`에 `shouldRunReview(ReviewRunEligibility)` 순수함수(`isCritiqueEnabled` 옆 co-locate, 불변식 docblock=composer↔orchestrator 동일결정 보장) + server.ts:7927 인라인→호출 치환. 소비 3곳(:8017/:8041/:9997) 무변경. 동작 100% 보존
- 테스트 결정: 32케이스 truth table(`shouldRunReview === legacy 5항 &&`)로 predicate 완전 잠금. **route-level positive e2e는 제거** — 테스트 데이터 env가 'default' DS brand(registryBody) 미해석 → fixture 취약·마진 낮음. lockstep은 T1(truth table)+critique-composer(composer 게이트)+opt-out(route 억제)+spawn-wiring(orchestrator skip)로 잠김 (출처: brand 미해석 진단)
- 검증(p1-verify 워크플로 3병렬): guard 63/63 · typecheck exit0 · critique 255pass/0fail · chat-route 유일실패=기존 OPENCODE_CONFIG(clean main서도 실패=회귀아님, baseline diff 확인) · 적대적 동작-등가 divergence 0. all_pass
- startChatRun 2921줄 god-function 분해 = **P1 범위 밖**(추출=인터페이스 발명 위험·회귀 리스크 高, 중복로직 없음). 별도 결정 (출처: startchatrun-godfunc 정찰)

## 2026-06-26 — 리브랜드 후속 #1: stale 문서 참조 (SDD 3-병렬, doc-only)
- 발견: P0가 패키지를 `@marketing-ax/*`로 리네임했으나 문서가 옛 `@open-design/*` 가리켜 `pnpm --filter @open-design/web` 류 300+ 명령이 **실제 깨짐**(0매칭). 활성 가이드 correctness 버그 = 우선순위 1.
- 스왑 맵 = on-disk `@marketing-ax/X` 존재하는 22 suffix만(`web,daemon,contracts,plugin-runtime,agui-adapter,desktop,sidecar,sidecar-proto,platform,tools-dev,tools-pack,tools-serve,packaged,host,components,metatool,telemetry-worker,registry-protocol,e2e,diagnostics,download,launcher-proto`). 카운터파트 없는 `@open-design/landing-page`(defer)·`tools-pr`/`cli`/`shared`/`nextjs`(제거/historical) = 자동 보존
- 디렉터리 disjoint 3 worktree 병렬(install 불필요=doc-only): G1 루트공개문서(13파일 39pkg+110prose)·G2 docs/(74파일 112pkg+815prose)·G3 모듈AGENTS+README(13파일 54pkg+19prose). 메인스레드 git 전담
- 보존 결정: ①`nexu-io/open-design` repo slug = OSS 귀속(P0 계승) ②upstream 귀속/트레이드마크 prose(FORK-GUIDE Apache "Open Design"·CHANGELOG 역사 rename·ARCHITECTURE 분석대상) = 에이전트 판단으로 보존+플래그 ③`od://`·`open-design.ai`·kebab identifier 불변
- **아카이브 defer**: `docs/superpowers/plans|specs/`(4파일, p0-rebranding-v5.md 등 SDD 세션기록)·`specs/`·`docs/handoffs/` = 과거작업 기록이라 `@open-design` 참조가 문서화된 "before"측 → 스왑 시 기록 왜곡. handoffs 제외 정신대로 보류. 활성 가이드는 전부 clean
- 검증: 활성 가이드 broken-ref **0** · `pnpm --filter @marketing-ax/web exec` **실작동 확인**(깨진 명령 복구 증명) · guard 63/63 · 순수 swap 1043/1043
- 잔여 follow-up: bare `OD` 약어("Marketing AX (OD)")·non-md brand(docs/assets/_cover/*.html·docs/schemas/open-design.*.json)·design-templates README prose

## 2026-06-23 — BRAZE-BODOC-CATALOG.md 작성 (보닥 실 Braze 데이터)
- 사용자 제공 xlsx 2종 파싱 → `BRAZE-BODOC-CATALOG.md`: 128 커스텀 이벤트(+프로퍼티/타입/발생시점), 122 유저 어트리뷰트(타입/목적/수집시점), 13 화면 딥링크(`bodoc://action/<Route>?param`) (출처: /Users/gyumin/Project/braze-iam/data/braze_iam.xlsx + 화면별 딥링크.xlsx)
- 용도: 마케팅 두뇌 디스커버리 질문폼 트리거 이벤트 선택지 + 세그먼트/Liquid 개인화 어트리뷰트 + IAM CTA 딥링크 craft 룰. BRAZE-DOMAIN §5.2(SDK 커스텀이벤트=IAM 트리거)·§2.3(딥링크)와 연결
- ⚠️ bodoc 실데이터(PII/내부값 가능) — 외부공유 주의. 예시값(PII)은 카탈로그에서 제외. bodoc=타당성 레퍼런스, 코드출처 아님

## 2026-06-23 — Braze 통합 모델 전환 (2차 리서치 결정타)
- **발견(3-0 검증)**: Braze REST에 인라인 `in_app_message` 객체 스키마 없음. `/messages/send` 지원채널 = push/email/content_card/web_push/sms/whatsapp/webhook (IAM 아님). IAM 콘텐츠는 **대시보드 작성**, REST로 IAM JSON POST 불가. IAM은 **API로 트리거도 불가** — 클라이언트 SDK가 커스텀이벤트로 발화 (출처: deep-research w9a4fkvmm)
- **폐기**: 1차 §11/§1.5/§2.1 가정 `braze_iam_v1` JSON → `braze_messages` 테이블 → REST POST. **불가능 → 데이터모델 변경**
- **신모델**: M-AX 산출물 = **Custom HTML IAM = HTML 아티팩트**(OD HTML→iframe 렌더러 재사용) + 이미지 IAM = 이미지+카피. 여느 OD 아티팩트로 저장. "Braze-ready" = brazeBridge·logClick·이미지스펙 충족. 전달 = **대시보드 붙여넣기/HTML-upload 수동 핸드오프**
- `braze-client.ts`(REST) = 보조, push/email/content_card/canvas-trigger·schedule용 (IAM 전송 아님). Content Card = REST 주소지정 가능한 유일 인앱 표면
- ~~OPEN~~ RESOLVED 2026-06-23 — **경로 1 확정**: Custom HTML IAM 아티팩트 생성 + 대시보드 핸드오프(붙여넣기/HTML-upload). Braze 실모델 정합·bodoc 워크플로우 일치·구현 최소·API키 불필요. 경로2(REST 발송)는 braze-client.ts로 나중 옵션 보류, 경로3(Content Card)은 미래 (출처: 사용자 "경로 1로")
  - 데이터모델: `braze_messages` = HTML 아티팩트 메타+핸드오프 상태(brand_id, output_mode, artifact_path, delivery_channel, status). `braze_iam_v1` = Custom HTML 아티팩트(html_template_v1 + brazeBridge/logClick/이미지 craft). braze-client REST = MVP 미구현

## 2026-06-23 — 아키텍처 A(단일 마케팅 두뇌) 재확인 + "디자인" 2의미 구분
- **A 확정 재확인**: M-AX = OD 디자인 두뇌를 마케팅으로 in-place 교체(fork). 두뇌 1개. engine/brain 물리분리·BrainProvider DI 폐기 유지 (출처: 사용자 "A로 진행")
- **핵심 구분 (재논의 방지)**: "디자인"이 2의미 — ① 크래프트(레이아웃·색·타이포 = 시각 활동) vs ② OD 제품 두뇌(산출물 자체가 디자인시스템·UI·덱). BrainProvider 2번째 두뇌가 필요한 건 ②뿐
- **Braze IAM·인스타 카드뉴스의 시각작업 = ①(크래프트)** → 단일 마케팅 두뇌가 흡수. 토대 자산(design-systems.ts 브랜드토큰·craft/·design-templates/·HTML→iframe 렌더러)은 유지·재사용. 교체되는 건 출력모드+프롬프트+검수역할(panel.ts)만
- **B(멀티 두뇌)는 ②를 M-AX에서 산출물로 팔 때만** 재검토. 그 전엔 YAGNI. B 비용: BrainProvider 추출 선불(startChatRun 수술) + 듀얼 영구 유지보수 (출처: 사용자와 A/B trade-off 논의)

## 2026-06-23 — BRAZE-DOMAIN.md 작성 (Braze 도메인 리서치 완료)
- §11 스텁 → `BRAZE-DOMAIN.md`로 채움. deep-research 스킬(107 에이전트, 24 primary 소스 braze.com/docs, 25 claim 3표 적대검증·0 kill) (출처: deep-research wgakw3814)
- 검증됨(§1~§4): IAM 6유형, 이미지 PNG/JPEG/GIF·≤5MB·종횡비, CTA ≤2, brazeBridge(appboyBridge deprecated)·allowUserSuppliedJavascript 게이트·logClick 매핑, 인스턴스별 REST·Bearer·send/schedule·Content Block CRUD, 트리거 페이로드
- **미검증 4건 fabricate 안 함**(BRAZE-DOMAIN §6): /messages/send 인라인 IAM 스키마, 세그먼트/트리거 상세, slideup 글자제약, HTML/CSS 샌니타이징 → 2차 리서치 대상
- 인스턴스 엔드포인트 하드코딩 금지(대시보드 복사가 Braze 권장), SDK 버전 floor·deprecation 시점민감 (출처: BRAZE-DOMAIN §3.1/caveats)

## 2026-06-23 — ARCHITECTURE-BRAZE.md 작성
- ARCHITECTURE-BRAZE.md 별도 파일 작성: 기존 ARCHITECTURE.md(438줄 일반 레퍼런스) 보존, Braze 포크 관점 12섹션(624줄)으로 작성 (출처: HANDOFF ARCHITECTURE-BRAZE.md 작성 완료)
- 테스트 커버리지 주장은 단일 탐색 에이전트 신뢰 금지 — 파일명 grep 재검증 필수. 1차 "db/media/chat-routes/project-routes 무테스트" 오판, 실제 공백은 copilot-stream.ts뿐 (출처: HANDOFF)
- Braze 도메인 API(IAM 유형·REST·JSON 스키마)는 fabricate 금지 — 외부 리서치 스텁(§11)으로 flag, BRAZE-DOMAIN.md 후속 (출처: HANDOFF)
- ~~OPEN~~ RESOLVED 2026-06-23 — Braze 스코프 = **(a) 전체 Marketing AX**: Braze IAM = 5산출물 중 1, 검수 파이프라인 유지. 기존 포크 문서 전제 유효 (출처: 사용자 확정)

## 2026-06-23 — M-AX 방향 확정 (bodoc 정찰 후)
- bodoc-iam-builder 정찰 결론: OD 위 in-place 튜닝(83커밋)으로 작동하는 IAM 전용기. 식별자치환 0·engine/brain split 0·2번째spawn 0 → 헤비 추상화 없이 출시 가능 입증. **단 "껍데기 리브랜드" 수준이라 코드 출처로 안 씀, 타당성 레퍼런스로만** (출처: 사용자 지시 "bodoc 커밋 무관하게 M-AX 구축")
- M-AX = bodoc의 일반화 방향(IAM 1종 → 5산출물 × N브랜드)이나, OD에서 독립 구축
- **결정1 아키텍처 = 단일 마케팅 제품**: 두뇌 1개(브랜드 N개는 데이터). engine/brain 물리분리·BrainProvider DI **폐기**(YAGNI, 두 번째 버티컬 나올 때). P1은 `startChatRun` god-function + lockstep 3곳 → `shouldRunReview()` 수렴 **리팩터만**
- **결정2 리브랜딩 = 전체 식별자**: 스코프/OD_/od:///.od/__od__/appId/PRODUCT_NAME + 자체 updater·도메인. bodoc 가시-only 넘어 독립 제품 정체성. P0 플랜 v2 유효
- **결정3 검수 = 기존 파이프라인 엔진 위 커스텀 UI 먼저**, 2번째 spawn 보류(품질부족 입증 시)
- **결정4 UI = bodoc UX 패턴 추종**(홈 칩 진입, 인터뷰 폼 구동, 카드 컨텍스트메뉴·삭제 UX, 모달 backdrop). 비주얼 정체성은 M-AX 고유(bodoc cyan/보닥명 아님)
- **결정5 디자인 배심원 제거**: OD critique-theater 5인 심사위원(`panel.ts` 롤플레이, `critique/orchestrator.ts`, `scoreboard.ts`, Theater UI, `critique.*` SSE) + bodoc 수동 "디자인 리뷰하기" 단일버튼 둘 다 제거. 검수 파이프라인 엔진(`pipeline.ts`/`until.ts`/`atoms/registry.ts`)은 유지하고 그 위에 M-AX 자체 검수 재구축
- **OPEN — P3 검수 실행 주체 미정**: 디자인 배심원이 OD 유일 실 worker였음. 제거 + 2번째spawn 보류 → 검수를 실제 실행할 메커니즘(메인 에이전트 self-review 단계 / 경량 atom worker)은 P3 설계에서 결정

## 2026-06-22
- P0 리브랜딩 플랜 전면 재작성(v1 수정 아님): v1이 규모·전략·게이트 3가지 모두 틀림(스코프 1037곳/512파일, env 880곳 산재, "Open Design" 7157곳 — surgical const 전제 거짓) (출처: HANDOFF P0 리브랜딩 — 플랜 v2 재작성 완료)
- scope/env 치환은 repo-wide 카테고리 단위, 순차 실행: tsconfig alias 없어 import 동반 필수, 같은 파일 다중 카테고리라 병렬 sed 충돌 (출처: HANDOFF P0 리브랜딩)
- Q1 텍스트 범위 = A(landing-page 제외), Q2 mocks = A(제외) — 잠정 디폴트, 미확정: P0=동작하는 제품앱 우선, fixture 무결성 (출처: HANDOFF P0 리브랜딩)
- fork-분석 문서 3종 코드 대조 검증: ARCHITECTURE/ENGINE-BRAIN은 신뢰가능(라인드리프트만), FORK-GUIDE §3 env/scope 규모만 오류 → 교정. AGENTS.md better-sqlite3 11→12 stale 수정 (출처: HANDOFF P0 리브랜딩)

## 2026-06-23 — 작업 디렉토리 구조 재편 (원본 분리)
- `~/Project/open-design` = M-AX 작업본 유지(uncommitted Braze 문서·브랜치 intact), `~/Project/open-design-original` = clean main 클론(순정 OD 레퍼런스). `git clone --local`(하드링크, 추가 디스크 ~워킹트리만) (출처: 사용자 지시 "기존 od original 폴더 이동·클론")
- **워크트리 불요 확정**: 작업본↔원본 분리가 이미 격리. M-AX=단일 브랜치 순차 빌드라 병렬 스트림 없음. 코드 착수 시 main 기준 새 피처 브랜치(`marketing-ax/braze-iam` 등)만 분리 (출처: 사용자 Q "워크트리 분리 안 해도 되나")
- 작업본 node_modules 원래 미설치 상태였음(클론 무관) → 빌드 전 `pnpm install` 필요. 2026-06-23 install 완료

## 2026-06-23 — Braze IAM 제작 플로우 확정 (5단계 상태머신)
- 플로우 = 요청→인터뷰→기획안(draft)→[컨펌 게이트]→제작→수정루프→완료. 컨펌 시 저장+제작 / 반려 시 기획안 재작성 (출처: 사용자 명세)
- 매핑: `braze_messages.status` = interviewing→plan_draft→plan_confirmed→producing→produced→editing→done. 반려=plan_draft 회귀+사유 누적. 인터뷰·컨펌 = `<question-form>` 재사용(별도 tool 배선 없음, AGENTS.md). 상세 [[DATA-MODEL-BRAZE]]

## 2026-06-23 — 데이터모델 게이트 통과 (미결정 5건 확정)
- **A 아티팩트 집 = produced-file**: IAM=정적 Custom HTML → OD 덱/프로토타입식 HTML 파일+iframe 렌더 재사용. live-artifact 회피(format `html_template_v1` 하드코딩 schema.ts:747 + refresh/connector 머신리 불요). `braze_iam_v1` = DB 스키마 아닌 **HTML 파일 계약**(craft lint 검증) (출처: DATA-MODEL-BRAZE §2 코드분석)
- **B message↔conversation = 대화당 N메시지**. **C brand_id = 프로젝트 design_system_id 상속 + 메시지별 override 허용**. **D 전달 = 경로1만**(대시보드 수동 핸드오프, braze-client REST 보류). **E Variant = 자식 테이블 `braze_variants`** (변종별 상태/수정 독립 추적) (출처: 사용자 "추천 디폴트로 전부 확정")
- 테이블 = `braze_messages`+`braze_variants`, `migrateBraze` 서브모듈(db.ts:350~352 패턴). 다음 = dual-track: contracts DTO→daemon(persistence+routes)→web UI→`od braze` CLI→design-templates/braze-iam SKILL+craft

## 2026-06-23 — Braze IAM 기능 SDD 실행 + PR #1
- 실행 방식 = subagent-driven-development + TDD: 독립 task(CLI·skill·web) 병렬 디스패치(no-commit→컨트롤러 커밋, worktree 대신 디스조인트 파일), task별 spec+quality 리뷰 + 최종 전체-브랜치 통합 리뷰(opus) (출처: 사용자 /subagent-driven-development 지시)
- **통합 리뷰 가치 입증**: 격리된 task 리뷰들이 통과시킨 skill↔CLI 명령 드리프트(skill이 존재 안 하는 `--purpose/--target/--list` 참조, `--conversation` 누락, produce가 라벨 대신 UUID 필요)를 광역 리뷰가 포착→수정. 교훈: dual-track/멀티서피스 기능은 서피스별 격리 리뷰만으론 부족, 통합 리뷰 필수 (출처: 최종 리뷰 c1a456d)
- 트리거 옵셔널화 = **보류(follow-up)**: daemon /interview가 triggerEvent 필수지만 검증된 워크플로우는 트리거=콘솔 설정. skill이 추론 후보 전달로 우회. 완화는 후속 (출처: DATA-MODEL §5.1)
- bodoc 카탈로그 PII → `.gitignore` 추가. 설계문서(BRAZE-DOMAIN/DATA-MODEL/DECISIONS/ARCHITECTURE-BRAZE/FORK-DELTA)는 PR 포함 (출처: 사용자 "gitignore 추가하고 설계문서 포함 PR")
- PR #1 오픈 (Gmin82/open-design, base main ← marketing-ax/braze-iam): dual-track web panel + od braze CLI + skill/craft (출처: 사용자 "A로 진행")

## 2026-06-23 — Braze IAM 홈 칩 + brief.md 저장 트랙 분리
- braze-iam 칩 미작동 근본원인 = design-templates 스킬일 뿐 칩-활성 번들 플러그인 아님. 자유 프롬프트가 od-default 라우터로 빠져 제네릭 폼+컨펌게이트 누락. `triggers:`는 UI 검색전용·런타임 라우팅 안 함 (출처: HANDOFF 칩 진단)
- 칩 활성화 = 접근 A(번들 example 플러그인 패키징, HyperFrames 패턴) — apply-scenario 재사용, 최검증 경로. 커밋 5feaf5677, 브라우저 E2E로 braze 인터뷰 구동 확인 (출처: 사용자 선택 + 테스트)
- 컨펌 기획안→brief.md 문서 저장 = 별도 신규 트랙, 설계부터 새 세션. 참조 포맷 = /Users/gyumin/Project/braze-iam/output/2026-06-22-signup-encourage/brief.md (더 디벨롭된 형태로 디자인 프로젝트에 저장). 설계 미결정 4건(생성주체/저장위치/데이터계약/트리거지점) brainstorming 필요 (출처: 사용자 퍼즈 지시)

## 2026-06-24 — Braze brief.md 저장: 설계+플랜 이중검증
- 생성주체 = 접근 A(SKILL/에이전트 저작 + daemon은 경로·저장·표면노출만): 참조 brief가 LLM 산문 다수(개인화 선정근거·디자인방향·가설)라 결정론 템플릿으로 재현 불가, OD 기존 패턴(에이전트 저작·daemon 영속) 정합. plan 스키마 불변 + briefPath 1필드 (출처: HANDOFF brief.md 설계 brainstorming §2)
- 저장 = 신규 POST /api/braze/messages/:id/brief → writeProjectFile로 PROJECTS_DIR/<proj>/braze/<messageId>-<slug>/brief.md. <messageId> 접두로 충돌 데이터손실 방지. confirm 분기 불변(자동생성 X, SKILL이 컨펌후 명시호출) (출처: HANDOFF 설계)
- 이중 적대검증 = codex(스펙 13건) + plan-reviewer(플랜 9건). 멀티서피스 기능은 격리리뷰 부족, 통합/적대 검증이 사실오류 포착(C-1 getProject 출처·C-2 paths 타입무효·C-3 openProjectFile 부재·C-4 테스트하네스 부재) — 구현 전 차단 (출처: HANDOFF 검증)
- 산출물 = docs/superpowers/{specs,plans}/2026-06-24-braze-brief-md*.md. 단 docs/superpowers/ gitignored → git 미추적, 디스크 영속. 새 세션 resume서 직접 Read (출처: HANDOFF Uncommitted 정합성 체크)

## 2026-06-24 — Braze brief.md 저장 구현 (SDD 병렬, 8 tasks)
- 구현 = subagent-driven-development 병렬 실행: daemon 체인(contracts→persistence→route→CLI) 직렬 필수(타입+런타임 의존), Task7(SKILL doc)=worktree 격리로 병렬→cherry-pick, 리뷰어(read-only)∥다음 implementer(disjoint) 매 웨이브 중첩. pnpm monorepo node_modules 제약으로 코드 task는 main tree 직렬(worktree typecheck 불가) (출처: HANDOFF 8/8 완료)
- 검증 = task별 리뷰 + 최종 whole-branch 리뷰(opus) Ready-to-merge YES. dual-track 4-홉 필드명 정합·imported-folder baseDir·status allowlist·bodoc 0 확인. M-2(unreachable EEXIST) 직접 정리 (출처: 최종 리뷰)
- e2e = production HTTP/CLI 직접 구동(메시지→plan→confirm→od braze brief→od braze get→디스크). 가드 400/404·json·resave overwrite 통과. web 패널 렌더+콘솔에러 0, 링크 클릭 시각확인만 사람 잔여 (출처: HANDOFF e2e)
- 전체 daemon 1 fail(chat-route.test.ts:298)=braze 무관 기존결함(8커밋이 chat/permission/external 파일 0건 변경)—회귀 아님 (출처: 베이스라인 파일-동일성 증명)

## 2026-06-24 — bodoc 디자인시스템 포팅 (브랜드-블라인드 IAM 수정)
- 문제 = IAM 제작이 보닥 컨텍스트 없이 수행 — variant HTML 제네릭 인디고(#4f46e5)·bodoc:// 딥링크 0, brief도 yourapp://signup 플레이스홀더. 근본원인 = daemon이 활성 DS의 DESIGN.md를 produce 프롬프트에 자동 stack하나 design-systems/에 bodoc 없음 + 보닥 사실은 gitignored 카탈로그에만 고립 (출처: bodoc 디자인시스템 포팅 설계)
- 컨텍스트 범위 = 옵션 A: bodoc DESIGN.md = 시각브랜드+보이스+Liquid룰+§딥링크13(committed), 어트리뷰트122/이벤트128 벌크 제외(PII). 딥링크는 레퍼런스 HTML에 이미 노출된 앱 라우트라 저민감 (출처: 사용자 승인)
- 칩 자동 디폴트 채택 = braze 칩 config od.context.designSystem을 {primary:true}→bodoc {ref} pin (manifest 스키마 {ref?,primary?} 지원). 칩 누르면 bodoc 자동 활성, 수동선택 불요 (출처: 사용자 "넣어")
- DS 발견 = 자동스캔(listDesignSystems readdir) — 폴더 드롭만으로 드롭다운 노출, 레지스트리 편집 불요. 소스 자재 = braze-iam/brand/{DESIGN.md,tokens.css/json,braze-fonts.css}(TRACKED·저민감) 포팅 (출처: 코드 추적)
- bodoc 갭이 HTML produce + brief 저작 둘 다 영향 — Component 1이 활성DS stack으로 동시 해소. 검증에 brief 딥링크 포함 (출처: 사용자 brief.md 스크린샷 지적)

## 2026-06-24 — bodoc 디자인시스템 포팅 구현 (SDD+TDD, Task 1·2 머지레디)
- 구현 = subagent-driven-development + TDD: writing-plans로 TDD스텝 플랜 작성 → task별 fresh implementer + task리뷰(spec+quality) + final whole-branch 리뷰. Task1·2 disjoint이나 단일 git index 공유라 직렬(SDD 병렬-implementer 금지 룰 준수, worktree 격리는 trivial 2커밋엔 과함). 사용자 지시로 향후 SDD+TDD+병렬 디폴트화 (출처: 사용자 "앞으로 SDD/TDD/병렬")
- **스펙 이탈 확정**: bodoc DS = design-systems/bodoc/DESIGN.md 단일(prose-only). 스펙은 tokens.css/json/braze-fonts.css 4파일 포팅이었으나 코드검증서 tokens.css 단독 = pnpm guard FAIL(check-tokens-fixture-sync 페어링 tokens.css↔components.html + 토큰스키마 A1/A2/B-slot 요구, bodoc는 --primary/--text-primary만). → 토큰 :root·Braze 폰트자산문자열·딥링크13 전부 DESIGN.md 안 fenced 임베드. daemon이 활성DS DESIGN.md 전체 body를 produce(system.ts:665)+brief(panel.ts <BRAND_SOURCE>) 주입하므로 정보 동일 도달, 스펙 의도(옵션A·manifest 생략) 보존 (출처: Explore 코드추적 + 구현)
- 칩 바인딩 = open-design.json designSystem {primary:true}→{ref:"bodoc"}. pickDesignSystemId(apply.ts:326) ds.ref.trim() 우선. ReferenceSchema {ref?,path?}, 매니페스트 designSystem union 허용. 키는 ref(not id/path) (출처: 유닛테스트 증명 + apply.ts)
- guard 보강 = check-components-manifest-extraction.ts가 prose-only 폴더서 components.html ENOENT 크래시 → 3-branch(both-absent skip / XOR pairingError→guard fail / both-present process)로 수정, 형제 check-tokens-fixture-sync 패턴 미러. task-review Important 픽스 (출처: Task1 리뷰)
- 라이브검증 = rebuild+restart 후 /api/design-systems에 bodoc 노출. final whole-branch 리뷰 Ready-to-merge YES(0 blocking, XOR-fail fixture 재현, 5 DS guard prose-only skip 확인). Task 3(실 produce e2e + 시각확인 사람게이트 + 테스트잔여 정리) user-gated 잔여 (출처: final review + HANDOFF)

## 2026-06-24 — bodoc 디자인시스템 포팅 Task 3 e2e 검증 (브라우저 produce, PASS)
- Task 3 = 실 IAM produce e2e + 시각확인 사람게이트. browse 헤드리스로 web :62911서 Braze IAM 칩→인터뷰(목적=온보딩/사이즈=모달/톤=축하)→plan confirm→produce 완주. 신규 프로젝트 3c2f042d, 칩 선택만으로 bodoc 자동 활성(에이전트가 "보닥 브랜드 컨텍스트 기반으로 정합니다" 발화로 인지 확인) (출처: browse e2e)
- 산출물 grep PASS(Step 3·4): variant-a/b.html 둘 다 #16C5FF≥1·bodoc://action/≥1·슬롭색(#4f46e5/#0f172a)=0·플레이스홀더(yourapp/example.com)=0. brief.md(2 slug) 둘 다 bodoc://action/≥1·플레이스홀더=0. 이전 브랜드-블라인드(제네릭 인디고·yourapp://signup) 완전 해소 증명 (출처: 디스크 grep)
- 시각확인(Step 5) PASS: 모달 렌더 강제표시 후 캡처 — 보닥 cyan 별아이콘·"보닥" cyan 하이라이트·cyan CTA "내 보험 진단 시작하기"·보조 "다음에 볼게요"·흰표면·Braze Liquid 개인화({% if custom_attribute.name %}). variant-a=위계중심 모달, variant-b=상단 primary-tint 그래픽 대비강조. slop 0 (출처: 스크린샷 시각검증)
- 검증게이트(Step 7) PASS: pnpm guard 63/63, typecheck 0에러, 2 컨트랙트 테스트(design-system-bodoc-contract·braze-chip-design-system-bind) vitest 2/2 pass. 코드변경 0(검증 전용 트랙)이라 신규 커밋은 DECISIONS/핸드오프 로그뿐. bodoc DS 3커밋(a7294807b·51d448b4c·1dd2ed080) 머지레디 확정 (출처: 검증 실행)

## 2026-06-24 — P0 리브랜딩 플랜 이중 리뷰 + v3 개정
- 리뷰 = 인라인(Claude) + plan-reviewer 페르소나(opus, general-purpose 주입, 독립·내 발견 미제공) 이중. 두 리뷰 강수렴 + agent가 하드버그 2건 추가포착 — 교차검증 가치 입증 (출처: P0 v2 적대리뷰)
- v2 실행불가 판정: 게이트(typecheck/guard 그린)가 보지 못하는 곳에 식별자 잔존 → 릴리스컷·nix build·docker 깨짐. 핵심 = Goal이 "로컬 그린"으로 너무 좁음 (출처: 두 리뷰 verdict)
- **C-1(차단)**: Task7 `.od\b` 앵커가 CSS클래스(.od-toast)·JS멤버(.odPreviewBridge·manifest.od)·cwd alias(.od-skills 26곳) 손상. 스코프내 .od* 분포 실측. 해소 = validate.ts:41 검증앵커 `(?:^|/|\./)\.od(?=$|[/?#"'`\s>)])` 채택 + 보호대상 baseline 불변증명 (출처: plan-reviewer + grep)
- **C-2**: Task2 OD_→MAX_가 server.ts:4069 기존 const MAX_CHAT_RUN_INACTIVITY_TIMEOUT_MS와 동명 env 생성. 해소 = 치환 전 comm 충돌스캔 + 개별해소 (출처: plan-reviewer)
- **C-3/4/5**: .github(@od 158·OD_ 223)·nix(@od 경로·OD_ env)·deploy(Dockerfile OD_) odgrep 밖 = 릴리스/nix/docker 깨짐. 해소 = Task10/11/12 신규 + broadgrep 게이트 (출처: 두 리뷰)
- 베이크인 결정 5건: Q3 스코프확장(.github/nix/deploy 흡수), Q4 od bin 유지(embeddability 계약), Q2+ OD_MOCKS_ 전역제외(mocks 통합계약), Q5 CSS od- 클래스 비대상(의미 네임스페이스), MAX_ 접두사 유지(블랭킷충돌 없음, 동명 const만 스캔) (출처: v3 결정섹션)
- 추가 보강: Task1 pnpm nix:update-hash 스텝, 값+테스트핀 바뀌는 Task6/7/8에 pnpm --filter test 게이트 전진(typecheck만으론 단언누락) (출처: 리뷰 lock/nix·M-1/M-3)
- 산출물 = docs/superpowers/plans/2026-06-24-p0-rebranding-v3.md (v2 보존, 13 task: 코드9+CI/nix/deploy3+최종게이트1). gitignored, 디스크 영속 (출처: v3 작성)

## 2026-06-24 — P0 플랜 v3 3자 적대리뷰 (실행불가, v4 픽스목록 확정)
- 리뷰 = 3자: Claude 인라인 + plan-reviewer 페르소나(opus 서브에이전트) + codex 0.135.0(repo 대조, 1.45M tok). 셋 다 "v3 실행불가" 합의. 각기 다른 버그계층 포착 — 멀티리뷰 가치 입증 (출처: P0 v3 리뷰)
- 서브에이전트 단독 포착(최치명): grep 헬퍼 BRE라 `|` 리터럴 → 다중패턴 sweep 전부 0 거짓반환(게이트 비작동) + Task7 perl 미이스케이프 `.`로 'pod'→'.max' 231사이트 손상. codex 단독: Task7 백틱 shell-crash·tools/pack helm+compose 누락·데이터루트 contract·릴리스채널 정책모순 (출처: 3자 리뷰)
- v3 거짓주장 3건(내 작성오류): "validate.ts앵커채택"(좌경계 다름)·"OD_MAX_*부재"(app-config.ts:70 존재, v2는 맞음)·"Open Design Beta=0"(67건). v4서 정정 (출처: codex+서브에이전트)
- 합의 정확: collision 1건·OD_MOCKS_ 보존·nix:update-hash 존재·Task10~12 카운트·순서/병렬·AGENTS 데이터contract. v4 픽스목록 = Critical 5(정규식BRE→ERE·perl이스케이프·helm/compose스코프·데이터루트contract·문구) + High 4 + Medium 6. HANDOFF에 전체 기록 (출처: 3자 종합)
- 메타교훈: 플랜의 실행 한줄(perl/grep)은 shell-safe + regex-correct 둘 다 코드대조 검증해야. 탁상 리뷰는 못 잡음 (출처: 서브에이전트 정규식 발견)

## 2026-06-24 — P0 플랜 v4 작성 (3자 리뷰 픽스목록 반영)
- v4 = v3 3자 적대리뷰 픽스목록(Critical 5·High 4·Medium 6) 전수반영. 산출 docs/superpowers/plans/2026-06-24-p0-rebranding-v4.md (gitignored, 디스크영속). v3 308→v4 ~340줄, Task12b(helm/compose)·Task14(AGENTS 정책) 신규 (출처: v4 작성)
- 핵심수정: 모든 grep `grep -rnE`(BRE→ERE, v3 alternation 거짓통과 해소) + Step0 자가검증 게이트, Task7 perl `\.od` 리터럴dot + 단일쿼트 heredoc 스크립트파일(백틱 미노출, crash 해소), helm 폴더 git mv + 내용치환, nix/deploy 대문자"Open Design"+`.od` 추가, 데이터루트 RUNTIME_DATA_DIR contract(escape후보 3곳 코드확인) (출처: v4 Task7/10/11/12/12b)
- AGENTS 채널정책 = Option(a) 타깃수동 (사용자승인): AGENTS.md:145-146 + tools/pack/AGENTS.md:28,62-64 채널정체성 줄만 갱신, namespace(release-beta-win)·서술prose·@open-design 패키지명·Apache귀속 보존. 블랭킷 md sweep 금지. 근거 = 활성 거버넌스정책이라 방치 시 리뷰어 빌드차단 자기모순 (출처: 사용자 "어떻게 하는게 좋니"→Option a 권장 승인)
- 거짓주장 3건 정정: OD_MAX_* 존재(app-config.ts:70, self-consistent 무해)·Open Design Beta 67건(테스트 리터럴, Task8 갱신)·validate.ts 앵커 trailing만 동일(좌경계 별도) (출처: 3자 리뷰)
- 리브랜딩 "왜" 확인: 포크 리브랜딩 — OD(업스트림 OSS nexu-io/open-design) → Marketing AX(별도 제품). spec docs/superpowers/specs/2026-06-22-marketing-ax-product-design.md:60 P0 토대, 경로1 확정·사용자확정. OD→MAX는 독립목표 아닌 제품명 follow-on (출처: 사용자 질문 "od에서 max 바꿔야하는 이유"→spec 확인)
- perl 앵커 샌드박스 검증 PASS: pod/god 불변(이스케이프)·.od-skills/.od-data/manifest.od/odUseCase 불변·.od/"./.od" 치환. constraint#3(shell-safe+regex-correct 코드대조) 충족 (출처: scratchpad 테스트)

## 2026-06-24 — P0 플랜 v5 작성 (v4 2자 재검증 반영, shell 검증 완료)
- v5 = v4 2자 재검증(plan-reviewer opus 서브에이전트 실코드대조 + codex 로그salvage). 핵심발견: v4가 Task7 grep만 고치고 **동일 grep-정확성 버그를 broad-surface 태스크(10~14)에 미전파**. 산출 docs/superpowers/plans/2026-06-24-p0-rebranding-v5.md (출처: v4 재검증)
- Critical 4: ①grep `(?!MOCKS)` 룩어헤드(BSD grep crash/무음) ②`.od` discovery 좁은 trailing class(공백/따옴표 종료 .od 누락 — Dockerfile/template/bicep/home-manager 실측) ③Task14 grep `\|` BRE no-op ④Step0 자가검증 clean tree false-fail. 해소 = 단일 공유헬퍼(ODDIR_RE broad·룩어헤드금지·$PRESERVE 후필터) 전태스크 적용 (출처: 서브에이전트+codex 합의)
- High 5(스코프갭, 코드대조 확인): OPEN_DESIGN_* env계열(docker-compose·release workflows)·apps/telemetry-worker/wrangler.toml(.toml 밖)·루트 charts/open-design(별개 helm 64줄)·OD_LANDING_NOINDEX cross-cut(workflow 리네임 시 staging noindex SEO누출)·win appId 실제 builder.ts(not identity.ts) (출처: codex+서브에이전트)
- 사용자 결정 4건: OD_LANDING_NOINDEX=보존(Q6, OD_MOCKS_급)·루트 charts=스코프포함(Task12b helm×2)·OPEN_DESIGN_→MARKETING_AX_ 매핑+telemetry-worker placeholder(Task12c)·v5 전체반영 (출처: 사용자 AskUserQuestion)
- 거짓주장 정정(codex 라인 1건): registry.ts fallback 실제 :53(내 플랜 정확, codex :54 오타). landing-page pkg @open-design/landing-page importer 0건 확인 → 비차단 보류 (출처: 코드 grep)
- shell 검증 PASS: ODDIR_RE 이전누락 5파일 포착·OD_ 보존 perl(LANDING_NOINDEX/MOCKS 보존, 나머지 치환)·PRESERVE 후필터·OPEN_DESIGN_ perl. constraint#3(shell-safe+regex-correct 코드대조) 충족 (출처: scratchpad)
- 메타교훈: 픽스를 한 곳만 적용하면 동일 버그클래스가 형제 태스크에 잔존 → 공유헬퍼 단일화가 근본해소. 2라운드 적대리뷰서 둘 다 추가버그 포착 — 멀티리뷰+코드대조 가치 재입증 (출처: v4→v5)

## 2026-06-25 — P0 v5 실행 (Task1~5) + git 사고 복구
- 실행 방법 = subagent-driven-development 스킬. 구현자/리뷰어 sonnet, 메인 컨텍스트는 brief/report/diff 파일핸드오프로 보존. durable ledger `.superpowers/sdd/rebrand/progress.md`가 recovery map (출처: 사용자 "메인 토큰 최소 + TDD SDD + 병렬")
- 사용자 결정 2건: 실행 브랜치 = 전용 `feat/p0-rebrand` 생성. disjoint Task10~14 병렬 = worktree 격리 (출처: AskUserQuestion)
- Task1~4 리뷰 Approved. Task1 miss-class 결함 발견·수정: `@open-design/`(슬래시) 패턴이 `path.join(root,"@open-design","web")` 분리인자 + `@open-design\/` regex 리터럴 못 잡음 → 패키징 경로/guard/테스트핀 깨짐. 잔존 grep도 같은 패턴이라 동일 맹점 → broad 패턴 재검증 필수 (출처: Task3 구현자 발견)
- **git 사고**: Task5 1차 구현자(단일 거대 bash)가 옛 커밋 c54e49aae 위에 작업해 브랜치 orphan. `reset --hard 70a0c8cbf` 복구. 교훈 = 서브에이전트에 git checkout/reset/rebase/worktree 금지 + 커밋 전후 HEAD/부모 검증 명시 필수 (출처: reflog 조사)
- **메타 갭 발견**: per-task 리뷰가 타깃 테스트핀+typecheck만 돌려 daemon 전체스위트 99-실패 드리프트 미포착. "diff against baseline"(전체스위트 base 대조)을 게이트에 넣어야. 다음 세션 최우선 triage (출처: Task5 구현자 daemon 스위트 보고)

## 2026-06-25 — daemon 99-fail triage (P0 v5 잔여 #1)
- daemon 456-fail 근본원인 = 3계층: better-sqlite3 ABI 141≠137(448, 환경/네이티브)·plugin-runtime dist stale OPEN_DESIGN_PLUGIN_SPEC_VERSION(2, 빌드위생)·완료 Task2/4 rebrand miss(4). Task5 구현자 "prompt/MAX_NODE_BIN" 진단은 적색청어 (출처: triage, HEAD vs 에러 직접분류)
- 환경 위생 우선 점검 교훈: 대량 부트스트랩 실패(99파일 서버부팅 테스트 전멸)는 소스 회귀 아닌 네이티브 ABI/dist 정합부터 의심. node@24(ABI137) vs 시스템 node25(ABI141) 충돌이 CONSTRAINT#1의 실제 현상 (출처: connectors-routes 에러 stack openDatabase→startServer)
- 4 miss = 완료 Task2/4 누락이라 follow-up 커밋(08e1f10b7)으로 즉시 수정. Task1 miss-class(aa2bd2e3c) 선례. SKILL.md env식별자만 MAX_*(제품명/.od-skills 보존), publish 테스트핀, fixture URL (출처: 사용자 "진행해")
- fixture registry-starter/open-design.json repo+homepage = 리브랜드 확정. codex 0.135.0 판정: 권위신호 = 제품 registry/publish 경로(publish.ts+marketplace/installer 테스트가 Marketing AX canonical), example-deck/landing 귀속 아님. nexu-io/open-design는 명시 OSS 귀속 표면만 보존 (출처: codex consult 466k tok)
- process 갭 = per-task 게이트가 타깃핀+typecheck만 → 누적 드리프트 미포착. 남은 Task6~14 게이트에 full @marketing-ax/daemon test(node@24+natives rebuilt) 추가 의무화 (출처: 456-fail 미발견 분석)
- chat-route external_directory 1-fail = pre-existing 환경(allowed-dir + /var↔/private/var), rebrand 무관. 별도 후속 (출처: codex 확인)

## 2026-06-25 — P0 v5 실행 세션2 (Task5 review + Wave-1 병렬 + Task6/7 결정)
- 실행구조 = Task5 review(Approved) + disjoint Task10/11/12/12b/12c/14 worktree 병렬(게이트 grep-0, pnpm 불필요) + 코드체인 Task6~9 순차(main repo). 사용자 지시 "병렬 가능 태스크 병렬". disjoint 6 = 전부 parent==BASE 검증, 미머지(p0/* 브랜치) (출처: 사용자 "병렬로 수행")
- 사용자 결정 3건(AskUserQuestion):
  - **od:// MCP/telemetry namespace = 보존**. `od://design-systems|skills|focus`(MCP resource URI) + `od://objects`(langfuse storage_ref). od bin(Q4=유지)과 동일논리 — 내부 프로토콜/임베더빌리티 계약, 사용자 브랜드 아님. migrate 시 저장된 storage_ref 호환+MCP URI 계약 깨짐. Task9/13서 의도잔존 (출처: Task6 scope deviation 37건)
  - **데이터루트 .od fallback = 최소 리네임**(registry.ts:53/daemon-paths.ts:135/db.ts:34 리터럴 .od→.max만). RUNTIME_DATA_DIR escape 리팩터는 rebrand 이전부터의 아키텍처 부채라 별도 follow-up 분리. rebrand PR = 식별자-only 유지, 동작변경 리스크 회피 (출처: AGENTS.md:152-160 escape 명시)
  - **.od-data/.od-e2e = .max-data/.max-e2e 리네임**(우리 e2e/툴링 작업디렉터리, 브랜드파생). .od-skills만 보존(agent 프롬프트 계약 리터럴 + AGENTS "not a data root") (출처: alias 성격 grep)
- 헬퍼 버그(Task11 발견): 공유 ODDIR_RE trailing class가 `;`,`\` 누락 → `.od;`/`.od\"` 맹점. Task7/13 corrected class(`;,:\}` 추가)로 교체 적용 (출처: Task11 nix flake.nix follow-up)
- Task6 commit c0baa1f85에 resume-work HANDOFF 아카이브 rename(git mv)이 index에 staged돼 동반커밋됨. 무해(bookkeeping) (출처: Task6 report)

## 2026-06-25 — P0 리브랜드 완료·머지·푸시 (세션2 종료)
- 최종 whole-branch 리뷰(opus seam-integrity)서 2 seam miss 발견+수정: ①릴리스 태그 open-design-v→marketing-ax-v(.github는 Task10서 이미 marketing-ax-v* → 파이프라인 불일치) ②vercel.json @open-design/web filter(패키지 리네임으로 0매칭 빌드깨짐)+dead OD_WEB_OUTPUT_MODE. 둘 다 config-writer가 코드 sweep서 누락된 동일 클래스 (출처: 최종리뷰)
- 메타교훈: rebrand의 진짜 리스크는 1:1 swap 아닌 **seam**(config writer ↔ code reader 짝). odgrep/broadgrep이 .ts/.json/.yml 커버해도 vercel.json·release-script 같은 config writer가 코드와 다른 식별자 쓰면 빌드/파이프라인 깨짐. 최종 seam-integrity 리뷰(grep 불변 + 짝 spot-read)가 line-by-line보다 효과적 (출처: 2 miss 전부 seam)
- PR 방식=main 직푸시 결정(PR 없이). rebrand 이미 로컬 머지+브랜치삭제, origin/main 27 무관커밋 뒤짐 → 깨끗한 rebrand-only PR 불가. 로컬 리뷰 완료라 포크서 PR 리뷰 생략 (출처: 사용자 AskUserQuestion)
- gh 계정 불일치 = origin Gmin82인데 active evan2942 → 403. `gh auth switch --user Gmin82`로 active 전환 후 푸시 성공. credential helper는 active gh 계정 사용 (출처: 403 디버깅)
- 후속 3건 의도적 분리(별도 PR): landing-page 전체 리브랜드·RUNTIME_DATA_DIR escape 리팩터(D2 defer)·mcp-spawn conversation-binding red-spec. rebrand 스코프 유지 (출처: 최종리뷰 non-blocking)

## 2026-06-26 — P0 후속 3건 완료 (SDD 병렬, worktree 격리)
- 사용자 지시 = 후속 3건 전부 진행 + SDD로 disjoint TASK 병렬. 실행: A(landing)·B(data-dir)·C(mcp-bind) 각 worktree(`/private/tmp/fu-wt/*`) 격리, B/C 먼저 병렬 착수 후 A. 메인스레드가 git 전담(서브에이전트 git 조작 금지 — Task5 사고 교훈 재적용) (출처: AskUserQuestion)
- **B/C 둘 다 현재 main서 이미 fixed 판명** → source 변경 0, regression guard 테스트만 추가:
  - C(mcp conversation-binding): 상류 `9a3424d68`(sandbox foundation #3242)가 `convs[0]`→createdAt-오름차순 정렬로 이미 수정. seeded(=최古) conv 바인딩 정상. `listConversations`가 createdAt 반환(db.ts:843) 확인 → NaN-fallback 우려 해소. red-spec `mcp-run-conversation-bind.test.ts`로 teeth 증명(revert→RED, restore→GREEN) (출처: git -L blame + 에이전트 재현)
  - B(RUNTIME_DATA_DIR escape): 실제 escape는 registry.ts:53 `defaultRegistryRoots()` cwd `.max` fallback뿐. 그러나 daemon 호출처 4곳(server.ts:6619/6681, services/plugin-installation.ts:140, routes/plugins/index.ts:154) **전부 이미 `PLUGIN_REGISTRY_ROOTS` 전달** → escape 도달불가. daemon-paths.ts/db.ts는 escape 아님(부트스트랩/이미전달). guard `plugins-registry-roots-escape.test.ts`(mutation→RED 증명) (출처: 에이전트 호출처 추적)
- **A(landing-page) = 협소 슬라이스 결정**: 사용자 결정 3건 — ①도메인 `open-design.ai` 보존(인프라/이메일) ②슬러그·blog/tutorial 파일명·에셋명 보존(SEO) ③blog/tutorial 본문/제목=편집결정이라 기본 제외. 결과 = 사용자노출 표시텍스트 `Open Design`→`Marketing AX`만(118파일, 5110줄). preserve존(od://·kebab open-design·도메인·env·@open-design/) byte-identical 검증. astro build 3304페이지 PASS (출처: AskUserQuestion + 에이전트 검증)
- 에이전트 판단 deviation 보존(합리적): PascalCase `OpenDesign`(41)·`Open Design AI`(29)는 JSON-LD `alternateName` SEO 검색별칭 배열 → 파괴적 추측 대신 보존+플래그. 리브랜드 시 별칭도 바꿀지는 별도 SEO 결정 (출처: A 에이전트 report)
- 후속 잔여(미착수, 별도 결정): ①landing 패키지명 `@open-design/landing-page`→`@marketing-ax/*` ②landing `OD_LANDING_*` env ③blog/tutorial 본문 브랜드(1987 mention) ④B 타입약화(routes/plugins `string[]` vs `RegistryRoots`) 컴파일강제화

## 2026-06-26 — Braze 카드 배지 출하 + 모델 이슈 진단
- Braze 카드 배지 = 매니페스트 od.badge 선언 → 데몬 pre-insert 스탬프 → 카드/CLI 렌더. 서버소유. PR#3 머지(553bc42bc) (출처: badge 출하)
- pre-insert 스탬프 채택(post-resolve 아님): 스냅샷은 od.badge 미적재 → 매니페스트 직접 read(getInstalledPlugin). resolve 실패와 무관하게 배지 존재 → codex Critical 3개(좀비 프로젝트·race·소스오류) 구조적 소멸 (출처: codex+plan-reviewer 리뷰)
- 배지 라벨 non-i18n freeform 채택: 19로케일 churn 회피, ~7파일 유지. 내부툴이라 영문 OK (출처: brainstorming Q1)
- "Usage credits 1M context" 에러 = 앱버그 아님, 글로벌 ~/.claude/settings.json model=sonnet[1m] fallback(앱 모델=default → 데몬 --model 미전달). fix=앱 컴포저서 표준모델 선택. 미적용(사용자 거부) (출처: investigate)
- gh push 403 = credential helper evan2942 캐시. active=Gmin82여도 `gh auth switch --user Gmin82` 명시 필요 (출처: push 403 재발)

## 2026-06-26 — P2 Naver-blog 산출물 설계 (brainstorming → spec)
- D1 이미지 생성 X, 글(HTML)만: 썸네일/섹션배너 PNG 비범위 (출처: 사용자 지시 / P2 Naver-blog 스펙)
- D2 Path A 원샷 제네릭: 블로그=단일 카피헤비 HTML 1건(A/B 없음) → Braze 무거운 레인 불필요. 신규 라우트/SQLite/contracts DTO/CLI 서브커맨드 0, 데몬 코드 0 (출처: braze 매핑 워크플로 wf_69f3df9d-979 권장)
- D3 브랜드-범용 스킬 + bodoc DESIGN.md 보험특화: 스킬=네이버 채널규약(13 HTML룰·SEO)만, 보험사실(5카테고리·금소법·서비스4종)은 활성 DESIGN.md서 로드 → P2 브랜드 다중화 부합 (출처: 사용자 "1번이어도 보험특화 되게")
- D4 SEO 룰만 베이크: 라이브 네이버 SERP 스크래핑(check-naver-rank Puppeteer) 비범위 — 외부통합/유지비 (출처: 사용자 지시)
- D5 출력영속 = 에이전트 cwd 직접 Write(brief.md+HTML): cwd=프로젝트 관리 디렉터리(server.ts:8284/8538/9834), dual-track-safe(web/CLI 동일), 신규 REST 라우트 0 (출처: Path A 파일쓰기 메커니즘 Explore 검증)
- D6 배지 Naver그린 신규 + 톤 단일 SoT 리팩터: BADGE_TONES const → 타입+zod 파생, TONE_CLASS Record 강제 → 향후 산출물 배지 확장 깔끔 (출처: 사용자 "이후 배지 항목 범용성 좋게")
- P2 공통 추상화 보류: 2 데이터포인트(Braze 추적형 / Naver 경량)로 불충분 → 3번째 추적형 라이프사이클 등장 시 braze+그 버티컬서 공통 상태머신 추출 (출처: braze 매핑 블루프린트 결론)

## 2026-06-28 — P2 Naver-blog 스펙 2라운드 교차리뷰 + 정정
- 2-카탈로그 드리프트 가드 = **공유 서브셋 byte-identical**(SKILL.md/example.html/references/**, open-design.json 제외): 전체 `diff(정본,미러)==0`은 정본만 manifest 보유라 항상 RED → 불가. Braze는 이미 body 드리프트(step-3 JSON camelCase↔snake_case) → 가드 정당 (출처: P2 Naver-blog R2 재리뷰)
- 2-카탈로그 미러 패턴 유지(단일정본+생성/미러드롭 대안 보류): Braze 선례 일관 + 데몬 코드 0(Path A). 미러드롭은 갤러리 라우트 변경=데몬코드라 위배 (출처: 사용자 AskUserQuestion)
- green 톤 시퀀싱 = ①contracts green+build ②TONE_CLASS/CSS ③manifest: 부팅 등록이 plugin-runtime→contracts PluginManifestSchema 파싱, green 미선행 시 매니페스트 파싱/설치 조용히 실패(bundled.ts:166 warn+return, upsert 안 됨) (출처: codex P1 + R2 검증)
- i18n = 19 로케일(it.ts 포함), manifest i18n = 18(Braze 키셋 es/it/vi/nl): web Dict 19와 세트 다름. AGENTS.md/구스펙 18은 stale (출처: R1+R2 리뷰 codebase 검증)
- 스펙 결함 11건 전부 정정 = R1 사실오류 6(로케일·switch·pipeline이유·persistence·manifest i18n·z.enum폴백) + R2 전파모순 4(본문만 고치고 §2/§13/§16 미러위치 누락) + R2 drift-guard결함 1 (출처: 2라운드 리뷰)
- 메타: 스펙 자가편집 후 독립 plan-reviewer 검증 필수 — 본문-미러 모순 + 자가주입 신규결함(diff==0) 둘 다 자가검토서 놓치고 agent가 포착. 자가편집 확증편향 (출처: R2 재리뷰 교훈)

## 2026-06-29 — P2 Naver-blog 구현 플랜 작성 + 독립검증 + 정정
- 구현 플랜 = 9 Task TDD red-spec 단위, green 시퀀싱(contracts BADGE_TONES+green+build → web TONE_CLASS/CSS → manifest tone:'green')을 Task 순서로 강제: 매니페스트 green 미선행 시 부팅 파싱(resolvePluginFolder→validateSafe) 조용히 실패 (출처: P2 Naver-blog 플랜)
- 플랜 작성 전 fact-gathering 워크플로(14 reader 병렬, 682k tok): 스펙이 인용한 라인번호 다수 drift 확인 → 정확한 현재 코드로 플랜 작성 (출처: 워크플로 wf_0f7ab4db-85e)
- 플랜 독립검증 = plan-reviewer(APPROVE-WITH-CHANGES) + Explore 6-fact verify 병렬. 자가편집 확증편향 재발: 내가 주입한 사실오류 3건(import db.js→registry.js / icon 'file-text'→없음, 유효=file / "critique.ts 없음"→실제 src/critique.ts 존재) self-review 통과, agent가 전부 포착 (출처: 2-에이전트 교차검증)
- 정정 = F1~F3(명백 버그, 양 에이전트 검증) 즉시 + F4(discovery 라우트 검증, 스펙 §14) + F5(Task2 red-spec→regression 라벨정정+완전성가드) + F6(drift 가드 서브트리 목록 동등성). F7(line-number) prose 앵커로 보류 (출처: plan-reviewer findings)
- blockquote 보더 #000(style SSoT) 채택, #333(2차 소스)는 플래그. 16 비-CJK 로케일 chip i18n = 영문 폴백(Braze 선례), CJK만 네이티브 (출처: 도메인 digest 충돌 + 플랜 결정)

## 2026-06-29 — P2 Naver-blog 구현 완료 + designSystem 바인딩 갭 발견·수정
- 실행방식 = subagent-driven-development: fresh implementer/task + 독립 task-reviewer + 최종 whole-branch 리뷰(opus). Task 1~8 전부 1-pass Approved(수정 dispatch 0). 근거: 자가편집 확증편향 회피, green-sequencing 순서 강제 (출처: HANDOFF P2 Naver-blog 구현)
- designSystem 바인딩 갭 = **지정(metadata)≠전달(컬럼)**: 매니페스트 ref:bodoc → apply가 metadata.designSystemId=bodoc 생성하나 project 컬럼 미반영, run-start(server.ts:7581)는 컬럼/run-param만 읽어 bodoc DESIGN.md 미주입 → 칩/CLI가 범용 글 생성. braze 포함 모든 designSystem.ref 시나리오 플러그인 공통 pre-existing 갭 (출처: 사용자 질문 발단 라이브 추적)
- 갭 fix = 서버사이드 resolve(배지 메커니즘 대칭): create 핸들러가 resolveStampDesignSystemId(db,pluginId)=pickDesignSystemId(manifest)로 ref resolve → 컬럼 세팅. web-only(metadata→컬럼) 미채택 — CLI dual-track 깨짐. 컬럼이 단일 진실원. 명시 body.designSystemId 우선 (출처: 사용자 승인 "서버사이드 resolve")
- bodoc 특화 검증 = 라이브 produce E2E(코드추적만으로 끝내지 않음): claude agent produce 1회 → brief.md가 design-systems/bodoc/DESIGN.md §11 명시 인용, "안녕하세요 보닥입니다!" 페르소나·서비스4종·금지어준수·craft준수 확인 (출처: 라이브 produce runId dc8887a6)
- 캐리 Minor 전부 accept-as-followup(최종 opus 리뷰 판정), T8 stale 주석만 무료 fix. fix 3 Minor 비차단 (출처: 최종 whole-branch 리뷰)
