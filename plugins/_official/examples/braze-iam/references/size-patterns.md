# Braze IAM — 사이즈별 컨테이너 패턴

> SKILL.md Step 4에서 HTML 컨테이너 작성 시 *반드시 본 문서를 Read*한 뒤 적용한다.
> 포맷별 레이아웃 원칙·콘텐츠 적합도는 `format-design-guide.md` 참고.
> 본 문서는 컨테이너 치수·CSS 패턴만 다룬다.

---

## 모달

중앙 팝업. 단일 알림·혜택 1건에 적합.

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  width: calc(100% - 40px);
  max-width: 400px;
  border-radius: 20px;
  padding: 28px 20px;
  background: #fff; /* 브랜드 토큰으로 교체 */
}
```

---

## 하프시트

하단 슬라이드. 체크리스트·단계 안내·목록형에 적합.

```css
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  max-width: 600px; /* 태블릿·iPad 가운데 정렬 */
  border-radius: 20px 20px 0 0;
  padding: 28px 20px max(32px, env(safe-area-inset-bottom, 32px));
  background: #fff; /* 브랜드 토큰으로 교체 */
  animation: slideUp 0.32s cubic-bezier(0.32, 0.72, 0, 1);
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}
```

> **하프시트 핸들바(드래그 핸들) 사용 금지**: Braze HTML IAM은 native 시트가 아니라
> WebView 오버레이라 실제 드래그 제스처가 동작하지 않는다. 시각적 핸들만 노출하면
> 사용자가 드래그 가능한 것으로 오인 → 인터랙션 기대 위반.
> 닫기는 우상단 ✕ 버튼과 오버레이 탭으로만 처리.

---

## 풀스크린

화면 전체 점유. 온보딩·축하·스토리텔링에 적합.

```css
body {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  background: #fff; /* 브랜드 토큰으로 교체 */
}
```

---

## 슬라이드업 — HTML IAM 미지원

> **슬라이드업(알림형)은 Custom HTML IAM으로 제작하지 않는다.**

사유 (BRAZE-DOMAIN §1.1): HTML IAM은 항상 앱 레이어 위를 *전면 차단*하는 WebView로
노출된다. 슬라이드업은 본질적으로 *비차단성*(앱 위에 떠 있어도 외부 동작 가능)을 기대하는
형식이라, HTML로 만들면 시각만 토스트처럼 보이고 실제로는 앱 전체를 막아버려 의도와
정반대 결과가 난다.

→ **Braze native 슬라이드업 IAM으로 제작 권장.**

사용자가 슬라이드업을 요청한 경우: 위 제약을 설명하고 모달 또는 하프시트 대안을
`<question-form>`으로 재선택받는다.

---

## 공통 — 진입 애니메이션

상세는 `interaction-standard.md`. 컨테이너별 기본값:

| 사이즈 | 애니메이션 | duration / easing |
|---|---|---|
| 모달 | fade + scale-up (scale .96→1, opacity 0→1) + 오버레이 fade | 240ms / `cubic-bezier(.2,.8,.2,1)` |
| 하프시트 | slide-up (`translateY(100%)→0`) + 오버레이 fade | 320ms / `cubic-bezier(.32,.72,0,1)` |
| 풀스크린 | fade-in (opacity 0→1) | 200ms / `ease-out` |
