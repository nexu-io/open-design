# Braze IAM — 인터랙션 + 애니메이션 표준

> SKILL.md Step 4에서 HTML 작성 시 *반드시 본 문서를 Read*한 뒤 적용한다.
> 이 파일은 Braze HTML IAM에 특화된 모바일 WebView 인터랙션 표준이다.
> 브랜드 모션 토큰·보이스는 활성 DESIGN.md 기준.

모든 IAM에 다음 4종 인터랙션 패턴을 기본 포함한다. 단, 톤·사이즈에 맞게 강도를 조절한다.

---

## 1. 진입 애니메이션 (Entry — 필수)

| 사이즈 | 애니메이션 | duration / easing |
|---|---|---|
| 모달 | fade + scale-up (`opacity 0→1, scale(.96)→1`) + 오버레이 fade | 240ms / `cubic-bezier(.2,.8,.2,1)` |
| 하프시트 | slide-up (`translateY(100%)→0`) + 오버레이 fade | 320ms / `cubic-bezier(.32,.72,0,1)` (iOS sheet curve) |
| 풀스크린 | fade-in (`opacity 0→1`) | 200ms / `ease-out` |

```css
/* 모달 진입 */
@keyframes modalEnter {
  from { opacity: 0; transform: scale(.96); }
  to   { opacity: 1; transform: scale(1); }
}
.modal { animation: modalEnter .24s cubic-bezier(.2,.8,.2,1) both; }

/* 하프시트 진입 */
@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
.sheet { animation: slideUp .32s cubic-bezier(.32,.72,0,1) both; }
```

---

## 2. 인터랙션 피드백 (Press — 필수)

모든 클릭 가능 요소에 `:active` 상태 표시.

```css
.btn-primary:active   { transform: scale(0.98); transition: transform .12s ease; }
.close-btn:active     { transform: scale(0.92); transition: transform .1s ease; }
.btn-secondary:active { opacity: 0.6; transition: opacity .1s ease; }
```

- `scale()` 0.92~0.98 범위 — 모바일 HIG 표준 눌림감
- `:active` 분리 선언 필수 — 해제 시도 부드럽게 돌아옴

---

## 3. 콘텐츠 진입 stagger (Content reveal — 강도 선택)

헤딩·본문·메트릭·CTA를 순차 fade-in (60~80ms 간격). 정보 위계 시각적 강조.

```css
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* animation-fill-mode: both 누락 시 깜빡임 발생 — both 필수 */
#iam-header   { animation: fadeInUp .32s ease .08s both; }
#iam-body     { animation: fadeInUp .32s ease .14s both; }
#iam-divider  { animation: fadeInUp .32s ease .20s both; }
#iam-cta-primary { animation: fadeInUp .32s ease .26s both; }
```

**톤별 적용**:
- 정보 전달 / 혜택 안내: 권장 (제목 → 본문 → CTA 순)
- 긴급/주의: 생략 또는 60ms로 축약 (지연이 긴급성과 충돌)
- 축하·격려: 강조 (delay 100ms 단위로 길게)

---

## 4. 강조 마이크로 인터랙션 (Highlight — 선택, 핵심 1개만)

주의를 끌어야 할 단일 요소 1개에만 적용. 2개 이상 동시 적용 = AI slop 패턴 → 신뢰 감소.

```css
/* 메트릭 카드 글로우 펄스 (혜택·발견 가치 강조) */
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 0 0 transparent; }
  50%       { box-shadow: 0 0 0 4px var(--primary-glow, rgba(0,0,0,.15)); }
}
.metric-card.--highlight { animation: glowPulse 2.4s ease-in-out 1.2s infinite; }

/* 시점 라벨 dot 펄스 (긴급 톤 — 시간성 강조) */
@keyframes dotPulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}
.time-label .dot { animation: dotPulse 1.6s ease-in-out infinite; }

/* CTA 어텐션 sweep (프로모션 — 1회만) */
@keyframes sweep {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.btn-primary.--sweep::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.25), transparent);
  animation: sweep 1.6s ease-out 0.8s 1; /* 1회만 — infinite 금지 */
}
```

> **알파 컬러는 브랜드 토큰으로**: `--primary-glow`, `--primary-tint`, `--overlay` 등.
> raw `rgba(...)` 인라인은 브랜드 토큰 계약 위반.

---

## 5. 접근성 — `prefers-reduced-motion` 필수 대응

모션 민감 사용자에게 전체 애니메이션 비활성화:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 6. 금지 사항

| ❌ 금지 | 이유 |
|---|---|
| 회전(`rotate()`) / 튕김(`bounce`) / duration 400ms+ | 토이 느낌, 브랜드 신뢰감 톤과 충돌 |
| 강조 마이크로 인터랙션 2개 이상 동시 | AI slop 패턴 → 신뢰 감소 |
| CTA sweep 등 `infinite` 반복 (1회로 제한해야 할 요소) | 사용자 피로·주의력 분산 |
| `width`, `height`, `top` 등 transform 외 속성 transition | 리페인트 비용 ↑, 끊김 |
| 진입 애니메이션 duration 400ms 초과 | 사용자 대기 체감 ↑ |
| `transform: scale(0)` 에서 시작 | 0→1 스케일은 어색함. 0.9 이상에서 시작 |

---

## 7. 브랜드 톤별 강도 조절 요약

| 톤 | 진입 | stagger | 강조 마이크로 |
|---|---|---|---|
| 정보 전달 | 기본 (240ms 모달) | 권장 | glowPulse 선택 |
| 축하·격려 | 기본 | delay 100ms로 길게 | glowPulse 강조 |
| 긴급·주의 | 기본 또는 단축 | 생략 또는 60ms 축약 | dotPulse (1개) |
| 프로모션 | 기본 | 권장 | CTA sweep (1회) |
