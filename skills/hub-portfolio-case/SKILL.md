---
name: hub-portfolio-case
description: |
  Gera páginas de case study para projetos da Hub.
  Documenta e apresenta projetos reais com contexto, stack, resultados e aprendizados.
triggers:
  - "hub case"
  - "hub estudo"
  - "hub portfólio"
  - "hub projeto"
  - "hub case study"
  - "hub showcase"
od:
  mode: design
  category: hub-studio
  designSystem: hub
  craft:
    requires: ["DESIGN.md"]
---

# hub-portfolio-case

> Skill Hub para geração de case studies de projetos.

## O que faz

Gera páginas de case study completas para documentar e apresentar projetos reais da Hub. Inclui:

- **Header** do projeto com tipo e stack
- **Contexto** — problema do cliente
- **Solução** — o que foi construído
- **Tecnologias** usadas (tags)
- **Resultados** e métricas
- **Galeria** de screenshots
- **Depoimento** do cliente (opcional)
- **CTA** para contato

## Como usar no OD

```
"Gerar case study do projeto [nome] — [descrição breve].
Stack: [tecnologias]. Resultados: [métricas]."
```
