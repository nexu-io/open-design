# Design System Inspired by Cohere

> Categoria: IA e LLM
> Plataforma de IA empresarial. Gradientes vibrantes, estética de painel rico em dados.

## 1. Tema Visual e Atmosfera

A interface da Cohere é um painel de comando empresarial refinado — confiante, limpo e projetado para fazer a IA parecer uma infraestrutura séria, não um brinquedo para consumidores. A experiência vive em uma tela de branco brilhante onde o conteúdo é organizado em cartões generosamente arredondados (raio de 22px) que criam uma linguagem de contenção orgânica, semelhante a nuvens. Este é um site que fala com CTOs e arquitetos empresariais: profissional sem ser frio, sofisticado sem ser intimidador.

A linguagem de design conecta dois mundos com um sistema de duas tipografias: CohereText, uma serifa customizada para display com tracking apertado, confere às manchetes a gravidade de um manifesto tecnológico, enquanto Unica77 Cohere Web cuida de todo o texto de corpo e UI com precisão geométrica suíça. Esse par serifa/sem-serifa cria uma personalidade de "autoridade confiante encontra clareza de engenharia" que reflete perfeitamente uma plataforma de IA empresarial.

A cor é usada com extrema contenção — a interface é quase inteiramente em preto e branco com bordas em cinza frio (`#d9d9dd`, `#e5e7eb`). O roxo-violeta aparece apenas em faixas fotográficas de hero, seções com gradiente e no azul interativo (`#1863dc`) que sinaliza estados de hover e foco. Essa contenção cromática faz com que, quando a cor APARECE — em capturas de tela do produto, fotografia empresarial e na seção roxo-profundo — ela carregue o máximo de peso visual.

**Características Principais:**
- Tela branca brilhante com bordas de contenção em cinza frio
- Raio de borda exclusivo de 22px — o arredondamento distinto do "cartão Cohere"
- Duas tipografias customizadas: CohereText (serifa para display) + Unica77 (sem-serifa para corpo)
- Contenção cromática de nível empresarial: preto, branco, cinzas frios, mínimo acento roxo-azul
- Seções hero em roxo-profundo/violeta para contraste dramático
- Botões ghost/transparentes que mudam para azul ao passar o mouse
- Fotografia empresarial mostrando aplicações reais e diversas
- CohereMono para código e rótulos técnicos com transformações em maiúsculas

## 2. Paleta de Cores e Funções

### Primárias
- **Cohere Black** (`#000000`): Texto de manchete principal e elementos de máxima ênfase.
- **Near Black** (`#212121`): Cor padrão de link no corpo — levemente mais suave que o preto puro.
- **Deep Dark** (`#17171c`): Um quase-preto com tom azul para navegação e texto em seções escuras.

### Secundárias e Destaque
- **Interaction Blue** (`#1863dc`): O acento interativo principal — aparece no hover de botões, estados de foco e links ativos. A única cor de ação cromática.
- **Ring Blue** (`#4c6ee6` a 50%): Cor do anel Tailwind para indicadores de foco por teclado.
- **Focus Purple** (`#9b60aa`): Cor de borda de foco nos inputs — um violeta suave.

### Superfície e Fundo
- **Pure White** (`#ffffff`): O fundo principal da página e superfície dos cartões.
- **Snow** (`#fafafa`): Superfícies elevadas sutis e fundos de seções claras.
- **Lightest Gray** (`#f2f2f2`): Bordas de cartões e as linhas de contenção mais suaves.

### Neutros e Texto
- **Muted Slate** (`#93939f`): Links de rodapé desenfatizados e texto terciário — um cinza de tom frio com leve tinte azul-violeta.
- **Border Cool** (`#d9d9dd`): Bordas padrão de seções e itens de lista — um cinza frio, levemente com tinte roxo.
- **Border Light** (`#e5e7eb`): Variante de borda mais clara — o gray-200 padrão do Tailwind.

### Sistema de Gradientes
- **Faixa Hero Roxo-Violeta**: Seções com gradiente roxo-profundo que criam contraste dramático contra a tela branca. Aparecem como faixas de largura total abrigando capturas de tela do produto e mensagens-chave.
- **Gradiente de Rodapé Escuro**: A página transita por roxo-profundo/carvão até o rodapé preto, criando um efeito de "entardecer".

## 3. Regras Tipográficas

