---
name: snap-design
description: Gera interfaces e artefatos HTML com a identidade Snap (Vidro Slate) — dashboards de CCO, mocks, decks e protótipos — usando o contrato tokens.css deste pacote.
user-invocable: true
---

Design system da **Snap Platform** (Lab Secreto): consciência situacional portuária e marítima, dashboards operacionais de alta densidade para Centros de Controle Operacional. Identidade **Vidro Slate**: camadas tonais sobre slate profundo, números-herói, kickers mono uppercase, sem bordas. Dark-first, tema único, desktop ≥1280px.

Leia `USAGE.md` e `DESIGN.md`; cole o `:root` de `tokens.css` no primeiro `<style>`; copie formas de `components.html`; veja `examples/cco-dashboard.html` como ponto de partida.

## Os seis erros que custam retrabalho

1. **`--brand-red #F22148` não é crítico.** É a marca (ponto do wordmark). Crítico é `--critical #F26B84`. Um dashboard saudável não tem vermelho.
2. **O sistema não é monocromático.** Cinco níveis de status (`ok`, `warning`, `risk`, `critical`, `info`), 12 cores geo, acento azul gelo. A versão SCADA monocromática é o passado.
3. **Bordas foram aposentadas.** `--border-1/-2` são `transparent`. Estrutura = `--surface-panel` + `--shadow-panel`. Sobrevivem `--gridline` (divisor de lista/tabela) e `--border-strong` (keycap, checkbox, radio).
4. **Não invente espaço.** Escala base-4 `--sp-1..11` (2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64) e papéis `--space-panel`, `--space-field`, `--space-list-row`, `--space-section`, `--space-page`.
5. **Não invente texto secundário.** `--text-muted` é o piso legível para metadado operacional. `--text-dim` e `--text-ghost` só em eixo de gráfico, grafismo `aria-hidden` e anotação dispensável. Se o operador precisa ler para agir, não é dim.
6. **Filete lateral é proibido** em card e toast. Tom semântico vem de dot ou fundo 12%.

## Cor

- Superfícies tonais sem borda: `--surface-panel` (raio 16, `--shadow-panel`) para painel; `--surface-overlay` 86% + blur para overlay sobre cena e mapa; `--surface-1/2/3` para tiles; `--surface-stage` para cena.
- Status com fundo 12% e texto na cor: `--ok-bg`/`--ok`, `--warning-bg`/`--warning`, `--risk-bg`/`--risk`, `--critical-bg`/`--critical`, `--info-bg`/`--accent`.
- Accent `#9FC7E8` para seleção, foco (`--focus-ring` 2px), link, tab ativa e info. Véus: hover 5%, press 9%, selection 14%, fill-action 8%.
- Geo `--geo-1..12` sem vermelho; basemap nunca acima de `#2A3D50`; `--nav-*` é atributo físico IALA/S-52.
- Gráficos em três conjuntos que não se misturam: telemetria inline (`--accent` + `--surface-3`, traço 1,5px, sem eixo), executivo (`--chart-1..6`, gradiente `--accent→--accent-deep`, número-herói), científico (`--chart-axis-line`, `--chart-seq-*`, `--chart-div-*`).

## Tipografia

- MOAM91 (`--font-display`) só branding e título de tela, all-caps, tracking +0.04em.
- Geist (`--font-sans`) para UI. Geist Mono (`--font-mono`) para kicker uppercase (tracking +0.08em), código, timestamp e número tabular.
- Papéis: `.page-title` 28 · `.section-title` 24 · `.panel-title` 20 mono uppercase · corpo 16 · callout 14 · `.kicker` 12 · micro 11 (piso). Número-herói 40/64, peso 500, tracking −0.02em.

## Forma e movimento

- Raios: 4 badge/keycap · 6 controle · 10 card interno · 16 painel · 18 modal/cena · `--radius-full` pill.
- Alvo de clique 28px padrão, 20px mínimo. Hover véu, press véu, foco ring; sem shrink.
- Motion 120–200ms `--ease-out`. O pulso `.sds-live-pulse` é o único loop contínuo.
- Densidade por atributo `data-densidade`; raiz = comfortable (painel 20, linha 44, corpo 18); `telao` para videowall.

## Texto na interface

Português brasileiro, tom operacional, factual, telegráfico. Sem exclamação, marketing ou emoji. Título de painel e kicker em UPPERCASE mono; corpo em sentence case; botão curto ("Ver no mapa"). Imperativo para ação, nominal para estado. Números pt-BR: `1.352` · `13,2 kn` · menos real `−` · `15:36:53` · `28/04/2026`. Ícones Lucide, stroke 1.75, 14–16px.

## Antes de dar por pronto

- Nenhum hex fora do `:root` colado; nenhum valor de espaço fora da escala.
- Um único botão primário por viewport; foco visível em tudo que é focável.
- Vermelho só onde há crítico. Logo em `logos/logo-white.svg` sobre slate; nunca recolorido.
