# Proveniência — Snap (user:snap)

Data da passada: 2026-09-08. Fonte única: repositório local vinculado `/Users/fbaeta/workspace/snap-design-system` (git, branch local). Nenhum site público foi medido; `designmd://snap` era um DESIGN.md colado que continha placeholders do antd (#1677ff, Inter, 8px) — backup em `context/brand.json.antd-placeholder.bak`.

## Medido (copiado literalmente)

| Fato | Arquivo de origem |
|---|---|
| 59 tokens de cor, overrides de véu e `.bg-critical/12` | `tokens/colors.css` |
| 28 tokens de tipografia (famílias, escala, papéis) | `tokens/typography.css` |
| 37 tokens de espaço, raio, sombra, motion + 4 perfis de densidade | `tokens/spacing.css` |
| 43 tokens geo, basemap e náutica | `tokens/gis.css` |
| 27 tokens de gráfico (séries, cromo, rampas) | `tokens/charts.css` |
| `@font-face` MOAM91 200/600, Geist 400–700, Geist Mono 400–600 | `tokens/fonts.css`, `assets/fonts/` |
| Classes de papel, base, reduced-motion | `src/styles/sistema.css`, `src/components/snap/snap.css` |
| Receitas de componente (classes Tailwind) | `src/components/ui/*.tsx`, `src/components/snap/*.tsx` |
| Logos (5 arquivos, byte a byte) | `assets/logo-*.svg`, `assets/mark-mono-white.png` |
| Imagem: compute box, cena operacional, estados de berço | `assets/snap-compute-box.png`, `screenshots/03-c.png`, `screenshots/berco-clock.jpg` |
| Voz, casing, números, exemplos de copy | `readme.md § CONTENT FUNDAMENTALS`, `SKILL.md` |
| Catálogo 124/134, não portados, beta | `readme.md § Maturidade por família` (gerado por `bun run maturity`) |
| Governança, versionamento | `GOVERNANCA.md` |
| Referência light (não carregada) | `guidelines/light-theme-reference.md` |
| Candidatos de identidade | `_identity/v2-*.html` (copiados para `context/identity/`) |

## Derivado (calculado a partir do medido)

- `--gridline` composto sobre `--bg-app` = `#1A2128` (papel `border` do brand.json). Derivação: 8% de rgba(158,190,216) sobre #0E1319.
- Valores OKLch do brand.json calculados dos hex.
- `system/variables.css`, `theme.json`, `kit*.html` e `system/artifacts/*` são derivados pelo motor OpenDesign (algoritmo antd dark) a partir do seed. O primário derivado (`#b3c6d4`) diverge do accent medido (`#9FC7E8`).

## Inferido (não há medição no repositório)

- Fixture `components.html`: tradução de classes Tailwind para CSS puro; hover de `danger` usa `color-mix` 18% para reproduzir `bg-critical/[0.18]`.
- Números de exemplo nos artefatos (calado, ETA, ocupação) são ilustrativos, marcados como tal no contexto operacional.

## Limitações abertas

- MOAM91 sem concessão de licença — bloqueia distribuição do kit.
- Sem tema light em produção; `tokens.light.css` é referência.
- Estados complexos de componente (Select aberto, Dialog, CommandPalette) não estão no fixture.
