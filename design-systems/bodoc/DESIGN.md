# 보닥(bodoc) IAM

> Category: Marketing
> Surface: web

> 보닥 In-App Message HTML 제작의 단일 디자인 계약. Braze Custom-HTML IAM produce 턴과 brief 저작 턴이 모두 이 문서를 활성 브랜드 컨텍스트로 주입받는다.
> 머신 토큰 소스는 아래 `:root` 블록(색·폰트·radius). 본문은 그 값을 미러하고 + 의미·사용처·금지를 명문화한다. 수치 충돌 시 `:root` 블록이 정본.

---

## 0. Tokens (토큰 — 프리뷰/스크린샷용 :root)

로컬 프리뷰·스크린샷에서는 아래 `:root`를 그대로 사용한다. 프로덕션 IAM 인라인 출력 시 폰트는 §2의 Braze 자산 문자열 블록으로 교체한다(`tokens.css` @font-face 제거).

```css
:root {
  /* 컬러 — 솔리드 */
  --primary:        #16C5FF;  /* 보닥 시그니처. 주 CTA·핵심 강조 1~2회만 */
  --primary-dark:   #0DA5E0;  /* :active 눌림, hover */
  --text-primary:   #1D2024;  /* 제목·본문 본체 */
  --text-secondary: #7D8085;  /* 보조 설명 */
  --text-tertiary:  #5A5E63;  /* 캡션·보조 액션. WCAG AA 4.5:1 보장 */
  --border:         #E5E5EA;  /* divider·카드 외곽 */
  --background:     #F5F5F5;  /* 면 분리·눌림 배경 */
  --error:          #FF4D4D;  /* 경고·부정 신호 한정 */
  --white:          #FFFFFF;  /* 카드·시트 표면 */

  /* 컬러 — 알파 변형 (raw rgba 인라인 금지, 항상 토큰 사용) */
  --primary-tint:        rgba(22, 197, 255, 0.10);  /* 아이콘 배경, 시점 라벨 배경 */
  --primary-tint-strong: rgba(22, 197, 255, 0.15);  /* 체크리스트 bullet 배경 */
  --primary-glow:        rgba(22, 197, 255, 0.18);  /* 강조 glow pulse */
  --overlay:             rgba(0, 0, 0, 0.45);        /* 모달·하프시트 dim */

  /* border-radius 위계 */
  --radius-btn:   12px;
  --radius-card:  16px;
  --radius-modal: 20px;
  --radius-sheet: 20px;
}
```

## 1. Color (색)

| 토큰 | 값 | 의미·사용처 |
|---|---|---|
| `--primary` | `#16C5FF` | 보닥 시그니처. 주 CTA·핵심 강조 1~2회만 |
| `--primary-dark` | `#0DA5E0` | `:active` 눌림 상태, hover |
| `--text-primary` | `#1D2024` | 제목·본문 본체 |
| `--text-secondary` | `#7D8085` | 보조 설명 |
| `--text-tertiary` | `#5A5E63` | 캡션·보조 액션. WCAG AA 4.5:1 보장 (`#7D8085`는 작은 글자 대비 미달) |
| `--border` | `#E5E5EA` | divider·카드 외곽 |
| `--background` | `#F5F5F5` | 면 분리·눌림 배경 |
| `--error` | `#FF4D4D` | 경고·만기 임박 등 부정 신호 한정 |
| `--white` | `#FFFFFF` | 카드·시트 표면 |

알파 변형 — **raw `rgba()` 인라인 금지, 항상 토큰 사용**: `--primary-tint` `rgba(22,197,255,.10)`(아이콘 배경), `--primary-tint-strong` `rgba(22,197,255,.15)`(체크리스트 bullet), `--primary-glow` `rgba(22,197,255,.18)`(glow pulse), `--overlay` `rgba(0,0,0,.45)`(모달·시트 dim).

**절제 원칙**: primary 1~2회만, 무채색 위계 3단계(primary/secondary/tertiary)로 정보 위계 표현. 다색 사용은 AI slop(§9).

## 2. Typography (타이포)

폰트: **Pretendard 4종** — 모두 `font-weight: 300` 고정.

| 클래스 | family | weight | letter-spacing |
|---|---|---|---|
| `.font-bold` | Pretendard-Bold | 300 | -0.5px |
| `.font-semibold` | Pretendard-SemiBold | 300 | -0.5px |
| `.font-medium` | Pretendard-Medium | 300 | normal |
| `.font-regular` | Pretendard-Regular | 300 | normal |

