# 보닥 IAM — 채널 제작 컨텍스트 (Braze Custom-HTML In-App Message)

> 스킨 스왑 불변인 포맷·플랫폼 제약·발송 규칙. 비주얼 룩은 활성 디자인시스템
> (디폴트 design-systems/bodoc-iam/) 소관. 제작 절차는 braze-iam SKILL.md 소관.

## Layout (사이즈 3종만 — Braze 플랫폼 제약)

HTML IAM은 **모달·하프시트·풀스크린만** 가능.

| 사이즈 | 컨테이너 핵심 | 적합 |
|---|---|---|
| 모달 | `width:calc(100%-40px); max-width:400px; radius:20px; 중앙정렬` | 단일 메시지·확인 |
| 하프시트 | `width:100%; max-width:600px; radius:20px 20px 0 0; padding-bottom:safe-area; 하단정렬` | 목록·다중 옵션 |
| 풀스크린 | `body{position:fixed; inset:0; overflow-y:auto}` | 몰입·축하 |

- **슬라이드업 금지** — HTML IAM은 WebView 전면 차단이라 비차단성 기대 위반. Braze native 슬라이드업으로 제작.
- **하프시트 드래그 핸들 금지** — WebView 오버레이라 드래그 미동작. 닫기는 ✕ 버튼·오버레이 탭만.
- iPad 대응 `max-width`, 노치 대응 `env(safe-area-inset-bottom)`.

## 프로덕션 폰트 — Braze 자산 문자열 블록

**프로덕션 인라인 폰트 — Braze 자산 문자열 블록** (프로덕션 발송본은 이 블록을 인라인, `tokens.css` @font-face는 제거):

```css
.font-bold     { font-family: 'Pretendard-Bold.otf:65eea035affddd004d709b51';     font-weight: 300; letter-spacing: -0.5px; }
.font-semibold { font-family: 'Pretendard-SemiBold.otf:65eea0dcaffddd004d709b8b';  font-weight: 300; letter-spacing: -0.5px; }
.font-medium   { font-family: 'Pretendard-Medium.otf:65eea07daffddd004d709b6f';    font-weight: 300; }
.font-regular  { font-family: 'Pretendard-Regular.otf:65eea01caffddd004d709b39';   font-weight: 300; }
```

로컬 프리뷰용 @font-face(CDN)는 Braze 자산 경로(`https://braze-images.com/appboy/communication/assets/font_assets/...`)를 직접 참조한다. 프로덕션엔 위 자산 문자열만 사용.

## 컴포넌트 인프라 (채널 계약)

- **id 강제**: `<body>` 내부 모든 요소(`div/button/h1~h6/p/span/a/img/svg`)에 `id="iam-..."` 부여. editor 인스펙터 역동기화 의존. svg 자체엔 id, 내부 path/rect/circle은 불필요.
- **Braze Bridge**: `appboyBridge.logClick(id)` / `appboyBridge.closeMessage()`. logClick 라벨은 **버튼명 그대로 한글**(영문 슬러그 금지).

## IAM 개인화·카피 규칙

- **개인화**: `name`은 custom attribute → `{{custom_attribute.${name}}}` 강제. `{{${name}}}`·`{{${first_name}}}`은 미치환 발송 → 금지.
- **Time 어트리뷰트**: UTC ISO → KST(+32400초) 보정 + `date` 필터 체이닝 필수. 변환 실패 시 fallback `{% abort_message %}` 권장.
- **보닥 로고 IAM 포함 금지** — IAM HTML에 로고 절대 삽입 안 함.
- **deprecated 어트리뷰트 사용 금지**: `bodoc_percentile`(보험점수 백분율) 등.
- 프로덕션 발송본은 단일 HTML 인라인(외부 CSS/JS 참조 불가).

## 발송 차단 신호 (프로덕션 금지)

| ❌ | 이유 |
|---|---|
| `PREVIEW_PLACEHOLDERS` / appboyBridge fallback `<script>` | 프리뷰 전용. 프로덕션 잔존 시 미치환·오동작 |
| `{{${name}}}` / `{{${first_name}}}` | 미치환 발송. custom_attribute prefix 필수 |
| 보닥 로고 삽입 | IAM 개인화·카피 규칙 |
| "플래너" 표현 | "전문가" 강제 |
| 슬라이드업 HTML / 하프시트 드래그 핸들 | WebView 제약 위반 |
| id 누락 요소 | editor 역동기화 불가 |

