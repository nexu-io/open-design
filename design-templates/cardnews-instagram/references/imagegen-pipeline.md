# 이미지 생성 파이프라인 — codex image_gen 규약 + imagegen 서브에이전트 dispatch 지시

메인 에이전트: 배경 생성 호출은 **imagegen 서브에이전트에 위임**한다 — 표지 1회
순차(스타일 앵커 완성 확인 후 진행) → 본문 N-2개를 **한 턴에 병렬 dispatch**.
프롬프트는 메인이 아래 스캐폴드로 전량 조립해 전달하고, 서브에이전트는 실행+경로
반환만 한다(codex 장문 stdout을 메인 컨텍스트에서 격리). 병렬 dispatch가 실패하면
(rate limit 등) **순차 폴백**으로 같은 계약을 이행한다. dispatch 도구가 없는
런타임은 인라인 순차로 동일 절차(산출물 계약 동일). **합성(compose)·갤러리 Write는
메인이 직접** 한다 — 수 초·결정적 작업이라 위임 오버헤드가 더 크다.

**메인 에이전트가 codex 자체인 런타임**: CLI 재호출(중첩 spawn) 대신 내장
`image_gen` 도구를 직접 사용해도 된다 — 프롬프트 스캐폴드·스타일 앵커(view_image)·
산출 경로 계약(`bg/bg-NN.png`)은 동일하게 준수한다.

**배경 산출 경로 = `{cwd}/bg/` 하위 고정** — 중간산출을 프로젝트 루트에 두면
`*.png` 글롭·갤러리 나열이 배경을 집어가는 위생 문제(도그푸딩 실측). 삭제는
금지 — 배경 보존이 "텍스트 수정 시 재생성 불필요" 결정성 계약의 전제다.

## 실행 전제 (미충족 시 정직 안내 후 중단 — 대체 생성 경로 없음)

- codex CLI 0.135+ 로그인 상태(`codex doctor`로 확인) — `image_generation` 피처
- python3 + Pillow (합성)
- 한글 폰트: Pretendard 자동 탐색(`~/Library/Fonts` 등) → 나눔 폴백 → 미발견 시 설치 안내

## dispatch 입력

- `{cwd}` — 프로젝트 작업 디렉토리 절대 경로
- `{out_name}` — 산출 상대 경로: 표지 `bg/bg-01.png`, 본문 `bg/bg-NN.png` (cards.json index와 일치)
- `{prompt}` — 아래 스캐폴드로 조립한 생성 프롬프트 전문
- `{anchor_paths}` — view_image 참조 이미지 절대 경로 목록. 표지: **캐릭터 시트(등재
  시 필수)**. 표지가 시트 없이 생성되면 구형 체형이 bg-01로 이월돼 세트 전체가
  오염된다. **일반 가드 룰**: 브랜드 무드/구도 레퍼런스 이미지가 캐릭터를 시트와 다른
  체형으로 담고 있으면 view_image 앵커에서 **제외**한다 — 풀프레임 이미지의 체형은
  "정체성 금지" 텍스트 경고로 막지 못한다(도그푸딩 실측: bodoc cardnews-ref-cover의
  긴 팔다리가 bg-01을 캐논에서 끌어냄). 무드·라이팅·구도·텍스트 배치 의도는 프롬프트
  워딩으로 전달한다. 캐릭터가 없거나 시트와 동일 체형인 무드 레퍼런스만 앵커 유지 가능.
  본문: 반드시
  `{cwd}/bg/bg-01.png` 포함 + **캐릭터 시트(등재 시 필수)**(앵커 2장 — 스타일·팔레트는
  bg-01이, 캐릭터 정체성은 시트가 담당. 세대 드리프트 방지). 캐릭터 시트 = DESIGN.md
  등재 턴어라운드+포즈 시트, **통째 1장** 전달(셀 크롭 금지). 없으면 "없음".

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 카드뉴스 배경 이미지 생성 전담 에이전트다. 최종 텍스트 반환만이 메인에게
전달된다 — 잡담 없이 결과만.

1. 실행 (기본 샌드박스는 read-only라 cwd 복사가 실패한다 — 두 플래그 필수.
   `{cwd}/bg/` 디렉토리는 메인이 표지 dispatch 전에 만들어 둔다 — 순서 계약 1):

   ```bash
   codex exec --skip-git-repo-check --sandbox workspace-write -C {cwd} "<지시문>"
   ```

   `<지시문>` 조립: `{anchor_paths}`가 "없음"이 아니면 `먼저 view_image로 다음 이미지를
   확인하라: {anchor_paths}` 를 앞에 붙이고, `{prompt}` 전문 + `생성된 이미지를
   {cwd}/{out_name} 으로 복사하라` 로 마감한다.
2. `{cwd}/{out_name}` 존재 확인. 없으면 codex stdout에서 저장 경로
   (`~/.codex/generated_images/<uuid>/ig_*.png`)를 찾아 직접 복사한다.
3. 반환(1~2줄만): `OK {out_name}` 또는 `FAIL {out_name} — [사유 1줄]`.
   codex stdout 원문은 반환에 넣지 않는다.

## 프롬프트 스캐폴드 (메인이 조립)

