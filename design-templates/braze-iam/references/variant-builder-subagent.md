# Variant 빌더 서브에이전트 — dispatch 지시

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
- `{asset_manifest}` — 에셋 목록: `- assets/obj-ticket.png | role: object | token: __BRAZE_MEDIA__/obj-ticket.png` 형식.
  `source:"css"` 에셋은 `- (css) | role: decor | note: <기획안 note>` 형식 (파일 없음 — 코드로 그린다)
- `{composition}` — 기획안 image.composition 배치 스케치 문장
- `{out_dir}` — 산출 디렉토리 절대 경로
- `{skill_scripts_dir}` — 스킬 scripts/ 절대 경로 (make_preview.py 위치)

## 서브에이전트 임무 (dispatch 프롬프트 본문)

너는 Braze Custom-HTML IAM Variant {variant_label} 제작 전담 에이전트다. 최종
텍스트 반환만이 메인에게 전달된다 — 잡담 없이 결과만.

1. Read: `{brief_path}`, `{design_md_path}`, `{brand_context_paths}`, `{references}`
   전부. 브랜드 사실(금지어·딥링크·어트리뷰트)은 이 소스에서만 로드 — 추측 금지.
2. `{out_dir}/variant-{label소문자}.html` **발송본** 작성:
   - 카피 = 기획안 variants[{label}] heading·body 그대로 (재작성 금지 — 카피
     변경이 필요하면 FAIL로 사유 반환, 메인이 기획 수정)
   - 이미지 = `{asset_manifest}`의 token 그대로: `src="__BRAZE_MEDIA__/<name>"`
     또는 CSS `url(__BRAZE_MEDIA__/<name>)`. **data-URI 삽입 절대 금지** (Braze
     에디터 버퍼링 실측 — 발송본 룰)
   - 컴포지션 = `{composition}` 스케치대로 레이어 배치 — position/z-index/scale/
     겹침. 히어로 스케일·기울임·부유감·시선 흐름은 `visual-layout-patterns.md`
     §6, 배경·장식은 §5 (배경 = 브랜드 토큰 CSS, 이미지 배경 금지). 그림자·플로트
     애니메이션은 CSS (`interaction-standard.md` 준수)
   - 기술 규율 (craft/braze-custom-html.md 전 항목): 전 요소 `id="iam-..."`,
     brazeBridge만 + 모든 호출 `ab.BridgeReady` 콜백 안, logClick 매핑('0'/'1'/
     커스텀), CTA ≤2, 외부 참조 없는 인라인 단일 파일, Android 딥링크 onClick에
     closeMessage() 금지, 프리뷰 폴백 스크립트 블록 금지, raw rgba 금지(브랜드 토큰)
   - Liquid 변수가 있으면 `liquid-guide.md` 형식, 카탈로그 내 식별자만
3. 프리뷰 기계 변환 (수기 2벌 작성 금지 — drift 방지):

   ```bash
   python3 {skill_scripts_dir}/make_preview.py {out_dir}/variant-{label소문자}.html {out_dir}/assets
   ```

4. 자가체크 1회: 발송본에 `data:image` 잔존 = 실패, 프리뷰에 `__BRAZE_MEDIA__`
   잔존 = 실패. 둘 다 통과해야 OK.
5. 반환(≤3줄): `OK variant-{label소문자}.html variant-{label소문자}-preview.html`
   + 자가체크 요약 1줄. 실패 시 `FAIL variant-{label소문자} — [사유 1줄]`.
