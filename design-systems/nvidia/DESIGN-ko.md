# Design System Inspired by NVIDIA

> Category: 미디어 & 소비자
> GPU 컴퓨팅. 그린-블랙 에너지, 기술적 파워 미학.

## 1. 비주얼 테마 & 분위기

NVIDIA의 웹사이트는 절제된 디자인으로 순수한 연산 능력을 전달하는 고대비, 기술 중심 경험이다. 페이지는 강렬한 블랙(`#000000`)과 화이트(`#ffffff`)를 기반으로, NVIDIA 고유의 그린(`#76b900`)이 포인트로 들어간다 -- 이 색은 너무나 특정적이어서 브랜드 지문처럼 기능한다. 이것은 자연의 풍요로운 초록이 아니라, GPU가 렌더링한 빛의 전기적이고 라임-쉬프트된 그린으로, 차트리즈와 켈리 그린 사이 어딘가에 위치하며 기술 업계 사람이라면 누구나 즉각 "NVIDIA"를 떠올리게 만드는 색이다.

커스텀 NVIDIA-EMEA 폰트 패밀리(Arial과 Helvetica 폴백 포함)는 깔끔하고 산업적인 타이포그래피 보이스를 만들어낸다. 36px 볼드 헤딩에 1.25의 타이트한 줄간격은 밀도 높고 권위 있는 텍스트 블록을 형성한다. 이 폰트는 실리콘밸리 산세리프 특유의 기하학적 유희성이 없다 -- 유럽적이고, 실용적이며, 엔지니어링에 집중되어 있다. 본문은 15~16px로 읽기 편하되 넉넉하지는 않으며, GPU 메모리처럼 화면 공간이 최적화되어 있다는 느낌을 유지한다.

NVIDIA 디자인이 다른 다크 배경 테크 사이트와 구별되는 점은 그린 액센트의 절제된 사용에 있다. `#76b900`은 보더(`2px solid #76b900`), 링크 언더라인(`underline 2px rgb(118, 185, 0)`), CTA에 나타나지만, 메인 콘텐츠의 배경이나 넓은 면적에는 절대 사용되지 않는다. 그린은 신호이지 표면이 아니다. 깊이감 있는 그림자 시스템(`rgba(0, 0, 0, 0.3) 0px 0px 5px`)과 최소한의 보더 반경(1~2px)이 결합되어, 전체적으로 픽셀로 렌더링된 정밀 엔지니어링 하드웨어 같은 인상을 준다.

**주요 특성:**
- NVIDIA Green(`#76b900`)을 순수 액센트로 사용 -- 보더, 언더라인, 인터랙티브 하이라이트에만 적용
- 블랙(`#000000`) 지배적 배경, 다크 섹션에는 화이트(`#ffffff`) 텍스트
- Arial/Helvetica 폴백을 가진 NVIDIA-EMEA 커스텀 폰트 -- 산업적이고, 유럽적이며, 깔끔한 느낌
- 타이트한 줄간격(헤딩 1.25)으로 밀도 높고 권위 있는 텍스트 블록 형성
- 최소한의 보더 반경(1~2px) -- 전반에 걸쳐 샤프하고 정밀한 모서리
- 그린 보더 버튼(`2px solid #76b900`)이 기본 인터랙티브 패턴
- Font Awesome 6 Pro/Sharp 아이콘 시스템, weight 900으로 샤프한 아이코노그래피
- 풍부한 인터랙티브 컴포넌트를 지원하는 멀티 프레임워크 아키텍처(PrimeReact, Fluent UI, Element Plus)

## 2. 컬러 팔레트 & 역할

### 주요 브랜드
- **NVIDIA Green** (`#76b900`): 시그니처 -- 보더, 링크 언더라인, CTA 아웃라인, 활성 상태 표시. 넓은 면적 채우기에는 절대 사용하지 않음.
- **True Black** (`#000000`): 페이지 기본 배경, 밝은 표면 위 텍스트, 지배적 톤.
- **Pure White** (`#ffffff`): 다크 배경 위 텍스트, 밝은 섹션 배경, 카드 표면.

### 확장 브랜드 팔레트
- **NVIDIA Green Light** (`#bff230`): 하이라이트와 호버 상태를 위한 밝은 라임 액센트.
- **Orange 400** (`#df6500`): 알림, 주목 배지, 에너지 관련 맥락을 위한 웜 액센트.
- **Yellow 300** (`#ef9100`): 보조 웜 액센트, 제품 카테고리 하이라이트.
- **Yellow 050** (`#feeeb2`): 콜아웃 배경을 위한 밝은 웜 표면.