### Família de Fontes
- **Display**: `CohereText`, com fallbacks: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Corpo / UI**: `Unica77 Cohere Web`, com fallbacks: `Inter, Arial, ui-sans-serif, system-ui`
- **Código**: `CohereMono`, com fallbacks: `Arial, ui-sans-serif, system-ui`
- **Ícones**: `CohereIconDefault` (fonte de ícones customizada)

### Hierarquia

| Função | Fonte | Tamanho | Peso | Altura de Linha | Espaçamento | Notas |
|--------|-------|---------|------|-----------------|-------------|-------|
| Display / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (compacto) | -1.44px | Máximo impacto, autoridade com serifa |
| Display Secundário | CohereText | 60px (3.75rem) | 400 | 1.00 (compacto) | -1.2px | Títulos de seções grandes |
| Título de Seção | Unica77 | 48px (3rem) | 400 | 1.20 (compacto) | -0.48px | Títulos de seções de funcionalidades |
| Subtítulo | Unica77 | 32px (2rem) | 400 | 1.20 (compacto) | -0.32px | Títulos de cartões, nomes de funcionalidades |
| Título de Funcionalidade | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Títulos de seções menores |
| Corpo Grande | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Parágrafos de introdução |
| Corpo / Botão | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Corpo padrão, texto de botões |
| Botão Médio | Unica77 | 14px (0.88rem) | 500 | 1.71 (relaxado) | normal | Botões menores, rótulos enfatizados |
| Legenda | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Metadados, descrições |
| Rótulo em Maiúsculas | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Rótulos de seção em maiúsculas |
| Pequeno | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Texto menor, links de rodapé |
| Código Micro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Minúsculos rótulos de código em maiúsculas |

### Princípios
- **Serifa para declaração, sem-serifa para utilidade**: CohereText carrega a voz da marca na escala de display — suas terminações serifadas conferem às manchetes a autoridade de uma pesquisa publicada. Unica77 cuida de tudo o que é funcional com neutralidade geométrica suíça.
- **Tracking negativo em grande escala**: CohereText usa espaçamento de -1.2px a -1.44px em 60–72px, criando blocos de texto densos e impactantes.
- **Peso único no corpo**: Praticamente todo uso de Unica77 é no peso 400. O peso 500 aparece apenas para ênfase em botões pequenos. O sistema se apoia em tamanho e espaçamento, não em contraste de peso.
- **Rótulos de código em maiúsculas**: CohereMono usa maiúsculas com espaçamento de letras positivo (0.16–0.28px) para tags técnicas e marcadores de seção.

## 4. Estilização de Componentes

### Botões

**Ghost / Transparente**
- Fundo: transparente (`rgba(255, 255, 255, 0)`)
- Texto: Cohere Black (`#000000`)
- Sem borda visível
- Hover: texto muda para Interaction Blue (`#1863dc`), opacidade 0.8
- Foco: contorno sólido de 2px em Interaction Blue
- O estilo primário de botão — invisível até ser interagido

**Sólido Escuro**
- Fundo: escuro/preto
- Texto: Pure White
- Para CTA em superfícies claras
- Formato pílula ou raio padrão

**Contornado**
- Contenção baseada em borda
- Usado em ações secundárias

### Cartões e Contêineres
- Fundo: Pure White (`#ffffff`)
- Borda: linha fina sólida Lightest Gray (`1px solid #f2f2f2`) para cartões sutis; Cool Border (`#d9d9dd`) para ênfase
- Raio: **22px** — o raio exclusivo Cohere para cartões primários, imagens e contêineres de diálogo. Também 4px, 8px, 16px, 20px para elementos menores
- Sombra: mínima — a Cohere se apoia em cor de fundo e bordas em vez de sombras
- Especial: raio `0px 0px 22px 22px` (arredondamento apenas na parte inferior) para contêineres de seção
- Diálogo: raio de 8px para caixas modais/de diálogo

### Inputs e Formulários
- Texto: branco em input escuro, preto em claro
- Borda de foco: Focus Purple (`#9b60aa`) com `1px solid`
- Sombra de foco: anel vermelho (`rgb(179, 0, 0) 0px 0px 0px 2px`) — provavelmente para indicação de estado de erro
- Contorno de foco: Interaction Blue sólido 2px

### Navegação
- Nav horizontal limpa em fundo branco ou escuro
- Logo: wordmark Cohere (SVG customizado)
- Links: texto escuro a 16px Unica77
- CTA: botão sólido escuro
- Mobile: colapso com hamburger

