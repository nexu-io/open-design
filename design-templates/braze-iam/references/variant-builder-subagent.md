# Variant 빌더 서브에이전트 — dispatch 지시

> **dispatch 모델 = Opus 고정** (`model: "opus"` — 사용자 결정 2026-07-13).

메인 에이전트: Variant A/B를 **각 1 서브에이전트, 한 턴 병렬 dispatch**로 제작한다.
메인은 직접 제작하지 않는다. dispatch 도구가 없는 런타임은 인라인 순차로 동일
절차(산출물 계약 동일). dispatch 프롬프트에 다음 입력을 채워 넣는다:

- `{variant_label}` / `{variant_angle}` — "A"/"B" + 기획안 variants[*].angle
- `{brief_path}` — brief.md 절대 경로
- `{plan_json}` — braze_plan_v1 기획안 전문 (heading·body·cta·image 포함)
- `{brand_context_paths}` — 활성 브랜드 컨텍스트 소스 파일 경로 (코어 + iam 채널.
  system prompt "Brand deliverable context" 블록의 Source files 라인에서 추출)
- `{design_md_path}` — `design-systems/<brand>/DESIGN.md` 절대 경로
- `{references}` — 스킬 references 5종 절대 경로 (size-patterns, format-design-guide,
  interaction-standard, liquid-guide, visual-layout-patterns) + `craft/braze-custom-html.md`
- `{asset_manifest}` — 에셋 목록: `- assets/obj-ticket.png | role: object | url: https://braze-images.com/...` 형식
  (url = Step 4a-b Media Library 업로드 반환 CDN URL 정본 — 빌더는 이 값을 그대로
  기입하며 임의 구성·추측 금지). **placeholder 폴백 시**(메인이 manifest에 명시)
  `url:` 대신 `token: __BRAZE_MEDIA__/obj-ticket.png` 형식.
  `source:"css"` 에셋은 `- (css) | role: decor | note: <기획안 note>` 형식 (파일 없음 — 코드로 그린다)
- `{image_mode}` — 기획안 `image.mode` 값 (`"layer"` 또는 `"scene"`, 기본 `"layer"`) —
  임무 2 발송본 작성의 모드 분기 입력
- `{composition}` — **해당 variant의 `layout.variants.{label}`** (§2 유형 + 존
  스케치 — visual-layout-patterns.md §12.3 분화 설계에 따라 A/B가 다른 것이 기본.
  구 기획안은 `image.composition` 공용 스케치)
- `{out_dir}` — 산출 디렉토리 절대 경로
- `{skill_scripts_dir}` — 스킬 scripts/ 절대 경로 (placeholder 폴백 시 make_preview.py 위치)

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 Braze Custom-HTML IAM Variant {variant_label} 제작 전담 에이전트다. 최종
텍스트 반환만이 메인에게 전달된다 — 잡담 없이 결과만.

1. Read: `{brief_path}`, `{design_md_path}`, `{brand_context_paths}`, `{references}`
   전부. 브랜드 사실(금지어·딥링크·어트리뷰트)은 이 소스에서만 로드 — 추측 금지.
