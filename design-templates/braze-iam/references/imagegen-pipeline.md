# 오브제 이미지 생성 파이프라인 — gti 생성 규약 + imagegen 서브에이전트 dispatch 지시

> **dispatch 모델 = Opus 고정** (`model: "opus"` — 사용자 결정 2026-07-13). 이
> 스킬의 서브에이전트(imagegen·빌더·검수) 전부 동일.

메인 에이전트: 오브제 생성 호출은 **imagegen 서브에이전트에 위임**한다 — 기획안
`image.assets[]`에서 `source:"generate"`인 에셋 전부를 **한 턴에 병렬 dispatch**
(에셋 간 스타일 앵커 의존 없음 — cardnews의 표지 선행과 다르다). 실패분만 순차
재시도(성공분 보존, 전체 재생성 금지). 프롬프트는 메인이 아래 스캐폴드로 전량
조립해 전달하고, 서브에이전트는 실행+검증+경로 반환만 한다(병렬 실행 + 검증·
후처리를 메인 컨텍스트에서 격리 — codex exec 폴백 시 장문 stdout 격리 사유도
부활한다). dispatch 도구가 없는 런타임은 인라인 순차로 동일 절차.
`source:"library"`(브랜드 캐릭터 컷)와 `source:"css"`(코드 장식)는 생성 호출이
없다 — library는 파일 복사, css는 빌더가 그린다.

**메인 에이전트가 codex 자체인 런타임**: CLI 재호출(중첩 spawn) 대신 내장
`image_gen` 도구를 직접 사용해도 된다 — 스캐폴드·산출 경로 계약은 동일.

## 전송 계층 = gti (god-tibo-imagen)

생성 호출은 `gti` CLI가 정본 경로다 — codex exec과 같은 백엔드
(`chatgpt.com/backend-api/codex/responses`의 `image_generation` 툴,
`~/.codex/auth.json` 재사용)를 에이전트 루프 없이 단일 HTTP POST로 직접
호출한다. codex exec 대비 실측 차이 (gti 파일럿 2026-07-13 — 근거표 참조):

- 프롬프트 무재해석 전달 — codex 에이전트의 지시문 재해석 계층이 없다.
  반환 JSON의 `revisedPrompt`로 모델에 실제 전달된 문장을 확인할 수 있다.
- `--output <path>` 확정 저장 + 구조화 JSON 반환(`savedPath`·`responseId`·
  `httpStatus`) — generated_images 스캐빈징·행 감시·stdout 격리 불필요.
- 소요 ~30-70초/건 (codex exec ~5-7분 대비).
- `--size` 지정 가능: auto, 1024x1024, 2048x2048, 1536x1024, 2048x1152,
  3840x2160, 1024x1536, 2160x3840. 단 **캔버스 크기는 비보장** — 1024x1024
  요청에 1254² 반환 실측. bbox 트림(후처리 표준 2)이 흡수하므로 게이트 아님.

> **⚠️ 리스크**: gti는 비공식 프라이빗 API 의존이라 예고 없이 파손될 수 있다
> (gti 자체가 기동 시 동일 경고를 출력한다). 파손 시(비 200, 인증 실패,
> 스키마 변경) 폴백 = ① `gti --provider codex-cli` ② 아래 "폴백 경로
> (codex exec)" § 의 기존 절차. 폴백 절은 삭제 금지.

**산출 경로 = `{cwd}/assets/` 하위 고정** (`assets/obj-<id>.png`). 중간산출을
루트에 두면 글롭 위생 문제(cardnews 실측과 동일 원리). 생성 성공분은 삭제 금지.

## 실행 전제 (미충족 시 정직 안내 후 중단 — 대체 생성 경로 없음)

- gti v0.3.1+ 설치 확인 (`gti --version`) — Node.js 20+ 필요
- codex 로그인 자격 유효 (`~/.codex/auth.json`) — gti가 재사용한다. codex CLI
  자체(0.135+, `codex doctor`)는 "폴백 경로 (codex exec)" § 에서만 필요
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
- `{anchor_paths}` — 앵커 이미지 절대 경로 목록 (gti `--image <path>` 반복
  지정으로 첨부, codex exec 폴백에서는 view_image 참조). **오브제 생성은 기본 "없음"**
  — 타사 레퍼런스 스크린샷을 앵커로 쓰는 것은 금지(IP·캐릭터 오염). 예외는 캐릭터
  포함 통짜 컴포지션(아래 "캐릭터 포함 통짜 컴포지션" 절, layer·scene 공통)뿐이며
  그때는 **이중 앵커** — 캐릭터 시트(등재 시, 통째 1장 — 셀 크롭 금지) + 해당
  복장 고해상 렌더 1장을 전달한다. 시트 미등재 브랜드만 렌더 2~3컷.

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 Braze IAM 오브제 에셋 생성 전담 에이전트다. 최종 텍스트 반환만이 메인에게
전달된다 — 잡담 없이 결과만.

