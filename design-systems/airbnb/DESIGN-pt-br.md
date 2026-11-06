# Sistema de design inspirado no Airbnb

> Category: E-commerce e varejo
> Marketplace de viagens. Acento coral quente, orientado para fotografia, interface com cantos arredondados.

## 1. Tema visual e atmosfera

O design do Airbnb em 2026 parece uma revista de viagens que por acaso também é um aplicativo — telas de branco imaculado dão lugar a fotografias em sangria total, e a própria interface desaparece para que os anúncios possam respirar. O característico coral-rosa Rausch (`#ff385c`) é usado com parcimônia, mas de forma inconfundível: CTA de pesquisa, indicador de aba ativa, botão de ação principal, o preço ou o coração de lista de desejos ocasional. Todo o resto é uma escala de cinza disciplinada, com `#222222` carregando quase cada linha de texto.

O que torna o sistema inconfundivelmente Airbnb é a *fé* que ele deposita no conteúdo. As fotos das propriedades são exibidas em escala heroica, 4:3 com tratamento de borda a borda com raio. A troca de categoria acontece por meio de um seletor de três abas (Casas / Experiências / Serviços) que usa ícones ilustrados renderizados em 3D (uma casa com telhado inclinado, um balão de ar quente, uma campainha de serviço) — físicos, táteis, quase como brinquedos — combinados com etiquetas nítidas de `Airbnb Cereal VF`. É o raro produto de consumo onde renders 3D e interface puramente tipográfica coexistem sem tensão.

A superfície mais nova é a linha de produtos de **Experiências** — o mesmo chrome, mas maior densidade de cartões, mais fotografia e um painel de reserva com centralização e preço fixo na coluna direita. As páginas de detalhes de anúncios (tanto quartos quanto experiências) seguem um modelo rígido: grade de imagem hero em sangria total → cartão de reserva arredondado sobreposto (fixo ao rolar) → comodidades → avaliações (os prêmios Guest Favorite usam um grande `4,81` centralizado com um medalhão de coroa de louros) → mapa → perfil do anfitrião → divulgações. O ritmo é consistente, seja reservando um quarto ou um passeio de iate.

**Características principais:**
- Coral-rosa Rausch (`#ff385c`) como cor de marca de acento único, usada apenas para CTAs principais e o botão de pesquisa
- Fotografia em sangria total em 4:3 / 16:9 com suave arredondamento de cantos (14–20px) como vocabulário visual principal
- Ícones de categoria renderizados em 3D combinados com abas tipográficas — o único lugar onde o sistema permite ilustração
- Botões de ícone circulares `50%` (seta voltar, compartilhar, favorito, setas de carrossel) espalhados por toda a interface
- `Airbnb Cereal VF` carrega cada etiqueta, desde notas legais de 8px até títulos de seção de 28px — um sistema de família única
- Codificação de cor por nível de produto: Airbnb Plus (magenta `#92174d`), Airbnb Luxe (roxo profundo `#460479`), Airbnb (coral Rausch)
- Medalhão de prêmio Guest Favorite — número de avaliação gigante centralizado entre duas coroas de louros, um dos momentos mais reconhecíveis do sistema
- Painel de reserva fixo com uma pilha preço → datas → hóspedes, ancorado na coluna direita no desktop, transformando-se em uma barra de «Reservar» ancorada na parte inferior no mobile
- Navegação mobile fixada na parte inferior (Explorar / Listas de desejos / Entrar) com um toque Rausch no estado ativo

## 2. Paleta de cores e papéis

### Principal
- **Rausch** (`#ff385c`): O coral-rosa característico da marca. Variável CSS `--palette-bg-primary-core`. Usado para: botão principal «Reservar», botão de envio de pesquisa, sublinhado de aba ativa, preenchimento do coração de lista de desejos, ênfase de preço. A cor de maior visibilidade em cada página.

### Secundárias e de destaque
- **Deep Rausch** (`#e00b41`): Uma variante mais saturada. Variável CSS `--palette-bg-tertiary-core`. Usado para estados de botão pressionado/ativo e pontos terminais de gradiente.
- **Plus Magenta** (`#92174d`): Variável CSS `--palette-bg-primary-plus`. A cor de marca para o nível de produto Airbnb Plus — uma oferta de anúncios curados de alto padrão.
- **Luxe Purple** (`#460479`): Variável CSS `--palette-bg-primary-luxe`. A cor de marca para o nível de produto Airbnb Luxe — aluguéis de villas e propriedades de luxo.
- **Info Blue** (`#428bff`): Variável CSS `--palette-text-legal`. Usado para links legais/informativos (termos, privacidade, divulgações) — a única cor de link não monocromática no sistema.

