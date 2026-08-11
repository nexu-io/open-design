/*
 * Textos en español para la colección curada de plugins de diseño para Codex.
 * Traducido a partir de la versión base en inglés de `../codex-i18n.ts`.
 */
import type { CodexCopyOverride } from './index';

export const es: CodexCopyOverride = {
  collectionEyebrow: 'Colección curada',
  collectionHeading: 'Los plugins de diseño que hacen que Codex entregue UI de verdad',
  collectionLede:
    'OpenAI Codex escribe código que funciona. Por su cuenta recurre a tipografías seguras, espaciados del montón y Helvetica centrada. Estos plugins le dan criterio: skills de estética y reglas de sistema de diseño. Instala uno, o ejecútalos todos dentro de Open Design.',
  collectionStats: [
    { value: '50', label: 'plugins seleccionados' },
    { value: '13', label: 'repos de origen' },
    { value: 'Código', label: 'abierto y verificado' },
  ],
  collectionIntro:
    'Cada plugin de esta lista es real y enlaza a su fuente. Todos cumplen uno de dos trabajos: fijar el criterio estético antes del código y convertir tu sistema de diseño en reglas que el agente respeta.',
  collectionCategoryBlurbs: [
    'Anula las decisiones estéticas por defecto de Codex antes de escribir una sola línea.',
    'Convierte tus tokens y componentes en reglas que Codex sigue en lugar de improvisar.',
  ],
  collectionCloserHeading: 'Sáltate la configuración: diseña con Codex dentro de Open Design',
  filterAll: 'Todos',
  collectionCloserBody:
    'Open Design es el espacio de trabajo de diseño de código abierto y nativo para agentes que envuelve a Codex. Mantiene coherentes tus sistemas, skills y plantillas para que el agente entregue trabajo que es tuyo.',
  categoryFrontend: 'Frontend y UI',
  categoryDesignSystems: 'Sistemas de diseño',
  ctaDownload: 'Descargar Open Design',
  ctaStarList: 'Dar una estrella a la lista',
  ctaBrowseAll: 'Ver todos los plugins',
  ctaViewSource: 'Ver el código fuente',
  ctaOurRepo: 'codex-design en GitHub',
  cardKind: 'Plugin',
  cardWhatItDoes: 'Qué hace',
  cardCta: 'Ver el plugin',
  detailWhatIsIt: 'Qué es',
  detailWhyForDesign: 'Por qué importa para el diseño',
  detailHowWithCodex: 'Cómo ejecutarlo con Codex',
  detailExampleTag: 'Cuándo recurrir a él',
  detailSource: 'Fuente',
  detailCategory: 'Categoría',
  detailMaintainer: 'Autor',
  detailTags: 'Etiquetas',
  detailLicense: 'Licencia',
  detailCovers: 'Qué cubre',
  detailUpstream: 'Del SKILL.md original',
  detailCodexNote: 'Funciona con Codex',
  detailTraction: 'Tracción',
  detailRepo: 'Repositorio de origen',
  detailStars: 'Estrellas',
  installHeading: 'Cómo instalarlo',
  installRunInCodex: 'Ejecuta esto dentro de Codex.',
  installRestart: 'Reinicia Codex para que cargue la nueva skill.',
  installClone: 'Clona el repositorio.',
  installPoint: 'Señálale a Codex el archivo de la skill.',
  installThenUse: 'Luego describe la interfaz que quieres. Codex sigue la skill.',
  installNote:
    'Todos los plugins de esta colección son gratuitos, de código abierto y enlazan a su fuente original real.',
  installNoteCta: 'Ver la colección completa',
  detailMoreOnList: 'Más en la lista codex-design',
  detailRelated: 'Más plugins de diseño para Codex',
  finalEyebrow: 'Siguiente paso',
  detailCloserHeading: 'Diseña con Open Design, sin montar nada',
  detailCloserBody:
    'Instálalo tú mismo, o ejecuta toda una capa de diseño curada alrededor de Codex con Open Design. Trae tu propia key: lo que produzcas es tuyo.',
  skills: {
    'gpt-taste': {
      tagline:
        'Crea landing pages de estilo premiado con movimiento de scroll GSAP y rejillas bento sin huecos.',
      whatIsIt:
        'Una directiva de frontend que fuerza variación de maquetación mediante selección aleatoria simulada de hero, tipografía, componentes y paradigmas GSAP. También impone la estructura de página AIDA y un espaciado generoso entre secciones.',
      whyForDesign: [
        'Los titulares del hero se quedan en dos o tres líneas porque los contenedores se ensanchan en vez de convertirse en un muro de texto.',
        'Las rejillas bento usan grid-flow-dense, así que ninguna celda queda vacía o rota.',
        'Prohíbe las etiquetas meta baratas y verifica el contraste del texto de los botones antes de entregar el resultado.',
      ],
      howWithCodex: [
        'Pide una página; la skill emite un bloque design_plan antes de cualquier código de UI.',
        'Revisa sus elecciones aleatorias: maquetación del hero, pila tipográfica, componentes, paradigmas GSAP.',
        'Comprueba los puntos de la lista previa: matemática de ancho del hero, densidad de la rejilla, barrido de etiquetas, contraste.',
      ],
    },
    'stitch-design-taste': {
      tagline:
        'Escribe un DESIGN.md que orienta a Google Stitch hacia pantallas que no son genéricas.',
      whatIsIt:
        'Genera un archivo DESIGN.md optimizado para la generación de pantallas de Google Stitch. Codifica atmósfera, color, tipografía, componentes, maquetación, movimiento y una lista explícita de patrones prohibidos.',
      whyForDesign: [
        'Las pantallas de Stitch heredan un único acento con menos del 80% de saturación, en vez de degradados morado neón.',
        'Prohíbe los heroes centrados y las filas de tres tarjetas iguales por encima de la variación fijada.',
        'Los estados de carga y vacío se vuelven esqueléticos y compuestos, en lugar de spinners genéricos.',
      ],
      howWithCodex: [
        'Describe el ambiente del proyecto; la skill fija las puntuaciones de densidad, variación y movimiento.',
        'Genera un DESIGN.md de siete secciones con códigos hex y roles de color funcionales.',
        'Pasa ese archivo a Stitch directamente, o a través del servidor MCP de Stitch.',
      ],
    },
    'image-to-code': {
      tagline:
        'Primero genera imágenes de diseño, las analiza y luego construye el código frontend correspondiente.',
      whatIsIt:
        'Un flujo de trabajo que prioriza la imagen para tareas web visuales. El agente genera imágenes de referencia por sección, extrae de ellas tipografía, espaciado, color y componentes, y luego implementa el sitio para que coincida.',
      whyForDesign: [
        'El código sigue una referencia visual real, así la implementación no deriva hacia maquetaciones genéricas.',
        'Cada sección recibe su propia imagen grande, así el texto y el espaciado se pueden analizar.',
        'Los heroes se mantienen en menos de tres líneas de titular y sin pilas de contenedores anidados.',
      ],
      howWithCodex: [
        'Indica el número de secciones; en Codex, la skill genera una imagen por sección.',
        'Pide un render de detalle más cercano cuando el detalle de botones o tipografía quede ilegible.',
        'Haz que ejecute la comprobación de claridad antes de escribir cualquier archivo de implementación.',
      ],
    },
    'imagegen-frontend-mobile': {
      tagline: 'Genera flujos de pantallas de apps móviles premium como imágenes, no como código.',
      whatIsIt:
        'Una skill exclusiva de imágenes para conceptos y flujos de pantallas móviles en productos iOS, Android y multiplataforma. Presenta las pantallas dentro de mockups de teléfono limpios y nunca escribe código.',
      whyForDesign: [
        'Las pantallas respetan las áreas seguras y las regiones del sistema, en vez de parecer sitios web metidos en un teléfono.',
        'Una biblia de diseño fija mantiene coherentes la paleta, la tipografía y los iconos en todas las pantallas.',
        'Los conjuntos de varias pantallas forman un flujo creíble, no mockups sueltos sin relación entre sí.',
      ],
      howWithCodex: [
        'Indica la categoría de la app y el número de pantallas; cada pantalla se convierte en su propia imagen.',
        'La skill elige primero un modo de plataforma: iOS, Android o neutro multiplataforma.',
        'Pídele que regenere cualquier pantalla donde el texto quede pequeño o el encuadre irregular.',
      ],
    },
    'imagegen-frontend-web': {
      tagline: 'Genera una imagen de referencia horizontal por cada sección de la landing page.',
      whatIsIt:
        'Una skill de dirección de imagen para referencias de diseño de sitios web. Genera una imagen horizontal independiente por sección, con una única paleta fija y una composición de hero variada a lo largo del conjunto.',
      whyForDesign: [
        'Una landing page de ocho secciones produce ocho comps legibles, no un único tablero comprimido.',
        'La composición del hero varía más allá del típico texto a la izquierda, imagen a la derecha.',
        'Una misma paleta, escala tipográfica y familia de CTA se mantiene en cada fotograma generado.',
      ],
      howWithCodex: [
        'Di cuántas secciones quieres; si no lo indicas, la landing page usa seis por defecto.',
        'La skill anuncia el número, y luego etiqueta cada resultado por número de sección.',
        'Dale palabras de ambiente como editorial o cinematográfico para orientar la escala del hero y el fondo.',
      ],
    },
    'minimalist-ui': {
      tagline: 'Crea interfaces editoriales monocromas y cálidas con rejillas bento planas.',
      whatIsIt:
        'Un protocolo de frontend para interfaces minimalistas de estilo documento. Fija una paleta monocroma cálida, jerarquía tipográfica serif y mono, tarjetas bento con borde de 1px y acentos pastel apagados.',
      whyForDesign: [
        'Cada tarjeta y separador usa un único borde de 1px gris claro con un radio nítido.',
        'Los acentos vienen solo de cuatro pasteles lavados, reservados para etiquetas y código en línea.',
        'Las secciones ganan profundidad con imágenes de baja opacidad, en vez de fondos vacíos y planos.',
      ],
      howWithCodex: [
        'Pide una página; la skill establece primero el macro espacio en blanco, py-24 o py-32.',
        'Limita el ancho del texto a max-w-4xl y aplica de inmediato las variables monocromas.',
        'Los fundidos de entrada por scroll se ejecutan mediante IntersectionObserver, solo sobre transform y opacity.',
      ],
    },
    'design-taste-frontend': {
      tagline: 'Lee el brief, elige una dirección y entrega interfaces que no parecen plantillas.',
      whatIsIt:
        'Una skill de frontend anti-genérico para landing pages, portfolios y rediseños. Plantea una lectura de diseño, fija los mandos de variación, movimiento y densidad, y luego ejecuta una lista previa larga.',
      whyForDesign: [
        'Los briefs de empresa reciben el paquete oficial de sistema de diseño, en vez de un CSS artesanal que solo lo imita.',
        'La lista previa prohíbe rayas em, eyebrows con numeración de secciones, indicadores de scroll e intenciones de CTA duplicadas.',
        'Limita la repetición de maquetación, así que ocho secciones usan al menos cuatro familias distintas.',
      ],
      howWithCodex: [
        'El agente plantea una lectura de diseño en una línea antes de escribir cualquier código.',
        'Fija tres mandos: variación de diseño, intensidad de movimiento y densidad visual.',
        'Cada casilla de la lista previa debe cumplirse, o la página no está terminada.',
      ],
    },
    'industrial-brutalist-ui': {
      tagline: 'Crea interfaces rígidas de estilo impreso suizo o terminal CRT, con grano analógico.',
      whatIsIt:
        'Un sistema de diseño para interfaces que fusiona el impreso tipográfico suizo con la estética de terminales militares. Especifica rejillas rígidas, un contraste extremo de escala tipográfica, un único acento rojo de peligro y degradación analógica simulada.',
      whyForDesign: [
        'Se elige un único sustrato por proyecto, así claro y oscuro nunca se mezclan.',
        'Rechaza por completo border-radius, así que cada esquina se mantiene en noventa grados.',
        'Los filtros de trama, líneas de escaneo y ruido evitan que las superficies parezcan vectores planos.',
      ],
      howWithCodex: [
        'Elige un arquetipo: impreso industrial suizo o terminal CRT de telemetría táctica.',
        'Los titulares macro usan clamp con tracking negativo; los metadatos usan mono en mayúsculas pequeñas.',
        'Los huecos de rejilla de 1px con fondos de contraste producen las líneas divisorias finísimas.',
      ],
    },
    'redesign-existing-projects': {
      tagline: 'Audita un sitio existente y lo mejora sin romper su funcionalidad.',
      whatIsIt:
        'Un flujo de escaneo, diagnóstico y corrección para proyectos existentes. Audita tipografía, color, maquetación, estados, contenido, iconos y calidad de código, y luego aplica mejoras específicas dentro del stack actual.',
      whyForDesign: [
        'Los degradados morado-azul típicos de IA y las filas de tres tarjetas iguales se sustituyen por alternativas meditadas.',
        'Los botones de los grupos de tarjetas se alinean a una única línea inferior, aunque el contenido varíe.',
        'Se completan los estados de hover, focus, carga, vacío y error que faltaban.',
      ],
      howWithCodex: [
        'Primero escanea el código para identificar el framework y el método de estilos.',
        'Enumera todos los patrones genéricos y puntos débiles antes de cambiar nada.',
        'Las correcciones llegan en orden de prioridad: fuentes, color, estados, maquetación, componentes, acabado tipográfico.',
      ],
    },
    brandkit: {
      tagline:
        'Genera tableros de guías de marca, sistemas de logotipo y decks de identidad como imágenes.',
      whatIsIt:
        'Una skill de generación de imágenes para tableros de brand kit. Produce sistemas de logotipo, paneles de color y tipografía, mockups e imágenes de ambiente, organizados en un tablero de presentación basado en rejilla.',
      whyForDesign: [
        'Un sistema de paneles 3x3 por defecto cubre logotipo, construcción, color, tipografía y aplicaciones.',
        'Los conceptos de logotipo siguen un método declarado, como monograma, fusión de metáforas o espacio negativo.',
        'Los tableros tienen ritmo: paneles discretos, funcionales, emocionales y técnicos, en vez de un volumen uniforme.',
      ],
      howWithCodex: [
        'Indica la marca y la categoría; la skill elige primero un modo visual.',
        'Por defecto usa un tablero 3x3, o un mini deck de referencia 2x3.',
        'Mantén el texto escaso: nombre de marca, un tagline, un comando, unas pocas etiquetas.',
      ],
    },
    'cinematic-scroll-storytelling': {
      tagline: 'Recetas de Lenis y GSAP ScrollTrigger para landing pages guiadas por el scroll.',
      whatIsIt:
        'Código funcional para un preloader, apariciones de texto dividido enmascarado, apariciones de sección, escenas fijadas ligadas al scroll, pilas de tarjetas pegajosas y parallax, usando Lenis y GSAP ScrollTrigger.',
      whyForDesign: [
        'Los tokens de movimiento fijan duraciones, escalonados, desplazamientos y desenfoque para que las apariciones se mantengan coherentes.',
        'Cada efecto tiene una rama de reduced-motion que mantiene intactos la maquetación y el contraste.',
        'Un orden de construcción monta primero la página estática y luego el movimiento, evitando escenas de scroll enredadas.',
      ],
      howWithCodex: [
        'Instala gsap y lenis, y luego conecta Lenis al ticker de GSAP.',
        'Marca las secciones con los atributos data para apariciones, pilas y parallax.',
        'Añade al final las escenas fijadas ligadas al scroll, y luego ejecuta la lista de QA.',
      ],
    },
    'webgl-3d-object': {
      tagline: 'Una malla de hero iluminada en Three.js con material PBR y sombras reales.',
      whatIsIt:
        'Una receta de Three.js para un objeto de hero facetado: geometría de icosaedro, MeshStandardMaterial, cámara en perspectiva, luces key y rim, plano de sombra y una rotación flotante lenta.',
      whyForDesign: [
        'La geometría y la iluminación reales producen aristas, reflejos y sombras que las transformaciones CSS no pueden fingir.',
        'Los presets de material cubren looks de metal premium, cerámica suave y tecnología con tinte luminoso.',
        'El movimiento se limita a una rotación lenta y un ligero balanceo, así el texto sigue siendo lo primero.',
      ],
      howWithCodex: [
        'Añade la carcasa de canvas cuadrada, y luego ejecuta sobre ella el inicializador de Three.js.',
        'Ajusta color, metalness, roughness y emissive para casar con el mood de la marca.',
        'Confirma el manejo del redimensionado y la liberación de la geometría, el material y el renderer.',
      ],
    },
    'css-border-gradient': {
      tagline: 'Añade un borde degradado refinado a tarjetas, modales y superficies de hero.',
      whatIsIt:
        'Una receta CSS para bordes degradados sutiles usando el apilado de padding-box y border-box, más una variante de pseudoelemento enmascarado para superficies con fondos complejos.',
      whyForDesign: [
        'Da una definición de borde premium sin el brillo estridente de los bordes de neón.',
        'La variante enmascarada preserva un fondo existente en lugar de sobrescribirlo.',
        'Los valores por defecto mantienen los stops por debajo de 0.4 de opacidad, así los bordes enmarcan en vez de competir.',
      ],
      howWithCodex: [
        'Apunta a Codex a una tarjeta o un panel de precios que necesite un mejor borde.',
        'Elige el patrón simple para rellenos sólidos, el enmascarado para fondos complejos.',
        'Comprueba los temas claro y oscuro por separado, ya que el alpha rara vez se traslada bien.',
      ],
    },
    'high-end-visual-design': {
      tagline:
        'Bloquea los valores por defecto genéricos de la IA e impone maquetación y movimiento a nivel de agencia.',
      whatIsIt:
        'Una skill de directivas que prohíbe los valores de diseño por defecto típicos de la IA, y luego obliga al agente a elegir un arquetipo de ambiente y un arquetipo de maquetación antes de escribir cualquier código de UI.',
      whyForDesign: [
        'Prohíbe Inter, Roboto y los iconos gruesos de Lucide, así el resultado deja de parecer una plantilla.',
        'Las tarjetas reciben una carcasa exterior anidada más un núcleo interior, dando a los contenedores una profundidad real y trabajada.',
        'El padding de sección arranca en py-24, así las maquetaciones respiran en vez de amontonarse.',
      ],
      howWithCodex: [
        'Pídele una página a Codex; primero acciona en silencio el motor de variación.',
        'Monta la textura de fondo y la escala tipográfica, y luego construye contenedores de doble bisel.',
        'Inyecta movimiento con cubic-bezier a medida, y luego ejecuta la lista de comprobación previa a la salida.',
      ],
    },
    'pick-ui-library': {
      tagline: 'Asocia una tarea de frontend a una única librería recomendada, curada y con criterio.',
      whatIsIt:
        'Una skill de consulta que se invoca de forma explícita. Asigna a una tarea concreta una única librería recomendada de una tabla curada que cubre primitivas, movimiento, gráficos, virtualización, estado y estilos.',
      whyForDesign: [
        'Una recomendación por tarea, así no hay un menú de opciones sobre el que discutir.',
        'Revisa primero package.json, así reutiliza lo que el proyecto ya tiene.',
        'Detecta los dropdowns y toasts hechos a mano, y los sustituye por primitivas accesibles.',
      ],
      howWithCodex: [
        'Invócala de forma explícita; nunca se dispara por su cuenta.',
        'Indica la tarea, no el nombre de la librería, como «necesito toasts».',
        'Nombra una librería, explica su uso y luego la integra.',
      ],
    },
    'apple-design': {
      tagline: 'Los principios de interfaz fluida de Apple llevados a springs y gestos web.',
      whatIsIt:
        'Conocimiento destilado de las charlas de diseño de Apple en la WWDC, principalmente Designing Fluid Interfaces, mapeado a CSS, Pointer Events y librerías de springs. Cubre respuesta, interrumpibilidad, inercia, materiales, tipografía y accesibilidad.',
      whyForDesign: [
        'El feedback se dispara en pointer-down, así los elementos pulsados dejan de sentirse muertos.',
        'Las animaciones parten del valor real en pantalla, eliminando saltos visibles al interrumpirlas.',
        'Los toques rápidos proyectan un punto de destino, así los lanzamientos caen donde apuntaba el gesto.',
      ],
      howWithCodex: [
        'Pídele a Codex que construya una hoja, un drawer o una interacción de arrastre.',
        'Sigue el puntero 1:1 con captura de puntero y registra el historial de velocidad.',
        'Al soltar, entrega la velocidad a un spring usando los valores de amortiguación incluidos.',
      ],
    },
    'animation-vocabulary': {
      tagline: 'Convierte una descripción vaga de movimiento en su término técnico exacto.',
      whatIsIt:
        'Un glosario de búsqueda inversa. El usuario describe un efecto de movimiento a grandes rasgos y la skill devuelve el término preciso, citado tal cual, con alternativas cercanas cuando varias podrían encajar.',
      whyForDesign: [
        'Le da al diseñador la palabra exacta con la que instruir a un agente.',
        'Desambigua pares parecidos como clip-path frente a mask, o pop in frente a bounce.',
        'Se niega a inventar términos, así la nomenclatura sigue siendo fiable.',
      ],
      howWithCodex: [
        'Describe lo que viste, como «el scroll elástico de iOS».',
        'Devuelve el término en negrita más una definición de glosario en una línea.',
        'Pide alternativas cuando dos términos podrían encajar de forma plausible.',
      ],
    },
    'emil-design-eng': {
      tagline: 'Las reglas de Emil Kowalski para el timing de animación, el easing y el acabado de componentes.',
      whatIsIt:
        'Codifica una filosofía de ingeniería de diseño: un marco de decisión de animación, guía sobre springs, principios de componentes, técnicas de clip-path, manejo de gestos, reglas de rendimiento y una lista de revisión.',
      whyForDesign: [
        'Las acciones frecuentes pierden su animación por completo, así las paletas de comandos se mantienen instantáneas.',
        'Las entradas parten de scale(0.95), nunca de scale(0), así nada aparece de la nada.',
        'Los popovers escalan desde su disparador en vez de su centro, manteniendo el vínculo espacial.',
      ],
      howWithCodex: [
        'Pídele a Codex que revise código de UI; devuelve una tabla de Antes, Después y Por qué.',
        'Para movimiento nuevo responde si debe animarse, por qué, qué easing y a qué velocidad.',
        'Aplica la lista de revisión, señalando transition: all y las duraciones de más de 300ms.',
      ],
    },
    'ui-ux-pro-max-design': {
      tagline: 'Un único punto de entrada que enruta trabajo de logotipo, identidad, slides, banner e iconos.',
      whatIsIt:
        'Una skill de diseño unificada que enruta tareas a sub-skills o a módulos integrados. Los integrados cubren generación de logotipo, mockups de identidad corporativa, slides en HTML, banners, fotos para redes e iconos SVG mediante scripts de Gemini.',
      whyForDesign: [
        'El logotipo, los mockups de identidad y el deck salen todos de una misma entrada de marca.',
        'Los iconos se generan como texto SVG, así se mantienen editables, no rasterizados.',
        'Las reglas de banner imponen zonas seguras, dos fuentes como máximo y un único CTA.',
      ],
      howWithCodex: [
        'Primero exporta GEMINI_API_KEY e instala google-genai y pillow.',
        'Ejecuta scripts/logo/search.py para un brief de diseño, y luego generate.py para las imágenes.',
        'Pasa el logotipo a scripts/cip/generate.py para producir mockups entregables.',
      ],
    },
    'ui-ux-pro-max-banner-design': {
      tagline: 'Diseña banners con medidas exactas en HTML, y luego los exporta como PNG.',
      whatIsIt:
        'Un flujo de banner en cinco pasos: recoge requisitos, investiga la dirección de arte, construye el banner en HTML y CSS con visuales generados, captura a los píxeles exactos de la plataforma y luego presenta opciones para iterar.',
      whyForDesign: [
        'Cada banner se exporta a los píxeles exactos de la plataforma, así nada se recorta ni se reescala.',
        'Los visuales generados se renderizan sin texto, así los titulares se mantienen como HTML nítido.',
        'Tres direcciones de arte por petición, así la comparación ocurre antes de comprometerse.',
      ],
      howWithCodex: [
        'Responde las preguntas de propósito, plataforma, contenido, marca, estilo y cantidad.',
        'Construye un banner HTML por cada dirección de arte con las zonas seguras aplicadas.',
        'Captura cada uno al ancho y alto fijados, comprimiendo los archivos que superen el límite.',
      ],
    },
    'ui-ux-pro-max-ui-styling': {
      tagline: 'Construye interfaces accesibles con componentes shadcn y utilidades de Tailwind.',
      whatIsIt:
        'Combina una capa de componentes shadcn sobre primitivas de Radix, una capa de estilos con utilidades de Tailwind y una capa de diseño visual en canvas. Incluye archivos de referencia para theming, accesibilidad, reglas responsive y personalización.',
      whyForDesign: [
        'Los diálogos y menús heredan la gestión de foco de Radix, así la accesibilidad no se añade a posteriori.',
        'Los colores del tema viven en variables CSS, así el modo oscuro se mantiene coherente.',
        'Los breakpoints mobile-first hacen que las maquetaciones arranquen pequeñas y crezcan hacia arriba.',
      ],
      howWithCodex: [
        'Ejecuta npx shadcn@latest init para configurar el framework y el tema.',
        'Añade componentes con npx shadcn@latest add button card dialog form.',
        'Ejecuta scripts/tailwind_config_gen.py para generar una configuración con tokens propios.',
      ],
    },
    'ui-ux-pro-max-brand': {
      tagline: 'Mantiene sincronizados las guías de marca, los tokens de diseño y los assets.',
      whatIsIt:
        'Una skill de identidad de marca construida en torno a scripts que inyectan el contexto de marca en los prompts, validan assets, extraen colores y sincronizan brand-guidelines.md con el JSON de tokens de diseño y las variables CSS.',
      whyForDesign: [
        'Un único archivo markdown es la fuente de verdad para los tokens y el CSS.',
        'Los colores extraídos se comparan con la paleta, detectando la deriva a tiempo.',
        'Los assets se comprueban en nombre, tamaño y formato antes de aprobarlos.',
      ],
      howWithCodex: [
        'Edita docs/brand-guidelines.md, y luego ejecuta scripts/sync-brand-to-tokens.cjs.',
        'Verifica con scripts/inject-brand-context.cjs --json.',
        'Comprueba cualquier archivo nuevo con scripts/validate-asset.cjs antes de publicarlo.',
      ],
    },
    'ui-ux-pro-max-slides': {
      tagline: 'Construye decks de presentación en HTML con Chart.js y patrones de maquetación.',
      whatIsIt:
        'Una pequeña skill de enrutado para presentaciones estratégicas en HTML. Interpreta un subcomando, y luego carga archivos de referencia que cubren patrones de maquetación, una plantilla HTML, fórmulas de copywriting y estrategias de slides.',
      whyForDesign: [
        'Las slides son HTML, así la tipografía y el espaciado siguen tokens de diseño reales.',
        'Chart.js gestiona las slides de datos, así los números se mantienen vivos en vez de imágenes pegadas.',
        'Los patrones de maquetación se eligen de un conjunto, manteniendo el deck visualmente coherente.',
      ],
      howWithCodex: [
        'Invócala con el subcomando create más un tema y un número de slides.',
        'Carga references/create.md y sigue ese flujo de creación.',
        'Extrae patrones de maquetación y fórmulas de copywriting de los archivos de referencia.',
      ],
    },
    'design-system-tokens': {
      tagline:
        'Tokens de diseño en tres capas, especificaciones de componentes y generación de slides acorde a los tokens.',
      whatIsIt:
        'Una skill de sistema de diseño que cubre las capas de tokens primitivos, semánticos y de componente como variables CSS, además de especificaciones de estados de componente y un generador de slides que construye decks a partir de esos mismos tokens.',
      whyForDesign: [
        'La capa de tokens semánticos convierte el cambio entre tema claro y oscuro en un ajuste de configuración, no en una reescritura.',
        'Las especificaciones de componente tabulan los estados default, hover, active y disabled, así el traspaso no deja nada ambiguo.',
        'Un validador señala los valores hex escritos a mano, manteniendo componentes y slides dentro del sistema de tokens.',
      ],
      howWithCodex: [
        'Ejecuta generate-tokens.cjs sobre una configuración de tokens en JSON para emitir tu archivo de variables CSS.',
        'Pídele a Codex las especificaciones de componente, y luego ejecuta validate-tokens.cjs sobre src/ para cazar valores en crudo.',
        'Usa search-slides.py con los flags de posición y contexto para elegir maquetaciones para un deck.',
      ],
    },
    'editorial-ui-style': {
      tagline: 'Maquetación de revista en serif Gelasio sobre una rejilla estricta de 8pt.',
      whatIsIt:
        'Una skill de guía de sistema de diseño para un look editorial moderno: serif Gelasio tanto para cuerpo como para display, Ubuntu Mono, un casi negro #111111 sobre superficies blancas y una rejilla base de 8pt.',
      whyForDesign: [
        'Display y cuerpo en serif de una sola familia mantiene tipográficamente coherentes los pasajes de lectura larga.',
        'Una rejilla base de 8pt impone ritmo vertical en titulares, cuerpo de texto y espaciado.',
        'El listón de accesibilidad incluye soporte de reduced-motion, áreas táctiles de 44px y manejo de alto contraste.',
      ],
      howWithCodex: [
        'Pídele a Codex que reformule la intención de diseño, y que defina los tokens antes de tocar componentes.',
        'Pide reglas de componente que cubran anatomía, variantes, estados y comportamiento responsive.',
        'Cierra con la lista de QA para que un revisor de código pueda verificar el resultado.',
      ],
    },
    'terracotta-ui-style': {
      tagline: 'Acento arcilla sobre crema, titulares en DM Serif Display, lectura de formato largo.',
      whatIsIt:
        'Una skill de guía para una interfaz editorial de tonos tostados por el sol: superficies crema #F3E9D8, un único acento terracota #C56A3C, titulares en DM Serif Display, JetBrains Mono. Afinada para blogs y storytelling.',
      whyForDesign: [
        'Un único color de acento, así el énfasis se mantiene escaso y los titulares llevan la jerarquía.',
        'Las superficies crema cálidas reducen el deslumbramiento en artículos largos frente a las páginas de blanco puro.',
        'Los titulares serif de display sobre cuerpo de texto marrón tinta marcan un ritmo editorial claro.',
      ],
      howWithCodex: [
        'Apunta a Codex a los tokens terracota y crema antes de que escriba ningún componente.',
        'Pide anatomía, variantes y estados por componente, con los tokens de espaciado nombrados de forma explícita.',
        'Pide antipatrones y notas de migración al readaptar una UI existente e inconsistente.',
      ],
    },
    'dithered-ui-style': {
      tagline: 'Sombreado con patrón de puntos y una paleta limitada para pantallas retro de alto contraste.',
      whatIsIt:
        'Una skill de guía para interfaces con dither que usan patrones de puntos para simular tonos a partir de una paleta limitada. Cuerpo en Open Sans, display en Space Grotesk, IBM Plex Mono, acentos azul y violeta.',
      whyForDesign: [
        'Los patrones de puntos sustituyen los degradados, así el sombreado sobrevive a un conjunto de color deliberadamente restringido.',
        'El renderizado de alto contraste mantiene el texto legible incluso cuando las superficies llevan una textura de patrón intensa.',
        'Las reglas prohíben el movimiento decorativo, evitando que el tratamiento retro se convierta en ruido visual.',
      ],
      howWithCodex: [
        'Dile primero a Codex el límite de la paleta, y luego deja que derive las reglas de sombreado basadas en patrones.',
        'Pide estados de vacío, carga y error para que las superficies con patrón sigan siendo legibles.',
        'Verifica las áreas de pulsación y los estados de foco, que esta skill señala de forma explícita.',
      ],
    },
    'neumorphism-ui-style': {
      tagline: 'Superficies extruidas suaves en gris piedra con tipografía Space Mono.',
      whatIsIt:
        'Una skill de guía para UI neumórfica: sombras interiores y exteriores sobre una superficie monocroma gris piedra #E7E5E4, un acento verde azulado #006666, Space Mono para display y cuerpo, espaciado de densidad compacta.',
      whyForDesign: [
        'Las superficies monocromas hacen que la profundidad venga de la sombra y no del contraste de color.',
        'El espaciado de densidad compacta encaja con paneles cargados de controles como dashboards y pantallas de ajustes.',
        'Las reglas prohíben mezclar metáforas visuales, así la extrusión suave se mantiene como único lenguaje de profundidad.',
      ],
      howWithCodex: [
        'Haz que Codex fije los tokens de superficie y sombra antes de dar estilo a cualquier control individual.',
        'Pide estados de foco visibles, ya que las sombras suaves por sí solas fallan a los usuarios de teclado.',
        'Exige HTML semántico antes que ARIA, como especifica esta skill.',
      ],
    },
    'bento-ui-style': {
      tagline: 'Rejilla de bloques variados sobre crema, tipografía Inter, escala compacta.',
      whatIsIt:
        'Una skill de guía para maquetaciones de caja bento que presentan el contenido como bloques de rejilla de tamaños variados. Inter en todo, una escala tipográfica compacta de 12 a 32, acentos melocotón y azul sobre crema.',
      whyForDesign: [
        'Los tamaños de bloque variados llevan la jerarquía, así la propia rejilla hace la clasificación.',
        'Una escala tipográfica compacta de 12 a 32 encaja texto denso dentro de mosaicos pequeños.',
        'La superficie crema #FFF5E6 mantiene legibles los bordes de los bloques sin necesidad de bordes gruesos.',
      ],
      howWithCodex: [
        'Pídele a Codex que asigne a cada bloque un tamaño según la prioridad del contenido.',
        'Define los tokens de espaciado en la escala de 4 a 32 antes de disponer los mosaicos.',
        'Pide el manejo de overflow y de etiquetas largas, que esta skill enumera como casos límite.',
      ],
    },
    'claymorphism-ui-style': {
      tagline: 'Formas 3D redondeadas y mullidas, titulares en Poppins, azul sobre blanco.',
      whatIsIt:
        'Una skill de guía para UI claymórfica: formas suaves, redondeadas y mullidas que imitan la arcilla maleable. Display en Poppins, cuerpo en Montserrat, un acento azul #3B82F6 y texto azul intenso sobre blanco.',
      whyForDesign: [
        'Las formas redondeadas y mullidas dan a los botones una evidente sensación de pulsable sin etiquetas extra.',
        'El texto azul intenso #1C398E sobre blanco mantiene el contraste mientras la paleta sigue siendo desenfadada.',
        'Las reglas prohíben mezclar metáforas, así la profundidad de arcilla nunca se combina con glass ni con flat.',
      ],
      howWithCodex: [
        'Pídele a Codex primero los tokens de radio y sombra, ya que definen el look de arcilla.',
        'Empareja el display Poppins con el cuerpo Montserrat como se especifica, no dos tipos sans parecidos.',
        'Comprueba que los estados focus-visible y disabled sobreviven al tratamiento de formas suaves.',
      ],
    },
    'brutalism-ui-style': {
      tagline: 'Maquetaciones inspiradas en hormigón visto, display Darker Grotesque, rojo y ocre.',
      whatIsIt:
        'Una skill de guía para UI brutalista extraída de la arquitectura de hormigón visto de los años 50: sin adornos, funcional, deliberadamente chocante. Tipo de display Darker Grotesque, rojo #DD614C y ocre #DAA144 sobre blanco.',
      whyForDesign: [
        'Los elementos contundentes y sin adornos prescinden de la decoración, así la estructura y el texto llevan el peso.',
        'Dos acentos fuertes, rojo y ocre, sustituyen por completo los degradados y las sombras.',
        'El mínimo de accesibilidad sigue aplicándose, así las maquetaciones chocantes conservan contraste y foco visible.',
      ],
      howWithCodex: [
        'Dile a Codex que el tono es contundente y sin adornos antes de que elija componentes.',
        'Ancla cada regla a un token o un umbral, como exigen las puertas de calidad.',
        'Empareja cada regla de qué hacer con un ejemplo concreto de qué no hacer al revisar el resultado.',
      ],
    },
    'hallmark-design-skill': {
      tagline: 'Flujo de diseño anti-genérico con 58 puertas y variedad estructural forzada.',
      whatIsIt:
        'Una skill de diseño para asistentes de código con IA, con un flujo de construcción por defecto y tres verbos: audit, redesign y study. Empuja hacia la variedad estructural para que dos construcciones no compartan un mismo ritmo de página.',
      whyForDesign: [
        'Las reglas de diversificación fuerzan macroestructuras, navs y footers distintos entre construcciones consecutivas.',
        'Los tokens bloqueados prohíben valores hex o font-family en línea que se salten el bloque de tokens.',
        'Cada entrega se verifica en anchos de 320, 375, 414 y 768 píxeles.',
      ],
      howWithCodex: [
        'Deja que el escaneo previo lea primero las fuentes, la paleta y las librerías de movimiento existentes.',
        'Responde la puerta de audiencia, caso de uso y tono, o di adelante.',
        'Ejecuta hallmark audit sobre una página para obtener una lista priorizada de pendientes sin editar nada.',
      ],
    },
    impeccable: {
      tagline: 'Dos docenas de comandos para construir, criticar y refinar interfaces frontend.',
      whatIsIt:
        'Una skill de diseño frontend con comandos agrupados en build, evaluate, refine, enhance, fix e iterate. Lee el contexto del proyecto y una referencia de registro, y luego escribe código de nivel de producción.',
      whyForDesign: [
        'La división por registro lleva las páginas de marketing y la UI de producto por reglas de diseño distintas.',
        'Las prohibiciones absolutas rechazan el texto con degradado, los bordes de raya lateral y las etiquetas eyebrow encima de cada sección.',
        'Los mínimos de contraste son explícitos: 4.5:1 para el cuerpo de texto, 3:1 para el texto grande.',
      ],
      howWithCodex: [
        'Ejecuta context.mjs una vez por sesión para que la skill cargue PRODUCT.md y DESIGN.md.',
        'Invoca un comando como critique, polish o animate con un archivo de destino.',
        'Usa el modo live con un servidor de desarrollo en marcha para generar variantes en el navegador.',
      ],
    },
    'design-dna': {
      tagline: 'Extrae un diseño de referencia a JSON estructurado, y luego genera a partir de él.',
      whatIsIt:
        'Un flujo en tres fases que captura la identidad de diseño a través de tokens medibles, estilo cualitativo y efectos visuales. Produce un JSON completo de Design DNA, y luego aplica ese JSON a contenido nuevo.',
      whyForDesign: [
        'Convierte una captura de pantalla o una URL en valores de color, tipografía y espaciado con nombre.',
        'Registra el mood, la composición y la voz de marca, no solo los tokens medibles.',
        'Captura efectos de Canvas, WebGL, shader y scroll que el CSS a secas no puede expresar.',
      ],
      howWithCodex: [
        'Pide el esquema para ver las tres dimensiones antes de analizar nada.',
        'Entrégale a Codex imágenes de referencia o URLs y pide un JSON de DNA relleno.',
        'Pasa el JSON junto con tu contenido para generar una página HTML autónoma.',
      ],
    },
    'material-3': {
      tagline: 'Implementa Material Design 3 de Google en Compose, Flutter y web.',
      whatIsIt:
        'Una guía de Material Design 3 que cubre el namespace de tokens md.sys, más de 30 componentes, maquetación adaptativa, theming y M3 Expressive. Jetpack Compose es el objetivo principal; Flutter y @material/web son secundarios.',
      whyForDesign: [
        'Los tokens de color, tipografía, forma y elevación sustituyen los valores hex y de radio escritos a mano.',
        'Las superficies tonales aportan profundidad en lugar de sombras, acorde a la spec actual de MD3.',
        'Una auditoría con puntuación califica diez categorías y enumera las correcciones por orden de prioridad.',
      ],
      howWithCodex: [
        'Nombra la plataforma para que Codex elija Compose, Flutter o propiedades personalizadas de CSS.',
        'Pide un componente y obtén la variante correcta más el cableado de tokens.',
        'Ejecuta la auditoría sobre una URL o archivos fuente para un informe de cumplimiento.',
      ],
    },
    'make-interfaces-feel-better': {
      tagline: 'Dieciséis reglas concretas de acabado de UI con una lista de revisión.',
      whatIsIt:
        'Un conjunto de principios de ingeniería de diseño para el acabado de interfaz: radios concéntricos, alineación óptica, sombras en capas, animaciones de entrada escalonadas, números tabulares, áreas de pulsación y especificidad de transición.',
      whyForDesign: [
        'Nombra valores exactos, así la escala al pulsar es siempre 0.96, nunca al tanteo.',
        'Corrige el desajuste de radios anidados que hace que la mayoría de componentes se vean raros.',
        'Caza el salto de maquetación por números cambiantes antes de que llegue a los usuarios.',
      ],
      howWithCodex: [
        'Apunta a Codex a un componente y pídele que aplique los principios.',
        'Pide una revisión; los hallazgos vuelven como tablas de Antes y Después.',
        'Ejecuta la lista de catorce puntos antes de fusionar cualquier cambio de frontend.',
      ],
    },
    'visual-plan': {
      tagline: 'Convierte planes de texto en documentos revisables con wireframes y prototipos.',
      whatIsIt:
        'Un modo de planificación estructurado para agentes de código. Los planes se convierten en documentos fáciles de escanear con diagramas en línea, código, modelos de datos, preguntas abiertas y un lienzo superior opcional o un prototipo en vivo.',
      whyForDesign: [
        'Los planes de UI abren con artboards de wireframe, uno por cada estado visible para el usuario.',
        'Los revisores comentan sobre elementos anclados en vez de discutir en el chat.',
        'Los flujos de varios pasos obtienen un prototipo operable junto a los mockups estáticos.',
      ],
      howWithCodex: [
        'Instálala con la CLI Agent-Native, y luego ejecuta el comando /visual-plan.',
        'Pega un plan existente de Codex o Markdown para usarlo como fuente.',
        'Lee el feedback, parchea el plan y verifica el resultado guardado.',
      ],
    },
    kami: {
      tagline: 'Compón currículums, white papers, decks y landing pages sobre un único lenguaje de diseño.',
      whatIsIt:
        'Un sistema de plantillas para documentos profesionales y landing pages de producto. Lienzo de pergamino cálido, acento azul tinta, jerarquía liderada por serif, con plantillas para nueve tipos de documento más quince primitivas de diagrama.',
      whyForDesign: [
        'Un único color de acento y una única familia serif mantienen cada entregable visualmente coherente.',
        'Un contrato de densidad señala las páginas de cuerpo que se renderizan a menos de la mitad.',
        'Las primitivas de diagrama cubren arquitectura, diagramas de flujo, cuadrantes, líneas de tiempo y gráficos.',
      ],
      howWithCodex: [
        'Di qué necesitas; el árbol de decisión elige la plantilla que corresponde.',
        'Deja que Codex destile primero tu contenido en bruto en un content.json validado.',
        'Ejecuta el script de build para producir HTML, PDF e informes de verificación.',
      ],
    },
    'masked-reveal': {
      tagline: 'Revela titulares palabra por palabra mediante una máscara de overflow al hacer scroll.',
      whatIsIt:
        'Un patrón de GSAP ScrollTrigger que divide un titular en spans de palabra enmascarados y los escalona hacia arriba a medida que el texto entra en el viewport. Incluye un patrón de limpieza en React.',
      whyForDesign: [
        'El escalonado a nivel de palabra se lee más calmado y editorial que la animación letra a letra.',
        'Los lectores de pantalla siguen recibiendo el texto completo mediante un aria-label.',
        'Los usuarios con reduced-motion ven texto estático sin ninguna transformación aplicada.',
      ],
      howWithCodex: [
        'Marca un titular con data-masked-reveal y añade las reglas de máscara CSS.',
        'Llama al helper de split, que evita el plugin de pago SplitText.',
        'Envuélvelo en un contexto de GSAP en React para que ScrollTrigger se limpie al cambiar de ruta.',
      ],
    },
    'framed-grid-layout': {
      tagline: 'Construye maquetaciones editoriales precisas con marcos finos y corchetes de esquina.',
      whatIsIt:
        'Un patrón de rejilla de doce columnas donde cada sección se ajusta a columnas compartidas dentro de cajas con marco de 1px. Los corchetes de esquina en forma de L se dibujan como capas de fondo sobre una textura diagonal de baja opacidad.',
      whyForDesign: [
        'Cada sección comparte un color de borde, un tamaño de corchete y una escala de espaciado.',
        'Los corchetes de esquina no necesitan markup extra, así la estructura se queda en CSS.',
        'La maquetación sigue leyéndose con claridad si se elimina la capa de textura.',
      ],
      howWithCodex: [
        'Pide una página técnica o editorial y obtén primero la rejilla padre.',
        'Asigna clases de span explícitas en vez de anchos de sección improvisados.',
        'Verifica que los bordes de los marcos se alinean vertical y horizontalmente en ambos breakpoints.',
      ],
    },
    'container-lines': {
      tagline: 'Dibuja líneas guía verticales discretas en los bordes del contenedor de contenido.',
      whatIsIt:
        'Un patrón CSS que añade líneas verticales de 1px en ambos bordes del contenedor de contenido, más mini cuadrados de esquina opcionales. Las guías se sitúan detrás del contenido e ignoran los eventos de puntero.',
      whyForDesign: [
        'Revela el ancho del contenedor, así las secciones hero sueltas ganan tensión estructural.',
        'Las guías comparten el max-width y el padding del contenedor, así nunca se desalinean.',
        'Los eventos de puntero están desactivados, así las líneas nunca bloquean clics ni selección.',
      ],
      howWithCodex: [
        'Añade la clase container-lines a la carcasa de la maquetación.',
        'Coloca cuadrados de esquina solo en esquinas reales de contenedor o de sección.',
        'Comprueba que las líneas se mantienen sutiles sobre fondos claros y oscuros.',
      ],
    },
    'skeuomorphic-ui': {
      tagline: 'Da a botones y paneles profundidad táctil con degradados y sombras en capas.',
      whatIsIt:
        'Una receta de superficie para UI web táctil: rellenos de degradado vertical, un borde de degradado reflectante de 1px, sombras exteriores e inset apiladas. El texto en relieve, los iconos y la microtextura son opcionales.',
      whyForDesign: [
        'Los estados elevado y pulsado invierten la profundidad, así los controles se leen como físicos.',
        'La profundidad se mantiene direccional, con luz desde arriba y sombra debajo.',
        'Advierte contra mezclar glassmorphism, neumorphism y skeuomorphism en un mismo componente.',
      ],
      howWithCodex: [
        'Fija los tokens base una vez, y luego ajústalos por marca y tema.',
        'Aplica la superficie elevada a tarjetas, botones, pestañas y carcasas de control.',
        'Añade la variante pulsada solo para toggles activos y pestañas seleccionadas.',
      ],
    },
    'beautiful-shadows': {
      tagline: 'Tres utilidades de sombra de Tailwind listas para usar, con elevación neutra en capas.',
      whatIsIt:
        'Un conjunto de clases de sombra arbitraria de Tailwind exactas en tres intensidades. Cada una apila varias capas neutras de baja opacidad en lugar de la escala de sombra por defecto de Tailwind.',
      whyForDesign: [
        'La elevación se mantiene neutra, sin un brillo de color que tiña la superficie de debajo.',
        'Tres intensidades fijas corresponden a controles, tarjetas y medios de hero respectivamente.',
        'Las capas apiladas de baja opacidad se leen como profundidad real en vez de una sola sombra tosca.',
      ],
      howWithCodex: [
        'Pídele a Codex que aplique la utilidad md a tarjetas, paneles y popovers.',
        'Reserva la utilidad lg para medios de hero y contenedores tipo modal.',
        'Empareja cada sombra con un relleno de superficie limpio y un radio coherente.',
      ],
    },
    'dither-background': {
      tagline: 'Fondo en canvas con dithering Bayer 4x4 visible y píxeles cuadrados.',
      whatIsIt:
        'Una receta de canvas que renderiza un campo procedural casi negro a partir de value noise, FBM y un umbral Bayer 4x4, dibujado como celdas cuadradas ampliadas.',
      whyForDesign: [
        'Las celdas ampliadas mantienen legible la matriz de dither en vez de colapsar en grano de película.',
        'La paleta monocroma de seis pasos mantiene legible la tipografía en primer plano sin un overlay pesado.',
        'El viñeteado y la masa descentrada dan una única zona focal brillante, no un brillo uniforme.',
      ],
      howWithCodex: [
        'Coloca el canvas fijo detrás del contenido y pon pointer-events en none.',
        'Ajusta cellSize entre 5px y 10px para la legibilidad de la matriz.',
        'Ajusta los valores de wave, cloud, ridge y vignette para modelar la masa.',
      ],
    },
    'webgl-laser': {
      tagline: 'Haz de shader a pantalla completa con núcleo al rojo blanco y niebla teñida con el color de marca.',
      whatIsIt:
        'Un fragment shader de WebGL a secas que dibuja un láser vertical fino sobre un quad a pantalla completa. El núcleo se mantiene casi blanco; el halo y el humo FBM siguen tu acento.',
      whyForDesign: [
        'El halo y el humo se leen de tu acento de marca en vez de un azul fijado a mano.',
        'Anchos separados de núcleo y resplandor mantienen el haz como una hoja, no una barra.',
        'El humo se concentra cerca del haz y se disipa hacia fuera, protegiendo el contraste del texto.',
      ],
      howWithCodex: [
        'Define una propiedad personalizada --brand-accent, que el shader convierte a RGB.',
        'Coloca el canvas fijo detrás del contenido con pointer-events none.',
        'Ajusta coreWidth, glowWidth, smokeDensity y xOffset para posicionar el haz.',
      ],
    },
    'mesh-gradient-dark-blue-clean': {
      tagline: 'Sistema azul marino casi negro con un campo de malla dentro de una carcasa de hero.',
      whatIsIt:
        'Una dirección en azul oscuro con tokens de color CSS, una carcasa de hero con borde degradado, un campo de malla en canvas, una píldora de navegación glass, nodos flotantes, raíles y CTAs emparejados.',
      whyForDesign: [
        'La malla se sitúa dentro de la carcasa del hero, así dirige la composición en vez de decorarla.',
        'Los tokens con nombre fijan los valores de fondo, carcasa, línea, texto y acento en toda la página.',
        'Los raíles, cuadrados de esquina y píldoras de nodo dan estructura técnica a la carcasa minimalista.',
      ],
      howWithCodex: [
        'Pega el bloque de tokens, y luego construye la base de la página y la carcasa del hero.',
        'Añade el canvas de malla dentro de la carcasa, detrás del contenido de la carcasa.',
        'Coloca unos pocos nodos, raíles y marcadores, y mantén lentos los bucles de deriva.',
      ],
    },
    'agency-grid-layout-minimal': {
      tagline: 'Rejilla editorial de varias columnas con titulares enormes y etiquetas diminutas en mayúsculas.',
      whatIsIt:
        'Una dirección de maquetación para sitios de agencia: carcasas de rejilla anchas, titulares de display enormes, metadatos pequeños en mayúsculas en columnas adyacentes y bloques de imagen arquitectónicos.',
      whyForDesign: [
        'La colocación estricta por columnas hace que la posición de cada elemento se lea como intencionada.',
        'El contraste de escala entre los titulares de display y los metadatos diminutos lleva la jerarquía.',
        'El espacio en negativo se conserva en vez de rellenarse, manteniendo la página editorial.',
      ],
      howWithCodex: [
        'Fija primero una carcasa de max-width ancho con divisiones de columna visibles.',
        'Ancla un titular de hero a lo ancho de casi todas las columnas, con el texto de apoyo en una columna lateral.',
        'Construye las filas de servicios como listados de varias columnas con etiquetas de metadatos diminutas.',
      ],
    },
    'glass-dark-mode-clock': {
      tagline: 'Superficies oscuras esmeriladas construidas en torno a un dial de calibración circular.',
      whatIsIt:
        'Una dirección de glass oscuro centrada en un dial tipo reloj: base casi negra con rejillas de haces, cápsulas de navegación esmeriladas y una pieza central de anillo y marcas en capas.',
      whyForDesign: [
        'Un dial dominante ancla la maquetación en vez de quedarse como un widget decorativo.',
        'Las líneas de haz y las miras se alinean con el dial, reforzando la lógica de calibración.',
        'La paleta monocroma hace que el brillo venga de los reflejos del glass, no de acentos saturados.',
      ],
      howWithCodex: [
        'Empieza con una base casi negra más guías tenues de rejilla y de haces.',
        'Construye la navegación, las píldoras y los botones como cápsulas de glass oscuro con envoltorios de reflejo de 1px.',
        'Monta el dial en capas: anillo exterior, marcas, etiquetas giratorias, emblema central.',
      ],
    },
    'gsap-skills': {
      tagline: 'Conjunto oficial de animación de GSAP, desde los tweens del core hasta ScrollTrigger y React.',
      whatIsIt:
        'El conjunto de skills oficial de GreenSock para construir animación web con GSAP. Ocho módulos cubren la API del core, las timelines, ScrollTrigger, plugins, React, otros frameworks, rendimiento y utilidades.',
      whyForDesign: [
        'El movimiento sigue la API real de GSAP en vez de que el agente adivine la sintaxis.',
        'ScrollTrigger y las timelines se secuencian como es debido, no se apilan de forma improvisada.',
        'Las reglas de rendimiento mantienen la animación fluida en vez de dar tirones al hacer scroll.',
      ],
      howWithCodex: [
        'Instala el conjunto de skills de GSAP para que Codex pueda cargar el módulo pertinente.',
        'Pide el movimiento que quieres; el módulo adecuado se encarga de la API.',
        'Recurre al módulo de React o de frameworks dentro de un árbol de componentes.',
      ],
    },
    'animation-review': {
      tagline: 'Encuentra, mejora y revisa el movimiento frente a un listón de oficio sénior.',
      whatIsIt:
        'Tres de las skills de movimiento de Emil Kowalski funcionando como un solo bucle: encontrar lugares que deberían animarse, mejorar el movimiento existente y revisar el código de animación frente a un alto listón de oficio.',
      whyForDesign: [
        'Saca a la luz la UI que debería moverse y no lo hace, y rechaza el movimiento que no debería estar.',
        'Convierte el vago «que se sienta mejor» en una auditoría de movimiento priorizada.',
        'Somete la animación a un listón de oficio con nombre, no al gusto personal.',
      ],
      howWithCodex: [
        'Ejecuta la pasada de find para localizar oportunidades de movimiento en tu UI.',
        'Aplica la pasada de improve para reelaborar el código de animación existente.',
        'Ejecuta la pasada de review antes de publicar para cazar el movimiento de bajo oficio.',
      ],
    },
  },
};
