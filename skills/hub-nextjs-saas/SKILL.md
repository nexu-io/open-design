---
name: hub-nextjs-saas
description: |
  Gera interfaces e protótipos de plataformas SaaS completas usando Next.js + Supabase + Tailwind.
  Ideal para dashboards, painéis administrativos, plataformas de gestão, CRMs e marketplaces.
triggers:
  - "hub saas"
  - "hub nextjs"
  - "hub dashboard"
  - "hub plataforma"
  - "hub crm"
  - "hub painel"
  - "hub saas platform"
od:
  mode: design
  category: hub-studio
  designSystem: hub
  craft:
    requires: ["DESIGN.md"]
---

# hub-nextjs-saas

> Skill Hub para geração de plataformas SaaS e dashboards.

## O que faz

Gera protótipos completos de plataformas SaaS no ecossistema Next.js + Supabase + Tailwind, seguindo o design system Hub. Inclui:

- **Dashboard** com KPIs, gráficos e tabelas
- **Autenticação** (login, cadastro, recuperação de senha)
- **CRUD** de recursos principais
- **Sidebar** com navegação hierárquica
- **Modo escuro** e claro
- **Responsivo** (mobile-first)

## Stack padrão

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 15+ + Tailwind CSS v4 |
| Backend | Next.js API Routes / Server Actions |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Deploy | Vercel |

## Estrutura gerada

```
projeto/
├── src/
│   ├── app/           # App Router pages
│   ├── components/    # UI components
│   ├── lib/           # Utilities, api clients
│   └── types/         # TypeScript types
├── public/            # Assets
├── DESIGN.md          # Design system do projeto
├── tailwind.config.ts
└── package.json
```

## Como usar no OD

```
"Gerar um dashboard SaaS para gestão de [recursos] com login,
CRUD completo e gráficos de performance. Design system Hub."
```