```
Use case: photorealistic scene
Subject: [카드 내용에 맞는 실사 장면 — 현실 장소·상황 + DESIGN.md 비주얼 무드 키워드 반영]
Style: photorealistic real-world environment, cinematic natural lighting[, 브랜드 무드 키워드]
Palette: [DESIGN.md 팔레트 토큰 색상 명시]
Composition: portrait orientation. [cover: (고정) dominant subject framing /
  body: cards.json bg 필드 전개 — 아래 매핑 표의 shot·angle·placement 문구 나열]
  Keep the [텍스트 영역 — cover: lower-left third / body: lower half calm,
  low-contrast] simple and uncluttered.
Character: [브랜드 캐릭터 있을 때만] Use the exact same character as in the reference
  image — identical proportions, face, eyes, mouth, colors. Do not redesign,
  restyle, or reinterpret the character.
  [캐릭터 시트 앵커 있을 때 필수] The character sheet reference shows the SAME
  single character in multiple views and poses — match its proportions exactly
  (stubby unibody blob, no neck, short limbs), matte texture, tongue-visible
  mouth, and color. The body color must be the EXACT same blue as the sheet
  in every card[, DESIGN.md가 바디 hex를 명시하면: — exactly #RRGGBB (royal
  blue). Do NOT use the background accent color #......(팔레트 시안 토큰) for
  the character's body] — no lighter, paler, or cyan-shifted variants. Do not
  add accessories, collars, or clothing not present in the sheet[, 카드가
  소품·의상을 명시하면 해당 항목만 예외로 뒤에 나열].
  (Palette 라인의 브랜드 액센트 토큰은 배경·소품 전용 — 캐릭터 바디 색 정본은
  Character 절의 hex다. 액센트가 시안 계열이면 바디가 시안으로 끌리는 드리프트
  실측 — 도그푸딩-7.)
  If any other reference image conflicts with the sheet's character design,
  the sheet wins.
  [cover 고정: The character is the dominant subject: roughly 50-70% of frame
  height, near-center, full body, close-to-mid shot (no distant long shot).]
  [body: bg 매핑 표의 shot 스케일 + view 문구. no distant long shot 상수.]
  The character is interacting with props that match the card's message.
  Keep the character (head included) fully inside the central 4:5 crop
  region — the top and bottom ~8.3% of the frame are cropped away.
Constraints: no text, no letters, no numbers, no watermark, no logo,
  no flat illustration, no abstract graphic background.
```

### bg 필드 → 영어 전개 매핑 (본문 카드 — 스키마 정본은 card-structure.md)

| 선언 | 전개 문구 |
|---|---|
| `shot: "mid"` | full body, roughly 50-70% of frame height |
| `shot: "close-up"` | upper body from the waist up, roughly 70-90% of frame height |
| `angle: "eye"` | camera at the character's eye level |
| `angle: "low"` | camera slightly below the character's eye level, looking up |
| `angle: "high"` | camera slightly above the character's eye level, looking down |
| `placement: "left"` | character positioned in the left third of the frame |
| `placement: "center"` | character positioned near the center of the frame |
| `placement: "right"` | character positioned in the right third of the frame |
| `view: "front"` | facing the camera |
| `view: "three-quarter"` | three-quarter view, both eyes and mouth clearly visible |
| `locale` | Subject 라인의 장소·상황으로 영어 번역 반영 |

- **기본형(basic) 배경 = 실사 환경 고정** — 플랫/그래픽 일러스트 배경은 craft 룰 2
  위반. 자유형(free)은 후속 트랙에서 별도 정의.
- **캐릭터 스케일**: Composition의 "하반부 calm"은 캐릭터 축소·원경화 지시가
  아니다 — 캐릭터가 하반부로 내려와도 된다(가독은 하단 그라디언트 + 배경
  단순화가 담당). 원경 롱숏·상단 구석 배치·크롭 잘림이 도그푸딩 실패 패턴.
- **표지**: **캐릭터 시트(등재 시)를 유일 view_image 캐릭터/스타일 앵커**로 잡는다.
  무드·구도·라이팅·텍스트 배치는 프롬프트 워딩(cinematic window light, lower-left
  third 텍스트 영역 등)이 담당한다. 브랜드 무드 레퍼런스가 시트와 다른 체형의 캐릭터를
  담고 있으면 view_image 앵커로 쓰지 않는다(위 일반 가드 룰) — 체형 오염 방지.
- **본문**: 반드시 표지 산출물(`bg/bg-01.png`) + (캐릭터 브랜드면) 캐릭터 시트
  **2장을 view_image 참조** — "same style, same palette" + Character 절 + **앵커
  중력 해제 1줄(필수)**: "Match the style, palette, and character identity of
  the reference images, but do NOT copy their composition — this card uses the
  camera, framing, and placement specified above." 카드별 델타 = 표정·소품 +
  **구도(cards.json `bg` 필드의 매핑 표 전개)**. 라이팅 무드는 앵커 유지
  ("consistent bright natural daylight mood" 계열 1줄) — locale이 바뀌어도
  세트 톤은 묶인다.
- **CTA**: 생성 호출 없음 — compose가 `bg/bg-01.png`를 재사용한다(craft 룰 9).

## 순서 계약

1. `mkdir -p {cwd}/bg` (메인) → cards.json 확정 후 표지 dispatch 1회 →
   `{cwd}/bg/bg-01.png` 존재 확인 (스타일 앵커 — 완료 전 본문 진행 금지, 병렬 불가).
2. 본문 N-2개 병렬 dispatch → `bg/bg-02.png` … `bg/bg-{N-1}.png`. 실패한 카드만 순차
   재시도 폴백(전체 재생성 금지 — 성공분은 보존).
3. 메인이 직접 합성 (`--bg-dir` 필수 — 배경은 `bg/` 하위, 카드 산출은 cwd 루트):

   ```bash
   python3 <스킬 폴더>/scripts/compose_cards.py --spec {cwd}/cards.json --out-dir {cwd} \
     --bg-dir {cwd}/bg [--logo <DESIGN.md의 로고타입 에셋 절대 경로>]
   ```

4. 메인이 직접 `<slug>-preview.html` 갤러리 Write (구조는 SKILL.md 5e).
