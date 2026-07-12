# 오브제 이미지 생성 파이프라인 — codex image_gen 규약 + imagegen 서브에이전트 dispatch 지시

메인 에이전트: 오브제 생성 호출은 **imagegen 서브에이전트에 위임**한다 — 기획안
`image.assets[]`에서 `source:"generate"`인 에셋 전부를 **한 턴에 병렬 dispatch**
(에셋 간 스타일 앵커 의존 없음 — cardnews의 표지 선행과 다르다). 실패분만 순차
재시도(성공분 보존, 전체 재생성 금지). 프롬프트는 메인이 아래 스캐폴드로 전량
조립해 전달하고, 서브에이전트는 실행+검증+경로 반환만 한다(codex 장문 stdout을
메인 컨텍스트에서 격리). dispatch 도구가 없는 런타임은 인라인 순차로 동일 절차.
`source:"library"`(브랜드 캐릭터 컷)와 `source:"css"`(코드 장식)는 생성 호출이
없다 — library는 파일 복사, css는 빌더가 그린다.

**메인 에이전트가 codex 자체인 런타임**: CLI 재호출(중첩 spawn) 대신 내장
`image_gen` 도구를 직접 사용해도 된다 — 스캐폴드·산출 경로 계약은 동일.

**산출 경로 = `{cwd}/assets/` 하위 고정** (`assets/obj-<id>.png`). 중간산출을
루트에 두면 글롭 위생 문제(cardnews 실측과 동일 원리). 생성 성공분은 삭제 금지.

## 실행 전제 (미충족 시 정직 안내 후 중단 — 대체 생성 경로 없음)

- codex CLI 0.135+ 로그인 (`codex doctor`) — `image_generation` 피처
- python3 + Pillow (알파 검증·키잉 폴백)

## dispatch 입력

- `{cwd}` — 프로젝트 작업 디렉토리 절대 경로 (메인이 `mkdir -p {cwd}/assets` 선행)
- `{image_mode}` — `"layer"` 또는 `"scene"` (기획안 `image.mode`, 기본값
  `"layer"`). scene이면 아래 "씬 생성 경로 (scene 모드)" § 를 따르고, 서브에이전트
  임무 3(알파 검증·크로마 폴백)은 skip한다.
- `{out_name}` — 산출 상대 경로: layer 모드 `assets/obj-<asset id>.png`, scene
  모드 `assets/scene-<id>.png`
- `{prompt}` — 아래 스캐폴드로 조립한 생성 프롬프트 전문 (layer는 오브제
  스캐폴드, scene은 씬 스캐폴드 — 둘 다 아래 §)
- `{anchor_paths}` — view_image 참조 절대 경로 목록. **오브제 생성은 기본 "없음"**
  — 타사 레퍼런스 스크린샷을 앵커로 쓰는 것은 금지(IP·캐릭터 오염). 예외는 캐릭터
  포함 통짜 컴포지션(아래 "캐릭터 포함 통짜 컴포지션" 절, layer·scene 공통)뿐이며
  그때는 **이중 앵커** — 캐릭터 시트(등재 시, 통째 1장 — 셀 크롭 금지) + 해당
  복장 고해상 렌더 1장을 전달한다. 시트 미등재 브랜드만 렌더 2~3컷.

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 Braze IAM 오브제 에셋 생성 전담 에이전트다. 최종 텍스트 반환만이 메인에게
전달된다 — 잡담 없이 결과만.

1. 실행 (기본 샌드박스는 read-only라 cwd 복사가 실패한다 — 두 플래그 필수):

   ```bash
   codex exec -c model="gpt-5.5" --skip-git-repo-check --sandbox workspace-write -C {cwd} "<지시문>" < /dev/null
   ```

   **이미지 생성 모델은 `gpt-5.5` 고정** (`-c model="gpt-5.5"`) — codex 기본 모델
   (예: `gpt-5.6-luna`)은 image_generation 400 실패, `gpt-5.1-codex*`는 ChatGPT
   계정 미지원(400). 모델 플래그 누락 시 조용한 전패(도그푸딩 실측). 백그라운드
   실행 시 stdin 닫기(`< /dev/null`) 필수 — 무한 행 48분 실측.

   `<지시문>` 조립: `{anchor_paths}`가 "없음"이 아니면 `먼저 view_image로 다음
   이미지를 확인하라: {anchor_paths}` 를 앞에 붙이고, `{prompt}` 전문 + `생성된
   이미지를 {cwd}/{out_name} 으로 복사하라` 로 마감한다.