2. `{out_dir}/variant-{label소문자}.html` **발송본** 작성:
   - 카피 = 기획안 variants[{label}] heading·body 그대로 (재작성 금지 — 카피
     변경이 필요하면 FAIL로 사유 반환, 메인이 기획 수정)
   - 이미지·컴포지션은 `{image_mode}`로 분기:
     - **`layer`** (기존 문법 + 강화): 룩 = 활성 `{design_md_path}` 그대로 준수.
       배경 = 브랜드 토큰 CSS 기본 (**생성 이미지 배경 금지** — 배경 포함 생성은
       scene 모드 전용). 예외: `{composition}` 스케치가 오버레이형(§1-b)으로
       `library` 비주얼 풀블리드를 명시한 경우만 manifest의 library URL을 배경으로
       사용 — 이때 가독 조건(스크림/여백존/색 반전) 스케치를 그대로 구현.
       이미지 = `{asset_manifest}`의 url 그대로: `src="<CDN URL>"` 또는 CSS
       `url(<CDN URL>)` (폴백 manifest면 token 그대로: `src="__BRAZE_MEDIA__/<name>"`).
       **data-URI 삽입 절대 금지** (Braze
       에디터 버퍼링 실측 — 발송본 룰). 히어로는 manifest의 **투명 PNG 정확히
       1장** 배치 — **콜라주 조립 금지**: 분리 생성된 복수 PNG를 물리 상호작용
       처럼 겹쳐 배치하지 않는다 (물리적으로 맞물린 복합 오브제는 생성 단계에서
       이미 통합된 통짜 PNG로 manifest에 들어온다). CSS 장식(`source:"css"`)·
       카드 중첩·엣지 블리드·코너 프레이밍 등 §6 비물리 CSS 기법은 허용.
       컴포지션 = `{composition}` 스케치(해당 variant의 유형+존 스케치)대로
       레이어 배치 — position/z-index/scale/겹침. 히어로 스케일·기울임·부유감·
       시선 흐름은 `visual-layout-patterns.md` §6. **존 구조 = 받은 스케치에
       충실** — A/B 레이아웃 분화는 기획(`layout.variants`)이 설계하며 (§12.3,
       사용자 결정 2026-07-14 — 구 "존 순서 A/B 공통 고정" 룰의 기본값 역전),
       빌더의 임의 분화·임의 통일·스케치 재해석은 금지. 히어로 소품/타이포도
       스케치·manifest 명시분만 (빌더 임의 교체 금지). 그림자·플로트 애니메이션은
       CSS (`interaction-standard.md` 준수)
     - **`scene`** (신설): 카드 배경 = `background: url(<씬 에셋의 manifest url>)
       center / cover` (폴백 시 `url(__BRAZE_MEDIA__/scene-<id>.png)` — **data-URI
       삽입 절대 금지** 불변). 구조 = 텍스트존(상단, 씬의 상단 세이프존 위) → spacer
       (flex) → CTA존(하단, 씬의 하단 세이프존 위). `visual-layout-patterns.md` §5
       "배경 = CSS" 문법은 scene 모드에 적용하지 않는다 (배경이 곧 씬 에셋).
       CSS 장식 오브젝트는 씬에 이미 포함 — 추가 CSS 장식은 최소화. 타이포는
       헤드라인 볼드 실효 위계(DESIGN.md 위계 룰 준수 — weight 4단계 활용),
       씬 위 가독 대비 확보(텍스트존 배경이 밝으면 어두운 fg 토큰). 카드
       aspect는 씬 1024×1536 비율 유지(`aspect-ratio` 또는 고정 높이) — cover
       크롭으로 세이프존이 잘리지 않게.
   - 기술 규율 (craft/braze-custom-html.md 전 항목, 양 모드 공통 — 분기 밖):
     전 요소 `id="iam-..."`, brazeBridge만 + 모든 호출 `ab.BridgeReady` 콜백
     안, logClick 매핑('0'/'1'/커스텀), CTA ≤2, 외부 참조 없는 인라인 단일
     파일, Android 딥링크 onClick에 closeMessage() 금지, 프리뷰 폴백 스크립트
     블록 금지, raw rgba 금지(브랜드 토큰)
   - Liquid 변수가 있으면 `liquid-guide.md` 형식, 카탈로그 내 식별자만
3. 프리뷰 기계 변환 — **placeholder 폴백 시에만** (URL manifest면 발송본이
   FileViewer 프리뷰 겸용이라 이 단계 skip. 수기 2벌 작성 금지 — drift 방지):

   ```bash
   python3 {skill_scripts_dir}/make_preview.py {out_dir}/variant-{label소문자}.html {out_dir}/assets
   ```

4. 자가체크 1회: 발송본에 `data:image` 잔존 = 실패. URL manifest면 모든 이미지
   src/url()이 manifest url 값과 정확히 일치하는가(`__BRAZE_MEDIA__` 잔존 = 실패
   — 업로드 누락 신호로 FAIL 반환), 폴백이면 프리뷰에 `__BRAZE_MEDIA__` 잔존 =
   실패. 모드별 1항목 추가 — `layer`: 히어로 PNG가 1장인가(물리 상호작용
   콜라주 없음), `scene`: 씬 `url()` 참조가 manifest url(폴백 시 placeholder)
   형식인가 + 텍스트·CTA가 세이프존 위에 있는가. 전부 통과해야 OK.
5. 반환(≤3줄): `OK variant-{label소문자}.html` (폴백 시
   `variant-{label소문자}-preview.html` 병기) + 자가체크 요약 1줄. 실패 시
   `FAIL variant-{label소문자} — [사유 1줄]`.
