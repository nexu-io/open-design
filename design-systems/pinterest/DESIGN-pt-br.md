# Sistema de design inspirado no Pinterest

> Category: Mídia e consumidor
> Descoberta visual. Acento vermelho, grade de alvenaria, imagem em primeiro lugar.

## 1. Tema visual e atmosfera

O site do Pinterest é uma tela quente e inspiradora que trata a descoberta visual como uma revista de estilo de vida. O design opera em um fundo branco suave e ligeiramente quente com o Vermelho Pinterest (`#e60023`) como o único acento de marca audacioso. Ao contrário dos azuis frios da maioria das plataformas de tecnologia, a escala de neutros do Pinterest tem um subtom claramente quente — os cinzas tendem para oliva/areia (`#91918c`, `#62625b`, `#e5e5e0`) em vez de aço frio, criando uma atmosfera aconchegante e artesanal que convida à navegação.

A tipografia usa Pin Sans — uma fonte proprietária personalizada com uma ampla pilha de fallback incluindo fontes japonesas, refletindo o alcance global do Pinterest. Na escala de display (70px, peso 600), Pin Sans cria títulos grandes e convidativos. Em tamanhos menores, o sistema é compacto: botões em 12px, legendas em 12–14px. O sistema de nomenclatura de variáveis CSS (`--comp-*`, `--sema-*`, `--base-*`) revela uma sofisticada arquitetura de tokens de design em três camadas: nível de componente, semântico e base.

O que distingue o Pinterest é seu generoso sistema de raio de borda (12px–40px, mais 50% para círculos) e fundos de botões com tonalidade quente. O botão secundário (`#e5e5e0`) tem um tom de areia claramente quente em vez de cinza frio. O botão vermelho primário usa raio de 16px — arredondado, mas não em forma de pílula. Combinado com fundos de emblemas quentes (`hsla(60,20%,98%,.5)` — um sutil lavado amarelo-quente) e layouts dominados por fotografia, o resultado é um design que parece artesanal e pessoal, não corporativo e estéril.

**Características principais:**
- Tela branca quente com neutros em tonalidade oliva/areia — aconchegante, não clínico
- Vermelho Pinterest (`#e60023`) como único acento audacioso — nunca sutil, sempre confiante
- Fonte personalizada Pin Sans com pilha de fallback global (incluindo CJK)
- Arquitetura de tokens em três camadas: `--comp-*` / `--sema-*` / `--base-*`
- Superfícies secundárias quentes: cinza areia (`#e5e5e0`), emblema quente (`hsla(60,20%,98%,.5)`)
- Raio de borda generoso: 16px padrão, até 40px para contêineres grandes
- Conteúdo com fotografia em primeiro lugar — pins/imagens são o elemento visual principal
- Texto quase violeta escuro (`#211922`) — quente, com um toque de ameixa

## 2. Paleta de cores e funções

### Marca principal
- **Vermelho Pinterest** (`#e60023`): CTA principal, acento de marca — vermelho audacioso e confiante
- **Verde 700** (`#103c25`): `--base-color-green-700`, acento de sucesso/natureza
- **Verde 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, verde pressionado

### Texto
- **Preto ameixa** (`#211922`): Texto principal — quase preto quente com subtom ameixa
- **Preto** (`#000000`): Texto secundário, texto de botão
- **Cinza oliva** (`#62625b`): Descrições secundárias, texto discreto
- **Prata quente** (`#91918c`): `--comp-button-color-text-transparent-disabled`, texto desabilitado, bordas de entrada
- **Branco** (`#ffffff`): Texto em superfícies escuras/coloridas

### Interativo
- **Azul foco** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, anéis de foco
- **Roxo desempenho** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, recursos de desempenho
- **Roxo recomendação** (`#7e238b`): `--sema-color-hover-text-recommendation`, recomendação de IA
- **Azul link** (`#2b48d4`): Cor do texto do link
- **Azul Facebook** (`#0866ff`): `--facebook-background-color`, login social
- **Azul pressionado** (`#617bff`): `--base-color-pressed-blue-200`, estado pressionado

### Superfície e borda
- **Cinza areia** (`#e5e5e0`): Fundo do botão secundário — quente, artesanal
- **Claro quente** (`#e0e0d9`): Fundos de botões circulares, emblemas
- **Lavado quente** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, fundo de emblema quente sutil
- **Névoa** (`#f6f6f3`): Superfície clara (a 50% de opacidade)
- **Borda desabilitada** (`#c8c8c1`): `--sema-color-border-disabled`, bordas desabilitadas
- **Cinza hover** (`#bcbcb3`): `--base-color-hover-grayscale-150`, borda ao passar o cursor
- **Superfície escura** (`#33332e`): Fundos de seções escuras

