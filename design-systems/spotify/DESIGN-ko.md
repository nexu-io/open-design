# Design System Inspired by Spotify

> Category: 미디어 & 소비자
> 음악 스트리밍. 어두운 배경 위의 선명한 녹색, 굵은 서체, 앨범 아트 중심.

## 1. Visual Theme & Atmosphere

Spotify의 웹 인터페이스는 어두운 몰입형 음악 플레이어로, 청취자를 거의 검은색에 가까운 공간(`#121212`, `#181818`, `#1f1f1f`)으로 감싸 앨범 아트와 콘텐츠가 주된 색의 원천이 되도록 합니다. 설계 철학은 "콘텐츠 우선의 어둠(content-first darkness)"입니다. UI는 그림자 속으로 물러나고, 음악과 팟캐스트, 플레이리스트가 빛나게 됩니다. 모든 표면이 짙은 회색 계열의 색조를 띠어 극장 같은 환경을 만들어내며, 유일한 진짜 색채는 상징적인 Spotify Green(`#1ed760`)과 앨범 아트워크 자체에서 나옵니다.

타이포그래피는 SpotifyMixUI와 SpotifyMixUITitle을 사용합니다. 이 폰트들은 CircularSp 계열(Lineto의 Circular를 Spotify 용으로 커스터마이징한 폰트)의 독점 서체로, 아랍어, 히브리어, 키릴 문자, 그리스어, 데바나가리, CJK 폰트를 포함하는 광범위한 폴백 스택을 갖추고 있으며, 이는 Spotify의 글로벌 도달 범위를 반영합니다. 타입 시스템은 간결하고 기능적입니다. 강조와 내비게이션에는 700(bold), 보조 강조에는 600(semibold), 본문에는 400(regular)을 사용합니다. 버튼은 대문자와 양수 자간(1.4px–2px)을 활용해 체계적인 레이블 느낌을 줍니다.

Spotify를 특별하게 만드는 요소는 알약(pill) 형태와 원형 기하학입니다. 주요 버튼은 500px–9999px 반지름(완전한 알약 형태)을 사용하고, 원형 재생 버튼은 50% 반지름을, 검색 입력창은 500px 알약 형태를 사용합니다. 고도감 있는 요소에 적용되는 무거운 그림자(`rgba(0,0,0,0.5) 0px 8px 24px`)와 독특한 인셋 테두리-그림자 조합(`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`)이 더해져, 프리미엄 오디오 기기처럼 촉각적이고 둥글며 터치에 최적화된 인터페이스를 완성합니다.

**Key Characteristics:**
- 거의 검은색에 가까운 몰입형 다크 테마(`#121212`–`#1f1f1f`) — UI가 콘텐츠 뒤로 사라짐
- Spotify Green(`#1ed760`)을 단일 브랜드 강조색으로 사용 — 장식용이 아닌, 항상 기능적 목적으로만
- 글로벌 스크립트 지원을 갖춘 SpotifyMixUI/CircularSp 폰트 패밀리
- 알약 형태 버튼(500px–9999px)과 원형 컨트롤(50%) — 둥글고 터치에 최적화됨
- 넓은 자간(1.4px–2px)을 가진 대문자 버튼 레이블
- 고도감 있는 요소에 적용된 무거운 그림자(`rgba(0,0,0,0.5) 0px 8px 24px`)
- 의미론적 색상: 부정적 빨강(`#f3727f`), 경고 주황(`#ffa42b`), 공지 파랑(`#539df5`)
- 앨범 아트가 주된 색채 원천 — UI 자체는 설계상 무채색

## 2. Color Palette & Roles

### Primary Brand
- **Spotify Green** (`#1ed760`): 주요 브랜드 강조색 — 재생 버튼, 활성 상태, CTA
- **Near Black** (`#121212`): 가장 깊은 배경 표면
- **Dark Surface** (`#181818`): 카드, 컨테이너, 고도감 있는 표면
- **Mid Dark** (`#1f1f1f`): 버튼 배경, 인터랙티브 표면