1. 실행:

   ```bash
   gti --prompt "{prompt}" --model gpt-5.5 --size 1024x1024 --output {cwd}/{out_name}
   ```

   **이미지 생성 모델은 `gpt-5.5` 고정** (`--model gpt-5.5`) — gti 기본값은
   `gpt-5.4`라 플래그 누락 시 에러 없이 다른 모델로 생성된다 (조용한 스타일
   드리프트 — codex 시절의 400 전패보다 발견이 늦다). `{anchor_paths}`가
   "없음"이 아니면 경로마다 `--image <path>`를 반복 지정한다. `{prompt}`는
   스캐폴드 원문 그대로 전달 — 지시문 조립(view_image 프리앰블·복사 마감
   문구)은 gti 경로에서 없다. `--size`는 에셋 ratio에 맞춘다 (1:1 =
   1024x1024, scene 세로 = 1024x1536).

   소요 ~30-70초/건 실측 — 단일 HTTP POST 확정 종료라 행 감시가 필요 없다.
   Bash timeout 180000ms 권장. 실패(비 200 `httpStatus`, 네트워크, 인증)면
   "폴백 경로 (codex exec)" § 로 전환한다.
2. 반환 JSON의 `savedPath` = `{cwd}/{out_name}` 확인 + `httpStatus` 200 확인.
   gti는 확정 저장이므로 파일 부재 = 실패다 — 별도 스캐빈징 없음.
3. **알파 검증**: 투명 배경 요청 에셋이면 아래로 판정한다(**layer 모드 에셋
   전용** — scene 모드는 배경까지 통째로 그리는 카드 전체 일러스트라 알파
   채널이 없다. 이 판정 자체를 skip한다. 아래 "씬 생성 경로 (scene 모드)" §
   참조).

   ```bash
   python3 -c "from PIL import Image; img=Image.open('{cwd}/{out_name}').convert('RGBA'); import sys; sys.exit(0 if any(a<255 for a in img.getchannel('A').getdata()) else 3)"
   ```

   exit 3(알파 없음 — 배경을 회색 체커보드 "투명 흉내"로 페인팅해 반환하는
   실측 포함, gti 파일럿 2026-07-13)이면 크로마키 폴백을 **이 서브에이전트
   안에서 1회** 수행: 같은 프롬프트의 Background 라인을 `solid pure light gray
   background (#B0B0B0), one flat color fill covering the entire canvas.
   The object floats with NO floor shadow, NO contact shadow, NO reflection
   below it. Object does not touch the frame edges. NO checkerboard pattern,
   NO transparency simulation.`로 교체해 재생성한다 — 그림자 금지를 반드시
   포함한다: 원문 Background 라인의 "no floor shadow"가 교체로 유실되면
   그림자가 베이크되고, 키잉 후 암색 얼룩으로 남는다 (글로시 파일럿
   실측 2026-07-14). 크로마 정본 = 중성 그레이 `#B0B0B0` (벨 4종 파일럿
   2026-07-14 — 에지 혼합이 색조 오염 없는 탈채도로만 남아 그린키 대비
   에지 암색 프린지 471→0px, 근거표 말미). **단 오브제 주 색군이 그레이·크롬
   계열이거나 내부에 배경색 유사 폐곡 영역(그레이 금속 부품 등)이 있으면
   크로마 색을 `#FF00FF`(마젠타)로 교체한다** — Background 라인과 아래
   `--color` 인자 동일 적용 (키 색상-오브제 충돌 및 2패스 구멍 오판 방지).
   재생성은 `--output {cwd}/{out_name}.chroma.png` 로 직접
   지정한다 — 최종 경로 `{cwd}/{out_name}` 를 덮어쓰지 않는다. 이어서
   `python3 <스킬 폴더>/scripts/cut_character.py {cwd}/{out_name}.chroma.png {cwd}/{out_name} --color "#B0B0B0"`
   로 키잉하고, 키잉 성공 후 중간산출 `{cwd}/{out_name}.chroma.png` 를
   삭제한다(assets/ 글롭에 크로마 원본이 남으면 검수·미디어 업로드로 누출).
4. 반환(1~2줄만): `OK {out_name}` 또는 `FAIL {out_name} — [사유 1줄]`.
   gti 반환 JSON 전문(특히 `revisedPrompt`)이나 codex stdout 원문은 반환에
   넣지 않는다 — 판정에는 `savedPath`·`httpStatus`만 쓴다.