### 상태 & 시맨틱
- **Red 500** (`#e52020`): 오류 상태, 파괴적 동작, 치명적 알림.
- **Red 800** (`#650b0b`): 심각한 경고 배경을 위한 진한 레드.
- **Green 500** (`#3f8500`): 성공 상태, 긍정적 표시(브랜드 그린보다 어두움).
- **Blue 700** (`#0046a4`): 정보성 액센트, 링크 호버 대안.

### 장식적
- **Purple 800** (`#4d1368`): 그라디언트 끝부분, 프리미엄/AI 맥락을 위한 진한 퍼플.
- **Purple 100** (`#f9d4ff`): 밝은 퍼플 표면 틴트.
- **Fuchsia 700** (`#8c1c55`): 특별 프로모션이나 추천 콘텐츠를 위한 리치 액센트.

### 뉴트럴 스케일
- **Gray 300** (`#a7a7a7`): 뮤트 텍스트, 비활성 레이블.
- **Gray 400** (`#898989`): 보조 텍스트, 메타데이터.
- **Gray 500** (`#757575`): 3차 텍스트, 플레이스홀더, 푸터.
- **Gray Border** (`#5e5e5e`): 은은한 보더, 구분선.
- **Near Black** (`#1a1a1a`): 다크 표면, 블랙 페이지의 카드 배경.

### 인터랙티브 상태
- **Link Default (dark bg)** (`#ffffff`): 다크 배경의 화이트 링크.
- **Link Default (light bg)** (`#000000`): 밝은 배경의 그린 언더라인이 있는 블랙 링크.
- **Link Hover** (`#3860be`): 모든 링크 변형에서 호버 시 블루로 전환.
- **Button Hover** (`#1eaedb`): 버튼 호버 상태의 틸 하이라이트.
- **Button Active** (`#007fff`): 활성/눌림 버튼 상태의 밝은 블루.
- **Focus Ring** (`#000000 solid 2px`): 키보드 포커스를 위한 블랙 아웃라인.

### 그림자 & 깊이
- **Card Shadow** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): 부각된 카드를 위한 은은한 앰비언트 그림자.

## 3. 타이포그래피 규칙

### 폰트 패밀리
- **Primary**: `NVIDIA-EMEA`, 폴백: `Arial, Helvetica, sans-serif`
- **Icon Font**: `Font Awesome 6 Pro` (솔리드 아이콘 weight 900, 레귤러 700)
- **Icon Sharp**: `Font Awesome 6 Sharp` (라이트 아이콘 weight 300, 레귤러 400)

### 계층 구조

| 역할 | 폰트 | 크기 | Weight | 줄간격 | 자간 | 비고 |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (tight) | normal | 최대 임팩트 헤드라인 |
| Section Heading | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (tight) | normal | 섹션 타이틀, 카드 헤딩 |
| Sub-heading | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (relaxed) | normal | 기능 설명, 서브타이틀 |
| Card Title | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (tight) | normal | 카드 및 모듈 헤딩 |
| Body Large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (relaxed) | normal | 강조 본문, 리드 단락 |
| Body | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | 표준 읽기 텍스트 |
| Body Bold | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | 강한 레이블, 내비게이션 항목 |
| Body Small | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (relaxed) | normal | 보조 콘텐츠, 설명 |
| Body Small Bold | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | 강조된 보조 콘텐츠 |
| Button Large | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (tight) | normal | 주요 CTA 버튼 |
| Button | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (tight) | normal | 표준 버튼 |
| Button Compact | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (tight) | 0.144px | 소형/컴팩트 버튼 |
| Link | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | 내비게이션 링크 |
| Link Uppercase | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, 내비게이션 레이블 |
| Caption | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | 메타데이터, 타임스탬프 |
| Caption Small | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (tight) | normal | 미세 인쇄, 법적 문구 |
| Micro Label | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, 작은 배지 |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (tight) | normal | 가장 작은 UI 텍스트 |