### Text
- **White** (`#ffffff`): `--text-base`, 주 텍스트
- **Silver** (`#b3b3b3`): 보조 텍스트, 흐릿한 레이블, 비활성 내비게이션
- **Near White** (`#cbcbcb`): 약간 밝은 보조 텍스트
- **Light** (`#fdfdfd`): 최대 강조를 위한 순백에 가까운 색

### Semantic
- **Negative Red** (`#f3727f`): `--text-negative`, 오류 상태
- **Warning Orange** (`#ffa42b`): `--text-warning`, 경고 상태
- **Announcement Blue** (`#539df5`): `--text-announcement`, 정보 상태

### Surface & Border
- **Dark Card** (`#252525`): 고도감 있는 카드 표면
- **Mid Card** (`#272727`): 대체 카드 표면
- **Border Gray** (`#4d4d4d`): 어두운 배경 위의 버튼 테두리
- **Light Border** (`#7c7c7c`): 아웃라인 버튼 테두리, 흐릿한 링크
- **Separator** (`#b3b3b3`): 구분선
- **Light Surface** (`#eeeeee`): 라이트 모드 버튼(드물게 사용)
- **Spotify Green Border** (`#1db954`): 녹색 강조 테두리 변형

### Shadows
- **Heavy** (`rgba(0,0,0,0.5) 0px 8px 24px`): 다이얼로그, 메뉴, 고도감 있는 패널
- **Medium** (`rgba(0,0,0,0.3) 0px 8px 8px`): 카드, 드롭다운
- **Inset Border** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): 입력창 테두리-그림자 조합

## 3. Typography Rules

### Font Families
- **Title**: `SpotifyMixUITitle`, 폴백: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **UI / Body**: `SpotifyMixUI`, 동일한 폴백 스택

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Section Title | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | 굵은 타이틀 웨이트 |
| Feature Heading | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (tight) | normal | 섹션 제목용 세미볼드 |
| Body Bold | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | 강조 텍스트 |
| Body | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | 표준 본문 |
| Button Uppercase | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (tight) | 1.4px–2px | `text-transform: uppercase` |
| Button | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | 표준 버튼 |
| Nav Link Bold | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | 내비게이션 |
| Nav Link | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | 비활성 내비게이션 |
| Caption Bold | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | 굵은 메타데이터 |
| Caption | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | 메타데이터 |
| Small Bold | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | 태그, 카운트 |
| Small | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | 작은 글씨 |
| Badge | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Micro | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | 가장 작은 텍스트 |

### Principles
- **볼드/레귤러 이분법**: 대부분의 텍스트는 700(bold) 또는 400(regular)이며, 600은 드물게 사용됩니다. 크기 변화가 아닌 굵기 대비를 통해 명확한 시각적 위계를 만들어냅니다.
- **시스템으로서의 대문자 버튼**: 버튼 레이블은 대문자와 넓은 자간(1.4px–2px)을 사용해, 콘텐츠 텍스트와 구별되는 체계적인 "레이블" 어조를 만들어냅니다.
- **간결한 크기**: 범위가 10px–24px으로, 대부분의 시스템보다 좁습니다. Spotify의 타이포그래피는 간결하고 기능적이며, 기사를 읽는 것이 아니라 플레이리스트를 훑어보도록 설계되어 있습니다.
- **글로벌 스크립트 지원**: 광범위한 폴백 스택(아랍어, 히브리어, 키릴 문자, 그리스어, 데바나가리, CJK)은 Spotify의 180개 이상의 시장 도달 범위를 반영합니다.

## 4. Component Stylings

### Buttons

**Dark Pill**
- Background: `#1f1f1f`
- Text: `#ffffff` or `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px (full pill)
- Use: 내비게이션 알약 버튼, 보조 액션

**Dark Large Pill**
- Background: `#181818`
- Text: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- Use: 앱의 주요 내비게이션 버튼

**Light Pill**
- Background: `#eeeeee`
- Text: `#181818`
- Radius: 500px
- Use: 라이트 모드 CTA(쿠키 동의, 마케팅)

**Outlined Pill**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (아이콘을 위한 비대칭 패딩)
- Radius: 9999px
- Use: 팔로우 버튼, 보조 액션

