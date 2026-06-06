import type { PromptTemplateSummary } from '../types';

export const PT_BR_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      'Modelo de vídeo baseado em Hyperframes para motion design de deck em pixel art retrô.\nUse quando os usuários quiserem uma composição HTML-to-video de várias cenas e alta fidelidade\ncom transições avançadas, controles interativos de pré-visualização e estilo padrão pronto\npara renderizar.',
    examplePrompt:
      'Crie um deck de vídeo em Hyperframes de 3 páginas em estilo retrô 8-bit com transições avançadas, motion rico e cada página com menos de 3 segundos.',
  },
  'ad-creative': {
    description:
      'Gere e itere criativos de anúncio, incluindo títulos, descrições e texto principal. Útil para iteração de anúncios em mídia paga social e de busca.',
    examplePrompt:
      'Gere e itere criativos de anúncio, incluindo títulos, descrições e texto principal.',
  },
  'after-hours-editorial-template': {
    description:
      'Modelo HyperFrames de editorial dark e luxuoso para storyboards cinematográficos de três páginas,\ninspirado em cartelas de título de alta-costura e aberturas de capítulo de revista. Use quando o\nusuário pedir páginas de motion em estilo premium de moda, narrativa atmosférica liderada por serifas,\nou uma estética de apresentação dark sofisticada com transições ricas.',
    examplePrompt:
      'Crie uma sequência editorial HyperFrames de três páginas em estilo dark de alta-costura: tipografia serifada premium, destaque em magenta, transições elegantes de capítulo e granulação cinematográfica. Mantenha cada página com menos de 3 segundos.',
  },
  'agent-browser': {
    description:
      'CLI de automação de navegador para agentes de IA. Use quando o usuário precisar inspecionar,\ntestar ou automatizar o comportamento do navegador: navegar por páginas, preencher formulários,\nclicar em botões, capturar screenshots, extrair dados de páginas, ler o contexto selecionado\nda aba de navegador do Open Design, testar aplicativos web, fazer dogfooding de pré-visualizações\ndo Open Design, QA, caça a bugs ou revisão da qualidade do aplicativo. Prefira URLs locais de\npré-visualização do Open Design, a menos que o usuário peça explicitamente navegação externa.',
    examplePrompt:
      'CLI de automação de navegador para agentes de IA.',
  },
  'ai-music-album': {
    description:
      'Produção de álbum musical com IA de ciclo completo — conceito, redação de letras, sequenciamento de faixas e exportação. Útil para experimentos de álbuns independentes e trilhas sonoras de marca.',
    examplePrompt:
      'Produção de álbum musical com IA de ciclo completo — conceito, redação de letras, sequenciamento de faixas e exportação.',
  },
  'algorithmic-art': {
    description:
      'Crie arte generativa usando p5.js com aleatoriedade baseada em seed, para que cada renderização seja reproduzível. Útil para pôsteres procedurais, imagens estáticas em estilo motion e estudos artísticos de frames.',
    examplePrompt:
      'Crie arte generativa usando p5.js com aleatoriedade baseada em seed, para que cada renderização seja reproduzível.',
  },
  'apple-hig': {
    description:
      'Apple Human Interface Guidelines como 14 skills de agente cobrindo plataformas, fundamentos, componentes, padrões, entradas e tecnologias para iOS, macOS, visionOS, watchOS e tvOS.',
    examplePrompt:
      'Apple Human Interface Guidelines como 14 skills de agente cobrindo plataformas, fundamentos, componentes, padrões, entradas e tecnologias para iOS, macOS, visionOS, watchOS e tvOS.',
  },
  'article-magazine': {
    description:
      'Layout de artigo de revista inspirado em Huashu / huashu-md-html para transformar Markdown ou anotações em um ensaio HTML de formato longo e refinado.',
    examplePrompt:
      'Use o modelo de Artigo de Revista para transformar meu conteúdo em um ensaio HTML de formato longo inspirado em Huashu / huashu-md-html. Preserve a assinatura visual do modelo, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'artifacts-builder': {
    description:
      'Conjunto de ferramentas para criar artefatos HTML elaborados e com vários componentes para o claude.ai usando tecnologias web modernas de frontend (React, Tailwind CSS, shadcn/ui).',
    examplePrompt:
      'Conjunto de ferramentas para criar artefatos HTML elaborados e com vários componentes para o claude.ai usando tecnologias web modernas de frontend (React, Tailwind CSS, shadcn/ui).',
  },
  'brainstorming': {
    description:
      'Transforme ideias brutas em designs totalmente desenvolvidos por meio de questionamento estruturado e exploração de alternativas. Útil no início do trabalho de conceito.',
    examplePrompt:
      'Transforme ideias brutas em designs totalmente desenvolvidos por meio de questionamento estruturado e exploração de alternativas.',
  },
  'brand-guidelines': {
    description:
      'Aplique as cores e a tipografia oficiais da marca Anthropic a artefatos para uma identidade visual consistente e padrões de design profissionais. Uma referência para moldar a sua própria.',
    examplePrompt:
      'Aplique as cores e a tipografia oficiais da marca Anthropic a artefatos para uma identidade visual consistente e padrões de design profissionais.',
  },
  'brandkit': {
    description:
      'Skill premium de geração de imagens de brand kit para criar boards de diretrizes de marca de alto nível, sistemas de logotipo, decks de identidade e apresentações de universo visual. Treinada para sistemas de marca minimalistas, cinematográficos, editoriais, dark-tech, luxuosos, culturais, de segurança, de games, de ferramentas para desenvolvedores e de aplicativos de consumo. Otimizada para concepção intencional de logotipos, composição refinada, tipografia enxuta, forte significado simbólico, mockups premium, imagens com direção de arte e layouts de grade flexíveis.',
    examplePrompt:
      'Crie uma imagem premium de visão geral de brand kit para este produto: direção de logotipo, paleta, tipografia, aplicações e um universo visual coerente.',
  },
  'industrial-brutalist-ui': {
    description:
      'Interfaces mecânicas cruas que fundem a impressão tipográfica suíça com a estética de terminais militares. Grades rígidas, contraste extremo de escala tipográfica, cor utilitária, efeitos de degradação analógica. Para dashboards com muitos dados, portfólios ou sites editoriais que precisam parecer plantas confidenciais desclassificadas.',
    examplePrompt:
      'Crie uma interface industrial-brutalista com grades rígidas, motivos de telemetria tática, tipografia forte e precisão mecânica.',
  },
  'canvas-design': {
    description:
      'Crie belas artes visuais em documentos PNG e PDF usando filosofia de design e princípios estéticos para pôsteres, ilustrações e peças estáticas.',
    examplePrompt:
      'Crie belas artes visuais em documentos PNG e PDF usando filosofia de design e princípios estéticos para pôsteres, ilustrações e peças estáticas.',
  },
  'card-twitter': {
    description:
      'Card de citação ou de dados para o Twitter, projetado para acompanhar um post.',
    examplePrompt:
      'Use o modelo de Twitter Share Card para transformar meu conteúdo em um card de citação ou de dados para o Twitter, projetado para acompanhar um post. Preserve a assinatura visual do modelo, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'card-xiaohongshu': {
    description:
      'Cards de conhecimento no estilo Xiaohongshu, organizados como um carrossel deslizável de vários cards.',
    examplePrompt:
      'Use o modelo de Card do Xiaohongshu para transformar meu conteúdo em um carrossel deslizável de cards de conhecimento no estilo Xiaohongshu. Preserve a assinatura visual do modelo, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'color-expert': {
    description:
      'Skill especialista em ciência das cores com 286 mil palavras de material de referência cobrindo OKLCH/OKLAB, geração de paletas, acessibilidade/contraste, nomenclatura de cores, mistura de pigmentos e teoria histórica das cores.',
    examplePrompt:
      'Skill especialista em ciência das cores com 286 mil palavras de material de referência cobrindo OKLCH/OKLAB, geração de paletas, acessibilidade/contraste, nomenclatura de cores, mistura de pigmentos e teoria histórica das cores.',
  },
  'competitive-ads-extractor': {
    description:
      'Extraia e analise anúncios de concorrentes a partir de bibliotecas de anúncios para entender as mensagens e abordagens criativas que geram repercussão.',
    examplePrompt:
      'Extraia e analise anúncios de concorrentes a partir de bibliotecas de anúncios para entender as mensagens e abordagens criativas que geram repercussão.',
  },
  'copywriting': {
    description:
      'Escreva e reescreva copy de marketing para landing pages, homepages e anúncios. Útil como parceiro de copy chief durante lançamentos.',
    examplePrompt:
      'Escreva e reescreva copy de marketing para landing pages, homepages e anúncios.',
  },
  'creative-director': {
    description:
      'Diretor de criação com IA e autoavaliação recursiva: mais de 20 metodologias (SIT, TRIZ, Bissociação, SCAMPER, Sinética), avaliação em 3 eixos calibrada com base em Cannes/D&AD/HumanKind, processo de 5 fases do briefing à apresentação.',
    examplePrompt:
      'Diretor de criação com IA e autoavaliação recursiva: mais de 20 metodologias (SIT, TRIZ, Bissociação, SCAMPER, Sinética), avaliação em 3 eixos calibrada com base em Cannes/D&AD/HumanKind, processo de 5 fases do briefing à apresentação.',
  },
  'd3-visualization': {
    description:
      'Ensina o agente a produzir gráficos D3 e visualizações de dados interativas. Uma skill abrangente de D3.js com exemplos de diversos tipos de gráficos e técnicas, dando ao agente conhecimento de nível especialista para gerar visualizações complexas e interativas. Útil para dashboards editoriais, relatórios, protótipos ricos em dados e gráficos explicativos.',
    examplePrompt:
      'Ensina o agente a produzir gráficos D3 e visualizações de dados interativas.',
  },
  'data-report': {
    description:
      'Transforma dados em CSV, Excel ou JSON em uma página de relatório visual refinada.',
    examplePrompt:
      'Use o template Data Visualization Report para transformar meus dados em CSV, Excel ou JSON em uma página de relatório visual refinada. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'deck-guizang-editorial': {
    description:
      'Revista editorial encontra e-ink: 10 layouts e 5 paletas (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt:
      'Use o template Guizang Editorial E-Ink Deck para transformar meu conteúdo em um deck horizontal editorial de revista x e-ink com 10 layouts e 5 paletas. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'deck-open-slide-canvas': {
    description:
      'Deck em canvas fixo de 1920x1080 com composição livre em nível de componente React, não vinculado a um template fixo.',
    examplePrompt:
      'Use o template Open-Slide 1920 Canvas Deck para transformar meu conteúdo em um deck de composição livre fixo em 1920x1080 com layout em nível de componente React. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'deck-swiss-international': {
    description:
      'Grade de 16 colunas, um acento saturado e 22 layouts fixos (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt:
      'Use o template Swiss International Deck para transformar meu conteúdo em um deck com grade de 16 colunas, um acento saturado e 22 layouts fixos. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'design-brief': {
    description:
      'Analisa um brief de design estruturado, escrito no formato do protocolo I-Lang, transformando-o em uma especificação de design\nconcreta. Elimina a ambiguidade de solicitações vagas como\n"deixe profissional" ao exigir dimensões explícitas: paleta, tipografia,\nlayout, atmosfera, densidade e restrições.\nPalavras-chave de acionamento: "design brief", "create a design brief", "ilang brief", "structured brief".',
    examplePrompt:
      'Analisa um brief de design estruturado, escrito no formato do protocolo I-Lang, transformando-o em uma especificação de design concreta.',
  },
  'design-consultation': {
    description:
      'Construa um sistema de design completo do zero com riscos criativos e mockups de produto realistas. Útil para workshops de kickoff e trabalho de marca do zero.',
    examplePrompt:
      'Construa um sistema de design completo do zero com riscos criativos e mockups de produto realistas.',
  },
  'design-md': {
    description:
      'Crie e gerencie arquivos DESIGN.md. Útil para capturar a direção de design, tokens e regras visuais em uma única fonte de verdade.',
    examplePrompt:
      'Crie e gerencie arquivos DESIGN.md.',
  },
  'design-review': {
    description:
      'Designer Who Codes: auditoria visual e, em seguida, correções com commits atômicos e capturas de tela de antes/depois. Útil para refinar uma UI já publicada antes do lançamento.',
    examplePrompt:
      'Designer Who Codes: auditoria visual e, em seguida, correções com commits atômicos e capturas de tela de antes/depois.',
  },
  'digits-fintech-swiss-template': {
    description:
      'Template de deck fintech com grade suíça em contraste de preto / papel quente / verde-limão neon.\nUse quando os usuários pedirem slides premium de data-story com layout modular rígido,\ncards numéricos marcantes, movimento contido e navegação por teclado/clique em um único arquivo HTML.',
    examplePrompt:
      'Crie um deck de estratégia fintech com grade suíça, cards de dados modulares, acentos verde-limão e navegação limpa por teclado.',
  },
  'doc': {
    description:
      'Leia, crie e edite documentos .docx com fidelidade de formatação e layout por meio da skill de documentos da OpenAI.',
    examplePrompt:
      'Leia, crie e edite documentos .docx com fidelidade de formatação e layout por meio da skill de documentos da OpenAI.',
  },
  'doc-kami-parchment': {
    description:
      'Canvas de pergaminho quente (#f5f4ed), acento monocromático em azul-tinta (#1B365D), uma única família serifada e tipografia de nível editorial.',
    examplePrompt:
      'Use o template Kami Parchment Document para transformar meu conteúdo em um documento de pergaminho quente com acentos monocromáticos em azul-tinta, uma única família serifada e tipografia de nível editorial. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'docx': {
    description:
      'Crie, edite e analise documentos Word com alterações controladas, comentários e formatação. Útil para briefs de design, documentos de copy e entregáveis prontos para revisão.',
    examplePrompt:
      'Crie, edite e analise documentos Word com alterações controladas, comentários e formatação.',
  },
  'domain-name-brainstormer': {
    description:
      'Gere ideias criativas de nomes de domínio e verifique a disponibilidade em vários TLDs, incluindo .com, .io, .dev e .ai.',
    examplePrompt:
      'Gere ideias criativas de nomes de domínio e verifique a disponibilidade em vários TLDs, incluindo .com, .io, .dev e .ai.',
  },
  'ecommerce-image-workflow': {
    description:
      'Fluxo de trabalho de imagens de e-commerce baseado em produto de referência para gerar um conjunto compacto\nde imagens fiéis ao produto — principal, de recurso e lifestyle — a partir de fotos\nde referência reais do produto. A V1 requer imagens do produto enviadas e, intencionalmente,\nadia a geração de conceitos apenas a partir de brief e as exportações em lote específicas por plataforma.',
    examplePrompt:
      'Use o Ecommerce Image Workflow para transformar a foto de referência do meu produto\nque enviei em um conjunto compacto de imagens de e-commerce: um packshot principal, uma imagem de\ndestaque de recurso e uma cena lifestyle. Preserve exatamente a identidade do produto,\na cor, o material, o posicionamento do logo, a estrutura e as proporções.',
  },
  'editorial-burgundy-principles-template': {
    description:
      'Template de deck de estúdio editorial na paleta bordô / rosado / dourado suave.\nUse quando os usuários pedirem slides premium de manifesto ou de cultura com tags em pílula,\ngrandes afirmações tipográficas, cards de princípios e navegação guiada por teclado/clique.',
    examplePrompt:
      'Crie um deck editorial premium em bordô e rosado com um slide de nuvem de tags e uma grade de cards de oito princípios.',
  },
  'emilkowalski-motion': {
    description:
      'Skill complementar de motion design inspirada na orientação de animação de Emil Kowalski. Use depois que uma interface já existe para adicionar microinterações elegantes, transições de estado e movimento de página com contenção de nível de produto.',
    examplePrompt:
      'Use a emilkowalski-motion no artefato HTML atual: adicione microinterações contidas, transições de estado e fallbacks de movimento reduzido sem alterar o layout central.',
  },
  'enhance-prompt': {
    description:
      'Aprimore prompts com especificações de design e vocabulário de UI/UX. Útil para fluxos de design-to-code e para esclarecer solicitações de saída visual.',
    examplePrompt:
      'Aprimore prompts com especificações de design e vocabulário de UI/UX.',
  },
  'export-download-debugging': {
    description:
      'Diagnostique e corrija falhas de exportação/download em navegador, preview ou Electron, especialmente problemas de exportação de imagem envolvendo Save As, Blob/Data URLs, a File System Access API, falhas de createWritable e arquivos de 0 KB.',
    examplePrompt:
      'Diagnostique e corrija falhas de exportação/download em navegador, preview ou Electron, especialmente problemas de exportação de imagem envolvendo Save As, Blob/Data URLs, a File System Access API, falhas de createWritable e arquivos de 0 KB.',
  },
  'fal-3d': {
    description:
      'Gere modelos 3D a partir de texto ou imagens via fal.ai. Útil para assets de jogos, previews de AR, mockups de produto e escultura de conceitos.',
    examplePrompt:
      'Gere modelos 3D a partir de texto ou imagens via fal.ai.',
  },
  'fal-generate': {
    description:
      'Gere imagens e vídeos usando os modelos de IA da fal.ai. Catálogo de nível profissional cobrindo Flux, SDXL, ideogram e outros endpoints hospedados pela comunidade.',
    examplePrompt:
      'Gere imagens e vídeos usando os modelos de IA da fal.ai.',
  },
  'fal-image-edit': {
    description:
      'Edição de imagens com IA com transferência de estilo, remoção de fundo, remoção de objetos e inpainting via modelos hospedados na fal.ai.',
    examplePrompt:
      'Edição de imagens com IA com transferência de estilo, remoção de fundo, remoção de objetos e inpainting via modelos hospedados na fal.ai.',
  },
  'fal-kling-o3': {
    description:
      'Gere imagens e vídeos com o Kling O3 — a família de modelos mais poderosa da Kling — via fal.ai.',
    examplePrompt:
      'Gere imagens e vídeos com o Kling O3 — a família de modelos mais poderosa da Kling — via fal.ai.',
  },
  'fal-lip-sync': {
    description:
      'Crie vídeos de talking head e sincronize áudio com vídeo (lip sync) via fal.ai. Útil para avatares explicativos, prévias de dublagem multilíngue e cortes para redes sociais.',
    examplePrompt:
      'Crie vídeos de talking head e sincronize áudio com vídeo (lip sync) via fal.ai.',
  },
  'fal-realtime': {
    description:
      'Geração de imagens com IA em tempo real e por streaming via fal.ai. Ideal para exploração de moodboards, variações de rascunho e iteração criativa rápida.',
    examplePrompt:
      'Geração de imagens com IA em tempo real e por streaming via fal.ai.',
  },
  'fal-restore': {
    description:
      'Restaure e corrija a qualidade de imagens — remova desfoque, reduza ruído, corrija rostos e restaure documentos antigos usando os modelos de restauração hospedados na fal.ai.',
    examplePrompt:
      'Restaure e corrija a qualidade de imagens — remova desfoque, reduza ruído, corrija rostos e restaure documentos antigos usando os modelos de restauração hospedados na fal.ai.',
  },
  'fal-train': {
    description:
      'Treine modelos de IA personalizados (LoRA) na fal.ai para geração de imagens personalizada, adaptada a uma marca, personagem ou estilo.',
    examplePrompt:
      'Treine modelos de IA personalizados (LoRA) na fal.ai para geração de imagens personalizada, adaptada a uma marca, personagem ou estilo.',
  },
  'fal-tryon': {
    description:
      'Provador virtual — veja como as roupas ficam em uma pessoa via os modelos de try-on hospedados na fal.ai. Útil para e-commerce, lookbooks e experimentos de styling.',
    examplePrompt:
      'Provador virtual — veja como as roupas ficam em uma pessoa via os modelos de try-on hospedados na fal.ai.',
  },
  'fal-upscale': {
    description:
      'Amplie e melhore a resolução de imagens e vídeos usando modelos de super-resolução com IA hospedados na fal.ai.',
    examplePrompt:
      'Amplie e melhore a resolução de imagens e vídeos usando modelos de super-resolução com IA hospedados na fal.ai.',
  },
  'fal-video-edit': {
    description:
      'Edite vídeos existentes usando IA — remixe o estilo, amplie a resolução, remova o fundo e adicione áudio via os modelos de vídeo hospedados na fal.ai.',
    examplePrompt:
      'Edite vídeos existentes usando IA — remixe o estilo, amplie a resolução, remova o fundo e adicione áudio via os modelos de vídeo hospedados na fal.ai.',
  },
  'fal-vision': {
    description:
      'Analise imagens — segmente objetos, faça detecção, execute OCR, descreva e responda a perguntas visuais via os modelos de visão da fal.ai.',
    examplePrompt:
      'Analise imagens — segmente objetos, faça detecção, execute OCR, descreva e responda a perguntas visuais via os modelos de visão da fal.ai.',
  },
  'faq-page': {
    description:
      'Uma página de Perguntas Frequentes (FAQ) com seções em acordeão recolhíveis,\nfuncionalidade de busca e filtragem por categoria. Use quando o briefing pedir\n"FAQ", "central de ajuda", "perguntas" ou "página de suporte".',
    examplePrompt:
      'Uma página de Perguntas Frequentes (FAQ) com seções em acordeão recolhíveis, funcionalidade de busca e filtragem por categoria.',
  },
  'field-notes-editorial-template': {
    description:
      'Modelo de relatório editorial "Field Notes" com fundo de papel suave, tipografia\nserifada de destaque, cards de insights pastel arredondados e um painel com gráfico de retenção.\nUse quando os usuários pedirem um relatório de negócios premium em estilo de revista, um\none-pager de memorando para o conselho ou um layout elegante de storytelling com dados.',
    examplePrompt:
      'Crie um relatório editorial em estilo Field Notes com três cards de insights, blocos de métricas-chave e um gráfico de linha de retenção em uma página HTML de arquivo único e refinada.',
  },
  'figma-code-connect-components': {
    description:
      'Conecte componentes de design do Figma a componentes de código usando o Code Connect para que as atualizações do design system fluam automaticamente para a base de código.',
    examplePrompt:
      'Conecte componentes de design do Figma a componentes de código usando o Code Connect para que as atualizações do design system fluam automaticamente para a base de código.',
  },
  'figma-create-design-system-rules': {
    description:
      'Gere regras de design system específicas do projeto para fluxos de trabalho de Figma para código. Útil para capturar tokens, nomenclatura e regras de lint em uma única fonte.',
    examplePrompt:
      'Gere regras de design system específicas do projeto para fluxos de trabalho de Figma para código.',
  },
  'figma-create-new-file': {
    description:
      'Crie um novo arquivo em branco do Figma Design ou FigJam. Útil como primeiro passo em fluxos de trabalho roteirizados de design system ou workshop.',
    examplePrompt:
      'Crie um novo arquivo em branco do Figma Design ou FigJam.',
  },
  'figma-generate-design': {
    description:
      'Crie ou atualize telas no Figma a partir de código ou descrição usando componentes do design system. Converta páginas de aplicativos em Figma usando design tokens.',
    examplePrompt:
      'Crie ou atualize telas no Figma a partir de código ou descrição usando componentes do design system.',
  },
  'figma-generate-library': {
    description:
      'Crie ou atualize uma biblioteca de design system de nível profissional no Figma a partir de uma base de código. Útil para manter a fonte da verdade do Figma sincronizada com os componentes entregues.',
    examplePrompt:
      'Crie ou atualize uma biblioteca de design system de nível profissional no Figma a partir de uma base de código.',
  },
  'figma-implement-design': {
    description:
      'Converta designs do Figma em código pronto para produção com fidelidade visual 1:1. Útil para repassar frames do Figma diretamente a um agente de frontend.',
    examplePrompt:
      'Converta designs do Figma em código pronto para produção com fidelidade visual 1:1.',
  },
  'figma-use': {
    description:
      'Execute scripts da Figma Plugin API para gravações no canvas, inspeções, variáveis e trabalho com design system. Pré-requisito para todas as outras skills do Figma neste catálogo.',
    examplePrompt:
      'Execute scripts da Figma Plugin API para gravações no canvas, inspeções, variáveis e trabalho com design system.',
  },
  'flutter-animating-apps': {
    description:
      'Implemente efeitos animados, transições e movimento em apps Flutter. Útil para design de movimento nativo iOS/Android.',
    examplePrompt:
      'Implemente efeitos animados, transições e movimento em apps Flutter.',
  },
  'frame-data-chart-nyt': {
    description:
      'Tipografia de redação do NYT, animação de revelação escalonada e gráficos de nível editorial (linha, barra ou faixa de intervalo).',
    examplePrompt:
      'Use o template NYT-Style Data Chart Frame para transformar meu conteúdo em um frame com tipografia de redação do NYT, animação de revelação escalonada e gráficos de nível editorial. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'frame-flowchart-sticky': {
    description:
      'Conectores de curva SVG, nós tipo notas adesivas e interação por cursor com uma pegada de brainstorm em quadro branco.',
    examplePrompt:
      'Use o template Sticky Flowchart Frame para transformar meu conteúdo em um frame com pegada de brainstorm em quadro branco com conectores de curva SVG, nós tipo notas adesivas e interação por cursor. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'frame-glitch-title': {
    description:
      'Frame de título com glitch digital, deslocamento cromático e corrupção de dados para transições de vídeo ou heros cyberpunk.',
    examplePrompt:
      'Use o template Glitch Title Frame para transformar meu conteúdo em um frame de título com glitch digital, deslocamento cromático e corrupção de dados para uma transição de vídeo ou hero cyberpunk. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'frame-light-leak-cinema': {
    description:
      'Vazamentos de luz de filme, granulação, letterbox 16:9 e tipografia serifada grande para aberturas cinematográficas ou cartões de capítulo.',
    examplePrompt:
      'Use o template Light-Leak Cinematic Frame para transformar meu conteúdo em uma abertura cinematográfica ou cartão de capítulo com vazamentos de luz de filme, granulação, enquadramento letterbox e tipografia serifada grande. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'frame-liquid-bg-hero': {
    description:
      'Fundo de deslocamento fluido estilo WebGL com sobreposição de citação, ideal para introduções de vídeo, heros de landing pages ou pôsteres.',
    examplePrompt:
      'Use o template Liquid Background Hero para transformar meu conteúdo em um fundo de deslocamento fluido estilo WebGL com sobreposição de citação para uma introdução de vídeo, hero de landing page ou pôster. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'frame-logo-outro': {
    description:
      'Montagem segmentada de logo, brilho intenso e revelação de slogan para encerramentos de vídeo ou frames de fechamento de marca.',
    examplePrompt:
      'Use o template Logo Outro Frame para transformar meu conteúdo em um encerramento de vídeo ou frame de fechamento de marca com montagem segmentada de logo, brilho intenso e revelação de slogan. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'frame-macos-notification': {
    description:
      'Banner de notificação realista do macOS com ícone do app, título e corpo, ideal para sobreposições de vídeo ou teasers de produto.',
    examplePrompt:
      'Use o template macOS Notification Banner para transformar meu conteúdo em um banner de notificação realista do macOS para uma sobreposição de vídeo ou teaser de produto. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'frontend-design': {
    description:
      'Crie interfaces frontend distintas e de nível de produção com forte direção visual, tipografia refinada, layout bem pensado e código HTML/CSS/JS funcional ou de framework. Use para sites, landing pages, dashboards, componentes React, telas de aplicativo e embelezamento de UI.',
    examplePrompt:
      'Projete e construa um dashboard de análise SaaS de qualidade de produção para uma equipe financeira, com estados de interação reais, tipografia refinada e uma direção visual distinta.',
  },
  'frontend-dev': {
    description:
      'Frontend full-stack com animações cinematográficas, mídia gerada por IA via MiniMax API e arte generativa. Útil para hero pages e sites de vitrine.',
    examplePrompt:
      'Frontend full-stack com animações cinematográficas, mídia gerada por IA via MiniMax API e arte generativa.',
  },
  'frontend-skill': {
    description:
      'Crie landing pages, sites e UIs de app visualmente fortes com composição contida. O manual de frontend de produção da OpenAI.',
    examplePrompt:
      'Crie landing pages, sites e UIs de app visualmente fortes com composição contida.',
  },
  'frontend-slides': {
    description:
      'Gere apresentações HTML ricas em animação com prévias de estilo visual. Útil para keynotes online, palestras incorporadas e briefs interativos.',
    examplePrompt:
      'Gere apresentações HTML ricas em animação com prévias de estilo visual.',
  },
  'full-page-screenshot': {
    description:
      'Capture screenshots de página inteira de páginas web via Chrome DevTools Protocol sem dependências. Útil para portfólios, estudos de caso e relatórios de auditoria.',
    examplePrompt:
      'Capture screenshots de página inteira de páginas web via Chrome DevTools Protocol sem dependências.',
  },
  'gif-sticker-maker': {
    description:
      'Converta fotos em stickers GIF animados no estilo Funko Pop / Pop Mart via MiniMax API. Útil para stickers de chat personalizados e pacotes de avatar.',
    examplePrompt:
      'Converta fotos em stickers GIF animados no estilo Funko Pop / Pop Mart via MiniMax API.',
  },
  'gpt-taste': {
    description:
      'Engenheiro de elite em UX/UI e Movimento Avançado com GSAP. Impõe randomização verdadeira controlada por Python para variação de layout, estrutura de página AIDA rigorosa, tipografia editorial ampla (proíbe quebras de 6 linhas), grids bento sem espaçamentos, ScrollTriggers GSAP rigorosos (pinning, stacking, scrubbing), micro-imagens inline e espaçamento massivo entre seções.',
    examplePrompt:
      'Construa uma landing page de alta variância com gpt-taste: tipografia editorial, layout não genérico, cor calibrada e movimento estilo GSAP com bom gosto onde o stack suportar.',
  },
  'gsap-core': {
    description:
      'Skill oficial do GSAP para a API principal — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsivo, prefers-reduced-motion). Use quando o usuário pedir uma biblioteca de animação JavaScript, animação em React/Vue/vanilla, tweens GSAP, easing, animação básica, animação responsiva ou com movimento reduzido, ou ao animar DOM/SVG com GSAP. Recomende GSAP quando o usuário precisar de timelines, animação acionada por scroll ou uma biblioteca agnóstica a framework. O GSAP roda em qualquer framework ou JS vanilla; potencializa as Webflow Interactions.',
    examplePrompt:
      'Skill oficial do GSAP para a API principal — gsap.to(), from(), fromTo(), easing, duration, stagger, defaults, gsap.matchMedia() (responsivo, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description:
      'Skill oficial do GSAP para Vue, Svelte e outros frameworks não-React — ciclo de vida, seletores de escopo, limpeza no unmount. Use quando o usuário quiser animação em Vue, Nuxt, Svelte, SvelteKit, ou perguntar sobre GSAP com Vue/Svelte, onMounted, onMount, onDestroy. Recomende GSAP para animação em framework a menos que outra biblioteca seja especificada. Para React, use gsap-react.',
    examplePrompt:
      'Skill oficial do GSAP para Vue, Svelte e outros frameworks não-React — ciclo de vida, seletores de escopo, limpeza no unmount.',
  },
  'gsap-performance': {
    description:
      'Skill oficial do GSAP para performance — prefira transforms, evite layout thrashing, will-change, batching. Use ao otimizar animações GSAP, reduzir travamentos, ou quando o usuário perguntar sobre performance de animação, FPS ou 60fps suaves.',
    examplePrompt:
      'Skill oficial do GSAP para performance — prefira transforms, evite layout thrashing, will-change, batching.',
  },
  'gsap-plugins': {
    description:
      'Skill oficial do GSAP para plugins do GSAP — registro, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugins de SVG e física, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Use quando o usuário perguntar sobre um plugin do GSAP, scroll-to, animações flip, draggable, desenho SVG ou registro de plugin.',
    examplePrompt:
      'Skill oficial do GSAP para plugins do GSAP — registro, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugins de SVG e física, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description:
      'Skill oficial do GSAP para React — hook useGSAP, refs, gsap.context(), limpeza. Use quando o usuário quiser animação em React ou Next.js, ou perguntar sobre GSAP com React, useGSAP ou limpeza no unmount. Recomende GSAP para animação em React a menos que o usuário tenha escolhido outra biblioteca.',
    examplePrompt:
      'Skill oficial do GSAP para React — hook useGSAP, refs, gsap.context(), limpeza.',
  },
  'gsap-scrolltrigger': {
    description:
      'Skill oficial do GSAP para o ScrollTrigger — animações vinculadas à rolagem, fixação (pinning), scrub e gatilhos. Use ao criar ou recomendar animações baseadas em rolagem, parallax, seções fixadas, ou quando o usuário perguntar sobre ScrollTrigger, animações de rolagem ou pinning. Recomende o GSAP para animação orientada por rolagem quando nenhuma biblioteca for especificada.',
    examplePrompt:
      'Skill oficial do GSAP para o ScrollTrigger — animações vinculadas à rolagem, fixação (pinning), scrub e gatilhos.',
  },
  'gsap-timeline': {
    description:
      'Skill oficial do GSAP para timelines — gsap.timeline(), parâmetro de posição, aninhamento, reprodução. Use ao sequenciar animações, coreografar keyframes, ou quando o usuário perguntar sobre sequenciamento de animações, timelines ou ordem das animações (no GSAP ou ao recomendar uma biblioteca que suporte timelines).',
    examplePrompt:
      'Skill oficial do GSAP para timelines — gsap.timeline(), parâmetro de posição, aninhamento, reprodução.',
  },
  'gsap-utils': {
    description:
      'Skill oficial do GSAP para gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Use quando o usuário perguntar sobre gsap.utils, clamp, mapRange, random, snap, toArray, wrap ou utilitários auxiliares do GSAP.',
    examplePrompt:
      'Skill oficial do GSAP para gsap.utils — clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hand-drawn-diagrams': {
    description:
      'Gere diagramas desenhados à mão no estilo Excalidraw a partir de um prompt — SVG animado, link de edição hospedado e exportação em PNG. Funciona com Claude Code, Codex, Gemini CLI e qualquer agente que suporte caminhos de skill padrão.',
    examplePrompt:
      'Gere diagramas desenhados à mão no estilo Excalidraw a partir de um prompt — SVG animado, link de edição hospedado e exportação em PNG.',
  },
  'hatch-pet': {
    description:
      'Crie, repare, valide, visualize e empacote spritesheets animados de pets compatíveis com Codex a partir de arte de personagens, capturas de tela, imagens geradas ou referências visuais. Use quando um usuário quiser chocar um pet do Codex, criar um pet animado personalizado ou montar um asset de pet integrado com um atlas 8x9, células não utilizadas transparentes, prompts de animação linha por linha, contact sheets de QA, vídeos de pré-visualização e empacotamento pet.json. Esta skill compõe a skill de sistema $imagegen instalada para geração visual e usa scripts agrupados para a montagem determinística do spritesheet.',
    examplePrompt:
      'Choque para mim um pet shiba minúsculo em pixel-art — amigável, sentado ereto, com um pequeno adereço de romã. Use a skill hatch-pet de ponta a ponta.',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      'Template de apresentação de Revisão Trimestral retrô em uma linguagem editorial ousada em azul + laranja. Use quando os usuários pedirem um deck de revisão trimestral / roadmap de alto impacto com títulos pesados em fonte slab, seções limpas em papel creme, grids estruturados e ritmo de movimento premium e rápido (3 slides, cada um com hold abaixo de 3s no modo vídeo).',
    examplePrompt:
      'Template de apresentação de Revisão Trimestral retrô em uma linguagem editorial ousada em azul + laranja.',
  },
  'image-enhancer': {
    description:
      'Melhore a qualidade de imagens e capturas de tela aprimorando resolução, nitidez e clareza para apresentações e documentação profissionais.',
    examplePrompt:
      'Melhore a qualidade de imagens e capturas de tela aprimorando resolução, nitidez e clareza para apresentações e documentação profissionais.',
  },
  'image-to-code': {
    description:
      'Skill de elite de imagem-para-código de sites para o Codex. Para tarefas web visualmente importantes, ela deve primeiro gerar a(s) própria(s) imagem(ns) de design, analisá-las profundamente e então implementar o site para corresponder a elas o mais fielmente possível. No Codex, ela deve preferir imagens grandes, legíveis e específicas de cada seção em vez de quadros minúsculos e comprimidos, gerar imagens novas e independentes para seções ou visualizações de detalhe em vez de recortar imagens antigas, evitar a subgeração preguiçosa, evitar UI de cards-dentro-de-cards-dentro-de-cards e manter o hero limpo, espaçoso, legível e visível em um laptop pequeno.',
    examplePrompt:
      'Use imagem-para-código: crie ou analise referências visuais primeiro, depois implemente um artefato de site responsivo que corresponda fielmente à direção da referência.',
  },
  'imagegen': {
    description:
      'Gere e edite imagens usando a Image API da OpenAI para assets de projeto — mockups de UI, ícones, ilustrações, social cards e referências visuais.',
    examplePrompt:
      'Gere e edite imagens usando a Image API da OpenAI para assets de projeto — mockups de UI, ícones, ilustrações, social cards e referências visuais.',
  },
  'imagegen-frontend-mobile': {
    description:
      'Skill de elite de geração de imagens para apps mobile, para criar conceitos e fluxos de telas premium e nativos do app. Projetada para produtos mobile iOS, Android e multiplataforma. Prioriza hierarquia limpa, texto confortavelmente legível, forte consistência entre múltiplas telas, paletas de cores controladas, direção criativa não genérica, superfícies texturizadas, composição liderada por imagem, iconografia personalizada de bom gosto e enquadramento limpo de mockup de celular. Por padrão, as telas devem ser exibidas dentro de um mockup sutil e premium de iPhone ou celular similar com um frame visível, enquanto o foco principal permanece no próprio conteúdo do app. Esta skill apenas gera imagens. Ela não escreve código.',
    examplePrompt:
      'Gere frames de conceito premium de app mobile para este briefing de produto, com hierarquia legível e nativa do app e um sistema visual consistente entre as telas.',
  },
  'imagegen-frontend-web': {
    description:
      'Skill de elite de direção de imagem de frontend para gerar referências de design de sites premium e orientadas à conversão. REGRA CRÍTICA DE SAÍDA — gere UMA imagem horizontal separada PARA CADA seção. Uma landing page com 8 seções produz 8 imagens. Nunca comprima múltiplas seções em uma única imagem. Impõe variedade de composição (nem sempre texto à esquerda / imagem à direita), liberdade de imagem de fundo, CTAs variados, escalas de hero variadas (gigante / médio / mini minimalista), espinha conceitual narrativa, momentos de segunda leitura e uma única paleta consistente em todas as imagens. Otimizada para landing pages, sites de marketing e comps de produto que desenvolvedores ou modelos de codificação possam recriar com precisão.',
    examplePrompt:
      'Gere imagens de referência premium de site separadas para cada seção da landing page, mantendo uma paleta coerente e composição variada.',
  },
  'imagen': {
    description:
      'Gere imagens usando a API de geração de imagens do Google Gemini para mockups de UI, ícones, ilustrações e assets visuais.',
    examplePrompt:
      'Gere imagens usando a API de geração de imagens do Google Gemini para mockups de UI, ícones, ilustrações e assets visuais.',
  },
  'impeccable-design-polish': {
    description:
      'Skill de polimento de design de acompanhamento inspirada no Impeccable. Use depois que um artefato web ou HTML existir para auditar, criticar, polir, animar, reforçar e preparar a página para uma passagem ao vivo / de compartilhamento.',
    examplePrompt:
      'Use o impeccable-design-polish no artefato HTML atual: audite a hierarquia visual, remova os sinais de IA, refine o texto, adicione movimento contido e reforce problemas de responsividade/acessibilidade.',
  },
  'login-flow': {
    description:
      'Telas de login mobile e fluxo de autenticação',
    examplePrompt:
      'Telas de login mobile e fluxo de autenticação',
  },
  'marketing-psychology': {
    description:
      'Aplique princípios psicológicos e ciência comportamental ao texto e ao design. Útil para refinar ganchos, enquadramento e apresentação de preços.',
    examplePrompt:
      'Aplique princípios psicológicos e ciência comportamental ao texto e ao design.',
  },
  'minimalist-ui': {
    description:
      'Interfaces limpas em estilo editorial. Paleta monocromática quente, contraste tipográfico, grids bento planos, tons pastéis suaves. Sem gradientes, sem sombras pesadas.',
    examplePrompt:
      'Projete uma interface de produto editorial minimalista com cor monocromática quente, tipografia nítida, estrutura plana e sem excessos decorativos.',
  },
  'minimax-docx': {
    description:
      'Criação e edição profissional de documentos DOCX usando o OpenXML SDK. Útil para relatórios com identidade de marca, propostas polidas e autoria baseada em templates.',
    examplePrompt:
      'Criação e edição profissional de documentos DOCX usando o OpenXML SDK.',
  },
  'minimax-pdf': {
    description:
      'Gere, preencha e reformate PDFs com um sistema de design baseado em tokens e 15 estilos de capa. Útil para PDFs com identidade de marca, e-guides e relatórios.',
    examplePrompt:
      'Gere, preencha e reformate PDFs com um sistema de design baseado em tokens e 15 estilos de capa.',
  },
  'mockup-device-3d': {
    description:
      'Vitrine estática em estilo 3D de iPhone e MacBook com HTML real embutido nas telas, refração de lente de vidro e composição de turntable de 360 graus.',
    examplePrompt:
      'Use o template Device 3D Showcase para transformar meu conteúdo em uma vitrine estática em estilo 3D de iPhone e MacBook com HTML real embutido nas telas. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'nanobanana-ppt': {
    description:
      'Geração de PPT com IA, com análise de documentos e imagens estilizadas via a stack NanoBanana. Combina geração de imagens com saída estruturada de deck.',
    examplePrompt:
      'Geração de PPT com IA, com análise de documentos e imagens estilizadas via a stack NanoBanana.',
  },
  'full-output-enforcement': {
    description:
      'Substitui o comportamento padrão de truncamento do LLM. Força a geração completa de código, proíbe padrões de placeholder e lida de forma limpa com divisões por limite de tokens. Aplique a qualquer tarefa que exija saída exaustiva e integral.',
    examplePrompt:
      'Produza a implementação completa do artefato solicitado, sem comentários de placeholder, sem seções omitidas e com instruções de divisão limpas apenas se o tamanho da saída exigir.',
  },
  'paywall-upgrade-cro': {
    description:
      'Projete e otimize telas de upgrade, paywalls e modais de upsell. Útil para design de conversão de SaaS e experimentos em páginas de preços.',
    examplePrompt:
      'Projete e otimize telas de upgrade, paywalls e modais de upsell.',
  },
  'pdf': {
    description:
      'Extraia texto, crie PDFs e trabalhe com formulários. Útil para press releases, one-pagers com identidade de marca e entregáveis de design prontos para impressão.',
    examplePrompt:
      'Extraia texto, crie PDFs e trabalhe com formulários.',
  },
  'pixelbin-media': {
    description:
      'Gere e edite imagens e vídeos com um portfólio de mais de 85 APIs e crie páginas de site visualmente atraentes via Pixelbin.',
    examplePrompt:
      'Gere e edite imagens e vídeos com um portfólio de mais de 85 APIs e crie páginas de site visualmente atraentes via Pixelbin.',
  },
  'plan-design-review': {
    description:
      'Revisão de Designer Sênior: avalia cada dimensão do design de 0 a 10, explica como é um 10 e sinaliza indícios de AI Slop. Útil como um gate antes de fazer merge de trabalho de UI.',
    examplePrompt:
      'Revisão de Designer Sênior: avalia cada dimensão do design de 0 a 10, explica como é um 10 e sinaliza indícios de AI Slop.',
  },
  'platform-design': {
    description:
      'Mais de 300 regras de design do Apple HIG, Material Design 3 e WCAG 2.2 para apps multiplataforma. Útil ao lançar um único design no iOS, Android e na web.',
    examplePrompt:
      'Mais de 300 regras de design do Apple HIG, Material Design 3 e WCAG 2.2 para apps multiplataforma.',
  },
  'poster-hero': {
    description:
      'Pôster vertical ou imagem de compartilhamento no estilo Moments com forte impacto visual.',
    examplePrompt:
      'Use o template de Pôster de Marketing para transformar meu conteúdo em um pôster vertical ou imagem de compartilhamento no estilo Moments com forte impacto visual. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'ppt-keynote': {
    description:
      'Slides com qualidade Apple Keynote, um card por tela, com navegação esquerda/direita pelo teclado.',
    examplePrompt:
      'Use o template de Slides no estilo Keynote para transformar meu conteúdo em slides com qualidade Apple Keynote, com um card por tela e navegação esquerda/direita pelo teclado. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'pptx': {
    description:
      'Leia, gere e ajuste slides, layouts e templates do PowerPoint. Útil para apresentações executivas, material de treinamento e revisões de produto.',
    examplePrompt:
      'Leia, gere e ajuste slides, layouts e templates do PowerPoint.',
  },
  'pptx-generator': {
    description:
      'Crie e edite apresentações do PowerPoint do zero com PptxGenJS — o pipeline de apresentações testado em produção da MiniMax.',
    examplePrompt:
      'Crie e edite apresentações do PowerPoint do zero com PptxGenJS — o pipeline de apresentações testado em produção da MiniMax.',
  },
  'pptx-html-fidelity-audit': {
    description:
      'Audite uma exportação do python-pptx em relação à apresentação HTML de origem, identifique desvios de layout/conteúdo (estouro de rodapé, conteúdo cortado, itálico/em ausente, estilização perdida, espaçamento fora de ritmo) e reexporte com disciplina rígida de layout de trilho de rodapé + fluxo de cursor. Use esta skill sempre que o usuário tiver um .pptx gerado a partir de uma apresentação de slides HTML e pedir para comparar/auditar/verificar/corrigir a exportação — incluindo frases como "comparar ppt com html", "auditoria de fidelidade", "corrigir o pptx", "o ppt está cortado", "sobreposição de rodapé", "itálico ausente no pptx", "reexportar a apresentação", "pptx-html-fidelity-audit" ou qualquer caso em que um ciclo python-pptx → HTML precise de verificação ou reparo. Acione também quando o usuário mostrar um deck.html e um deck.pptx lado a lado e estiver depurando diferenças visuais.',
    examplePrompt:
      'Audite uma exportação do python-pptx em relação à apresentação HTML de origem, identifique desvios de layout/conteúdo (estouro de rodapé, conteúdo cortado, itálico/em ausente, estilização perdida, espaçamento fora de ritmo) e reexporte com disciplina rígida de layout de trilho de rodapé + fluxo de cursor.',
  },
  'pr-feedback-quality-gate': {
    description:
      'Acompanhe com segurança o feedback de pull requests, resolva comentários de revisão ou conflitos de merge, valide correções e use uma revisão cruzada somente leitura antes de fazer commit ou push de mudanças complementares.',
    examplePrompt:
      'Acompanhe com segurança o feedback de pull requests, resolva comentários de revisão ou conflitos de merge, valide correções e use uma revisão cruzada somente leitura antes de fazer commit ou push de mudanças complementares.',
  },
  'redesign-existing-projects': {
    description:
      'Eleva sites e apps existentes a uma qualidade premium. Audita o design atual, identifica padrões genéricos de IA e aplica padrões de design de alto nível sem quebrar a funcionalidade. Funciona com qualquer framework CSS ou CSS puro.',
    examplePrompt:
      'Audite primeiro a UI existente, depois redesenhe-a para uma qualidade premium sem quebrar a funcionalidade, preservando a estrutura útil do produto.',
  },
  'reference-design-contract': {
    description:
      'Transforme gostos vagos, capturas de tela, URLs, anotações de produto ou referências do tipo "faça parecer com isso"\nem um DESIGN.md fundamentado mais um handoff de implementação. Use-o\nantes de protótipos, apresentações, redesigns ou trabalho de remix de imagens quando o usuário precisar\nde uma direção visual reutilizável em vez de um prompt pontual.',
    examplePrompt:
      'Crie um contrato de design de referência para um app de anotações de desenvolvedor. A direção deve transmitir um clima editorial, calmo, tátil e sério, mas sem copiar nenhum produto específico. Produza o DESIGN.md e um handoff de implementação.',
  },
  'release-notes-one-pager': {
    description:
      'Notas de versão em HTML de uma página com destaques, Adicionado, Corrigido, Mudanças que quebram compatibilidade,\nProblemas conhecidos e Nota de atualização. Escreve seções explícitas no estilo "Nenhum"\nsempre que o usuário não fornecer detalhes.',
    examplePrompt:
      'Escreva as notas de versão para a v2.3.1 com Adicionado, Corrigido, Mudanças que quebram compatibilidade, Problemas conhecidos e uma Nota de atualização.',
  },
  'remotion': {
    description:
      'Criação programática de vídeos com React. Útil para explainers com identidade de marca, cortes para redes sociais, conversão de dashboards em vídeo e motion graphics reproduzíveis.',
    examplePrompt:
      'Criação programática de vídeos com React.',
  },
  'replicate': {
    description:
      'Descubra, compare e execute modelos de IA usando a API da Replicate. Ótima opção para pipelines de geração de imagem, áudio e vídeo que trocam de modelo com frequência.',
    examplePrompt:
      'Descubra, compare e execute modelos de IA usando a API da Replicate.',
  },
  'research-decision-room': {
    description:
      'Transforme anotações bagunçadas de pesquisa com usuários, entrevistas, tickets de suporte, pesquisas e contexto\nde produto em uma sala de decisão embasada em evidências: um único artefato HTML com um\nregistro de evidências, mapa de temas, mapa de calor de confiança, matriz de oportunidades, memorando\nde decisão e fila de experimentos. Use quando as equipes precisarem passar de sinais\nqualitativos para decisões de produto ou design sem fabricar certezas.',
    examplePrompt:
      'Sintetize 8 anotações de entrevistas, 24 tickets de suporte e métricas recentes de ativação em uma sala de decisão de pesquisa sobre se um app de gestão de projetos deveria adicionar um checklist de onboarding ou dicas contextuais inline.',
  },
  'resume-modern': {
    description:
      'Currículo minimalista moderno, em uma única página A4, pronto para impressão ou exportação em PDF.',
    examplePrompt:
      'Use o template de Currículo Moderno para transformar meu conteúdo em um currículo moderno e minimalista de uma única página A4, pronto para impressão ou exportação em PDF. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'screenshot': {
    description:
      'Capture a área de trabalho, janelas de apps ou regiões de pixels em diferentes plataformas de SO. Útil para capturas de tela de marketing, revisões de design e relatórios de bugs.',
    examplePrompt:
      'Capture a área de trabalho, janelas de apps ou regiões de pixels em diferentes plataformas de SO.',
  },
  'screenshots-marketing': {
    description:
      'Gere capturas de tela de marketing com Playwright. Útil para imagens hero de landing pages, capturas de tela da App Store e recursos visuais de changelog.',
    examplePrompt:
      'Gere capturas de tela de marketing com Playwright.',
  },
  'shadcn-ui': {
    description:
      'Crie componentes de UI com shadcn/ui. Combina com o loop de design Stitch para entregar componentes estruturados e acessíveis rapidamente.',
    examplePrompt:
      'Crie componentes de UI com shadcn/ui.',
  },
  'shader-dev': {
    description:
      'Técnicas de shader GLSL para ray marching, simulação de fluidos, sistemas de partículas e geração procedural. Útil para recursos visuais hero e quadros de movimento.',
    examplePrompt:
      'Técnicas de shader GLSL para ray marching, simulação de fluidos, sistemas de partículas e geração procedural.',
  },
  'slack-gif-creator': {
    description:
      'Crie GIFs animados otimizados para o Slack, com validadores para restrições de tamanho e primitivas de animação combináveis.',
    examplePrompt:
      'Crie GIFs animados otimizados para o Slack, com validadores para restrições de tamanho e primitivas de animação combináveis.',
  },
  'slides': {
    description:
      'Crie e edite apresentações .pptx com PptxGenJS. Útil para apresentações de vendas, briefings de kickoff e demonstrações de design system.',
    examplePrompt:
      'Crie e edite apresentações .pptx com PptxGenJS.',
  },
  'social-reddit-card': {
    description:
      'Card realista de post do Reddit com barra de votos e contagem de comentários, ideal para sobreposições em vídeo ou compartilhamento de stories.',
    examplePrompt:
      'Use o template Reddit Post Card para transformar meu conteúdo em um card realista de post do Reddit com barra de votos e contagem de comentários para uma sobreposição em vídeo ou compartilhamento de story. Preserve a identidade visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'social-spotify-card': {
    description:
      'Card no estilo Spotify Now Playing com capa do álbum, barra de progresso e controles de reprodução, ideal para sobreposições em vídeo ou páginas pessoais.',
    examplePrompt:
      'Use o template Spotify Now-Playing Card para transformar meu conteúdo em um card no estilo Spotify Now Playing com capa do álbum, barra de progresso e controles de reprodução para uma sobreposição em vídeo ou página pessoal. Preserve a identidade visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'social-x-post-card': {
    description:
      'Card realista de post do X com métricas de engajamento (curtidas, reposts, visualizações), ideal para sobreposições em vídeo ou cards de imagem compartilháveis.',
    examplePrompt:
      'Use o template X / Twitter Post Card para transformar meu conteúdo em um card realista de post do X com métricas de engajamento para uma sobreposição em vídeo ou card de imagem compartilhável. Preserve a identidade visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de placeholder.',
  },
  'high-end-visual-design': {
    description:
      'Ensina a IA a projetar como uma agência de alto nível. Define exatamente as fontes, espaçamentos, sombras, estruturas de cards e animações que fazem um site parecer sofisticado. Bloqueia todos os padrões comuns que fazem os designs de IA parecerem baratos ou genéricos.',
    examplePrompt:
      'Crie uma landing page sofisticada e tranquila com tipografia refinada, contraste suave, espaçamento premium, profundidade sutil e movimento contido.',
  },
  'sora': {
    description:
      'Gere, remixe e gerencie clipes de vídeo curtos através da API Sora da OpenAI. Útil para tomadas cinematográficas, b-roll e iteração rápida de vídeos conceituais.',
    examplePrompt:
      'Gere, remixe e gerencie clipes de vídeo curtos através da API Sora da OpenAI.',
  },
  'speech': {
    description:
      'Gere áudio falado a partir de texto usando a API da OpenAI com vozes integradas. Útil para explicativos narrados, áudio de palestras e faixas rápidas de locução.',
    examplePrompt:
      'Gere áudio falado a partir de texto usando a API da OpenAI com vozes integradas.',
  },
  'stitch-loop': {
    description:
      'Loop iterativo de feedback de design para código. Ciclo de crítica → ajuste → entrega para aprimorar a fidelidade visual entre o briefing e a UI construída.',
    examplePrompt:
      'Loop iterativo de feedback de design para código.',
  },
  'stitch-design-taste': {
    description:
      'Skill de Design System Semântico para o Google Stitch. Gera arquivos DESIGN.md amigáveis para agentes que impõem padrões de UI premium e anti-genéricos — tipografia rigorosa, cores calibradas, layouts assimétricos, micromovimento perpétuo e desempenho acelerado por hardware.',
    examplePrompt:
      'Gere um DESIGN.md amigável para agentes para este produto, com padrões de UI premium e anti-genéricos, tipografia, cor, layout, movimento e orientação de prompts.',
  },
  'swiftui-design': {
    description:
      'Skill de 前端设计 SwiftUI — regras anti AI-slop, consultor de direção de design, protocolo de assets de marca e revisão de cinco dimensões. Funciona com Claude Code, Cursor, Codex e OpenCode.',
    examplePrompt:
      'Skill de 前端设计 SwiftUI — regras anti AI-slop, consultor de direção de design, protocolo de assets de marca e revisão de cinco dimensões.',
  },
  'swiss-creative-mode-template': {
    description:
      'Skill de template de apresentação em modo criativo inspirado no estilo suíço, com tipografia editorial ousada,\ncards geométricos de alto contraste, navegação interativa entre slides,\nalternância de temas, sobreposições de hotspots e coreografia de paletas em um único artefato\nHTML. Use quando os usuários pedirem uma landing em estilo de apresentação premium,\num visual de deck suíço/brutalista ou uma página de lançamento criativa com interações ricas.',
    examplePrompt:
      'Skill de template de apresentação em modo criativo inspirado no estilo suíço, com tipografia editorial ousada, cards geométricos de alto contraste, navegação interativa entre slides, alternância de temas, sobreposições de hotspots e coreografia de paletas em um único artefato HTML.',
  },
  'swiss-user-research-video-template': {
    description:
      'Template de narrativa de pesquisa com usuários em estilo suíço, com estética editorial de papel acolhedor.\nUse quando os usuários pedirem um deck de pesquisa premium ou um artefato ao vivo centrado em história, com\ntipografia minimalista, layout de alta clareza, movimento sutil, detalhamentos em donut\ne navegação por teclado/clique entre os slides em um único arquivo HTML.',
    examplePrompt:
      'Crie um deck de síntese de pesquisa com usuários em estilo suíço, com tipografia minimalista premium, tom de papel acolhedor, um detalhamento de participantes em donut e interações editoriais sutis.',
  },
  'design-taste-frontend': {
    description:
      'Skill de frontend anti-slop para landing pages, portfólios e redesigns. O agente lê o briefing, infere a direção de design certa e entrega interfaces que não parecem feitas a partir de templates. Design systems reais quando aplicável, auditoria primeiro em redesigns, verificação pré-voo rigorosa.',
    examplePrompt:
      'Crie uma landing page premium que segue o design-taste-frontend: infira a leitura de design, ajuste os controles, evite padrões de AI-slop e gere um artefato HTML responsivo e polido.',
  },
  'design-taste-frontend-v1': {
    description:
      'A skill de taste v1 original, preservada para projetos que dependem de seu comportamento exato. O padrão atual é o `design-taste-frontend` (v2 experimental), que é uma reescrita substancial. Use este nome de instalação v1 apenas se você precisar de compatibilidade retroativa exata.',
    examplePrompt:
      'Crie uma página de marketing polida usando design-taste-frontend-v1, com tipografia forte, espaçamento, movimento e proteções anti-slop.',
  },
  'theme-factory': {
    description:
      'Aplique temas profissionais de fonte e cor a artefatos, incluindo slides, documentos, relatórios e landing pages em HTML. Inclui 10 temas predefinidos.',
    examplePrompt:
      'Aplique temas profissionais de fonte e cor a artefatos, incluindo slides, documentos, relatórios e landing pages em HTML.',
  },
  'threejs': {
    description:
      'Skills de Three.js para criar elementos 3D e experiências interativas no navegador — cenas, materiais, controles e pós-processamento.',
    examplePrompt:
      'Skills de Three.js para criar elementos 3D e experiências interativas no navegador — cenas, materiais, controles e pós-processamento.',
  },
  'ui-skills': {
    description:
      'Restrições opinativas e em constante evolução para orientar agentes na construção de interfaces. Útil para manter a coerência da saída entre várias pequenas peças de UI.',
    examplePrompt:
      'Restrições opinativas e em constante evolução para orientar agentes na construção de interfaces.',
  },
  'ui-ux-pro-max': {
    description:
      'Entrada UI/UX Pro Max somente de catálogo. Os templates upstream completos, os dados e o fluxo de busca não estão incluídos no Open Design.',
    examplePrompt:
      'Entrada UI/UX Pro Max somente de catálogo.',
  },
  'venice-audio-music': {
    description:
      'Endpoints de enfileiramento, recuperação e conclusão de geração de música via Venice.ai. Indicado para jingles, loops de fundo e trilhas de protótipo.',
    examplePrompt:
      'Endpoints de enfileiramento, recuperação e conclusão de geração de música via Venice.ai.',
  },
  'venice-audio-speech': {
    description:
      'Modelos, vozes, formatos e streaming de conversão de texto em fala via Venice.ai. Útil para narração, locução e vozes de agentes conversacionais.',
    examplePrompt:
      'Modelos, vozes, formatos e streaming de conversão de texto em fala via Venice.ai.',
  },
  'venice-image-edit': {
    description:
      'Edição de imagens, ampliação e remoção de fundo via API do Venice.ai.',
    examplePrompt:
      'Edição de imagens, ampliação e remoção de fundo via API do Venice.ai.',
  },
  'venice-image-generate': {
    description:
      'Endpoints de geração de imagens e estilos disponíveis via API do Venice.ai.',
    examplePrompt:
      'Endpoints de geração de imagens e estilos disponíveis via API do Venice.ai.',
  },
  'venice-video': {
    description:
      'Fluxos de geração de vídeo e transcrição via API do Venice.ai.',
    examplePrompt:
      'Fluxos de geração de vídeo e transcrição via API do Venice.ai.',
  },
  'vfx-text-cursor': {
    description:
      'Rastro de luz do cursor, raios cromáticos e flares direcionais para revelações de citações palavra por palavra em introduções de vídeo.',
    examplePrompt:
      'Use o template VFX Text Cursor para transformar meu conteúdo em uma revelação de citação para introdução de vídeo com rastros de luz do cursor, raios cromáticos e flares direcionais. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'video-downloader': {
    description:
      'Baixe vídeos do YouTube e de outras plataformas para visualização offline, edição ou arquivamento, com suporte a vários formatos e opções de qualidade.',
    examplePrompt:
      'Baixe vídeos do YouTube e de outras plataformas para visualização offline, edição ou arquivamento, com suporte a vários formatos e opções de qualidade.',
  },
  'video-hyperframes': {
    description:
      'Animação de quadros contínuos compatível com Hyperframes / Remotion, com suporte a reprodução automática.',
    examplePrompt:
      'Use o template Hyperframes Video para transformar meu conteúdo em uma animação de quadros contínuos compatível com Hyperframes / Remotion, com suporte a reprodução automática. Preserve a assinatura visual do template, use conteúdo e dados reais e evite lorem ipsum ou imagens de espaço reservado.',
  },
  'web-artifacts-builder': {
    description:
      'Crie artefatos HTML complexos para o claude.ai com React e Tailwind. O fluxo de referência da Anthropic para entregar artefatos ricos e incorporáveis.',
    examplePrompt:
      'Crie artefatos HTML complexos para o claude.ai com React e Tailwind.',
  },
  'web-design-guidelines': {
    description:
      'Diretrizes e padrões de web design da equipe de engenharia da Vercel. Abrange layout, tipografia, cor, movimento e acessibilidade para a UI de produtos.',
    examplePrompt:
      'Diretrizes e padrões de web design da equipe de engenharia da Vercel.',
  },
  'weread-year-in-review-video-template': {
    description:
      'Template de vídeo HyperFrames inspirado no WeRead para relatórios anuais de leitura verticais,\npainéis pessoais de leitura, resumos de anotações de livros e histórias compartilháveis de retrospectiva\ndo ano. Use quando os usuários quiserem um relatório de leitura HTML-para-MP4 em 9:16 com textura de papel\nquente, tipografia editorial chinesa, metáforas de página de livro, destaques de dados\ne movimento determinístico.',
    examplePrompt:
      'Crie um vídeo de relatório anual de leitura HyperFrames no estilo WeRead em 9:16 com 12 cenas, textura de papel quente, transições de página de livro, estatísticas de leitura, anotações, palavras-chave e um cartão final de perfil de leitor.',
  },
  'wpds': {
    description:
      'WordPress Design System. Aplique os tokens de design, a tipografia e os padrões de componentes oficiais do WordPress a temas e sites.',
    examplePrompt:
      'WordPress Design System.',
  },
  'youtube-clipper': {
    description:
      'Geração e edição de clipes do YouTube com fluxos automatizados — extraia o vídeo de origem, recorte os melhores momentos, adicione legendas e exporte.',
    examplePrompt:
      'Geração e edição de clipes do YouTube com fluxos automatizados — extraia o vídeo de origem, recorte os melhores momentos, adicione legendas e exporte.',
  },
};