### Superfície e fundo
- **Canvas White** (`#ffffff`): O fundo de página padrão. Cada cartão, cada container, cada página de detalhe começa aqui.
- **Soft Cloud** (`#f7f7f7`): Tinte de subsuperfície sutil usado em fundos de rodapé, wrappers de visualização de mapa e seções de «todo o resto» que desejam recuar do branco principal.
- **Hairline Gray** (`#dddddd`): Cor de borda 1px onipresente — separa cartões, linhas de comodidades, painéis de avaliações, colunas de rodapé. O cavalo de batalha do sistema de layout.

### Neutros e texto
- **Ink Black** (`#222222`): Variável CSS `--palette-text-primary`. O quase-preto do sistema. Cada título, cada parágrafo de corpo, cada etiqueta de navegação, cada preço. Usado em ~90% de todo o texto em uma página.
- **Charcoal** (`#3f3f3f`): Variável CSS `--palette-text-focused`. Usado no texto de entrada no estado focused e no texto de ênfase secundária.
- **Ash Gray** (`#6a6a6a`): Variável CSS `--palette-bg-tertiary-hover`. Etiquetas secundárias, texto de estilo de subtítulo «Aluguel de chalés» sob nomes de cidades, links de rodapé silenciados.
- **Mute Gray** (`#929292`): Variável CSS `--palette-text-link-disabled`. Botões desativados e metadados de baixa prioridade.
- **Stone Gray** (`#c1c1c1`): Divisores terciários, traços de ícones, avatares de espaço reservado.

### Semânticos e de destaque
- **Error Red** (`#c13515`): Variável CSS `--palette-text-primary-error`. Erros de validação de formulários, avisos de ação destrutiva.
- **Deep Error** (`#b32505`): Variável CSS `--palette-text-secondary-error-hover`. Variantes pressionadas/ativas de estados de erro.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): Variável CSS `--palette-text-material-disabled`. Etiquetas de estilo material desativadas.

### Sistema de gradientes
O gradiente de marca do Airbnb aparece com parcimônia, normalmente apenas no logotipo e no momento de marca do botão de pesquisa:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Essa varredura coral → magenta é o «momento de marca» — nunca usado como superfície completa, apenas como preenchimento de pílula estreita ou tratamento de logo.

## 3. Regras tipográficas

### Família tipográfica
- **Airbnb Cereal VF** (principal e única): O sans-serif de peso variável proprietário que carrega todo o sistema. Fontes de fallback (em ordem): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Pesos observados nos tokens extraídos: 500, 600, 700. Sem 400-regular — o peso de «corpo» do sistema é 500, o que dá a cada bloco de texto uma densidade ligeiramente maior que se lê como confiante e deliberada.

Funcionalidades OpenType: `salt` (alternativas estilísticas) é usado nas etiquetas compactas de 11px e 14px 600 — provavelmente para formatação mais compacta de numerais e caracteres especiais. Não foram observadas funcionalidades de ligaduras ou numerais fracionários.

### Hierarquia

| Papel | Tamanho | Peso | Altura de linha | Espaçamento de letras | Notas |
|-------|---------|------|-----------------|----------------------|-------|
| Título de seção | 28px / 1,75rem | 700 | 1,43 | 0 | «Inspiração para futuras viagens» — títulos em nível de página |
| Título de subseção | 22px / 1,38rem | 500 | 1,18 | -0,44px | «O que este lugar oferece», «Conheça os anfitriões» — divisores de conteúdo |
| Título de cartão | 21px / 1,31rem | 700 | 1,43 | 0 | Títulos de painel de avaliações, títulos principais de cartão |
| Título de anúncio | 20px / 1,25rem | 600 | 1,20 | -0,18px | «Passeio de iate em grupo pequeno, vinho e frutas ilimitados» — manchetes de anúncios em páginas de detalhes |
| Subtítulo em negrito | 16px / 1,00rem | 600 | 1,25 | 0 | Nome do anfitrião, nome da cidade |
| Corpo médio | 16px / 1,00rem | 500 | 1,25 | 0 | Texto de corpo principal em páginas de detalhes |
| Botão grande | 16px / 1,00rem | 500 | 1,25 | 0 | «Reservar», «Torne-se um anfitrião» |
| Botão padrão | 14px / 0,88rem | 500 | 1,29 | 0 | Etiquetas de botão padrão |
| Link | 14px / 0,88rem | 500 | 1,43 | 0 | Links de navegação, links de rodapé |
| Legenda média | 14px / 0,88rem | 500 | 1,29 | 0 | Metadados, linhas de subtítulo («Aluguel de chalés», «Aluguel de villas») |
| Legenda em negrito | 14px / 0,88rem | 600 | 1,43 | 0 | Funcionalidade `salt` habilitada — estatísticas numéricas, ênfase em texto pequeno |
| Legenda pequena | 13px / 0,81rem | 400 | 1,23 | 0 | Datas de avaliações, micro-metadados |
| Micro padrão | 12px / 0,75rem | 400 | 1,33 | 0 | Isenções de responsabilidade no rodapé, micro-texto legal |
| Micro em negrito | 12px / 0,75rem | 700 | 1,33 | 0 | Etiquetas de pílula «NOVO» |
| Badge em maiúsculas | 11px / 0,69rem | 600 | 1,18 | 0 | Funcionalidade `salt` — badges compactos de categoria/status |
| Sobrescrito | 8px / 0,50rem | 700 | 1,25 | 0,32px | Maiúsculas — notas de rodapé de preço, caudas decimais |