**Circular Play**
- Background: `#1f1f1f`
- Text: `#ffffff`
- Padding: 12px
- Radius: 50% (circle)
- Use: 재생/일시정지 컨트롤

### Cards & Containers
- Background: `#181818` or `#1f1f1f`
- Radius: 6px–8px
- 대부분의 카드에는 테두리가 보이지 않음
- Hover: 배경이 약간 밝아짐
- Shadow: 고도감 있는 요소에 `rgba(0,0,0,0.3) 0px 8px 8px`

### Inputs
- 검색 입력창: `#1f1f1f` 배경, `#ffffff` 텍스트
- Radius: 500px (pill)
- Padding: 12px 96px 12px 48px (아이콘 인식형)
- Focus: 테두리가 `#000000`으로 변하고, `1px solid` 아웃라인 적용

### Navigation
- 활성 상태에는 SpotifyMixUI 14px 굵기 700, 비활성 상태에는 400을 사용하는 어두운 사이드바
- 비활성 항목에는 `#b3b3b3` 흐릿한 색상, 활성 항목에는 `#ffffff`
- 원형 아이콘 버튼(50% 반지름)
- 왼쪽 상단의 녹색 Spotify 로고

## 5. Layout Principles

### Spacing System
- 기본 단위: 8px
- 스케일: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Grid & Container
- 사이드바(고정) + 메인 콘텐츠 영역
- 그리드 기반의 앨범/플레이리스트 카드
- 하단에 전체 너비의 현재 재생 중 바
- 반응형 콘텐츠 영역이 나머지 공간을 채움

### Whitespace Philosophy
- **다크 압축(Dark compression)**: Spotify는 콘텐츠를 촘촘하게 배치합니다. 플레이리스트 그리드, 트랙 목록, 내비게이션 모두 촘촘하게 간격이 맞춰져 있습니다. 어두운 배경이 큰 간격 없이도 요소 사이에 시각적 휴식을 제공합니다.
- **여백보다 콘텐츠 밀도 우선**: 이것은 앱이지, 마케팅 사이트가 아닙니다. 모든 픽셀은 청취 경험을 위해 존재합니다.