- Bold/SemiBold만 `letter-spacing: -0.5px`. Medium/Regular는 normal.
- **위계**: weight 4단계 모두 활용. 사이즈 스케일 1.25~1.5배 점프. 헤딩 줄간격 1.1~1.35 / 본문 1.4~1.6.

**프로덕션 인라인 폰트 — Braze 자산 문자열 블록** (프로덕션 발송본은 이 블록을 인라인, `tokens.css` @font-face는 제거):

```css
.font-bold     { font-family: 'Pretendard-Bold.otf:65eea035affddd004d709b51';     font-weight: 300; letter-spacing: -0.5px; }
.font-semibold { font-family: 'Pretendard-SemiBold.otf:65eea0dcaffddd004d709b8b';  font-weight: 300; letter-spacing: -0.5px; }
.font-medium   { font-family: 'Pretendard-Medium.otf:65eea07daffddd004d709b6f';    font-weight: 300; }
.font-regular  { font-family: 'Pretendard-Regular.otf:65eea01caffddd004d709b39';   font-weight: 300; }
```

로컬 프리뷰용 @font-face(CDN)는 Braze 자산 경로(`https://braze-images.com/appboy/communication/assets/font_assets/...`)를 직접 참조한다. 프로덕션엔 위 자산 문자열만 사용.

## 3. Spacing (간격)

- **8px 그리드** 기준. 모든 padding/margin/gap을 8의 배수로.
- 그룹핑은 proximity(근접)로 — 관련 요소 간격 좁게, 그룹 간 넓게.
- **헤딩 위/아래 비대칭 1.5:1** (위 여백 > 아래 여백).
- 호흡 리듬: 빽빽함 금지. 시각 요소 5~7개 이내.

## 4. Layout (레이아웃 — 사이즈 3종만)

HTML IAM은 **모달·하프시트·풀스크린만** 가능.

| 사이즈 | 컨테이너 핵심 | 적합 |
|---|---|---|
| 모달 | `width:calc(100%-40px); max-width:400px; radius:20px; 중앙정렬` | 단일 메시지·확인 |
| 하프시트 | `width:100%; max-width:600px; radius:20px 20px 0 0; padding-bottom:safe-area; 하단정렬` | 목록·다중 옵션 |
| 풀스크린 | `body{position:fixed; inset:0; overflow-y:auto}` | 몰입·축하 |

- **슬라이드업 금지** — HTML IAM은 WebView 전면 차단이라 비차단성 기대 위반. Braze native 슬라이드업으로 제작.
- **하프시트 드래그 핸들 금지** — WebView 오버레이라 드래그 미동작. 닫기는 ✕ 버튼·오버레이 탭만.
- iPad 대응 `max-width`, 노치 대응 `env(safe-area-inset-bottom)`.

## 5. Components (컴포넌트)

- **radius 위계**: 버튼 12px / 카드 16px / 모달·시트 20px.
- **id 강제**: `<body>` 내부 모든 요소(`div/button/h1~h6/p/span/a/img/svg`)에 `id="iam-..."` 부여. editor 인스펙터 역동기화 의존. svg 자체엔 id, 내부 path/rect/circle은 불필요.
- **정합성**: stroke-width 통일, 아이콘 표준 사이즈 16/20/24/32, shadow elevation 단계, divider 두께 일관.
- **Braze Bridge**: `appboyBridge.logClick(id)` / `appboyBridge.closeMessage()`. logClick 라벨은 **버튼명 그대로 한글**(영문 슬러그 금지).

## 6. Motion (모션)

기본 4종 + 강조 1개.

1. **진입**(필수): 모달 fade+scale-up 240ms / 하프시트 slide-up 320ms(iOS curve) / 풀스크린 fade 200ms.
2. **피드백**(필수): 클릭 요소 `:active` scale 0.92~0.98 분리 선언.
3. **stagger**(선택): 헤딩→본문→메트릭→CTA 60~80ms 순차. 긴급 톤은 생략/축약.
4. **강조 마이크로**(선택, **핵심 1개만**): glowPulse / dotPulse / sweep 중 하나.
5. **접근성**: `prefers-reduced-motion: reduce` 전체 비활성화 필수.

금지: 회전·bounce·duration>0.5s, 강조 2개 이상 동시, `infinite` 남용, transform 외 속성 transition.

## 7. Voice (카피 톤)