2. `{cwd}/{out_name}` 존재 확인. 없으면 codex stdout에서 저장 경로
   (`~/.codex/generated_images/<uuid>/ig_*.png`)를 찾아 직접 복사한다.
3. **알파 검증**: 투명 배경 요청 에셋이면 아래로 판정한다(**layer 모드 에셋
   전용** — scene 모드는 배경까지 통째로 그리는 카드 전체 일러스트라 알파
   채널이 없다. 이 판정 자체를 skip한다. 아래 "씬 생성 경로 (scene 모드)" §
   참조).

   ```bash
   python3 -c "from PIL import Image; img=Image.open('{cwd}/{out_name}').convert('RGBA'); import sys; sys.exit(0 if any(a<255 for a in img.getchannel('A').getdata()) else 3)"
   ```

   exit 3(알파 없음)이면 크로마키 폴백을 **이 서브에이전트 안에서 1회** 수행:
   같은 프롬프트의 Background 라인을 `solid pure green background (#00FF00),
   object does not touch the frame edges`로 교체해 재생성한다. 이때 재생성
   지시문의 복사 마감 문구는 `생성된 이미지를 {cwd}/{out_name}.chroma.png 로
   복사하라` — 최종 경로 `{cwd}/{out_name}` 를 덮어쓰지 않는다. 이어서
   `python3 <스킬 폴더>/scripts/cut_character.py {cwd}/{out_name}.chroma.png {cwd}/{out_name} --color "#00FF00"`
   로 키잉하고, 키잉 성공 후 중간산출 `{cwd}/{out_name}.chroma.png` 를
   삭제한다(assets/ 글롭에 크로마 원본이 남으면 검수·미디어 업로드로 누출).
4. 반환(1~2줄만): `OK {out_name}` 또는 `FAIL {out_name} — [사유 1줄]`.
   codex stdout 원문은 반환에 넣지 않는다.

## 투명 배경 계약

**layer 모드 전용 계약** — scene 모드는 배경 포함 생성이므로 이 계약 전체를
skip한다(아래 "씬 생성 경로 (scene 모드)" § 참조). 기본 경로 = 투명 직생성
(스캐폴드 Background 라인, gpt-5.5 투명 직생성 실측 확인 2026-07-10).
서브에이전트가 알파 검증으로 실효를 확인하고, 미지원 산출이면 크로마키 폴백이
자동 발동한다(위 임무 3).

## 프롬프트 스캐폴드 (메인이 조립)

```
Use case: transparent-background object asset for in-app message composition
Subject: [메타포 오브제 — 메시지 의미와 일치. visual-layout-patterns.md §4 사례표 참조]
Style: [아래 4종 표의 style 라인]
Background: fully transparent (alpha PNG). No scene, no environment, no floor
  shadow baked in.
Palette: [브랜드 DESIGN.md 토큰 색상 명시]
Composition: single object (or specified cluster) centered, generous margin,
  object fully inside frame. [ratio 지정 시: square 1:1 canvas 등]
Constraints: no text, no letters, no numbers, no watermark, no photorealistic
  rendering, no human photography.
```

### 오브제 스타일 스캐폴드 4종 — Style 라인

| style | Style 라인 전개 |
|---|---|
| `flat-icon` | flat graphic object, bold geometric shapes, solid fills, crisp edges |
| `2d-illust` | flat 2D vector illustration, clean shapes, subtle texture, friendly rounded forms |
| `3d-illust` | soft 3D rendered object cluster, matte materials, gentle studio lighting |
| `3d-icon` | single glossy 3D object, centered, studio lighting, subtle reflections |

**실사 전면 금지** — 4종 밖 style 값은 조립 거부하고 기획안 수정을 요구한다.
어떤 스타일·오브제를 쓸지는 기획안(Step 3)에서 Claude가 목적·톤 기반으로 이미
결정돼 있다 — 서브에이전트는 재해석하지 않는다.

