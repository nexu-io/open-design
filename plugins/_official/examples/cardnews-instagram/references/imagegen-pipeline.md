# 이미지 생성 파이프라인 — gti 생성 규약 + imagegen 서브에이전트 dispatch 지시

메인 에이전트: 배경 생성 호출은 **imagegen 서브에이전트에 위임**한다 — 표지 1회
순차(스타일 앵커 완성 확인 후 진행) → 본문 N-2개를 **한 턴에 병렬 dispatch**.
프롬프트는 메인이 아래 스캐폴드로 전량 조립해 전달하고, 서브에이전트는 실행+경로
반환만 한다(병렬 실행 격리 — codex exec 폴백 시 장문 stdout 격리 사유도
부활한다). 병렬 dispatch가 실패하면(rate limit 등) **순차 폴백**으로 같은 계약을
이행한다. dispatch 도구가 없는 런타임은 인라인 순차로 동일 절차(산출물 계약
동일). **합성(compose)·갤러리 Write는 메인이 직접** 한다 — 수 초·결정적 작업이라
위임 오버헤드가 더 크다.

**메인 에이전트가 codex 자체인 런타임**: CLI 재호출(중첩 spawn) 대신 내장
`image_gen` 도구를 직접 사용해도 된다 — 프롬프트 스캐폴드·스타일 앵커(view_image)·
산출 경로 계약(`bg/bg-NN.png`)은 동일하게 준수한다.

## 전송 계층 = gti (god-tibo-imagen)

생성 호출은 `gti` CLI가 정본 경로다 — codex exec과 같은 백엔드
(`chatgpt.com/backend-api/codex/responses`의 `image_generation` 툴,
`~/.codex/auth.json` 재사용)를 에이전트 루프 없이 단일 HTTP POST로 직접
호출한다. codex exec 대비 실측 차이 (braze-iam gti 파일럿 2026-07-13 + cardnews
앵커 파일럿 2026-07-14 — 근거표는 문서 말미):

- 프롬프트 무재해석 전달 — codex 에이전트의 지시문 재해석 계층이 없다.
  반환 JSON의 `revisedPrompt`로 모델에 실제 전달된 문장을 확인할 수 있다.
- `--output <path>` 확정 저장 + 구조화 JSON 반환(`savedPath`·`responseId`·
  `httpStatus`) — generated_images 스캐빈징·행 감시·stdout 격리 불필요.
- `--image <path>` 반복 지정 = 앵커 이미지 첨부 — view_image 프리앰블 조립을
  대체한다. **캐릭터 시트 앵커 정합 실측 통과** (cardnews 파일럿 2026-07-14:
  시트 1장 앵커로 실사 씬 내 캐릭터 캐논 재현 — 체형·색·표정 시트 일치).
- 소요 ~30-70초/건 (codex exec ~5-7분 대비).
- `--size 1024x1536`(2:3 세로) 지정 — 중앙 4:5 크롭 계약(상하 ~8.3% 크롭)과
  정확히 일치한다. 단 **캔버스 크기는 비보장** (braze 파일럿: 1024x1024 요청에
  1254² 반환 실측. cardnews 파일럿은 1024x1536 정확 반환) — compose의 중앙 4:5
  크롭 + LANCZOS 리사이즈가 비율·규격을 최종 보장하므로 게이트 아님.

> **⚠️ 리스크**: gti는 비공식 프라이빗 API 의존이라 예고 없이 파손될 수 있다
> (gti 자체가 기동 시 동일 경고를 출력한다). 파손 시(비 200, 인증 실패,
> 스키마 변경) 폴백 = ① `gti --provider codex-cli` ② 아래 "폴백 경로
> (codex exec)" § 의 기존 절차. 폴백 절은 삭제 금지.

**배경 산출 경로 = `{cwd}/bg/` 하위 고정** — 중간산출을 프로젝트 루트에 두면
`*.png` 글롭·갤러리 나열이 배경을 집어가는 위생 문제(도그푸딩 실측). 삭제는
금지 — 배경 보존이 "텍스트 수정 시 재생성 불필요" 결정성 계약의 전제다.

