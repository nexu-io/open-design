import type { DeepPartial, CommunityCopy } from '../community-i18n';

const ptBr: DeepPartial<CommunityCopy> = {
  hub: {
    title: 'Comunidade — Open Design',
    desc: 'A comunidade Open Design: contribuidores que publicam em público, embaixadores que hospedam ateliês locais e moderadores que mantêm o Discord acolhedor.',
    heroTitle: 'O open design <em>ganha forma</em><br/>quando você o publica.',
    heroLead:
      'Open Design é construído por pessoas, em público. Skills, sistemas DESIGN.md, plugins, docs: cada commit é uma pincelada. Escolha uma porta abaixo e encontre a sua sala.',
    cardMetaH: 'Cunhado automaticamente no primeiro merge',
    cardMetaS: 'PNG · compartilhado no X',
    cardHeroAlt:
      'Cartão de honra de contribuidor do Open Design — @dev-kp-eloper, top 99,9%, nível Giotto',
    cards: [
      {
        ord: 'I',
        title: 'Contribuidores',
        sub: 'As mãos que <em>entregam</em> o trabalho.',
        body: 'Mantenedores, rankings semanais, o registro de todos os tempos e as issues abertas que você pode reivindicar hoje. Além do caminho sem código para quem não programa enviar sua primeira peça ao registro.',
      },
      {
        ord: 'II',
        title: 'Embaixadores',
        sub: 'A <em>voz</em> do Open Design na sua cidade.',
        body: 'Abra um ateliê local. Reúna os encontros, as demos, as críticas madrugada adentro. Com apoio de orçamento, materiais e um canal privado com o time central.',
      },
      {
        ord: 'III',
        title: 'Moderadores',
        sub: 'A sala onde os <em>contribuidores</em> se reúnem.',
        body: 'A linha de frente da era do agent-design. O Discord é onde se reúnem os designers AI-native mais afiados do mundo. Conheça quem mantém a sala acolhedora.',
      },
    ],
  },
  contributors: {
    title: 'Contribuidores — Open Design',
    desc: 'Contribua com o Open Design: mantenedores, rankings semanais e de todos os tempos, good first issues e um caminho sem código para publicar sua primeira peça.',
    heroTitle: 'As mãos que <em>entregam</em> o trabalho.',
    heroLead:
      'Open Design é construído por pessoas, em público. Skills, sistemas DESIGN.md, plugins, docs: cada commit é uma pincelada. Escolha uma issue, envie um PR e ganhe um cartão de honra único no instante em que seu código for aceito.',
    showcase: {
      kicker: 'Plugin em tudo',
      h2: 'Open Design como palco. <em>Seu trabalho</em> como o espetáculo.',
      intro:
        'O ateliê também é uma galeria. Ajudar você a fazer o trabalho é metade do endereço; garantir que a sala venha apreciá-lo é a outra. Cada peça que você publica não acaba num cofre, mas numa parede, onde o mundo pode encontrá-la.',
      tenets: [
        {
          h3: 'Qualquer coisa <em>pode virar plugin</em>.',
          body: 'Tudo o que o estúdio produz (conteúdo, um produto finalizado, um template, uma Skill, um fluxo de trabalho) pode ser dobrado de volta num plugin. O registro aceita qualquer formato; a porta não guarda porteiro algum.',
        },
        {
          h3: 'Sua peça de estreia, sua <em>iniciação</em>.',
          body: 'No dia em que sua primeira peça chega ao registro, seu nome se junta à parede. Não um crachá de visitante. Uma linha permanente na lista de contribuidores, ao lado de todos que chegaram antes.',
        },
        {
          h3: 'Uma vez dentro, <em>ela viaja</em>.',
          body: 'O registro em <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">open-design.ai/plugins</a> é apenas o limiar. Dali as peças mais fortes são levadas adiante: ao X, ao <span class="num">#showcase</span> do Discord, à newsletter, aos reels de vídeo. Cada passagem alarga a sala; o mundo conhece sua mão.',
        },
        {
          h3: 'Precisa de uma <em>primeira pincelada</em>?',
          body: 'Percorra o <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">registro de plugins</a>. As obras ali penduradas são a lenha para a sua. Tome emprestada a faísca e faça então a peça que só a sua mão poderia.',
        },
      ],
      pane: {
        kicker: 'A skill',
        h3: 'Deixe o <em>agente</em> publicar por você.',
        lede: 'Para criadores que prefeririam não tocar no código. Toda a contribuição vive numa única skill, falada em linguagem simples. O trabalho de pincel fica a cargo do agente.',
        copy: 'Copiar',
        copied: 'Copiado',
        steps: [
          {
            h4: 'Entregue a linha ao agente',
            body: 'Cole o comando acima no agente dentro do Open Design, ou naquele que você já mantém à mão: Claude Code, Codex, Cursor. Ele se instala sozinho.',
          },
          {
            h4: 'Desperte a skill',
            body: 'Digite <code>/od-contribute</code>, ou simplesmente peça ao agente para executar o que você acabou de instalar. Qualquer uma das frases abre a porta.',
          },
          {
            h4: 'Meio minuto até a galeria',
            body: 'O agente percorre o resto. Sua peça segue rumo ao repositório open source em cerca de trinta segundos; revisamos na primeira oportunidade e, no instante em que ela chega, a sala conhece sua mão.',
          },
        ],
      },
    },
    maintainers: {
      kicker: 'Conduzindo o navio',
      h2: 'Os <em>mantenedores</em>.',
      intro:
        'Os mantenedores protegem a direção e a qualidade do Open Design: revisam contribuições, mantêm o padrão coerente e abrem espaço para que mais contribuidores conquistem seu lugar no projeto.',
      role: 'Mantenedor',
      bios: {
        'Nagendhra-web':
          'Nagendhra traz o instinto de engenheiro de dados para a verdade em produção: encontrar a falha, medir o caso extremo e corrigi-lo direito. No Open Design, isso aparece no trabalho de pré-checagem de deploy, no reforço do empacotamento de assets e em correções para Windows que fazem o projeto parecer confiável quando os contribuidores publicam.',
        'Sid-Qin':
          'Sid é o engenheiro generalista com o olhar de designer para os detalhes: o tipo de mantenedor que percebe tanto o caminho quebrado da CLI quanto a affordance de interação torta. No Open Design, Sid mantém os fluxos de exportação, as ações de plugin, os shims de Windows, o tratamento de MIME e o encanamento do agente afiados o bastante para uma comunidade construir em cima.',
      },
    },
    allTime: {
      kicker: 'Sinal de todos os tempos',
      h2: 'Os contribuidores de <em>raízes profundas</em>.',
      intro:
        'Um registro de longa data de contribuidores talentosos que seguem transformando ideias, correções e ofício no padrão compartilhado do Open Design.',
      rankLabel: 'Contribuidor de todos os tempos',
      week: 'Histórico do repositório',
      quote:
        'A cauda longa importa: sistemas de design, correções de docs, exemplos e pequenos reparos são como uma linguagem de open design se torna confiável.',
      handleSuffix: '· sinal de contribuidor profundo',
      statCommits: 'Commits',
      statExternalRank: 'Posição externa',
      headContributor: 'Contribuidor',
      headCommits: 'Commits',
      headRank: 'Posição',
    },
    weekly: {
      kicker: 'O sinal desta semana',
      h2: 'Dez contribuidores liderando <em>esta semana</em>.',
      intro:
        'Um retrato de contribuidores afiados que estão fazendo merge de PRs, melhorando o produto e deixando o Open Design vivo.',
      rankLabel: 'Líder desta semana',
      week: 'Últimos 7 dias',
      handleSuffix: '· liderando esta semana',
      blurbTemplate:
        '{name} está ditando o ritmo esta semana com {prs} PRs aceitos e aquele tipo de ofício constante que mantém o Open Design em movimento.',
      statRank: 'Posição',
      statPrs: 'PRs · 7d',
      headContributor: 'Contribuidor',
      headPrs: 'PRs',
      headRank: 'Posição',
    },
    issues: {
      kicker: 'Escolha sua primeira contribuição',
      h2: 'Issues abertas, <em>marcadas para você</em>.',
      intro:
        'Ao vivo de <span class="num">label:&ldquo;good first issue&rdquo;</span> no repositório do Open Design. Comente numa issue para reivindicá-la, e um mantenedor a atribuirá a você em um dia.',
      loading: 'good first issue',
      foot: 'Exibindo as primeiras <span class="num" id="issue-count">—</span> good-first-issues abertas',
      seeAll: 'Ver todas no GitHub',
      empty: 'Nenhuma good-first-issue aberta agora. Volte amanhã, ou abra uma você mesmo',
      rateLimited:
        'Limite de requisições do GitHub atingido no preview. Abra a busca ao vivo de good-first-issues no GitHub.',
    },
    onboard: {
      kicker: 'Quatro passos · qualquer nível',
      h2: 'Do zero ao <em>merge</em>, numa tarde.',
      intro:
        'Seja você designer, redator, engenheiro ou alguém que acabou de notar um erro de digitação, há um formato de contribuição para você. Aqui está o caminho.',
      steps: [
        {
          n: 'Passo 01',
          h3: 'Encontre uma <em>faísca</em>.',
          body: 'Navegue pela lista de good-first-issues acima, ou abra uma nova issue descrevendo algo que você melhoraria. Designers: sistemas DESIGN.md são a entrada mais fácil.',
        },
        {
          n: 'Passo 02',
          h3: 'Abra um PR em <em>rascunho</em>.',
          body: 'Faça fork, crie um branch, dê push. Marque como rascunho. Isso sinaliza que você quer feedback cedo. Mencione qual issue ele fecha. O CI é rápido; os bot-cards ficam no próprio branch.',
        },
        {
          n: 'Passo 03',
          h3: 'Revise com <em>um humano</em>.',
          body: 'Um mantenedor revisa em até 24h. Somos gentis, específicos e nunca barramos ninguém. Se travar, deixe o link do PR no #help do Discord.',
        },
        {
          n: 'Passo 04',
          h3: 'Merge → <em>cartão</em>.',
          body: 'O bot cunha seu cartão de honra no instante em que seu código é aceito e o envia ao branch bot-cards. Compartilhe no X com #OpenDesign, e nós repostamos os melhores.',
        },
      ],
      cta: 'Leia o guia de contribuição',
    },
  },
  ambassadors: {
    title: 'Embaixadores — Open Design',
    desc: 'Torne-se um embaixador do Open Design: abra um ateliê local, hospede encontros e críticas, e receba orçamento, materiais e um canal privado com o time central.',
    heroTitle: 'Seja a <em>voz</em> do Open Design na sua cidade.',
    heroLead:
      'Abra um ateliê local. Reúna os encontros, as demos, as críticas madrugada adentro. Nós apoiamos você com orçamento, materiais e um canal privado com o time central.',
    program: {
      kicker: 'O programa',
      h2: 'Vocação, <em>patronato</em>, aliança.',
      applyCta: 'Candidate-se pelo Google Form',
      applyNote:
        'Os embaixadores transformam o Open Design de um repositório em algo que os contribuidores podem encontrar numa sala, com tinta na mesa e o café já frio.',
      cols: [
        {
          n: 'I · Vocação',
          h3: 'Pintores da <em>cena local</em>.',
          lede: 'Designers, desenvolvedores, organizadores: o tipo que já reúne outras pessoas. Damos à reunião uma bandeira.',
          items: [
            '<b>Anfitrião de ateliê local:</b> você mantém vivo um encontro recorrente, grupo de estudo ou hack noturno.',
            '<b>Líder de comunidade online:</b> Discord, WeChat, Telegram, espaços no X.',
            '<b>Contribuidor ou evangelista praticante:</b> já publicando trabalho, postando ofício, acolhendo recém-chegados.',
            '<b>À vontade para carregar o nome:</b> vinculado ao Código de Conduta, atento à marca.',
          ],
        },
        {
          n: 'II · Patronato',
          h3: 'O que o <em>ateliê</em> oferece.',
          lede: 'Não um crachá de voluntário. Um vínculo de trabalho, com orçamento, prestígio e acesso.',
          items: [
            '<b>Uma página no site:</b> retrato, cidade, biografia, redes sociais, a crônica dos seus eventos.',
            '<b>Primeira vista:</b> recursos em beta, prévias do roadmap interno, releases à frente da fila.',
            '<b>O kit do ateliê:</b> pôsteres, slides, peças de demo, brindes; uma verba para local, bebidas e fotografia.',
            '<b>Uma linha com o estúdio:</b> canal privado, sync mensal, um caminho dedicado para o seu feedback.',
            '<b>Um caminho adiante:</b> cartões de honra e níveis, com uma trilha rumo a líder regional, palestrante ou papéis pagos na comunidade.',
          ],
        },
        {
          n: 'III · Aliança',
          h3: 'A <em>disciplina</em> do estúdio.',
          lede: 'Um compromisso modesto, mas vinculante. A ausência prolongada se converte em status de ex-membro; o círculo permanece pequeno e sério.',
          items: [
            '<b>Reúna</b> ao menos um evento por mês ou trimestre, local ou online.',
            '<b>Acolha a nova mão.</b> Conduza os recém-chegados por sua primeira contribuição.',
            '<b>Escute de perto.</b> Colha feedback honesto de usuários, designers, desenvolvedores, times.',
            '<b>Deixe um registro.</b> Publique um resumo após cada encontro: presença, fotografias, links, contatos.',
            '<b>Carregue bem o nome.</b> Mantenha-se fiel ao Código de Conduta; sem uso indevido da marca, sem acordos assinados em nome do estúdio.',
          ],
        },
      ],
    },
    roster: {
      kicker: 'Em campo',
      h2: 'Conheça os <em>embaixadores</em>.',
      intro:
        'Organizadores locais, criadores e construtores de comunidade que ajudam o Open Design a alcançar mais designers e times.',
      places: [
        'Sunshine Coast, Austrália',
        'Kuala Lumpur, Malásia',
        'Japão',
        'China',
      ],
    },
  },
  moderators: {
    title: 'Moderadores — Open Design',
    desc: 'Conheça os moderadores do Discord do Open Design e entre na sala onde designers AI-native publicam trabalho, abrem plugins, testam betas e se desatolam uns aos outros.',
    heroTitle: 'A sala onde os <em>contribuidores</em> se reúnem.',
    heroLead:
      'A linha de frente da era do agent-design abre aqui. O Discord é onde se reúnem os designers AI-native mais afiados do mundo. Conheça quem mantém a sala acolhedora.',
    discord: {
      kicker: 'Onde os contribuidores se reúnem',
      h2: 'Fale com as pessoas que vão <em>revisar seu PR</em>.',
      body: 'A linha de frente da era do agent-design abre aqui. Nosso Discord é onde se reúnem os designers AI-native mais afiados do mundo: publicando trabalho, abrindo plugins, testando betas, desatolando uns aos outros. Entre. Traga o que você está fazendo.',
      joinCta: 'Entrar no Discord',
      discussionsCta: 'GitHub Discussions',
      cards: [
        {
          role: 'Do estúdio',
          bio: 'Do time fundador do Open Design. Torce para que o Discord siga sendo um bom lugar para estar. Acene a qualquer momento, sobre qualquer pergunta.',
        },
        {
          role: 'Guardião da sala',
          bio: 'Uma mão experiente em Discord e no cuidado com a comunidade. Mantém a sala acolhedora, as portas abertas, a conversa fluindo. Apaixonado pelo Open Design.',
        },
      ],
      channelNotes: ['trabalho publicado', 'construtores', 'feedback inicial', 'desatolar'],
    },
  },
};

export default ptBr;