### Border Radius Scale
- 최소(2px): 뱃지, 명시적 태그
- 미묘함(4px): 입력창, 작은 요소
- 표준(6px): 앨범 아트 컨테이너, 카드
- 편안함(8px): 섹션, 다이얼로그
- 중간(10px–20px): 패널, 오버레이 요소
- 대형(100px): 대형 알약 버튼
- 알약(500px): 주요 버튼, 검색 입력창
- 완전 알약(9999px): 내비게이션 알약, 검색
- 원형(50%): 재생 버튼, 아바타, 아이콘

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Base (Level 0) | `#121212` background | 가장 깊은 레이어, 페이지 배경 |
| Surface (Level 1) | `#181818` or `#1f1f1f` | 카드, 사이드바, 컨테이너 |
| Elevated (Level 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | 드롭다운 메뉴, 호버 카드 |
| Dialog (Level 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | 모달, 오버레이, 메뉴 |
| Inset (Border) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | 입력창 테두리 |

**Shadow Philosophy**: Spotify는 다크 테마 앱치고 눈에 띄게 무거운 그림자를 사용합니다. 24px 블러의 0.5 불투명도 그림자는 다이얼로그와 메뉴에 극적인 "어둠 속에 떠 있는" 효과를 만들어내고, 8px 블러의 0.3 불투명도 그림자는 보다 섬세한 카드 부양감을 제공합니다. 입력창의 고유한 인셋 테두리-그림자 조합은 오목하게 파인 촉각적 느낌을 만들어냅니다.

## 7. Do's and Don'ts

### Do
- 거의 검은색에 가까운 배경(`#121212`–`#1f1f1f`)을 사용하세요 — 명암 변화를 통한 깊이감 표현
- Spotify Green(`#1ed760`)은 재생 컨트롤, 활성 상태, 주요 CTA에만 적용하세요
- 모든 버튼에 알약 형태(500px–9999px)를 사용하고, 재생 컨트롤에는 원형(50%)을 사용하세요
- 버튼 레이블에 대문자와 넓은 자간(1.4px–2px)을 적용하세요
- 타이포그래피를 간결하게 유지하세요(10px–24px 범위) — 이것은 앱이지 잡지가 아닙니다
- 어두운 배경의 고도감 있는 요소에 무거운 그림자(`0.3–0.5 opacity`)를 사용하세요
- 앨범 아트가 색채를 제공하도록 하세요 — UI 자체는 무채색을 유지합니다

### Don't
- Spotify Green을 장식용으로 사용하거나 배경에 적용하지 마세요 — 기능적 목적으로만 사용해야 합니다
- 주요 표면에 밝은 배경을 사용하지 마세요 — 어두운 몰입감이 핵심입니다
- 버튼에 알약/원형 형태를 건너뛰지 마세요 — 사각형 버튼은 아이덴티티를 깨뜨립니다
- 얇거나 미묘한 그림자를 사용하지 마세요 — 어두운 배경에서 그림자는 보이려면 무거워야 합니다
- 추가적인 브랜드 색상을 넣지 마세요 — 녹색과 무채색 회색이 완전한 팔레트입니다
- 느슨한 행간을 사용하지 마세요 — Spotify의 타이포그래피는 간결하고 촘촘합니다
- 날것의 회색 테두리를 노출하지 마세요 — 그림자 기반 또는 인셋 테두리를 사용하세요

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile Small | <425px | 컴팩트 모바일 레이아웃 |
| Mobile | 425–576px | 표준 모바일 |
| Tablet | 576–768px | 2열 그리드 |
| Tablet Large | 768–896px | 확장된 레이아웃 |
| Desktop Small | 896–1024px | 사이드바 노출 |
| Desktop | 1024–1280px | 전체 데스크톱 레이아웃 |
| Large Desktop | >1280px | 확장된 그리드 |

### Collapsing Strategy
- 사이드바: 전체 표시 → 축소 → 숨김
- 앨범 그리드: 5열 → 3열 → 2열 → 1열
- 현재 재생 중 바: 모든 크기에서 유지
- 검색: 알약 입력창 유지, 너비 조정
- 내비게이션: 모바일에서 사이드바 → 하단 바

## 9. Agent Prompt Guide

### Quick Color Reference
- Background: Near Black (`#121212`)
- Surface: Dark Card (`#181818`)
- Text: White (`#ffffff`)
- Secondary text: Silver (`#b3b3b3`)
- Accent: Spotify Green (`#1ed760`)
- Border: `#4d4d4d`
- Error: Negative Red (`#f3727f`)

### Example Component Prompts
- "Create a dark card: #181818 background, 8px radius. Title at 16px SpotifyMixUI weight 700, white text. Subtitle at 14px weight 400, #b3b3b3. Shadow rgba(0,0,0,0.3) 0px 8px 8px on hover."
- "Design a pill button: #1f1f1f background, white text, 9999px radius, 8px 16px padding. 14px SpotifyMixUI weight 700, uppercase, letter-spacing 1.4px."
- "Build a circular play button: Spotify Green (#1ed760) background, #000000 icon, 50% radius, 12px padding."
- "Create search input: #1f1f1f background, white text, 500px radius, 12px 48px padding. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Design navigation sidebar: #121212 background. Active items: 14px weight 700, white. Inactive: 14px weight 400, #b3b3b3."

### Iteration Guide
1. #121212에서 시작하세요 — 모든 것이 거의 검은색의 어둠 속에 존재합니다
2. Spotify Green은 기능적 하이라이트(재생, 활성, CTA)에만 사용합니다
3. 모든 것을 알약 형태로 만드세요 — 대형에는 500px, 소형에는 9999px, 원형에는 50%
4. 버튼에는 대문자와 넓은 자간을 적용하세요 — 체계적인 레이블 어조를 위해
5. 고도감 표현에는 무거운 그림자(0.3–0.5 불투명도)를 사용하세요 — 어두운 배경에서 가벼운 그림자는 보이지 않습니다
6. 앨범 아트가 모든 색채를 제공합니다 — UI는 무채색을 유지합니다
