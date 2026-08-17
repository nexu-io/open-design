---
name: KIM Partners Design System
description: Pacote reutilizável de linguagem editorial, ativos e componentes para entregáveis patrimoniais KIM.
source_project: Entregável da marca KIM
source_project_id: 290a3797-1c28-4f10-b9a3-ec721ecb35aa
source_context: context/source-context.md
package_contents: DESIGN.md, SKILL.md, colors_and_type.css, assets, fonts, build, source-examples, preview, ui_kits/app
preview_cards: preview/index.html, preview/colors-primary.html, preview/typography-specimens.html, preview/spacing-tokens.html, preview/components-buttons.html, preview/brand-assets.html, preview/applied-surfaces.html
preserved_assets: assets/
fonts: fonts/
build_artifacts: build/
source_examples: source-examples/
ui_kit: ui_kits/app/
reuse_workflow: context, tokens, source examples, preview cards, applied kit, accessibility review
---

# KIM Partners Design System

## Product overview

KIM Partners é uma consultoria de estratégia patrimonial para famílias de alta renda atendidas por consultores CFP. O sistema traduz contexto, governança e decisão patrimonial em materiais de leitura clara, sem assumir a estética de uma corretora, banco tradicional ou dashboard SaaS.

This design system supports the KIM wealth-advisory product. Its source product is the preserved KIM delivery workspace; primary surfaces are client reports, executive presentations, editorial perspectives and internal consultation tools. Core capabilities are wealth-context reading, liquidity-horizon classification, decision storytelling and accessible component use.

### Source product

Este pacote deriva de **Entregável da marca KIM**. A evidência original reúne guia de marca, foundations, contratos de componentes, fontes locais, logos, ícones, gradientes, fotografia, a galeria canônica e uma peça editorial sobre liquidez.

### Primary surfaces

- Relatórios, diagnósticos e documentos patrimoniais para clientes.
- Apresentações executivas e peças editoriais de perspectiva.
- Superfícies internas de consulta que apoiam uma conversa consultiva.

### Core capabilities

- Organizar uma leitura patrimonial em tese, evidência, implicação e próximo passo.
- Classificar ativos por horizonte de liquidez sem fabricar dados de cliente.
- Aplicar componentes operacionais com foco visível, labels persistentes e contratos de acessibilidade.

## Product context

A marca é editorial, precisa e silenciosamente sofisticada. Degular organiza a leitura funcional; Wild Title Sans é exclusiva para assinatura. Cor, espaço e composição carregam a hierarquia: não há sombras gratuitas, escalas cromáticas inventadas ou taxonomias de estado sem contexto aprovado.

## Source context

### Source/context references

The source/context references are the captured source inventory, provenance notes, preserved gallery, source examples and component contracts listed below.

- [Inventário do projeto-fonte](context/source-context.md) — cópia e origem de cada evidência.
- [Proveniência](context/provenance.md) — autoridade, decisões derivadas e limites conhecidos.
- [Galeria canônica preservada](source-examples/kim-design-system.html) e [peça de liquidez](source-examples/kim-liquidez-real.html) — implementação de referência, preservada integralmente.
- [Contratos de componente](KIM-COMPONENT-CONTRACTS.md) — fonte de uso para controles operacionais.

## Package contents

### Preserved assets, fonts and build artifacts

Preserved assets live in `assets/`; local fonts live in `fonts/`; original build icons live in `build/`; substantive source examples live in `source-examples/`.

| Caminho | Conteúdo |
|---|---|
| `DESIGN.md` | Fundamentos, perfis, componentes e antipadrões. |
| `SKILL.md` | Instrução de reuso para criação de novos entregáveis. |
| `colors_and_type.css` | Tokens de cor, tipo, espaço, grid, raio e motion. |
| `assets/` | Logos, imagens e gradientes oficiais preservados. |
| `fonts/` | Arquivos Degular, Degular Mono e Wild Title Sans. |
| `build/` | Ícones KIM preservados byte a byte, com nomes originais. |
| `source-examples/` | Snapshots substanciais da implementação-fonte. |
| `preview/` | Cartões visuais de revisão do sistema. |
| `ui_kits/app/` | Kit aplicado, modular e navegável para consulta de liquidez. |

## Preview cards

### Preview card manifest