### Tratamento de Imagens
- Fotografia empresarial com sujeitos e ambientes diversos
- Fotografia hero com tinte roxo para seções dramáticas
- Capturas de tela da UI do produto em superfícies escuras
- Imagens com raio de 22px correspondendo ao sistema de cartões
- Seções de gradiente roxo de largura total

### Componentes Distintivos

**Sistema de Cartões 22px**
- O raio de borda de 22px é a assinatura visual da Cohere
- Todos os cartões primários, imagens e contêineres usam esse raio
- Cria uma suavidade orgânica semelhante a nuvens, distintiva do típico 8–12px

**Barra de Confiança Empresarial**
- Logos de empresas exibidos em uma faixa horizontal
- Demonstra adoção empresarial
- Tratamento de logo limpo e monocromático

**Faixas Hero Roxas**
- Seções roxo-profundo de largura total abrigando demonstrações de produto
- Criam quebras visuais dramáticas no fluxo branco da página
- Capturas de tela do produto flutuam dentro do ambiente roxo

**Tags de Código em Maiúsculas**
- CohereMono em maiúsculas com espaçamento de letras
- Usadas como marcadores de seção e rótulos de categorização
- Cria uma hierarquia de informações técnica e estruturada

## 5. Princípios de Layout

### Sistema de Espaçamento
- Unidade base: 8px
- Escala: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Padding de botões varia por variante
- Padding interno do cartão: aproximadamente 24–32px
- Espaçamento vertical de seção: generoso (56–60px entre seções)

### Grade e Contêiner
- Largura máxima do contêiner: até 2560px (muito largo) com escalonamento responsivo
- Hero: centralizado com tipografia dramática
- Seções de funcionalidades: grades de cartões multi-coluna
- Seções empresariais: faixas roxas de largura total
- 26 breakpoints detectados — sistema responsivo extremamente granular

### Filosofia de Espaço em Branco
- **Clareza empresarial**: Cada seção apresenta uma proposição clara com espaço para respirar entre elas.
- **Fotografia como hero**: Grandes seções fotográficas proporcionam interesse visual sem exigir elementos decorativos de design.
- **Agrupamento por cartões**: Conteúdo relacionado é agrupado em cartões arredondados com 22px, criando clusters naturais de informação.

### Escala de Raio de Borda
- Nítido (4px): Elementos de navegação, tags pequenas, paginação
- Confortável (8px): Caixas de diálogo, contêineres secundários, cartões pequenos
- Generoso (16px): Contêineres em destaque, cartões médios
- Grande (20px): Cartões de funcionalidades grandes
- Assinatura (22px): Cartões primários, imagens hero, contêineres principais — O raio Cohere
- Pílula (9999px): Botões, tags, indicadores de status

## 6. Profundidade e Elevação

| Nível | Tratamento | Uso |
|-------|-----------|-----|
| Plano (Nível 0) | Sem sombra, sem borda | Fundo da página, blocos de texto |
| Com Borda (Nível 1) | `1px solid #f2f2f2` ou `#d9d9dd` | Cartões padrão, separadores de lista |
| Faixa Roxa (Nível 2) | Fundo roxo-escuro de largura total | Seções hero, demonstrações de funcionalidades |

**Filosofia de Sombra**: A Cohere é quase livre de sombras. A profundidade é comunicada através do **contraste de cor de fundo** (cartões brancos em faixas roxas, superfície branca sobre snow), **contenção por borda** (bordas em cinza frio) e a dramática **alternância de seções claras para escuras**. Quando os elementos precisam de elevação, isso é alcançado por estarem brancos sobre escuro, em vez de projetar sombras.

## 7. O Que Fazer e Não Fazer