- **톤**: 차분·신뢰. 보험 도메인 안심감. 과장·자극 금지.
- **표준 호칭**: "전문가" — **"플래너" 사용 금지**(보닥 표준).
- **개인화**: `name`은 custom attribute → `{{custom_attribute.${name}}}` 강제. `{{${name}}}`·`{{${first_name}}}`은 미치환 발송 → 금지.
- **Time 어트리뷰트**: UTC ISO → KST(+32400초) 보정 + `date` 필터 체이닝 필수. 변환 실패 시 fallback `{% abort_message %}` 권장.
- **CTA**: 동사 명확, 1개 주 CTA. logClick 라벨 = 버튼 카피 한글 그대로.
- **길이**: 헤딩 간결, 본문 한 줄 글자수 적정. 금지어·자극어 배제.

## 8. Brand (브랜드 원칙)

- **보닥 로고 IAM 포함 금지** — IAM HTML에 로고 절대 삽입 안 함.
- 보험을 쉽고 안심되게. 신뢰·전문성을 절제된 톤으로.
- primary 시그니처 컬러는 강조 포인트로만, 면 채움 남용 금지.
- **deprecated 어트리뷰트 사용 금지**: `bodoc_percentile`(보험점수 백분율) 등.
- 프로덕션 발송본은 단일 HTML 인라인(외부 CSS/JS 참조 불가).

## 9. Anti-patterns (안티패턴 — 발송 차단/감점 신호)

**프로덕션 금지(발송 차단)**:

| ❌ | 이유 |
|---|---|
| `PREVIEW_PLACEHOLDERS` / appboyBridge fallback `<script>` | 프리뷰 전용. 프로덕션 잔존 시 미치환·오동작 |
| raw `rgba(22,197,255,...)` 인라인 | 토큰 미사용 |
| `{{${name}}}` / `{{${first_name}}}` | 미치환 발송. custom_attribute prefix 필수 |
| 보닥 로고 삽입 | §8 |
| "플래너" 표현 | "전문가" 강제 |
| 슬라이드업 HTML / 하프시트 드래그 핸들 | WebView 제약 위반 |
| id 누락 요소 | editor 역동기화 불가 |

**AI slop 6항목(감점)**: 무지개·다색 팔레트 / 고채도 남용 / 불필요 장식 도형 / 균일 라운딩(radius 위계 없음) / 과다 마이크로 인터랙션(강조 2개+) / 본문 이모지 남발.

## 10. 딥링크 카탈로그 (Deeplinks)

IAM CTA 버튼 click-action에 쓰는 `bodoc://` 스킴. **CTA click-action 후보는 반드시 이 표에서 고른다 — 플레이스홀더(`yourapp://`, `https://example...`) 발명 금지.**

| 화면 | 딥링크 |
|---|---|
| 마이데이터 연결 사전질문 화면 | `bodoc://action/MainChat?template=mydata/simple/signup` |
| 마이데이터 사전질문 수정 화면 | `bodoc://action/MydataSurvey?isEditMode=true` |
| 마이데이터 약관 동의 화면 | `bodoc://action/AgreeMydata` |
| 상담신청 화면 | `bodoc://action/GoPublish` |
| 상품 탭 화면 | `bodoc://action/InsuranceProduct` |
| 보상 탭 화면 | `bodoc://action/RewardMain` |
| 홈 탭 화면 | `bodoc://action/Home` |
| 진단 탭 화면 | `bodoc://action/Diagnosis` |
| 카카오 회원가입 버튼 | `bodoc://action/Login?method=kakao` |
| 네이버 회원가입 버튼 | `bodoc://action/Login?method=naver` |
| Apple 회원가입 버튼 | `bodoc://action/Login?method=apple` |
| Google 회원가입 버튼 | `bodoc://action/Login?method=google` |
| Email 회원가입 버튼 | `bodoc://action/Login?method=email` |

**스킴 패턴**: `bodoc://action/<Route>[?<param>=<value>]`. 회원가입 = `Login?method={kakao|naver|apple|google|email}`. 마이데이터/상담/탭 이동 등.

---

## 11. Blog (네이버 블로그) — 브랜드 사실

> 이 섹션은 네이버 블로그 산출물(naver-blog 스킬) 전용 브랜드 사실이다. 위 0~10 섹션은
> Braze IAM 채널 계약 — 블로그는 별개 채널이라 토큰/레이아웃을 공유하지 않는다.
> 채널 기술(HTML 13룰·SEO)은 `craft/naver-blog-html.md`에 있고, 여기는 보험 사실만 담는다.

### 11.1 Voice (블로그)

