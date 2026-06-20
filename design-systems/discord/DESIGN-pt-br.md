# Sistema de Design Inspirado no Discord

> Categoria: Produtividade & SaaS
> Plataforma de voz e chat. Blurple intenso, superfícies dark-first, momentos de destaque divertidos.

## 1. Tema Visual & Atmosfera

O produto do Discord foi projetado para noites, raids e chamadas em grupo — por isso toda a superfície é dark-first. A tela padrão é o profundo `Background Primary` (`#313338` no tema claro, `#1e1f22` no tema escuro), com colunas de chat sobrepostas em tons ligeiramente mais claros ou escuros para indicar canais, threads e painéis laterais. O icônico **Blurple** (`#5865f2`) é reservado para a marca, CTAs primários, menções e a affordance de "você" — usado com parcimônia para se destacar sobre os neutros suaves.

A tipografia usa **gg sans** (a fonte customizada do Discord, substituta da Whitney) para texto corrido e interface, com formas geométricas arredondadas que transmitem acolhimento sem comprometer a legibilidade nos tamanhos pequenos que um cliente de chat exige. Os títulos escalam de forma incremental; as linhas de chat são compactas (4–8px entre grupos de mensagens) para que horas de histórico pareçam fáceis de percorrer.

A linguagem de formas é arredondada, mas não excessivamente suave: raio de 8px nos cards, 4px nos inputs, pílulas completas em badges de status e tags. Os servidores são avatares com bordas arredondadas de 48px que se transformam em círculos ao passar o mouse — um detalhe de animação que se tornou parte da identidade visual da marca.

**Características-Chave:**
- Superfícies dark-first: `#1e1f22` / `#2b2d31` / `#313338` (profundidade em 3 níveis)
- Blurple `#5865f2` como único destaque saturado na superfície de chat
- gg sans (estilo Whitney) para todo o texto — amigável, geométrica, neutra
- Avatares de servidor em quadrado arredondado (raio de 16px) que se transformam em círculos ao passar o mouse
- Espaçamento compacto nas linhas de chat, padding generoso no painel lateral
- Pontos de status: verde online, amarelo ausente, vermelho não perturbe, cinza offline
- Divisores de 1px alinhados ao pixel em off-white com baixa opacidade

## 2. Paleta de Cores & Papéis

### Primária
- **Blurple** (`#5865f2`): Primária da marca, CTA principal, destaque de menção.
- **Blurple Hover** (`#4752c4`): Hover/ativo do blurple.
- **Blurple Soft** (`#7289da`): Blurple legado, destaque secundário em marketing.

### Superfície (Tema Escuro — padrão)
- **Background Tertiary** (`#1e1f22`): Trilho da lista de servidores, plano de fundo mais profundo.
- **Background Secondary** (`#2b2d31`): Barra lateral de canais, barra lateral de configurações.
- **Background Primary** (`#313338`): Superfície de chat, coluna de mensagens.
- **Background Floating** (`#111214`): Popovers flutuantes, tooltips, autocompletar.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Overlay de hover nas linhas.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Linha ativa.

### Superfície (Tema Claro)
- **Light Bg Primary** (`#ffffff`): Superfície de chat no tema claro.
- **Light Bg Secondary** (`#f2f3f5`): Barra lateral no tema claro.
- **Light Bg Tertiary** (`#e3e5e8`): Superfície clara mais profunda.

### Texto
- **Header Primary** (`#f2f3f5`): Cabeçalhos de canal, títulos de modais no tema escuro.
- **Header Secondary** (`#b5bac1`): Cabeçalhos secundários.
- **Text Normal** (`#dbdee1`): Texto corrido no tema escuro — ligeiramente mais frio que o branco puro.
- **Text Muted** (`#949ba4`): Timestamps, nomes de servidores, metadados secundários.
- **Text Link** (`#00a8fc`): Hiperlinks em mensagens — azul céu, distinto do blurple.
- **Channels Default** (`#80848e`): Nome de canal inativo na barra lateral.

### Status & Semântica
- **Status Online** (`#23a55a`): Ponto online, estados de sucesso.
- **Status Idle** (`#f0b232`): Ponto ausente, away.
- **Status DND** (`#f23f43`): Não perturbe; também funciona como vermelho destrutivo.
- **Status Streaming** (`#593695`): Roxo de "Transmitindo".
- **Status Offline** (`#80848e`): Cinza offline.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Leve camada blurple nas linhas com @menção.

### Borda & Divisor
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Divisor padrão no tema escuro.
- **Border Subtle** (`#3f4147`): Divisor sólido para cards.

## 3. Regras Tipográficas