## 투명 배경 계약

**layer 모드 전용 계약** — scene 모드는 배경 포함 생성이므로 이 계약 전체를
skip한다(아래 "씬 생성 경로 (scene 모드)" § 참조). 기본 경로 = 투명 직생성
(스캐폴드 Background 라인, gpt-5.5 투명 직생성 실측 확인 2026-07-10).
서브에이전트가 알파 검증으로 실효를 확인하고, 미지원 산출이면 크로마키 폴백이
자동 발동한다(위 임무 3).

## 생성 후 검증·후처리 표준 (layer 모드)

알파 검증 통과 직후, imagegen 서브에이전트가 순서대로 수행한다 (복제 파일럿
실측 2026-07-13 — 근거표는 문서 말미):

1. **풀해상 크롭 게이트**: 1024² 원본에서 확대 크롭 3분할(포컬 중앙·오브제
   에지·프레임 인접부)을 직접 Read(비전)해 재질·에지 결함을 검사한다. 축소
   프리뷰 스팟체크만으로 통과 금지 — 플랫 벡터 붕괴가 축소 렌더에서는 통과로
   보인다. 결함 발견 시 재생성 1회.
2. **알파 bbox 트림**: 콘텐츠 bbox(alpha>8) 기준으로 잘라 저장한다. 1024²
   캔버스 콘텐츠 fill ~58% 실측 — 트림 없이는 HTML 표시 폭 ≠ 실효 폭이라
   히어로 스케일 계약(visual-layout-patterns.md §6 프레임 폭 40~60%)이
   어긋난다. 빌더는 트림된 실효 콘텐츠 폭 기준으로 표시 폭을 계산한다.
   **트림 전 정리는 cut_character.py 내장** (2026-07-14 개정 — 구 수동 정리
   3종 폐기): 테두리 중앙값 flood fill 연결성분 키잉이 비네트·그라디언트
   스트레이를 흡수하고(코너 스트레이의 bbox 풀캔버스 오염 → 트림 no-op 실측
   해소), 성분 크기 + 본체 원격 필터(`--min-component` 기본 60px, 본체
   실루엣 12px 이내 소파편은 에지 일부로 보존)가 스펙클을 제거한다.
   **저알파 일괄 제거 금지** — 소프트 에지를 파괴한다 (에지 품질은 성분 크기
   필터로만). 스크립트 반환 transparent 수치 <30%면 전실패로 간주해 크로마
   재생성 1회 (크로마 배경색 런 분산 실측 — 성공 메시지 신뢰 금지).
3. **다운스케일은 프리멀티 필수**: 리사이즈가 필요하면 프리멀티플라이드
   (RGB×A) → LANCZOS → 언프리멀티 순서로만. PIL은 채널 독립 리샘플이라
   비프리멀티 리사이즈는 투명 픽셀의 잔존 RGB(크로마 그린 등)를 에지로
   재유입시킨다 (그린 헤일로 실측).
4. **디스필 폐기 — 에지 복원 3단이 대체** (2026-07-14 개정): cut_character.py가
   경계 밴드(배경 인접 4px)에서 ① `alpha = clamp((dist−threshold)/램프)` 로
   반투명 복원 ② 반투명 픽셀 RGB는 최근접 솔리드 전경 픽셀 색으로 확장
   (언믹스 나눗셈 `(픽셀−(1−α)bg)/α` 는 저알파에서 노이즈 증폭 — RGB 표준편차
   66→12 실측으로 색 확장이 대체) ③ 경계 지대(안팎 2px)만 가우시안 페더(σ0.9)
   — dist 램프가 실측 <1px라 남던 계단 실루엣을 2~5px 소프트 에지로 해소.
   배경색이 기지수라 수동 디스필(키 색상 채널 클램프)이 불필요하고, 디스필이
   만들던 암색·탁색 프린지도 원리적으로 소멸 (벨 4종 파일럿: 그린키+디스필
   에지 암색 471px·탁한 무채색 1,124px·소프트에지 0 → 그레이키+에지 복원
   0px·0px·반투명 ~15,000px). 투명 직생성 에셋에는 종전대로 색 보정 금지.

비례 제어 주의: 오브제 내부 비례(예: "디스크 대비 스프레드 1.4×")를 생성
지시로 강제하지 않는다 — 수치 지시에 2.44/1.15/1.97 오실레이션 실측. 비례가
중요하면 생성 후 Pillow 실측 → HTML 표시 폭 역산으로 제어한다.

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
  rendering, no human photography, no full illustrated scene, no storybook
  style, no character, no mascot holding the object, no pastel-on-pastel wash.
