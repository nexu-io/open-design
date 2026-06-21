import type { SolutionLocaleCopy } from './types';

export const ES: SolutionLocaleCopy = {
  prototype: {
    title: 'Crea prototipos interactivos con Open Design + Claude Code',
    description:
      'Convierte un prompt en un prototipo de varias pantallas y navegable sin salir de tu terminal. Open Design dota a tu agente de programación de las habilidades de diseño, las plantillas y el sistema de diseño para entregar prototipos reales que puedes abrir en un navegador.',
    breadcrumb: 'Prototipo',
    label: 'Caso de uso · Prototipo',
    heading: 'Prototipa a la velocidad de un prompt',
    lead: 'Describe el flujo que tienes en mente y deja que tu agente ensamble un prototipo real y navegable — varias pantallas, estilos compartidos e interacciones en vivo — renderizado directamente a HTML que puedes abrir, compartir y entregar a ingeniería.',
    heroImageAlt:
      'Ilustración editorial de una mano bocetando un wireframe que se convierte en un prototipo de app navegable de varias pantallas',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design es la capa de diseño para el agente de programación que ya usas. Para prototipar, eso significa pasar de una idea de un párrafo a un prototipo navegable y con estilo en una sola sesión — sin herramienta de diseño, sin paso de exportación, sin brecha de entrega.',
    stepsTitle: 'Cómo funciona prototipar con Open Design',
    steps: [
      {
        title: 'Describe el flujo',
        body: 'Dile a tu agente qué estás construyendo en lenguaje sencillo — «un flujo de onboarding con una pantalla de bienvenida, un selector de planes y una confirmación». Open Design carga la habilidad de prototipo para que el agente sepa que debe producir pantallas, no una sola página.',
        imageAlt:
          'Ilustración de una persona escribiendo en una terminal una descripción en lenguaje sencillo del flujo de una app',
      },
      {
        title: 'Genera pantallas con estilo',
        body: 'El agente aplica un sistema de diseño y plantillas de prototipo de Open Design, así cada pantalla comparte tipografía, espaciado y componentes en lugar de parecer un borrador. Obtienes un conjunto coherente de pantallas, no maquetas inconexas.',
        imageAlt:
          'Ilustración de varias pantallas de app apareciendo en secuencia, todas compartiendo un estilo visual consistente',
      },
      {
        title: 'Conecta las interacciones',
        body: 'Los botones navegan, las pestañas cambian, los modales se abren. El prototipo se renderiza a HTML autocontenido, así se comporta como lo real en cualquier navegador — no hace falta cuenta en una herramienta de prototipado para verlo.',
        imageAlt:
          'Ilustración de un cursor haciendo clic a través de pantallas enlazadas con flechas que muestran la navegación entre ellas',
      },
      {
        title: 'Itera y entrega',
        body: 'Refina hablando con el agente — «pon el selector de planes en un diseño de tres columnas». Como el artefacto vive en tu proyecto, el diseño y el código final comparten una única fuente de verdad, cerrando la habitual brecha de entrega entre diseñador e ingeniero.',
        imageAlt:
          'Ilustración de un prototipo que se revisa y luego se pasa a un ingeniero, con el diseño y el código fundiéndose en un solo archivo',
      },
    ],
    tableTitle: 'Prototipar con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Herramientas de prototipado tradicionales',
    tableRows: [
      {
        capability: 'Pasar de la idea a la primera pantalla',
        withOd: 'Un prompt en el agente que ya tienes abierto',
        without: 'Abrir una herramienta aparte, iniciar un archivo, arrastrar cajas a mano',
      },
      {
        capability: 'Varias pantallas enlazadas',
        withOd: 'Generadas como un conjunto con estilos compartidos y navegación funcional',
        without: 'Cada cuadro dibujado y enlazado manualmente',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Tomado de un sistema de diseño reutilizable que el agente aplica',
        without: 'Recreado por archivo o mantenido a mano',
      },
      {
        capability: 'Resultado que se puede compartir',
        withOd: 'HTML autocontenido — se abre en cualquier navegador, sin cuenta',
        without: 'Quien lo ve necesita una licencia o un enlace de la herramienta del proveedor',
      },
      {
        capability: 'Camino al código real',
        withOd: 'El artefacto vive en tu repositorio; diseño y código comparten una fuente',
        without: 'Reconstruido desde cero tras una entrega aparte',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Suscripción por licencia, alojado por el proveedor, exportación limitada',
      },
    ],
    featuresTitle: 'Lo que puedes prototipar',
    features: [
      {
        title: 'Apps web de varias pantallas',
        body: 'Flujos completos con navegación compartida — onboarding, paneles, ajustes — no páginas sueltas.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Flujos de apps móviles',
        body: 'Recorridos móviles pantalla a pantalla con transiciones y estados de apariencia nativa.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Páginas de aterrizaje',
        body: 'Páginas de marketing y landings SaaS que puedes recorrer y lanzar.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Cualquier gusto visual',
        body: 'Editorial, suave o brutalista — el prototipo mantiene un estilo coherente de principio a fin.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista de espera y precios',
        body: 'Superficies de conversión — listas de espera, tablas de precios — conectadas y con tu marca.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Gamificado y lúdico',
        body: 'Conceptos cargados de interacción donde el movimiento y el estado son parte de la propuesta.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototipos que la gente creó con Open Design',
    galleryLead:
      'Cada uno de estos empezó como un prompt y se renderizó a un artefacto navegable. Elige una plantilla cercana a tu idea, describe tu variación y el agente la adapta.',
    gallery: [
      { thumb: "example-dating-web", caption: "App web de citas — flujo de varias pantallas" },
      { thumb: "example-hr-onboarding", caption: "Flujo de onboarding de RR. HH." },
      { thumb: "example-kami-landing", caption: "Página de aterrizaje de producto" },
      { thumb: "example-web-prototype-taste-soft", caption: "Prototipo web de estilo suave" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de prototipo',
    faqTitle: 'Preguntas frecuentes sobre prototipado',
    faq: [
      {
        q: '¿Necesito una herramienta de diseño como Figma para prototipar con Open Design?',
        a: 'No. Open Design funciona dentro de tu agente de programación y renderiza prototipos a HTML. Describes el flujo con palabras; el agente produce las pantallas. No hay una herramienta de lienzo aparte que aprender o pagar.',
      },
      {
        q: '¿Los prototipos son interactivos o solo maquetas estáticas?',
        a: 'Interactivos. La navegación, las pestañas y los modales funcionan porque la salida es HTML y CSS reales. Puedes recorrerlos en cualquier navegador exactamente como lo haría un usuario.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Open Design funciona con Claude Code, Codex, Cursor Agent, Gemini CLI y una docena más de adaptadores nativos. Aportas tus propias claves de proveedor; nada se aloja por ti.',
      },
      {
        q: '¿Puede un prototipo convertirse en el producto real?',
        a: 'Esa es la idea. El artefacto vive en tu proyecto, así que el mismo sistema de diseño y los componentes pasan al código de producción en lugar de descartarse tras una entrega.',
      },
    ],
    ctaTitle: 'Prototipa tu próxima idea esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte tu próximo «¿y si...?» en algo que puedas recorrer — en el agente que ya usas.',
  },
  dashboard: {
    title: 'Genera paneles de datos con Open Design + Claude Code',
    description:
      'Describe las métricas que sigues y deja que tu agente de programación construya un panel con estilo y adaptable — gráficos, tarjetas de KPI y tablas renderizadas a HTML que puedes alojar donde sea. Sin licencia de herramienta de BI, sin constructor de arrastrar y soltar.',
    breadcrumb: 'Panel',
    label: 'Caso de uso · Panel',
    heading: 'Paneles a partir de una descripción, no de un constructor de arrastrar y soltar',
    lead: 'Dile a tu agente qué mostrar y cómo debe sentirse. Open Design aporta los patrones de gráficos, el sistema de maquetación y el lenguaje visual para que obtengas un panel coherente y presentable — no un muro de widgets con estilos por defecto.',
    heroImageAlt:
      'Ilustración editorial de números en bruto a la izquierda fluyendo hacia un panel limpio de gráficos y tarjetas de KPI a la derecha',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte una especificación en lenguaje sencillo de tus métricas en un panel con estilo que tu agente renderiza a HTML — versionado en tu repositorio, alojable donde sea, sin suscripción de BI por licencia.',
    stepsTitle: 'Cómo funcionan los paneles con Open Design',
    steps: [
      {
        title: 'Describe las métricas',
        body: 'Enumera lo que importa — «usuarios activos semanales, ingresos por plan, abandono y una tendencia de 30 días». El agente carga la habilidad de panel para saber que debe disponer tarjetas de KPI, gráficos y una tabla en lugar de un solo bloque de texto.',
        imageAlt: 'Ilustración de una persona enumerando las métricas que le importan',
      },
      {
        title: 'Elige los patrones de gráficos',
        body: 'Open Design incluye plantillas de gráficos y maquetación, así las tendencias se vuelven gráficos de líneas, los desgloses se vuelven barras y los ratios la visualización adecuada — tipografía y espaciado consistentes en todo en lugar de valores por defecto dispares.',
        imageAlt: 'Ilustración de varios tipos de gráficos dispuestos en una cuadrícula coherente',
      },
      {
        title: 'Conecta tus datos',
        body: 'Apunta el panel a un CSV, un endpoint JSON o pega filas de ejemplo. Se renderiza a HTML autocontenido que se actualiza cuando lo hacen los datos — ábrelo en cualquier navegador, ponlo en cualquier alojamiento estático.',
        imageAlt: 'Ilustración de un archivo de datos conectándose a un panel que se actualiza en vivo',
      },
      {
        title: 'Refina y publica',
        body: 'Ajusta hablando con el agente — «agrupa los ingresos por región, mueve la fila de KPI arriba». El artefacto vive en tu proyecto, así que el panel se puede revisar y versionar como cualquier otro código.',
        imageAlt: 'Ilustración de un panel siendo refinado y luego desplegado',
      },
    ],
    tableTitle: 'Paneles con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Herramientas de BI / programado a mano',
    tableRows: [
      {
        capability: 'Pasar de la lista de métricas a la maquetación',
        withOd: 'Un prompt; el agente dispone tarjetas, gráficos y tablas',
        without: 'Arrastrar widgets uno a uno, o escribir el código de los gráficos desde cero',
      },
      {
        capability: 'Sistema visual consistente',
        withOd: 'Patrones de gráficos y espaciado de un sistema de diseño reutilizable',
        without: 'Estilos de widget por defecto, o estilizado a mano por gráfico',
      },
      {
        capability: 'Conectar datos',
        withOd: 'CSV / JSON / filas pegadas, renderizado a HTML en vivo',
        without: 'Conectores del proveedor o fontanería de datos a medida',
      },
      {
        capability: 'Alojamiento y compartición',
        withOd: 'HTML autocontenido en cualquier alojamiento estático, sin cuenta',
        without: 'Quien lo ve necesita una licencia en el proveedor de BI',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'Vive en tu repositorio; comparable como código',
        without: 'Encerrado dentro del proveedor, sin diff real',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Suscripción por licencia, alojado por el proveedor',
      },
    ],
    featuresTitle: "Lo que puedes construir",
    features: [
      { title: "Analítica de producto", body: "Usuarios activos, embudos, retención — las métricas en las que vive un equipo de producto.", thumb: "example-dashboard" },
      { title: "Métricas de repositorio y desarrollo", body: "Estrellas, PR, salud de CI — paneles de ingeniería con tus propios datos.", thumb: "example-github-dashboard" },
      { title: "Informes financieros", body: "Ingresos, gasto y margen de operación dispuestos como un informe para compartir.", thumb: "example-finance-report" },
      { title: "Operaciones en vivo", body: "Métricas en tiempo real que se refrescan a medida que se mueven los datos subyacentes.", thumb: "example-live-dashboard" },
      { title: "Redes y marketing", body: "Rendimiento de canales y seguimiento de campañas en una sola vista.", thumb: "example-social-media-dashboard" },
      { title: "Informes por sector", body: "Informes estructurados para cualquier ámbito — de lo clínico al trading.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Paneles que la gente creó con Open Design',
    galleryLead:
      'Paneles reales renderizados a partir de un prompt y una fuente de datos. Empieza por uno cercano al tuyo y describe las métricas que sigues.',
    gallery: [
      { thumb: "example-data-report", caption: "Informe de datos" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Panel de operaciones en vivo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Panel de análisis de trading" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de datos editorial" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de panel',
    faqTitle: 'Preguntas frecuentes sobre paneles',
    faq: [
      {
        q: '¿Necesito una herramienta de BI como Tableau o Looker?',
        a: 'No. Open Design renderiza paneles a HTML dentro de tu agente de programación. Describes las métricas y lo apuntas a tus datos; no hay una plataforma de BI aparte que licenciar o aprender.',
      },
      {
        q: '¿De dónde vienen los datos?',
        a: 'De un CSV, un endpoint JSON o filas que pegas. El panel es HTML y JavaScript puros, así que controlas exactamente de dónde lee — nada pasa por un servicio alojado.',
      },
      {
        q: '¿Pueden verlo compañeros no técnicos?',
        a: 'Sí. La salida es una página web autocontenida. Cualquiera con el enlace o el archivo puede abrirla en un navegador — sin cuenta, sin licencia.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y una docena más de adaptadores nativos. Aportas tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Construye tu panel esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte tus métricas en un panel que puedas alojar donde sea — en el agente que ya usas.',
  },
  slides: {
    title: 'Genera presentaciones con Open Design + Claude Code',
    description:
      'Convierte un esquema en una presentación diseñada y fiel a tu marca sin abrir una app de presentaciones. Open Design da a tu agente de programación plantillas de diapositivas y un sistema visual, renderizando las diapositivas a HTML que puedes presentar, exportar o compartir.',
    breadcrumb: 'Diapositivas',
    label: 'Caso de uso · Diapositivas',
    heading: 'Presentaciones que parecen diseñadas, escritas con un prompt',
    lead: 'Entrega a tu agente un esquema y un tono. Open Design aplica una plantilla de presentación y un sistema visual para que cada diapositiva quede maquetada, compuesta y fiel a tu marca — no una lista de viñetas sobre un fondo en blanco.',
    heroImageAlt:
      'Ilustración editorial de un esquema a la izquierda convirtiéndose en una secuencia de diapositivas de presentación diseñadas a la derecha',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte un esquema en una presentación HTML diseñada que tu agente renderiza en una sola sesión — preséntala en el navegador, expórtala a PDF o PPTX y guarda la fuente en tu repositorio.',
    stepsTitle: 'Cómo funcionan las presentaciones con Open Design',
    steps: [
      {
        title: 'Dale el esquema',
        body: 'Pega tus puntos clave o una estructura aproximada. El agente carga la habilidad de presentación para producir una secuencia de diapositivas maquetadas, no un único documento largo.',
        imageAlt: 'Ilustración de un esquema de texto siendo entregado a un agente',
      },
      {
        title: 'Elige un estilo de presentación',
        body: 'Open Design incluye plantillas de presentación — editorial, suizo-internacional, técnico oscuro y más. El agente aplica una para que la tipografía, la cuadrícula y los acentos se mantengan consistentes en cada diapositiva.',
        imageAlt: 'Ilustración de varias opciones de estilo de presentación dispuestas una al lado de otra',
      },
      {
        title: 'Genera las diapositivas',
        body: 'Cada punto se convierte en una diapositiva diseñada con la jerarquía adecuada — títulos, apoyos visuales, destacados de datos. Se renderiza a HTML, así que se presenta a pantalla completa en cualquier navegador.',
        imageAlt: 'Ilustración de una secuencia de diapositivas terminadas con un estilo consistente',
      },
      {
        title: 'Presenta, exporta, itera',
        body: 'Presenta desde el navegador, o exporta a PDF / PPTX para compartir. Refina hablando con el agente — «aprieta la diapositiva de datos, añade una llamada a la acción de cierre». La fuente de la presentación se queda en tu proyecto.',
        imageAlt: 'Ilustración de una presentación siendo presentada y exportada a varios formatos',
      },
    ],
    tableTitle: 'Presentaciones con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'PowerPoint / Keynote / herramientas de IA para diapositivas',
    tableRows: [
      {
        capability: 'Pasar del esquema a las diapositivas',
        withOd: 'Un prompt; el agente maqueta cada diapositiva',
        without: 'Construir cada diapositiva a mano, o pelearte con una plantilla',
      },
      {
        capability: 'Diseño consistente',
        withOd: 'Plantillas de presentación con una cuadrícula y un sistema tipográfico reales',
        without: 'Deriva del tema, alineación manual, valores por defecto fuera de marca',
      },
      {
        capability: 'Datos y diagramas',
        withOd: 'Gráficos y destacados renderizados como parte de la diapositiva',
        without: 'Pegar imágenes estáticas o rehacer los gráficos cada vez',
      },
      {
        capability: 'Formatos de exportación',
        withOd: 'HTML para presentar, además de exportación a PDF / PPTX',
        without: 'Atado al formato de una sola app',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'La fuente vive en tu repositorio, comparable',
        without: 'Archivo binario, sin diff con sentido',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Licencia de la app o complemento de IA por licencia',
      },
    ],
    featuresTitle: "Lo que puedes presentar",
    features: [
      { title: "Pitch decks", body: "Presentaciones para inversores y ventas con una narrativa fuerte y diapositivas de datos limpias.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Suizo / editorial", body: "Presentaciones tipográficas guiadas por cuadrícula que parecen dirigidas artísticamente.", thumb: "example-deck-swiss-international" },
      { title: "Módulos de curso", body: "Presentaciones didácticas con pasos claros, destacados y ritmo.", thumb: "example-html-ppt-course-module" },
      { title: "Presentaciones con gráficos de datos", body: "Presentaciones oscuras y centradas en gráficos para analítica y revisiones.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Modo presentador", body: "Presentaciones estilo Reveal creadas para presentar en vivo en el navegador.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Planos técnicos", body: "Presentaciones de arquitectura y conocimiento que mapean sistemas complejos.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Presentaciones que la gente creó con Open Design',
    galleryLead:
      'Presentaciones reales renderizadas a partir de un esquema. Elige un estilo cercano a tu charla y describe el contenido.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Presentación tipo revista editorial" },
      { thumb: "example-guizang-ppt", caption: "Keynote ilustrado" },
      { thumb: "example-deck-open-slide-canvas", caption: "Presentación de lienzo de diapositivas abierto" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Presentación con tema degradado" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de presentación',
    faqTitle: 'Preguntas frecuentes sobre diapositivas',
    faq: [
      {
        q: '¿Necesito PowerPoint o Keynote?',
        a: 'No. Open Design renderiza presentaciones a HTML dentro de tu agente de programación y puede exportar a PDF o PPTX. Presentas desde el navegador o entregas un archivo — no hace falta una app de presentaciones para crearla.',
      },
      {
        q: '¿Son solo viñetas generadas por IA?',
        a: 'No. El agente aplica una plantilla de presentación real con cuadrícula, escala tipográfica y jerarquía visual, así las diapositivas parecen diseñadas en lugar de autorrellenadas.',
      },
      {
        q: '¿Puedo exportar a PowerPoint para un cliente?',
        a: 'Sí. Las presentaciones se exportan a PPTX y PDF además del HTML desde el que presentas, así encajan con lo que sea que espere la audiencia.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Construye tu próxima presentación esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte tu esquema en una presentación diseñada — en el agente que ya usas.',
  },
  image: {
    title: 'Genera gráficos fieles a tu marca con Open Design + Claude Code',
    description:
      'Produce tarjetas para redes, portadas de artículos y gráficos de marketing a partir de un prompt — maquetados con tipografía real y tu sistema de marca, renderizados a HTML nítido que puedes exportar a PNG. Sin app de diseño, sin suscripción de plantillas.',
    breadcrumb: 'Imagen',
    label: 'Caso de uso · Imagen',
    heading: 'Gráficos fieles a tu marca, generados y maquetados por ti',
    lead: 'Describe la tarjeta o portada que necesitas. Open Design la compone con tipografía, cuadrícula y los colores de tu marca reales — luego la renderiza a HTML que puedes exportar como imagen, en vez de pelearte con una app de diseño o una plantilla genérica.',
    heroImageAlt:
      'Ilustración editorial de un prompt convirtiéndose en un conjunto de tarjetas para redes y portadas de artículos maquetadas',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte un prompt en un gráfico compuesto y fiel a tu marca que tu agente renderiza a HTML y exporta a PNG — repetible, versionado y libre de herramientas de diseño por licencia.',
    stepsTitle: 'Cómo funcionan los gráficos con Open Design',
    steps: [
      {
        title: 'Describe el gráfico',
        body: 'Di qué es — «una tarjeta de Twitter para nuestro lanzamiento con el titular y una cita». El agente carga la habilidad adecuada para componer un gráfico maquetado, no un bloque de texto plano.',
        imageAlt: 'Ilustración de una persona describiendo una tarjeta para redes que necesita',
      },
      {
        title: 'Aplica el sistema de marca',
        body: 'Open Design toma tus colores, tipografía y espaciado de un sistema de diseño reutilizable, así cada tarjeta cuadra con el resto de tu marca en vez de parecer algo aislado.',
        imageAlt: 'Ilustración de colores y tipografía de marca aplicándose a la maquetación de una tarjeta',
      },
      {
        title: 'Renderiza y exporta',
        body: 'El gráfico se renderiza a HTML en las dimensiones exactas que necesitas — tarjeta para redes, portada, banner — y luego se exporta a PNG. Texto nítido, maquetación real, sin ajustes a mano.',
        imageAlt: 'Ilustración de un gráfico renderizándose y exportándose a un archivo de imagen',
      },
      {
        title: 'Reutiliza la receta',
        body: 'Como es una plantilla, el siguiente gráfico está a un prompt de distancia — cambia el titular, conserva la maquetación. Las series de tarjetas quedan perfectamente consistentes.',
        imageAlt: 'Ilustración de una plantilla de tarjeta produciendo una serie consistente de gráficos',
      },
    ],
    tableTitle: 'Gráficos con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Apps de diseño / plantillas genéricas',
    tableRows: [
      {
        capability: 'Pasar de la idea al gráfico maquetado',
        withOd: 'Un prompt; el agente compone tipografía y maquetación',
        without: 'Abrir una app, colocar cada elemento a mano',
      },
      {
        capability: 'Mantener la marca',
        withOd: 'Colores y tipografía de un sistema de diseño reutilizable',
        without: 'Reelegir estilos de marca por archivo, o desviarte de la marca',
      },
      {
        capability: 'Serie consistente',
        withOd: 'Misma plantilla, nuevo texto — un conjunto perfectamente alineado',
        without: 'Realinear cada variante manualmente',
      },
      {
        capability: 'Exportación',
        withOd: 'HTML en dimensiones exactas, exportado a PNG',
        without: 'Dimensionado del lienzo y ajustes de exportación manuales',
      },
      {
        capability: 'Repetible',
        withOd: 'Una receta basada en prompt en tu repositorio',
        without: 'Un archivo aislado que recreas cada vez',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Herramienta de diseño por licencia o mercado de plantillas',
      },
    ],
    featuresTitle: "Lo que puedes crear",
    features: [
      { title: "Tarjetas para redes", body: "Tarjetas de X / Twitter compuestas con tu titular y tu marca.", thumb: "example-card-twitter" },
      { title: "Portadas de artículos", body: "Portadas editoriales, estilo revista, para publicaciones y boletines.", thumb: "example-article-magazine" },
      { title: "Tarjetas de Xiaohongshu", body: "Tarjetas estilo RedNote afinadas para ese feed.", thumb: "example-card-xiaohongshu" },
      { title: "Gráficos hero", body: "Visuales hero líquidos y con degradado para sitios y lanzamientos.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carruseles", body: "Carruseles para redes de varias diapositivas que se mantienen consistentes entre cuadros.", thumb: "example-social-carousel" },
      { title: "Marcos de maqueta de UI", body: "Marcos de notificación y de dispositivo para narrar el producto.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Gráficos que la gente creó con Open Design',
    galleryLead:
      'Tarjetas y portadas reales renderizadas a partir de un prompt. Elige una cercana a lo que necesitas e intercambia tu texto.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Tarjeta para redes en tonos pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Cartel editorial a tres tintas" },
      { thumb: "example-magazine-poster", caption: "Cartel estilo revista" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Portada editorial atrevida" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de gráficos',
    faqTitle: 'Preguntas frecuentes sobre imágenes',
    faq: [
      {
        q: '¿Es esto un generador de imágenes por IA como Midjourney?',
        a: 'No. Open Design compone gráficos con maquetación y tipografía reales — tu titular, tu marca, dimensiones exactas — y los renderiza a HTML que exportas como PNG. Es composición de diseño, no generación de píxeles.',
      },
      {
        q: '¿Puedo crear una serie consistente de tarjetas?',
        a: 'Sí. Como cada gráfico es una plantilla, conservas la maquetación y cambias el texto, así toda una serie se mantiene perfectamente alineada y fiel a la marca.',
      },
      {
        q: '¿Qué tamaños puede producir?',
        a: 'Cualquiera — el gráfico se renderiza en las dimensiones exactas que especifiques, desde una tarjeta cuadrada para redes hasta un banner ancho, y luego se exporta a PNG.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Crea tu próximo gráfico esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte un prompt en un gráfico fiel a tu marca — en el agente que ya usas.',
  },
  video: {
    title: 'Genera motion graphics y vídeo corto con Open Design + Claude Code',
    description:
      'Convierte un guion en cuadros animados y vídeo de formato corto — tarjetas de título, fondos en movimiento y cierres compuestos con tu sistema de marca y renderizados desde HTML. Sin suite de motion graphics, sin arrastrar por una línea de tiempo.',
    breadcrumb: 'Vídeo',
    label: 'Caso de uso · Vídeo',
    heading: 'Motion graphics a partir de un guion, no de una línea de tiempo',
    lead: 'Describe el momento que quieres — una aparición de título, una animación de datos, un cierre con logo. Open Design compone cuadros animados con tu sistema de marca y los renderiza a vídeo, sin suite de motion graphics.',
    heroImageAlt:
      'Ilustración editorial de un guion convirtiéndose en una secuencia de cuadros de vídeo animados',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design convierte un guion en cuadros animados y fieles a tu marca que tu agente renderiza a vídeo de formato corto — compuestos desde HTML, versionados en tu repositorio, sin editor de línea de tiempo que aprender.',
    stepsTitle: 'Cómo funciona el movimiento con Open Design',
    steps: [
      {
        title: 'Describe el momento',
        body: 'Di qué debe pasar — «un título con glitch que se resuelve en nuestro logo, luego una tarjeta de cierre». El agente carga la habilidad de movimiento para producir cuadros animados, no una imagen estática.',
        imageAlt: 'Ilustración de una persona describiendo una secuencia de movimiento',
      },
      {
        title: 'Aplica la marca y el estilo de movimiento',
        body: 'Open Design aporta plantillas de cuadro — fugas de luz cinematográficas, títulos con glitch, cierres con logo — y aplica tus colores y tipografía, así el movimiento se ve intencionado y fiel a la marca.',
        imageAlt: 'Ilustración de estilo de marca aplicado a cuadros animados',
      },
      {
        title: 'Renderiza los cuadros a vídeo',
        body: 'Los cuadros se componen en HTML y se renderizan a vídeo, así el ritmo y la maquetación son precisos y repetibles — sin keyframing manual en una línea de tiempo.',
        imageAlt: 'Ilustración de cuadros HTML renderizándose en un clip de vídeo',
      },
      {
        title: 'Itera y exporta',
        body: 'Refina hablando con el agente — «ralentiza la aparición del título, añade un subtítulo». Exporta clips de formato corto para redes o producto. La fuente se queda en tu proyecto.',
        imageAlt: 'Ilustración de un clip de vídeo siendo refinado y exportado para redes',
      },
    ],
    tableTitle: 'Movimiento con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'After Effects / suites de motion',
    tableRows: [
      {
        capability: 'Pasar del guion a cuadros animados',
        withOd: 'Un prompt; el agente compone la secuencia',
        without: 'Hacer keyframe de cada elemento en una línea de tiempo a mano',
      },
      {
        capability: 'Mantener la marca',
        withOd: 'Plantillas de cuadro + tus colores y tipografía',
        without: 'Rehacer el estilo de marca por proyecto',
      },
      {
        capability: 'Ritmo preciso y repetible',
        withOd: 'Compuesto en HTML, renderizado de forma determinista',
        without: 'Arrastre manual, difícil de reproducir',
      },
      {
        capability: 'Exportar para redes',
        withOd: 'Clips de formato corto renderizados a vídeo',
        without: 'Ajustes de exportación y lidiar con códecs',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'La fuente de los cuadros vive en tu repositorio, comparable',
        without: 'Archivo de proyecto binario, sin diff real',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, usa tus propias claves, funciona en local',
        without: 'Suite cara, curva de aprendizaje pronunciada',
      },
    ],
    featuresTitle: "Lo que puedes animar",
    features: [
      { title: "Hyperframes", body: "Secuencias de movimiento cuadro a cuadro compuestas desde HTML.", thumb: "example-video-hyperframes" },
      { title: "Formato corto para redes", body: "Clips verticales hechos para los feeds de redes.", thumb: "example-video-shortform" },
      { title: "Conjuntos de cuadros de movimiento", body: "Cuadros animados reutilizables que compones en un clip.", thumb: "example-motion-frames" },
      { title: "Fugas de luz cinematográficas", body: "Transiciones fílmicas y fondos atmosféricos.", thumb: "example-frame-light-leak-cinema" },
      { title: "Títulos con glitch", body: "Apariciones de título con movimiento y textura.", thumb: "example-frame-glitch-title" },
      { title: "Cierres con logo", body: "Animaciones de cierre con tu marca para cualquier clip.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Movimiento que la gente creó con Open Design',
    galleryLead:
      'Cuadros y clips animados reales renderizados a partir de un prompt. Elige uno cercano a tu idea y describe el movimiento.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Secuencia de Hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Fondo en movimiento líquido" },
      { thumb: "example-frame-macos-notification", caption: "Cuadro de UI animado" },
      { thumb: "example-frame-data-chart-nyt", caption: "Gráfico de datos animado" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas de movimiento',
    faqTitle: 'Preguntas frecuentes sobre vídeo',
    faq: [
      {
        q: '¿Necesito After Effects o una suite de motion graphics?',
        a: 'No. Open Design compone cuadros animados en HTML y los renderiza a vídeo dentro de tu agente de programación. No hay editor de línea de tiempo que aprender ni que licenciar.',
      },
      {
        q: '¿Para qué tipo de vídeo sirve?',
        a: 'Movimiento de formato corto — tarjetas de título, animaciones de datos, cierres con logo, clips para redes. Está hecho para movimiento de marca y producto, no para edición de largometraje.',
      },
      {
        q: '¿El ritmo es reproducible?',
        a: 'Sí. Como los cuadros se componen en código y se renderizan de forma determinista, obtienes el mismo resultado cada vez y puedes ajustarlo con precisión con un prompt.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Anima tu próxima idea esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y convierte un guion en movimiento — en el agente que ya usas.',
  },
  designSystem: {
    title: 'Crea y aplica un sistema de diseño con Open Design + Claude Code',
    description:
      'Captura tu marca como un sistema de diseño reutilizable que tu agente de programación aplica a cada artefacto — colores, tipografía, componentes y tono en un solo DESIGN.md. Defínelo una vez; cada prototipo, presentación y panel se mantiene fiel a la marca.',
    breadcrumb: 'Sistema de diseño',
    label: 'Caso de uso · Sistema de diseño',
    heading: 'Un sistema de diseño, aplicado a todo lo que crea tu agente',
    lead: 'Define tu marca una vez y Open Design la lleva a cada salida — prototipos, presentaciones, paneles, gráficos. El sistema vive en tu repositorio como un DESIGN.md que el agente lee, así la consistencia es automática, no manual.',
    heroImageAlt:
      'Ilustración editorial de un único sistema de diseño irradiando hacia muchos artefactos fieles a la marca',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design captura tu marca como un sistema de diseño portátil que tu agente aplica a cada artefacto — definido una vez en tu repositorio, aplicado en todas partes, sin una herramienta de diseño central que haga de guardián.',
    stepsTitle: 'Cómo funcionan los sistemas de diseño con Open Design',
    steps: [
      {
        title: 'Captura el sistema',
        body: 'Describe tu marca — colores, tipografía, espaciado, voz — o apunta el agente a un sitio existente para extraerla. Open Design lo escribe en un DESIGN.md que vive en tu proyecto.',
        imageAlt: 'Ilustración de una marca siendo capturada en un único archivo de sistema de diseño',
      },
      {
        title: 'Parte de una base probada',
        body: 'Open Design incluye más de 140 sistemas de diseño de referencia — de Apple y Linear a editoriales y brutalistas. Haz un fork de uno cercano a tu marca en vez de empezar desde una página en blanco.',
        imageAlt: 'Ilustración de una galería de sistemas de diseño de referencia siendo explorada',
      },
      {
        title: 'Aplícalo en todas partes',
        body: 'Cada otra habilidad lee el mismo sistema, así un prototipo, una presentación y un panel comparten un único lenguaje visual — sin que tengas que volver a especificarlo cada vez.',
        imageAlt: 'Ilustración de un sistema aplicado de forma consistente a muchos tipos de artefacto',
      },
      {
        title: 'Hazlo evolucionar en un solo lugar',
        body: 'Cambia el sistema y el siguiente renderizado lo refleja en todas partes. Como es un archivo en tu repositorio, las decisiones de diseño se revisan y versionan como código.',
        imageAlt: 'Ilustración de un sistema de diseño siendo actualizado y propagándose a todas las salidas',
      },
    ],
    tableTitle: 'Sistemas de diseño con Open Design frente al método tradicional',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Bibliotecas de herramientas de diseño / guías de estilo',
    tableRows: [
      {
        capability: 'Definir el sistema',
        withOd: 'Un DESIGN.md que el agente lee, forkeado de más de 140 referencias',
        without: 'Una guía de estilo estática o una biblioteca atada a una herramienta',
      },
      {
        capability: 'Aplicar a distintos tipos de artefacto',
        withOd: 'El mismo sistema alimenta prototipos, presentaciones, paneles, gráficos',
        without: 'Reimplementado por herramienta y por archivo',
      },
      {
        capability: 'Mantener todo consistente',
        withOd: 'Automático — cada habilidad lee una sola fuente',
        without: 'Disciplina manual; se desvía con el tiempo',
      },
      {
        capability: 'Hacer evolucionar la marca',
        withOd: 'Edita una vez; el siguiente renderizado se actualiza en todas partes',
        without: 'Buscar y reemplazar entre archivos y herramientas',
      },
      {
        capability: 'Revisión y versionado',
        withOd: 'Vive en tu repositorio, comparable como código',
        without: 'Enterrado en una herramienta de diseño, difícil de auditar',
      },
      {
        capability: 'Coste y dependencia del proveedor',
        withOd: 'Código abierto, portátil, funciona en local',
        without: 'Atado a una suscripción de herramienta de diseño',
      },
    ],
    featuresTitle: "Sistemas desde los que puedes partir",
    features: [
      { title: "Apple", body: "Estética limpia, contenida, de fuente del sistema.", thumb: "design-system-apple" },
      { title: "Linear", body: "Aspecto nítido de herramienta de producto con espaciado compacto.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Suave, centrado en documentos, cercano.", thumb: "design-system-notion" },
      { title: "Figma", body: "Energía lúdica, colorida, de herramienta creativa.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimalista, neutral, de nivel investigación.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Densa, técnica, nativa para desarrolladores.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Sistemas de diseño en Open Design',
    galleryLead:
      'Algunos de los más de 140 sistemas de referencia que puedes forkear como punto de partida. Elige uno cercano a tu marca y adáptalo.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Sistema estilo Airbnb" },
      { thumb: "design-system-vercel", caption: "Sistema estilo Vercel" },
      { thumb: "design-system-stripe", caption: "Sistema estilo Stripe" },
      { thumb: "design-system-spotify", caption: "Sistema estilo Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Explorar sistemas de diseño',
    faqTitle: 'Preguntas frecuentes sobre sistemas de diseño',
    faq: [
      {
        q: '¿Qué es exactamente el sistema de diseño aquí?',
        a: 'Un archivo DESIGN.md en tu repositorio que captura colores, tipografía, espaciado, componentes y voz. Cada habilidad de Open Design lo lee, así que tu marca se aplica automáticamente a lo que produzca el agente.',
      },
      {
        q: '¿Tengo que empezar desde cero?',
        a: 'No. Open Design incluye más de 140 sistemas de diseño de referencia que puedes forkear — de Apple y Linear a editoriales y brutalistas — y luego adaptar a tu marca.',
      },
      {
        q: '¿Cómo se mantiene consistente entre presentaciones, paneles y prototipos?',
        a: 'Porque todas esas habilidades leen el mismo DESIGN.md. Define el sistema una vez y la consistencia es automática en lugar de algo que vigilas a mano.',
      },
      {
        q: '¿Qué agentes puedo usar?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.',
      },
    ],
    ctaTitle: 'Define tu sistema de diseño esta noche',
    ctaBody:
      'Dale una estrella al repositorio, instala Open Design y dale a tu agente una sola marca que aplicar en todas partes — en el agente que ya usas.',
  },
  roleSoloBuilder: {
    title: 'Open Design para creadores en solitario e indie hackers',
    description:
      'Lanza como un equipo de una sola persona. Open Design convierte tu agente de programación en la mitad de diseño de tu startup: prototipos, landing pages, dashboards y gráficos de marca, todo a partir de un prompt, todo dentro de la marca, todo en tu repositorio.',
    breadcrumb: 'Creador en solitario',
    label: 'Para · Creadores en solitario',
    heading: 'Tu equipo de diseño es el agente que ya ejecutas',
    lead: 'Sin diseñador, sin presupuesto, sin traspasos. Describe lo que necesitas y tu agente lo renderiza: una landing page esta mañana, un dashboard esta tarde, tarjetas para redes antes de lanzar, todo compartiendo un sistema de diseño que definiste una sola vez.',
    heroImageAlt:
      'Ilustración editorial de una persona en un escritorio rodeada de una landing page, una app, un dashboard y tarjetas para redes, todo en un estilo coherente',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design es el departamento de diseño que un fundador en solitario nunca tuvo: del prompt al artefacto en cada superficie que tu producto necesita, dentro de una sola marca, sin traspasos y sin herramientas adicionales.',
    stepsTitle: 'Cómo usa Open Design un creador en solitario',
    steps: [
      {
        title: 'Define tu marca una sola vez',
        body: 'Captura colores, tipografía y voz en un DESIGN.md (o bifurca uno de los más de 140 sistemas de referencia). Cada artefacto que generes después estará automáticamente dentro de la marca.',
        imageAlt: 'Ilustración de un único archivo de definición de marca',
      },
      {
        title: 'Genera lo que necesites a continuación',
        body: 'Prototipo, landing page, dashboard, pitch deck, tarjeta para redes: el mismo agente, la misma marca, un prompt para cada uno. Sin cambiar de herramienta ni volver a pagar licencias.',
        imageAlt: 'Ilustración de muchos tipos de artefacto surgiendo de un solo prompt',
      },
      {
        title: 'Lánzalo: ya es real',
        body: 'Todo se renderiza a HTML / código en tu repositorio, así que el prototipo se convierte en el producto y la landing page sale en vivo. Sin maquetas desechables.',
        imageAlt: 'Ilustración de un artefacto que pasa directo del prompt a estar en vivo',
      },
    ],
    tableTitle: 'Construir en solitario con Open Design frente a hacerlo por las malas',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Arreglándotelas solo hoy',
    tableRows: [
      { capability: 'Cubrir cada superficie de diseño', withOd: 'Un agente hace prototipo, landing, dashboard y marca', without: 'Encadenar cinco herramientas SaaS y tutoriales' },
      { capability: 'Mantener la marca', withOd: 'Un DESIGN.md aplicado en todas partes automáticamente', without: 'Recrear el aspecto en cada herramienta; se desvía con el tiempo' },
      { capability: 'Avanzar a velocidad de una sola persona', withOd: 'De la idea al artefacto en un prompt', without: 'Aprender una herramienta de diseño para la que no tienes tiempo' },
      { capability: 'Lanzar, no maquetar', withOd: 'HTML / código en tu repositorio, listo para desplegar', without: 'Una maqueta que alguien todavía tiene que construir' },
      { capability: 'Coste', withOd: 'Open source, usa tus propias claves, se ejecuta localmente', without: 'Un montón de suscripciones por puesto' },
    ],
    featuresTitle: 'Lo que un creador en solitario puede lanzar',
    features: [
      { title: 'Landing pages', body: 'Landings de marketing y SaaS, navegables y en vivo.', thumb: 'example-saas-landing' },
      { title: 'Prototipos de producto', body: 'Apps web multipantalla para validar la idea.', thumb: 'example-web-prototype' },
      { title: 'Dashboards', body: 'Métricas y vistas de administración para tu producto.', thumb: 'example-dashboard' },
      { title: 'Gráficos de marca', body: 'Portadas y pósters que encajan con tu marca.', thumb: 'example-magazine-poster' },
      { title: 'Flujos móviles', body: 'Pantallas de app cuando vas más allá de la web.', thumb: 'example-mobile-app' },
      { title: 'Tarjetas para redes', body: 'Tarjetas de lanzamiento y novedades para cada canal.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Construido en solitario con Open Design',
    galleryLead:
      'Cada superficie que necesita una startup de una sola persona, a partir de un prompt. Elige una cercana a tu próximo movimiento y descríbela.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page SaaS' },
      { thumb: 'example-web-prototype', caption: 'Prototipo de producto' },
      { thumb: 'example-dashboard', caption: 'Dashboard de producto' },
      { thumb: 'example-card-twitter', caption: 'Tarjeta de lanzamiento para redes' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas',
    faqTitle: 'Preguntas frecuentes del creador en solitario',
    faq: [
      { q: 'No soy diseñador, ¿de verdad puedo usar esto?', a: 'Sí. Describes lo que quieres en lenguaje natural; el agente aplica un sistema de diseño y lo renderiza. La habilidad está en escribir el prompt, no en mover píxeles.' },
      { q: '¿Cubre todo o solo una cosa?', a: 'Todo lo que necesita un producto pequeño: prototipos, landing pages, dashboards, decks y gráficos, desde el mismo agente y la misma marca.' },
      { q: '¿En qué se convierten los resultados?', a: 'HTML / código real en tu repositorio, así que un prototipo puede convertirse en el producto y una landing page puede salir en vivo, en lugar de una maqueta que tiras.' },
      { q: '¿Qué agentes puedo usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.' },
    ],
    ctaTitle: 'Construye todo tu proyecto esta noche',
    ctaBody:
      'Marca el repositorio con una estrella, instala Open Design y deja que un agente sea tu equipo de diseño, dentro del agente que ya usas.',
  },
  roleDesigner: {
    title: 'Open Design para diseñadores',
    description:
      'Dedica tu tiempo al criterio, no a la faena. Open Design deja que tu agente se encargue del trabajo de producción repetitivo —variantes, estados, sistemas de diseño completos— mientras tú diriges el aspecto y tienes la última palabra.',
    breadcrumb: 'Diseñador',
    label: 'Para · Diseñadores',
    heading: 'Dirige el diseño: deja que el agente haga la producción',
    lead: 'Tú defines el sistema y el estándar; el agente renderiza las pantallas, los estados, las variantes y las composiciones de alta fidelidad. Menos mover rectángulos, más decidir qué significa que algo esté bien.',
    heroImageAlt:
      'Ilustración editorial de un diseñador dirigiendo mientras un agente completa pantallas, variantes y un sistema de diseño',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design es el asistente de producción que nunca se cansa: tú defines el sistema de diseño y aplicas el criterio; el agente genera el resto, dentro del sistema, en tu repositorio.',
    stepsTitle: 'Cómo usa Open Design un diseñador',
    steps: [
      {
        title: 'Codifica tu sistema',
        body: 'Convierte tu marca en un DESIGN.md: escala tipográfica, color, espaciado, componentes y voz. Esta es la fuente de verdad que el agente obedece.',
        imageAlt: 'Ilustración de un sistema de diseño capturado como un archivo',
      },
      {
        title: 'Genera la larga cola',
        body: 'Cada pantalla, estado y variante que de otro modo construirías a mano: el agente los renderiza dentro del sistema, así que el aburrido 80 % queda listo en minutos.',
        imageAlt: 'Ilustración de muchas pantallas dentro del sistema generadas a la vez',
      },
      {
        title: 'Dirige y refina',
        body: 'Critica con palabras: «aprieta el espaciado, haz el estado vacío más cálido». Tú tienes la última palabra; el agente hace las iteraciones.',
        imageAlt: 'Ilustración de un diseñador dando indicaciones y el diseño actualizándose',
      },
    ],
    tableTitle: 'Diseñar con Open Design frente a la forma manual',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Herramientas de diseño manuales',
    tableRows: [
      { capability: 'Construir un sistema de diseño', withOd: 'Un DESIGN.md que el agente aplica en todas partes', without: 'Una librería que mantienes a mano en cada herramienta' },
      { capability: 'Producir variantes y estados', withOd: 'Generados dentro del sistema a partir de un prompt', without: 'Duplicar frames y ajustar cada uno' },
      { capability: 'Composiciones de alta fidelidad', withOd: 'Renderizadas a HTML real, no una maqueta plana', without: 'Trabajo de píxeles que ingeniería reconstruye igualmente' },
      { capability: 'Mantener la coherencia', withOd: 'Un sistema, aplicado automáticamente', without: 'Disciplina manual; se desvía con el tiempo' },
      { capability: 'Traspaso', withOd: 'El artefacto es código: sin brecha de traducción', without: 'Documentos de especificación y redlines' },
    ],
    featuresTitle: 'Lo que un diseñador puede dirigir',
    features: [
      { title: 'Maquetas editoriales', body: 'Composiciones con dirección de arte, guiadas por rejilla.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Portadas de artículo', body: 'Portadas y reportajes estilo revista.', thumb: 'example-article-magazine' },
      { title: 'Pósters', body: 'Pósters tipográficos contundentes dentro de la marca.', thumb: 'example-magazine-poster' },
      { title: 'Sets para redes', body: 'Carruseles multipantalla coherentes.', thumb: 'example-social-carousel' },
      { title: 'Pantallas de app', body: 'Pantallas móviles y web de alta fidelidad.', thumb: 'example-mobile-app' },
      { title: 'Dashboards', body: 'Interfaces de datos que respetan tu sistema.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Dirigido con Open Design',
    galleryLead:
      'Trabajo de alta fidelidad y dentro del sistema que el agente produjo a partir de tu dirección. Elige uno cercano a tu estilo y refínalo.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Maqueta editorial' },
      { thumb: 'example-article-magazine', caption: 'Portada de revista' },
      { thumb: 'example-social-carousel', caption: 'Carrusel para redes' },
      { thumb: 'example-magazine-poster', caption: 'Póster tipográfico' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas',
    faqTitle: 'Preguntas frecuentes del diseñador',
    faq: [
      { q: '¿Esto me reemplaza?', a: 'No: reemplaza la faena. Tú defines el sistema y el criterio; el agente hace la producción repetitiva para que dediques tiempo a las decisiones que solo tú puedes tomar.' },
      { q: '¿Cómo mantengo el control del aspecto?', a: 'Tu DESIGN.md es el contrato. El agente renderiza dentro de él, y tú criticas con palabras hasta que esté bien.' },
      { q: '¿El resultado es editable / real?', a: 'Es HTML/CSS real, no una exportación plana, así que pasa directo a producción en lugar de reconstruirse.' },
      { q: '¿Qué agentes puedo usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.' },
    ],
    ctaTitle: 'Dirige tu próximo diseño esta noche',
    ctaBody:
      'Marca el repositorio con una estrella, instala Open Design y deja que el agente se encargue de la producción mientras tú aplicas el criterio, dentro del agente que ya usas.',
  },
  roleEngineering: {
    title: 'Open Design para ingenieros',
    description:
      'Sáltate el traspaso de diseño. Open Design convierte un DESIGN.md en front-end real que tu agente de programación escribe directamente: UI dentro del sistema, prototipos y dashboards, en el repositorio, sin viajes de ida y vuelta a Figma.',
    breadcrumb: 'Ingeniería',
    label: 'Para · Ingeniería',
    heading: 'De la especificación al front-end, sin traspaso de por medio',
    lead: 'Apunta tu agente a un DESIGN.md y una descripción; escribe código front-end real y dentro del sistema —componentes, pantallas, dashboards— directo en tu proyecto. Sin redlines, sin «esperando a diseño».',
    heroImageAlt:
      'Ilustración editorial de un DESIGN.md fluyendo directamente hacia código front-end y UI renderizada, saltándose un paso de traspaso',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design cierra la brecha de diseñador a ingeniero haciendo legible por máquina el sistema de diseño: el mismo agente que escribe tu código aplica el sistema y renderiza UI real.',
    stepsTitle: 'Cómo usa Open Design un ingeniero',
    steps: [
      {
        title: 'Lee el sistema, no un redline',
        body: 'El DESIGN.md vive en el repositorio. Tu agente lo lee igual que lee el resto del código base: sin especificaciones exportadas que interpretar.',
        imageAlt: 'Ilustración de un agente leyendo un DESIGN.md junto al código',
      },
      {
        title: 'Genera UI dentro del sistema',
        body: 'Describe la pantalla o el componente; el agente escribe front-end que ya encaja con el sistema. Prototipos, dashboards de administración, herramientas internas, en minutos.',
        imageAlt: 'Ilustración de código de UI generado para encajar con un sistema de diseño',
      },
      {
        title: 'Ya es tu código',
        body: 'El resultado es HTML / código de framework en tu repositorio, revisable en un PR. Sin paso de traducción entre «el diseño» y «la construcción».',
        imageAlt: 'Ilustración de UI generada que aterriza como un PR revisable',
      },
    ],
    tableTitle: 'Front-end con Open Design frente a la vía del traspaso',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Traspaso de diseño a desarrollo',
    tableRows: [
      { capability: 'Tener un diseño desde el que construir', withOd: 'Un DESIGN.md que tu agente lee directamente', without: 'Un archivo de Figma que reinterpretas a mano' },
      { capability: 'Encajar con el sistema', withOd: 'Aplicado automáticamente en el momento de generar', without: 'Comparar a ojo con una especificación; aparece la desviación' },
      { capability: 'Construir herramientas internas / dashboards', withOd: 'Prompt → front-end dentro del sistema en el repositorio', without: 'Esperar a un diseñador y luego construirlo dos veces' },
      { capability: 'Revisión', withOd: 'Es código: haz el diff en un PR', without: 'Comparar píxel a píxel con una maqueta' },
      { capability: 'Coste y dependencia', withOd: 'Open source, en tu repositorio, se ejecuta localmente', without: 'Una herramienta de diseño que todo el equipo debe licenciar' },
    ],
    featuresTitle: 'Lo que un ingeniero puede generar',
    features: [
      { title: 'UI de app web', body: 'Front-ends multipantalla a partir de una descripción.', thumb: 'example-web-prototype' },
      { title: 'Dashboards de desarrollo', body: 'Dashboards de repositorio, CI y métricas.', thumb: 'example-github-dashboard' },
      { title: 'Informes de datos', body: 'Informes estructurados a partir de tus datos.', thumb: 'example-data-report' },
      { title: 'Dashboards de administración', body: 'Herramientas internas y vistas de administración.', thumb: 'example-dashboard' },
      { title: 'Landing pages', body: 'Páginas de marketing sin esperar a diseño.', thumb: 'example-saas-landing' },
      { title: 'Kanban / tableros', body: 'Interfaces de flujos de trabajo internos.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Construido por ingenieros con Open Design',
    galleryLead:
      'Front-end real y dentro del sistema generado directo en el repositorio. Elige uno cercano a lo que estás construyendo y descríbelo.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'UI de app web' },
      { thumb: 'example-github-dashboard', caption: 'Dashboard de desarrollo' },
      { thumb: 'example-data-report', caption: 'Informe de datos' },
      { thumb: 'example-kanban-board', caption: 'UI de tablero interno' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas',
    faqTitle: 'Preguntas frecuentes de ingeniería',
    faq: [
      { q: '¿Sigo necesitando un diseñador?', a: 'Para marca y dirección, sí. Pero para construir UI dentro del sistema y herramientas internas, el agente lee el DESIGN.md y escribe el front-end, sin viaje de ida y vuelta de traspaso.' },
      { q: '¿Qué produce?', a: 'HTML / código de framework real en tu repositorio, revisable en un PR, no una maqueta que reimplementas.' },
      { q: '¿Cómo se mantiene dentro del sistema?', a: 'El DESIGN.md es la fuente de verdad; el agente lo aplica en el momento de generar, así que el resultado encaja sin comprobación manual de píxeles.' },
      { q: '¿Qué agentes puedo usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.' },
    ],
    ctaTitle: 'Genera tu próxima UI esta noche',
    ctaBody:
      'Marca el repositorio con una estrella, instala Open Design y convierte un DESIGN.md en front-end, dentro del agente que ya usas.',
  },
  roleProductManagers: {
    title: 'Open Design para product managers',
    description:
      'Deja de esperar al ancho de banda de diseño para comunicar una idea. Open Design permite a un PM convertir un prompt en un prototipo navegable o un wireframe, para alinear a las partes interesadas e informar al equipo, sin un ticket de diseño.',
    breadcrumb: 'Product Managers',
    label: 'Para · Product Managers',
    heading: 'Haz la idea navegable antes del kickoff',
    lead: 'Describe el flujo y tu agente renderiza un prototipo real y navegable que puedes poner hoy frente a las partes interesadas, para que las revisiones discutan la cosa de verdad, no un párrafo en un documento.',
    heroImageAlt:
      'Ilustración editorial de un PM convirtiendo una idea escrita en un prototipo navegable mostrado a las partes interesadas',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design le da a un PM una forma sin diseño de hacer tangibles las ideas: del prompt al prototipo para alinear e informar, sin gastar el presupuesto de diseño del equipo.',
    stepsTitle: 'Cómo usa Open Design un PM',
    steps: [
      {
        title: 'Describe el flujo',
        body: 'Escribe el recorrido del usuario en lenguaje natural: las pantallas, los estados, el camino feliz. No hace falta una herramienta de wireframing.',
        imageAlt: 'Ilustración de un PM describiendo un flujo de usuario',
      },
      {
        title: 'Obtén un prototipo navegable',
        body: 'El agente renderiza pantallas navegables por las que puedes hacer clic de verdad: mucho más claro que una diapositiva o un documento para una revisión con las partes interesadas.',
        imageAlt: 'Ilustración de un prototipo navegable producido a partir de una descripción',
      },
      {
        title: 'Alinea y traspasa',
        body: 'Comparte el enlace, recoge feedback sobre la cosa de verdad y luego pasa el prototipo a diseño/ingeniería como un punto de partida preciso y compartido.',
        imageAlt: 'Ilustración de un prototipo compartido para alinear y luego traspasado al equipo',
      },
    ],
    tableTitle: 'Trabajo de PM con Open Design frente a esperar a diseño',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Sin él hoy',
    tableRows: [
      { capability: 'Hacer tangible una idea', withOd: 'Prompt → prototipo navegable tú mismo', without: 'Abrir un ticket de diseño y esperar al ancho de banda' },
      { capability: 'Alinear a las partes interesadas', withOd: 'Hacen clic en el flujo de verdad', without: 'Leen un documento y se lo imaginan distinto' },
      { capability: 'Informar al equipo', withOd: 'Un prototipo concreto como especificación', without: 'Un muro de texto y un ir y venir' },
      { capability: 'Iterar antes de construir', withOd: 'Cámbialo en un prompt, vuelve a compartir', without: 'Otra ronda en la cola de diseño' },
      { capability: 'Coste', withOd: 'Open source, dentro del agente que ya usas', without: 'Horas de diseño gastadas en conceptos desechables' },
    ],
    featuresTitle: 'Lo que un PM puede poner frente a la gente',
    features: [
      { title: 'Flujos móviles', body: 'Recorridos de app de principio a fin, navegables.', thumb: 'example-mobile-app' },
      { title: 'Flujos de onboarding', body: 'Bienvenida → configuración → primer uso.', thumb: 'example-mobile-onboarding' },
      { title: 'Tableros y flujos de trabajo', body: 'Kanban e interfaces de proceso para especificaciones.', thumb: 'example-kanban-board' },
      { title: 'Dashboards', body: 'Vistas de métricas para enmarcar el problema.', thumb: 'example-dashboard' },
      { title: 'Prototipos web', body: 'Flujos web multipantalla para revisar.', thumb: 'example-web-prototype' },
      { title: 'Vistas de tendencias', body: 'Instantáneas de 30 días y de tendencias para dar contexto.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Prototipado por PMs con Open Design',
    galleryLead:
      'Flujos navegables renderizados a partir de una descripción, listos para una revisión con las partes interesadas. Elige uno cercano a tu idea y descríbelo.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Flujo móvil' },
      { thumb: 'example-mobile-onboarding', caption: 'Flujo de onboarding' },
      { thumb: 'example-kanban-board', caption: 'Tablero de flujo de trabajo' },
      { thumb: 'example-web-prototype', caption: 'Prototipo web' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas',
    faqTitle: 'Preguntas frecuentes del product manager',
    faq: [
      { q: 'No sé diseñar, ¿esto es para mí?', a: 'Sí. Describes el flujo con palabras; el agente lo hace navegable. Es para comunicar y alinear, sin necesidad de una herramienta de diseño.' },
      { q: '¿Es un prototipo real o una maqueta?', a: 'Real y navegable: la navegación y los estados funcionan, así que las partes interesadas reaccionan a la experiencia de verdad.' },
      { q: '¿Reemplaza al diseño?', a: 'No: le da a diseño e ingeniería un punto de partida preciso y compartido en lugar de una especificación de texto, y reserva el ancho de banda de diseño para el trabajo que lo necesita.' },
      { q: '¿Qué agentes puedo usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.' },
    ],
    ctaTitle: 'Haz tu idea navegable esta noche',
    ctaBody:
      'Marca el repositorio con una estrella, instala Open Design y convierte tu próxima especificación en algo en lo que la gente pueda hacer clic, dentro del agente que ya usas.',
  },
  roleMarketing: {
    title: 'Open Design para equipos de marketing',
    description:
      'Lanza campañas a velocidad de contenido. Open Design permite a tu agente producir landing pages, tarjetas para redes y visuales de campaña a partir de un prompt: dentro de la marca, bajo demanda, sin hacer cola en diseño.',
    breadcrumb: 'Marketing',
    label: 'Para · Marketing',
    heading: 'Visuales de campaña a la velocidad de un prompt',
    lead: 'Landing pages, tarjetas para redes, portadas, gráficos de anuncio: descritos con palabras, renderizados dentro de la marca, lanzados el mismo día. Sin ticket de diseño, sin pelearse con plantillas.',
    heroImageAlt:
      'Ilustración editorial de un profesional de marketing convirtiendo un brief en una landing page y un set de tarjetas de marca para redes',
    tldrTitle: 'En una línea',
    tldrBody:
      'Open Design es el recurso de diseño siempre disponible para marketing: del prompt al activo para landing pages y redes, dentro de la marca, para que las campañas salgan a la velocidad a la que escribes el copy.',
    stepsTitle: 'Cómo usa Open Design un equipo de marketing',
    steps: [
      {
        title: 'Fija la marca',
        body: 'Tu DESIGN.md guarda los colores, la tipografía y la voz. Cada activo que hace el agente está automáticamente dentro de la marca, sin reestilizar activo por activo.',
        imageAlt: 'Ilustración de un sistema de marca aplicado a activos de marketing',
      },
      {
        title: 'Genera la campaña',
        body: 'Landing page, tarjetas para redes, portadas, gráficos de anuncio: un prompt para cada uno, un set coherente en todos los canales.',
        imageAlt: 'Ilustración de un set completo de campaña generado a partir de prompts',
      },
      {
        title: 'Lanza e itera',
        body: 'Las landing pages se renderizan a HTML que puedes desplegar; los gráficos se exportan a PNG. Cambia el titular, vuelve a renderizar el set, sin esperar en una cola.',
        imageAlt: 'Ilustración de activos de campaña que se lanzan y se iteran rápidamente',
      },
    ],
    tableTitle: 'Marketing con Open Design frente al apuro de siempre',
    tableColCapability: 'Lo que necesitas',
    tableColWithOd: 'Con Open Design',
    tableColWithout: 'Sin él hoy',
    tableRows: [
      { capability: 'Lanzar una landing page', withOd: 'Prompt → página dentro de la marca, desplegable', without: 'Encargar a diseño o pelear con un creador de webs' },
      { capability: 'Un set de redes coherente', withOd: 'La misma plantilla, copy nuevo, perfectamente alineado', without: 'Realinear cada tarjeta a mano' },
      { capability: 'Mantener la marca', withOd: 'Un DESIGN.md aplicado a cada activo', without: 'Esperar que cada activo encaje con las directrices' },
      { capability: 'Avanzar a velocidad de campaña', withOd: 'Activo en un prompt, el mismo día', without: 'Hacer cola detrás del backlog de diseño' },
      { capability: 'Coste', withOd: 'Open source, sin herramienta de diseño por puesto', without: 'Suscripciones más horas de diseño' },
    ],
    featuresTitle: 'Lo que un equipo de marketing puede lanzar',
    features: [
      { title: 'Landing pages', body: 'Landings de campaña y producto, desplegables.', thumb: 'example-saas-landing' },
      { title: 'Tarjetas para redes', body: 'Tarjetas de X / Twitter dentro de la marca.', thumb: 'example-card-twitter' },
      { title: 'Carruseles', body: 'Sets multidiapositiva para redes, coherentes.', thumb: 'example-social-carousel' },
      { title: 'Pósters', body: 'Pósters de anuncio y de evento.', thumb: 'example-magazine-poster' },
      { title: 'Portadas de artículo', body: 'Portadas para blog y newsletter.', thumb: 'example-article-magazine' },
      { title: 'Páginas web', body: 'Microsites y páginas de campaña.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Lanzado por marketing con Open Design',
    galleryLead:
      'Activos de campaña dentro de la marca renderizados a partir de un prompt. Elige uno cercano a tu campaña y cambia el copy por el tuyo.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Landing page de campaña' },
      { thumb: 'example-card-twitter', caption: 'Tarjeta para redes' },
      { thumb: 'example-social-carousel', caption: 'Carrusel para redes' },
      { thumb: 'example-magazine-poster', caption: 'Póster de anuncio' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Explorar plantillas',
    faqTitle: 'Preguntas frecuentes de marketing',
    faq: [
      { q: '¿Necesitamos un diseñador para cada activo?', a: 'No. El agente renderiza landing pages y activos para redes dentro de la marca a partir de un prompt, así que el equipo lanza el trabajo rutinario de campaña sin hacer cola en diseño.' },
      { q: '¿Cómo se mantienen los activos dentro de la marca?', a: 'Tu DESIGN.md se aplica a todo automáticamente: colores, tipografía y voz se trasladan a cada activo.' },
      { q: '¿Las landing pages pueden salir de verdad en vivo?', a: 'Sí: se renderizan a HTML que puedes desplegar, y los gráficos se exportan a PNG. Son activos listos para lanzar, no maquetas.' },
      { q: '¿Qué agentes puedo usar?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI y más adaptadores nativos, con tus propias claves de proveedor.' },
    ],
    ctaTitle: 'Lanza tu próxima campaña esta noche',
    ctaBody:
      'Marca el repositorio con una estrella, instala Open Design y convierte los briefs en activos dentro de la marca, dentro del agente que ya usas.',
  },
};
