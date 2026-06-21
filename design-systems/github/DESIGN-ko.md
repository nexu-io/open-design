# GitHub에서 영감을 받은 디자인 시스템

> Category: 개발자 도구
> 코드 중심 플랫폼. 기능적 밀도, 청백색 정밀함, Primer 기반.

## 1. 비주얼 테마 & 분위기

GitHub의 화면은 장식되지 않고 설계되어 있습니다. 모든 픽셀이 하나의 태도를 선언합니다: 이것은 diff, 빌드, pull request를 중시하는 사람들을 위한 도구라고. 페이지 배경은 깔끔한 `#ffffff`(라이트) 또는 `#0d1117`(다크)이며, 콘텐츠는 여백 대신 얇은 테두리로 구분된 촘촘한 직사각형 패널 위에 배치됩니다. 정보 밀도 자체가 브랜드입니다 — 목록 행, 코드 줄, 저장소 헤더, 알림 카드가 모두 촘촘하게 배치되어 있어 파워 유저가 스크롤 없이 수백 개의 항목을 스캔할 수 있습니다.

시그니처 강조색은 링크와 주요 액션을 위한 **Primer 블루**(`#0969da`)와 병합 상태, 성공, 그리고 병합 버튼 자체를 위한 **GitHub 그린**(`#1a7f37`)입니다. 두 색상 모두 소비자 제품의 블루·그린보다 약간 차분하게 느껴집니다 — 촘촘한 회색 텍스트 위에서 읽힐 만큼 충분히 채도가 있으면서도, 한 화면에 여러 개가 나타날 때 배경으로 사라질 만큼 절제되어 있습니다.

타이포그래피는 전 제품에 걸쳐 **system-ui** 스택을 사용해 모든 OS에서 텍스트가 선명하게 렌더링되며, 코드에는 **SFMono / Menlo / Consolas**를 함께 사용합니다. 편집용 디스플레이 폰트는 없습니다; GitHub의 목소리는 당신이 이미 사용 중인 시스템의 목소리입니다.

**주요 특징:**
- 진정한 흰 캔버스(`#ffffff`) 또는 깊은 네이비-블랙(`#0d1117`) — 따뜻함도 색조도 없음
- 얇은 회색 테두리(`#d0d7de`)로 모든 패인과 패널을 정의
- Primer 블루(`#0969da`) — 링크/주요 액션; GitHub 그린(`#1a7f37`) — 성공/병합
- 산문에는 system-ui; 코드에는 SFMono — 사용자 정의 서체 없음
- 최소 패딩의 촘촘한 목록 행; 여백은 희소
- 16px / 24px의 Octicon 아이콘 — 단선, 기하학적, 일관적
- 강한 색상 의미를 가진 알약형 상태 배지

## 2. 색상 팔레트 & 역할

### 주요 색상
- **Canvas Default** (`#ffffff`): 기본 페이지 배경, 라이트 테마.
- **Canvas Subtle** (`#f6f8fa`): 보조 서페이스, 사이드바, 입력 배경, 헤더 스트립.
- **Canvas Inset** (`#eaeef2`): 코드 블록 배경, 깊은 인셋 서페이스.
- **Fg Default** (`#1f2328`): 기본 텍스트, 헤드라인, 잉크.
- **Fg Muted** (`#656d76`): 보조 텍스트, 캡션, 파일 경로.

### 브랜드 강조색
- **Primer Blue** (`#0969da`): 링크, 주요 CTA, 포커스 링 기반 — 범용 인터랙티브 색상.
- **Primer Blue Hover** (`#0550ae`): 주요 블루의 호버/눌림 상태.
- **Accent Subtle** (`#ddf4ff`): 콜아웃, 정보 배너를 위한 소프트 블루 서페이스.

### 의미론적 색상
- **Success / Merge Green** (`#1a7f37`): 병합된 PR, 성공 배지, 병합 버튼.
- **Success Subtle** (`#dafbe1`): 성공 서페이스 틴트.
- **Open Green** (`#1a7f37`): "열린" 이슈/PR 상태.
- **Closed / Danger Red** (`#cf222e`): 닫힌 PR, 파괴적 액션, 유효성 검사 오류.
- **Danger Subtle** (`#ffebe9`): 오류 배너 서페이스.
- **Attention / Warning Yellow** (`#9a6700`): 황색 서페이스 위의 경고 텍스트.
- **Attention Subtle** (`#fff8c5`): 경고 배너 서페이스.
- **Done Purple** (`#8250df`): 병합 후 보관됨, "완료" 상태, 프리미엄 배지.
- **Sponsor Pink** (`#bf3989`): 스폰서 하트, GitHub 스폰서 브랜드.

