---
name: cardnews-instagram
description: |
  Instagram carousel card-news producer — brand-agnostic 7-step workflow
  that ships final PNG cards (1080×1350, 4:5). Interviews the user,
  recommends topics when the brief names none (local publish-history
  dedup + trend scan), gathers primary sources, drafts a card-map plan
  with direction options, gates confirmation, generates AI backgrounds
  (codex image_gen, cover as style anchor) and composes Korean text via
  Pillow, then self-reviews on 5 axes including a vision-based design
  check. Works for any brand whose DESIGN.md is loaded as the active
  design system. Use when the brief asks for a "카드뉴스", "card news",
  "인스타 카드뉴스", "인스타그램 캐러셀", or "instagram carousel".
triggers:
  - "카드뉴스"
  - "card news"
  - "인스타 카드뉴스"
  - "인스타그램 캐러셀"
  - "instagram carousel"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  craft:
    requires: [instagram-cardnews]
  design_system:
    requires: true
    sections: [color, typography, voice, anti-patterns]
  example_prompt: "환절기 비염 관리법 카드뉴스 만들어줘 — 30대 직장인 대상."
---

# cardnews-instagram — 인스타그램 카드뉴스 제작

브랜드-범용 채널 워크플로. 채널 기술(카드 규격·이미지 파이프라인 12룰)은
`craft/instagram-cardnews.md`, 브랜드 사실(팔레트·훅 공식·핸들·면책·로고 에셋)은 활성
`design-systems/<brand>/DESIGN.md`에서 로드한다. **브랜드 사실 하드코딩 금지** — 이
스킬은 채널 규약만 안다.

**실행 전제** (미충족 시 정직 안내 후 중단 — 대체 생성 경로 없음): codex CLI 0.135+
로그인(`codex doctor`, `image_generation` 피처) / python3 + Pillow / 한글 폰트
(Pretendard 자동 탐색 → 나눔 폴백 → 설치 안내). 상세: `references/imagegen-pipeline.md`.

## 7단계

1. **Intake** — 활성 `design-systems/<brand>/DESIGN.md` Read (카드뉴스 브랜드 섹션 —
   보이스·훅 공식·비주얼 무드·로고 에셋 경로 확인). 요청 원문 기록.