Every `preview/*.html` card in the manifest is a focused review surface; `ui_kits/app/` is the composed applied-kit entry point.

- [Índice de revisão](preview/index.html) — rota recomendada e síntese do pacote.
- [Cores primárias](preview/colors-primary.html) — primitives, pares e limites de semântica.
- [Espécimes tipográficos](preview/typography-specimens.html) — assinatura, escala e dados.
- [Espaço e grid](preview/spacing-tokens.html) — ritmo, proporção, raio e profundidade sem sombra.
- [Componentes](preview/components-buttons.html) — botões, campos e regras de interação.
- [Ativos de marca](preview/brand-assets.html) — logos, gradientes, ícones de `build/` e fotografia preservada.
- [Superfícies aplicadas](preview/applied-surfaces.html) — articulação editorial e operacional.

## Package reuse guide

This package reuse guide connects source/context references, package contents, preview cards, preserved assets, local fonts, build artifacts, source examples and the applied UI kit. Reviewers should use the preview-card manifest before adapting a surface.

### Reuse/review workflow

The reuse/review workflow is: inspect the preview cards, read the source context, choose a profile, import the shared CSS, compose from `ui_kits/app/` or source examples, and verify interactions.

1. Leia `DESIGN.md` e escolha o perfil editorial/institucional ou produto/operação.
2. Importe `colors_and_type.css`; não recrie valores de tokens, fontes ou gradientes.
3. Para uma peça editorial, comece pelo exemplo de liquidez e preserve a medida de leitura de 560–680 px.
4. Para uma superfície operacional, comece por `ui_kits/app/index.html` e use os módulos em `ui_kits/app/components/`.
5. Valide foreground/background, foco visível, reflow e reduced motion; em Tabs, Modal, Drawer e Accordion implemente o contrato completo de teclado.

## Package Guide

## Claude Design Package Guide

This is a reusable Claude Design package. It includes source/context references, package contents, preview cards, preserved assets, fonts, build artifacts, source examples, the applied UI kit and a concrete reuse or review workflow.

### When to use

Use this package when producing KIM reports, presentations, editorial perspectives, client-facing documents or the documented operational consultation surfaces.

### How to use

Read the source context, import tokens, select a profile, reuse the preserved assets and compose from the source examples or `ui_kits/app/`. Then perform the review workflow before delivery.

### Source & Context

Use `context/source-context.md`, `context/provenance.md` e `source-examples/` para recuperar contexto e implementação, sem inferir valores ausentes.

### Preserved Assets, Fonts & Build Artifacts

Use logos, imagens e gradientes em `assets/`; fontes em `fonts/`; e ícones originais em `build/`. Não substitua esses recursos por versões aproximadas.

### Source Examples & UI Kit

Use `source-examples/kim-liquidez-real.html` para composição editorial e `ui_kits/app/index.html` para iniciar uma superfície operacional modular.

### Reuse and Review Workflow

Revise `preview/index.html`, adapte a peça usando tokens, confira `preview/components-buttons.html`, monte a interface pelo kit aplicado e finalize a validação de acessibilidade.

### Reuse recipe

1. **Context:** leia `context/source-context.md`, `context/provenance.md` e `DESIGN.md` antes de começar.
2. **Assets:** use `assets/logos/`, `assets/gradients/`, `assets/imagery/`, `fonts/` e `build/icon-kim-*.png` diretamente; eles são os recursos preservados.
3. **Source examples:** abra `source-examples/kim-design-system.html` e `source-examples/kim-liquidez-real.html` para verificar composição e contrato.
4. **Preview cards:** revise os sete arquivos listados em `Preview cards` para confirmar cor, tipo, espaço, componentes, ativos e aplicação.
5. **Applied kit:** componha uma superfície em `ui_kits/app/` usando `ui_kits/app/components/kit-components.css` e `kit-components.js`.
6. **Review:** teste o fluxo, estados de foco, contraste, reflow e reduced motion antes de entregar.

## Non-negotiable Rules

- Não usar Wild Title Sans em títulos ou controles funcionais.
- Não introduzir sombras, novos breakpoints, tints/shades ou aliases globais de feedback.
- Não reconstruir gradientes em CSS; use os PNG preservados.
- Fotografia segue `PROPOSAL_PENDING_HOMOLOGATION`: pode ser revisada, não promovida automaticamente a regra canônica.