### 원칙
- **볼드가 기본 보이스**: NVIDIA는 헤딩, 버튼, 링크, 레이블에 weight 700을 적극 사용한다. 400 weight는 본문 텍스트와 설명에만 쓰이고 -- 그 외 모든 것은 볼드로, 자신감과 권위를 투영한다.
- **타이트한 헤딩, 여유로운 본문**: 헤딩 줄간격은 일관되게 1.25(타이트)이며, 본문 텍스트는 1.50~1.67로 여유롭다. 이 대비는 콘텐츠 블록 상단에 시각적 밀도를 만들고 단락에서 편안한 가독성을 제공한다.
- **내비게이션에 대문자 사용**: 링크 레이블은 weight 700과 함께 `text-transform: uppercase`를 사용하여, 하드웨어 사양 레이블처럼 읽히는 내비게이션 보이스를 만든다.
- **장식적 자간 없음**: 컴팩트 버튼(0.144px)을 제외하고 자간은 전반에 걸쳐 normal이다. 폰트 자체가 조작 없이도 산업적 특성을 담고 있다.

## 4. 컴포넌트 스타일링

### 버튼

**Primary (Green Border)**
- Background: `transparent`
- Text: `#000000`
- Padding: 11px 13px
- Border: `2px solid #76b900`
- Radius: 2px
- Font: 16px weight 700
- Hover: background `#1eaedb`, text `#ffffff`
- Active: background `#007fff`, text `#ffffff`, border `1px solid #003eff`, scale(1)
- Focus: background `#1eaedb`, text `#ffffff`, outline `#000000 solid 2px`, opacity 0.9
- 용도: 주요 CTA ("Learn More", "Explore Solutions")

**Secondary (Green Border Thin)**
- Background: transparent
- Border: `1px solid #76b900`
- Radius: 2px
- 용도: 보조 동작, 대안 CTA

**Compact / Inline**
- Font: 14.4px weight 700
- Letter-spacing: 0.144px
- Line-height: 1.00
- 용도: 인라인 CTA, 컴팩트 내비게이션

### 카드 & 컨테이너
- Background: `#ffffff` (밝은 섹션) 또는 `#1a1a1a` (다크 섹션)
- Border: 없음 (클린 엣지) 또는 `1px solid #5e5e5e`
- Radius: 2px
- Shadow: 부각된 카드에 `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`
- Hover: 그림자 강화
- Padding: 내부 16~24px

### 링크
- **다크 배경**: `#ffffff`, 언더라인 없음, 호버 시 `#3860be`로 전환
- **밝은 배경**: `#000000` 또는 `#1a1a1a`, 언더라인 `2px solid #76b900`, 호버 시 `#3860be`로 전환하며 언더라인 제거
- **그린 링크**: `#76b900`, 호버 시 `#3860be`로 전환
- **뮤트 링크**: `#666666`, 호버 시 `#3860be`로 전환

### 내비게이션
- 다크 블랙 배경(`#000000`)
- 로고 좌정렬, 두드러진 NVIDIA 워드마크
- 링크: NVIDIA-EMEA 14px weight 700 대문자, `#ffffff`
- Hover: 컬러 전환, 언더라인 변경 없음
- 제품 카테고리 메가메뉴 드롭다운
- 배경이 있는 스크롤 고정

### 이미지 처리
- 제품/GPU 렌더 이미지를 히어로로, 대부분 전체 너비로 사용
- 스크린샷 이미지에 깊이감을 위한 은은한 그림자
- 다크 히어로 섹션에 그린 그라디언트 오버레이
- 50% 반경의 원형 아바타 컨테이너

### 특징적 컴포넌트

**Product Cards**
- 최소 반경(2px)의 클린 화이트 또는 다크 카드
- 타이틀에 그린 액센트 보더 또는 언더라인
- 볼드 헤딩 + 가벼운 설명 패턴
- 하단에 그린 보더 CTA

**Tech Spec Tables**
- 산업적 그리드 레이아웃
- 교대로 바뀌는 행 배경(은은한 그레이 전환)
- 볼드 레이블, 레귤러 값
- 주요 지표에 그린 하이라이트

**Cookie/Consent Banner**
- 하단 고정 위치
- 둥근 버튼(2px 반경)
- 그레이 보더 처리

## 5. 레이아웃 원칙

### 간격 시스템
- 기본 단위: 8px
- 스케일: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- 주요 패딩 값: 8px, 11px, 13px, 16px, 24px, 32px
- 섹션 간격: 48~80px 수직 패딩

### 그리드 & 컨테이너
- 최대 콘텐츠 너비: 약 1200px (컨테이너 내)
- 텍스트는 컨테이너 안에, 히어로 섹션은 전체 너비
- 기능 섹션: 제품 카드를 위한 2~3열 그리드
- 아티클/블로그 콘텐츠는 단일 컬럼
- 문서에는 사이드바 레이아웃