## 실행 전제 (미충족 시 정직 안내 후 중단 — 대체 생성 경로 없음)

- gti v0.3.1+ 설치 확인 (`gti --version`) — Node.js 20+ 필요
- codex 로그인 자격 유효 (`~/.codex/auth.json`) — gti가 재사용한다. codex CLI
  자체(0.135+, `codex doctor`)는 "폴백 경로 (codex exec)" § 에서만 필요
- python3 + Pillow (합성)
- 한글 폰트: Pretendard 자동 탐색(`~/Library/Fonts` 등) → 나눔 폴백 → 미발견 시 설치 안내

## dispatch 입력

- `{cwd}` — 프로젝트 작업 디렉토리 절대 경로
- `{out_name}` — 산출 상대 경로: 표지 `bg/bg-01.png`, 본문 `bg/bg-NN.png` (cards.json index와 일치)
- `{prompt}` — 아래 스캐폴드로 조립한 생성 프롬프트 전문
- `{anchor_paths}` — 앵커 이미지 절대 경로 목록 (gti `--image <path>` 반복
  지정으로 첨부, codex exec 폴백에서는 view_image 참조). 표지: **캐릭터 시트(등재
  시 필수)**. 표지가 시트 없이 생성되면 구형 체형이 bg-01로 이월돼 세트 전체가
  오염된다. **일반 가드 룰**: 브랜드 무드/구도 레퍼런스 이미지가 캐릭터를 시트와 다른
  체형으로 담고 있으면 앵커에서 **제외**한다 — 풀프레임 이미지의 체형은
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

1. 실행 (`{cwd}/bg/` 디렉토리는 메인이 표지 dispatch 전에 만들어 둔다 —
   순서 계약 1):

   ```bash
   gti --prompt "{prompt}" --model gpt-5.5 --size 1024x1536 --output {cwd}/{out_name}
   ```

   **이미지 생성 모델은 `gpt-5.5` 고정** (`--model gpt-5.5`) — gti 기본값은
   `gpt-5.4`라 플래그 누락 시 **에러 없이 다른 모델로 생성**된다 (조용한 스타일
   드리프트 — codex 시절의 400 전패보다 발견이 늦다). `{anchor_paths}`가
   "없음"이 아니면 경로마다 `--image <path>`를 반복 지정한다. `{prompt}`는
   스캐폴드 원문 그대로 전달 — 지시문 조립(view_image 프리앰블·복사 마감
   문구)은 gti 경로에서 없다.

   소요 ~30-70초/건 실측 — 단일 HTTP POST 확정 종료라 행 감시가 필요 없다.
   Bash timeout 180000ms 권장. 실패(비 200 `httpStatus`, 네트워크, 인증)면
   "폴백 경로 (codex exec)" § 로 전환한다.
2. 반환 JSON의 `savedPath` = `{cwd}/{out_name}` 확인 + `httpStatus` 200 확인.
   gti는 확정 저장이므로 파일 부재 = 실패다 — 별도 스캐빈징 없음.
3. 반환(1~2줄만): `OK {out_name}` 또는 `FAIL {out_name} — [사유 1줄]`.
   gti 반환 JSON 전문(특히 `revisedPrompt`)이나 codex stdout 원문은 반환에
   넣지 않는다 — 판정에는 `savedPath`·`httpStatus`만 쓴다.

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
Pose: [pose 매핑 — 시트의 해당 포즈를 사용. idle→standing at ease as in the sheet's
  IDLE row / point→one short arm extended, gesturing toward the prop / hold-prop→holding
  the card's prop with both short arms as in the sheet's ACTIONS row / crouch→crouching
  low to look into or at the prop / sit→seated on a chair or edge as in the sheet's
  SITTING row]. Keep the stubby unibody proportions in the pose.
Expression: [expression 매핑 — 시트 표정. neutral→calm closed-ish smile / happy→big
  open smile, tongue visible / surprised→round open mouth (sheet '놀람') / worried→
  worried face, mouth slightly down (sheet '걱정') / wink→one eye winking].
  Match the pose and expression to the corresponding cell in the character sheet.
