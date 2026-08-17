---
name: kim-design-system
description: Cria peças editoriais e superfícies operacionais KIM com tokens, ativos e contratos preservados.
user-invocable: true
---

# Criar materiais com o KIM Design System

## What is inside

`DESIGN.md` contém a orientação de marca e os perfis; `colors_and_type.css` publica tokens reutilizáveis; `assets/`, `fonts/` e `build/icons/` preservam material real; `preview/` oferece revisão visual; `source-examples/` mantém a implementação fonte; e `ui_kits/app/` aplica os componentes em contextos de consulta.

## Source context

O pacote deriva do projeto KIM Partners, voltado a consultoria e estratégia patrimonial. A evidência preservada define uma marca editorial, silenciosa e precisa, construída para explicar decisões complexas a famílias de alta renda e seus consultores.

## When to use

Use para relatórios, apresentações, peças de perspectiva, documentos e ferramentas internas de apoio à leitura patrimonial. Não use para interfaces promocionais, corretagem ou dashboards genéricos.

## How to use

## Escopo

Use este sistema para entregáveis KIM em português brasileiro. O resultado deve parecer uma consultoria patrimonial precisa e calma, não uma corretora, banco tradicional ou produto SaaS genérico.

### Sequência obrigatória

1. Leia `DESIGN.md` e os contratos de componente relevantes.
2. Escolha o perfil: Editorial/Institucional para narrativa e documento; Produto/Operação para controles e dados.
3. Importe `colors_and_type.css` e use apenas seus tokens.
4. Preserve a medida de leitura de 560–680 px em prosa e o grid canônico em composição.
5. Verifique contraste por par foreground/background, foco visível, reflow e reduced motion.

## Design-system highlights

- Degular sustenta leitura e interação; Wild Title Sans é apenas a assinatura.
- A escala de espaço 4–80, o grid de 4/8/12 e a ausência de sombra são contratos visuais.
- Gradientes e fotografia são assets preservados; fotografia ainda pede homologação.
- Produto e editorial compartilham fundamentos, mas não escopo tipográfico nem cadence de motion.

## Editorial

Estruture por kicker, tese, evidência, implicação e direção. Use Degular em toda a hierarquia funcional. Use assimetria e espaço para priorizar conteúdo; uma superfície CONFIANTE pode marcar uma conclusão singular, sem repetir-se como decoração.

## Produto

Use os componentes produtivos existentes. Controles devem ter altura mínima de 48 px, label visível e estados completos. Modal, drawer, tabs, menu e accordion exigem integração real de teclado; a marcação ARIA sozinha não encerra o requisito.

## Restrições

Não invente cores derivadas, feedback global, breakpoint ou sombra. Gradientes são arquivos PNG fechados. Wild Title Sans é exclusiva ao wordmark/lockup. A fotografia preservada ainda requer homologação antes de ser promovida como linguagem canônica.