### Princípios
- **Uma família, muitos pesos.** Airbnb Cereal VF lida com tudo, do texto legal de 8px aos títulos de página de 28px — a identidade visual vem da própria família, não da mistura de tipografias.
- **500 é o novo 400.** O peso «regular» do sistema é 500, dando a cada parágrafo uma textura ligeiramente mais confiante do que o padrão da web.
- **Tracking negativo apenas para tipos de display.** Títulos de 20px e acima comprimem o tracking em -0,18 a -0,44px para um aspecto cinzelado; tamanhos de corpo permanecem com tracking 0 para legibilidade.
- **Alturas de linha ajustadas para manchetes, generosas para corpo.** O tipo de display roda a 1,18–1,25 (ajustado); corpo e legendas se abrem para 1,43 para conforto de leitura longa.
- **Sem maiúsculas exceto a 8px.** A única transformação em maiúsculas no sistema é o sobrescrito de 8px — em qualquer outro lugar, a capitalização de sentença com sutis mudanças de peso faz o trabalho.

### Nota sobre substitutos de fontes
Airbnb Cereal VF é proprietária. O substituto open source mais próximo é **Circular Std** (ainda comercial) ou **Inter** (gratuito, Google Fonts) com espaçamento de letras reduzido em -0,01em nos tamanhos de display. Para fidelidade estrita de marca, a cadeia de fallback documentada (`Circular, -apple-system, system-ui`) renderiza aceitavelmente no macOS/iOS onde `system-ui` se resolve para San Francisco, que tem proporções semelhantes.

## 4. Estilização de componentes

### Botões

**CTA principal** («Reservar», «Pesquisar», «Adicionar datas»)
- Fundo: Rausch `#ff385c`
- Texto: Canvas White `#ffffff`, Airbnb Cereal 500, 16px
- Preenchimento: ~14px vertical, 24px horizontal
- Raio: 8px (retangular) ou 50% (variante de ícone circular)
- Borda: nenhuma
- Ativo/pressionado: `transform: scale(0.92)` mais um anel de foco de 2px `#222222` em `0 0 0 2px`

**Botão secundário** («Torne-se um anfitrião», ações terciárias delineadas)
- Fundo: `#ffffff`
- Texto: Ink Black `#222222`, Airbnb Cereal 500, 14–16px
- Preenchimento: 10px 16px
- Raio: 20px (pílula) ou 8px (retangular)
- Borda: 1px solid Hairline Gray `#dddddd`

**Botão circular apenas com ícone** (seta voltar, compartilhar, favorito, controles de carrossel)
- Fundo: `#f2f2f2` (ligeiramente fora do branco) ou branco com borda preta translúcida de 1px
- Ícone: traço de contorno `#222222`, 16–20px
- Tamanho: diâmetro 32–44px
- Raio: 50%
- Ativo/pressionado: `transform: scale(0.92)`; anel branco sutil de 4px `0 0 0 4px rgb(255,255,255)` para separar de fundos fotográficos coloridos

**Botão desativado**
- Fundo: `#f2f2f2`
- Texto: Stone Gray `#c1c1c1`
- Opacidade: 0,5

**Botão de aba em pílula** (seletor de categoria «Casas / Experiências / Serviços»)
- Fundo: transparente
- Texto: Ink Black `#222222`, Airbnb Cereal 500, 16px
- Preenchimento: 8px 14px
- Estado ativo: sublinhado Ink Black de 2px abaixo da etiqueta
- Combinado com um ícone ilustrado renderizado em 3D de 36–48px acima da etiqueta

### Cartões e containers