```

### 오브제 스타일 스캐폴드 4종 — Style 라인

| style | Style 라인 전개 |
|---|---|
| `flat-icon` | flat graphic object, bold geometric shapes, solid fills, crisp edges |
| `2d-illust` | flat 2D vector illustration, clean shapes, subtle texture, friendly rounded forms |
| `3d-illust` | high-end 3D icon render of an object cluster (main object + max 2 satellites), glossy soft-touch plastic material, vibrant saturated colors, clean studio lighting, soft reflections, subtle ambient occlusion between volumes, crisp silhouette, floating at a slight playful tilt |
| `3d-icon` | high-end 3D icon render of a single object, glossy soft-touch plastic material, vibrant saturated colors, clean studio lighting, soft reflections, subtle ambient occlusion between volumes, crisp silhouette, floating at a slight playful tilt, centered |

`3d-illust`/`3d-icon`의 글로시 렌더 문구는 사용자 지정 고정 계약 (2026-07-14 —
클레이 질감 품질 사유로 보드 25핀 클레이 계약을 대체, gti 토글 파일럿 게이트
통과로 검증). 임의 축약·재해석 금지. **Style 라인은 표 원문 그대로 쓰고,
재질·형태 강화 어휘(NOT flat vector, NOT clay, NOT plasticine texture, 스쿼클
front-on 등)는 원문 뒤에 덧붙이기만 한다** — 질감 어휘를 빼거나 약화해 조립하면
gpt-5.5가 플랫 벡터/스티커로 수렴한다 (복제 파일럿 반려 실측 2026-07-13 —
클레이 시절 실측이나 원리는 스타일 무관, 글로시 재생성에서도 재재현). 컨페티
장식이 기획안에 있으면 `a few small confetti pieces (5-6 max)` 를 Style 라인
뒤에 덧붙인다.

**실사 전면 금지** — 4종 밖 style 값은 조립 거부하고 기획안 수정을 요구한다.
어떤 스타일·오브제를 쓸지는 기획안(Step 3)에서 Claude가 목적·톤 기반으로 이미
결정돼 있다 — 서브에이전트는 재해석하지 않는다.

## 오브제-메시지 의미 정합 (핵심 룰)

오브제 = 메시지 메타포 (토글=알림ON, 낚싯바늘=혜택 잡기, 달력=마감일 —
`visual-layout-patterns.md` §4 사례표가 정본). Subject 라인에 "보여야 하는 것
(오브제·상태)"을 명시하고, 오독을 만들 수 있는 요소는 Constraints에 "보이면
안 되는 것"으로 명시한다 (cardnews 소품-의미 룰과 동일 원리).

## 캐릭터 포함 통짜 컴포지션 경로

> **⛔ IAM 사용 금지 — 2026-07-13 사용자 결정.** 생성 캐릭터의 캐논 얼굴 재현
> 불가 실측 (등신비 강제 + 이중 앵커 + 헤어 핀에도 3연속 얼굴 드리프트,
> 재도그푸딩 v2~v4). 라이브러리 컷 직사용 포함 캐릭터 자체를 IAM에 넣지
> 않는다 — 히어로는 의미-지시 소품(visual-layout-patterns.md §4)으로.
> 아래 기술 절차는 타 채널 재사용 대비 기록용으로만 존치.

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
- **등신비 강제 문구 필수** (재도그푸딩 반려 실측 2026-07-13 — "identical
  proportions"만으로는 gpt-5.5가 4등신 치비 마스코트로 재해석한다): Character
  절에 "Preserve the sheet's adult proportions exactly — same head-to-body
  ratio (about 6 heads tall), slim build. Do NOT chibify, do NOT shorten the
  body, do NOT enlarge the head." 를 반드시 포함한다.
- layer 모드에서는 이 경로도 배경은 투명 — 배경은 여전히 CSS다. scene 모드의
  히어로 컴포지션은 아래 "씬 생성 경로 (scene 모드)" § 를 따른다(같은 이중
  앵커 룰을 공유).

## 씬 생성 경로 (scene 모드)

> **존치 보류 (2026-07-13)**: 레퍼런스 보드 25핀에 카드 전체 생성 씬 문법 0핀 —
> scene 모드는 개정 문법 재도그푸딩(소품 히어로) 실무 판정 후 존치/축소/폐지를
> 결정한다. 그 전까지 신규 캠페인 기본은 layer.

산출 = `assets/scene-<id>.png`, 세로 1024×1536 (모달 카드 aspect). **배경 포함
생성** — 위 "투명 배경 계약"과 서브에이전트 임무 3의 알파 검증·크로마 폴백은
**layer 모드 에셋 전용이며 scene 모드는 skip**한다.

씬 프롬프트 스캐폴드 (오브제 스캐폴드와 별도 블록):

```
Use case: full-card background scene illustration for a mobile in-app
  message modal (headline text at top and a full-width button at bottom
  will be overlaid in HTML later).
