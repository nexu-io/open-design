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
- `{out_name}` — 산출 상대 경로: `assets/obj-<asset id>.png`
- `{prompt}` — 아래 스캐폴드로 조립한 생성 프롬프트 전문
- `{anchor_paths}` — view_image 참조 절대 경로 목록. **오브제 생성은 기본 "없음"**
  — 타사 레퍼런스 스크린샷을 앵커로 쓰는 것은 금지(IP·캐릭터 오염). 예외는 캐릭터
  포함 통짜 컴포지션(아래 예외 절)뿐이며 그때는 **캐릭터 시트(등재 시, 통째 1장 —
  셀 크롭 금지)를 우선** 전달하고, 시트 미등재 브랜드만 렌더 2~3컷.

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
3. **알파 검증**: 투명 배경 요청 에셋이면 아래로 판정한다.

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

기본 경로 = 투명 직생성(스캐폴드 Background 라인, gpt-5.5 투명 직생성 실측 확인
2026-07-10). 서브에이전트가 알파 검증으로 실효를 확인하고, 미지원 산출이면
크로마키 폴백이 자동 발동한다(위 임무 3).

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

## 예외 경로 — 캐릭터 포함 통짜 컴포지션

기본은 레이어 합성(캐릭터 `library` 컷 + 오브제 `generate` + 장식 `css`)이다.
캐릭터와 오브제의 **물리 상호작용**(안기·끌기·올라타기 등)이 메시지에 필수일 때만
통짜 생성을 쓴다:

- `{anchor_paths}` = **캐릭터 시트 통째 1장 우선** (브랜드 에셋 라이브러리 등재
  턴어라운드+포즈+표정 시트 — 정체성·포즈·표정 어휘를 한 장이 담는다. **셀 크롭
  금지**, cardnews 검증 계약). 시트 미등재 브랜드만 렌더 2~3컷 폴백.
- Pose/Expression 지시: 시트의 해당 행을 매핑해 "as in the sheet's IDLE/ACTIONS/
  SITTING row", "match the sheet's <표정명> cell" 문구로 조립한다 (cardnews 매핑
  방식 — 시트가 어휘를 담으므로 낱장 컷보다 지시 정밀도가 높다).
- cardnews 가드 룰 적용: 시트/렌더와 다른 체형의 레퍼런스는 앵커 금지 —
  "정체성 금지" 텍스트 경고로는 체형 오염을 못 막는다(도그푸딩 실측)
- Character 절: "Use the exact same character as in the reference images —
  identical proportions, face, colors. Do not redesign, restyle, or reinterpret."
- 이 경로도 배경은 투명 — 배경은 여전히 CSS다.

## 순서 계약

1. `mkdir -p {cwd}/assets` (메인) → `source:"generate"` 에셋 전부 병렬 dispatch.
2. 실패분만 순차 재시도 1회. 재실패 시 해당 에셋을 기획안에서 css/생략으로
   강등할지 사용자에게 보고 (조용한 누락 금지).
3. 전 에셋 확보 후 Step 4b(variant 빌더 dispatch)로 진행 — 빌더에게 에셋
   manifest(파일 경로 + role + placeholder 토큰 `__BRAZE_MEDIA__/<name>`)를 전달.