### 테두리 & 구분선
- **Border Default** (`#d0d7de`): 표준 얇은 테두리, 패널 외곽선.
- **Border Muted** (`#d8dee4`): 패널 내부 구분선.
- **Border Subtle** (`#eaeef2`): 희미한 테이블 행 구분선.

### 다크 테마
- **Dark Canvas** (`#0d1117`): 다크 페이지 배경.
- **Dark Surface** (`#161b22`): 사이드바, 헤더, 보조 서페이스.
- **Dark Border** (`#30363d`): 표준 다크 모드 테두리.
- **Dark Fg** (`#e6edf3`): 다크 배경 위의 기본 텍스트.

## 3. 타이포그래피 규칙

### 폰트 패밀리
- **본문 / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **코드 / 모노**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **이모지**: `"Apple Color Emoji", "Segoe UI Emoji"`

### 계층 구조

| 역할 | 폰트 | 크기 | 굵기 | 행 높이 | 자간 | 비고 |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | 저장소 헤더, 마케팅 히어로 |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | 페이지 제목 |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | 섹션 제목 |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | 소섹션, 패널 헤더 |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | 기본 텍스트 크기 — 16px가 아님 |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | 캡션, 파일 메타데이터 |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | 코드 블록, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | 인라인 `code` 스팬 |

### 원칙
- **14px 본문, 16px 아님**: GitHub의 산문 밀도는 그 정체성입니다. 하나의 뷰포트에 더 많은 행을 담기 위해 14px로 읽힙니다.
- **굵기 이진법**: 기본적으로 모든 것은 400; 헤드라인과 강조에는 600. 500도 700도 없음.
- **시스템 폰트 항상**: 크롬을 위해 웹폰트를 로드하지 않음 — 느린 연결에서도 텍스트가 즉시 렌더링되어야 함.

## 4. 컴포넌트 스타일링

### 버튼

**Primary (그린)**
- Background: `#1f883d`
- Text: `#ffffff`
- Border: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Shadow: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: background `#1a7f37`
- 사용: "저장소 만들기", "Pull request 병합"

**Default**
- Background: `#f6f8fa`
- Text: `#1f2328`
- Border: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: background `#f3f4f6`, border `#d0d7de`

**Outline (블루 링크 스타일)**
- Background: `#ffffff`
- Text: `#0969da`
- Border: 1px solid `#d0d7de`
- Hover: background `#0969da`, text `#ffffff`

**Danger**
- Background: `#ffffff`
- Text: `#cf222e`
- Border: 1px solid `#d0d7de`
- Hover: background `#a40e26`, text `#ffffff`, border `#a40e26`

### 카드 / 박스
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (헤더) + 16px (본문)
- 헤더에는 하단 테두리가 있는 `#f6f8fa` 스트립이 있음.

### 입력 필드
- Background: `#ffffff`
- Border: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Focus: border `#0969da`, ring `0 0 0 3px rgba(9,105,218,0.3)`

### 상태 알약 (이슈 / PR)
- **Open**: background `#1a7f37`, 흰 텍스트, padding 4px 10px, radius 9999px.
- **Closed**: background `#cf222e`, 흰 텍스트.
- **Merged**: background `#8250df`, 흰 텍스트.
- **Draft**: background `#6e7781`, 흰 텍스트.

### 레이블 (이슈/PR의 태그)
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- 배경과 텍스트는 프로그래밍 방식으로 결정됨 (레이블 색상 → 대비를 위해 텍스트 색상 계산).

## 5. 간격 & 레이아웃

- **기본 단위**: 4px. 간격 스케일: 4, 8, 12, 16, 24, 32, 40, 48.
- **페이지 최대 너비**: 1280px (`Container-xl`).
- **사이드바**: 데스크탑에서 296px, 1012px 이하에서 접힘.
- **행 패딩**: 수평 16px, 수직 12px (목록은 의도적으로 촘촘하게 설계).

## 6. 모션

- **지속 시간**: 호버에 80ms; 메뉴/팝오버 열기에 200ms.
- **이징**: 열기에 `ease-out`, 닫기에 `ease-in`.
- **피해야 할 것**: 페이지 로드 애니메이션, 패럴랙스, 지속적인 마이크로 인터랙션. 요소는 나타나는 것이지, 퍼포먼스를 하지 않습니다.

## 7. 사용 가이드라인

- 촘촘한 목록, 테두리가 있는 박스, 시스템 타이포그래피를 함께 유지하십시오; 고립된 그린 버튼만으로는 GitHub 같은 제품 표면을 만들기에 충분하지 않습니다.
- 저장소 구축 액션에는 그린, 링크와 포커스에는 블루, 이슈·PR·워크플로 상태에만 레드/퍼플/그레이를 사용하십시오.
- 장식적인 그림자나 대형 마케팅 스타일 카드보다는 조용한 크롬, 명시적인 테두리, 컴팩트한 간격을 선호하십시오.