### Semântico
- **Vermelho erro** (`#9e0a0a`): Estados de erro de caixa de seleção/formulário

## 3. Regras tipográficas

### Família de fontes
- **Principal**: `Pin Sans`, fallbacks: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Hierarquia

| Função | Fonte | Tamanho | Peso | Altura da linha | Espaçamento de letras | Observações |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Pin Sans | 70px (4,38rem) | 600 | normal | normal | Impacto máximo |
| Título de seção | Pin Sans | 28px (1,75rem) | 700 | normal | -1,2px | Tracking negativo |
| Corpo | Pin Sans | 16px (1,00rem) | 400 | 1,40 | normal | Leitura padrão |
| Legenda em negrito | Pin Sans | 14px (0,88rem) | 700 | normal | normal | Metadados fortes |
| Legenda | Pin Sans | 12px (0,75rem) | 400–500 | 1,50 | normal | Texto pequeno, tags |
| Botão | Pin Sans | 12px (0,75rem) | 400 | normal | normal | Rótulos de botão |

### Princípios
- **Escala de tipo compacta**: O intervalo é 12px–70px com um salto dramático — a maioria dos textos funcionais está em 12–16px, criando uma hierarquia de informação densa, semelhante a um aplicativo.
- **Distribuição de peso quente**: 600–700 para títulos, 400–500 para corpo. Sem pesos ultraleves — o tipo sempre parece substancial.
- **Tracking negativo nos títulos**: -1,2px nos títulos de 28px cria títulos de seção aconchegantes e íntimos.
- **Família de fonte única**: Pin Sans cuida de tudo — nenhuma fonte de display secundária ou monoespaçada detectada.

## 4. Estilos de componentes

### Botões

**Vermelho primário**
- Fundo: `#e60023` (Vermelho Pinterest)
- Texto: `#000000` (preto — escolha incomum para contraste no vermelho)
- Padding: 6px 14px
- Raio: 16px (generosamente arredondado, não em pílula)
- Borda: `2px solid rgba(255, 255, 255, 0)` (transparente)
- Foco: borda semântica + contorno via variáveis CSS

**Areia secundário**
- Fundo: `#e5e5e0` (cinza areia quente)
- Texto: `#000000`
- Padding: 6px 14px
- Raio: 16px
- Foco: mesmo sistema de borda semântica

**Ação circular**
- Fundo: `#e0e0d9` (claro quente)
- Texto: `#211922` (preto ameixa)
- Raio: 50% (círculo)
- Uso: ações de pin, controles de navegação

**Fantasma / Transparente**
- Fundo: transparente
- Texto: `#000000`
- Sem borda
- Uso: ações terciárias

### Cartões e contêineres
- Cartões de pin com fotografia em primeiro lugar e raio generoso (12px–20px)
- Sem sombra de caixa tradicional na maioria dos cartões
- Fundos brancos ou névoa quente
- Borda branca grossa de 8px em alguns contêineres de imagem

### Entradas
- Entrada de e-mail: fundo branco, borda `1px solid #91918c`, raio 16px, padding 11px 15px
- Foco: sistema de borda semântica + contorno via variáveis CSS

### Navegação
- Cabeçalho limpo em fundo branco ou quente
- Logo Pinterest + barra de pesquisa centralizados
- Pin Sans 16px para links de navegação
- Acentos Vermelho Pinterest para estados ativos

### Tratamento de imagens
- Grade de alvenaria estilo pin (layout característico do Pinterest)
- Cantos arredondados: 12px–20px nas imagens
- Fotografia como conteúdo principal — cada pin é uma imagem
- Bordas brancas grossas (8px) em contêineres de imagens em destaque

## 5. Princípios de layout

### Sistema de espaçamento
- Unidade base: 8px
- Escala: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Saltos grandes: 32px → 80px → 100px para espaçamento de seções

### Grade e contêiner
- Grade de alvenaria para conteúdo de pins (layout característico)
- Seções de conteúdo centralizadas com largura máxima generosa
- Rodapé escuro com largura total
- Barra de pesquisa como elemento de navegação principal

### Filosofia do espaço em branco
- **Densidade de inspiração**: A grade de alvenaria empacota os pins com força — a densidade do conteúdo É a proposta de valor. O espaço em branco existe entre as seções, não dentro da grade.
- **Respira acima, densidade abaixo**: As seções hero/em destaque recebem padding generoso; a grade de pins é compacta e imersiva.

### Escala de raio de borda
- Padrão (12px): Cartões pequenos, links
- Botão (16px): Botões, entradas, cartões médios
- Confortável (20px): Cartões em destaque
- Grande (28px): Contêineres grandes
- Seção (32px): Elementos de aba, painéis grandes
- Hero (40px): Contêineres hero, blocos em destaque grandes
- Círculo (50%): Botões de ação, indicadores de aba

