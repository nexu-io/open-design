# Sistema de design inspirado no Webflow

> Category: Design e criativo
> Construtor visual de sites. Estética de site de marketing polida com acento azul.

## 1. Tema visual e atmosfera

O site da Webflow é uma plataforma visualmente rica e orientada a ferramentas que comunica o "design sem código" por meio de superfícies brancas limpas, o azul característico Webflow（`#146ef5`）e uma rica paleta de cores secundárias（roxo, rosa, verde, laranja, amarelo, vermelho）. A fonte personalizada WF Visual Sans Variable cria um sistema tipográfico confiante e preciso com peso 600 para display e 500 para o corpo do texto.

**Características principais：**
- Tela branca com texto quase preto（`#080808`）
- Azul Webflow（`#146ef5`）como cor principal de marca e interação
- WF Visual Sans Variable — fonte variável personalizada com peso 500–600
- Paleta secundária rica：roxo `#7a3dff`, rosa `#ed52cb`, verde `#00d722`, laranja `#ff6b00`, amarelo `#ffae13`, vermelho `#ee1d36`
- Raio de borda conservador de 4px–8px — nítido, não arredondado
- Pilhas de sombra multicamada（5 camadas de sombras em cascata）
- Rótulos em maiúsculas：10px–15px, peso 500–600, espaçamento amplo（0,6px–1,5px）
- Animação translate(6px) ao passar o cursor sobre botões

## 2. Paleta de cores e funções

### Primário
- **Quase Preto**（`#080808`）：Texto principal
- **Azul Webflow**（`#146ef5`）：`--_color---primary--webflow-blue`, CTA principal e links
- **Azul 400**（`#3b89ff`）：`--_color---primary--blue-400`, azul interativo mais claro
- **Azul 300**（`#006acc`）：`--_color---blue-300`, variante de azul mais escura
- **Azul hover do botão**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Destaques secundários
- **Roxo**（`#7a3dff`）：`--_color---secondary--purple`
- **Rosa**（`#ed52cb`）：`--_color---secondary--pink`
- **Verde**（`#00d722`）：`--_color---secondary--green`
- **Laranja**（`#ff6b00`）：`--_color---secondary--orange`
- **Amarelo**（`#ffae13`）：`--_color---secondary--yellow`
- **Vermelho**（`#ee1d36`）：`--_color---secondary--red`

### Neutro
- **Cinza 800**（`#222222`）：Texto secundário escuro
- **Cinza 700**（`#363636`）：Texto intermediário
- **Cinza 300**（`#ababab`）：Texto atenuado, marcador de posição
- **Cinza médio**（`#5a5a5a`）：Texto de link
- **Cinza borda**（`#d8d8d8`）：Bordas, divisores
- **Borda hover**（`#898989`）：Borda ao passar o cursor

### Sombras
- **Cascata de 5 camadas**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Regras tipográficas

### Fonte：`WF Visual Sans Variable`, alternativa：`Arial`

| Função | Tamanho | Peso | Altura da linha | Espaçamento | Notas |
|------|------|--------|-------------|----------------|-------|
| Hero de display | 80px | 600 | 1,04 | -0,8px | |
| Título de seção | 56px | 600 | 1,04 | normal | |
| Subtítulo | 32px | 500 | 1,30 | normal | |
| Título de funcionalidade | 24px | 500–600 | 1,30 | normal | |
| Corpo | 20px | 400–500 | 1,40–1,50 | normal | |
| Corpo padrão | 16px | 400–500 | 1,60 | -0,16px | |
| Botão | 16px | 500 | 1,60 | -0,16px | |
| Rótulo em maiúsculas | 15px | 500 | 1,30 | 1,5px | uppercase |
| Legenda | 14px | 400–500 | 1,40–1,60 | normal | |
| Badge em maiúsculas | 12,8px | 550 | 1,20 | normal | uppercase |
| Micro em maiúsculas | 10px | 500–600 | 1,30 | 1px | uppercase |
| Código：Inconsolata（fonte monoespaçada complementar）

## 4. Estilos de componentes

### Botões
- Transparente：texto `#080808`, translate(6px) ao passar o cursor
- Círculo branco：raio 50%, fundo branco
- Badge azul：fundo `#146ef5`, raio 4px, peso 550

### Cartões：`1px solid #d8d8d8`, raio 4px–8px
### Badges：fundo com matiz azul a 10% de opacidade, raio 4px

## 5. Layout
- Espaçamento：escala fracionária（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Raio：2px, 4px, 8px, 50% — conservador, nítido
- Pontos de quebra：479px, 768px, 992px

## 6. Profundidade：sistema de sombras em cascata de 5 camadas

## 7. O que fazer e o que evitar
- Fazer：Usar WF Visual Sans Variable com peso 500–600. Azul（`#146ef5`）para CTAs. Raio 4px. translate(6px) ao passar o cursor.
- Evitar：Arredondar elementos funcionais acima de 8px. Usar cores secundárias em CTAs primários.

## 8. Responsivo：479px, 768px, 992px

## 9. Guia de prompt para Agent
- Texto：Quase Preto（`#080808`）
- CTA：Azul Webflow（`#146ef5`）
- Fundo：Branco（`#ffffff`）
- Borda：`#d8d8d8`
- Secundário：Roxo `#7a3dff`, Rosa `#ed52cb`, Verde `#00d722`
