# Decisions Log

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