Subject: [단일 의미-지시 소품 히어로 — 기획안 concept. 위성 소품은
  의미 있는 것만 ≤2. 캐릭터 금지 — IAM 전면 미포함 2026-07-13]
Style: [스타일 4종 표의 라인] — clean minimal fintech illustration,
  generous negative space.
Background: minimal abstract color field — [브랜드 토큰 팔레트 서술, 허용 3형
  (단색 솔리드/동일 색상군 톤온톤/다크+스포트라이트)]. The backdrop is a
  studio-like color field, NOT a place: no sky, no clouds, no foliage, no
  bushes, no trees, no hills, no horizon line, no sparkles, no confetti.
Layout — STRICT safe zones: the TOP ~32% of the canvas is calm empty
  negative space (pure background, no objects) for headline overlay. The
  BOTTOM ~22% contains ONLY flat ground color and low decoration edges —
  no hero parts, no key object. The hero cluster sits entirely inside
  the middle band, about 60% of canvas width. Achieve the safe zones through
  NATIVE composition only — do NOT satisfy them by masking or overlaying
  flat rectangles in post-processing; the character must be fully visible
  head to feet.
Palette: [브랜드 토큰 색상 명시]
Constraints: no text, no letters, no numbers, no watermark, no
  photorealistic rendering, no human photography, no character, no mascot,
  no storybook or children's-book illustration style, no fairy-tale scenery,
  no pastel-on-pastel wash.
