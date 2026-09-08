---
name: "Snap"
category: Brands
surface: web
colors:
  background: "#0e1319"
  surface: "#151d27"
  foreground: "#edf4fa"
  muted: "#7e8fa0"
  border: "#1a2128"
  accent: "#9fc7e8"
  accent-secondary: "#f22148"
---

# Snap

> Category: Brands

> Surface: web

*Consciência situacional para operações portuárias e marítimas.*

Design system da Snap Platform (Lab Secreto): dashboards operacionais de alta densidade para Centros de Controle Operacional (CCO). Identidade Vidro Slate — camadas tonais translúcidas sobre slate profundo, números-herói, labels mono uppercase, sem bordas. Dark-first e tema único; desktop ≥1280px. Fonte da verdade: tokens/*.css do repositório snap-design-system (React 19 + Tailwind v4 + Storybook 9, 124 componentes importáveis de 134 no catálogo, 497 stories).

## Color Palette

| Role | Name | Hex | Usage |
| --- | --- | --- | --- |
| background | Background | `#0e1319` | Slate profundo — --bg-app: canvas do app. Sob ele, --bg-deep #0B0F14 e o glow radial --bg-glow. |
| surface | Surface | `#151d27` | Painel — --surface-solid / base de --surface-panel (gradiente #1A2430→#151D27), raio 16 + --shadow-panel. Tiles usam --surface-1/2/3 translúcidas. Estrutura por contraste tonal, não por borda. |
| foreground | Foreground | `#edf4fa` | Texto primário — --text-primary: valor de KPI e título de tela. Escala de 7 níveis: strong #DCEAF6 · regular #C9D4DE (corpo) · secondary #93A6B8 · muted · dim #7D8C9B · ghost #3A4A5C. |
| muted | Muted | `#7e8fa0` | Texto muted (piso legível) — --text-muted = --text-tertiary-readable: metadado operacional — horário, sync, unidade de KPI, rótulo de campo. 5,62:1 sobre o app. Em superfícies elevadas sobe para --text-secondary. |
| border | Border | `#1a2128` | Gridline — --gridline rgba(158,190,216,.08) composta sobre o app: divisor interno de lista e tabela. --border-1/-2 foram aposentadas (transparent); --border-strong só em keycap, checkbox e radio. |
| accent | Accent | `#9fc7e8` | Azul gelo — --accent: seleção, foco (ring 2px --focus-ring 42%), link, tab ativa, info. Véus: hover 5% · press 9% · selection 14% · fill-action 8%. Barras de gráfico em gradiente #9FC7E8→#41586E. |
| accent-secondary | Accent secondary | `#f22148` | Brand red — --brand-red: marca (ponto do wordmark) e nada mais. Não é a cor de crítico — no dark, crítico é --critical #F26B84. Nunca decorativo: um dashboard saudável não tem vermelho. |

## Typography
- **Display:** MOAM91 — weights 200, 600 — fallbacks: Geist, Helvetica Neue, Arial, sans-serif
- **Body:** Geist — weights 400, 500, 600, 700 — fallbacks: Helvetica Neue, Arial, sans-serif
- **Mono:** Geist Mono — weights 400, 500, 600 — fallbacks: JetBrains Mono, ui-monospace, Menlo, monospace

## Voice & Tone

- **Adjectives:** operacional, factual, telegráfico, preciso, contido
- **Tone:** A UI informa um operador em turno; não vende. Português brasileiro, sem exclamação, sem marketing, sem emoji. Título de painel e kicker em UPPERCASE mono (letter-spacing +0.08em); corpo e célula em sentence case; botão em sentence case curto ('Ver no mapa'). Imperativo para ação ('Ver detalhes'), nominal para estado ('Calado crítico previsto'); nunca primeira pessoa. Números pt-BR: 1.352 · 13,2 kn · menos real − · 15:36:53 · 28/04/2026.

### Messaging pillars
- Densidade profissional com contenção — referência Linear e Palantir Foundry: cada painel responde a uma pergunta operacional.
- Telemetria discreta, acento tático — labels mono, réguas finas, cantos marcados; HUDs de jogo (Death Stranding, Zero Company) como referência de tom, não de decoração.
- Vermelho é exclusivo de crítico — o sistema saiu do SCADA monocromático para 5 níveis de status e 12 cores geo categóricas, mas o alerta continua sendo o único vermelho da tela.
- Legibilidade medida, não presumida — contraste calculado sobre o fundo composto; --text-dim e --text-ghost só em eixo, grafismo e anotação dispensável.

### Vocabulary
- **Use:** MSC1234567 sem anuência — Entrando na Zona de Restrição A, Janela segura em 40 min, Todas as áreas operando, ÚLTIMA ATUALIZAÇÃO, SYNC 10:38, Ver no mapa, Simular cenário, calado, berço, anuência, lineup, geofence, pipeline, deploy, dataset, uptime (inglês consagrado)
- **Avoid:** exclamações, emoji, primeira pessoa, 'você' fora de necessidade, copy de marketing, hífen como sinal de menos, vírgula de milhar / ponto decimal (padrão en-US)

## Imagery

- **Style:** Cena e mapa reais: MapLibre GL sob overlay tonal 86% + blur; cena 3D com fundo gradiente --surface-stage e malha de pontos --gridline. Feeds de câmera com cromo mono (CAM-04, REC). Fotografia de hardware e operação portuária real quando houver.
- **Subjects:** mapa náutico e AIS, cena 3D de porto e berços, feed de câmera operacional, hardware Snap (compute box), gantt de berços e lineup
- **Treatment:** Marcador: dot com borda accent e glow contido (0 0 10px --focus-ring) só sobre cena. Labels de feição: texto + outline em overlay 2D, sem caixa nem leader line. Fills 2D a 32% com padrões (listras 45° = restrição, cross-hatch em --critical = interdição). Paleta geo categórica --geo-1..12 sem vermelho.
- **Avoid:** ilustração hand-drawn, stock genérico, gradiente roxo, fundo claro/creme (tema é dark-first), filete lateral colorido em card ou toast, vermelho decorativo

## Layout

- **Radius:** 6px
- **Border weight:** 1px
- **Spacing:** base 4px: 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64

### Posture rules
- Contrato completo: tokens.css (todas as custom properties de colors/typography/spacing/gis/charts + classes de papel .kicker/.panel-title/.page-title/.bg-panel/.glass-overlay), tailwind-v4.css (@theme) e TOKENS.md (inventário). Cole o :root de tokens.css no primeiro <style>; nunca redefina valores.
- Pacote: tokens.css · design-tokens.json (DTCG) · tailwind-v4.css · components.html · USAGE.md · SKILL.md · BRAND.md · TOKENS.md · tokens.light.css (referência light, não carregada) · examples/cco-dashboard.html (starter).
- Raios por papel: 4 badge/keycap · 6 controle · 10 card interno · 16 painel · 18 modal/cena · 999 pill (tab segmentada, badge).
- Superfícies tonais sem borda: painel = --surface-panel + --shadow-panel (0 12 32 rgba(0,0,0,.5)); overlay sobre 3D = --surface-overlay 86% + blur 10px. Filete lateral de acento é proibido em card e toast — tom semântico vem de dot ou fundo 12%.
- Geo 3D: 12 cores categóricas --geo-1..12 sem vermelho; basemap --basemap-agua/terra/cais/edificacao/via nunca acima de #2A3D50; náutica --nav-green/red/yellow/white/black/blue/magenta/depth são atributo físico (IALA/S-52), nunca decoração. Gráficos: séries --chart-1..6 categóricas, rampas --chart-seq-1..6 e --chart-div-1..5 sem vermelho.
- Status em 5 níveis: ok #7BD8A0 · warning #E8B36A · risk #F2926B · critical #F26B84 · info/accent #9FC7E8; cada um com fundo 12% e sem borda.
- Escala tipográfica: micro 11 · label 12 · caption 14 · body 16 · body-lg 18 · title 20 · h3 24 · h2 28 · h1 36 (MOAM91) · kpi 40 · kpi-lg 64. Papéis: page 28 · section 24 · panel 20 · body 16 · callout 14 · meta 12 · micro 11 (piso).
- Densidade: raiz = comfortable (padding de painel 20, linha 44, corpo 18). Perfis via data-densidade: compact 12/36/16 · default 16/40/16 · telao 20/56/20 para videowall.
- Espaço por papel: list-row 12 · field 16 · control-stack 8 · panel 20 · section 24 · page 32; medida de prosa 68ch. Alvo de clique: 28px padrão, 20px mínimo.
- Interação: hover véu accent 5%, press 9%, foco ring 2px --focus-ring; sem shrink. Motion 120–200ms cubic-bezier(.2,.8,.2,1); único loop contínuo é o pulso de indicador live.
- MOAM91 só em branding e título de tela (all-caps, tracking +0.04em); Geist na UI; Geist Mono em label uppercase, código, timestamp e número tabular. Número-herói 30–40px peso 500, tracking −0.02em.
- Ícones Lucide, stroke 1.75, 14–16px em botão e lista, 18px em navegação; cor herda do texto. Emoji nunca; unicode tático permitido: → ↗ − ● [ ].
- Gráficos em três conjuntos que não se misturam numa tela: telemetria inline (Gauge, Sparkline, TimelineBar, traço 1,5px sem eixo) · executivo (Recharts, gradiente e número-herói) · científico (ECharts, eixo nomeado, dataZoom). Séries em --chart-1..6, categóricas e sem vermelho.
- Alvo: desktop ≥1280px, dark-first, tema único. Kits de CCO não são responsivos por decisão; light existe só como referência em guidelines/light-theme-reference.md.
- Catálogo (124/134 importáveis) por família — charts 7 (Gauge, Sparkline, TimelineBar…) · charts/exec 7 (ChartFrame, ChartBar, ChartLine…) · charts/sci 15 (SciHeatmap, SciSankey…) · display 41 (Panel, KPI, EventCard, CameraTile, DataTable, Badge, Avatar, Timeline…) · feedback 8 (Dialog, Drawer, Popover, Tooltip, AlertBanner…) · forms 27 (Button, Input, Select, Checkbox, Switch, Slider, DatePicker, Field…) · map 4 (MapLegend, MapControls, ClusterMarker, MapScaleBar) · navigation 15 (Tabs, FilterPill, Keycap, CommandPalette, ModuleRail, Stepper…). Não portados: Radio, Toast, Listbox, TreeSelect, CascadeSelect, LayerTree, Item, PanelHeader, ChartLegend, ChartTooltip.