- **페르소나**: "보험을 쉽고 친근하게 설명해주는 보험 전문가 친구" — 가르치는 교수가 아니라 옆에서 알려주는 친구.
- **호칭 표준**: "전문가" (— "플래너" 금지, 보닥 표준).
- **어조**: 구어체 `~해요/~거든요/~인데요/~하시는 분들이 많은데요/~더라구요`. 항상 도입 인사 `안녕하세요, 보닥입니다!`.
- **독자 호명**: 구체 호명 의무 (직장인·엄마들·신혼부부·운전 초보). 추상 호명 금지 (여러분·누군가·독자분).
- **직접 푸시 CTA 금지**: `지금 바로 가입하세요!`, `지금 바로 확인해보세요`, `꼭 기억하세요!` 금지. 부드러운 도움형만 — 예: `혼자 비교하면 헷갈리기 쉬우니, 보닥에서 한 번 확인해보세요 😉`.
- 감정 마커 `ㅠㅠ 😅 😰 ☺️ 😉` 절제 사용 (문장 시작/끝).

### 11.2 5 카테고리 + 독자의도 + CTA 매핑

| # | 카테고리 | 독자의도 | CTA 우선순위 |
|---|----------|---------|-------------|
| 1 | 질병코드 | 고관여, 진단서 들고 청구 직전. 코드 검색(J20.9 등). 코드 1개 = 글 1편 | ① 앱 '내 보험 진단' → ② 손해사정사 연결. 본문 중간 2~3회, 마지막 1번 X |
| 2 | 보험으로인생치트키 | 정보탐색(호기심+손해회피). "이것도 청구되나?" | ① '내 보험 진단' → ② 숨은보험금 조회 → ③ 손해사정사 |
| 3 | 진료과목별 실비청구 | 정보탐색+청구 가능성 판단. 진료과목 1개 = 글 1편 | ① '내 보험 보장 내역' → ② '실손보험 세대 확인' → ③ 청구 진단 |
| 4 | 운전자필독서 | 위급 대응 OR 사전 정보. 자동차/운전자보험 | ① '운전자보험 보장 확인' → ② 손해사정사 무료 상담 |
| 5 | 보닥서비스소개 | 즉시 행동(이미 서비스 탐색 중). 직접 전환 | ① 앱 다운로드+서비스 사용 → ② 카톡·전화 상담. CTA 강도·빈도 ↑ |

카테고리 4는 금소법 면책에 더해 **법률자문 면책** 필요: "본 글은 정보 제공 목적이며 특정 보험·법률 자문을 대체하지 않습니다." 사고·법규 수치는 1차 출처 의무(도로교통법·자동차손해배상보장법·금감원 분쟁조정).

### 11.3 금소법 면책 문구 (정본)

본문 마지막에 `craft` 룰 11 스타일로 삽입:

> 본 글은 정보 제공 목적이며 특정 보험 상품의 가입을 권유하지 않습니다.

### 11.4 보닥 서비스 4종 (= 마케팅 "4종 = 전부" 정본)

| 서비스 | 정의 |
|--------|------|
| 조회 | 가입된 보험 한눈에 정리 (마이데이터 연동) |
| 진단 | 내 보험이 좋은지 점수·리스크 분석 |
| 청구 | 사진 한 장으로 보험금 청구 (가족 포함) |
| 숨은보험금 | 지급 결정 후 미수령 보험금 찾아주기 |

### 11.5 금지 표현 (거짓 광고 방지)

- **4종 외 기능 언급 금지** (존재하지 않음 = 거짓 광고): "병원 연계"·"전문 병원 연계"·"의사 매칭"·"처방 안내"·"상담사 연결".
- **경쟁 서비스명 금지**: 내보험찾아줌·보험다모아. (공공기관명 건강보험공단·금융감독원은 보닥 미커버 영역 인용 시 허용.)

### 11.6 핵심 용어 — 숨은보험금 ≠ 놓친보험금 (혼용 절대 금지)

| 용어 | 의미 | 보닥에 있나 |
|------|------|------------|
| 숨은보험금 | 지급 결정 후 미수령 보험금 | ✅ 있음 |
| 놓친보험금 | 청구 안 한 케이스 | ❌ 없음 |

"놓친보험금" 언급·CTA 모든 콘텐츠에서 금지.

### 11.7 출처 정책 (1차 공식 출처만)

- **1차 출처**: 정부(질병청·복지부·금감원·금융위) / 공식기관(NHIS·KIDI) / 학술지(NEJM·PLOS).
- **2차 출처**: 언론 — 반드시 1차와 교차 확인.
- **❌ 출처 금지**: 네이버 블로그·카페·지식iN·개인 병원 후기. (`blog.sources`에 포함 금지.)
- 1차 매핑 실패 시: ① 본문 삭제 → ② 정성 완화("약 28%" → "아직 일부만") → ③ research 재호출.