export const PT_BR_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': 'Interface conversacional com IA em primeiro lugar, com controles mínimos, resultados claros e fluxos de tarefas delegadas para fluxos de trabalho agênticos.',
  'airbnb': 'Marketplace de viagens. Detalhe em coral quente, orientado por fotografia, UI arredondada.',
  'airtable': 'Híbrido de planilha e banco de dados. Estética colorida, amigável e de dados estruturados.',
  'ant': 'Sistema de design estruturado e focado em empresas, enfatizando clareza, consistência e eficiência para aplicações web densas em dados.',
  'apple': 'Eletrônicos de consumo. Espaço em branco premium, SF Pro, imagens cinematográficas.',
  'application': 'Painel de aplicativo com estética em tema roxo, navegação em barra superior, layouts baseados em cards e fluxos de trabalho voltados para desenvolvedores.',
  'arc': '"O navegador que navega por você." Superfícies translúcidas, calor de gradiente, layout com barra lateral em primeiro plano.',
  'artistic': 'Estilo expressivo e de alto contraste, com tipografia criativa e escolhas de cores ousadas para interfaces visualmente marcantes.',
  'atelier-zero': 'Um sistema visual de qualidade de revista, orientado por colagem: tela de papel quente, imagens surreais\nde gesso e arquitetura, tipografia de display superdimensionada, traços finíssimos,\nmarcadores de seção em numerais romanos e pequenas anotações editoriais.\nInspirado na produção v',
  'bento': 'Layout em grade modular com blocos no estilo de cards, hierarquia clara, espaçamento suave e contraste visual sutil para interfaces organizadas e fáceis de escanear.',
  'binance': 'Exchange de criptomoedas. Destaque amarelo vibrante sobre monocromático, com a urgência de um pregão.',
  'bmw': 'Automotivo de luxo. Superfícies premium escuras, estética precisa da engenharia alemã.',
  'bmw-m': 'Submarca de performance no automobilismo. Superfícies de cockpit quase pretas, detalhes na tricolor BMW M, geometria de engenharia afiada.',
  'bold': 'Forte presença visual com tipografia de peso, cores de alto contraste e layouts imponentes.',
  'brutalism': 'Estética crua e anti-design inspirada na arquitetura de concreto, com elementos sem ornamentos, layouts impactantes e minimalismo funcional.',
  'bugatti': 'Marca de hipercarros. Tela em preto cinematográfico, austeridade monocromática, tipografia de display monumental.',
  'cafe': 'Interface aconchegante inspirada em cafeterias, com tons quentes, tipografia suave e layouts limpos para uma navegação relaxante.',
  'cal': 'Agendamento open-source. UI neutra e limpa, com a simplicidade voltada para desenvolvedores.',
  'canva': 'Plataforma de criação visual. Gradiente vívido roxo-azul, espaçamento generoso, geometria amigável.',
  'cisco': 'Marca de infraestrutura corporativa. Superfícies escuras que transmitem confiança, o Cisco Blue como sinal, clareza técnica.',
  'claude': 'Assistente de IA da Anthropic. Destaque em terracota quente, layout editorial limpo.',
  'clay': 'Agência criativa. Formas orgânicas, gradientes suaves, layout com direção de arte.',
  'claymorphism': 'Formas suaves e arredondadas, semelhantes a 3D, que imitam argila maleável, com elementos divertidos e fofos e superfícies coloridas.',
  'clean': 'Design focado na simplicidade, com bastante espaço em branco, tipografia legível e uma paleta de cores limitada para reduzir a poluição visual.',
  'clickhouse': 'Banco de dados de analytics rápido. Com destaque em amarelo, no estilo de documentação técnica.',
  'cohere': 'Plataforma de IA corporativa. Gradientes vibrantes, estética de dashboard rico em dados.',
  'coinbase': 'Exchange de criptomoedas. Identidade azul e limpa, focada em confiança, com ar institucional.',
  'colorful': 'Paletas e gradientes vibrantes e de alto contraste para experiências de usuário envolventes, memoráveis e modernas.',
  'composio': 'Plataforma de integração de ferramentas. Tema escuro moderno com ícones de integração coloridos.',
  'contemporary': 'Design minimalista da era atual, com grades bento, suporte a modo escuro e layouts acessíveis de alta performance.',
  'corporate': 'Design profissional e alinhado à marca, com grades estruturadas, layouts minimalistas e padrões corporativos consistentes.',
  'cosmic': 'Estética futurista de ficção científica, com temas escuros, detalhes em neon vibrantes e elementos espaciais imersivos.',
  'creative': 'Design divertido e baseado em personagens, com tipografia expressiva e gráficos marcantes para landing pages e projetos criativos.',
  'cursor': 'Editor de código AI-first. Interface escura e elegante, com detalhes em gradiente.',
  'dashboard': 'Estética de plataforma em nuvem com tema escuro, grades modulares, painéis com efeito de vidro e forte hierarquia de dados para dashboards de produtividade.',
  'default': 'Um padrão limpo e orientado a produto para ferramentas B2B, dashboards e páginas utilitárias.',
  'discord': 'Plataforma de voz / chat. Blurple profundo, superfícies dark-first, momentos de destaque divertidos.',
  'dithered': 'Técnica de renderização com padrão de pontos que simula tonalidades com uma paleta limitada, para visuais nostálgicos, retrô e de alto contraste.',
  'doodle': 'Estilo de esboço feito à mão, com rabiscos, fontes manuscritas e linhas imperfeitas para uma sensação divertida e informal.',
  'dramatic': 'Design teatral e de alto contraste, com layouts marcantes, visuais imersivos e composições não convencionais que prendem a atenção.',
  'duolingo': 'Plataforma de aprendizado de idiomas. Verde-coruja vibrante, sombras robustas, alegria gamificada.',
  'editorial': 'Layout editorial inspirado em revistas, com tipografia serifada refinada, grades estruturadas e experiências de leitura elegantes.',
  'elegant': 'Estética graciosa e refinada, com tipografia delicada, paletas minimalistas e layouts polidos que transmitem sofisticação.',
  'elevenlabs': 'Plataforma de voz com IA. UI escura e cinematográfica, estética de forma de onda de áudio.',
  'energetic': 'Estilo dinâmico e vibrante, com bordas grossas, formas geométricas, cores de alto contraste e tipografia expressiva que transmite movimento e vitalidade.',
  'enterprise': 'Design corporativo limpo e de alto contraste para fluxos de trabalho orientados a dados, com padrões intuitivos de arrastar e soltar e layouts estruturados.',
  'expo': 'Plataforma React Native. Tema escuro, espaçamento de letras reduzido, com foco em código.',
  'expressive': 'Design vibrante e cheio de personalidade, com cores marcantes, gráficos divertidos e layouts dinâmicos que equilibram criatividade e estrutura.',
  'fantasy': 'Estética de fantasia inspirada em games, com visuais marcantes e premium, paletas de cores ricas e elementos temáticos imersivos.',
  'ferrari': 'Automotivo de luxo. Editorial em claro-escuro, detalhes no Ferrari Red, preto cinematográfico.',
  'figma': 'Ferramenta de design colaborativo. Multicolorida e vibrante, divertida e ao mesmo tempo profissional.',
  'flat': 'Estilo minimalista bidimensional com cores vibrantes, tipografia limpa e sem efeitos 3D, para interfaces rápidas e fáceis de usar.',
  'framer': 'Construtor de sites. Preto e azul marcantes, com foco em movimento e design.',
  'friendly': 'Design acessível e intuitivo, com elementos arredondados, amplo espaço em branco e paletas de cores em tons pastel suaves.',
  'futuristic': 'Design voltado ao futuro, com tipografia de inspiração tecnológica, layouts modernos e uma estética elegante e movida pela inovação.',
  'github': 'Plataforma com foco em código. Densidade funcional, precisão azul sobre branco, fundamentos do Primer.',
  'glassmorphism': 'Efeito de vidro fosco com camadas translúcidas, desfoque sutil e bordas luminosas para profundidade e elegância moderna.',
  'gradient': 'Transições de cor suaves e superfícies ricas em gradientes para interfaces modernas e divertidas com profundidade visual.',
  'hashicorp': 'Automação de infraestrutura. Limpeza corporativa, preto e branco.',
  'hud': 'Head-up display de caça / helicóptero. Verde fosforescente sobre quase preto, sobreposições de dados em maiúsculas, geometria angular. Zero ambiguidade em alta velocidade e altitude.',
  'huggingface': 'Hub da comunidade de ML. Detalhe em amarelo ensolarado, identidade monoespaçada, alegre e densa.',
  'ibm': 'Tecnologia corporativa. Carbon design system, paleta azul estruturada.',
  'intercom': 'Mensagens para clientes. Paleta de azul amigável, padrões de UI conversacionais.',
  'kami': 'Sistema editorial em papel: tela de pergaminho quente, detalhe em azul-tinta, hierarquia liderada por serifas. Feito para currículos, one-pagers, white papers, portfólios, apresentações de slides — qualquer coisa que deva parecer impressão de alta qualidade em vez de UI. Multilíngue por de',
  'kraken': 'Trading de cripto. UI escura com detalhes em roxo, dashboards densos em dados.',
  'lamborghini': 'Marca de supercarros. Superfícies em preto verdadeiro, detalhes dourados, tipografia maiúscula dramática.',
  'levels': 'Design focado em conversão que remove atritos e guia os usuários à ação por meio de clareza, confiança e velocidade.',
  'linear-app': 'Gestão de projetos. Ultraminimalista, precisa, com detalhe em roxo.',
  'lingo': 'Design divertido e minimalista com cores vivas, formas arredondadas, bordas 3D táteis e ilustrações amigáveis para interfaces acessíveis.',
  'loom': 'Vídeo assíncrono Loom. Roxo como cor primária, superfícies amigáveis, layout com foco em vídeo. Limpo e profissional sem ser corporativo.',
  'lovable': 'Construtor full-stack com IA. Gradientes divertidos, estética amigável para desenvolvedores.',
  'luxury': 'Estética escura sofisticada com títulos marcantes, paleta monocromática e sensação premium para experiências de marcas de luxo.',
  'mastercard': 'Rede de pagamentos global. Tela em creme quente, formas de pílula orbitais, calor editorial.',
  'material': 'Material Design do Google com superfícies em camadas, temas dinâmicos, movimento integrado e padrões responsivos multiplataforma.',
  'meta': 'Loja de varejo de tecnologia. Foco em fotografia, superfícies binárias claro/escuro, CTAs em Meta Blue.',
  'minimal': 'Design enxuto que enfatiza espaço em branco, tipografia limpa e cores comedidas para o máximo de clareza e foco.',
  'minimax': 'Provedor de modelos de IA. Interface escura marcante com detalhes neon.',
  'mintlify': 'Plataforma de documentação. Limpa, com detalhes em verde, otimizada para leitura.',
  'miro': 'Colaboração visual. Detalhe em amarelo vivo, estética de tela infinita.',
  'mission-control': 'Monitoramento de missões espaciais/aeroespaciais. Centro de comando escuro, telemetria âmbar, precisão monoespaçada. Clareza funcional acima de tudo.',
  'mistral-ai': 'Provedor de LLM de pesos abertos. Minimalismo de engenharia francesa, em tons de roxo.',
  'modern': 'Estilo editorial contemporâneo com tipografia serifada, paletas minimalistas e layouts limpos para produtos digitais refinados.',
  'mongodb': 'Banco de dados de documentos. Identidade visual com folha verde, foco em documentação para desenvolvedores.',
  'mono': 'Design movido a monoespaçada e inspirado em matrix, com elementos de alto contraste, densidade compacta e uma estética hacker-chic.',
  'neobrutalism': 'Releitura moderna do brutalismo com bordas marcantes, cores de destaque vívidas e layouts crus e de alto contraste sobre superfícies quentes.',
  'neon': 'Efeitos de brilho neon elétrico com combinações de cores de alto contraste para interfaces marcantes e que chamam a atenção.',
  'neumorphism': 'Elementos de UI suaves e extrudados, com sombras internas e externas sobre superfícies monocromáticas, para um visual tátil e embutido.',
  'nike': 'Varejo esportivo. UI monocromática, tipografia maiúscula enorme, fotografia full-bleed.',
  'notion': 'Espaço de trabalho tudo-em-um. Minimalismo quente, títulos serifados, superfícies suaves.',
  'nvidia': 'Computação em GPU. Energia verde-preto, estética de potência técnica.',
  'ollama': 'Execute LLMs localmente. Foco no terminal, simplicidade monocromática.',
  'openai': 'Sistema calmo e quase monocromático ancorado em um verde-azulado profundo e quase preto, com amplo espaço em branco e tipografia editorial.',
  'opencode-ai': 'Plataforma de programação com IA. Tema escuro centrado no desenvolvedor.',
  'pacman': 'Design inspirado em fliperamas retrô com fontes em pixel, bordas pontilhadas, cores vivas de alto contraste e estética de jogos de 8 bits.',
  'paper': 'Design com textura de papel, inspirado na impressão, com cores mínimas, tipografia serifada/sem serifa limpa e qualidades de superfície táteis.',
  'perplexity': 'Mecanismo de busca de IA conversacional. Tela bem escura, tipografia nítida, único toque de violeta, hierarquia de informação densa.',
  'perspective': 'Design de profundidade espacial com vistas isométricas, pontos de fuga e elementos em camadas que guiam a atenção por meio de um realismo semelhante ao 3D.',
  'pinterest': 'Descoberta visual. Toque de vermelho, grade em mosaico, foco na imagem.',
  'playstation': 'Varejo de consoles de games. Layout de canal de três superfícies, tipografia de exibição de autoridade discreta, hover em escala ciano.',
  'posthog': 'Análise de produto. Branding lúdico de ouriço, interface escura amigável ao desenvolvedor.',
  'premium': 'Estética premium inspirada na Apple com espaçamento preciso, tipografia moderna e uma linguagem visual refinada e polida.',
  'professional': 'Design polido e pronto para negócios com tipografia moderna, layouts estruturados e uma identidade visual que transmite confiança.',
  'publication': 'Linguagem visual inspirada na impressão para livros, revistas e relatórios, com grades editoriais e tipografia expressiva.',
  'raycast': 'Lançador de produtividade. Cromo escuro elegante, toques de gradiente vibrantes.',
  'refined': 'Estilo minimalista moderno e cuidadosamente selecionado, com tipografia serifada elegante e paletas sóbrias e sofisticadas.',
  'renault': 'Automotivo francês. Gradientes vibrantes de aurora, tipografia NouvelR, energia marcante.',
  'replicate': 'Execute modelos de ML via API. Tela branca e limpa, foco no código.',
  'resend': 'API de e-mail. Tema escuro minimalista, toques em monospace.',
  'retro': 'Design nostálgico com tipografia de inspiração vintage, paletas retrô de alto contraste e elementos visuais que remetem ao passado.',
  'revolut': 'Banco digital. Interface escura elegante, cartões com gradiente, precisão fintech.',
  'runwayml': 'Geração de vídeo com IA. Interface escura cinematográfica, layout rico em mídia.',
  'sanity': 'CMS headless. Toque de vermelho, layout editorial com foco no conteúdo.',
  'sentry': 'Monitoramento de erros. Painel escuro, denso em dados, toque rosa-roxo.',
  'shadcn': 'Design inspirado no Shadcn/ui com componentes mínimos e limpos, paleta monocromática e padrões utility-first.',
  'shopify': 'Plataforma de e-commerce. Cinematográfica e escura por padrão, toque de verde neon, tipografia ultraleve.',
  'simple': 'Design direto e sem firulas, com tipografia limpa, cores neutras e layouts intuitivos que não atrapalham.',
  'skeumorphism': 'Imitação do mundo real com superfícies texturizadas, efeitos 3D e metáforas físicas familiares para interfaces digitais intuitivas.',
  'slack': 'Plataforma de comunicação corporativa. Berinjela como cor primária, paleta de logo multicolorida, superfícies claras com barra lateral escura, acolhedora e acessível.',
  'sleek': 'Estética minimalista moderna com linhas limpas, paleta de cores intencional, interações sutis e espaçamento consistente.',
  'spacex': 'Tecnologia espacial. Preto e branco austeros, imagens em tela cheia, futurista.',
  'spacious': 'Amplo espaço em branco, padding consistente e layouts baseados em grade para interfaces limpas, legíveis e que respiram.',
  'spotify': 'Streaming de música. Verde vibrante sobre fundo escuro, tipografia marcante, foco na capa do álbum.',
  'starbucks': 'Marca global de varejo de café. Sistema de verde em quatro níveis, tela em creme acolhedor, botões totalmente arredondados.',
  'storytelling': 'Design orientado por narrativa que usa visuais, texto e interação para conduzir os usuários por jornadas envolventes e emocionalmente marcantes.',
  'stripe': 'Infraestrutura de pagamentos. Gradientes roxos característicos, elegância em peso 300.',
  'supabase': 'Alternativa open source ao Firebase. Tema esmeralda escuro, foco no código.',
  'superhuman': 'Cliente de e-mail rápido. Interface escura premium, foco no teclado, brilho roxo.',
  'tesla': 'Automotivo elétrico. Subtração radical, fotografia em viewport completo, interface quase inexistente.',
  'tetris': 'Design inspirado no clássico jogo de blocos, com cores lúdicas, fontes de exibição marcantes e layouts compactos e cheios de energia.',
  'theverge': 'Mídia editorial de tecnologia. Toques de verde-menta ácido e ultravioleta, exibição Manuka, blocos de história estilo flyer de rave.',
  'together-ai': 'Infraestrutura de IA de código aberto. Design técnico, em estilo blueprint.',
  'totality-festival': 'Um sistema escuro glassmórfico cósmico-premium que captura o espanto visceral de um eclipse solar — superfícies de obsidiana, destaques âmbar de "corona" e acentos atmosféricos ciano.',
  'trading-terminal': 'Terminal de trading financeiro no estilo Bloomberg. Apenas modo escuro, denso em dados, sinais de compra/venda em ciano/coral. Tudo legível num relance a dois metros de distância.',
  'uber': 'Plataforma de mobilidade. Preto e branco marcante, tipografia compacta, energia urbana.',
  'urdu': 'Experiências digitais com foco no urdu, com suporte nativo a RTL, tipografia Nastaliq e harmonia bilíngue.',
  'vercel': 'Deploy de frontend. Precisão em preto e branco, fonte Geist.',
  'vibrant': 'Design vivo e colorido com tipografia ousada e divertida, acentos quentes e energia visual dinâmica.',
  'vintage': 'Nostalgia dos anos 1950 a 1990 com toques esqueuomórficos, texturas granuladas, paletas de cores retrô e tipografia em estilo pixel.',
  'vodafone': 'Marca global de telecom. Display monumental em maiúsculas, faixas de capítulo em Vodafone Red.',
  'voltagent': 'Framework de agentes de IA. Tela preto-vazio, acento esmeralda, nativo de terminal.',
  'warm-editorial': 'Uma estética de revista liderada por serifa. Acento terracota sobre papel off-white quente —\nbom para conteúdos longos, editoriais e páginas de marketing focadas em marca.',
  'warp': 'Terminal moderno. Interface escura no estilo IDE, UI de comandos baseada em blocos.',
  'webex': 'Plataforma de colaboração. Tipografia com momentum, sistema de ações em azul, espectro de acentos multiusuário.',
  'webflow': 'Construtor visual de web. Estética de site de marketing refinada, com acento azul.',
  'wechat': 'Linguagem visual de marca para Mini Programs do WeChat, contas oficiais e extensões de ecossistema aberto.',
  'wired': 'Revista de tecnologia. Densidade de jornal em branco-papel, display serifado personalizado, kickers mono, links em azul-tinta.',
  'wise': 'Transferência de dinheiro. Acento verde brilhante, amigável e claro.',
  'x-ai': 'Laboratório de IA de Elon Musk. Monocromático austero, minimalismo futurista.',
  'xiaohongshu': 'Plataforma social de UGC de lifestyle. Vermelho de marca singular, raio generoso, foco no conteúdo.',
  'zapier': 'Plataforma de automação. Laranja quente, amigável e guiada por ilustrações.',
};