**Cartão de anúncio** (grade da página inicial, resultados de pesquisa)
- Fundo: `#ffffff`
- Raio: 14px na imagem, o texto fica diretamente abaixo em fundo transparente
- Imagem: proporção 4:3, em sangria total, arredondada com o mesmo raio de 14px
- Preenchimento: nenhum no container externo; 12px de espaçamento entre a imagem e as linhas de metadados
- Sombra: nenhuma — a separação vem do espaço em branco e do raio intrínseco da fotografia
- Padrão de metadados: cidade/região na linha 1 (16px 600), distância/duração na linha 2 (14px 500 Ash Gray), intervalo de datas na linha 3, linha de preço com «por noite» na parte inferior

**Painel de reserva da página de detalhes** (coluna direita fixa em páginas de quarto/experiência)
- Fundo: `#ffffff`
- Raio: 14–20px
- Borda: 1px solid Hairline Gray `#dddddd`
- Sombra: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — uma elevação sutil de três camadas empilhadas
- Preenchimento: 24px
- Largura: ~370px, ancorado 120–140px abaixo do topo da viewport
- Conteúdo: título do preço → seletor de datas → dropdown de hóspedes → CTA principal → nota de rodapé «Você não será cobrado ainda»

**Cartão de grade de comodidades** (em páginas de detalhes de anúncios)
- Fundo: `#ffffff`
- Borda: 1px solid Hairline Gray `#dddddd` no nível da linha (não por item)
- Preenchimento: 16px vertical por linha de comodidade
- Padrão ícone + etiqueta: ícone de contorno 24px à esquerda, etiqueta 16px 500 à direita

**Cartão de avaliação** (avaliação individual em páginas de detalhes)
- Fundo: `#ffffff`, sem borda
- Preenchimento: 0 (depende dos espaços da grade)
- Conteúdo: avatar circular 40px + nome 16px 600 + data 14px 400 Ash Gray em uma linha, depois parágrafo de corpo 14px 500 abaixo

### Entradas e formulários

**Barra de pesquisa** (página inicial principal)
- Fundo: `#ffffff`
- Borda: 1px solid Hairline Gray `#dddddd` envolvendo os três segmentos (Onde / Quando / Quem)
- Raio: 32px (pílula completa)
- Sombra: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — sensação de flutuação sutil
- Estrutura: três segmentos divididos por finos divisores verticais, cada segmento tem uma etiqueta 12px 500 acima de um espaço reservado 14px 500
- Envio: botão de ícone circular Rausch na borda direita, diâmetro 48px

**Entrada de texto** (formulários genéricos)
- Fundo: `#ffffff`
- Borda: 1px solid Hairline Gray `#dddddd`
- Raio: 8px
- Preenchimento: 14px 16px
- Foco: a borda muda para Ink Black, adiciona anel externo preto `0 0 0 2px`
- Erro: a borda muda para `#c13515` (Error Red), o texto de ajuda usa a mesma cor

**Seletor de datas**
- Grade de calendário: layout de 7 colunas, células de dias circulares `50%` com 40–44px de largura
- Intervalo selecionado: fundo Ink Black `#222222` com numerais brancos
- Âncoras de início/fim: círculos preenchidos maiores; datas intermediárias usam o tinte Soft Cloud `#f7f7f7`

### Navegação

**Navegação superior (Desktop)**
- Altura: ~80px
- Fundo: `#ffffff`
- Esquerda: logotipo do Airbnb em Rausch (102×32px)
- Centro: seletor de categoria de três abas (Casas / Experiências / Serviços) com ícones 3D de 36–48px empilhados acima de etiquetas 16px 500; a aba ativa tem sublinhado Ink Black de 2px
- Direita: link de texto «Torne-se um anfitrião», depois globo circular 32px (idioma), depois menu hamburger de avatar 36px
- Border-bottom: 1px solid Hairline Gray `#dddddd`

**Navegação superior (Mobile)**
- Pílula de pesquisa em linha única ocupa toda a largura: espaço reservado «Comece sua pesquisa» com um pequeno ícone de lupa
- Abaixo: o seletor de categoria de três abas persiste (Casas / Experiências / Serviços) — os ícones ilustrados encolhem para ~28px
- Barra de abas fixada na parte inferior: Explorar (estado ativo Rausch) / Listas de desejos / Entrar — ícones 24px acima de etiquetas 12px

**Navegação secundária da página de detalhes de anúncio**
- Rolagem horizontal fixa de links de âncora (Fotos · Comodidades · Avaliações · Localização · Anfitrião) aparece ao rolar além da imagem hero
- Altura: 56px
- Border-bottom: 1px solid Hairline Gray

### Tratamento de imagens