```

- 히어로 = 단일 의미-지시 소품 (visual-layout-patterns.md §3·§4). 캐릭터는
  씬에서도 IAM 전면 미포함 (2026-07-13 사용자 결정) — Character 절 없이 조립한다.
- **미니멀 씬 미학** (재도그푸딩 반려 실측 2026-07-13 — 근거표 참조): 배경은
  "장소"가 아니라 추상 컬러 필드다. 환경 묘사(하늘·구름·수풀·나무·언덕·지평선·
  스파클 씬) 금지, 스토리북/유아 일러스트 톤 금지, 위성 소품은 의미 있는 것만
  ≤2. 구 계약의 "엣지 블리드 장식(폴리지·구름·컨페티)"은 이 반려로 폐기 —
  프레임 경계 장식이 필요하면 브랜드 토큰 색 추상 도형(블러 오브·기하 실루엣)만.
- **사후 마스킹 금지**: 세이프존은 네이티브 구도로만 충족한다. 프롬프트만으로
  세이프존을 주면 생성 측이 일러스트 위에 플랫 사각 오버레이를 덮어 "충족"시킨다
  (codex 에이전트 경로에서 캐릭터 허리 절단 실측 2026-07-13). 스캐폴드의 NATIVE
  composition 문구를 유지한다. codex exec 폴백 시에는 복사 마감 지시문도
  `생성된 이미지를 어떤 편집·마스킹·후처리도 없이 그대로 {cwd}/{out_name} 으로
  복사하라`로 조립한다.
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
- 발송본 HTML: `background: url(<씬 에셋의 Media Library CDN URL>) center / cover`
  (placeholder 폴백 시 `url(__BRAZE_MEDIA__/scene-<id>.png)` + 프리뷰
  make_preview.py 기계 변환) + HTML 텍스트존·CTA존 오버레이 (기존 레이어
  모드와 동일 절차 — 업로드는 순서 계약 3).

## 순서 계약

1. `mkdir -p {cwd}/assets` (메인) → `source:"generate"` 에셋 전부 병렬 dispatch.
2. 실패분만 순차 재시도 1회. 재실패 시 해당 에셋을 기획안에서 css/생략으로
   강등할지 사용자에게 보고 (조용한 누락 금지).
3. 전 에셋 확보 후 **메인이 직접 Media Library 업로드** (SKILL.md Step 4a-b —
   `scripts/upload_media.py`, 자격 env/`~/.config/marketing-ax/braze.env`) →
   반환 `{에셋 파일명: CDN URL}` 매핑 확보. 업로드 불가 시 placeholder 폴백
   (종전 `__BRAZE_MEDIA__/<name>` 토큰 경로) — 폴백 사실을 사용자에게 보고.
4. Step 4b(variant 빌더 dispatch)로 진행 — 빌더에게 에셋 manifest(파일 경로 +
   role + CDN URL — 폴백 시 placeholder 토큰 `__BRAZE_MEDIA__/<name>`)를 전달.

## 폴백 경로 (codex exec) — gti 파손 시 전용

> gti가 비공식 API 파손·인증 실패로 동작하지 않을 때만 쓴다. 1차 폴백은
> `gti --provider codex-cli`(gti가 내부에서 codex CLI를 대신 호출), 그것도
> 불가하면 아래 수동 절차. 스캐폴드·검증·후처리 계약은 동일하고 **실행
> 계층만** 다르다.

1. 실행 (기본 샌드박스는 read-only라 cwd 복사가 실패한다 — 두 플래그 필수):

   ```bash
   codex exec -c model="gpt-5.5" --skip-git-repo-check --sandbox workspace-write -C {cwd} "<지시문>" < /dev/null
   ```

   모델 `gpt-5.5` 고정 사유 — codex 기본 모델(예: `gpt-5.6-luna`)은
   image_generation 400 실패, `gpt-5.1-codex*`는 ChatGPT 계정 미지원(400).
   모델 플래그 누락 시 조용한 전패(도그푸딩 실측). 백그라운드 실행 시 stdin
   닫기(`< /dev/null`) 필수 — 무한 행 48분 실측.

   `<지시문>` 조립: `{anchor_paths}`가 "없음"이 아니면 `먼저 view_image로 다음
   이미지를 확인하라: {anchor_paths}` 를 앞에 붙이고, `{prompt}` 전문 + `생성된
   이미지를 어떤 편집·마스킹·후처리도 없이 그대로 {cwd}/{out_name} 으로
   복사하라` 로 마감한다 (크로마 폴백 재생성이면 `{cwd}/{out_name}.chroma.png`).

   **행 감시** (stdin을 닫아도 행이 발생한다 — 22분 CPU 0% 실측 2026-07-13):
   1차 생성 기준시간 ~5-7분. 기준 2배 경과 + CPU 0%면 프로세스 kill 후 재실행.
   재실행 전 기존 검증 통과본이 있으면 `.verified.bak`로 백업하고 잔여 codex
   프로세스를 kill한다 (병렬 재실행 레이스가 검증본을 덮어쓴 실측).
2. `{cwd}/{out_name}` 존재 확인. 없으면 codex stdout에서 저장 경로
   (`~/.codex/generated_images/<uuid>/ig_*.png`)를 찾아 직접 복사한다.
3. codex 장문 stdout은 메인 컨텍스트에 넣지 않는다 (서브에이전트 격리 사유).
   이후 알파 검증·크로마 폴백·후처리 표준은 본문 임무 3 이하와 동일.

## 근거 — 프로브 실측 (2026-07-10)

듀얼 모드(layer/scene)와 위 이중 앵커·세이프존·그라디언트 룰의 근거는 도그푸딩
반려 후 진행한 프로브 3회 검증이다(공유 배경은 `_shared-contract.md` 참조):

| 회차 | 결함 | 이 문서 반영 |
|---|---|---|
| 1차 | 하단 세이프존 미지정 → CTA가 히어로를 덮음 | 씬 프롬프트에 STRICT 세이프존 강제, 세이프존 미준수 산출은 재생성 1회 |
| 2차 | 시트에 복장 여러 벌 공존 → 가운 소실 (캐논 드리프트) | 캐릭터 생성 앵커 = 이중(시트 통째 1장 + 해당 복장 고해상 렌더 1장), Character 절에 복장 문장 명시 |
| 3차 | 통과 (채택) | 캐릭터-오브제 상호작용 시 통짜 통합 생성을 예외가 아닌 기본 경로로 승격 |

재도그푸딩 반려 실측 (2026-07-13, 동일 캠페인 scene 모드):

| 결함 | 이 문서 반영 |
|---|---|
| 엣지 블리드 계약(폴리지·구름·컨페티)이 스토리북/유아 일러스트 배경을 유도 — 사용자 "동화책 같다" 반려 | 씬 스캐폴드 Background를 미니멀 추상 컬러 필드로 재정의, 환경 묘사·스토리북 스타일 금지 상수화, 엣지 블리드 폐기 |
| "identical proportions" 문구에도 캐릭터가 4등신 치비로 드리프트 (양 모드 공통) | Character 절에 등신비 강제 문구(6 heads tall / no chibify) 필수화 |
| 세이프존을 프롬프트만 주면 codex가 사후 사각 오버레이로 "충족" (캐릭터 허리 절단) | 스캐폴드 NATIVE composition 문구 + 복사 지시문 "편집·마스킹·후처리 없이" 상수화 |
| codex exec 행 — stdin 닫아도 22분 CPU 0% | 행 감시(기준 2배+CPU 0% → kill 재실행, .verified.bak 백업) 명문화 — 현재는 "폴백 경로 (codex exec)" § 전용 |

레퍼런스 보드 전수 분석 반영 (2026-07-13, 재도그푸딩 3차 반려 후 — 실사용 IAM
25핀, `visual-layout-patterns.md` 헤더 참조):

| 관찰 | 이 문서 반영 |
|---|---|
| 등신비 강제·이중 앵커·헤어 핀에도 v2~v4 3연속 얼굴 캐논 드리프트 — gpt-5.5 얼굴 재현 불가 실측, 사용자 캐릭터 전면 미포함 확정 | 캐릭터 통짜 컴포지션 경로 ⛔, 씬 스캐폴드에서 Character 절 제거, Constraints에 no character/no mascot 상수 |
| 보드 지배 질감 = 소프트 클레이 3D, 단일 색군, 매트+글로시 하이라이트 1, 살짝 기울여 부양 | `3d-icon`/`3d-illust` Style 라인을 클레이 렌더 고정 문구로 재정의 — **2026-07-14 사용자 결정으로 글로시 라인 대체됨 (말미 글로시 전환 실측 참조)** |
| 보드 0핀 문법 = 풀 일러스트 씬·스토리북·캐릭터 행동·파스텔-온-파스텔 | 오브제 스캐폴드 Constraints에 금지어 4종 상수 추가 |

복제 파일럿 실측 (2026-07-13, pin-22 메달 모달 + 벨 하단시트 2건 — 레퍼런스
완전 복제로 파이프라인 상한 검증. 레퍼런스 픽셀 실측·나란히 대조는 검증
도구이며 프로덕션 절차가 아니다 — 프로덕션은 기획안·계약 수치로 진행하고,
아래 레퍼런스-비의존 항목만 계약 반영):

| 실측 | 이 문서 반영 |
|---|---|
| Style 라인에서 "single-hue color family" 삭제 조립 → 플랫 벡터 수렴 (사용자 반려), 원문 복원 + 클레이 어휘 덧붙임으로 즉시 해소 | Style 라인 원문 보존·덧붙임만 허용 명문화 |
| 플랫 벡터 결함이 축소 프리뷰에서는 통과로 보임 — 원본 확대로만 적발 | 풀해상 크롭 게이트 신설 (후처리 표준 1) |
| 1024² 캔버스 콘텐츠 fill 58% → 표시 폭 ≠ 실효 폭 | 알파 bbox 트림 표준화 (후처리 표준 2) |
| 비프리멀티 LANCZOS가 투명 픽셀 그린 RGB를 에지 재유입 (그린 헤일로) | 프리멀티 다운스케일 필수화 (후처리 표준 3) |
| 그린 계열 오브제 + 그린 크로마 = 키잉 충돌 위험 | 크로마 폴백 색 조건부 마젠타 (임무 3) |
| 비례 수치 지시(1.4×)에 2.44/1.15/1.97 오실레이션 | 비례는 생성 지시로 강제 금지 — 실측 역산 제어 (후처리 표준 말미) |
| 상단 세이프존 28% < 실소요 ~32% (아이브로우+헤딩+본문 3줄, 본문-히어로 충돌 실측) | 씬 스캐폴드 TOP ~28% → ~32% 캘리브레이션 |

gti 파일럿 실측 (2026-07-13, signup `obj-lock` 3d-icon 동일 스캐폴드 재생성 —
전송 계층 교체 검증):

| 실측 | 이 문서 반영 |
|---|---|
| 단일 HTTP POST 확정 종료, 소요 69초/36초 (codex exec ~5-7분 대비), `--output` 확정 저장 + 구조화 JSON, dry-run으로 프롬프트 무재해석 전달 확인, 품질 = 기존 codex 산출과 동급 (풀해상 크롭 게이트 통과) | 전송 계층 codex exec → gti 교체. 행 감시·generated_images 스캐빈징·stdout 격리·지시문 조립은 "폴백 경로 (codex exec)" § 로 강등 |
| gti 기본 모델 = gpt-5.4 — 플래그 누락 시 에러 없이 다른 모델로 생성 | `--model gpt-5.5` 명시 필수 (임무 1) |
| 1024x1024 요청 → 1254² 반환 (캔버스 크기 비보장) | bbox 트림(후처리 표준 2)이 흡수 — 게이트 아님으로 명기 |
| 투명 직생성이 회색 체커보드 "투명 흉내" 페인팅으로 반환 (알파 0%) — 알파 검증이 적발, 마젠타 크로마 폴백 + cut_character.py + 풀 디스필(프린지 3,277px→0) 정상 동작 | 알파 검증·크로마 폴백 계약은 전송 계층 무관 존치 재확인. 폴백 Background 교체문에 체커보드·투명 시뮬레이션 금지 문구 추가 |

글로시 전환 실측 (2026-07-14, 토글 오브제 — 클레이/글로시 대조 파일럿):

| 실측 | 이 문서 반영 |
|---|---|
| 사용자 클레이 질감 품질 불만 → 글로시 소프트터치 플라스틱 라인 지정, gti 파일럿 크롭 게이트 통과 (AO·크리스프 실루엣·그레인 0) | Style 표 `3d-illust`/`3d-icon`을 사용자 지정 글로시 라인으로 교체 — 보드 25핀 클레이 질감 계약 대체 (사용자 결정 2026-07-14). visual-layout-patterns.md·SKILL.md의 클레이 서술 동시 갱신 |
| 크로마 폴백 Background 교체가 원문 "no floor shadow"를 유실 → 그림자 베이크 → 키잉·디스필 후 암색 얼룩 | 크로마 교체문에 NO floor shadow / NO contact shadow / NO reflection 상수화 (임무 3) |
| 키잉이 놓친 코너 비네트 스트레이 ~10px → bbox 풀캔버스 오염 → 트림 조용히 no-op. 소프트 섀도 에지 = 디스필 후 다크 스펙클 헤일로 2,225px | 후처리 표준 2에 "트림 전 정리" 3종(에지 밴드·저알파·암색 스펙클) 신설 — **2026-07-14 벨 4종 파일럿으로 cut_character.py 내장 flood fill·성분 필터에 대체됨 (말미 벨 파일럿 표 참조)** |
| 크로마 배경색 런 분산 — 동일 지시에 (247,14,220) 등으로 반환, 1회는 키잉 톨러런스 밖 전실패 (transparent 0%) | 키잉 후 투명율 검사(<30%면 재생성 1회) 필요 — cut_character.py 반환 transparent 수치로 판정 |

벨 4종 스타일 파일럿 실측 (2026-07-14, flat-icon/2d-illust/3d-illust/3d-icon —
그레이 크로마 + cut_character.py flood fill 재작성 검증):

| 실측 | 이 문서 반영 |
|---|---|
| 투명 직생성 4/4 전패 (전건 가짜 체커보드) — 크로마 폴백이 사실상 기본 경로임을 4연속 재확인 | 폴백 시간 배분 상정 유지 (건당 1차 시도+폴백 ~2-3분) |
| 그린키+디스필 산출의 에지밴드 = 암색 471px + 탁한 무채색 1,124px + 반투명 0 (하드컷) — "오려낸 티"의 정체. 그레이키+언믹싱 = 0px/0px/반투명 1,628px | 크로마 정본 #00FF00 → #B0B0B0, cut_character.py를 테두리 중앙값 + flood fill 연결성분 + 폐곡 2패스 + 에지 언믹싱 + 성분 크기 필터로 재작성. 수동 정리 3종·풀 디스필·저알파 일괄 제거 폐기 |
| 고정 threshold 색거리 키잉은 비네트·그라디언트에 취약 (스트레이 잔존 or 오브제 침식) — flood fill이 테두리 연결 성분만 제거해 흡수 | 후처리 표준 2 개정 (스크립트 내장) |
| 오브제 내부의 배경색 유사 폐곡 영역은 2패스 구멍 판정(성분 중앙값 dist ≤ threshold×0.6)에 오제거될 수 있음 | 그레이·크롬 계열 오브제 = 마젠타 폴백으로 조건 개정 (임무 3) |
| 스펙클 크기 단독 판정이 실루엣 AA 전이 파편(1~16px)을 오폭 — 벨 림 오삭제 315px (3d-illust, 사용자 적발) | 스펙클 필터에 본체 원격 조건 추가 (본체 12px 이내 소성분 보존, 원격 소성분만 램프 링 포함 삭제) — 수정 후 4종 오삭제 0px |
| dist 램프 밴드 실측 <1px → 계단 실루엣 (행별 반투명 폭 0.4px), 언믹스 나눗셈이 저알파 색 노이즈 증폭 (RGB std 66) — 사용자 적발 | 에지 복원 3단으로 개정: 램프 알파 + 최근접 솔리드 색 확장 + 경계 가우시안 페더(σ0.9) — 반투명 에지 ~15,000px 단조 램프, 저알파 std 12 (후처리 표준 4) |
