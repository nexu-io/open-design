# Magazine Web PPT · Skill de PPT estilo revista eletrônica em web

> 🌏 **English version: [README.en.md](./README.en.md)**
> 🌏 **中文版: [README.md](./README.md)**

Uma skill do [Claude Code / Claude Agent Skills](https://agentskills.io/) para gerar **PPTs HTML em arquivo único com swipe horizontal**. O tom visual é "**revista eletrônica × tinta digital**" — como se a *Monocle* tivesse colado código.

> Destilada por [歸藏](https://x.com/op7418) em palestras presenciais como "Empresa de uma pessoa só: a organização dobrada pela IA" e "Uma nova forma de trabalhar"; cada armadilha que ele já pisou virou linha em `checklist.md`.

![Demonstração do Magazine Web PPT](https://github.com/user-attachments/assets/5dc316a2-401c-4e37-9123-ea081b6ae470)

## Resultado

- 🖋 **Título grande em serifa + corpo sem serifa + metadados monoespaçados**, divisão tipográfica em três níveis
- 🌊 **Background WebGL com fluido / dispersão**, presente na hero, contido nas páginas internas
- 📐 **Swipe horizontal**: teclado ← → / scroll / swipe touch / dots inferiores / ESC para o índice
- 🎨 **5 paletas predefinidas**: Tinta Clássica / Azul-Índigo Porcelana / Tinta Floresta / Papel Kraft / Duna
- 🧩 **10 layouts de página**: capa de abertura, abertura de capítulo, manchete de dado, texto-à-esquerda imagem-à-direita, grade de imagens, pipeline, página de mistério/pergunta, citação grande, comparação Before/After, mistura texto+imagem
- 📄 **HTML de arquivo único**: sem build, sem servidor, abre direto no navegador

## Quando encaixa / quando não encaixa

**✅ Boa escolha**: palestras presenciais / conversas internas de mercado / sessões privadas / lançamentos de produtos de IA / demo day / discursos com forte estilo pessoal

**❌ Má escolha**: tabelões de dados / material de treinamento (densidade de informação insuficiente) / edição colaborativa multi-usuário (HTML estático)

## Instalação

### Forma 1: mande o texto abaixo direto para a IA (recomendado)

> Me ajude a instalar a skill `guizang-ppt-skill` do Claude Code. Siga estes passos:
>
> 1. Garanta que o diretório `~/.claude/skills/` existe (crie se não existir)
> 2. Rode `git clone https://github.com/op7418/guizang-ppt-skill.git ~/.claude/skills/magazine-web-ppt`
> 3. Verifique: `ls ~/.claude/skills/magazine-web-ppt/` deve mostrar `SKILL.md`, `assets/` e `references/`
> 4. Me avise quando estiver instalado; depois disso, quando eu disser "faça um PPT estilo revista" ou similar, essa skill é disparada

Cole esse texto no Claude Code / Cursor / qualquer agente de IA com permissão de shell, e ele faz a instalação automaticamente.

### Forma 2: linha de comando manual

```bash
git clone https://github.com/op7418/guizang-ppt-skill.git ~/.claude/skills/magazine-web-ppt
```

### Como disparar

Depois de instalada, o Claude Code descobre e chama a skill automaticamente na conversa. Palavras-chave de gatilho:

- "me faça um PPT estilo revista"
- "gere um horizontal swipe deck"
- "editorial magazine style presentation"
- "slides de palestra estilo electronic ink"

## Fluxo de uso

A skill é um workflow estruturado de 6 passos; o Claude conduz:

1. **Esclarecimento de requisitos** — checklist de 6 perguntas: audiência, duração, material, imagens, tema, restrições rígidas
2. **Cópia do template** — `assets/template.html` → diretório do projeto, ajuste `<title>`, troque a paleta
3. **Preenchimento de conteúdo** — escolha entre os 10 esqueletos de layout, cole, edite o copy (com pré-checagem de classes + planejamento de ritmo das paletas antes)
4. **Autoavaliação** — confronto com `references/checklist.md`; questões P0 precisam passar todas
5. **Preview** — abre direto no navegador
6. **Iteração** — ajusta tamanho de fonte / altura / espaçamento via inline style

Detalhes em [`SKILL.md`](./SKILL.md).

## Estrutura de diretórios

```
magazine-web-ppt/
├── SKILL.md              ← Skill 主文件:工作流、原则、常见错误
├── README.md             ← 本文件
├── assets/
│   └── template.html     ← 完整可运行的种子 HTML(CSS + WebGL + 翻页 JS 全配好)
└── references/
    ├── components.md     ← 组件手册(字体、色、网格、图标、callout、stat、pipeline)
    ├── layouts.md        ← 10 种页面布局骨架(可直接粘贴)
    ├── themes.md         ← 5 套主题色预设(只能选不能自定义)
    └── checklist.md      ← 质量检查清单(P0 / P1 / P2 / P3 分级)
```

## Paletas predefinidas

Escolha uma em `references/themes.md` — **valores hex personalizados não são permitidos**; preservar a estética importa mais do que dar liberdade.

| Paleta | Cenário ideal |
|--------|---------------|
| 🖋 Tinta Clássica | Default genérico, lançamento comercial, quando estiver na dúvida |
| 🌊 Azul-Índigo Porcelana | Tecnologia / pesquisa / IA / lançamentos técnicos |
| 🌿 Tinta Floresta | Natureza / sustentabilidade / cultura / não-ficção |
| 🍂 Papel Kraft | Nostálgico / humanidades / literatura / revistas independentes |
| 🌙 Duna | Arte / design / criativo / galeria |

Para trocar a paleta basta substituir as 6 linhas de variáveis dentro do `:root{}` no início do `template.html`; todo o resto do CSS usa `var(--...)`.

## Princípios centrais de design

1. **Contenção acima de fogos** — o background WebGL só vaza na página hero
2. **Estrutura acima de decoração** — informação nasce de tamanho de fonte + contraste tipográfico + grid e respiro, não de sombras nem cards flutuantes
3. **Imagem é cidadã de primeira classe** — corte só pelo rodapé; topo e laterais ficam íntegros
4. **O ritmo vem das hero** — alternar hero / não-hero é o que evita cansar a vista
5. **Termos uniformes** — Skills permanece Skills, sem misturar tradução en-zh

## Referências visuais

- Diagramação da revista [*Monocle*](https://monocle.com)
- "Thin Harness, Fat Skills" do Garry Tan (YC)
- Série de PPTs de palestras presenciais do 歸藏

## Contribuindo

Bugs, problemas de tipografia, pedidos de novos layouts — abra Issue ou PR. Para mudanças, prefira:

- Adicionar classes em `template.html` para que `layouts.md` não use classes indefinidas
- Registrar pegadinhas em `checklist.md` no nível P0 / P1 / P2 / P3 correspondente
- Levar nova paleta para `themes.md` e indicar o cenário em que ela cabe

## Licença

MIT © 2026 [op7418](https://github.com/op7418)