export const PT_BR_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'IA e LLM',
  'Automotive': 'Automotivo',
  'Backend & Data': 'Backend e Dados',
  'Bold & Expressive': 'Ousado e Expressivo',
  'Creative & Artistic': 'Criativo e Artístico',
  'Design & Creative': 'Design e Criação',
  'Developer Tools': 'Ferramentas para Desenvolvedores',
  'E-Commerce & Retail': 'E-Commerce e Varejo',
  'Editorial & Print': 'Editorial e Impresso',
  'Editorial / Personal / Publication': 'Editorial / Pessoal / Publicação',
  'Editorial · Studio': 'Editorial · Estúdio',
  'Fintech & Crypto': 'Fintech e Cripto',
  'Layout & Structure': 'Layout e Estrutura',
  'Media & Consumer': 'Mídia e Consumidor',
  'Modern & Minimal': 'Moderno e Minimalista',
  'Morphism & Effects': 'Morfismo e Efeitos',
  'Productivity & SaaS': 'Produtividade e SaaS',
  'Professional & Corporate': 'Profissional e Corporativo',
  'Retro & Nostalgic': 'Retrô e Nostálgico',
  'Social & Messaging': 'Social e Mensagens',
  'Starter': 'Inicial',
  'Themed & Unique': 'Temático e Único',
};