Constraints: no text, no letters, no numbers, no watermark, no logo,
  no flat illustration, no abstract graphic background.
```

### bg 필드 → 영어 전개 매핑 (본문 카드 — 스키마 정본은 card-structure.md)

| 선언 | 전개 문구 |
|---|---|
| `shot: "mid"` | full body, roughly 50-70% of frame height |
| `shot: "close-up"` | close to the camera, roughly 70-90% of frame height — 카드가 상반신 크롭을 원하면 "upper body from the waist up", 가까운 전신이면 "FULL BODY visible, large and close (head to feet, not cropped at the waist)" 전개. 어느 쪽이든 "close proximity, no distant framing" 상수 |
| `angle: "eye"` | camera at the character's eye level |
| `angle: "low"` | camera slightly below the character's eye level, looking up |
| `angle: "high"` | camera slightly above the character's eye level, looking down |
| `placement: "left"` | character positioned in the left third of the frame |
| `placement: "center"` | character positioned near the center of the frame |
| `placement: "right"` | character positioned in the right third of the frame |
| `view: "front"` | facing the camera |
| `view: "three-quarter"` | three-quarter view, both eyes and mouth clearly visible |
| `pose: "point"` | one short arm extended toward the prop |
| `pose: "hold-prop"` | holding the card's prop with both short arms |
| `pose: "crouch"` | crouching low to look into/at the prop |
| `pose: "sit"` | seated on a chair or edge (sheet SITTING) |
| `pose: "idle"` (또는 미지정) | standing at ease, sheet IDLE |
| `expression: "worried"` | worried face, mouth slightly down |
| `expression: "surprised"` | surprised, round open mouth |
| `expression: "wink"` | one eye winking |
| `expression: "happy"`/`"neutral"` (또는 미지정) | open smile / calm smile |
| `locale` | Subject 라인의 장소·상황으로 영어 번역 반영 |

- **기본형(basic) 배경 = 실사 환경 고정** — 플랫/그래픽 일러스트 배경은 craft 룰 2
  위반. 자유형(free)은 후속 트랙에서 별도 정의.
- **캐릭터 스케일**: Composition의 "하반부 calm"은 캐릭터 축소·원경화 지시가
  아니다 — 캐릭터가 하반부로 내려와도 된다(가독은 하단 그라디언트 + 배경
  단순화가 담당). 원경 롱숏·상단 구석 배치·크롭 잘림이 도그푸딩 실패 패턴.
- **표지**: **캐릭터 시트(등재 시)를 유일 `--image` 캐릭터/스타일 앵커**로 잡는다.
  무드·구도·라이팅·텍스트 배치는 프롬프트 워딩(cinematic window light, lower-left
  third 텍스트 영역 등)이 담당한다. 브랜드 무드 레퍼런스가 시트와 다른 체형의 캐릭터를
  담고 있으면 앵커로 쓰지 않는다(위 일반 가드 룰) — 체형 오염 방지.
- **본문**: 반드시 표지 산출물(`bg/bg-01.png`) + (캐릭터 브랜드면) 캐릭터 시트
  **2장을 `--image` 참조** — "same style, same palette" + Character 절 + **앵커
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

## 폴백 경로 (codex exec) — gti 파손 시 전용

> gti가 비공식 API 파손·인증 실패로 동작하지 않을 때만 쓴다. 1차 폴백은
> `gti --provider codex-cli`(gti가 내부에서 codex CLI를 대신 호출), 그것도
> 불가하면 아래 수동 절차. 스캐폴드·앵커·산출 경로·순서 계약은 동일하고
> **실행 계층만** 다르다. 전제: codex CLI 0.135+ 로그인(`codex doctor`,
> `image_generation` 피처).

1. 실행 (기본 샌드박스는 read-only라 cwd 복사가 실패한다 — 두 플래그 필수):

   ```bash
   codex exec -c model="gpt-5.5" --skip-git-repo-check --sandbox workspace-write -C {cwd} "<지시문>" < /dev/null
   ```

   모델 `gpt-5.5` 고정 사유 — codex 기본 모델(예: `gpt-5.6-luna`)은
   image_generation 400 실패, `gpt-5.1-codex*`는 ChatGPT 계정 미지원(400).
   모델 플래그 누락 시 조용한 전패(도그푸딩 실측). 백그라운드 실행 시 stdin
   닫기(`< /dev/null`) 필수 — 무한 행 실측 (braze-iam 48분).

   `<지시문>` 조립: `{anchor_paths}`가 "없음"이 아니면 `먼저 view_image로 다음
   이미지를 확인하라: {anchor_paths}` 를 앞에 붙이고, `{prompt}` 전문 + `생성된
   이미지를 {cwd}/{out_name} 으로 복사하라` 로 마감한다.

   **행 감시** (stdin을 닫아도 행이 발생한다 — braze-iam 22분 CPU 0% 실측):
   1차 생성 기준시간 ~5-7분. 기준 2배 경과 + CPU 0%면 프로세스 kill 후 재실행.
   재실행 전 기존 성공분이 있으면 백업하고 잔여 codex 프로세스를 kill한다
   (병렬 재실행 레이스가 성공분을 덮어쓴 실측).
2. `{cwd}/{out_name}` 존재 확인. 없으면 codex stdout에서 저장 경로
   (`~/.codex/generated_images/<uuid>/ig_*.png`)를 찾아 직접 복사한다.
3. codex 장문 stdout은 메인 컨텍스트에 넣지 않는다 (서브에이전트 격리 사유).
   반환 계약은 본문 임무 3과 동일 (`OK`/`FAIL` 1~2줄).

## 근거 — gti 전환 실측

braze-iam 파일럿 (2026-07-13, 정본 계약 =
`design-templates/braze-iam/references/imagegen-pipeline.md` 근거표):

| 실측 | 이 문서 반영 |
|---|---|
| 단일 HTTP POST 확정 종료, 소요 69초/36초 (codex exec ~5-7분 대비), `--output` 확정 저장 + 구조화 JSON, dry-run으로 프롬프트 무재해석 전달 확인, 품질 동급 | 전송 계층 codex exec → gti 교체. 행 감시·generated_images 스캐빈징·stdout 격리·지시문 조립은 "폴백 경로 (codex exec)" § 로 강등 |
| gti 기본 모델 = gpt-5.4 — 플래그 누락 시 에러 없이 다른 모델로 생성 | `--model gpt-5.5` 명시 필수 (임무 1) |
| 1024x1024 요청 → 1254² 반환 (캔버스 크기 비보장) | compose 중앙 4:5 크롭 + LANCZOS가 흡수 — 게이트 아님으로 명기 |

cardnews 앵커 파일럿 (2026-07-14, bodoc 캐릭터 시트 `--image` 앵커 + 표지
스캐폴드 1건 — braze 파일럿이 앵커 없는 오브제만 실측했으므로 앵커 경로 별도 검증):

| 실측 | 이 문서 반영 |
|---|---|
| 시트 통째 1장 `--image` 앵커로 실사 씬 내 캐릭터 캐논 재현 — 뭉툭 유니바디·목 없음·짧은 팔다리·로열블루 매트·혀 보이는 입 전부 시트 일치, `httpStatus` 200 + `savedPath` 확정 저장 | `--image` 앵커가 view_image 참조를 대체 — 시트/bg-01 이중 앵커 계약 존치 (dispatch 입력) |
| `--size 1024x1536` 요청 → 1024x1536 정확 반환 (2:3 세로) | 중앙 4:5 크롭 계약(상하 ~8.3%)과 일치 — 스캐폴드 크롭 문구 불변. 단 캔버스 비보장 caveat는 braze 실측대로 유지 |
| 반환 `revisedPrompt`에 스캐폴드 의도(구도·캐릭터 락·no text) 보존 확인 | 판정에는 `savedPath`·`httpStatus`만 사용, `revisedPrompt`는 디버깅 참고용 (임무 3) |
