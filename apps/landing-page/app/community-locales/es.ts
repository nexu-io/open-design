import type { DeepPartial, CommunityCopy } from '../community-i18n';

const es: DeepPartial<CommunityCopy> = {
  hub: {
    title: "Comunidad — Open Design",
    desc: "La comunidad de Open Design: colaboradores que publican en abierto, embajadores que organizan ateliers locales y moderadores que mantienen viva la Discord.",
    heroTitle: "El diseño abierto <em>toma forma</em><br/>cuando lo publicas.",
    heroLead:
      "Open Design lo construyen personas, en abierto. Skills, sistemas DESIGN.md, plugins, documentación: cada commit es una pincelada. Elige una puerta abajo y encuentra tu sala.",
    cardMetaH: "Acuñada automáticamente en el primer merge",
    cardMetaS: "PNG · compartida en X",
    cardHeroAlt:
      "Tarjeta de honor de colaborador de Open Design — @dev-kp-eloper, top 99,9 %, nivel Giotto",
    cards: [
      {
        ord: "I",
        title: "Colaboradores",
        sub: "Las manos que <em>publican</em> el trabajo.",
        body: "Maintainers, clasificaciones semanales, el registro histórico y los issues abiertos que puedes reclamar hoy. Además del camino sin código para que quienes no programan envíen su primera pieza al registro.",
      },
      {
        ord: "II",
        title: "Embajadores",
        sub: "La <em>voz</em> de Open Design en tu ciudad.",
        body: "Abre un atelier local. Convoca los meetups, las demos, las críticas nocturnas. Con respaldo de presupuesto, materiales y un canal privado con el equipo central.",
      },
      {
        ord: "III",
        title: "Moderadores",
        sub: "La sala donde se reúnen los <em>colaboradores</em>.",
        body: "La primera línea de la era del diseño con agentes. Discord es donde se reúnen los diseñadores AI-native más brillantes del mundo. Conoce a quienes mantienen la sala acogedora.",
      },
    ],
  },
  contributors: {
    title: "Colaboradores — Open Design",
    desc: "Contribuye a Open Design: maintainers, clasificaciones de colaboradores semanales e históricas, good first issues y un camino sin código para publicar tu primera pieza.",
    heroTitle: "Las manos que <em>publican</em> el trabajo.",
    heroLead:
      "Open Design lo construyen personas, en abierto. Skills, sistemas DESIGN.md, plugins, documentación: cada commit es una pincelada. Elige un issue, envía un PR y gana una tarjeta de honor única en el momento en que se hace merge.",
    showcase: {
      kicker: "Todo como plugin",
      h2: "Open Design como escenario. <em>Tu trabajo</em> como espectáculo.",
      intro:
        "El atelier es también una galería. Ayudarte a crear el trabajo es la mitad de la dirección; asegurar que la sala venga a verlo es la otra. Cada pieza que publicas no aterriza en una bóveda, sino en una pared, donde el mundo puede encontrarla.",
      tenets: [
        {
          h3: "Cualquier cosa <em>puede ser un plugin</em>.",
          body: "Todo lo que el estudio produzca (contenido, un producto terminado, una plantilla, un Skill, un flujo de trabajo) puede plegarse de vuelta en un plugin. El registro acepta cualquier forma; la puerta no tiene guardián.",
        },
        {
          h3: "Tu pieza de debut, tu <em>ingreso</em>.",
          body: "El día en que tu primera pieza aterriza en el registro, tu nombre se une a la pared. No una insignia de visitante. Una línea permanente en la lista de colaboradores, junto a todos los que llegaron antes.",
        },
        {
          h3: "Una vez dentro, <em>viaja</em>.",
          body: 'El registro en <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">open-design.ai/plugins</a> es solo el umbral. Desde ahí, las piezas más fuertes se llevan hacia afuera: a X, al <span class="num">#showcase</span> de Discord, al boletín, a los reels de vídeo. Cada relevo amplía la sala; el mundo conoce tu mano.',
        },
        {
          h3: "¿Necesitas un <em>primer trazo</em>?",
          body: 'Recorre el <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">registro de plugins</a>. Las obras colgadas allí son yesca para la tuya. Toma la chispa y crea la pieza que solo tu mano podría.',
        },
      ],
      pane: {
        kicker: "El skill",
        h3: "Deja que el <em>agente</em> publique por ti.",
        lede: "Para creadores que preferirían no tocar el código. Toda la contribución vive en un solo skill, dicho en lenguaje sencillo. La pincelada corre a cargo del agente.",
        copy: "Copiar",
        copied: "Copiado",
        steps: [
          {
            h4: "Entrega la línea al agente",
            body: "Pega el comando de arriba en el agente dentro de Open Design, o en el que ya tengas a mano: Claude Code, Codex, Cursor. Se instala solo.",
          },
          {
            h4: "Despierta el skill",
            body: "Escribe <code>/od-contribute</code>, o simplemente dile al agente que ejecute lo que acabas de instalar. Cualquiera de las dos frases abre la puerta.",
          },
          {
            h4: "Medio minuto hasta la galería",
            body: "El agente recorre el resto. Tu pieza va camino del repositorio de código abierto en unos treinta segundos; la revisamos a la primera oportunidad y, en el momento en que aterriza, la sala conoce tu mano.",
          },
        ],
      },
    },
    maintainers: {
      kicker: "Al timón del barco",
      h2: "Los <em>maintainers</em>.",
      intro:
        "Los maintainers protegen la dirección y la calidad de Open Design: revisan las contribuciones, mantienen coherente el estándar y hacen sitio para que más colaboradores se ganen su lugar en el proyecto.",
      role: "Maintainer",
      bios: {
        "Nagendhra-web":
          "Nagendhra aporta el instinto de un ingeniero de datos por la verdad en producción: encontrar el fallo, medir el caso límite y arreglarlo como es debido. En Open Design, eso se refleja en el trabajo de preflight de despliegue, el endurecimiento del empaquetado de assets y las correcciones de Windows que hacen que el proyecto se sienta fiable cuando los colaboradores publican.",
        "Sid-Qin":
          "Sid es el ingeniero generalista con el ojo de un diseñador para el detalle: el tipo de maintainer que nota tanto la ruta rota de la CLI como el affordance de interacción torcido. En Open Design, Sid mantiene los flujos de exportación, las acciones de plugins, los shims de Windows, el manejo de MIME y la fontanería de agentes lo bastante afinados como para que una comunidad construya sobre ellos.",
      },
    },
    allTime: {
      kicker: "Señal histórica",
      h2: "Los colaboradores con <em>raíces profundas</em>.",
      intro:
        "Un registro de largo recorrido de colaboradores talentosos que no dejan de convertir ideas, correcciones y oficio en el estándar compartido de Open Design.",
      rankLabel: "Colaborador histórico",
      week: "Historial del repositorio",
      quote:
        "La cola larga importa: los sistemas de diseño, las correcciones de documentación, los ejemplos y las pequeñas reparaciones son la forma en que un lenguaje de diseño abierto se vuelve fiable.",
      handleSuffix: "· señal de colaborador profundo",
      statCommits: "Commits",
      statExternalRank: "Rango externo",
      headContributor: "Colaborador",
      headCommits: "Commits",
      headRank: "Rango",
    },
    weekly: {
      kicker: "La señal de esta semana",
      h2: "Diez colaboradores que lideran <em>esta semana</em>.",
      intro:
        "Una instantánea de colaboradores brillantes que hacen merge de PRs, mejoran el producto y hacen que Open Design se sienta vivo.",
      rankLabel: "Líder de esta semana",
      week: "Últimos 7 días",
      handleSuffix: "· líder esta semana",
      blurbTemplate:
        "{name} marca el ritmo esta semana con {prs} PRs mergeados y ese oficio constante que mantiene a Open Design en movimiento.",
      statRank: "Rango",
      statPrs: "PRs · 7 d",
      headContributor: "Colaborador",
      headPrs: "PRs",
      headRank: "Rango",
    },
    issues: {
      kicker: "Elige tu primera contribución",
      h2: "Issues abiertos, <em>etiquetados para ti</em>.",
      intro:
        'En directo desde <span class="num">label:&ldquo;good first issue&rdquo;</span> en el repo de Open Design. Comenta un issue para reclamarlo y un maintainer te lo asignará en un día.',
      loading: "good first issue",
      foot: 'Mostrando los primeros <span class="num" id="issue-count">—</span> good-first-issues abiertos',
      seeAll: "Ver todos en GitHub",
      empty: "No hay good-first-issues abiertos ahora mismo. Vuelve mañana o abre uno tú mismo",
      rateLimited:
        "Se alcanzó el límite de peticiones de GitHub en la vista previa. Abre la búsqueda en vivo de good-first-issue en GitHub.",
    },
    onboard: {
      kicker: "Cuatro pasos · cualquier nivel",
      h2: "De cero a <em>mergeado</em>, en una tarde.",
      intro:
        "Tanto si eres diseñador, redactor, ingeniero o alguien que acaba de detectar una errata, hay una forma de contribución para ti. Este es el camino.",
      steps: [
        {
          n: "Paso 01",
          h3: "Encuentra una <em>chispa</em>.",
          body: "Explora la lista de good-first-issues de arriba o abre un nuevo issue describiendo algo que mejorarías. Diseñadores: los sistemas DESIGN.md son la entrada más fácil.",
        },
        {
          n: "Paso 02",
          h3: "Abre un PR en <em>borrador</em>.",
          body: "Haz fork, crea una rama, haz push. Márcalo como borrador. Señala que quieres feedback pronto. Menciona qué issue cierra. La CI es rápida; bot-cards se queda en su propia rama.",
        },
        {
          n: "Paso 03",
          h3: "Revisa con <em>una persona</em>.",
          body: "Un maintainer revisa en 24 h. Somos amables, específicos y nunca ponemos barreras. Si te atascas, deja el enlace del PR en Discord #help.",
        },
        {
          n: "Paso 04",
          h3: "Merge → <em>tarjeta</em>.",
          body: "El bot acuña tu tarjeta de honor en el momento en que se hace merge y la envía a la rama bot-cards. Compártela en X con #OpenDesign y republicamos las mejores.",
        },
      ],
      cta: "Lee la guía de contribución",
    },
  },
  ambassadors: {
    title: "Embajadores — Open Design",
    desc: "Conviértete en embajador de Open Design: abre un atelier local, organiza meetups y críticas, y consigue presupuesto, materiales y un canal privado con el equipo central.",
    heroTitle: "Sé la <em>voz</em> de Open Design en tu ciudad.",
    heroLead:
      "Abre un atelier local. Convoca los meetups, las demos, las críticas nocturnas. Te respaldamos con presupuesto, materiales y un canal privado con el equipo central.",
    program: {
      kicker: "El programa",
      h2: "Vocación, <em>mecenazgo</em>, pacto.",
      applyCta: "Solicita vía Google Form",
      applyNote:
        "Los embajadores convierten Open Design de un repositorio en algo que los colaboradores pueden encontrar en una sala, con tinta sobre la mesa y el café ya frío.",
      cols: [
        {
          n: "I · Vocación",
          h3: "Pintores de <em>la escena local</em>.",
          lede: "Diseñadores, desarrolladores, organizadores: de los que ya reúnen a otros. Nosotros le damos una bandera a la reunión.",
          items: [
            "<b>Anfitrión de atelier local:</b> mantienes vivo un meetup recurrente, un grupo de estudio o un hackeo nocturno.",
            "<b>Líder de comunidad en línea:</b> Discord, WeChat, Telegram, X spaces.",
            "<b>Colaborador o evangelista en activo:</b> ya publicas trabajo, muestras oficio, guías a los recién llegados.",
            "<b>Cómodo llevando el nombre:</b> comprometido con el Código de Conducta, atento a la marca.",
          ],
        },
        {
          n: "II · Mecenazgo",
          h3: "Lo que el <em>atelier</em> ofrece.",
          lede: "No una insignia de voluntario. Un vínculo de trabajo, con presupuesto, estatus y acceso.",
          items: [
            "<b>Una página en el sitio:</b> retrato, ciudad, biografía, redes, la crónica de tus eventos.",
            "<b>Primicia:</b> funciones beta, avances del roadmap interno, releases antes que la cola.",
            "<b>El kit del atelier:</b> pósteres, presentaciones, piezas de demo, merch; una bolsa para local, bebidas y fotografía.",
            "<b>Una línea con el estudio:</b> canal privado, sync mensual, una vía dedicada para tu feedback.",
            "<b>Un camino hacia adelante:</b> tarjetas de honor y niveles, con una ruta hacia lead regional, ponente o roles remunerados en la comunidad.",
          ],
        },
        {
          n: "III · Pacto",
          h3: "La <em>disciplina</em> del estudio.",
          lede: "Un compromiso modesto, pero vinculante. La ausencia prolongada pasa a estado de alumni; el círculo se mantiene pequeño y serio.",
          items: [
            "<b>Convoca</b> al menos un evento al mes o al trimestre, local o en línea.",
            "<b>Acoge a la nueva mano.</b> Guía a los recién llegados en su primera contribución.",
            "<b>Escucha de cerca.</b> Reúne feedback honesto de usuarios, diseñadores, desarrolladores, equipos.",
            "<b>Deja constancia.</b> Publica un resumen después de cada encuentro: asistencia, fotografías, enlaces, contactos.",
            "<b>Lleva bien el nombre.</b> Cíñete al Código de Conducta; sin mal uso de la marca, sin acuerdos firmados en nombre del estudio.",
          ],
        },
      ],
    },
    roster: {
      kicker: "Sobre el terreno",
      h2: "Conoce a los <em>embajadores</em>.",
      intro:
        "Organizadores locales, creadores y constructores de comunidad que ayudan a Open Design a llegar a más diseñadores y equipos.",
      places: [
        "Sunshine Coast, Australia",
        "Kuala Lumpur, Malasia",
        "Japón",
        "China",
      ],
    },
  },
  moderators: {
    title: "Moderadores — Open Design",
    desc: "Conoce a los moderadores de la Discord de Open Design y únete a la sala donde los diseñadores AI-native publican trabajo, abren plugins, rompen betas y se desatascan entre sí.",
    heroTitle: "La sala donde se reúnen los <em>colaboradores</em>.",
    heroLead:
      "La primera línea de la era del diseño con agentes se abre aquí. Discord es donde se reúnen los diseñadores AI-native más brillantes del mundo. Conoce a quienes mantienen la sala acogedora.",
    discord: {
      kicker: "Donde se reúnen los colaboradores",
      h2: "Habla con las personas que <em>revisarán tu PR</em>.",
      body: "La primera línea de la era del diseño con agentes se abre aquí. Nuestra Discord es donde se reúnen los diseñadores AI-native más brillantes del mundo: publican trabajo, abren plugins, rompen betas, se desatascan entre sí. Entra. Trae lo que estás creando.",
      joinCta: "Únete a la Discord",
      discussionsCta: "GitHub Discussions",
      cards: [
        {
          role: "Desde el estudio",
          bio: "Del equipo fundador de Open Design. Espera que la Discord siga siendo un buen sitio donde estar. Saluda en cualquier momento, con cualquier pregunta.",
        },
        {
          role: "Guardián de la sala",
          bio: "Una mano experta en Discord y en el cuidado de comunidades. Mantiene la sala acogedora, las puertas abiertas, la conversación fluida. Apasionado por Open Design.",
        },
      ],
      channelNotes: ["trabajo publicado", "constructores", "feedback temprano", "desatascados"],
    },
  },
};

export default es;