### Fazer
- Usar raio de borda de 22px em todos os cartões e contêineres primários — é a assinatura visual
- Usar CohereText para títulos de display (72px, 60px) com espaçamento de letras negativo
- Usar Unica77 para todo texto de corpo e UI no peso 400
- Manter a paleta em preto e branco com bordas em cinza frio
- Usar Interaction Blue (#1863dc) apenas para estados interativos de hover/foco
- Usar seções roxo-profundo para quebras visuais dramáticas e demonstrações de produto
- Aplicar maiúsculas + espaçamento de letras no CohereMono para rótulos de seção
- Manter fotografia adequada para empresas com sujeitos diversos

### Não Fazer
- Não usar raio de borda diferente de 22px em cartões primários — o raio exclusivo importa
- Não introduzir cores quentes — a paleta é estritamente de tons frios
- Não usar sombras pesadas — a profundidade vem do contraste de cor e bordas
- Não usar peso negrito (700+) no texto do corpo — o intervalo é 400–500
- Não pular a hierarquia serifa/sem-serifa — CohereText para manchetes, Unica77 para corpo
- Não usar roxo como cor de superfície de cartões — o roxo é reservado para seções de largura total
- Não reduzir o espaçamento entre seções abaixo de 40px — layouts empresariais precisam de espaço para respirar
- Não usar decoração em botões por padrão — ghost/transparente é o estado base

## 8. Comportamento Responsivo

### Breakpoints
| Nome | Largura | Mudanças Principais |
|------|---------|---------------------|
| Mobile Pequeno | <425px | Layout compacto, espaçamento mínimo |
| Mobile | 425–640px | Coluna única, cartões empilhados |
| Mobile Grande | 640–768px | Pequenos ajustes de espaçamento |
| Tablet | 768–1024px | Grades de 2 colunas começam |
| Desktop | 1024–1440px | Layout multi-coluna completo |
| Desktop Grande | 1440–2560px | Largura máxima do contêiner |

*26 breakpoints detectados — um dos sites com responsividade mais granular no conjunto de dados.*

### Alvos de Toque
- Botões adequadamente dimensionados para interação por toque
- Links de navegação com espaçamento confortável
- Superfícies de cartões como alvos de toque

### Estratégia de Colapso
- **Navegação**: Nav completa colapsa para hamburger
- **Grades de funcionalidades**: Multi-coluna → 2 colunas → coluna única
- **Texto do hero**: 72px → 48px → 32px escalonamento progressivo
- **Seções roxas**: Mantêm largura total, conteúdo empilha
- **Grades de cartões**: 3 → 2 → 1 coluna

### Comportamento de Imagens
- Fotografia escala proporcionalmente dentro de contêineres com raio de 22px
- Capturas de tela do produto mantêm proporção
- Seções roxas escalam o fundo proporcionalmente

## 9. Guia de Prompt para Agentes

### Referência Rápida de Cores
- Texto Principal: "Cohere Black (#000000)"
- Fundo da Página: "Pure White (#ffffff)"
- Texto Secundário: "Near Black (#212121)"
- Acento de Hover: "Interaction Blue (#1863dc)"
- Texto Discreto: "Muted Slate (#93939f)"
- Bordas de Cartões: "Lightest Gray (#f2f2f2)"
- Bordas de Seção: "Border Cool (#d9d9dd)"

### Exemplos de Prompts para Componentes
- "Crie uma seção hero em Pure White (#ffffff) com CohereText a 72px peso 400, line-height 1.0, letter-spacing -1.44px. Texto em Cohere Black. Subtítulo em Unica77 a 18px peso 400, line-height 1.4."
- "Projete um cartão de funcionalidade com raio de borda de 22px, borda 1px solid Lightest Gray (#f2f2f2) em branco. Título em Unica77 a 32px, letter-spacing -0.32px. Corpo em Unica77 a 16px, Muted Slate (#93939f)."
- "Construa um botão ghost: fundo transparente, texto Cohere Black em Unica77 a 16px. Ao passar o mouse, texto muda para Interaction Blue (#1863dc) com opacidade 0.8. Foco: contorno sólido de 2px em Interaction Blue."
- "Crie uma seção roxa de largura total com texto branco. CohereText a 60px para o título. Captura de tela do produto flutua dentro usando raio de borda de 22px."
- "Projete um rótulo de seção usando CohereMono a 14px, maiúsculas, letter-spacing 0.28px. Texto em Muted Slate (#93939f)."

### Guia de Iteração
1. Foque em UM componente por vez
2. Sempre use raio de 22px para cartões primários — "o arredondamento do cartão Cohere"
3. Especifique a tipografia — CohereText para manchetes, Unica77 para corpo, CohereMono para rótulos
4. Elementos interativos usam Interaction Blue (#1863dc) apenas no hover
5. Mantenha superfícies brancas com bordas em cinza frio — sem tons quentes
6. Roxo é para seções de largura total, nunca fundos de cartões