## 오브제-메시지 의미 정합 (핵심 룰)

오브제 = 메시지 메타포 (토글=알림ON, 낚싯바늘=혜택 잡기, 달력=마감일 —
`visual-layout-patterns.md` §4 사례표가 정본). Subject 라인에 "보여야 하는 것
(오브제·상태)"을 명시하고, 오독을 만들 수 있는 요소는 Constraints에 "보이면
안 되는 것"으로 명시한다 (cardnews 소품-의미 룰과 동일 원리).

## 캐릭터 포함 통짜 컴포지션 경로

캐릭터와 오브제의 **물리 상호작용**(안기·끌기·올라타기 등)이 메시지에 필수면
**통짜 통합 생성이 기본**이다 — "물리 상호작용 필요 시만" 예외적으로 쓰는 경로가
아니다. 분리 생성된 캐릭터 PNG와 오브제 PNG를 CSS로 겹쳐 물리 상호작용처럼
조립하면 원근·스케일이 부정합해 "콜라주 티"가 난다(도그푸딩 반려 실측
2026-07-10 — 근거표는 문서 말미 "근거 — 프로브 실측" 참조). **이 CSS 조립은
콜라주로 금지한다.** 레이어 합성(캐릭터 `library` 컷 + 오브제 `generate` +
장식 `css`)은 캐릭터-오브제가 겹치지 않는 **상호작용 없는 산개 배치**로만
강등해 쓴다.

- `{anchor_paths}` = **이중 앵커**: ① 캐릭터 시트 통째 1장 (브랜드 에셋
  라이브러리 등재 턴어라운드+포즈+표정 시트 — 정체성·포즈·표정 어휘를 한 장이
  담는다. **셀 크롭 금지**, cardnews 검증 계약) + ② **해당 복장의 고해상 렌더
  1장** (예: `clock/board-show.png` — `brands/bodoc/deliverables/iam.md`
  "캐릭터 에셋 라이브러리" § 카탈로그 참조). 시트에는 복장 3종(가운/캐주얼
  셔츠/오렌지 후디)이 공존해 핀이 없으면 드리프트한다(프로브 2차 가운 소실
  실측 — 근거표 참조). 시트 미등재 브랜드는 렌더 2~3컷 폴백.
- Pose/Expression 지시: 시트의 해당 행을 매핑해 "as in the sheet's IDLE/ACTIONS/
  SITTING row", "match the sheet's <표정명> cell" 문구로 조립한다 (cardnews 매핑
  방식 — 시트가 어휘를 담으므로 낱장 컷보다 지시 정밀도가 높다).
- cardnews 가드 룰 적용: 시트/렌더와 다른 체형의 레퍼런스는 앵커 금지 —
  "정체성 금지" 텍스트 경고로는 체형 오염을 못 막는다(도그푸딩 실측)