- **Proporções principais**: 4:3 para grades de anúncios da página inicial, 16:9 para fotografia hero de experiências, 1:1 para avatares
- **Raio**: 14px em imagens de grade de anúncios, 20px em molduras de fotos hero de páginas de detalhes, `50%` em avatares
- **Grade de imagens em páginas de detalhes**: grade de cinco fotos com uma imagem grande à esquerda (50% de largura) e quatro fotos menores em uma grade 2×2 à direita, todas compartilhando o container arredondado externo de 20px
- **Carregamento lazy**: uso intensivo de `loading="lazy"` com prévias de espaço reservado borradas
- **Carrossel**: botões de seta circulares de 32px sobrepostos à imagem, centralizados verticalmente; indicadores de pontos ficam a 12px acima da borda inferior

### Componentes assinatura

**Medalhão de prêmio Guest Favorite** (destacado em páginas de detalhes de anúncios com alta avaliação)
- Número de avaliação centralizado renderizado a 44–56px 700
- Duas ilustrações SVG de coroa de louros desenhadas à mão flanqueando esquerda e direita a ~48px de altura
- Abaixo: etiqueta «Guest Favorite» a 12px 700 em maiúsculas com tracking de `0,32px`, e uma sub-etiqueta curta a 14px 500 Ash Gray
- Bloco de largura total, sem borda de container — fica diretamente sobre o canvas branco

**Seletor de categoria de três abas** (aparece no topo de cada superfície de navegação)
- Três abas: Casas / Experiências / Serviços
- Cada aba: ícone ilustrado renderizado em 3D (~48px de altura) acima de uma etiqueta 16px 500
- Experiências e Serviços atualmente carregam uma pequena pílula azul marinho «NOVO» (texto branco 12px 700 sobre fundo azul escuro) flutuando no canto superior direito do ícone
- Aba ativa: sublinhado Ink Black de 2px abaixo da etiqueta

**Grade de cidades de inspiração** (página inicial «Inspiração para futuras viagens»)
- Grade de 6 colunas de links de destino no desktop, 2 colunas no mobile
- Cada célula: nome de cidade 16px 600 na linha 1, subtítulo de tipo de aluguel 14px 500 Ash Gray na linha 2 («Aluguel de chalés», «Aluguel de villas»)
- Sem imagens — grade somente de texto
- Tabulada acima por categoria (Popular / Artes e cultura / Praia / Montanhas / Ao ar livre / Atividades / Dicas de viagem e inspiração / Apartamentos amigáveis ao Airbnb) — a aba ativa tem sublinhado de 2px e mudança de peso

**Cartão fixo de reserva** (páginas de detalhes de anúncios)
- Permanece fixo a 120px abaixo do topo da viewport no desktop conforme o usuário rola além do hero
- Colapsa para uma barra de largura total na parte inferior no mobile com uma etiqueta «A partir de R$ X / noite» e uma pílula Rausch «Reservar»
- Sempre exibe: título do preço → exibição de datas → seletor de hóspedes → CTA Rausch → isenção «Você não será cobrado ainda»

**Cartão de anfitrião de experiência** (páginas de detalhes de experiências)
- Container arredondado de largura total com uma fotografia de capa 3:2 no topo
- Avatar do anfitrião (circular, 56px) sobrepondo a borda inferior da capa em 50%
- Abaixo da sobreposição: nome do anfitrião a 16px 700, tempo de anfitrionagem a 14px 500 Ash Gray, pequeno botão de pílula Rausch «Enviar mensagem ao anfitrião»
- Usado como transição entre avaliações e o bloco de comodidades/localização

**Faixa «Coisas importantes»** (páginas de detalhes de anúncios)
- Grade de 3 colunas de blocos de regras/políticas (Regras da casa, Segurança e propriedade, Política de cancelamento)
- Cada coluna: ícone no topo, título 16px 600, corpo 14px 500 Ash Gray, link «Mostrar mais» sublinhado em Ink Black
- Separador: bordas superior e inferior Hairline Gray 1px na faixa inteira

## 5. Princípios de layout

### Sistema de espaçamento
- **Unidade base**: 8px
- **Escala extraída**: 2, 3, 4, 5,5, 6, 8, 10, 11, 12, 15, 16, 18,5, 22, 24, 32px — finamente granulada com alguns valores fora da grade usados para alinhamento de ícones perfeito ao pixel
- **Preenchimento de seção**: ~48–64px em cima/baixo no desktop, 24–32px no mobile
- **Preenchimento interno do cartão**: 24px em painéis de reserva e cartões grandes, 16px em linhas de comodidades, 12px em metadados de cartão de anúncio
- **Calha entre cartões de anúncio**: 24px desktop, 16px mobile
- **Entre linhas de texto empilhadas**: 4–8px (muito ajustado — reforça a sensação de «informação densa» dos anúncios de viagem)

