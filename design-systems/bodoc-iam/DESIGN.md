# Bodoc IAM (bodoc-iam)

> Category: Marketing
> Surface: web

> 보닥 Braze IAM의 디폴트 스킨 — 순수 비주얼(룩) 계약. 스킨 스왑 시 이 문서가
> 통째로 교체된다. 브랜드 사실(보이스·금지어·팔레트 정본)은 brands/bodoc/brand.md,
> 채널 포맷(3사이즈·Braze 제약)은 brands/bodoc/deliverables/iam.md 소관 — 여기 금지.
> 브랜드 식별색 hex 정본 = brands/bodoc/brand.md Palette. 본문에 값 복사 금지,
> 기계값은 tokens.css 참조.

---

## 1. Color (색 — 역할 매핑)

| 토큰 | 의미·사용처 |
|---|---|
| `--primary` | 보닥 시그니처. 주 CTA·핵심 강조 1~2회만 |
| `--primary-dark` | `:active` 눌림 상태, hover |
| `--text-primary` | 제목·본문 본체 |
| `--text-secondary` | 보조 설명 |
| `--text-tertiary` | 캡션·보조 액션. WCAG AA 4.5:1 보장 (`--text-secondary`는 작은 글자 대비 미달) |
| `--border` | divider·카드 외곽 |
| `--background` | 면 분리·눌림 배경 |
| `--error` | 경고·만기 임박 등 부정 신호 한정 |
| `--white` | 카드·시트 표면 |

알파 변형 — **raw `rgba()` 인라인 금지, 항상 토큰 사용**: `--primary-tint`(아이콘 배경), `--primary-tint-strong`(체크리스트 bullet), `--primary-glow`(glow pulse), `--overlay`(모달·시트 dim) — 값은 tokens.css 참조.

**절제 원칙**: primary 1~2회만, 무채색 위계 3단계(primary/secondary/tertiary)로 정보 위계 표현. 다색 사용은 AI slop(§6).

## 2. Typography

폰트: **Pretendard 4종** — 모두 `font-weight: 300` 고정.

| 클래스 | family | weight | letter-spacing |
|---|---|---|---|
| `.font-bold` | Pretendard-Bold | 300 | -0.5px |
| `.font-semibold` | Pretendard-SemiBold | 300 | -0.5px |
| `.font-medium` | Pretendard-Medium | 300 | normal |
| `.font-regular` | Pretendard-Regular | 300 | normal |

- Bold/SemiBold만 `letter-spacing: -0.5px`. Medium/Regular는 normal.
- **위계**: weight 4단계 모두 활용. 사이즈 스케일 1.25~1.5배 점프. 헤딩 줄간격 1.1~1.35 / 본문 1.4~1.6.

프로덕션 폰트 자산 교체는 `brands/bodoc/deliverables/iam.md` 참조.

## 3. Spacing

- **8px 그리드** 기준. 모든 padding/margin/gap을 8의 배수로.
- 그룹핑은 proximity(근접)로 — 관련 요소 간격 좁게, 그룹 간 넓게.
- **헤딩 위/아래 비대칭 1.5:1** (위 여백 > 아래 여백).
- 호흡 리듬: 빽빽함 금지. 시각 요소 5~7개 이내.

## 4. Components (룩)

- **radius 위계**: 버튼 12px / 카드 16px / 모달·시트 20px.
- **정합성**: stroke-width 통일, 아이콘 표준 사이즈 16/20/24/32, shadow elevation 단계, divider 두께 일관.
- **id 강제**·**Braze Bridge**는 채널 인프라 — `brands/bodoc/deliverables/iam.md` 소관.

## 5. Motion

기본 4종 + 강조 1개.

1. **진입**(필수): 모달 fade+scale-up 240ms / 하프시트 slide-up 320ms(iOS curve) / 풀스크린 fade 200ms.
2. **피드백**(필수): 클릭 요소 `:active` scale 0.92~0.98 분리 선언.
3. **stagger**(선택): 헤딩→본문→메트릭→CTA 60~80ms 순차. 긴급 톤은 생략/축약.
4. **강조 마이크로**(선택, **핵심 1개만**): glowPulse / dotPulse / sweep 중 하나.
5. **접근성**: `prefers-reduced-motion: reduce` 전체 비활성화 필수.

금지: 회전·bounce·duration>0.5s, 강조 2개 이상 동시, `infinite` 남용, transform 외 속성 transition.

## 6. Anti-patterns (비주얼)

- raw `rgba(...)` 인라인 (토큰 미사용)
- **AI slop 6항목(감점)**: 무지개·다색 팔레트 / 고채도 남용 / 불필요 장식 도형 / 균일 라운딩(radius 위계 없음) / 과다 마이크로 인터랙션(강조 2개+) / 본문 이모지 남발.