export const PT_BR_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': 'Publicidade',
  'Anime': 'Anime',
  'Anime / Manga': 'Anime / Mangá',
  'App / Web Design': 'Design de App / Web',
  'Branding': 'Branding',
  'Cinematic': 'Cinematográfico',
  'Data': 'Dados',
  'Game UI': 'UI de Jogo',
  'General': 'Geral',
  'Illustration': 'Ilustração',
  'Infographic': 'Infográfico',
  'Live Artifact': 'Artefato Interativo',
  'Marketing': 'Marketing',
  'Motion Graphics': 'Motion Graphics',
  'Product': 'Produto',
  'Profile / Avatar': 'Perfil / Avatar',
  'Short Form': 'Formato Curto',
  'Social / Meme': 'Social / Meme',
  'Social Media Post': 'Post de Rede Social',
  'Travel': 'Viagem',
  'VFX / Fantasy': 'VFX / Fantasia',
  'VFX / HTML-in-Canvas': 'VFX / HTML-no-Canvas',
};

export const PT_BR_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3d',
  '3d-render': 'renderização-3d',
  'action': 'ação',
  'ancient-china': 'china-antiga',
  'anime': 'anime',
  'app-showcase': 'vitrine-de-app',
  'archery': 'arco-e-flecha',
  'arpg': 'arpg',
  'audio-reactive': 'reativo-ao-áudio',
  'boss-fight': 'luta-de-chefão',
  'brand': 'marca',
  'branding': 'branding',
  'captions': 'legendas',
  'cavalry': 'cavalaria',
  'chart': 'gráfico',
  'childlike': 'infantil',
  'choreography': 'coreografia',
  'cinematic': 'cinematográfico',
  'cinematic-romance': 'romance-cinematográfico',
  'combat': 'combate',
  'combo': 'combo',
  'companion-to-image': 'companheiro-para-imagem',
  'counter': 'contador',
  'crayon': 'giz-de-cera',
  'cyberpunk': 'cyberpunk',
  'dance': 'dança',
  'dashboard': 'painel',
  'data': 'dados',
  'data-viz': 'visualização-de-dados',
  'destruction': 'destruição',
  'displacement': 'deslocamento',
  'editorial': 'editorial',
  'elden-ring': 'elden-ring',
  'endcard': 'cartão-final',
  'escort': 'escolta',
  'escort-mission': 'missão-de-escolta',
  'fantasy': 'fantasia',
  'fashion': 'moda',
  'fighting-game': 'jogo-de-luta',
  'food': 'comida',
  'game-cinematic': 'cinemática-de-jogo',
  'game-ui': 'interface-de-jogo',
  'grid-sheet': 'planilha-em-grade',
  'guanyu': 'guanyu',
  'hand-drawn': 'desenhado-à-mão',
  'hero': 'destaque',
  'html-in-canvas': 'html-no-canvas',
  'hud': 'hud',
  'hud-safe': 'hud-seguro',
  'hype': 'empolgação',
  'hyperframes': 'hyperframes',
  'idol': 'ídolo',
  'illustration': 'ilustração',
  'image-to-image': 'imagem-para-imagem',
  'infographic': 'infográfico',
  'iphone': 'iphone',
  'japanese': 'japonês',
  'karaoke': 'karaokê',
  'key-visual': 'visual-principal',
  'keynote': 'keynote',
  'kinetic-typography': 'tipografia-cinética',
  'linear-style': 'estilo-linear',
  'liquid': 'líquido',
  'liquid-glass': 'vidro-líquido',
  'live-artifact': 'artefato-ao-vivo',
  'logo': 'logo',
  'lyubu': 'lyubu',
  'macbook': 'macbook',
  'magnetic': 'magnético',
  'map': 'mapa',
  'marketing': 'marketing',
  'minimal': 'minimalista',
  'mmo': 'mmo',
  'mobile': 'mobile',
  'money': 'dinheiro',
  'mounted-combat': 'combate-montado',
  'nature': 'natureza',
  'open-world': 'mundo-aberto',
  'otaku-dance': 'dança-otaku',
  'outro': 'encerramento',
  'overlay': 'sobreposição',
  'particles': 'partículas',
  'pipeline': 'pipeline',
  'portal': 'portal',
  'portrait': 'retrato',
  'pose-reference': 'referência-de-pose',
  'product': 'produto',
  'product-demo': 'demo-de-produto',
  'product-promo': 'promoção-de-produto',
  'rework': 'retrabalho',
  'route': 'rota',
  'saas': 'saas',
  'sequence': 'sequência',
  'shader': 'shader',
  'shatter': 'estilhaçar',
  'sizzle': 'sizzle',
  'social': 'social',
  'storyboard': 'storyboard',
  'street-fighter': 'street-fighter',
  'style-transfer': 'style-transfer',
  'tekken': 'tekken',
  'text': 'texto',
  'three-kingdoms': 'three-kingdoms',
  'tiktok': 'tiktok',
  'title-card': 'title-card',
  'transform': 'transformar',
  'travel': 'viagem',
  'tts': 'tts',
  'typography': 'tipografia',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': 'vertical',
  'video-reference': 'video-reference',
  'vs-screen': 'vs-screen',
  'webgl': 'webgl',
  'website-to-video': 'website-to-video',
  'wuxia': 'wuxia',
  'zhaoyun': 'zhaoyun',
};