### Grade e container
- **Largura máxima do conteúdo**: 1760–1920px em ultra-wide (o Airbnb deixa a grade respirar mais do que a maioria dos sites); 1280px na maioria das páginas de detalhes
- **Grade de anúncios da página inicial**: 6 colunas em ≥1760px, 5 em ≥1440px, 4 em ≥1128px, 3 em ≥800px, 2 em ≥550px, 1 abaixo
- **Página de detalhes**: 2 colunas assimétricas — conteúdo principal ~58%, painel de reserva fixo ~36% à direita, ~6% de calha
- **Rodapé**: 3 colunas Suporte / Hospedagem / Airbnb

### Filosofia do espaço em branco
O Airbnb é densamente informativo, mas nunca sufocante. O espaço em branco é usado para *agrupar* — os cartões de anúncio têm 24px de calha para que cada fotografia seja lida como um objeto distinto, mas os metadados abaixo de cada cartão usam espaços de 4–8px para que o preço/cidade/data se sinta como uma unidade. O painel de reserva da página de detalhes tem 24px de preenchimento interno, mas as linhas dentro (seletor de datas, seletor de hóspedes, CTA) são empilhadas a 12px — o limite entre o cartão e a página faz mais trabalho de separação do que o conteúdo dentro.

### Escala de raio de borda
| Raio | Uso |
|------|-----|
| 4px | Etiquetas de âncora em linha, chips de tags |
| 8px | Botões de texto, dropdowns, botões utilitários pequenos |
| 14px | Fotografia de cartões de anúncio, containers de conteúdo genérico, badges |
| 20px | Botões arredondados principais (forma de pílula), imagens grandes, painel de reserva |
| 32px | Pílula da barra de pesquisa, containers extra grandes |
| 50% | Todos os botões de ícone circulares, todos os avatares, corações de lista de desejos — a geometria redonda assinatura do sistema |

## 6. Profundidade e elevação

| Nível | Tratamento | Uso |
|-------|------------|-----|
| 0 | Sem sombra | Cartões de anúncio, conteúdo de corpo, seções somente de texto |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Botões de ícone ativos/pressionados (ex.: voltar, compartilhar, favorito) — elevação sutil para indicar interação |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Cartão fixo do painel de reserva, modais, menus dropdown — a elevação de três camadas assinatura do sistema |
| Anel de foco | `0 0 0 2px #222222` | Botões no estado ativo, entrada de pesquisa com foco |
| Anel separador branco | `rgb(255, 255, 255) 0 0 0 4px` | Botões circulares sobrepostos em fotografias — um anel branco de 4px separa claramente o botão de fundos de imagem coloridos |

Filosofia de sombras: o Airbnb usa **sombras em camadas empilhadas** em vez de uma única sombra projetada. A sombra de três camadas do painel de reserva se lê como uma única elevação coesa, mas na verdade são três sombras separadas com diferentes valores de opacidade/desfoque — criando um anti-serrilhamento sutil no perímetro da sombra que parece premium sem ser pesado.

### Profundidade decorativa
- **Fotografia como profundidade**: o sistema depende fortemente de fotografia em sangria total para criar profundidade visual; sombras e gradientes são usados com moderação para que as fotografias façam o trabalho pesado
- **Medalhão de coroa de louros**: o prêmio Guest Favorite usa duas ilustrações SVG de louros que dão ao número de avaliação de outra forma plano uma presença cerimonial, como um troféu
- **Ícones de categoria renderizados em 3D**: os ícones Casas/Experiências/Serviços têm sua própria iluminação interna suave e sutis sombras projetadas assadas na arte — o único lugar onde a marca permite ilustração «dimensional»

## 7. O que fazer e o que não fazer

### Fazer
- Reservar Rausch `#ff385c` para ações principais e o indicador de aba ativa — nunca diluí-lo com usos decorativos.
- Deixar a fotografia respirar — recortes 4:3 com cantos arredondados 14–20px, sem texto sobreposto, sem véus de gradiente.
- Usar Ink Black `#222222` para cada camada de texto abaixo de Rausch — este é o quase-preto do sistema, nunca o verdadeiro `#000000`.
- Combinar os ícones ilustrados 3D do seletor de categoria de três abas com tipografia plana — não misturar estilos de ilustração dentro de uma única superfície.
- Empilhar três sombras de baixa opacidade (~2%, 4%, 10%) para criar a elevação assinatura do painel de reserva.
- Usar bordas Hairline Gray `#dddddd` de 1px para cada divisor cartão a cartão e linha a linha.
- Tratar o painel de reserva como fixo no desktop, colapsando para uma barra de reserva ancorada na parte inferior no mobile.
- Usar espaçamento de 4–8px dentro de grupos de metadados e 24px entre cartões — a densidade de informação é intencional.

