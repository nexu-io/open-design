# 🛡️ Aegis Club

**Plataforma competitiva da comunidade de Dota 2** — inspirada na Gamers Club do CS.
Partidas equilibradas, um sistema de reputação que combate a toxicidade das
ranqueadas comuns, tutoriais de heróis em vídeo, perfis de jogador e torneios
criados pela própria comunidade.

> Projeto comunitário, sem vínculo com a Valve. Dota 2 é marca da Valve Corporation.

---

## ✨ Funcionalidades

- **Matchmaking 5x5 equilibrado** — fila com balanceamento por Elo interno
  (`rankPoints`). Times são montados para partidas justas, e o host abre o lobby
  no cliente do Dota 2 compartilhando nome/senha.
- **Anti-toxicidade de verdade** — cada jogador tem um *behavior score* (0–10000).
  Ao fim da partida você **elogia** quem somou e **denuncia** quem atrapalhou.
  Quem tem conduta baixa cai na **fila de baixa prioridade**, isolado de quem
  joga limpo.
- **Tutoriais de heróis** — catálogo de heróis com guias em vídeo do YouTube,
  curados e votados pela comunidade, separados por nível (iniciante →
  avançado).
- **Perfis e conexões** — perfil com medalha, conduta, estatísticas, heróis
  favoritos, redes sociais e pedidos de amizade entre jogadores.
- **Torneios** — crie e administre torneios com inscrição de times e
  **chaveamento automático** (eliminação simples), reportando resultados e
  avançando os vencedores na chave.
- **Ranking** — leaderboard global e por região, por pontos de habilidade.

---

## 🧰 Stack

| Camada        | Tecnologia                                            |
| ------------- | ----------------------------------------------------- |
| Framework     | [Next.js 15](https://nextjs.org) (App Router) + React 19 |
| Linguagem     | TypeScript                                             |
| Estilo        | Tailwind CSS                                           |
| Banco         | PostgreSQL + [Prisma ORM](https://www.prisma.io)      |
| Autenticação  | Steam (OpenID 2.0) + sessão JWT (`jose`)              |
| Dados de Dota | [OpenDota API](https://docs.opendota.com) (opcional)  |

---

## 🚀 Começando

### Pré-requisitos

- Node.js **18.18+** (recomendado 20+)
- [pnpm](https://pnpm.io) (`npm i -g pnpm`)
- Docker (para subir o Postgres local) — ou um PostgreSQL próprio

### Passo a passo

```bash
# 1. Instale as dependências
pnpm install

# 2. Configure as variáveis de ambiente
cp .env.example .env
#   → gere o AUTH_SECRET:  openssl rand -base64 32
#   → (opcional) preencha STEAM_API_KEY para login real da Steam

# 3. Suba o banco de dados (PostgreSQL via Docker)
docker compose up -d

# 4. Crie as tabelas e popule com dados de demonstração
pnpm prisma migrate dev --name init
pnpm db:seed

# 5. Rode em desenvolvimento
pnpm dev
```

Acesse **http://localhost:3000**.

> **Sem chave da Steam?** Mantenha `NEXT_PUBLIC_ENABLE_DEV_LOGIN="true"` no `.env`
> e use o botão **"Login de teste"** no topo para entrar com um usuário fictício
> e explorar a plataforma. Esse atalho é automaticamente desativado em produção.

### Login real com Steam

1. Gere uma chave em https://steamcommunity.com/dev/apikey
2. Coloque-a em `STEAM_API_KEY` no `.env`
3. Garanta que `NEXT_PUBLIC_APP_URL` aponta para a URL pública correta
   (a Steam redireciona o usuário de volta para `…/api/auth/steam/callback`).

---

## 📜 Scripts

| Comando             | O que faz                                         |
| ------------------- | ------------------------------------------------- |
| `pnpm dev`          | Sobe o servidor de desenvolvimento                |
| `pnpm build`        | `prisma generate` + build de produção             |
| `pnpm start`        | Roda o build de produção                          |
| `pnpm typecheck`    | Checagem de tipos com `tsc`                        |
| `pnpm lint`         | ESLint (config do Next)                            |
| `pnpm prisma:migrate` | Cria/aplica migrations em dev                    |
| `pnpm db:push`      | Sincroniza o schema sem migration (protótipo)     |
| `pnpm db:seed`      | Popula heróis, jogadores, tutoriais e um torneio  |
| `pnpm db:reset`     | Reseta o banco e re-semeia                         |

---

## 🗂️ Estrutura

```
aegis-club/
├── prisma/
│   ├── schema.prisma      # modelo de dados (usuários, fila, partidas, reputação, torneios…)
│   └── seed.ts            # dados de demonstração
├── src/
│   ├── app/               # rotas (App Router)
│   │   ├── api/auth/       # login Steam, callback, dev login, logout
│   │   ├── heroes/         # catálogo + detalhe + tutoriais
│   │   ├── play/           # fila de matchmaking
│   │   ├── match/[id]/     # lobby, ready-check, resultado, elogios/denúncias
│   │   ├── tournaments/    # lista, criação, detalhe + chaveamento
│   │   ├── profile/        # perfil público e edição
│   │   ├── leaderboard/    # ranking
│   │   └── dashboard/      # painel do jogador
│   ├── components/        # UI (primitivos + componentes por feature)
│   ├── lib/               # regras de negócio
│   │   ├── matchmaking.ts  # formação e balanceamento de partidas
│   │   ├── reputation.ts   # behavior score (anti-toxicidade)
│   │   ├── ranking.ts      # medalhas + Elo de rankPoints
│   │   ├── bracket.ts      # geração de chaveamento
│   │   ├── steam.ts        # OpenID da Steam
│   │   ├── session.ts      # sessão JWT
│   │   └── opendota.ts     # integração OpenDota
│   └── data/heroes.ts     # catálogo curado de heróis
└── docker-compose.yml     # PostgreSQL local
```

---

## 🧠 Como funciona o anti-toxicidade

1. **Jogue e avalie.** Ao fim de cada partida, cada jogador pode elogiar
   (`Amigável`, `Tolerante`, `Comunicativo`, `Boa liderança`) e denunciar
   (`Comunicação abusiva`, `Feeding intencional`, `Sabotagem`, `Abandono`,
   `Discurso de ódio`, `Trapaça`, `Smurf`).
2. **O score evolui.** Elogios somam; denúncias subtraem (pesos diferentes por
   gravidade — ver `src/lib/reputation.ts`). Conduta exemplar libera benefícios;
   conduta ruim restringe.
3. **Filas separadas.** Abaixo de `LOW_PRIORITY_THRESHOLD`, o jogador só encontra
   partida com outros de baixa prioridade. Abaixo de
   `RANKED_BEHAVIOR_THRESHOLD`, a fila ranqueada é bloqueada.

> No MVP a penalidade é aplicada na hora para fins de demonstração. Em produção,
> denúncias deveriam passar por revisão (campo `Report.status`) antes de impactar
> o score — o modelo de dados já prevê isso.

---

## 🗺️ Roadmap (próximos passos)

- [ ] Revisão de denúncias (overwatch da comunidade) antes da punição
- [ ] Criação automática de lobby via Steam Game Coordinator / bot
- [ ] Chat de lobby e de equipe em tempo real (WebSocket)
- [ ] Anti-smurf e verificação de conta (horas de jogo via Steam)
- [ ] Eliminação dupla e pontos corridos nos torneios
- [ ] App/CLI para integração com bots de Discord
- [ ] Importação completa de histórico via OpenDota

---

## 📄 Licença

MIT — use, modifique e contribua.