## 6. Profundidade e elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Plano (Nível 0) | Sem sombra | Padrão — pins dependem do conteúdo, não da sombra |
| Sutil (Nível 1) | Sombra mínima (dos tokens) | Sobreposições elevadas, menus suspensos |
| Foco (Acessibilidade) | Anel `--sema-color-border-focus-outer-default` | Estados de foco |

**Filosofia de sombras**: O Pinterest usa sombras mínimas. A grade de alvenaria depende do conteúdo (fotografia) para criar interesse visual em vez de efeitos de elevação. A profundidade vem do calor das cores de superfície e do arredondamento generoso dos contêineres.

## 7. O que fazer e o que não fazer

### Fazer
- Usar neutros quentes (`#e5e5e0`, `#e0e0d9`, `#91918c`) — o tom quente oliva/areia é a identidade
- Aplicar Vermelho Pinterest (`#e60023`) apenas para CTAs principais — é audacioso e singular
- Usar Pin Sans exclusivamente — uma fonte para tudo
- Aplicar raio de borda generoso: 16px para botões/entradas, 20px+ para cartões
- Manter a grade de alvenaria densa — a densidade do conteúdo é o valor
- Usar fundos de emblema quentes (`hsla(60,20%,98%,.5)`) para lavados quentes sutis
- Usar `#211922` (preto ameixa) para texto principal — mais quente que preto puro

### Não fazer
- Não usar neutros cinza frios — sempre quente/tom oliva
- Não usar preto puro (`#000000`) como texto principal — usar preto ameixa (`#211922`)
- Não usar botões em forma de pílula — raio de 16px é arredondado, mas não é pílula
- Não adicionar sombras pesadas — o Pinterest é plano por design, a profundidade vem do conteúdo
- Não usar raio de borda pequeno (<12px) em cartões — o arredondamento generoso é essencial
- Não introduzir cores de marca adicionais — vermelho + neutros quentes é a paleta completa
- Não usar pesos de fonte finos — Pin Sans no mínimo 400

## 8. Comportamento responsivo

### Pontos de quebra
| Nome | Largura | Mudanças principais |
|------|-------|-------------|
| Mobile | <576px | Coluna única, layout compacto |
| Mobile grande | 576–768px | Grade de pins de 2 colunas |
| Tablet | 768–890px | Grade expandida |
| Desktop pequeno | 890–1312px | Grade de alvenaria padrão |
| Desktop | 1312–1440px | Layout completo |
| Desktop grande | 1440–1680px | Colunas de grade expandidas |
| Ultra wide | >1680px | Densidade máxima da grade |

### Estratégia de colapso
- Grade de pins: 5+ colunas → 3 → 2 → 1
- Navegação: barra de pesquisa + ícones → nav mobile simplificada
- Seções em destaque: lado a lado → empilhado
- Hero: 70px → reduz proporcionalmente
- Rodapé: escuro multicoluna → empilhado

## 9. Guia de prompts para agentes

### Referência rápida de cores
- Marca: Vermelho Pinterest (`#e60023`)
- Fundo: Branco (`#ffffff`)
- Texto: Preto ameixa (`#211922`)
- Texto secundário: Cinza oliva (`#62625b`)
- Superfície do botão: Cinza areia (`#e5e5e0`)
- Borda: Prata quente (`#91918c`)
- Foco: Azul foco (`#435ee5`)

### Exemplos de prompts de componentes
- "Criar um hero: fundo branco. Título em 70px Pin Sans peso 600, preto ameixa (#211922). Botão CTA vermelho (#e60023, raio 16px, padding 6px 14px). Botão areia secundário (#e5e5e0, raio 16px)."
- "Criar um cartão pin: fundo branco, raio 16px, sem sombra. Fotografia preenche o topo, descrição 16px Pin Sans peso 400 abaixo em #62625b."
- "Construir um botão de ação circular: fundo #e0e0d9, raio 50%, ícone #211922."
- "Criar um campo de entrada: fundo branco, 1px solid #91918c, raio 16px, padding 11px 15px. Foco: contorno azul via tokens semânticos."
- "Criar o rodapé escuro: fundo #33332e. Logo script Pinterest em branco. Links 12px Pin Sans em #91918c."

### Guia de iteração
1. Neutros quentes em todo lugar — cinzas oliva/areia, nunca aço frio
2. Vermelho Pinterest apenas para CTAs — audacioso e singular
3. Raio de 16px em botões/entradas, 20px+ em cartões — generoso mas não pílula
4. Pin Sans é a única fonte — compacto em 12px para interface, 70px para display
5. A fotografia carrega o design — a interface permanece quente e minimalista
6. Preto ameixa (#211922) para texto — mais quente que preto puro