## 캐릭터 에셋 라이브러리 — 클락 (IAM 오브제 컴포지션용)

`braze_plan_v1.image.assets[].source:"library"`의 `ref`는 아래 카탈로그 경로를 쓴다.
원본 렌더 컷아웃(투명 PNG, 알파 bbox 트림 + 60px 패딩, 콘텐츠 기준 ~2000px) — 캐논 100%,
생성 비용 0. 시즌 소품은 캐릭터가 *들거나 옆에 두는* 방식으로 컴포지션(의상 변형 생성은
캐논 리스크 — visual-layout-patterns.md §9).

**역할 구분**: 합성 컷(아래 표) = IAM에 직접 들어가는 히어로 PNG (고해상 렌더 컷아웃).
`clock/character-sheet.png` = 생성 앵커·검수 캐논 전용 (통째 1장, 셀 크롭 금지 —
1536×1024, 셀당 ~150~250px라 해상도상 직접 합성 금지). 캐논 대조 통과 등재 2026-07-10.

**의상 3종**: 가운(gown, 기본 — 진단·상담 톤) / 캐주얼 셔츠(casual — 팁·라이트 정보 톤) /
오렌지 후디(hoodie — 이벤트·캐주얼 톤. **시트 외 의상**: 검수 시 시트 대조는 골격·이목구비·
팔레트 축만 적용하고 의상 축은 이 카탈로그를 기준으로 한다).

| ref | 포즈·표정 | 적합 용도 |
|---|---|---|
| clock/stand-confident.png | 가운, 양손 허리, 정면 미소 | 기본 히어로 — 안내·신뢰 소구 |
| clock/wave-hello.png | 가운, 걸으며 손 흔들기, 미소 | 환영·온보딩·첫 인사 |
| clock/walk.png | 가운, 걷는 옆모습 | 여정·진행 중 내러티브 |
| clock/wave-high.png | 가운, 팔 높이 들어 주목 (로우앵글) | 공지·주목 유도 |
| clock/notice-surprised.png | 가운, 놀라며 옆 가리킴 (O 입) | 새 소식·발견·긴급 알림 |
| clock/hologram-point.png | 가운, 검지 위 홀로그램, 한손 허리 | AI 상담(클락)·스마트 기능 소구 |
| clock/hologram-smile.png | 가운, 홀로그램 스마일 포인팅, 활짝 웃음 | AI 상담 긍정 결과·만족 소구 |
| clock/board-point.png | 가운+클립보드, 보드 가리킴 | 진단 결과 안내 |
| clock/board-review-pen.png | 가운+클립보드, 펜 턱 (검토 중) | 보장 점검·분석 중 |
| clock/board-read.png | 가운+클립보드, 집중해 읽기 | 상세 확인·꼼꼼함 소구 |
| clock/board-write.png | 가운+클립보드, 기록/체크 | 상담 기록·체크리스트 |
| clock/board-show.png | 가운+클립보드, 보드 들어 제시 | 리포트 제시·결과 확인 CTA |
| clock/casual-idea.png | 캐주얼 셔츠, 검지 위 (아이디어) | 팁·인사이트 (비의료 톤) |
| clock/casual-think.png | 캐주얼 셔츠, 턱 괴고 생각 | 궁금증 유도·질문 던지기 |
| clock/casual-arms-crossed.png | 캐주얼 셔츠, 팔짱, 자신감 | 전문성·비교 우위 소구 |
| clock/hoodie-relax.png | 후디, 한손 허리 캐주얼 | 이벤트·라이트 톤 (시트 외 의상) |
| clock/hoodie-arms-crossed.png | 후디, 팔 X자 교차, 놀란 표정 | 금지·주의 환기·"이러지 마세요" (시트 외 의상) |
| clock/hoodie-facepalm.png | 후디, 이마 짚기 | 실수·놓침 공감 훅 (시트 외 의상) |