### 여백 철학
- **목적 있는 밀도**: NVIDIA는 일반적인 SaaS 사이트보다 촘촘한 간격을 사용하며, 기술 콘텐츠의 밀도를 반영한다. 여백은 개념을 분리하기 위해 존재하지, 호화로운 공백을 만들기 위한 것이 아니다.
- **섹션 리듬**: 다크 섹션과 화이트 섹션이 교대로 나타나며, 간격이 아닌 배경 컬러로 콘텐츠 블록을 구분한다.
- **카드 밀도**: 제품 카드는 16~20px 간격으로 촘촘히 배치되어, 갤러리 느낌이 아닌 카탈로그 느낌을 만든다.

### 보더 반경 스케일
- Micro (1px): 인라인 스팬, 작은 요소
- Standard (2px): 버튼, 카드, 컨테이너, 인풋 -- 거의 모든 것의 기본값
- Circle (50%): 아바타 이미지, 원형 탭 인디케이터

## 6. 깊이 & 엘리베이션

| 레벨 | 처리 | 용도 |
|-------|-----------|-----|
| Flat (Level 0) | 그림자 없음 | 페이지 배경, 인라인 텍스트 |
| Subtle (Level 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | 표준 카드, 모달 |
| Border (Level 1b) | `1px solid #5e5e5e` | 콘텐츠 구분선, 섹션 보더 |
| Green accent (Level 2) | `2px solid #76b900` | 활성 요소, CTA, 선택된 항목 |
| Focus (Accessibility) | `2px solid #000000` outline | 키보드 포커스 링 |

**그림자 철학**: NVIDIA의 깊이 시스템은 최소한이고 실용적이다. 본질적으로 하나의 그림자 값만 있다 -- 30% 불투명도의 5px 앰비언트 블러 -- 카드와 모달에 드물게 사용된다. 주요 깊이 신호는 그림자가 아니라 _컬러 대비_다: 화이트 섹션 옆의 블랙 배경, 블랙 표면 위의 그린 보더. 이는 빛을 시뮬레이션하는 것이 아닌 소재 차이에서 깊이가 오는, 하드웨어 같은 시각적 레이어링을 만든다.

### 장식적 깊이
- 히어로 콘텐츠 뒤에 그린 그라디언트 세척 효과
- 섹션 전환을 위한 다크-투-다커 그라디언트(블랙에서 니어 블랙)
- 글래스모피즘이나 블러 효과 없음 -- 분위기보다 명확성 우선

## 7. 반응형 동작

### 브레이크포인트
| 이름 | 너비 | 주요 변경 사항 |
|------|-------|-------------|
| Mobile Small | <375px | 컴팩트 단일 컬럼, 줄어든 패딩 |
| Mobile | 375-425px | 표준 모바일 레이아웃 |
| Mobile Large | 425-600px | 넓어진 모바일, 일부 2열 힌트 |
| Tablet Small | 600-768px | 2열 그리드 시작 |
| Tablet | 768-1024px | 전체 카드 그리드, 확장 내비게이션 |
| Desktop | 1024-1350px | 표준 데스크톱 레이아웃 |
| Large Desktop | >1350px | 최대 콘텐츠 너비, 넉넉한 여백 |

### 터치 타겟
- 버튼은 편안한 탭 타겟을 위해 11px 13px 패딩 사용
- 내비게이션 링크는 충분한 간격의 14px 대문자
- 그린 보더 버튼은 다크 배경에서 고대비 터치 타겟 제공
- 모바일: 전체 화면 오버레이로 햄버거 메뉴 접힘

### 접힘 전략
- 히어로: 36px 헤딩이 비례적으로 축소
- 내비게이션: 전체 수평 내비게이션이 ~1024px에서 햄버거 메뉴로 접힘
- 제품 카드: 3열 → 2열 → 단일 컬럼 스택
- 푸터: 멀티컬럼 그리드가 단일 스택 컬럼으로 접힘
- 섹션 간격: 64~80px가 모바일에서 32~48px로 축소
- 이미지: 종횡비 유지, 컨테이너 너비에 맞게 스케일

### 이미지 동작
- GPU/제품 렌더는 모든 크기에서 고해상도 유지
- 히어로 이미지는 뷰포트에 비례적으로 스케일
- 카드 이미지는 일관된 종횡비 사용
- 풀블리드 다크 섹션은 엣지-투-엣지 처리 유지

## 8. 반응형 동작 (확장)

### 타이포그래피 스케일링
- Display 36px는 모바일에서 ~24px로 축소
- 섹션 헤딩 24px는 모바일에서 ~20px로 축소
- 본문 텍스트는 모든 브레이크포인트에서 15~16px 유지
- 버튼 텍스트는 일관된 탭 타겟을 위해 16px 유지

### 다크/라이트 섹션 전략
- 다크 섹션(블랙 배경, 화이트 텍스트)과 라이트 섹션(화이트 배경, 블랙 텍스트)이 교대로 배치
- 그린 액센트는 두 표면 유형 모두에서 일관되게 유지
- 다크에서: 링크는 화이트, 언더라인은 그린
- 라이트에서: 링크는 블랙, 언더라인은 그린
- 이 교대 배치는 자연스러운 스크롤 리듬과 콘텐츠 그룹화를 만들어낸다

## 9. 에이전트 프롬프트 가이드

### 빠른 컬러 참조
- Primary accent: NVIDIA Green (`#76b900`)
- Background dark: True Black (`#000000`)
- Background light: Pure White (`#ffffff`)
- 헤딩 텍스트 (다크 배경): White (`#ffffff`)
- 헤딩 텍스트 (라이트 배경): Black (`#000000`)
- 본문 텍스트 (라이트 배경): Black (`#000000`) 또는 Near Black (`#1a1a1a`)
- 본문 텍스트 (다크 배경): White (`#ffffff`) 또는 Gray 300 (`#a7a7a7`)
- Link hover: Blue (`#3860be`)
- Border accent: `2px solid #76b900`
- Button hover: Teal (`#1eaedb`)

### 예시 컴포넌트 프롬프트
- "블랙 배경의 히어로 섹션을 만드세요. 헤드라인은 36px NVIDIA-EMEA weight 700, line-height 1.25, color #ffffff. 서브타이틀은 18px weight 400, line-height 1.67, color #a7a7a7. CTA 버튼은 transparent 배경, 2px solid #76b900 보더, 2px 반경, 11px 13px 패딩, text #ffffff. Hover: background #1eaedb, text white."
- "제품 카드를 디자인하세요: 화이트 배경, 2px border-radius, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. 타이틀은 20px NVIDIA-EMEA weight 700, line-height 1.25, color #000000. 본문은 15px weight 400, line-height 1.67, color #757575. 타이틀에 그린 언더라인 액센트: border-bottom 2px solid #76b900."
- "내비게이션 바를 만드세요: #000000 배경, sticky top. NVIDIA 로고 좌정렬. 링크는 14px NVIDIA-EMEA weight 700 대문자, color #ffffff. Hover: color #3860be. 우정렬 그린 보더 CTA 버튼."
- "다크 기능 섹션을 만드세요: #000000 배경. 섹션 레이블은 14px weight 700 대문자, color #76b900. 헤딩은 24px weight 700, color #ffffff. 설명은 16px weight 400, color #a7a7a7. 20px 간격의 세 제품 카드를 한 줄로."
- "푸터를 디자인하세요: #000000 배경. 링크 그룹이 있는 멀티컬럼 레이아웃. 링크는 14px weight 400, color #a7a7a7. Hover: color #76b900. 하단 바에는 12px 법적 문구, color #757575."

### 반복 가이드
1. 항상 `#76b900`을 액센트로 사용하고, 배경 채우기에는 절대 사용하지 않는다 -- 보더, 언더라인, 하이라이트를 위한 신호 컬러
2. 버튼은 기본적으로 그린 보더가 있는 투명 배경 -- 채워진 배경은 호버/활성 상태에서만 나타난다
3. Weight 700이 모든 인터랙티브 요소와 헤딩의 지배적 보이스; 400은 본문 단락에만 사용
4. 보더 반경은 모든 것에 2px -- 이 샤프하고 미니멀한 둥글기는 산업적 미학의 핵심
5. 다크 섹션은 화이트 텍스트; 라이트 섹션은 블랙 텍스트 -- 그린 액센트는 두 섹션 모두에서 동일하게 작동
6. 링크 호버는 링크의 기본 컬러에 관계없이 항상 `#3860be`(블루)
7. 헤딩의 줄간격 1.25, 본문 텍스트 1.50~1.67 -- 시각적 계층을 위해 이 대비를 유지
8. 내비게이션은 대문자 14px 볼드 -- 이 하드웨어 레이블 타이포그래피는 브랜드 보이스의 일부