### Não fazer
- Não introduzir cores de destaque secundárias fora da paleta de níveis de produto Rausch / Plus Magenta / Luxe Purple.
- Não colocar texto dentro das fotografias — as legendas sempre ficam abaixo da imagem, nunca sobrepostas.
- Não usar etiquetas em maiúsculas exceto o único papel de sobrescrito de 8px.
- Não arredondar botões de ícone para nada além de 50% — o circular é a geometria assinatura do sistema.
- Não adicionar sombras projetadas aos cartões de anúncio — eles ficam sobre canvas branco sem elevação.
- Não usar fundos de gradiente — o único gradiente no sistema é uma varredura estreita Rausch → magenta no logotipo.
- Não usar o peso tipográfico 400-regular — o peso de corpo do Airbnb Cereal é 500.
- Não substituir Airbnb Cereal VF por uma tipografia de display diferente — o sistema é intencionalmente de família única.

## 8. Comportamento responsivo

### Breakpoints

O Airbnb declara ~60 breakpoints (artefato de design de sua biblioteca de componentes), mas as mudanças de layout significativas ocorrem em um conjunto muito menor:

| Nome | Largura | Mudanças principais |
|------|---------|---------------------|
| Ultra-wide | ≥1760px | Grade de anúncios de 6 colunas, largura máxima de conteúdo 1760–1920px |
| Desktop XL | 1440–1759px | Grade de 5 colunas, nav completa visível, painel de reserva fixo na coluna direita |
| Desktop | 1128–1439px | Grade de 4 colunas, painel de reserva fixo persiste |
| Laptop | 1024–1127px | Grade de 3–4 colunas, nav de categoria permanece horizontal |
| Tablet | 800–1023px | Grade de 3 colunas, a pesquisa global pode colapsar para uma pílula de linha única |
| Tablet pequeno | 550–799px | Grade de 2 colunas, o painel de reserva cai para bloco em linha de largura total |
| Mobile | 375–549px | Layout empilhado de 1 coluna, aparece a barra de abas fixada na parte inferior (Explorar / Listas de desejos / Entrar) |
| Mobile pequeno | <375px | O preenchimento de borda se ajusta para 16px; os ícones do seletor de categoria encolhem para ~28px |

### Alvos de toque
Todos os elementos interativos atendem ou excedem 44×44px. A família de botões de ícone circulares é especificamente dimensionada de 32–44px com 8–12px de preenchimento de área de toque estendido. O botão principal Rausch «Reservar» tem ~48px de altura. A área de toque do seletor de categoria de três abas é o retângulo completo de etiqueta-mais-ícone (tipicamente ~64×80px por aba).

### Estratégia de colapso
- **Nav**: A nav superior mantém o logotipo do Airbnb + seletor de três abas no tablet e acima; no mobile o seletor desliza logo abaixo da pílula de pesquisa, e os controles de globo/avatar se movem para uma barra de abas ancorada na parte inferior.
- **Barra de pesquisa**: Pílula de três segmentos (Onde / Quando / Quem) com um botão de envio circular Rausch no desktop; colapsa para uma pílula de linha única «Comece sua pesquisa» no mobile, cujo toque abre uma folha de pesquisa em tela cheia.
- **Painel de reserva**: Coluna direita fixa em ≥1128px; em linha dentro da coluna de conteúdo principal entre 800–1127px; pílula «Reservar» fixada na parte inferior em <800px.
- **Grade de anúncios**: Reformata 6 → 5 → 4 → 3 → 2 → 1 colunas através dos breakpoints.
- **Grade de imagens da página de detalhes**: Layout de cinco imagens (1 grande + 4 pequenas) no desktop; torna-se um carrossel em sangria total deslizável no mobile com indicadores de pontos de página.
- **Rodapé**: O layout de 3 colunas colapsa para coluna única empilhada em <800px.

