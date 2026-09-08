# Snap Design System — pacote OpenDesign

Versão do pacote: **1.0.0** (2026-09-08). Sistema registrado: `user:snap`. Identidade **Vidro Slate** — plataforma de consciência situacional portuária da Snap (Lab Secreto). Dark-first, tema único, desktop ≥1280px.

Este pacote é uma derivação fiel do repositório `snap-design-system` (React 19 + Tailwind v4 + Storybook 9). Ele não substitui o repositório: serve para gerar artefatos HTML (dashboards, decks, mocks, protótipos descartáveis) com os mesmos tokens, fontes, logos e formas.

## Mapa do pacote

| Camada | Arquivo | Origem |
|---|---|---|
| Contrato | `tokens.css` | `tokens/colors.css`, `typography.css`, `spacing.css`, `gis.css`, `charts.css` + classes de papel de `src/styles/sistema.css` — 194 custom properties, comentários longos removidos |
| Contrato (JSON) | `design-tokens.json` | Gerado de `tokens.css` no formato DTCG; overrides com escopo em `$extensions` |
| Tailwind | `tailwind-v4.css` | O `@theme inline` de `sistema.css` |
| Referência light | `tokens.light.css` | `guidelines/light-theme-reference.md` — **não carregado**; dark é o único tema |
| Inventário | `TOKENS.md` | Tabela legível de todos os tokens |
| Fixture | `components.html` | Formas de referência traduzidas de `src/components/{ui,snap}/*.tsx` |
| Exemplo | `examples/cco-dashboard.html` | Starter: dashboard operacional montado só com o contrato |
| Guia | `DESIGN.md`, `BRAND.md`, `USAGE.md`, `SKILL.md` | Princípios, marca, receita e uso por agente |
| Fonte da marca | `brand.json` | Sete papéis de cor, tipografia, voz, imagem, postura; `od brand finalize snap-5d8b30` regenera `system/` |
| Fontes | `fonts/` + `fonts/manifest.json` | Geist e Geist Mono (OFL); MOAM91 sem licença de redistribuição |
| Logos | `logos/` | Cópias byte a byte de `assets/` do repositório |
| Imagem | `imagery/` | Screenshots reais da cena 3D e o compute box |
| Evidência | `context/` | `source-context.md`, `provenance.md`, `identity/` (candidatos A/B/C), snapshot do código, backup do brand.json placeholder |
| Gerado | `system/` | Tokens derivados (antd), kit claro/escuro e seis artefatos — regenerados por finalize |

## Como consumir

1. Cole o `:root` de `tokens.css` no primeiro `<style>` do artefato. Nunca redefina valores; nunca escreva hex fora dele.
2. Carregue `fonts/fonts.css` quando as fontes locais estiverem disponíveis; sem elas o sistema degrada para os fallbacks declarados.
3. Componha com as classes de papel (`.kicker`, `.panel-title`, `.page-title`, `.bg-panel`, `.glass-overlay`) e com as receitas de `components.html`.
4. Densidade por atributo: `data-densidade="compact|default|comfortable|telao"`.
5. Antes de entregar, confira as dez regras de `USAGE.md`.

## O que muda onde

| Quero mudar | Vou em |
|---|---|
| um valor de token | `tokens/*.css` do repositório, depois regenerar `tokens.css` deste pacote |
| paleta de papéis, voz, logo | `brand.json` → `od brand finalize snap-5d8b30` |
| uma forma de componente | `src/components/` do repositório; espelhar a receita em `components.html` |

## Caveats conhecidos

- O kit gerado em `system/kit*.html` deriva o botão primário pelo algoritmo escuro do antd e chega a um azul dessaturado, não ao `--accent #9FC7E8` exato. O contrato em `tokens.css` está exato.
- MOAM91 é "All rights reserved" (Nawras Khrais). Uso local; não publique o kit nem o Storybook sem autorização.
- O fixture traduz classes Tailwind para CSS; estados complexos (Select aberto, Dialog, Drawer, CommandPalette) não estão representados.
- Sem site público medido: toda a evidência vem do repositório local vinculado. Ver `context/provenance.md`.
