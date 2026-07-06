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
산출 경로 계약(`bg-NN.png`)은 동일하게 준수한다.

## 실행 전제 (미충족 시 정직 안내 후 중단 — 대체 생성 경로 없음)

- codex CLI 0.135+ 로그인 상태(`codex doctor`로 확인) — `image_generation` 피처
- python3 + Pillow (합성)
- 한글 폰트: Pretendard 자동 탐색(`~/Library/Fonts` 등) → 나눔 폴백 → 미발견 시 설치 안내

## dispatch 입력

- `{cwd}` — 프로젝트 작업 디렉토리 절대 경로
- `{out_name}` — 산출 파일명: 표지 `bg-01.png`, 본문 `bg-NN.png` (cards.json index와 일치)
- `{prompt}` — 아래 스캐폴드로 조립한 생성 프롬프트 전문
- `{anchor_paths}` — view_image 참조 이미지 절대 경로 목록. 표지: DESIGN.md 비주얼 무드
  섹션의 브랜드 레퍼런스 이미지(있으면 필수). 본문: 반드시 `{cwd}/bg-01.png` 포함 +
  브랜드 캐릭터가 있으면 DESIGN.md 등재 **캐릭터 레퍼런스 이미지도 함께**(앵커 2장 —
  스타일·팔레트는 bg-01이, 캐릭터 정체성은 캐릭터 레퍼런스가 담당. 세대 드리프트 방지).
  없으면 "없음".

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 카드뉴스 배경 이미지 생성 전담 에이전트다. 최종 텍스트 반환만이 메인에게
전달된다 — 잡담 없이 결과만.

1. 실행 (기본 샌드박스는 read-only라 cwd 복사가 실패한다 — 두 플래그 필수):

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
Composition: portrait orientation. Keep the [텍스트 영역 — cover: lower-left third /
  body: lower half calm, low-contrast] simple and uncluttered.
Character: [브랜드 캐릭터 있을 때만] Use the exact same character as in the reference
  image — identical proportions, face, eyes, mouth, colors. Do not redesign,
  restyle, or reinterpret the character.
Constraints: no text, no letters, no numbers, no watermark, no logo,
  no flat illustration, no abstract graphic background.
```

- **기본형(basic) 배경 = 실사 환경 고정** — 플랫/그래픽 일러스트 배경은 craft 룰 2
  위반. 자유형(free)은 후속 트랙에서 별도 정의.
- **표지**: 브랜드 레퍼런스 이미지(DESIGN.md 비주얼 무드 섹션 등재)가 있으면
  view_image 참조로 캐릭터·구도를 잇는다.
- **본문**: 반드시 표지 산출물(`bg-01.png`) + (캐릭터 브랜드면) 캐릭터 레퍼런스
  **2장을 view_image 참조** — "same style, same palette" + Character 고정절.
  표정·소품 등 카드별 델타만 추가 지시한다.
- **CTA**: 생성 호출 없음 — compose가 `bg-01.png`를 재사용한다(craft 룰 9).

## 순서 계약

1. cards.json 확정 후 표지 dispatch 1회 → `{cwd}/bg-01.png` 존재 확인
   (스타일 앵커 — 완료 전 본문 진행 금지, 병렬 불가).
2. 본문 N-2개 병렬 dispatch → `bg-02.png` … `bg-{N-1}.png`. 실패한 카드만 순차
   재시도 폴백(전체 재생성 금지 — 성공분은 보존).
3. 메인이 직접 합성:

   ```bash
   python3 <스킬 폴더>/scripts/compose_cards.py --spec {cwd}/cards.json --out-dir {cwd} \
     [--logo <DESIGN.md의 로고타입 에셋 절대 경로>]
   ```

4. 메인이 직접 `<slug>-preview.html` 갤러리 Write (구조는 SKILL.md 5e).