### Comportamento de imagens
- `loading="lazy"` universal, com prévias de espaço reservado borradas com parâmetro `im_w=` de URL servidas primeiro
- Imagens responsivas usam a CDN `muscache.com` do Airbnb com o parâmetro de consulta `im_w` para entrega baseada em largura (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Sem recortes de direção de arte — a mesma imagem é escalada para cima/baixo pelos breakpoints
- Carrosséis ajustam automaticamente a altura da foto para manter uma proporção 4:3 consistente independentemente do aspecto da fonte

## 9. Guia de prompts para agentes

### Referência rápida de cores
- CTA principal: «Rausch (#ff385c)»
- Fundo de página: «Canvas White (#ffffff)»
- Subsuperfície: «Soft Cloud (#f7f7f7)»
- Texto de título / corpo: «Ink Black (#222222)»
- Texto secundário: «Ash Gray (#6a6a6a)»
- Borda / divisor: «Hairline Gray (#dddddd)»
- Erro: «Error Red (#c13515)»
- Link informativo: «Info Blue (#428bff)»
- Destaque de nível Luxe: «Luxe Purple (#460479)»
- Destaque de nível Plus: «Plus Magenta (#92174d)»

### Exemplos de prompts de componentes
- «Crie um botão principal Reservar: fundo Rausch (#ff385c), etiqueta branca Airbnb Cereal 500 a 16px, preenchimento 14px × 24px, raio de borda 8px, sem sombra. Em ativo/pressionado adicione `transform: scale(0.92)` com um anel de foco Ink Black de 2px (`0 0 0 2px #222222`).»
- «Construa um cartão de anúncio com uma fotografia 4:3 em sangria total com raio de borda 14px, sem sombra de container; abaixo da imagem empilhe três linhas de texto com espaços de 4px: nome de cidade a 16px 600 Ink Black, tipo de aluguel a 14px 500 Ash Gray (#6a6a6a), e faixa de preço a 16px 500 Ink Black com um sufixo `por noite` de 14px.»
- «Projete um painel de reserva fixo: fundo branco, raio de borda 14px, borda Hairline Gray (#dddddd) de 1px, sombra de elevação de 3 camadas (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), preenchimento 24px, largura 370px, ancorado a 120px abaixo do topo da viewport no desktop. Conteúdo: título do preço, seletor de datas, dropdown de hóspedes, CTA principal Rausch e uma isenção Ash Gray de 12px `Você não será cobrado ainda`.»
- «Crie um seletor de categoria de três abas: três abas de igual largura com etiquetas Casas, Experiências, Serviços; cada aba tem um ícone ilustrado renderizado em 3D (~48px de altura) (casa, balão, campainha) acima de uma etiqueta 16px 500 Ink Black; a aba ativa recebe sublinhado Ink Black de 2px; adicione uma pequena pílula 12px 700 branca `NOVO` sobre fundo azul marinho escuro no canto superior direito dos ícones de Experiências e Serviços.»
- «Renderize o medalhão de prêmio Guest Favorite: um número de avaliação centralizado a 52px 700 Ink Black, flanqueado à esquerda e à direita por coroas de louros SVG desenhadas à mão a ~48px de altura; abaixo, uma etiqueta de 12px 700 em maiúsculas `GUEST FAVORITE` com tracking de 0,32px; sub-etiqueta a 14px 500 Ash Gray; bloco de largura total situado diretamente sobre o canvas branco sem borda de container.»

### Guia de iteração
Ao refinar telas existentes geradas com este sistema de design:
1. Focar em UM componente por vez.
2. Referenciar nomes de cores específicos e códigos hexadecimais deste documento (ex.: «Ink Black #222222», não «cinza escuro»).
3. Usar descrições em linguagem natural junto com medidas («elevação sutil de três camadas» em vez de uma longa string de sombras).
4. Descrever o «sentimento» desejado («estilo de revista, fotografia em primeiro lugar» vs «utilidade densa»).
5. Sempre usar por padrão Airbnb Cereal VF 500 para corpo e 600–700 para ênfase — nunca 400.
6. Manter o rosa Rausch escasso — se mais de um elemento de cor Rausch aparecer por viewport, considere se um deveria ser neutralizado.

### Lacunas conhecidas
- **Cartões de grade de anúncios da página inicial**: a grade principal de cartões de propriedade (a superfície visual principal do airbnb.com) não foi totalmente capturada nas capturas de tela da página inicial extraídas — o conteúdo carregou apenas parcialmente. As especificações de cartão de anúncio acima são inferidas da estrutura da grade de inspiração e das convenções mais amplas do Airbnb; confirme as proporções exatas e a hierarquia de metadados no site ao vivo antes do uso em produção.
- **Ícones de categoria de Experiências**: os ícones ilustrados 3D para Casas / Experiências / Serviços são servidos como ativos raster; suas especificações exatas de arquivo fonte (SVG vs PNG, dimensões de pixels renderizados) não estão documentadas aqui.
- **Tempos de animação e transição**: não capturados — escopo de extração estática.
- **Modo escuro**: o Airbnb não inclui um modo escuro nativo nas superfícies de produto extraídas; este documento descreve o único tema de modo claro.