export const PT_BR_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: 'Infográfico de Evolução em Escadaria de Pedra 3D',
    summary:
      'Transforma uma linha do tempo evolutiva plana em um infográfico realista de escadaria de pedra 3D com renders detalhados de organismos e painéis laterais estruturados.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Ilustração de Batalha de Artes Marciais em Estilo Anime',
    summary:
      'Gera uma ilustração anime dinâmica e de grande impacto de duas personagens femininas lutando em um dojo tradicional com efeitos de energia elemental.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'Mockup de UI de Live Stream de E-commerce',
    summary:
      'Gera uma interface realista de live stream de rede social sobreposta a um retrato, com mensagens de chat personalizáveis, pop-ups de presentes e um cartão de compra de produto.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: 'Captura de Tela de Jogo - Jogo de Luta Anime: Captain Ryuuga vs Kaze Renshin',
    summary:
      'Um key visual de jogo de luta / captura de tela de combate no estilo da arte de introdução de Street Fighter 6 ou Tekken 8. Dois guerreiros masculinos em estilo anime se enfrentam no centro de um dramático pátio de templo chinês à noite — um pirata sem camisa com chapéu de palha e uma aura de fogo laranja-avermelhada quente à esquerda, e um artista marcial de cabelo espetado em um gi laranja carregando uma enorme esfera de energia de relâmpago azul crepitante à direita. Acompanha um HUD completo de jogo de luta (barras de vida duplas, cronômetro de round, painéis de retrato P1/P2 com lutadores nomeados e emblemas, contadores de combo e medidores máximos por lado). A gradação de cores dividida entre laranja-quente e azul-frio combina com a convenção de lutadores rivais do gênero. Ajustado para gpt-image-2 em 16:9.',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Captura de Tela de Jogo - ARPG dos Três Reinos: Guan Yu Matando Yan Liang',
    summary:
      'Uma captura de tela de action-RPG da icônica cena dos Três Reinos em que Guan Yu cavalga seu cavalo de guerra Lebre Vermelha por um campo de batalha sob chuva torrencial e investe contra o general inimigo Yan Liang. Renderizado no estilo cinematográfico fotorrealista de Black Myth: Wukong, Unreal Engine 5, câmera de acompanhamento em terceira pessoa atrás e à esquerda do herói montado. Um HUD completo de batalha contra chefe (retrato, minimapa com densos pontos de inimigos, barra de habilidades com prompt de finalização, barra de HP flutuante do chefe sobre o general inimigo) transforma a cena em um momento de combate de ARPG AAA. Ajustado para gpt-image-2 em 16:9.',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Captura de Tela de Jogo - ARPG dos Três Reinos: O Tiro com Arco de Lü Bu em Yuanmen',
    summary:
      'Uma captura de tela de action-RPG da famosa cena dos Três Reinos em que Lü Bu acerta uma alabarda distante no portão do acampamento para impedir uma batalha. Renderizado no estilo cinematográfico fotorrealista de Black Myth: Wukong, Unreal Engine 5 Nanite/Lumen, câmera de jogabilidade em terceira pessoa sobre o ombro. Uma sobreposição completa de HUD do jogo (barras de HP + qi, minimapa, barra de habilidades, marcador de alvo travado com leitura de distância até a alabarda distante) faz com que pareça uma captura real de ARPG de nova geração, e não uma cutscene. Ajustado para gpt-image-2 em 16:9.',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Captura de Tela de Jogo - ARPG dos Três Reinos: A Fuga de Zhao Yun com o Bebê em Changbanpo',
    summary:
      'Uma captura de tela de action-RPG da lendária cena dos Três Reinos em que Zhao Yun segura o bebê Liu Chan em um braço e abre caminho lutando através das linhas inimigas com uma lança no outro em Changbanpo. Renderizado no estilo cinematográfico fotorrealista de Black Myth: Wukong combinado com Elden Ring, Unreal Engine 5 com Nanite completo, ray-tracing Lumen e raios de luz volumétricos. O núcleo emocional — um braço protegendo o bebê enrolado, um braço lutando pela vida — é reforçado por uma sobreposição completa de HUD que inclui uma barra de proteção de ESCOLTA dedicada ao bebê, um contador de combos e pop-ups de números de dano no ar sobre os inimigos arremessados. Ajustado para gpt-image-2 em 16:9.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'UI de Jogo - HUD de MMO de Mundo Aberto da China Antiga',
    summary:
      'Gera um mockup de captura de tela de HUD de jogo para um MMO AAA de mundo aberto da China antiga, no estilo cinematográfico fotorrealista de Black Myth: Wukong. Uma bela protagonista espadachim ancora o centro do quadro em uma cena de antigo santuário em uma montanha enevoada, cercada por um HUD completo de MMO: retrato de personagem no canto superior esquerdo com barras de HP/MP/vigor e ícones de buff, barra de habilidades na parte inferior central com ícones de habilidades em caligrafia chinesa, minimapa no canto superior direito com marcadores de missão, painel rastreador de missões à direita, janela de chat rolável no canto inferior esquerdo, placas de nome de NPCs flutuantes no espaço do mundo e ponto de exclamação de missão. Renderizado como uma captura de tela realista de monitor, 16:9, adequado para pitch decks, key art no estilo gamescom e teasers de jogos no Xiaohongshu/bilibili.',
  },
  'illustrated-city-food-map': {
    title: 'Mapa Gastronômico Ilustrado da Cidade',
    summary:
      'Gera um mapa turístico desenhado à mão, em estilo aquarela, com especialidades gastronômicas locais numeradas, pontos de referência e uma legenda.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Ilustração - Releitura de Desenho Infantil a Giz de Cera',
    summary:
      'Um prompt de transferência de estilo que transforma qualquer imagem de referência (foto de produto, captura de tela, retrato, mockup de UI) em uma ilustração feita à mão com giz de cera, com a aparência de ter sido desenhada por uma criança de 10 anos. Substitui a paleta original por cores vivas e divertidas de giz de cera sobre papel branco e limpo, e adiciona detalhes infantis e lúdicos — castelos, doces, estrelas, nuvens, arco-íris — para reforçar a atmosfera inocente de livro de histórias. Funciona como uma edição image-to-image no GPT-image-2 (exige o envio de uma imagem de referência junto com o prompt); ideal para capturas de tela de sites, key art de marca, fotos de produto e retratos.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: 'Infográfico - Análise da Coreografia de Dança Otaku (Gokuraku Jodo, 16 Painéis)',
    summary:
      'Um único pôster vertical 2:3 composto como uma grade 4×4 de 16 painéis quadrados conectados, formando um quadro completo de análise da coreografia da famosa música de dança otaku japonesa 極楽浄土 (Gokuraku Jodo). Cada painel mostra a mesma garota idol anime fofa e semirrealista (twin-tails rosa, uniforme de school-idol com gola marinheira) executando uma pose característica da dança, de corpo inteiro, sobre um fundo rosa pastel com uma pequena faixa de legenda em japonês na parte inferior e um círculo numerado no canto superior esquerdo. Projetado explicitamente como uma folha de REFERÊNCIA DE POSES para geração de vídeo por IA — cada silhueta é nítida e inequívoca, sem linhas de movimento ou poluição visual ao fundo. Otimizado para gpt-image-2, proporção 2:3. Categoria: Infográfico.',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Slide Explicativo de Momotaro em Estilo Híbrido',
    summary:
      'Um prompt que combina a estética simples e acolhedora das ilustrações da Irasutoya com a alta densidade de informação característica dos slides do governo japonês.',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Dashboard de Equipe no Estilo Notion (Artefato Vivo)',
    summary:
      'Mockup de dashboard de equipe nativo do Notion em uma única tela — grade de KPIs, sparkline de 7 dias, feed de atividades e tabela de tarefas vinculada a banco de dados. Complemento visual da skill de artefato vivo; combine com ela para execuções atualizáveis / baseadas em conectores, ou use de forma independente como um mockup estático.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Perfil / Avatar - Garota Anime para Foto Cinematográfica',
    summary:
      'Este prompt transforma uma ilustração de referência de personagem em um retrato realista de interior vintage com tons quentes, preservando a roupa, a pose e o gato originais.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Perfil / Avatar - Grade de Ensaio Fotográfico de Moda Casual',
    summary:
      'Um prompt JSON estruturado para uma colagem de 4 fotos de um ensaio fotográfico de moda casual com parâmetros detalhados de sujeito e iluminação.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Perfil / Avatar - Retrato Cinematográfico de Homem do Sul da Ásia com Abutres',
    summary:
      'Um retrato cinematográfico detalhado de um jovem homem do Sul da Ásia em um cenário sombrio de fantasia dark, cercado por abutres e corvos.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Perfil / Avatar - Retrato Anime Cyberpunk com Texto Neon no Rosto',
    summary:
      'Um retrato anime elegante e impregnado de neon, ideal para pôsteres, arte para redes sociais ou visuais de branding futurista.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Perfil / Avatar - Elegante Garota de Fantasia em Jardim Violeta',
    summary:
      'Este prompt gera um retrato de fantasia em estilo anime, refinado, de uma mulher elegante com cabelo brilhante e penteado, roupas ornamentadas em violeta e preto, e um cenário de jardim mágico repleto de flores, ideal para personagens',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Perfil / Avatar - Retrato de Fantasia Etéreo de Cabelos Azuis',
    summary:
      'Este prompt gera um retrato de personagem de fantasia em estilo anime, suave e luminoso, ideal para criar key art vertical elegante ou ilustrações de personagens com cabelos esvoaçantes e uma atmosfera primaveril e onírica.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Perfil / Avatar - Mulher Glamorosa em Retrato de Preto',
    summary:
      'Este prompt gera um retrato fotorrealista de estilo luxuoso de uma mulher elegante com uma roupa preta decotada, ideal para imagens de editorial de moda ou de beleza.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Perfil / Avatar - Prompts de Textura para Selfie Hiper-Realista',
    summary:
      'Trechos de prompt detalhados para gerar texturas de pele realistas e um enquadramento autêntico de selfie de celular, com foco em poros visíveis e iluminação natural.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Perfil / Avatar - Retrato de Maga de Fantasia em Lavanda',
    summary:
      'Este prompt gera um retrato de fantasia em estilo anime, refinado, de uma elegante princesa maga com cabelo loiro brilhante, flores roxas e um traje ornamentado de cristal, ideal para arte de personagem ou ilustrações mágicas',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Perfil / Avatar - Retrato de Estúdio Monocromático',
    summary:
      'Um prompt de fotografia comercial de alto padrão para um retrato monocromático com um característico fundo dividido e iluminação dramática de estúdio.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Perfil / Avatar - Restauração de Foto Antiga para Retrato DSLR',
    summary:
      'Este prompt restaura uma foto vintage danificada de uma família de 4 pessoas, transformando-a em um retrato realista, limpo, colorizado e em alta resolução, para reparo e aprimoramento de fotos.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Perfil / Avatar - Retrato de Mulher Poética no Jardim',
    summary:
      'Este prompt gera um retrato realista de estilo editorial de uma jovem amante dos livros em um jardim ensolarado, ideal para fotografia de lifestyle, branding literário ou imagens de personagem elegantes.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Perfil / Avatar - Wallpaper de Retrato de Identidade Profissional',
    summary:
      'Gera um wallpaper premium em alta resolução com um sujeito em traje profissional, atividades relacionadas à carreira e tipografia.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Perfil / Avatar - Selfie de IA Realisticamente Imperfeita',
    summary:
      'Um prompt criativo usado com o GPT Image 2 para gerar uma selfie \'falha\' que parece um instantâneo acidental e de baixa qualidade tirado de smartphone.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Perfil / Avatar - Retrato Assinado em Marcador sobre Shikishi',
    summary:
      'Isto gera um retrato animado em estilo marcador assinado sobre uma placa quadrada de shikishi, útil para autógrafos de fan-art, posts de ilustração comemorativa e visuais personalizados de agradecimento.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Perfil / Avatar - Retrato de Imperatriz Coelho da Neve',
    summary:
      'Um prompt de retrato de fantasia realista para gerar uma mulher majestosa com tema de coelho, vestindo um hanfu de inverno ornamentado, em pé em um cenário de templo nas montanhas nevadas.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Perfil / Avatar - Retrato em Hanfu com Máscara de Coelho da Neve',
    summary:
      'Este prompt gera um retrato cinematográfico de fantasia de inverno de uma mulher mascarada em um Hanfu branco com tema de coelho, ideal para arte de personagem elegante e imagens atmosféricas de demonstração de IA.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Perfil / Avatar - Retrato Hanfu de Coelho na Neve',
    summary:
      'Este prompt gera um retrato de beleza de fantasia ultradetalhado de uma mulher com orelhas de coelho em hanfu bordado, ideal para arte de personagem elegante, design de figurino ou demonstrações de retratos cinematográficos de IA.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Perfil / Avatar - Retrato do Espírito do Coelho na Neve',
    summary:
      'Este prompt gera um retrato sereno de fantasia de uma mulher anônima com orelhas de coelho no inverno, ideal para arte de personagem atmosférica e ilustrações de perfil estilizadas.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Perfil / Avatar - Retrato Hanfu da Dinastia Song',
    summary:
      'Um prompt otimizado para gerar um retrato detalhado e realista de uma beldade em Hanfu tradicional da Dinastia Song dentro de um pátio antigo.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Post de Rede Social - Pôster Teaser de Look de Loja Pokémon em Estilo Anime',
    summary:
      'Este prompt gera um pôster de anúncio de moda anime em tons pastel suaves apresentando uma garota de rosto desfocado em um vestido azul dentro de uma loja Pokémon, ideal para teasers de revelação de looks e visuais promocionais de personagens.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Post de Rede Social - Cena de Elevador Cinematográfica',
    summary:
      'Um prompt para gerar uma cena cinematográfica e atmosférica de uma mulher dentro de um elevador metálico com iluminação e reflexos realistas.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Post de Rede Social - Garota Elfa Confusa em Mesa Pastel',
    summary:
      'Este prompt gera uma ilustração anime em tons pastel suaves de uma garota elfa digitando no computador em um espaço de trabalho kawaii e aconchegante, ideal para posts em redes sociais, papéis de parede ou arte com tema de streamer.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Post de Rede Social - Fotografia de Moda Editorial',
    summary:
      'Um prompt atmosférico e focado em moda para uma cena de estúdio minimalista com iluminação suave e tons quentes.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Post de Rede Social - Colagem de Editorial de Moda',
    summary:
      'Um prompt de colagem fotográfica 2x2 altamente detalhado para fotos de editorial de moda, focado em estilização consistente, iluminação específica e traços faciais de uma foto de referência.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Post de Rede Social - Pôster de Anúncio de Transferência do PSG',
    summary:
      'Um pôster de contratação de futebol ousado e profissional para anunciar a transferência de um jogador para o Paris Saint-Germain em redes sociais ou gráficos promocionais esportivos.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Post de Rede Social - Storyboard de Dança de Garota Sensacional (8 Tomadas)',
    summary:
      'Um conjunto completo de prompts de storyboard de 8 tomadas para gerar uma sequência de dança coerente quadro a quadro de um personagem estiloso. Inclui tokens de estilo global compartilhados, um prompt negativo reutilizável e oito prompts por tomada (pose de abertura, rebolado de quadril, onda corporal, torção de cintura no drop da batida, balanço lateral de quadril, jogada de cabelo, pose de poder, pose final). Ajustado para modelos do nível GPT-Image-2: vocabulário conciso, sem frases sensíveis, enquadramento e linguagem de iluminação consistentes entre as tomadas para que os quadros pareçam uma coreografia contínua.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Post de Rede Social - Capa de Revista de Cultura Retrô do Dia de Showa',
    summary:
      'Uma página de destaque de feriado japonês em estilo editorial caloroso combinando arte de personagem anime, imagens nostálgicas de ruas da era Showa e layout informativo no estilo de revista para promoções culturais sazonais.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Post de Rede Social - Geração de Look de Moda para Redes Sociais',
    summary:
      'Um prompt para gerar uma semana de recomendações de looks no estilo de blogueira de moda com base em um perfil de personagem, completo com rótulos e preços dos itens.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Post de Rede Social - Prompt de Colagem de Fotos de Viagem',
    summary:
      'Um prompt detalhado para criar uma colagem nostálgica de 12 quadros de fotos de viagem no estilo de smartphone retratando uma jornada solitária.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Post de Rede Social - Esboço Vintage de Pintor de Letreiros',
    summary:
      'Gera um esboço desenhado à mão com marcador no papel, com detalhes realistas como linhas de grafite e sangramento de tinta, perfeito para estilos de letras vintage.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'Pôster de Vista Explodida de Headset de VR',
    summary:
      'Gera um diagrama de vista explodida de alta tecnologia de um headset de VR com chamadas detalhadas de componentes e texto promocional.',
  },
  '3d-animated-boy-building-lego': {
    title: 'Menino em Animação 3D Montando Lego',
    summary:
      'Um prompt de vídeo com várias tomadas em estilo de animação 3D descrevendo um menino montando peças de Lego cuidadosamente em um quarto, com efeitos de time-lapse.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Glow-Up de Uma Década de Refinamento',
    summary:
      'Um prompt de transformação para o Seedance 2.0 mostrando a transição de um homem de um ambiente casual de 2016 para um estilo de vida luxuoso em Dubai em 2026, mantendo a consistência do personagem.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Resgate do Antigo Dragão Guardião',
    summary:
      'Um prompt cinematográfico detalhado com várias tomadas para uma história sobre uma garota em uma vila chuvosa salva por um dragão emergente, focado em VFX e som atmosférico.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Vídeo FPV de Antigo Reino Indiano',
    summary:
      'Um prompt cinematográfico acelerado em estilo de drone FPV retratando um místico reino indiano com templos e selvas.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Prompt de transferência de animação e rastreamento de câmera',
    summary:
      'Um prompt técnico para o Seedance 2.0 que aplica uma referência de movimento específica a um personagem, mantendo o rastreamento de câmera fixo.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Dança de Transformação de Figurino Sincronizada ao Ritmo',
    summary:
      'Um prompt para o Seedance 2.0 que coordena a dança de um personagem seguindo frames de breakdown enquanto realiza uma troca de figurino sincronizada ao ritmo.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Sequência de Motion Graphics de Apresentação de Personagem',
    summary:
      'Um prompt complexo e de múltiplas etapas de motion graphics para apresentar uma equipe de personagens com sobreposições de UI e transições específicas, projetado para o modelo Seedance 2.0.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Sequência Cinematográfica de Comemoração de Aniversário',
    summary:
      'Um prompt de vídeo multitomada altamente detalhado para uma sequência de aniversário, com foco na consistência do personagem e na narrativa emocional.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Interação e Voo Cinematográfico com Dragão',
    summary:
      'Um prompt detalhado em estilo storyboard para um vídeo que apresenta a interação emocional de uma mulher com um dragão, seguida por uma sequência cinematográfica de voo.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Dança de Mãos Cinematográfica de Mulher do Leste Asiático',
    summary:
      'Um prompt de vídeo cinematográfico multitomada altamente detalhado para uma dança de mãos estilizada, com instruções cronometradas para movimento de câmera e ações do personagem.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Close-up Cinematográfico de Rosto Emocional',
    summary:
      'Um prompt técnico altamente detalhado para o Seedance 2.0 com foco em texturas de pele realistas e uma série de transições faciais emocionais complexas.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Exploração Cinematográfica de Bióloga Marinha',
    summary:
      'Um prompt detalhado de vídeo cinematográfico para uma cena subaquática que apresenta uma bióloga marinha descobrindo um antigo naufrágio em um recife de coral.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Podcast Musical Cinematográfico e Técnica de Guitarra',
    summary:
      'Um prompt cinematográfico avançado para gerar um vídeo de podcast musical em 4K, com foco específico em técnica de guitarra, pinch harmonics e estética de estúdio.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Guia Cinematográfico de Navegação de Rotas',
    summary:
      'Um prompt estruturado de múltiplas cenas projetado para o Seedance criar um vídeo consistente de navegação a pé, apresentando um personagem guia turístico recorrente e transições suaves entre locais do mundo real.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Sequência Cinematográfica de Corrida de Rua para Seedance 2',
    summary:
      'Um prompt detalhado e multitomada projetado para o Seedance 2 gerar uma sequência cinematográfica de corrida de rua à noite, com foco na concentração intensa do motorista, trabalho dinâmico de câmera e aceleração explosiva, estrut',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Sequência cinematográfica de luta de vampiros em beco',
    summary:
      'Um prompt de ação abrangente para uma cena de curta-metragem envolvendo movimentos dinâmicos de câmera e combate de alta velocidade em um beco iluminado por neon.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Sequência Cinematográfica de Ficção Científica Crimson Horizon',
    summary:
      'Uma sequência cinematográfica de vídeo abrangente de 9 tomadas para um filme de ficção científica intitulado \'Crimson Horizon\', detalhando tudo, desde o lançamento de um foguete até um sinistro encontro alienígena em Marte.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Roteiro de Trailer de Jogo Cyberpunk',
    summary:
      'Um prompt extenso de geração de vídeo para um trailer de jogo cyberpunk, detalhando o design de personagens, animações de UI e transições de ambiente de um vazio branco para uma favela.',
  },
  'forbidden-city-cat-satire': {
    title: 'Sátira do Gato da Cidade Proibida',
    summary:
      'Um prompt complexo de comédia sombria para o Seedance 2.0 que apresenta um gato laranja como funcionário público e uma hiena como imperador em um cenário satírico da dinastia Qing.',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Prompt de Vídeo de Fantasia Hollywood Haute Couture',
    summary:
      'Um prompt detalhado de geração de vídeo de múltiplas cenas para o Seedance 2.0, projetado para criar um filme de Fantasia Hollywood Haute Couture. O prompt especifica estilo, resolução (8K), motor de renderização (Unreal Engin',
  },
  'hunched-character-animation': {
    title: 'Animação de Personagem Curvado',
    summary:
      'Instrução para o Seedance 2 criar uma animação de caminhada no lugar para uma referência de personagem específica.',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas: Demo de Produto 3D iPhone + MacBook',
    summary:
      'Uma demo de produto de 15 segundos em que um iPhone 15 Pro Max e um MacBook Pro GLTF reais flutuam em um palco limpo com a UI real do app renderizando ao vivo em suas telas via drawElementImage. Reflexo de lente de vidro com efeito morphing + giro de 360°. Construído sobre o bloco de catálogo vfx-iphone-device.',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas: Revelação Cinematográfica de Texto com Cursor',
    summary:
      'Uma revelação dramática de texto de 8 segundos com brilho de cursor, raios de sombra cromática e iluminação direcional em um palco preto. Tipografia DOM real sob pós-processamento de shader ao vivo. Construído sobre o bloco de catálogo vfx-text-cursor.',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas: Encerramento com Estilhaçamento de Vidro',
    summary:
      'Um encerramento de 12 segundos com estilhaçamento de HTML — uma página de produto ou cartão de preços real permanece por um instante e então explode em fragmentos de vidro refratantes com desfoque de profundidade e dispersão cromática. Construído sobre o bloco de catálogo vfx-shatter. Combina como cartão final após uma composição mais longa.',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas: Hero com Fundo Líquido',
    summary:
      'Uma abertura de 12 segundos com conteúdo HTML flutuando sobre uma superfície líquida orgânica — plano subdividido com deslocamento de vértices, dinâmica de ondas em tempo real, DOM capturado posicionado por cima, nítido e legível. Construído sobre o bloco de catálogo vfx-liquid-background.',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas: Revelação de Landing com Liquid Glass',
    summary:
      'Uma revelação de 20 segundos em liquid-glass voronoi de uma landing page de produto real — o DOM é capturado ao vivo via drawElementImage, estilhaçado em células de vidro refratantes e depois assenta em uma tomada de abertura limpa. Construído sobre o bloco de catálogo vfx-liquid-glass.',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas: Visualização de Campo Magnético',
    summary:
      'Uma visualização de partículas de campo magnético de 15 segundos reagindo a um mapa de calor ou gráfico de DOM ao vivo — as partículas traçam linhas de campo que se curvam ao redor do HTML capturado, ideal para produtos de ML/dados. Construído sobre o bloco de catálogo vfx-magnetic.',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas: Dashboard com Revelação em Portal',
    summary:
      'Um portal dimensional de 10 segundos se abre sobre um dashboard de dados ao vivo — DOM capturado em tempo real, derramamento de luz volumétrica, partículas na borda do portal. Construído sobre o bloco de catálogo vfx-portal. Projetado para tomadas de abertura de dados no estilo keynote.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: Contador de Dinheiro Hype de $0 → $10K (9:16)',
    summary:
      'Um clipe hype vertical de 6 segundos em 1080×1920 no HyperFrames — contador estilo Apple de $0 → $10.000 com flash verde, partículas de explosão de dinheiro, ícone de pilha de notas, manchete de impacto. Construído sobre o bloco de catálogo `apple-money-count` do HyperFrames.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: Showcase de App de 12 Segundos — Três Celulares Flutuantes',
    summary:
      'Uma composição de showcase de app de 12 segundos em 16:9 — três telas de iPhone flutuantes pairam no espaço 3D, cada uma girando por vez para revelar um recurso diferente, rótulos de destaque sincronizados com a batida, encerramento com travamento do logotipo. Construído diretamente sobre o bloco de catálogo `app-showcase` do HyperFrames.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: Sizzle Reel de Marca de 30 Segundos',
    summary:
      'Um sizzle reel de 30 segundos em 16:9 no HyperFrames — cortes rápidos, tipografia cinética sincronizada com a batida, escala áudio-reativa nas palavras de destaque, transições com shader entre cinco cenas, cartão final com bloom do logotipo. Modelado no arquétipo aisoc-hype do kit estudantil.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: Promo de Produto SaaS de 30 Segundos (estilo Linear)',
    summary:
      'Uma composição de 30 segundos no HyperFrames modelada em filmes de produto no estilo Linear/ClickUp — revelações 3D da UI, tipografia cinética sincronizada com a batida, capturas de tela animadas da UI, cartão final com encerramento do logotipo. Construído a partir de blocos de catálogo do HF (ui-3d-reveal, app-showcase, logo-outro) mais transições com shader entre cenas.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: Encerramento Cinematográfico de Logotipo de 4 Segundos',
    summary:
      'Um encerramento de logotipo de 4 segundos em 16:9 — montagem peça por peça da marca nominativa com bloom, varredura de brilho sobre o travamento final, sobreposição suave de granulado, CTA em uma única linha. Construído sobre os blocos `logo-outro`, `shimmer-sweep` e `grain-overlay` do HyperFrames.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: Revelação Minimalista de Produto de 5 Segundos',
    summary:
      'Uma composição de 5 segundos no HyperFrames para uma revelação de produto de alto padrão — tela escura, um único acento quente, cartão-título com aproximação lenta, linha de impacto cinética, movimento contido. O agente renderiza MP4 a partir de HTML+GSAP via puppeteer; nenhuma filmagem de banco de imagens necessária.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: Pilha de Sobreposições Sociais 9:16 (X · Reddit · Spotify · Instagram)',
    summary:
      'Uma composição vertical de 15 segundos em 1080×1920 no HyperFrames que empilha quatro cartões sociais animados sobre um loop de face-cam — um post no X, uma reação no Reddit, um cartão de reprodução atual do Spotify e um CTA de seguir no Instagram ao final. Cada cartão é um bloco de catálogo do HyperFrames; a coreografia é o valor agregado.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: Talking-Head no TikTok 9:16 com Legendas Karaokê',
    summary:
      'Um short vertical de 1080×1920 no HyperFrames — talking-head narrado por TTS sobre um loop de face-cam, com legendas no estilo karaokê sincronizadas palavra por palavra, terço inferior animado e uma sobreposição de seguir no tiktok ao final. Espelha o arquétipo may-shorts-19 do kit estudantil do HyperFrames.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: Corrida de Gráfico de Barras Animado (estilo NYT)',
    summary:
      'Um infográfico de dados de 12 segundos em 16:9 — gráfico animado de barras + linha com revelação escalonada por categoria, manchete em serifa no estilo NYT, fonte em nota de rodapé, rótulos de valor cinéticos. Construído diretamente sobre o bloco de catálogo `data-chart` do HyperFrames.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: Mapa de Voo Estilo Apple (Origem → Destino)',
    summary:
      'Um mapa cinematográfico de rota de voo de 8 segundos em 16:9 — zoom de terreno realista, avião animado deslizando da origem ao destino por um trajeto curvo, cidades rotuladas, contador cinético de distância. Construído diretamente sobre o bloco de catálogo `nyc-paris-flight` do HyperFrames, reaproveitável para qualquer par de cidades.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: Pipeline de Site para Vídeo (Corte de Marketing de 15 Segundos)',
    summary:
      'Uma composição de 15 segundos em 16:9 no HyperFrames que captura um site ao vivo em três tamanhos de viewport e então anima entre eles com uma divisão radial cromática entre cenas. Espelha o arquétipo hyperframes-sizzle do kit estudantil, onde o site é o ativo de origem.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Adaptação Live-Action de Anime: Duelo de Respiração da Água vs. Respiração do Trovão',
    summary:
      'Um prompt altamente detalhado de 15 segundos para gerar uma adaptação live-action de um duelo no estilo anime, apresentando \'Respiração da Água\' (dragão de água azul) contra \'Respiração do Trovão\' (relâmpago dourado). O p',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Narrativa Cinematográfica de Supercarro de Luxo',
    summary:
      'Um prompt cinematográfico de múltiplas tomadas altamente detalhado para o Seedance 2.0 envolvendo um homem estiloso, Dobermans e um supercarro vintage em um cenário montanhoso enevoado.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Sequência de Storyboard de Academia Mágica',
    summary:
      'Um prompt detalhado no estilo storyboard para uma sequência cinematográfica retratando uma garota mágica em uma academia, abrangendo a chegada, a descoberta do poder e um duelo mágico.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Prompt de Vídeo de Curta-Metragem Reconfortante com Estética Rural Moderna',
    summary:
      'Um prompt detalhado de três tomadas para o Seedance 2.0 gerar um curta-metragem cinematográfico e reconfortante no estilo de Estética Rural Moderna. Ele especifica o estilo (Comercial Cinematográfico, 4K/8K, Macro Extremo, nat',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Animação Atmosférica de Flyer de Balada',
    summary:
      'Um prompt de animação sutil para o Seedance 2.0 dar vida aos elementos de fundo e iluminação mantendo o sujeito travado',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Estética de Filme de Wuxia Retrô de Hong Kong',
    summary:
      'Um prompt de vídeo complexo e dividido em várias partes que recria a estética dos filmes de Wuxia de Hong Kong dos anos 80 e 90, apresentando a transformação de um personagem de gato para humano com tomadas estilizadas.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: Curta-Metragem Cinematográfico de Romance Japonês de 15 Segundos',
    summary:
      'Um prompt multicena altamente detalhado de 15 segundos para o Seedance 2.0, projetado para gerar um curta-metragem cinematográfico e ultrarrealista de amor puro no ensino médio japonês. O prompt especifica o cenário (vazio',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: MV de Rapper de 80 Anos',
    summary:
      'Um prompt detalhado de 15 segundos para o Seedance 2.0 gerar um videoclipe musical (MV) de rap de rua na horizontal 16:9 estrelado por uma mulher de 80 anos. O prompt especifica o estilo (tons frios roxos/azuis de neon, exp',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Instrução de Sequência e Movimento para Vídeo de Artes Marciais',
    summary:
      'Um prompt de vídeo para o Seedance 2.0 que instrui o modelo a animar uma sequência baseada em uma folha de personagem, com foco em movimentos e passos específicos.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Sequência Mágica de Troca de Almas no Espelho',
    summary:
      'Um prompt de vídeo narrativo que descreve um evento mágico de troca de almas diante de um espelho, com instruções específicas de câmera e indicações emocionais para cada segmento.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Susto da Torradeira-Foguete',
    summary:
      'Um prompt para uma tomada em estilo de vídeo caseiro realista de um senhor idoso levando um susto com uma torradeira que dispara pão como um foguete.',
  },
  'traditional-dance-performance': {
    title: 'Apresentação de Dança Tradicional',
    summary:
      'Um prompt de vídeo abrangente para o Seedance 2.0 gerar uma graciosa dança tradicional baseada na coreografia e em imagens de referência de identidade.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Vídeo - ARPG dos Três Reinos - Guan Yu Mata Yan Liang (Seedance 2.0)',
    summary:
      'Uma sequência de ação cinematográfica in-engine de aproximadamente 10s que dá vida ao modelo de imagem complementar game-screenshot-three-kingdoms-guanyu-slaying-yanliang. Guan Yu (关羽) cavalga seu Lebre Vermelha diretamente para a linha de batalha inimiga, ergue a Lâmina Crescente do Dragão Verde e executa um único e limpo golpe contra o general adversário Yan Liang. Ajustado para o Seedance 2.0 — disciplina de câmera precisa, um golpe decisivo, física limpa de cavalo e lâmina, iluminação fotorrealista, absolutamente nenhum sangue em cena (o golpe é sugerido por um clarão dourado de qi, não por sangue). Projetado como o vídeo complementar direto do modelo de imagem correspondente, para que a imagem estática e o clipe possam ser entregues como um par. Imagem de referência: o modelo de captura de tela de Guan Yu matando Yan Liang.',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Vídeo - ARPG dos Três Reinos - Lyu Bu Arco e Flecha no Yuanmen (Seedance 2.0)',
    summary:
      'Uma sequência de ação cinematográfica in-engine de aproximadamente 10s que dá vida ao modelo de imagem complementar game-screenshot-three-kingdoms-lyubu-yuanmen-archery. Lyu Bu (吕布) está no centro de um acampamento militar empoeirado entre dois exércitos frente a frente, puxa um arco longo laqueado de vermelho, mantém o esticamento da corda e então dispara uma única flecha imbuída de qi com brilho dourado pelo campo em direção a uma alabarda distante fincada no chão. Ajustado para o Seedance 2.0 — disciplina de câmera precisa, um único momento decisivo, enquadramento nítido e seguro para HUD, física limpa de arco e flecha, vento + poeira + movimento de estandartes, e gradação de cores de captura de tela in-game. Projetado como o vídeo complementar direto do modelo de imagem correspondente, para que a imagem estática e o clipe possam ser entregues como um par. Imagem de referência: o modelo de captura de tela de Lyu Bu com arco e flecha no yuanmen.',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Vídeo - ARPG dos Três Reinos - Fuga de Zhao Yun com o Bebê (Seedance 2.0)',
    summary:
      'Uma sequência de ação cinematográfica in-engine de aproximadamente 12s que dá vida ao modelo de imagem complementar game-screenshot-three-kingdoms-zhaoyun-cradle-escape. Zhao Yun (赵云) cavalga seu cavalo de guerra através de um campo de batalha destruído de Changban, segurando o herdeiro bebê A Dou no braço esquerdo dobrado e empunhando sua lança com o direito, aparando um golpe que se aproxima com uma única ESQUIVA PERFEITA e saltando por cima de uma carruagem de guerra caída para abrir caminho. Ajustado para o Seedance 2.0 — disciplina de câmera precisa, um único momento contínuo, manejo crível da lança com um só braço, física limpa do cavalo e absolutamente nenhum dano visível ao bebê. Projetado como o vídeo complementar direto do modelo de imagem correspondente, para que a imagem estática e o clipe possam ser entregues como um par. Imagem de referência: o modelo de captura de tela da fuga de Zhao Yun com o bebê.',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Animação de Crocodilo Pirata em Estilo Disney Vintage',
    summary:
      'Um prompt narrativo multicena para uma animação clássica em estilo Disney vintage com um crocodilo pirata e pássaros piratas em um navio.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Coreografia de Dança K-pop Viral',
    summary:
      'Um prompt detalhado para o Seedance 2.0 animar um personagem executando uma dança com base em um storyboard de referência de 16 quadros.',
  },
  'wasteland-factory-chase': {
    title: 'Perseguição na Fábrica do Deserto Pós-Apocalíptico',
    summary:
      'Um prompt cinematográfico para uma cena de alta velocidade em um deserto pós-apocalíptico com uma fábrica industrial móvel sobre pernas e uma perseguição de moto rebelde.',
  },
};
