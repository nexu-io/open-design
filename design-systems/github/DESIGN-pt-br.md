# Sistema de Design Inspirado no GitHub

> Category: Ferramentas para Desenvolvedores
> Plataforma orientada ao código. Densidade funcional, precisão de azul sobre branco, fundações Primer.

## 1. Tema Visual e Atmosfera

A superfície do GitHub é projetada, não decorada. Cada pixel transmite uma postura: esta é uma ferramenta para pessoas que se importam com diffs, builds e pull requests. O fundo da página é um `#ffffff` limpo (claro) ou `#0d1117` (escuro), com o conteúdo organizado em painéis retangulares densos separados por bordas finíssimas, em vez de espaço negativo. A densidade de informação é a marca — linhas de listas, linhas de código, cabeçalhos de repositório e cartões de notificação ficam todos próximos uns dos outros, para que um usuário avançado possa percorrer cem itens sem rolar a página.

Os destaques característicos são o **azul Primer** (`#0969da`) para links e ações primárias, e o **verde GitHub** (`#1a7f37`) para estados de merge, sucesso e o próprio botão de merge. Ambos parecem levemente discretos em comparação com os azuis e verdes de produtos voltados ao consumidor — saturados o suficiente para se destacar sobre o texto cinza denso, contidos o bastante para se diluir no fundo quando vários aparecem em um mesmo viewport.

A tipografia usa a pilha **system-ui** em todo o produto, para que o texto seja renderizado com nitidez em qualquer sistema operacional, combinada com **SFMono / Menlo / Consolas** para código. Não há fonte editorial de exibição; a voz do GitHub é a voz do sistema em que você já está.

**Características Principais:**
- Tela branca pura (`#ffffff`) ou azul-marinho profundo quase preto (`#0d1117`) — sem calor, sem tonalidade
- Bordas cinza finíssimas (`#d0d7de`) definem cada painel e divisão
- Azul Primer (`#0969da`) para links/ações primárias; verde GitHub (`#1a7f37`) para sucesso/merge
- system-ui para prosa; SFMono para código — sem fonte personalizada
- Linhas de lista densas com preenchimento mínimo; espaço em branco é raro
- Iconografia Octicon em 16px / 24px — traço único, geométrica, consistente
- Emblemas de status em formato pílula com semântica de cor forte

## 2. Paleta de Cores e Papéis

### Primárias
- **Canvas Default** (`#ffffff`): Fundo principal da página, tema claro.
- **Canvas Subtle** (`#f6f8fa`): Superfície secundária, barra lateral, fundo de entrada, faixa de cabeçalho.
- **Canvas Inset** (`#eaeef2`): Fundo de bloco de código, superfície profundamente encaixada.
- **Fg Default** (`#1f2328`): Texto primário, títulos, tinta.
- **Fg Muted** (`#656d76`): Texto secundário, legendas, caminhos de arquivo.

### Destaque de Marca
- **Primer Blue** (`#0969da`): Links, CTAs primários, base do anel de foco — a cor interativa universal.
- **Primer Blue Hover** (`#0550ae`): Estado hover/pressionado para o azul primário.
- **Accent Subtle** (`#ddf4ff`): Superfície azul suave para chamadas e banners informativos.

### Semânticas
- **Success / Merge Green** (`#1a7f37`): PRs com merge, emblemas de sucesso, botão de merge.
- **Success Subtle** (`#dafbe1`): Tonalidade de superfície de sucesso.
- **Open Green** (`#1a7f37`): Estado "Aberto" de issue/PR.
- **Closed / Danger Red** (`#cf222e`): PRs fechados, ações destrutivas, erro de validação.
- **Danger Subtle** (`#ffebe9`): Superfície de banner de erro.
- **Attention / Warning Yellow** (`#9a6700`): Texto de aviso sobre superfície âmbar.
- **Attention Subtle** (`#fff8c5`): Superfície de banner de aviso.
- **Done Purple** (`#8250df`): Com merge e arquivado, estado "concluído", emblema premium.
- **Sponsor Pink** (`#bf3989`): Coração de patrocinadores, marca do GitHub Sponsors.

### Borda e Divisor
- **Border Default** (`#d0d7de`): Borda finíssima padrão, contorno do painel.
- **Border Muted** (`#d8dee4`): Divisores internos dentro de um painel.
- **Border Subtle** (`#eaeef2`): Divisores tênues entre linhas de tabela.

### Tema Escuro
- **Dark Canvas** (`#0d1117`): Fundo da página no modo escuro.
- **Dark Surface** (`#161b22`): Barra lateral, cabeçalho, superfície secundária.
- **Dark Border** (`#30363d`): Borda padrão no modo escuro.
- **Dark Fg** (`#e6edf3`): Texto primário sobre fundo escuro.