### Família de Fonte
- **Corpo / UI / Títulos**: `gg sans`, com fallback: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (legado / Whitney)**: `Whitney`, com fallback: `gg sans`
- **Código / Mono**: `"gg mono"`, com fallback: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Hierarquia

| Papel | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento de Letra | Notas |
|-------|-------|---------|------|-----------------|----------------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Hero de marketing |
| Título de Página | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Títulos de configurações/perfil |
| Nome de Canal | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, cabeçalho do canal |
| Corpo da Mensagem | gg sans | 16px (1rem) | 400 | 1.375 | normal | Texto de chat padrão |
| Nome de Usuário | gg sans | 16px (1rem) | 500 | 1.25 | normal | Autor de uma mensagem |
| Timestamp | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Hoje às 16:32" |
| Canal na Barra Lateral | gg sans | 16px (1rem) | 500 | 1.25 | normal | Linhas da lista de canais |
| Nome do Servidor | gg sans | 16px (1rem) | 600 | 1.25 | normal | Cabeçalho do servidor |
| Legenda / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Texto de status, tag de editado |
| Código Inline | gg mono | 0.875em | 400 | inherit | normal | `código` inline |
| Bloco de Código | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | Bloco ```com três crases``` |

### Princípios
- **Geometria amigável**: gg sans substitui a Whitney com terminais arredondados em a/g/s — a marca busca aconchego sem sacrificar a legibilidade.
- **Contraste por peso, não por cor**: a hierarquia vem dos passos de peso 400→500→600→700→800; a superfície permanece neutra.
- **Corpo em 16px**: as mensagens de chat não reduzem abaixo de 16px. A densidade vem da altura de linha (1.375), não do tamanho da fonte.

## 4. Estilos de Componentes

### Botões

**Primário**
- Fundo: `#5865f2`
- Texto: `#ffffff`
- Padding: 8px 16px
- Raio: 4px
- Hover: `#4752c4`
- Uso: CTAs primários, "Continuar", "Entrar no Servidor"

**Secundário**
- Fundo: `#4e5058`
- Texto: `#ffffff`
- Padding: 8px 16px
- Raio: 4px
- Hover: `#6d6f78`

**Terciário / Sutil (estilo link)**
- Fundo: transparente
- Texto: `#dbdee1`
- Hover: texto sublinhado, sem mudança de fundo

**Destrutivo**
- Fundo: `#da373c`
- Texto: `#ffffff`
- Hover: `#a12d2f`

### Inputs
- Fundo: `#1e1f22`
- Texto: `#dbdee1`
- Borda: 1px solid `#1e1f22`
- Raio: 4px
- Padding: 10px 12px
- Foco: borda `#5865f2`

### Avatares de Servidor
- Tamanho: 48×48px
- Raio: 16px (quadrado arredondado) por padrão; transição para 50% ao passar o mouse e no estado ativo.
- Estado ativo: pílula branca de 4px na borda esquerda da coluna de ícones.

### Pontos de Status
- Tamanho: 10×10px
- Borda: 3px solid background-tertiary (cria o efeito de "entalhe")
- Posição: canto inferior direito do avatar.

### Cards / Embeds
- Fundo: `#2b2d31` (escuro) ou `#f2f3f5` (claro)
- Borda esquerda: 4px solid cor de destaque do embed.
- Raio: 4px
- Padding: 8px 16px

### Pílula de Menção
- Fundo: `rgba(88, 101, 242, 0.3)`
- Texto: `#c9cdfb`
- Padding: 0 2px
- Raio: 3px

## 5. Espaçamento & Layout

- **Unidade base**: 4px. Escala: 4, 8, 12, 16, 20, 24, 32, 40.
- **Trilho de servidores**: 72px de largura, fixo.
- **Barra lateral de canais**: 240px de largura.
- **Lista de membros**: 240px de largura no desktop.
- **Coluna de chat**: fluida, mínimo de 380px.

## 6. Movimento

- **Duração**: 200ms para hover; 350ms para a transformação do avatar em círculo; 80ms para o fade do tooltip.
- **Easing**: `cubic-bezier(0.215, 0.61, 0.355, 1)` para a transformação do avatar (rápido e depois suaviza).
- **Pulso de notificação**: 1.4s ease-in-out infinite no indicador de menção não lida.

## 7. Diretrizes de Uso

- Preserve o shell escuro, a densidade compacta e a hierarquia de ações em blurple em conjunto; usar blurple em um layout de marketing com fundo claro quebra a sensação do produto Discord.
- Mantenha as superfícies com navegação intensa estruturadas em trilhos, barras laterais e colunas de chat, em vez de cards decorativos isolados.
- Use a linguagem de avatar em quadrado arredondado e ponto de status ao representar pessoas, servidores ou presença ativa.