- Character 절: "Use the exact same character as in the reference images —
  identical proportions, face, colors. Do not redesign, restyle, or reinterpret."
  뒤에 복장을 문장으로 고정하는 지시를 이어 붙인다 (예: "Outfit MUST match the
  second reference image: white doctor lab coat over a light blue shirt with
  a yellow tie").
- layer 모드에서는 이 경로도 배경은 투명 — 배경은 여전히 CSS다. scene 모드의
  히어로 컴포지션은 아래 "씬 생성 경로 (scene 모드)" § 를 따른다(같은 이중
  앵커 룰을 공유).

## 씬 생성 경로 (scene 모드)

산출 = `assets/scene-<id>.png`, 세로 1024×1536 (모달 카드 aspect). **배경 포함
생성** — 위 "투명 배경 계약"과 서브에이전트 임무 3의 알파 검증·크로마 폴백은
**layer 모드 에셋 전용이며 scene 모드는 skip**한다.

씬 프롬프트 스캐폴드 (오브제 스캐폴드와 별도 블록):

```
Use case: full-card background scene illustration for a mobile in-app
  message modal (headline text at top and a full-width button at bottom
  will be overlaid in HTML later).
Subject: [캐릭터 + 메타포 오브제 물리 상호작용 + 위성 소품 — 기획안 concept]
Style: [스타일 4종 표의 라인 — 캐릭터 있으면 "identical rendering style to
  the reference character" 추가]
Background: full illustrated scene — [브랜드 토큰 팔레트 서술]; decorative
  elements bleeding in from the frame edges (cropped by the frame edge).
Layout — STRICT safe zones: the TOP ~28% of the canvas is calm empty
  negative space (pure background, no objects) for headline overlay. The
  BOTTOM ~22% contains ONLY flat ground color and low decoration edges —
  no character parts, no key object. The hero cluster sits entirely inside
  the middle band, about 60% of canvas width.
Palette: [브랜드 토큰 색상 명시]
Character: [이중 앵커 + 복장 명시 — 위 § 룰 동일]
Constraints: no text, no letters, no numbers, no watermark, no
  photorealistic rendering, no human photography.
```

- 히어로(캐릭터-오브제 물리 상호작용)는 위 "캐릭터 포함 통짜 컴포지션 경로" §와
  동일한 이중 앵커 룰을 따른다 (시트 통째 1장 + 해당 복장 고해상 렌더 1장,
  Character 절에 복장 문장 명시). 장식은 폴리지·구름·컨페티 등이 프레임
  경계에 걸치는 엣지 블리드로 조립한다.
- **그라디언트 취향 룰**: Background 라인 조립 시 웜→쿨 투컬러 수직 스윕은
  금지한다(프로브 1차 실측 — 크림→블루 스윕을 사용자가 "촌스러움"으로 판정,
  근거표 참조). 허용 = ① 단색 솔리드 ② 동일 색상군 톤온톤 그라디언트 ③ 다크 +
  radial 스포트라이트. 팔레트는 브랜드 토큰 기반.
- 씬 안에는 텍스트·글자·숫자를 절대 넣지 않는다 — 텍스트는 발송본에서 HTML
  오버레이로 얹는다(번역 규칙 불변).
- 세이프존 미준수 산출(예: 하단 22%에 히어로 디테일이 침범, CTA존에 지면
  외 오브제 등장)은 **재생성 1회** — 검수 서브에이전트로 넘기기 전에 imagegen
  서브에이전트 자신이 산출 이미지를 육안(비전)으로 확인해 세이프존 위반
  여부를 자가확인한다.
- 발송본 HTML: `background: url(__BRAZE_MEDIA__/scene-<id>.png) center / cover`
  + HTML 텍스트존·CTA존 오버레이. 프리뷰는 make_preview.py 기계 변환 (기존
  레이어 모드와 동일 절차).

## 순서 계약

1. `mkdir -p {cwd}/assets` (메인) → `source:"generate"` 에셋 전부 병렬 dispatch.
2. 실패분만 순차 재시도 1회. 재실패 시 해당 에셋을 기획안에서 css/생략으로
   강등할지 사용자에게 보고 (조용한 누락 금지).
3. 전 에셋 확보 후 Step 4b(variant 빌더 dispatch)로 진행 — 빌더에게 에셋
   manifest(파일 경로 + role + placeholder 토큰 `__BRAZE_MEDIA__/<name>`)를 전달.

## 근거 — 프로브 실측 (2026-07-10)

듀얼 모드(layer/scene)와 위 이중 앵커·세이프존·그라디언트 룰의 근거는 도그푸딩
반려 후 진행한 프로브 3회 검증이다(공유 배경은 `_shared-contract.md` 참조):

| 회차 | 결함 | 이 문서 반영 |
|---|---|---|
| 1차 | 하단 세이프존 미지정 → CTA가 히어로를 덮음 | 씬 프롬프트에 STRICT 세이프존 강제, 세이프존 미준수 산출은 재생성 1회 |
| 2차 | 시트에 복장 여러 벌 공존 → 가운 소실 (캐논 드리프트) | 캐릭터 생성 앵커 = 이중(시트 통째 1장 + 해당 복장 고해상 렌더 1장), Character 절에 복장 문장 명시 |
| 3차 | 통과 (채택) | 캐릭터-오브제 상호작용 시 통짜 통합 생성을 예외가 아닌 기본 경로로 승격 |