1.5. **Topic(주제 추천 — 조건부)** — 요청에 구체 주제가 **없을 때만**(예: "카드뉴스
   하나 만들어줘"). 주제가 있으면 스킵하고 2단계 직행. `references/topic-subagent.md`
   Read 후 그 지시대로 topic 서브에이전트에 위임(dispatch 도구 있으면 **반드시** 분리,
   없으면 인라인 동일 절차) — 발행이력은 `{cwd}/publish-history.md` Read(파일 없으면
   후보 표 "기존 발행" 전부 "미확인" 정직 표기), 60일 이내 소재 자동 제외 / 61~90일
   ⚠️ / 91일+ 각도 차별화 전제 허용 → 반환된 후보 표를 마크다운 카드로 제시 +
   `<question-form>` 후보 선택 폼 발행(옵션 = 각 후보 + "직접 입력") → **즉시 턴 종료**
   — 폼 발행 턴에 리서치·기획 직행 **절대 금지**(4단계 게이트와 동일 규율). 선택 답변
   도착 후 그 주제로 2단계 합류(주제 축은 기확정 — 인터뷰에서 제외).
2. **Interview** — `<question-form>` 아티팩트로만 (AskUserQuestion·인라인폼 금지).
   축: 주제(1.5 경유 시 제외)·타겟 독자·장수 힌트(기본 5~8, 사용자 조정)·타겟 키워드
   (해시태그 후보 겸용)·톤·비주얼 무드(실사 장면 컨셉 방향 — 장소·분위기·소품. 기본형 배경은 실사 환경 고정이라 스타일 자체는 질문하지 않음).
   비율은 질문하지 않음 — craft 기본 4:5 고정(1:1은 사용자가 명시 요구할 때만).
3. **Research(서브에이전트)** — dispatch 도구 있으면 **반드시** 분리:
   `references/research-subagent.md` Read 후 그 지시대로 위임(입력: 주제·키워드·독자·
   DESIGN.md 경로·cwd). WebSearch 1차 출처 → `research.md` cwd Write → 핵심 사실
   ≤10줄만 반환(SERP 덤프는 research.md에 격리). dispatch 불가 런타임은 같은 절차
   인라인. 브랜드 출처 정책 준수.
4. **Plan/brief + 컨펌 게이트** — 기획을 폼 발행 **전에** `plan-v1.md`로 **프로젝트
   cwd에 Write**(첫 기획=plan-v1.md, 버전 넘버링) + 같은 내용을 마크다운 카드로 제시 +
   `<question-form>` 폼(기획 방향 옵션 A/B/C 선택 + 컨펌/반려) 발행 → **즉시 턴 종료**
   (컨펌 답변은 다음 user 메시지로 도착). plan-v* 필수 섹션:
   ① **기획 방향 옵션 2~3개** — 각 옵션: 방향명 / 타겟 독자 / 핵심 메시지 / **표지
   카드 훅 문구** / 후킹 앵글 / **비주얼 무드 1줄**. 추천 1개에 ★ + 근거 1줄.
   ② **타겟 키워드 + 해시태그 후보** — 경쟁도는 "추정" 명시(라이브 도구 없음).
   ③ **카드맵** — 장별 1줄: 표지 훅 → 본론(1카드 1메시지) → 마지막 CTA.
   ④ **기존 발행 중복 체크 결과** — 1.5단계 경유 시 topic 결과 인용, 주제 직행 시
   "미확인" 명시.
   ⑤ sources(research.md 참조) / CTA 매핑 / 카테고리.
   `plan-v*.md` Write만 컨펌 전 허용 예외 — 컨펌 user 메시지 도착 전에는 `brief.md`·
   cards.json Write·이미지 생성·5단계 진행 **절대 금지**, 리서치 직후 같은 턴에서
   관성으로 직행하는 것이 대표 위반. 컨펌 시 `brief.md`를 cwd에 Write(기본정보/인터뷰
   결정/기획/출처/캡션 방향), 반려 시 기획 수정 → 다음 번호로 `plan-v2.md` Write(이전
   `plan-v*.md`는 히스토리 — 덮어쓰기·삭제 절대 금지) → 재컨펌 폼 발행 + 즉시 턴 종료.
5. **Produce** — `craft/instagram-cardnews.md` + 활성 DESIGN.md Read 후:
   - 5a. **cards.json Write** — 카드별 텍스트 확정 (스키마 정본
     `references/card-structure.md` — 본문 줄바꿈·양쪽맞춤은 compose가 자동 처리,
     body_lines는 문장 소스만. 본문은 서술형 문단, 분량 = 렌더 5~7줄(공백 포함 약
     150~220자) — 미달·초과는 compose 에러. 커버 훅·서브와 본문 타이틀은 줄당 잉크
     912px 이내(초과 = compose 에러 → 글자수 축소). 규칙·예외는 card-structure.md).
     캡션은 8블록 템플릿, 해시태그는 별도 배열. 본문 레이아웃은 기본형(basic) 고정 — cards.json 최상위 body_layout 기본값. 자유형(free)은 후속 트랙(현재 compose가 명시 에러로 거부).
   - 5b. **표지 배경 생성** — `references/imagegen-pipeline.md` Read 후 그 지시대로
     imagegen 서브에이전트 1회 dispatch(순차 — 스타일 앵커). 프롬프트는 메인이 스캐폴드로
     전량 조립(브랜드 팔레트·비주얼 무드·portrait·no-text 필수·텍스트 영역 단순화).
     DESIGN.md에 브랜드 레퍼런스 이미지가 등재돼 있으면 view_image 참조 필수.
     배경 중간산출은 전부 `{cwd}/bg/` 하위(사전 `mkdir -p` — 루트 잔존 = 글롭·위생
     문제, 삭제는 금지: 텍스트 수정 시 재생성 불필요 계약의 전제). `bg/bg-01.png`
     확인 후 진행.
   - 5c. **본문 배경 생성** — imagegen 서브에이전트 N-2개 **한 턴에 병렬 dispatch**
     (각각 `bg/bg-01.png` + 브랜드 캐릭터 레퍼런스(DESIGN.md 등재 시)를 view_image 앵커 2장으로 — "same style, same palette" + 캐릭터 고정절). 병렬 실패
     (rate limit 등) 시 순차 폴백 — 실패 카드만 재시도. dispatch 불가 런타임은 인라인
     순차. CTA는 생성 없음(표지 재사용).
   - 5d. **합성(메인 직접)** — `python3 <스킬 폴더>/scripts/compose_cards.py --spec
     {cwd}/cards.json --out-dir {cwd} --bg-dir {cwd}/bg [--logo <DESIGN.md 로고 에셋>]` → 4:5 중앙 크롭 →
     1080×1350 → 역할별 레이아웃 오버레이(고정 계약) → `<slug>-01.png` … `<slug>-NN.png`.
   - 5e. **갤러리 Write(메인 직접)** — `<slug>-preview.html`: 순수 정적 HTML — 카드
     `<img src="<slug>-NN.png">`를 index 순서로 나열, **각 카드 푸터에 라벨(`NN · 역할`) +
     개별 다운로드 앵커 `<a href="<slug>-NN.png" download>다운로드</a>`** + `.caption`
     블록 1개(캡션 전문 + 해시태그 줄, 복사용 텍스트). JS 없음. 웹 런타임 코드 변경
     없음. 슬러그 정규식 `[^a-z0-9가-힣]+`(가-힣 보존).
6. **Review(서브에이전트 검수)** — dispatch 도구 있으면 **반드시** 신선한 컨텍스트
   검수자에게 위임: `references/review-subagent.md` Read 후 지시대로(검수자가 craft·
   DESIGN.md·brief·research·cards.json·갤러리·**카드 PNG 전장을 직접 Read — 비전 검토**).
   검수자는 **report-only** — 5축(craft 채널 룰 / 디자인 / 도달 / 브랜드·톤 / 팩트체크)
   채점표와 P0/P1 목록만 반환. 수정은 메인이 반영 후 재검수 1회 — **텍스트만 수정이면
   배경 재생성 없이 compose_cards.py 재실행**. 게이트 ≥80 발행 / 60~79 수정 / <60
   재기획 — 재검수 후에도 <80이면 사용자 보고·판단 위임. dispatch 불가 시 인라인
   자가검수(같은 채점표).
7. **Handoff** — 파일 경로 보고 + 안내: `<slug>-preview.html`로 카드 순서·모양 확인 →
   `<slug>-NN.png` N장을 그대로 인스타그램 캐러셀로 업로드(순서 = 파일명 순). 캡션·
   해시태그는 갤러리 `.caption` 블록에서 복사. **발행 후 `publish-history.md`에
   `| 날짜 | 주제 | 핵심소재 |` 1줄을 직접 추가하라고 안내**한다(스킬이 자동 append
   하지 않음 — 발행은 스킬 밖 사건).

> 인터뷰·컨펌·주제선택은 전부 제네릭 `<question-form>` → Questions 탭 → 다음 user
> 메시지로 답 회수. 신규 폼 배선 없음.