## 3. Regras Tipográficas

### Família de Fontes
- **Corpo / UI**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Código / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Hierarquia

| Papel | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento | Notas |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Cabeçalho de repositório, hero de marketing |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Título da página |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Título de seção |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Subseção, cabeçalho de painel |
| Corpo | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Tamanho de texto padrão — não 16px |
| Corpo Pequeno | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Legendas, metadados de arquivo |
| Código | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Blocos de código, diff |
| Código Inline | SFMono | 0.85em | 400 | inherit | normal | Trechos de `code` inline |

### Princípios
- **Corpo em 14px, não 16px**: A densidade de prosa do GitHub é sua identidade. O produto é lido em 14px para caber mais linhas em um viewport.
- **Peso binário**: 400 para tudo por padrão; 600 para títulos e ênfase. Sem 500, sem 700.
- **Fontes do sistema sempre**: nunca carregue uma webfont para o chrome — o texto deve ser renderizado instantaneamente em conexões lentas.

## 4. Estilos de Componentes

### Botões

**Primário (Verde)**
- Fundo: `#1f883d`
- Texto: `#ffffff`
- Borda: 1px solid `rgba(31, 35, 40, 0.15)`
- Preenchimento: 5px 16px
- Raio: 6px
- Sombra: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: fundo `#1a7f37`
- Uso: "Criar repositório", "Fazer merge do pull request"

**Padrão**
- Fundo: `#f6f8fa`
- Texto: `#1f2328`
- Borda: 1px solid `#d0d7de`
- Preenchimento: 5px 16px
- Raio: 6px
- Hover: fundo `#f3f4f6`, borda `#d0d7de`

**Contorno (Estilo de Link Azul)**
- Fundo: `#ffffff`
- Texto: `#0969da`
- Borda: 1px solid `#d0d7de`
- Hover: fundo `#0969da`, texto `#ffffff`

**Perigo**
- Fundo: `#ffffff`
- Texto: `#cf222e`
- Borda: 1px solid `#d0d7de`
- Hover: fundo `#a40e26`, texto `#ffffff`, borda `#a40e26`

### Cartões / Caixas
- Fundo: `#ffffff`
- Borda: 1px solid `#d0d7de`
- Raio: 6px
- Preenchimento: 16px (cabeçalho) + 16px (corpo)
- O cabeçalho tem uma faixa `#f6f8fa` com borda inferior.

### Entradas
- Fundo: `#ffffff`
- Borda: 1px solid `#d0d7de`
- Raio: 6px
- Preenchimento: 5px 12px
- Foco: borda `#0969da`, anel `0 0 0 3px rgba(9,105,218,0.3)`

### Pílulas de Status (Issue / PR)
- **Aberto**: fundo `#1a7f37`, texto branco, preenchimento 4px 10px, raio 9999px.
- **Fechado**: fundo `#cf222e`, texto branco.
- **Com merge**: fundo `#8250df`, texto branco.
- **Rascunho**: fundo `#6e7781`, texto branco.

### Etiquetas (Tags em Issues/PRs)
- Preenchimento: 0 7px
- Raio: 9999px
- Fonte: 12px / 500
- O fundo e o texto são programáticos (cor da etiqueta → texto calculado para contraste).

## 5. Espaçamento e Layout

- **Unidade base**: 4px. Escala de espaçamento: 4, 8, 12, 16, 24, 32, 40, 48.
- **Largura máxima da página**: 1280px (`Container-xl`).
- **Barra lateral**: 296px no desktop, colapsa abaixo de 1012px.
- **Preenchimento de linha**: 16px horizontal, 12px vertical (listas são densas por design).

## 6. Movimento

- **Duração**: 80ms para hover; 200ms para abertura de menu/popover.
- **Suavização**: `ease-out` para aberturas, `ease-in` para fechamentos.
- **Evitado**: animação no carregamento da página, parallax, micro-interações persistentes. As coisas aparecem; elas não se apresentam.

## 7. Diretrizes de Uso

- Mantenha listas densas, caixas com bordas e tipografia do sistema juntas; botões verdes isolados não são suficientes para criar uma superfície de produto semelhante ao GitHub.
- Use verde para ações construtivas de repositório, azul para links e foco, e vermelho/roxo/cinza apenas para estados de issue, PR e workflow.
- Prefira chrome discreto, bordas explícitas e espaçamento compacto a sombras decorativas ou cartões no estilo de marketing de grande porte.
