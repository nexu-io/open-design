import type { PromptTemplateSummary } from '../types';

export const ES_ES_SKILL_COPY: Record<string, { description?: string; examplePrompt?: string }> = {
  '8-bit-orbit-video-template': {
    description:
      'Plantilla de vídeo basada en HyperFrames para diseño de movimiento de presentaciones con estética pixel retro.\nÚsala cuando los usuarios quieran una composición de HTML a vídeo multiescena de alta fidelidad\ncon transiciones avanzadas, controles de previsualización interactivos y un estilo\npredeterminado listo para renderizar.',
    examplePrompt:
      'Crea una presentación de vídeo de 3 páginas con HyperFrames en estilo retro de 8 bits, con transiciones avanzadas, movimiento intenso y cada página por debajo de 3 segundos.',
  },
  'ad-creative': {
    description:
      'Genera e itera creatividades publicitarias, incluidos titulares, descripciones y texto principal. Útil para la iteración de anuncios de búsqueda y social de pago.',
    examplePrompt:
      'Genera e itera creatividades publicitarias, incluidos titulares, descripciones y texto principal.',
  },
  'after-hours-editorial-template': {
    description:
      'Plantilla de HyperFrames de estilo editorial oscuro y lujoso para storyboards cinematográficos de tres páginas,\ninspirada en las tarjetas de título de la alta costura y en las dobles páginas de capítulo de revista. Úsala cuando el\nusuario pida páginas de movimiento de estilo moda premium, una narrativa atmosférica con serifas protagonistas\no una estética de presentación oscura de gama alta con transiciones intensas.',
    examplePrompt:
      'Crea una secuencia editorial de HyperFrames de tres páginas en un estilo oscuro de alta costura: tipografía serif premium, acento magenta, transiciones de capítulo elegantes y grano cinematográfico. Mantén cada página por debajo de 3 segundos.',
  },
  'agent-browser': {
    description:
      'CLI de automatización de navegador para agentes de IA. Úsalo cuando el usuario necesite inspeccionar,\nprobar o automatizar el comportamiento del navegador: navegar por páginas, rellenar formularios,\nhacer clic en botones, tomar capturas de pantalla, extraer datos de páginas, leer el contexto\nseleccionado de pestañas del navegador en Open Design, probar aplicaciones web, hacer dogfooding de\nlas previsualizaciones de Open Design, QA, búsqueda de errores o revisar la calidad de la aplicación. Prioriza las URL\nde previsualización locales de Open Design salvo que el usuario pida explícitamente navegación externa.',
    examplePrompt:
      'CLI de automatización de navegador para agentes de IA.',
  },
  'ai-music-album': {
    description:
      'Producción de álbumes musicales con IA de ciclo completo: concepto, redacción de letras, secuenciación de pistas y exportación. Útil para experimentos de álbumes independientes y bandas sonoras de marca.',
    examplePrompt:
      'Producción de álbumes musicales con IA de ciclo completo: concepto, redacción de letras, secuenciación de pistas y exportación.',
  },
  'algorithmic-art': {
    description:
      'Crea arte generativo con p5.js usando aleatoriedad con semilla para que cada render sea reproducible. Útil para carteles procedurales, imágenes fijas con estilo de movimiento y estudios artísticos de fotogramas.',
    examplePrompt:
      'Crea arte generativo con p5.js usando aleatoriedad con semilla para que cada render sea reproducible.',
  },
  'apple-hig': {
    description:
      'Las Human Interface Guidelines de Apple como 14 habilidades de agente que abarcan plataformas, fundamentos, componentes, patrones, entradas y tecnologías para iOS, macOS, visionOS, watchOS y tvOS.',
    examplePrompt:
      'Las Human Interface Guidelines de Apple como 14 habilidades de agente que abarcan plataformas, fundamentos, componentes, patrones, entradas y tecnologías para iOS, macOS, visionOS, watchOS y tvOS.',
  },
  'article-magazine': {
    description:
      'Diseño de artículo de revista inspirado en Huashu / huashu-md-html para convertir Markdown o notas en un ensayo HTML de formato largo y pulido.',
    examplePrompt:
      'Usa la plantilla Magazine Article para convertir mi contenido en un ensayo HTML de formato largo inspirado en Huashu / huashu-md-html. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'artifacts-builder': {
    description:
      'Conjunto de herramientas para crear artefactos HTML de claude.ai elaborados y multicomponente usando tecnologías web frontend modernas (React, Tailwind CSS, shadcn/ui).',
    examplePrompt:
      'Conjunto de herramientas para crear artefactos HTML de claude.ai elaborados y multicomponente usando tecnologías web frontend modernas (React, Tailwind CSS, shadcn/ui).',
  },
  'brainstorming': {
    description:
      'Transforma ideas en bruto en diseños plenamente desarrollados mediante preguntas estructuradas y la exploración de alternativas. Útil en las primeras fases del trabajo conceptual.',
    examplePrompt:
      'Transforma ideas en bruto en diseños plenamente desarrollados mediante preguntas estructuradas y la exploración de alternativas.',
  },
  'brand-guidelines': {
    description:
      'Aplica los colores de marca y la tipografía oficiales de Anthropic a los artefactos para lograr una identidad visual coherente y estándares de diseño profesionales. Una referencia para dar forma a la tuya propia.',
    examplePrompt:
      'Aplica los colores de marca y la tipografía oficiales de Anthropic a los artefactos para lograr una identidad visual coherente y estándares de diseño profesionales.',
  },
  'brandkit': {
    description:
      'Habilidad premium de generación de imágenes para kits de marca, orientada a crear tableros de directrices de marca de gama alta, sistemas de logotipos, presentaciones de identidad y propuestas de mundo visual. Entrenada para sistemas de marca minimalistas, cinematográficos, editoriales, dark-tech, de lujo, culturales, de seguridad, de videojuegos, de herramientas para desarrolladores y de aplicaciones de consumo. Optimizada para la conceptualización intencional de logotipos, la composición refinada, la tipografía sobria, el significado simbólico potente, los mockups premium, la imaginería con dirección de arte y los layouts de cuadrícula flexibles.',
    examplePrompt:
      'Crea una imagen premium de resumen de kit de marca para este producto: dirección del logotipo, paleta, tipografía, aplicaciones y un mundo visual coherente.',
  },
  'industrial-brutalist-ui': {
    description:
      'Interfaces mecánicas en bruto que fusionan la tipografía impresa suiza con la estética de los terminales militares. Cuadrículas rígidas, contraste extremo de escala tipográfica, color utilitario, efectos de degradación analógica. Para dashboards con gran densidad de datos, portafolios o sitios editoriales que necesitan transmitir la sensación de planos desclasificados.',
    examplePrompt:
      'Crea una interfaz industrial-brutalista con cuadrículas rígidas, motivos de telemetría táctica, tipografía contundente y precisión mecánica.',
  },
  'canvas-design': {
    description:
      'Crea bellas obras de arte visual en documentos PNG y PDF aplicando filosofía de diseño y principios estéticos para carteles, ilustraciones y piezas estáticas.',
    examplePrompt:
      'Crea bellas obras de arte visual en documentos PNG y PDF aplicando filosofía de diseño y principios estéticos para carteles, ilustraciones y piezas estáticas.',
  },
  'card-twitter': {
    description:
      'Tarjeta de cita o de datos para Twitter diseñada para acompañar una publicación.',
    examplePrompt:
      'Usa la plantilla Twitter Share Card para convertir mi contenido en una tarjeta de cita o de datos para Twitter diseñada para acompañar una publicación. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'card-xiaohongshu': {
    description:
      'Tarjetas de conocimiento al estilo Xiaohongshu, organizadas como un carrusel deslizable de varias tarjetas.',
    examplePrompt:
      'Usa la plantilla Xiaohongshu Card para convertir mi contenido en un carrusel deslizable de tarjetas de conocimiento al estilo Xiaohongshu. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'color-expert': {
    description:
      'Habilidad experta en ciencia del color con 286K palabras de material de referencia que abarcan OKLCH/OKLAB, generación de paletas, accesibilidad/contraste, nomenclatura de colores, mezcla de pigmentos y teoría histórica del color.',
    examplePrompt:
      'Habilidad experta en ciencia del color con 286K palabras de material de referencia que abarcan OKLCH/OKLAB, generación de paletas, accesibilidad/contraste, nomenclatura de colores, mezcla de pigmentos y teoría histórica del color.',
  },
  'competitive-ads-extractor': {
    description:
      'Extrae y analiza los anuncios de la competencia desde las bibliotecas de anuncios para entender los mensajes y los enfoques creativos que conectan.',
    examplePrompt:
      'Extrae y analiza los anuncios de la competencia desde las bibliotecas de anuncios para entender los mensajes y los enfoques creativos que conectan.',
  },
  'copywriting': {
    description:
      'Redacta y reescribe textos de marketing para landing pages, páginas de inicio y anuncios. Útil como socio jefe de redacción durante los lanzamientos.',
    examplePrompt:
      'Redacta y reescribe textos de marketing para landing pages, páginas de inicio y anuncios.',
  },
  'creative-director': {
    description:
      'Director creativo de IA con autoevaluación recursiva: más de 20 metodologías (SIT, TRIZ, biasociación, SCAMPER, sinéctica), evaluación en 3 ejes calibrada frente a Cannes/D&AD/HumanKind y un proceso de 5 fases que va del brief a la presentación.',
    examplePrompt:
      'Director creativo de IA con autoevaluación recursiva: más de 20 metodologías (SIT, TRIZ, biasociación, SCAMPER, sinéctica), evaluación en 3 ejes calibrada frente a Cannes/D&AD/HumanKind y un proceso de 5 fases que va del brief a la presentación.',
  },
  'd3-visualization': {
    description:
      'Enseña al agente a producir gráficos D3 y visualizaciones de datos interactivas. Una skill completa de D3.js con ejemplos de distintos tipos de gráficos y técnicas que dotan al agente de conocimiento experto para generar visualizaciones complejas e interactivas. Útil para cuadros de mando editoriales, informes, prototipos ricos en datos y gráficos explicativos.',
    examplePrompt:
      'Enseña al agente a producir gráficos D3 y visualizaciones de datos interactivas.',
  },
  'data-report': {
    description:
      'Convierte datos en CSV, Excel o JSON en una página de informe visual pulida.',
    examplePrompt:
      'Usa la plantilla Data Visualization Report para convertir mis datos en CSV, Excel o JSON en una página de informe visual pulida. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'deck-guizang-editorial': {
    description:
      'Revista editorial se encuentra con tinta electrónica: 10 diseños y 5 paletas (Ink, Indigo Porcelain, Forest Ink, Kraft Paper, Dune).',
    examplePrompt:
      'Usa la plantilla Guizang Editorial E-Ink Deck para convertir mi contenido en una presentación horizontal de revista editorial x tinta electrónica con 10 diseños y 5 paletas. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'deck-open-slide-canvas': {
    description:
      'Presentación de lienzo fijo de 1920x1080 con composición libre a nivel de componentes React, no ligada a una plantilla fija.',
    examplePrompt:
      'Usa la plantilla Open-Slide 1920 Canvas Deck para convertir mi contenido en una presentación de composición libre fija de 1920x1080 con diseño a nivel de componentes React. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'deck-swiss-international': {
    description:
      'Cuadrícula de 16 columnas, un color de acento saturado y 22 diseños fijos (Klein Blue, Lemon, Mint, Safety Orange).',
    examplePrompt:
      'Usa la plantilla Swiss International Deck para convertir mi contenido en una presentación con cuadrícula de 16 columnas, un color de acento saturado y 22 diseños fijos. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'design-brief': {
    description:
      'Analiza un brief de diseño estructurado escrito en formato de protocolo I-Lang y lo convierte en\nuna especificación de diseño concreta. Elimina la ambigüedad de peticiones imprecisas como\n"hazlo profesional" al exigir dimensiones explícitas: paleta, tipografía,\ndiseño, ambiente, densidad y restricciones.\nPalabras clave de activación: "design brief", "create a design brief", "ilang brief", "structured brief".',
    examplePrompt:
      'Analiza un brief de diseño estructurado escrito en formato de protocolo I-Lang y lo convierte en una especificación de diseño concreta.',
  },
  'design-consultation': {
    description:
      'Construye un sistema de diseño completo desde cero con riesgos creativos y maquetas de producto realistas. Útil para talleres de arranque y trabajo de marca desde cero.',
    examplePrompt:
      'Construye un sistema de diseño completo desde cero con riesgos creativos y maquetas de producto realistas.',
  },
  'design-md': {
    description:
      'Crea y gestiona archivos DESIGN.md. Útil para capturar la dirección de diseño, los tokens y las reglas visuales en una única fuente de verdad.',
    examplePrompt:
      'Crea y gestiona archivos DESIGN.md.',
  },
  'design-review': {
    description:
      'Designer Who Codes: auditoría visual seguida de correcciones con commits atómicos y capturas de pantalla de antes y después. Útil para pulir la interfaz ya entregada antes del lanzamiento.',
    examplePrompt:
      'Designer Who Codes: auditoría visual seguida de correcciones con commits atómicos y capturas de pantalla de antes y después.',
  },
  'digits-fintech-swiss-template': {
    description:
      'Plantilla de presentación fintech con cuadrícula suiza en contraste de negro / papel cálido / verde lima neón.\nÚsala cuando los usuarios pidan diapositivas premium de relato de datos con un diseño modular estricto,\ntarjetas numéricas llamativas, movimiento contenido y navegación por teclado/clic en un único archivo HTML.',
    examplePrompt:
      'Crea una presentación de estrategia fintech con cuadrícula suiza, tarjetas de datos modulares, acentos en verde lima y una navegación por teclado limpia.',
  },
  'doc': {
    description:
      'Lee, crea y edita documentos .docx con fidelidad de formato y diseño mediante la skill de documentos de OpenAI.',
    examplePrompt:
      'Lee, crea y edita documentos .docx con fidelidad de formato y diseño mediante la skill de documentos de OpenAI.',
  },
  'doc-kami-parchment': {
    description:
      'Lienzo de pergamino cálido (#f5f4ed), acento monocromo en azul tinta (#1B365D), una sola familia con serifa y tipografía de grado editorial.',
    examplePrompt:
      'Usa la plantilla Kami Parchment Document para convertir mi contenido en un documento de pergamino cálido con acentos monocromos en azul tinta, una sola familia con serifa y tipografía de grado editorial. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'docx': {
    description:
      'Crea, edita y analiza documentos de Word con cambios registrados, comentarios y formato. Útil para briefs de diseño, documentos de textos y entregables listos para revisión.',
    examplePrompt:
      'Crea, edita y analiza documentos de Word con cambios registrados, comentarios y formato.',
  },
  'domain-name-brainstormer': {
    description:
      'Genera ideas creativas de nombres de dominio y comprueba su disponibilidad en múltiples TLD, incluidos .com, .io, .dev y .ai.',
    examplePrompt:
      'Genera ideas creativas de nombres de dominio y comprueba su disponibilidad en múltiples TLD, incluidos .com, .io, .dev y .ai.',
  },
  'ecommerce-image-workflow': {
    description:
      'Flujo de trabajo de imágenes de ecommerce basado en producto de referencia para generar un conjunto compacto\nde imágenes principales, de características y de estilo de vida fieles al producto a partir de fotos reales\nde referencia del producto. La V1 requiere imágenes de producto subidas y aplaza intencionadamente\nla generación de conceptos solo a partir del brief y las exportaciones por lotes específicas de cada plataforma.',
    examplePrompt:
      'Usa el Ecommerce Image Workflow para convertir la foto de referencia del producto que he subido\nen un conjunto compacto de imágenes de ecommerce: un packshot principal, una imagen que\ndestaque una característica y una escena de estilo de vida. Conserva la identidad exacta del producto,\nel color, el material, la ubicación del logo, la estructura y las proporciones.',
  },
  'editorial-burgundy-principles-template': {
    description:
      'Plantilla de presentación de estudio editorial en paleta burdeos / rosa empolvado / dorado apagado.\nÚsala cuando los usuarios pidan diapositivas premium de manifiesto o de cultura con etiquetas tipo píldora,\ngrandes declaraciones tipográficas, tarjetas de principios y navegación guiada por teclado/clic.',
    examplePrompt:
      'Crea una presentación editorial premium en burdeos y rosa empolvado con una diapositiva de nube de etiquetas y una cuadrícula de tarjetas de ocho principios.',
  },
  'emilkowalski-motion': {
    description:
      'Skill complementaria de diseño de movimiento inspirada en las pautas de animación de Emil Kowalski. Úsala una vez que exista una interfaz para añadir microinteracciones con gusto, transiciones de estado y movimiento de página con la contención propia de un producto.',
    examplePrompt:
      'Usa emilkowalski-motion en el artefacto HTML actual: añade microinteracciones contenidas, transiciones de estado y alternativas con movimiento reducido sin cambiar el diseño principal.',
  },
  'enhance-prompt': {
    description:
      'Mejora los prompts con especificaciones de diseño y vocabulario de UI/UX. Útil para flujos de trabajo de diseño a código y para aclarar peticiones de resultados visuales.',
    examplePrompt:
      'Mejora los prompts con especificaciones de diseño y vocabulario de UI/UX.',
  },
  'export-download-debugging': {
    description:
      'Diagnostica y corrige fallos de exportación/descarga en navegador, vista previa o Electron, especialmente problemas de exportación de imágenes relacionados con Guardar como, Blob/Data URL, la File System Access API, fallos de createWritable y archivos de 0 KB.',
    examplePrompt:
      'Diagnostica y corrige fallos de exportación/descarga en navegador, vista previa o Electron, especialmente problemas de exportación de imágenes relacionados con Guardar como, Blob/Data URL, la File System Access API, fallos de createWritable y archivos de 0 KB.',
  },
  'fal-3d': {
    description:
      'Genera modelos 3D a partir de texto o imágenes mediante fal.ai. Útil para recursos de videojuegos, vistas previas de AR, maquetas de producto y escultura de conceptos.',
    examplePrompt:
      'Genera modelos 3D a partir de texto o imágenes mediante fal.ai.',
  },
  'fal-generate': {
    description:
      'Genera imágenes y vídeos usando los modelos de IA de fal.ai. Catálogo de nivel profesional que abarca Flux, SDXL, ideogram y otros endpoints alojados por la comunidad.',
    examplePrompt:
      'Genera imágenes y vídeos usando los modelos de IA de fal.ai.',
  },
  'fal-image-edit': {
    description:
      'Edición de imágenes con IA: transferencia de estilo, eliminación de fondo, eliminación de objetos e inpainting mediante modelos alojados en fal.ai.',
    examplePrompt:
      'Edición de imágenes con IA: transferencia de estilo, eliminación de fondo, eliminación de objetos e inpainting mediante modelos alojados en fal.ai.',
  },
  'fal-kling-o3': {
    description:
      'Genera imágenes y vídeos con Kling O3 —la familia de modelos más potente de Kling— mediante fal.ai.',
    examplePrompt:
      'Genera imágenes y vídeos con Kling O3 —la familia de modelos más potente de Kling— mediante fal.ai.',
  },
  'fal-lip-sync': {
    description:
      'Crea vídeos de presentador virtual y sincroniza el audio con los labios en vídeo mediante fal.ai. Útil para avatares explicativos, vistas previas de doblaje multilingüe y cortes para redes sociales.',
    examplePrompt:
      'Crea vídeos de presentador virtual y sincroniza el audio con los labios en vídeo mediante fal.ai.',
  },
  'fal-realtime': {
    description:
      'Generación de imágenes con IA en tiempo real y por streaming mediante fal.ai. Ideal para explorar moodboards, crear variaciones de borrador e iterar creativamente con rapidez.',
    examplePrompt:
      'Generación de imágenes con IA en tiempo real y por streaming mediante fal.ai.',
  },
  'fal-restore': {
    description:
      'Restaura y corrige la calidad de las imágenes: elimina el desenfoque y el ruido, arregla rostros y restaura documentos antiguos usando los modelos de restauración alojados en fal.ai.',
    examplePrompt:
      'Restaura y corrige la calidad de las imágenes: elimina el desenfoque y el ruido, arregla rostros y restaura documentos antiguos usando los modelos de restauración alojados en fal.ai.',
  },
  'fal-train': {
    description:
      'Entrena modelos de IA personalizados (LoRA) en fal.ai para una generación de imágenes adaptada a una marca, un personaje o un estilo.',
    examplePrompt:
      'Entrena modelos de IA personalizados (LoRA) en fal.ai para una generación de imágenes adaptada a una marca, un personaje o un estilo.',
  },
  'fal-tryon': {
    description:
      'Prueba virtual: comprueba cómo le queda la ropa a una persona mediante los modelos de prueba virtual alojados en fal.ai. Útil para comercio electrónico, lookbooks y experimentos de estilismo.',
    examplePrompt:
      'Prueba virtual: comprueba cómo le queda la ropa a una persona mediante los modelos de prueba virtual alojados en fal.ai.',
  },
  'fal-upscale': {
    description:
      'Amplía y mejora la resolución de imágenes y vídeos usando modelos de superresolución con IA alojados en fal.ai.',
    examplePrompt:
      'Amplía y mejora la resolución de imágenes y vídeos usando modelos de superresolución con IA alojados en fal.ai.',
  },
  'fal-video-edit': {
    description:
      'Edita vídeos existentes con IA: reinterpreta el estilo, amplía la resolución, elimina el fondo y añade audio mediante los modelos de vídeo alojados en fal.ai.',
    examplePrompt:
      'Edita vídeos existentes con IA: reinterpreta el estilo, amplía la resolución, elimina el fondo y añade audio mediante los modelos de vídeo alojados en fal.ai.',
  },
  'fal-vision': {
    description:
      'Analiza imágenes: segmenta objetos, detecta, ejecuta OCR, describe y responde preguntas visuales mediante los modelos de visión de fal.ai.',
    examplePrompt:
      'Analiza imágenes: segmenta objetos, detecta, ejecuta OCR, describe y responde preguntas visuales mediante los modelos de visión de fal.ai.',
  },
  'faq-page': {
    description:
      'Una página de Preguntas Frecuentes (FAQ) con secciones de acordeón plegables,\nfunción de búsqueda y filtrado por categorías. Úsala cuando el briefing pida\n«FAQ», «centro de ayuda», «preguntas» o «página de soporte».',
    examplePrompt:
      'Una página de Preguntas Frecuentes (FAQ) con secciones de acordeón plegables, función de búsqueda y filtrado por categorías.',
  },
  'field-notes-editorial-template': {
    description:
      'Plantilla de informe editorial «Field Notes» con fondo de papel suave, tipografía\ncon serifa para el titular, tarjetas de hallazgos redondeadas en tonos pastel y un panel\ncon gráfico de retención.\nÚsala cuando los usuarios pidan un informe de empresa premium estilo revista, un memorando\nde una página para el consejo o un diseño elegante de narrativa de datos.',
    examplePrompt:
      'Crea un informe editorial estilo Field Notes con tres tarjetas de hallazgos, bloques de métricas clave y un gráfico de líneas de retención en una pulida página HTML de un solo archivo.',
  },
  'figma-code-connect-components': {
    description:
      'Conecta los componentes de diseño de Figma con los componentes de código mediante Code Connect para que las actualizaciones del sistema de diseño fluyan automáticamente al código.',
    examplePrompt:
      'Conecta los componentes de diseño de Figma con los componentes de código mediante Code Connect para que las actualizaciones del sistema de diseño fluyan automáticamente al código.',
  },
  'figma-create-design-system-rules': {
    description:
      'Genera reglas de sistema de diseño específicas del proyecto para flujos de trabajo de Figma a código. Útil para capturar tokens, nomenclatura y reglas de lint en una única fuente.',
    examplePrompt:
      'Genera reglas de sistema de diseño específicas del proyecto para flujos de trabajo de Figma a código.',
  },
  'figma-create-new-file': {
    description:
      'Crea un archivo nuevo y en blanco de Figma Design o FigJam. Útil como primer paso en flujos de trabajo automatizados de sistemas de diseño o talleres.',
    examplePrompt:
      'Crea un archivo nuevo y en blanco de Figma Design o FigJam.',
  },
  'figma-generate-design': {
    description:
      'Crea o actualiza pantallas en Figma a partir de código o de una descripción usando componentes del sistema de diseño. Traslada las páginas de la app a Figma usando design tokens.',
    examplePrompt:
      'Crea o actualiza pantallas en Figma a partir de código o de una descripción usando componentes del sistema de diseño.',
  },
  'figma-generate-library': {
    description:
      'Crea o actualiza una biblioteca de sistema de diseño de nivel profesional en Figma a partir de una base de código. Útil para mantener la fuente de verdad de Figma sincronizada con los componentes publicados.',
    examplePrompt:
      'Crea o actualiza una biblioteca de sistema de diseño de nivel profesional en Figma a partir de una base de código.',
  },
  'figma-implement-design': {
    description:
      'Traduce diseños de Figma a código listo para producción con una fidelidad visual de 1:1. Útil para entregar frames de Figma directamente a un agente de frontend.',
    examplePrompt:
      'Traduce diseños de Figma a código listo para producción con una fidelidad visual de 1:1.',
  },
  'figma-use': {
    description:
      'Ejecuta scripts de la API de plugins de Figma para escrituras en el lienzo, inspecciones, variables y trabajo con sistemas de diseño. Requisito previo para todas las demás skills de Figma de este catálogo.',
    examplePrompt:
      'Ejecuta scripts de la API de plugins de Figma para escrituras en el lienzo, inspecciones, variables y trabajo con sistemas de diseño.',
  },
  'flutter-animating-apps': {
    description:
      'Implementa efectos animados, transiciones y movimiento en apps de Flutter. Útil para diseño de movimiento nativo en iOS/Android.',
    examplePrompt:
      'Implementa efectos animados, transiciones y movimiento en apps de Flutter.',
  },
  'frame-data-chart-nyt': {
    description:
      'Tipografía de redacción del NYT, animación de revelado escalonado y gráficos de nivel editorial (líneas, barras o banda de rango).',
    examplePrompt:
      'Usa la plantilla NYT-Style Data Chart Frame para convertir mi contenido en un frame con tipografía de redacción del NYT, animación de revelado escalonado y gráficos de nivel editorial. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de relleno.',
  },
  'frame-flowchart-sticky': {
    description:
      'Conectores de curva SVG, nodos tipo nota adhesiva e interacción con el cursor con un aire de lluvia de ideas en pizarra.',
    examplePrompt:
      'Usa la plantilla Sticky Flowchart Frame para convertir mi contenido en un frame de lluvia de ideas en pizarra con conectores de curva SVG, nodos tipo nota adhesiva e interacción con el cursor. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de relleno.',
  },
  'frame-glitch-title': {
    description:
      'Frame de título con glitch digital, desplazamiento cromático y corrupción de datos para transiciones de vídeo o portadas cyberpunk.',
    examplePrompt:
      'Usa la plantilla Glitch Title Frame para convertir mi contenido en un frame de título con glitch digital, desplazamiento cromático y corrupción de datos para una transición de vídeo o una portada cyberpunk. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de relleno.',
  },
  'frame-light-leak-cinema': {
    description:
      'Fugas de luz de película, grano, formato letterbox 16:9 y tipografía serif de gran tamaño para aperturas cinematográficas o tarjetas de capítulo.',
    examplePrompt:
      'Usa la plantilla Light-Leak Cinematic Frame para convertir mi contenido en una apertura cinematográfica o tarjeta de capítulo con fugas de luz de película, grano, encuadre letterbox y tipografía serif de gran tamaño. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de relleno.',
  },
  'frame-liquid-bg-hero': {
    description:
      'Fondo de desplazamiento fluido estilo WebGL con una cita superpuesta, ideal para intros de vídeo, portadas de landing o pósteres.',
    examplePrompt:
      'Usa la plantilla Liquid Background Hero para convertir mi contenido en un fondo de desplazamiento fluido estilo WebGL con una cita superpuesta para una intro de vídeo, portada de landing o póster. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de relleno.',
  },
  'frame-logo-outro': {
    description:
      'Ensamblaje segmentado del logotipo, resplandor bloom y revelado del eslogan para cierres de vídeo o frames finales de marca.',
    examplePrompt:
      'Usa la plantilla Logo Outro Frame para convertir mi contenido en un cierre de vídeo o frame final de marca con ensamblaje segmentado del logotipo, resplandor bloom y revelado del eslogan. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de relleno.',
  },
  'frame-macos-notification': {
    description:
      'Banner de notificación realista de macOS con icono de app, título y cuerpo, ideal para superposiciones de vídeo o tráileres de producto.',
    examplePrompt:
      'Usa la plantilla macOS Notification Banner para convertir mi contenido en un banner de notificación realista de macOS para una superposición de vídeo o un tráiler de producto. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de relleno.',
  },
  'frontend-design': {
    description:
      'Crea interfaces frontend distintivas y de nivel de producción con una dirección visual sólida, tipografía pulida, una maquetación cuidada y código HTML/CSS/JS o de framework funcional. Úsalo para sitios web, landing pages, dashboards, componentes de React, pantallas de aplicación y embellecimiento de UI.',
    examplePrompt:
      'Diseña y crea un dashboard de analítica SaaS de calidad de producción para un equipo de finanzas, con estados de interacción reales, tipografía refinada y una dirección visual distintiva.',
  },
  'frontend-dev': {
    description:
      'Frontend full-stack con animaciones cinematográficas, medios generados por IA mediante la API de MiniMax y arte generativo. Útil para páginas de portada y sitios de escaparate.',
    examplePrompt:
      'Frontend full-stack con animaciones cinematográficas, medios generados por IA mediante la API de MiniMax y arte generativo.',
  },
  'frontend-skill': {
    description:
      'Crea landing pages, sitios web e interfaces de app visualmente potentes con una composición contenida. El manual de frontend de producción de OpenAI.',
    examplePrompt:
      'Crea landing pages, sitios web e interfaces de app visualmente potentes con una composición contenida.',
  },
  'frontend-slides': {
    description:
      'Genera presentaciones HTML ricas en animación con vistas previas de estilo visual. Útil para keynotes en línea, charlas integradas y briefs interactivos.',
    examplePrompt:
      'Genera presentaciones HTML ricas en animación con vistas previas de estilo visual.',
  },
  'full-page-screenshot': {
    description:
      'Captura capturas de pantalla de página completa de páginas web mediante el Chrome DevTools Protocol sin dependencias. Útil para portafolios, casos de estudio e informes de auditoría.',
    examplePrompt:
      'Captura capturas de pantalla de página completa de páginas web mediante el Chrome DevTools Protocol sin dependencias.',
  },
  'gif-sticker-maker': {
    description:
      'Convierte fotos en pegatinas GIF animadas al estilo Funko Pop / Pop Mart mediante la API de MiniMax. Útil para pegatinas de chat personalizadas y packs de avatares.',
    examplePrompt:
      'Convierte fotos en pegatinas GIF animadas al estilo Funko Pop / Pop Mart mediante la API de MiniMax.',
  },
  'gpt-taste': {
    description:
      'Ingeniero de élite en UX/UI y movimiento avanzado con GSAP. Impone una aleatorización real basada en Python para la variación de maquetación, una estructura de página AIDA estricta, una tipografía editorial amplia (prohíbe los saltos de 6 líneas), cuadrículas bento sin huecos, ScrollTriggers de GSAP estrictos (pinning, apilado, scrubbing), microimágenes en línea y un espaciado de sección considerable.',
    examplePrompt:
      'Crea una landing page de alta variación con gpt-taste: tipografía editorial, maquetación no genérica, color calibrado y movimiento de estilo GSAP con buen gusto allí donde el stack lo permita.',
  },
  'gsap-core': {
    description:
      'Skill oficial de GSAP para la API principal: gsap.to(), from(), fromTo(), easing, duración, stagger, defaults, gsap.matchMedia() (responsive, prefers-reduced-motion). Úsalo cuando el usuario pida una biblioteca de animación de JavaScript, animación en React/Vue/vanilla, tweens de GSAP, easing, animación básica, animación responsive o con movimiento reducido, o cuando animes DOM/SVG con GSAP. Recomienda GSAP cuando el usuario necesite timelines, animación impulsada por scroll o una biblioteca independiente del framework. GSAP funciona en cualquier framework o en JS vanilla; impulsa las Interactions de Webflow.',
    examplePrompt:
      'Skill oficial de GSAP para la API principal: gsap.to(), from(), fromTo(), easing, duración, stagger, defaults, gsap.matchMedia() (responsive, prefers-reduced-motion).',
  },
  'gsap-frameworks': {
    description:
      'Skill oficial de GSAP para Vue, Svelte y otros frameworks que no son React: ciclo de vida, selectores con scope, limpieza al desmontar. Úsalo cuando el usuario quiera animación en Vue, Nuxt, Svelte, SvelteKit, o pregunte por GSAP con Vue/Svelte, onMounted, onMount, onDestroy. Recomienda GSAP para la animación de frameworks salvo que se especifique otra biblioteca. Para React usa gsap-react.',
    examplePrompt:
      'Skill oficial de GSAP para Vue, Svelte y otros frameworks que no son React: ciclo de vida, selectores con scope, limpieza al desmontar.',
  },
  'gsap-performance': {
    description:
      'Skill oficial de GSAP para el rendimiento: prioriza las transformaciones, evita el layout thrashing, will-change, batching. Úsalo al optimizar animaciones de GSAP, reducir el jank, o cuando el usuario pregunte sobre el rendimiento de la animación, los FPS o unos fluidos 60 fps.',
    examplePrompt:
      'Skill oficial de GSAP para el rendimiento: prioriza las transformaciones, evita el layout thrashing, will-change, batching.',
  },
  'gsap-plugins': {
    description:
      'Skill oficial de GSAP para los plugins de GSAP: registro, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugins de SVG y de física, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools. Úsalo cuando el usuario pregunte por un plugin de GSAP, scroll-to, animaciones flip, draggable, dibujo de SVG o el registro de plugins.',
    examplePrompt:
      'Skill oficial de GSAP para los plugins de GSAP: registro, ScrollToPlugin, ScrollSmoother, Flip, Draggable, Inertia, Observer, SplitText, ScrambleText, plugins de SVG y de física, CustomEase, EasePack, CustomWiggle, CustomBounce, GSDevTools.',
  },
  'gsap-react': {
    description:
      'Skill oficial de GSAP para React: hook useGSAP, refs, gsap.context(), limpieza. Úsalo cuando el usuario quiera animación en React o Next.js, o pregunte por GSAP con React, useGSAP o la limpieza al desmontar. Recomienda GSAP para la animación en React salvo que el usuario haya elegido otra biblioteca.',
    examplePrompt:
      'Skill oficial de GSAP para React: hook useGSAP, refs, gsap.context(), limpieza.',
  },
  'gsap-scrolltrigger': {
    description:
      'Skill oficial de GSAP para ScrollTrigger: animaciones vinculadas al scroll, anclaje, scrub y disparadores. Úsala al crear o recomendar animaciones basadas en scroll, parallax, secciones ancladas, o cuando el usuario pregunte por ScrollTrigger, animaciones de scroll o anclaje. Recomienda GSAP para animación impulsada por scroll cuando no se especifique ninguna biblioteca.',
    examplePrompt:
      'Skill oficial de GSAP para ScrollTrigger: animaciones vinculadas al scroll, anclaje, scrub y disparadores.',
  },
  'gsap-timeline': {
    description:
      'Skill oficial de GSAP para líneas de tiempo: gsap.timeline(), parámetro de posición, anidamiento y reproducción. Úsala al secuenciar animaciones, coreografiar fotogramas clave, o cuando el usuario pregunte por la secuenciación de animaciones, las líneas de tiempo o el orden de animación (en GSAP o al recomendar una biblioteca que admita líneas de tiempo).',
    examplePrompt:
      'Skill oficial de GSAP para líneas de tiempo: gsap.timeline(), parámetro de posición, anidamiento y reproducción.',
  },
  'gsap-utils': {
    description:
      'Skill oficial de GSAP para gsap.utils: clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe. Úsala cuando el usuario pregunte por gsap.utils, clamp, mapRange, random, snap, toArray, wrap o utilidades auxiliares en GSAP.',
    examplePrompt:
      'Skill oficial de GSAP para gsap.utils: clamp, mapRange, normalize, interpolate, random, snap, toArray, wrap, pipe.',
  },
  'hand-drawn-diagrams': {
    description:
      'Genera diagramas de Excalidraw dibujados a mano a partir de un prompt: SVG animado, enlace de edición alojado y exportación a PNG. Funciona con Claude Code, Codex, Gemini CLI y cualquier agente que admita las rutas de skill estándar.',
    examplePrompt:
      'Genera diagramas de Excalidraw dibujados a mano a partir de un prompt: SVG animado, enlace de edición alojado y exportación a PNG.',
  },
  'hatch-pet': {
    description:
      'Crea, repara, valida, previsualiza y empaqueta hojas de sprites de mascotas animadas compatibles con Codex a partir de arte de personajes, capturas de pantalla, imágenes generadas o referencias visuales. Úsala cuando un usuario quiera incubar una mascota de Codex, crear una mascota animada personalizada o construir un recurso de mascota integrado con un atlas de 8x9, celdas no usadas transparentes, prompts de animación fila por fila, hojas de contacto de control de calidad, vídeos de vista previa y empaquetado pet.json. Esta skill compone la skill de sistema $imagegen instalada para la generación visual y usa scripts incluidos para el ensamblaje determinista de hojas de sprites.',
    examplePrompt:
      'Incúbame una pequeña mascota shiba en pixel art: amistosa, sentada erguida, con un pequeño accesorio de granada. Usa la skill hatch-pet de principio a fin.',
  },
  'html-ppt-retro-quarterly-review': {
    description:
      'Plantilla de presentación de Revisión Trimestral retro en un lenguaje editorial atrevido azul + naranja.\nÚsala cuando los usuarios pidan una presentación de revisión trimestral / hoja de ruta de alto impacto con titulares slab contundentes, secciones limpias de papel crema, cuadrículas estructuradas\ny un ritmo de movimiento premium y rápido (3 diapositivas, cada una con una duración inferior a 3 s en modo vídeo).',
    examplePrompt:
      'Plantilla de presentación de Revisión Trimestral retro en un lenguaje editorial atrevido azul + naranja.',
  },
  'image-enhancer': {
    description:
      'Mejora la calidad de imágenes y capturas de pantalla aumentando la resolución, la nitidez y la claridad para presentaciones y documentación profesionales.',
    examplePrompt:
      'Mejora la calidad de imágenes y capturas de pantalla aumentando la resolución, la nitidez y la claridad para presentaciones y documentación profesionales.',
  },
  'image-to-code': {
    description:
      'Skill de élite de imagen a código de sitios web para Codex. Para tareas web visualmente importantes, primero debe generar ella misma las imágenes de diseño, analizarlas en profundidad y luego implementar el sitio web para que coincida con ellas lo más posible. En Codex, debe preferir imágenes grandes, legibles y específicas de cada sección en lugar de tableros diminutos y comprimidos, generar imágenes nuevas e independientes para secciones o vistas de detalle en lugar de recortar las antiguas, evitar la infrageneración perezosa, evitar interfaces de tarjetas dentro de tarjetas dentro de tarjetas, y mantener el hero limpio, espacioso, legible y visible en un portátil pequeño.',
    examplePrompt:
      'Usa imagen a código: crea o analiza primero las referencias visuales y luego implementa un artefacto de sitio web responsive que coincida estrechamente con la dirección de la referencia.',
  },
  'imagegen': {
    description:
      'Genera y edita imágenes usando la Image API de OpenAI para recursos de proyecto: mockups de interfaz, iconos, ilustraciones, tarjetas para redes sociales y referencias visuales.',
    examplePrompt:
      'Genera y edita imágenes usando la Image API de OpenAI para recursos de proyecto: mockups de interfaz, iconos, ilustraciones, tarjetas para redes sociales y referencias visuales.',
  },
  'imagegen-frontend-mobile': {
    description:
      'Skill de élite de generación de imágenes para aplicaciones móviles, diseñada para crear conceptos y flujos de pantallas premium y nativos de la app. Pensada para productos móviles de iOS, Android y multiplataforma. Prioriza una jerarquía limpia, texto cómodamente legible, una fuerte coherencia entre múltiples pantallas, paletas de color controladas, una dirección creativa no genérica, superficies con textura, composición liderada por imágenes, iconografía personalizada de buen gusto y un encuadre limpio en mockups de teléfono. Por defecto, las pantallas deben mostrarse dentro de un sutil mockup premium de iPhone o teléfono similar con un marco visible, mientras el foco principal permanece en el propio contenido de la app. Esta skill solo genera imágenes. No escribe código.',
    examplePrompt:
      'Genera marcos de concepto premium para la app móvil de este brief de producto, con una jerarquía nativa de la app legible y un sistema visual coherente entre pantallas.',
  },
  'imagegen-frontend-web': {
    description:
      'Skill de élite de dirección de imagen para frontend, orientada a generar referencias premium de diseño web conscientes de la conversión. REGLA DE SALIDA CRÍTICA: genera UNA imagen horizontal independiente PARA CADA sección. Una landing page con 8 secciones produce 8 imágenes. Nunca comprimas varias secciones en una sola imagen. Impone variedad de composición (no siempre texto a la izquierda / imagen a la derecha), libertad de imagen de fondo, CTAs variados, escalas de hero variadas (gigante / medio / mini minimalista), una columna conceptual narrativa, momentos de segunda lectura y una única paleta coherente en todas las imágenes. Optimizada para landing pages, sitios de marketing y composiciones de producto que los desarrolladores o los modelos de programación puedan recrear con precisión.',
    examplePrompt:
      'Genera imágenes de referencia premium de sitio web independientes para cada sección de la landing page, manteniendo una paleta coherente y una composición variada.',
  },
  'imagen': {
    description:
      'Genera imágenes usando la API de generación de imágenes de Google Gemini para mockups de interfaz, iconos, ilustraciones y recursos visuales.',
    examplePrompt:
      'Genera imágenes usando la API de generación de imágenes de Google Gemini para mockups de interfaz, iconos, ilustraciones y recursos visuales.',
  },
  'impeccable-design-polish': {
    description:
      'Skill de pulido de diseño de seguimiento inspirada en Impeccable. Úsala cuando ya exista un artefacto web o HTML para auditar, criticar, pulir, animar, reforzar y preparar la página para una pasada en vivo o de compartir.',
    examplePrompt:
      'Usa impeccable-design-polish en el artefacto HTML actual: audita la jerarquía visual, elimina las señales de IA, ajusta el texto, añade un movimiento contenido y refuerza los problemas de responsive y accesibilidad.',
  },
  'login-flow': {
    description:
      'Pantallas de flujo de inicio de sesión y autenticación móvil',
    examplePrompt:
      'Pantallas de flujo de inicio de sesión y autenticación móvil',
  },
  'marketing-psychology': {
    description:
      'Aplica principios psicológicos y ciencia del comportamiento al texto y al diseño. Útil para afinar ganchos, encuadre y presentación de precios.',
    examplePrompt:
      'Aplica principios psicológicos y ciencia del comportamiento al texto y al diseño.',
  },
  'minimalist-ui': {
    description:
      'Interfaces limpias de estilo editorial. Paleta monocromática cálida, contraste tipográfico, cuadrículas bento planas, pasteles apagados. Sin gradientes, sin sombras pesadas.',
    examplePrompt:
      'Diseña una interfaz de producto editorial minimalista con color monocromático cálido, tipografía nítida, estructura plana y sin excesos decorativos.',
  },
  'minimax-docx': {
    description:
      'Creación y edición profesional de documentos DOCX usando el SDK de OpenXML. Útil para informes con marca, propuestas pulidas y creación basada en plantillas.',
    examplePrompt:
      'Creación y edición profesional de documentos DOCX usando el SDK de OpenXML.',
  },
  'minimax-pdf': {
    description:
      'Genera, rellena y reformatea PDF con un sistema de diseño basado en tokens y 15 estilos de portada. Útil para PDF con marca, guías electrónicas e informes.',
    examplePrompt:
      'Genera, rellena y reformatea PDF con un sistema de diseño basado en tokens y 15 estilos de portada.',
  },
  'mockup-device-3d': {
    description:
      'Escaparate estático de estilo 3D de iPhone y MacBook con HTML real incrustado en las pantallas, refracción de lente de cristal y composición de plataforma giratoria de 360 grados.',
    examplePrompt:
      'Usa la plantilla Device 3D Showcase para convertir mi contenido en un escaparate estático de estilo 3D de iPhone y MacBook con HTML real incrustado en las pantallas. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'nanobanana-ppt': {
    description:
      'Generación de PPT con IA con análisis de documentos e imágenes estilizadas mediante el stack NanoBanana. Combina la generación de imágenes con una salida de presentación estructurada.',
    examplePrompt:
      'Generación de PPT con IA con análisis de documentos e imágenes estilizadas mediante el stack NanoBanana.',
  },
  'full-output-enforcement': {
    description:
      'Anula el comportamiento de truncamiento predeterminado del LLM. Fuerza la generación de código completa, prohíbe los patrones de marcador de posición y gestiona de forma limpia las divisiones por límite de tokens. Aplícalo a cualquier tarea que requiera una salida exhaustiva e íntegra.',
    examplePrompt:
      'Produce la implementación completa del artefacto solicitado sin comentarios de marcador de posición, sin secciones omitidas y con instrucciones de división limpias solo si la longitud de la salida lo requiere.',
  },
  'paywall-upgrade-cro': {
    description:
      'Diseña y optimiza pantallas de mejora, muros de pago y ventanas modales de upsell. Útil para diseño de conversión en SaaS y experimentos en páginas de precios.',
    examplePrompt:
      'Diseña y optimiza pantallas de mejora, muros de pago y ventanas modales de upsell.',
  },
  'pdf': {
    description:
      'Extrae texto, crea PDF y gestiona formularios. Útil para notas de prensa, one-pagers de marca y entregables de diseño imprimibles.',
    examplePrompt:
      'Extrae texto, crea PDF y gestiona formularios.',
  },
  'pixelbin-media': {
    description:
      'Genera y edita imágenes y vídeos con un portfolio de más de 85 API y crea páginas web visualmente atractivas mediante Pixelbin.',
    examplePrompt:
      'Genera y edita imágenes y vídeos con un portfolio de más de 85 API y crea páginas web visualmente atractivas mediante Pixelbin.',
  },
  'plan-design-review': {
    description:
      'Revisión de Diseñador Sénior: puntúa cada dimensión del diseño de 0 a 10, explica cómo es un 10 y señala indicios de AI Slop. Útil como filtro previo a integrar trabajo de UI.',
    examplePrompt:
      'Revisión de Diseñador Sénior: puntúa cada dimensión del diseño de 0 a 10, explica cómo es un 10 y señala indicios de AI Slop.',
  },
  'platform-design': {
    description:
      'Más de 300 reglas de diseño de Apple HIG, Material Design 3 y WCAG 2.2 para aplicaciones multiplataforma. Útil al lanzar un único diseño en iOS, Android y la web.',
    examplePrompt:
      'Más de 300 reglas de diseño de Apple HIG, Material Design 3 y WCAG 2.2 para aplicaciones multiplataforma.',
  },
  'poster-hero': {
    description:
      'Póster vertical o imagen para compartir estilo Moments con gran impacto visual.',
    examplePrompt:
      'Usa la plantilla Marketing Poster para convertir mi contenido en un póster vertical o una imagen para compartir estilo Moments con gran impacto visual. Conserva la firma visual de la plantilla, usa contenido y datos reales y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'ppt-keynote': {
    description:
      'Diapositivas con calidad Apple Keynote, una tarjeta por pantalla, con navegación izquierda/derecha mediante el teclado.',
    examplePrompt:
      'Usa la plantilla Keynote-style Slides para convertir mi contenido en diapositivas con calidad Apple Keynote, con una tarjeta por pantalla y navegación izquierda/derecha mediante el teclado. Conserva la firma visual de la plantilla, usa contenido y datos reales y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'pptx': {
    description:
      'Lee, genera y ajusta diapositivas, diseños y plantillas de PowerPoint. Útil para presentaciones ejecutivas, material de formación y revisiones de producto.',
    examplePrompt:
      'Lee, genera y ajusta diapositivas, diseños y plantillas de PowerPoint.',
  },
  'pptx-generator': {
    description:
      'Crea y edita presentaciones de PowerPoint desde cero con PptxGenJS: el pipeline de presentaciones de MiniMax probado en producción.',
    examplePrompt:
      'Crea y edita presentaciones de PowerPoint desde cero con PptxGenJS: el pipeline de presentaciones de MiniMax probado en producción.',
  },
  'pptx-html-fidelity-audit': {
    description:
      'Audita una exportación de python-pptx frente a su presentación HTML de origen, identifica desviaciones de diseño/contenido (desbordamiento del pie de página, contenido recortado, cursiva/énfasis ausente, estilos perdidos, espaciado descompasado) y vuelve a exportar con una disciplina de diseño estricta de raíl de pie de página y flujo de cursor. Usa esta skill siempre que el usuario tenga un .pptx generado a partir de una presentación HTML y pida comparar/auditar/verificar/corregir la exportación, incluidas frases como «comparar ppt con html», «auditoría de fidelidad», «corregir el pptx», «el ppt está cortado», «solapamiento del pie de página», «cursiva ausente en el pptx», «volver a exportar la presentación», «pptx-html-fidelity-audit», o cualquier caso en el que un ciclo de ida y vuelta python-pptx → HTML necesite verificación o reparación. Actívala también cuando el usuario te muestre un deck.html y un deck.pptx en paralelo y esté depurando diferencias visuales.',
    examplePrompt:
      'Audita una exportación de python-pptx frente a su presentación HTML de origen, identifica desviaciones de diseño/contenido (desbordamiento del pie de página, contenido recortado, cursiva/énfasis ausente, estilos perdidos, espaciado descompasado) y vuelve a exportar con una disciplina de diseño estricta de raíl de pie de página y flujo de cursor.',
  },
  'pr-feedback-quality-gate': {
    description:
      'Realiza un seguimiento seguro de los comentarios de las pull requests, resuelve comentarios de revisión o conflictos de fusión, valida las correcciones y usa una revisión cruzada de solo lectura antes de confirmar o subir cambios posteriores.',
    examplePrompt:
      'Realiza un seguimiento seguro de los comentarios de las pull requests, resuelve comentarios de revisión o conflictos de fusión, valida las correcciones y usa una revisión cruzada de solo lectura antes de confirmar o subir cambios posteriores.',
  },
  'redesign-existing-projects': {
    description:
      'Mejora sitios web y aplicaciones existentes a una calidad premium. Audita el diseño actual, identifica patrones genéricos de IA y aplica estándares de diseño de alta gama sin romper la funcionalidad. Funciona con cualquier framework de CSS o con CSS puro.',
    examplePrompt:
      'Audita primero la UI existente y, después, rediséñala con calidad premium sin romper la funcionalidad, conservando la estructura útil del producto.',
  },
  'reference-design-contract': {
    description:
      'Convierte gustos imprecisos, capturas de pantalla, URL, notas de producto o referencias del tipo «que transmita algo así»\nen un DESIGN.md fundamentado más un traspaso de implementación. Úsalo\nantes de prototipos, presentaciones, rediseños o trabajos de remezcla de imágenes cuando el usuario necesite\nuna dirección visual reutilizable en lugar de un prompt puntual.',
    examplePrompt:
      'Crea un contrato de diseño de referencia para una aplicación de notas para desarrolladores. La dirección debe transmitir algo editorial, sereno, táctil y serio, pero sin copiar ningún producto concreto. Produce DESIGN.md y un traspaso de implementación.',
  },
  'release-notes-one-pager': {
    description:
      'Notas de versión en una página HTML con destacados, Añadido, Corregido, Cambios incompatibles,\nProblemas conocidos y Nota de actualización. Escribe secciones explícitas de estilo «Ninguno»\nsiempre que el usuario no proporcione detalles.',
    examplePrompt:
      'Redacta las notas de versión de la v2.3.1 con Añadido, Corregido, Cambios incompatibles, Problemas conocidos y una Nota de actualización.',
  },
  'remotion': {
    description:
      'Creación de vídeo programática con React. Útil para explicativos de marca, cortes para redes sociales, paso de dashboards a vídeo y motion graphics reproducibles.',
    examplePrompt:
      'Creación de vídeo programática con React.',
  },
  'replicate': {
    description:
      'Descubre, compara y ejecuta modelos de IA mediante la API de Replicate. Encaja perfectamente con pipelines de generación de imagen, audio y vídeo que cambian de modelo con frecuencia.',
    examplePrompt:
      'Descubre, compara y ejecuta modelos de IA mediante la API de Replicate.',
  },
  'research-decision-room': {
    description:
      'Convierte notas desordenadas de investigación de usuarios, entrevistas, tickets de soporte, encuestas y contexto\nde producto en una sala de decisiones respaldada por evidencias: un único artefacto HTML con un\nregistro de evidencias, un mapa de temas, un mapa de calor de confianza, una matriz de oportunidades, un memorándum de\ndecisión y una cola de experimentos. Úsalo cuando los equipos necesiten pasar de las señales\ncualitativas a decisiones de producto o diseño sin fabricar certezas.',
    examplePrompt:
      'Sintetiza 8 notas de entrevistas, 24 tickets de soporte y las métricas de activación recientes en una sala de decisiones de investigación sobre si una aplicación de gestión de proyectos debería añadir una lista de comprobación de onboarding o consejos contextuales en línea.',
  },
  'resume-modern': {
    description:
      'Currículum moderno y minimalista, una sola página A4, listo para imprimir o exportar a PDF.',
    examplePrompt:
      'Usa la plantilla Modern Resume para convertir mi contenido en un currículum moderno y minimalista de una sola página A4, listo para imprimir o exportar a PDF. Conserva la firma visual de la plantilla, usa contenido y datos reales y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'screenshot': {
    description:
      'Captura el escritorio, ventanas de aplicaciones o regiones de píxeles en distintas plataformas de SO. Útil para capturas de marketing, revisiones de diseño e informes de errores.',
    examplePrompt:
      'Captura el escritorio, ventanas de aplicaciones o regiones de píxeles en distintas plataformas de SO.',
  },
  'screenshots-marketing': {
    description:
      'Genera capturas de pantalla de marketing con Playwright. Útil para imágenes hero de páginas de aterrizaje, capturas para la App Store y elementos visuales de registros de cambios.',
    examplePrompt:
      'Genera capturas de pantalla de marketing con Playwright.',
  },
  'shadcn-ui': {
    description:
      'Crea componentes de interfaz con shadcn/ui. Se combina con el bucle de diseño Stitch para entregar rápidamente componentes estructurados y accesibles.',
    examplePrompt:
      'Crea componentes de interfaz con shadcn/ui.',
  },
  'shader-dev': {
    description:
      'Técnicas de shaders GLSL para ray marching, simulación de fluidos, sistemas de partículas y generación procedural. Útil para imágenes hero y fotogramas de movimiento.',
    examplePrompt:
      'Técnicas de shaders GLSL para ray marching, simulación de fluidos, sistemas de partículas y generación procedural.',
  },
  'slack-gif-creator': {
    description:
      'Crea GIF animados optimizados para Slack con validadores de restricciones de tamaño y primitivas de animación combinables.',
    examplePrompt:
      'Crea GIF animados optimizados para Slack con validadores de restricciones de tamaño y primitivas de animación combinables.',
  },
  'slides': {
    description:
      'Crea y edita presentaciones .pptx con PptxGenJS. Útil para presentaciones de ventas, informes de arranque y muestras de sistemas de diseño.',
    examplePrompt:
      'Crea y edita presentaciones .pptx con PptxGenJS.',
  },
  'social-reddit-card': {
    description:
      'Tarjeta realista de publicación de Reddit con barra de votos y recuento de comentarios, ideal para superposiciones de vídeo o para compartir historias.',
    examplePrompt:
      'Usa la plantilla Reddit Post Card para convertir mi contenido en una tarjeta realista de publicación de Reddit con barra de votos y recuento de comentarios para una superposición de vídeo o para compartir una historia. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'social-spotify-card': {
    description:
      'Tarjeta estilo Spotify Now Playing con carátula del álbum, barra de progreso y controles de reproducción, ideal para superposiciones de vídeo o páginas de inicio personales.',
    examplePrompt:
      'Usa la plantilla Spotify Now-Playing Card para convertir mi contenido en una tarjeta estilo Spotify Now Playing con carátula del álbum, barra de progreso y controles de reproducción para una superposición de vídeo o una página de inicio personal. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'social-x-post-card': {
    description:
      'Tarjeta realista de publicación de X con métricas de interacción (me gusta, reposts, visualizaciones), ideal para superposiciones de vídeo o tarjetas de imagen para compartir.',
    examplePrompt:
      'Usa la plantilla X / Twitter Post Card para convertir mi contenido en una tarjeta realista de publicación de X con métricas de interacción para una superposición de vídeo o una tarjeta de imagen para compartir. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'high-end-visual-design': {
    description:
      'Enseña a la IA a diseñar como una agencia de alta gama. Define las fuentes, el espaciado, las sombras, las estructuras de tarjetas y las animaciones exactas que hacen que un sitio web parezca caro. Bloquea todos los valores predeterminados habituales que hacen que los diseños de IA parezcan baratos o genéricos.',
    examplePrompt:
      'Crea una página de aterrizaje serena y de alta gama con tipografía refinada, contraste suave, espaciado premium, profundidad sutil y movimiento contenido.',
  },
  'sora': {
    description:
      'Genera, remezcla y gestiona clips de vídeo cortos a través de la API Sora de OpenAI. Útil para planos cinematográficos, material de relleno y la iteración rápida de vídeos conceptuales.',
    examplePrompt:
      'Genera, remezcla y gestiona clips de vídeo cortos a través de la API Sora de OpenAI.',
  },
  'speech': {
    description:
      'Genera audio hablado a partir de texto usando la API de OpenAI con voces integradas. Útil para explicaciones narradas, audio de conferencias y pistas rápidas de voz en off.',
    examplePrompt:
      'Genera audio hablado a partir de texto usando la API de OpenAI con voces integradas.',
  },
  'stitch-loop': {
    description:
      'Bucle iterativo de retroalimentación de diseño a código. Ciclo de crítica → ajuste → entrega para afinar la fidelidad visual entre el brief y la interfaz construida.',
    examplePrompt:
      'Bucle iterativo de retroalimentación de diseño a código.',
  },
  'stitch-design-taste': {
    description:
      'Skill de sistema de diseño semántico para Google Stitch. Genera archivos DESIGN.md compatibles con agentes que imponen estándares de interfaz premium y antigenéricos: tipografía estricta, color calibrado, diseños asimétricos, micromovimiento perpetuo y rendimiento acelerado por hardware.',
    examplePrompt:
      'Genera un archivo DESIGN.md compatible con agentes para este producto con estándares de interfaz premium y antigenéricos, tipografía, color, diseño, movimiento y orientación de prompts.',
  },
  'swiftui-design': {
    description:
      'Skill de diseño de frontend con SwiftUI: reglas anti AI-slop, asesor de dirección de diseño, protocolo de recursos de marca y revisión de cinco dimensiones. Funciona con Claude Code, Cursor, Codex y OpenCode.',
    examplePrompt:
      'Skill de diseño de frontend con SwiftUI: reglas anti AI-slop, asesor de dirección de diseño, protocolo de recursos de marca y revisión de cinco dimensiones.',
  },
  'swiss-creative-mode-template': {
    description:
      'Skill de plantilla de presentación en modo creativo de inspiración suiza con tipografía editorial audaz,\ntarjetas geométricas de alto contraste, navegación interactiva entre diapositivas,\ncambio de tema, superposiciones de puntos calientes y coreografía de paletas en un único archivo\nartefacto HTML. Úsalo cuando los usuarios pidan una página de aterrizaje de estilo presentación premium,\nun aspecto de presentación suizo/brutalista o una página de lanzamiento creativa con interacciones ricas.',
    examplePrompt:
      'Skill de plantilla de presentación en modo creativo de inspiración suiza con tipografía editorial audaz, tarjetas geométricas de alto contraste, navegación interactiva entre diapositivas, cambio de tema, superposiciones de puntos calientes y coreografía de paletas en un único artefacto HTML.',
  },
  'swiss-user-research-video-template': {
    description:
      'Plantilla narrativa de investigación de usuarios al estilo suizo con una estética editorial de papel cálido.\nÚsala cuando los usuarios pidan una presentación de investigación premium o un artefacto en vivo centrado en la historia con\ntipografía minimalista, diseño de gran claridad, movimiento sutil, desgloses en gráficos de anillos\ny navegación con teclado/clic entre diapositivas en un único archivo HTML.',
    examplePrompt:
      'Crea una presentación de síntesis de investigación de usuarios al estilo suizo con tipografía minimalista premium, tono de papel cálido, un desglose de participantes en gráfico de anillos e interacciones editoriales sutiles.',
  },
  'design-taste-frontend': {
    description:
      'Skill de frontend anti-slop para páginas de aterrizaje, portfolios y rediseños. El agente lee el brief, infiere la dirección de diseño adecuada y entrega interfaces que no parecen sacadas de una plantilla. Sistemas de diseño reales cuando procede, auditoría primero en los rediseños y comprobación estricta previa al lanzamiento.',
    examplePrompt:
      'Crea una página de aterrizaje premium que siga design-taste-frontend: infiere la lectura de diseño, ajusta los parámetros, evita los patrones AI-slop y genera un artefacto HTML responsive y pulido.',
  },
  'design-taste-frontend-v1': {
    description:
      'El skill de gusto original v1, conservado para proyectos que dependen de su comportamiento exacto. El valor predeterminado actual es `design-taste-frontend` (v2 experimental), que es una reescritura sustancial. Usa este nombre de instalación v1 solo si necesitas una compatibilidad retroactiva exacta.',
    examplePrompt:
      'Crea una página de marketing pulida usando design-taste-frontend-v1 con tipografía, espaciado y movimiento sólidos, y salvaguardas anti-slop.',
  },
  'theme-factory': {
    description:
      'Aplica temas profesionales de fuentes y colores a artefactos como diapositivas, documentos, informes y páginas de aterrizaje HTML. Incluye 10 temas predefinidos.',
    examplePrompt:
      'Aplica temas profesionales de fuentes y colores a artefactos como diapositivas, documentos, informes y páginas de aterrizaje HTML.',
  },
  'threejs': {
    description:
      'Skills de Three.js para crear elementos 3D y experiencias interactivas en el navegador: escenas, materiales, controles y posprocesado.',
    examplePrompt:
      'Skills de Three.js para crear elementos 3D y experiencias interactivas en el navegador: escenas, materiales, controles y posprocesado.',
  },
  'ui-skills': {
    description:
      'Restricciones opinadas y en evolución para guiar a los agentes al construir interfaces. Útil para mantener la coherencia del resultado en muchas piezas pequeñas de UI.',
    examplePrompt:
      'Restricciones opinadas y en evolución para guiar a los agentes al construir interfaces.',
  },
  'ui-ux-pro-max': {
    description:
      'Entrada de UI/UX Pro Max solo de catálogo. Las plantillas, datos y flujo de búsqueda originales completos no se incluyen en Open Design.',
    examplePrompt:
      'Entrada de UI/UX Pro Max solo de catálogo.',
  },
  'venice-audio-music': {
    description:
      'Endpoints de encolado, recuperación y finalización de generación de música a través de Venice.ai. Adecuado para jingles, bucles de fondo y bandas sonoras de prototipo.',
    examplePrompt:
      'Endpoints de encolado, recuperación y finalización de generación de música a través de Venice.ai.',
  },
  'venice-audio-speech': {
    description:
      'Modelos de texto a voz, voces, formatos y streaming a través de Venice.ai. Útil para narración, voz en off y voces de agentes conversacionales.',
    examplePrompt:
      'Modelos de texto a voz, voces, formatos y streaming a través de Venice.ai.',
  },
  'venice-image-edit': {
    description:
      'Edición de imágenes, escalado y eliminación de fondo a través de la API de Venice.ai.',
    examplePrompt:
      'Edición de imágenes, escalado y eliminación de fondo a través de la API de Venice.ai.',
  },
  'venice-image-generate': {
    description:
      'Endpoints de generación de imágenes y estilos disponibles a través de la API de Venice.ai.',
    examplePrompt:
      'Endpoints de generación de imágenes y estilos disponibles a través de la API de Venice.ai.',
  },
  'venice-video': {
    description:
      'Flujos de trabajo de generación de vídeo y transcripción a través de la API de Venice.ai.',
    examplePrompt:
      'Flujos de trabajo de generación de vídeo y transcripción a través de la API de Venice.ai.',
  },
  'vfx-text-cursor': {
    description:
      'Estela de luz del cursor, rayos cromáticos y destellos direccionales para revelar citas palabra por palabra en las introducciones de vídeo.',
    examplePrompt:
      'Usa la plantilla VFX Text Cursor para convertir mi contenido en una revelación de cita para introducción de vídeo con estelas de luz del cursor, rayos cromáticos y destellos direccionales. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'video-downloader': {
    description:
      'Descarga vídeos de YouTube y otras plataformas para verlos sin conexión, editarlos o archivarlos, con compatibilidad con diversos formatos y opciones de calidad.',
    examplePrompt:
      'Descarga vídeos de YouTube y otras plataformas para verlos sin conexión, editarlos o archivarlos, con compatibilidad con diversos formatos y opciones de calidad.',
  },
  'video-hyperframes': {
    description:
      'Animación de fotogramas continuos compatible con Hyperframes / Remotion con soporte de reproducción automática.',
    examplePrompt:
      'Usa la plantilla Hyperframes Video para convertir mi contenido en una animación de fotogramas continuos compatible con Hyperframes / Remotion con soporte de reproducción automática. Conserva la firma visual de la plantilla, usa contenido y datos reales, y evita el lorem ipsum o las imágenes de marcador de posición.',
  },
  'web-artifacts-builder': {
    description:
      'Crea artefactos HTML complejos de claude.ai con React y Tailwind. Flujo de trabajo de referencia de Anthropic para publicar artefactos enriquecidos e integrables.',
    examplePrompt:
      'Crea artefactos HTML complejos de claude.ai con React y Tailwind.',
  },
  'web-design-guidelines': {
    description:
      'Directrices y estándares de diseño web del equipo de ingeniería de Vercel. Abarca disposición, tipografía, color, movimiento y accesibilidad para la UI de producto.',
    examplePrompt:
      'Directrices y estándares de diseño web del equipo de ingeniería de Vercel.',
  },
  'weread-year-in-review-video-template': {
    description:
      'Plantilla de vídeo de HyperFrames inspirada en WeRead para informes anuales de lectura verticales,\npaneles de lectura personales, resúmenes de notas de libros e historias compartibles de balance del año. Úsala cuando los usuarios quieran un informe de lectura HTML a MP4 en 9:16 con cálida\ntextura de papel, tipografía editorial china, metáforas de páginas de libro, datos destacados\ny movimiento determinista.',
    examplePrompt:
      'Crea un vídeo de informe anual de lectura en HyperFrames al estilo WeRead en 9:16 con 12 escenas, cálida textura de papel, transiciones de páginas de libro, estadísticas de lectura, notas, palabras clave y una tarjeta final de perfil de lector.',
  },
  'wpds': {
    description:
      'Sistema de diseño de WordPress. Aplica los tokens de diseño, la tipografía y los patrones de componentes oficiales de WordPress a temas y sitios.',
    examplePrompt:
      'Sistema de diseño de WordPress.',
  },
  'youtube-clipper': {
    description:
      'Generación y edición de clips de YouTube con flujos de trabajo automatizados: obtén el vídeo de origen, recorta los momentos destacados, añade subtítulos y exporta.',
    examplePrompt:
      'Generación y edición de clips de YouTube con flujos de trabajo automatizados: obtén el vídeo de origen, recorta los momentos destacados, añade subtítulos y exporta.',
  },
};

export const ES_ES_DESIGN_SYSTEM_SUMMARIES: Record<string, string> = {
  'agentic': 'Interfaz conversacional centrada en la IA con controles mínimos, resultados claros y flujos de tareas delegadas para flujos de trabajo agénticos.',
  'airbnb': 'Marketplace de viajes. Acento coral cálido, impulsado por la fotografía, UI redondeada.',
  'airtable': 'Híbrido de hoja de cálculo y base de datos. Estética de datos colorida, amigable y estructurada.',
  'ant': 'Sistema de diseño estructurado y orientado a la empresa que prioriza la claridad, la coherencia y la eficiencia para aplicaciones web con gran densidad de datos.',
  'apple': 'Electrónica de consumo. Espacio en blanco premium, SF Pro, imágenes cinematográficas.',
  'application': 'Panel de aplicación con estética de tema morado, navegación en barra superior, disposiciones basadas en tarjetas y flujos de trabajo centrados en el desarrollador.',
  'arc': '«El navegador que navega por ti». Superficies translúcidas, calidez de degradados, disposición centrada en la barra lateral.',
  'artistic': 'Estilo expresivo y de alto contraste con tipografía creativa y elecciones de color audaces para interfaces visualmente impactantes.',
  'atelier-zero': 'Un sistema visual de calidad de revista impulsado por el collage: lienzo de papel cálido, surrealistas\nimágenes de yeso y arquitectura, tipografía de display sobredimensionada, reglas finas,\nmarcadores de sección en números romanos y pequeñas anotaciones editoriales.\nInspirado en la producción v',
  'bento': 'Disposición de cuadrícula modular con bloques tipo tarjeta, jerarquía clara, espaciado suave y un contraste visual sutil para interfaces organizadas y fáciles de escanear.',
  'binance': 'Exchange de criptomonedas. Acento amarillo intenso sobre monocromo, urgencia de parqué bursátil.',
  'bmw': 'Automoción de lujo. Superficies oscuras premium, estética precisa de la ingeniería alemana.',
  'bmw-m': 'Submarca de altas prestaciones de competición. Superficies de cabina casi negras, acentos tricolor de BMW M, geometría de ingeniería afilada.',
  'bold': 'Fuerte presencia visual con tipografía de gran peso, colores de alto contraste y composiciones imponentes.',
  'brutalism': 'Estética cruda y anti-diseño inspirada en la arquitectura de hormigón, con elementos sin adornos, composiciones discordantes y minimalismo funcional.',
  'bugatti': 'Marca de hiperdeportivos. Lienzo negro cine, austeridad monocroma, tipografía de display monumental.',
  'cafe': 'Interfaz acogedora inspirada en una cafetería, con tonos cálidos, tipografía suave y composiciones limpias para una experiencia de navegación relajada.',
  'cal': 'Programación de código abierto. Interfaz neutra y limpia, simplicidad orientada a desarrolladores.',
  'canva': 'Plataforma de creación visual. Degradado vivo violeta-azul, espaciado generoso, geometría amigable.',
  'cisco': 'Marca de infraestructura empresarial. Superficies oscuras de confianza, señal Cisco Blue, claridad técnica.',
  'claude': 'El asistente de IA de Anthropic. Acento terracota cálido, composición editorial limpia.',
  'clay': 'Agencia creativa. Formas orgánicas, degradados suaves, composición con dirección de arte.',
  'claymorphism': 'Formas suaves y redondeadas con aspecto 3D que imitan la arcilla maleable, con elementos lúdicos y abultados y superficies coloridas.',
  'clean': 'Diseño centrado en la simplicidad, con amplio espacio en blanco, tipografía legible y una paleta de colores limitada para reducir el ruido visual.',
  'clickhouse': 'Base de datos analítica rápida. Acentos amarillos, estilo de documentación técnica.',
  'cohere': 'Plataforma de IA empresarial. Degradados vibrantes, estética de panel rico en datos.',
  'coinbase': 'Exchange de criptomonedas. Identidad azul limpia, centrada en la confianza, con aire institucional.',
  'colorful': 'Paletas y degradados vibrantes y de alto contraste para experiencias de usuario atractivas, memorables y modernas.',
  'composio': 'Plataforma de integración de herramientas. Tono oscuro moderno con iconos de integración coloridos.',
  'contemporary': 'Diseño minimalista de la era actual, con cuadrículas bento, soporte para modo oscuro y composiciones accesibles de alto rendimiento.',
  'corporate': 'Diseño profesional y alineado con la marca, con cuadrículas estructuradas, composiciones minimalistas y patrones empresariales coherentes.',
  'cosmic': 'Estética futurista de ciencia ficción, con temas oscuros, acentos de neón vibrantes y elementos espaciales envolventes.',
  'creative': 'Diseño lúdico y protagonizado por personajes, con tipografía expresiva y gráficos llamativos para páginas de aterrizaje y proyectos creativos.',
  'cursor': 'Editor de código con IA por delante. Interfaz oscura y elegante, acentos en degradado.',
  'dashboard': 'Estética de plataforma cloud con tema oscuro, cuadrículas modulares, paneles tipo cristal y una fuerte jerarquía de datos para dashboards de productividad.',
  'default': 'Un estilo limpio y orientado a producto, ideal por defecto para herramientas B2B, dashboards y páginas de utilidad.',
  'discord': 'Plataforma de voz / chat. Blurple intenso, superficies oscuras por defecto, momentos de acento lúdicos.',
  'dithered': 'Técnica de renderizado con patrón de puntos que simula tonalidades con una paleta limitada para lograr visuales nostálgicos, retro y de alto contraste.',
  'doodle': 'Estilo dibujado a mano, tipo boceto, con garabatos, tipografías manuscritas y líneas imperfectas para un aire lúdico e informal.',
  'dramatic': 'Diseño teatral y de alto contraste, con composiciones llamativas, visuales envolventes y composiciones poco convencionales que captan la atención.',
  'duolingo': 'Plataforma de aprendizaje de idiomas. Verde búho brillante, sombras gruesas, alegría gamificada.',
  'editorial': 'Composición editorial inspirada en las revistas, con tipografía serif refinada, cuadrículas estructuradas y experiencias de lectura elegantes.',
  'elegant': 'Estética elegante y refinada, con tipografía delicada, paletas mínimas y composiciones pulidas que transmiten sofisticación.',
  'elevenlabs': 'Plataforma de voz con IA. Interfaz oscura cinematográfica, estética de forma de onda de audio.',
  'energetic': 'Estilo dinámico y vibrante, con bordes gruesos, formas geométricas, colores de alto contraste y tipografía expresiva que transmite movimiento y vitalidad.',
  'enterprise': 'Diseño empresarial limpio y de alto contraste para flujos de trabajo basados en datos, con patrones intuitivos de arrastrar y soltar y composiciones estructuradas.',
  'expo': 'Plataforma React Native. Tema oscuro, interletraje ajustado, centrado en el código.',
  'expressive': 'Diseño vibrante y con personalidad, con colores intensos, gráficos lúdicos y composiciones dinámicas que equilibran la creatividad con la estructura.',
  'fantasy': 'Estética de fantasía inspirada en los videojuegos, con visuales premium e impactantes, paletas de colores ricas y elementos temáticos envolventes.',
  'ferrari': 'Automoción de lujo. Editorial de claroscuro, acentos Ferrari Red, negro cinematográfico.',
  'figma': 'Herramienta de diseño colaborativa. Multicolor vibrante, desenfadada pero profesional.',
  'flat': 'Estilo minimalista bidimensional con colores vibrantes, tipografía limpia y sin efectos 3D para interfaces rápidas e intuitivas.',
  'framer': 'Creador de sitios web. Negro y azul intensos, con prioridad al movimiento y orientado al diseño.',
  'friendly': 'Diseño accesible e intuitivo con elementos redondeados, amplios espacios en blanco y paletas de colores pastel suaves.',
  'futuristic': 'Diseño con visión de futuro, tipografía de inspiración tecnológica, maquetaciones modernas y una estética elegante e impulsada por la innovación.',
  'github': 'Plataforma orientada al código. Densidad funcional, precisión azul sobre blanco, cimientos Primer.',
  'glassmorphism': 'Efecto de cristal esmerilado con capas translúcidas, desenfoque sutil y bordes luminosos para aportar profundidad y elegancia moderna.',
  'gradient': 'Transiciones de color suaves y superficies repletas de degradados para interfaces modernas y desenfadadas con profundidad visual.',
  'hashicorp': 'Automatización de infraestructura. Estética empresarial limpia, en blanco y negro.',
  'hud': 'Pantalla de visualización frontal (HUD) de caza o helicóptero. Verde fósforo sobre casi negro, superposiciones de datos en mayúsculas y geometría angular. Cero ambigüedad a alta velocidad y altitud.',
  'huggingface': 'Centro de la comunidad de ML. Acento amarillo brillante, identidad monoespaciada, alegre y densa.',
  'ibm': 'Tecnología empresarial. Sistema de diseño Carbon, paleta azul estructurada.',
  'intercom': 'Mensajería para clientes. Paleta azul amigable, patrones de interfaz conversacional.',
  'kami': 'Sistema editorial sobre papel: lienzo de pergamino cálido, acento azul tinta y jerarquía liderada por serifas. Pensado para currículums, hojas resumen, libros blancos, porfolios y presentaciones de diapositivas: cualquier cosa que deba parecer impresión de alta calidad en lugar de una interfaz. Multilingüe por de',
  'kraken': 'Trading de criptomonedas. Interfaz oscura con acentos morados y paneles repletos de datos.',
  'lamborghini': 'Marca de superdeportivos. Superficies de negro puro, acentos dorados y tipografía espectacular en mayúsculas.',
  'levels': 'Diseño orientado a la conversión que elimina la fricción y guía a los usuarios hacia la acción mediante claridad, confianza y rapidez.',
  'linear-app': 'Gestión de proyectos. Ultraminimalista, preciso, con acento morado.',
  'lingo': 'Diseño desenfadado y minimalista con colores vivos, formas redondeadas, bordes 3D táctiles e ilustraciones simpáticas para interfaces accesibles.',
  'loom': 'Vídeo asíncrono al estilo Loom. Morado como color principal, superficies amigables y maquetación centrada en el vídeo. Limpio y profesional sin resultar corporativo.',
  'lovable': 'Creador full-stack con IA. Degradados desenfadados, estética amigable para desarrolladores.',
  'luxury': 'Estética oscura de alta gama con titulares contundentes, paleta monocromática y un toque premium para experiencias de marcas de lujo.',
  'mastercard': 'Red de pagos global. Lienzo crema cálido, formas de píldora orbitales y calidez editorial.',
  'material': 'Material Design de Google con superficies en capas, temas dinámicos, movimiento integrado y patrones multiplataforma adaptables.',
  'meta': 'Tienda de tecnología minorista. Prioridad a la fotografía, superficies binarias claro/oscuro y CTA en Meta Blue.',
  'minimal': 'Diseño despojado que enfatiza el espacio en blanco, la tipografía limpia y el color contenido para lograr la máxima claridad y enfoque.',
  'minimax': 'Proveedor de modelos de IA. Interfaz oscura y contundente con acentos de neón.',
  'mintlify': 'Plataforma de documentación. Limpia, con acentos verdes y optimizada para la lectura.',
  'miro': 'Colaboración visual. Acento amarillo brillante, estética de lienzo infinito.',
  'mission-control': 'Monitorización de misiones espaciales/aeroespaciales. Centro de mando oscuro, telemetría ámbar y precisión monoespaciada. La claridad funcional por encima de todo.',
  'mistral-ai': 'Proveedor de LLM de pesos abiertos. Minimalismo de ingeniería francesa, con tonos morados.',
  'modern': 'Estilo editorial contemporáneo con tipografía serif, paletas minimalistas y maquetaciones limpias para productos digitales pulidos.',
  'mongodb': 'Base de datos documental. Identidad de hoja verde, enfoque en la documentación para desarrolladores.',
  'mono': 'Diseño monoespaciado de inspiración matrix con elementos de alto contraste, densidad compacta y una estética hacker-chic.',
  'neobrutalism': 'Visión moderna del brutalismo con bordes contundentes, colores de acento vivos y maquetaciones crudas de alto contraste sobre superficies cálidas.',
  'neon': 'Efectos de resplandor de neón eléctrico con combinaciones de colores de alto contraste para interfaces llamativas y contundentes.',
  'neumorphism': 'Elementos de interfaz suaves y extruidos con sombras interiores y exteriores sobre superficies monocromáticas para un aspecto táctil e integrado.',
  'nike': 'Comercio deportivo. Interfaz monocromática, tipografía enorme en mayúsculas y fotografía a sangre completa.',
  'notion': 'Espacio de trabajo todo en uno. Minimalismo cálido, titulares con serifas y superficies suaves.',
  'nvidia': 'Computación con GPU. Energía verde y negra, estética de potencia técnica.',
  'ollama': 'Ejecuta LLM de forma local. Centrado en la terminal, con una simplicidad monocroma.',
  'openai': 'Sistema sereno y casi monocromo anclado en un negro azulado profundo, con amplios espacios en blanco y tipografía editorial.',
  'opencode-ai': 'Plataforma de programación con IA. Tema oscuro centrado en el desarrollador.',
  'pacman': 'Diseño de inspiración arcade retro con tipografías de píxeles, bordes punteados, colores desenfadados de alto contraste y estética de videojuegos de 8 bits.',
  'paper': 'Diseño de textura de papel inspirado en la impresión, con colores mínimos, tipografía serif/sans limpia y cualidades de superficie táctiles.',
  'perplexity': 'Motor de búsqueda conversacional con IA. Lienzo de fondo muy oscuro, tipografía nítida, único acento violeta y jerarquía de información densa.',
  'perspective': 'Diseño de profundidad espacial con vistas isométricas, puntos de fuga y elementos en capas que guían la atención mediante un realismo similar al 3D.',
  'pinterest': 'Descubrimiento visual. Acento rojo, cuadrícula tipo mampostería, prioridad a las imágenes.',
  'playstation': 'Venta minorista de consolas de videojuegos. Diseño de canal con tres superficies, tipografía display de autoridad sobria y escalado cian al pasar el cursor.',
  'posthog': 'Analítica de producto. Identidad de marca desenfadada con un erizo, interfaz oscura amigable para desarrolladores.',
  'premium': 'Estética premium de inspiración Apple con espaciado preciso, tipografía moderna y un lenguaje visual refinado y pulido.',
  'professional': 'Diseño pulido y listo para empresas, con tipografía moderna, diseños estructurados y una identidad visual que transmite confianza.',
  'publication': 'Lenguaje visual inspirado en la impresión para libros, revistas e informes, con cuadrículas editoriales y tipografía expresiva.',
  'raycast': 'Lanzador de productividad. Acabado oscuro y elegante con vibrantes acentos en degradado.',
  'refined': 'Estilo minimalista moderno y cuidadosamente seleccionado, con elegante tipografía serif y paletas sobrias y sofisticadas.',
  'renault': 'Automoción francesa. Vibrantes degradados de aurora, tipografía NouvelR y energía audaz.',
  'replicate': 'Ejecuta modelos de ML a través de API. Lienzo blanco y limpio, orientado al código.',
  'resend': 'API de correo electrónico. Tema oscuro minimalista, acentos monospace.',
  'retro': 'Diseño nostálgico con tipografía de inspiración vintage, paletas retro de alto contraste y elementos visuales evocadores.',
  'revolut': 'Banca digital. Interfaz oscura y elegante, tarjetas en degradado, precisión fintech.',
  'runwayml': 'Generación de vídeo con IA. Interfaz oscura cinematográfica, diseño rico en contenido multimedia.',
  'sanity': 'CMS headless. Acento rojo, diseño editorial que prioriza el contenido.',
  'sentry': 'Monitorización de errores. Panel oscuro, denso en datos, acento rosa-púrpura.',
  'shadcn': 'Diseño de inspiración Shadcn/ui con componentes mínimos y limpios, paleta monocroma y patrones utility-first.',
  'shopify': 'Plataforma de comercio electrónico. Cinematográfica y oscura ante todo, acento verde neón, tipografía ultraligera.',
  'simple': 'Diseño directo y sin florituras, con tipografía limpia, colores neutros y diseños intuitivos que no estorban.',
  'skeumorphism': 'Imitación del mundo real con superficies texturizadas, efectos 3D y metáforas físicas familiares para lograr interfaces digitales intuitivas.',
  'slack': 'Plataforma de comunicación en el trabajo. Color berenjena primario, paleta de logotipo con múltiples acentos, superficies claras con barra lateral oscura, cálida y cercana.',
  'sleek': 'Estética minimalista moderna con líneas limpias, una paleta de colores intencionada, interacciones sutiles y un espaciado coherente.',
  'spacex': 'Tecnología espacial. Blanco y negro contundentes, imágenes a sangre, estilo futurista.',
  'spacious': 'Amplios espacios en blanco, relleno coherente y diseños basados en cuadrículas para interfaces limpias, legibles y con margen para respirar.',
  'spotify': 'Streaming de música. Verde vibrante sobre fondo oscuro, tipografía contundente, impulsado por las portadas de los álbumes.',
  'starbucks': 'Marca global de venta minorista de café. Sistema de cuatro niveles de verde, lienzo crema cálido, botones totalmente redondeados.',
  'storytelling': 'Diseño narrativo que utiliza recursos visuales, textos e interacción para guiar a los usuarios a través de recorridos atractivos y con resonancia emocional.',
  'stripe': 'Infraestructura de pagos. Característicos degradados púrpura, elegancia con grosor 300.',
  'supabase': 'Alternativa de código abierto a Firebase. Tema esmeralda oscuro, prioridad al código.',
  'superhuman': 'Cliente de correo rápido. Interfaz oscura premium, prioridad al teclado, resplandor púrpura.',
  'tesla': 'Automoción eléctrica. Sustracción radical, fotografía a pantalla completa, interfaz casi inexistente.',
  'tetris': 'Diseño de inspiración clásica de juegos de bloques con colores desenfadados, tipografías display contundentes y diseños compactos y de alta energía.',
  'theverge': 'Medios editoriales de tecnología. Acentos verde menta ácido y ultravioleta, tipografía display Manuka, tarjetas de historia estilo flyer de rave.',
  'together-ai': 'Infraestructura de IA de código abierto. Diseño técnico, estilo plano de planos.',
  'totality-festival': 'Un sistema oscuro glassmórfico y premium-cósmico que captura el asombro visceral de un eclipse solar: superficies de obsidiana, destacados ámbar tipo «corona» y acentos atmosféricos cian.',
  'trading-terminal': 'Terminal de trading financiero estilo Bloomberg. Solo en modo oscuro, denso en datos, señales de compra/venta en cian/coral. Todo legible de un vistazo desde dos metros de distancia.',
  'uber': 'Plataforma de movilidad. Blanco y negro contundente, tipografía compacta, energía urbana.',
  'urdu': 'Experiencias digitales con el urdu como prioridad, soporte RTL nativo, tipografía Nastaliq y armonía bilingüe.',
  'vercel': 'Despliegue de frontend. Precisión en blanco y negro, fuente Geist.',
  'vibrant': 'Diseño vivo y colorido con tipografía atrevida y desenfadada, acentos cálidos y una energía visual dinámica.',
  'vintage': 'Nostalgia de los años 50 a 90 con toques esqueuomórficos, texturas granuladas, paletas de colores retro y tipografía de estilo pixelado.',
  'vodafone': 'Marca global de telecomunicaciones. Display monumental en mayúsculas, franjas de capítulo en Vodafone Red.',
  'voltagent': 'Framework de agentes de IA. Lienzo negro absoluto, acento esmeralda, nativo de terminal.',
  'warm-editorial': 'Una estética de revista con serif protagonista. Acento terracota sobre papel blanco roto y cálido:\nideal para contenido extenso, editorial y páginas de marketing centradas en la marca.',
  'warp': 'Terminal moderna. Interfaz oscura tipo IDE, interfaz de comandos basada en bloques.',
  'webex': 'Plataforma de colaboración. Tipografía con impulso, sistema de acción en azul, espectro de acentos multiusuario.',
  'webflow': 'Constructor visual de webs. Acentos en azul, estética pulida de sitio de marketing.',
  'wechat': 'Lenguaje visual de marca para Mini Programas de WeChat, cuentas oficiales y extensiones de ecosistema abierto.',
  'wired': 'Revista tecnológica. Densidad de periódico en blanco papel, display serif personalizado, antetítulos en mono, enlaces en azul tinta.',
  'wise': 'Transferencia de dinero. Acento verde brillante, cercano y claro.',
  'x-ai': 'El laboratorio de IA de Elon Musk. Monocromo austero, minimalismo futurista.',
  'xiaohongshu': 'Plataforma social de UGC de estilo de vida. Rojo de marca único, radios generosos, el contenido primero.',
  'zapier': 'Plataforma de automatización. Naranja cálido, basada en ilustraciones cercanas.',
};

export const ES_ES_DESIGN_SYSTEM_CATEGORIES: Record<string, string> = {
  'AI & LLM': 'IA y LLM',
  'Automotive': 'Automoción',
  'Backend & Data': 'Backend y datos',
  'Bold & Expressive': 'Atrevido y expresivo',
  'Creative & Artistic': 'Creativo y artístico',
  'Design & Creative': 'Diseño y creatividad',
  'Developer Tools': 'Herramientas para desarrolladores',
  'E-Commerce & Retail': 'E-commerce y retail',
  'Editorial & Print': 'Editorial e impresión',
  'Editorial / Personal / Publication': 'Editorial / Personal / Publicación',
  'Editorial · Studio': 'Editorial · Estudio',
  'Fintech & Crypto': 'Fintech y cripto',
  'Layout & Structure': 'Maquetación y estructura',
  'Media & Consumer': 'Medios y consumo',
  'Modern & Minimal': 'Moderno y minimalista',
  'Morphism & Effects': 'Morfismo y efectos',
  'Productivity & SaaS': 'Productividad y SaaS',
  'Professional & Corporate': 'Profesional y corporativo',
  'Retro & Nostalgic': 'Retro y nostálgico',
  'Social & Messaging': 'Social y mensajería',
  'Starter': 'Inicio',
  'Themed & Unique': 'Temáticos y únicos',
};

export const ES_ES_PROMPT_TEMPLATE_CATEGORIES: Record<string, string> = {
  'Advertising': 'Publicidad',
  'Anime': 'Anime',
  'Anime / Manga': 'Anime / Manga',
  'App / Web Design': 'Diseño de apps / web',
  'Branding': 'Branding',
  'Cinematic': 'Cinematográfico',
  'Data': 'Datos',
  'Game UI': 'Interfaz de juego',
  'General': 'General',
  'Illustration': 'Ilustración',
  'Infographic': 'Infografía',
  'Live Artifact': 'Artefacto en vivo',
  'Marketing': 'Marketing',
  'Motion Graphics': 'Grafismo en movimiento',
  'Product': 'Producto',
  'Profile / Avatar': 'Perfil / Avatar',
  'Short Form': 'Formato corto',
  'Social / Meme': 'Social / Meme',
  'Social Media Post': 'Publicación en redes sociales',
  'Travel': 'Viajes',
  'VFX / Fantasy': 'VFX / Fantasía',
  'VFX / HTML-in-Canvas': 'VFX / HTML en el lienzo',
};

export const ES_ES_PROMPT_TEMPLATE_TAGS: Record<string, string> = {
  '3d': '3d',
  '3d-render': 'renderizado-3d',
  'action': 'acción',
  'ancient-china': 'china-antigua',
  'anime': 'anime',
  'app-showcase': 'escaparate-de-apps',
  'archery': 'tiro-con-arco',
  'arpg': 'arpg',
  'audio-reactive': 'reactivo-al-audio',
  'boss-fight': 'combate-contra-jefe',
  'brand': 'marca',
  'branding': 'branding',
  'captions': 'subtítulos',
  'cavalry': 'caballería',
  'chart': 'gráfico',
  'childlike': 'infantil',
  'choreography': 'coreografía',
  'cinematic': 'cinematográfico',
  'cinematic-romance': 'romance-cinematográfico',
  'combat': 'combate',
  'combo': 'combo',
  'companion-to-image': 'acompañante-a-imagen',
  'counter': 'contador',
  'crayon': 'crayón',
  'cyberpunk': 'cyberpunk',
  'dance': 'baile',
  'dashboard': 'panel',
  'data': 'datos',
  'data-viz': 'visualización-de-datos',
  'destruction': 'destrucción',
  'displacement': 'desplazamiento',
  'editorial': 'editorial',
  'elden-ring': 'elden-ring',
  'endcard': 'tarjeta-final',
  'escort': 'escolta',
  'escort-mission': 'misión-de-escolta',
  'fantasy': 'fantasía',
  'fashion': 'moda',
  'fighting-game': 'juego-de-lucha',
  'food': 'comida',
  'game-cinematic': 'cinemática-de-juego',
  'game-ui': 'interfaz-de-juego',
  'grid-sheet': 'hoja-de-cuadrícula',
  'guanyu': 'guanyu',
  'hand-drawn': 'dibujado-a-mano',
  'hero': 'héroe',
  'html-in-canvas': 'html-en-lienzo',
  'hud': 'hud',
  'hud-safe': 'hud-seguro',
  'hype': 'expectación',
  'hyperframes': 'hyperframes',
  'idol': 'ídolo',
  'illustration': 'ilustración',
  'image-to-image': 'imagen-a-imagen',
  'infographic': 'infografía',
  'iphone': 'iphone',
  'japanese': 'japonés',
  'karaoke': 'karaoke',
  'key-visual': 'imagen clave',
  'keynote': 'keynote',
  'kinetic-typography': 'tipografía cinética',
  'linear-style': 'estilo Linear',
  'liquid': 'líquido',
  'liquid-glass': 'cristal líquido',
  'live-artifact': 'artefacto en vivo',
  'logo': 'logotipo',
  'lyubu': 'lyubu',
  'macbook': 'macbook',
  'magnetic': 'magnético',
  'map': 'mapa',
  'marketing': 'marketing',
  'minimal': 'minimalista',
  'mmo': 'mmo',
  'mobile': 'móvil',
  'money': 'dinero',
  'mounted-combat': 'combate a caballo',
  'nature': 'naturaleza',
  'open-world': 'mundo abierto',
  'otaku-dance': 'baile otaku',
  'outro': 'cierre',
  'overlay': 'superposición',
  'particles': 'partículas',
  'pipeline': 'pipeline',
  'portal': 'portal',
  'portrait': 'retrato',
  'pose-reference': 'referencia de pose',
  'product': 'producto',
  'product-demo': 'demo de producto',
  'product-promo': 'promoción de producto',
  'rework': 'rediseño',
  'route': 'ruta',
  'saas': 'saas',
  'sequence': 'secuencia',
  'shader': 'shader',
  'shatter': 'fragmentación',
  'sizzle': 'sizzle',
  'social': 'social',
  'storyboard': 'guion gráfico',
  'street-fighter': 'street-fighter',
  'style-transfer': 'transferencia de estilo',
  'tekken': 'tekken',
  'text': 'texto',
  'three-kingdoms': 'tres reinos',
  'tiktok': 'tiktok',
  'title-card': 'cartón de título',
  'transform': 'transformar',
  'travel': 'viajes',
  'tts': 'tts',
  'typography': 'tipografía',
  'unreal-engine-5': 'unreal-engine-5',
  'vertical': 'vertical',
  'video-reference': 'referencia de vídeo',
  'vs-screen': 'pantalla vs',
  'webgl': 'webgl',
  'website-to-video': 'sitio web a vídeo',
  'wuxia': 'wuxia',
  'zhaoyun': 'zhaoyun',
};

export const ES_ES_PROMPT_TEMPLATE_COPY: Record<string, Partial<Pick<PromptTemplateSummary, 'summary' | 'title'>>> = {
  '3d-stone-staircase-evolution-infographic': {
    title: 'Infografía de evolución en escalera de piedra 3D',
    summary:
      'Transforma una línea de tiempo evolutiva plana en una infografía realista de escalera de piedra 3D con renders detallados de organismos y paneles laterales estructurados.',
  },
  'anime-martial-arts-battle-illustration': {
    title: 'Ilustración de batalla de artes marciales anime',
    summary:
      'Genera una ilustración anime dinámica y de gran impacto de dos personajes femeninos luchando en un dojo tradicional con efectos de energía elemental.',
  },
  'e-commerce-live-stream-ui-mockup': {
    title: 'Maqueta de interfaz de retransmisión en directo de comercio electrónico',
    summary:
      'Genera una interfaz realista de retransmisión en directo de redes sociales superpuesta a un retrato, con mensajes de chat personalizables, ventanas emergentes de regalos y una tarjeta de compra de producto.',
  },
  'game-screenshot-anime-fighting-game-captain-ryuuga-vs-kaze-renshin': {
    title: 'Captura de pantalla de juego - Juego de lucha anime: Captain Ryuuga vs Kaze Renshin',
    summary:
      'Una imagen clave / captura de combate de un juego de lucha al estilo del arte de presentación de Street Fighter 6 o Tekken 8. Dos guerreros varones de estilo anime se enfrentan en el centro del dramático patio de un templo chino de noche: a la izquierda, un pirata sin camisa con sombrero de paja y un aura de fuego naranja-rojiza cálida, y a la derecha, un artista marcial de pelo de punta con un gi naranja cargando una enorme esfera de energía de relámpago azul crepitante. Incluye un HUD completo de juego de lucha (barras de salud dobles, temporizador de asalto, paneles de retrato P1/P2 con luchadores nombrados y emblemas, contadores de combo y medidores máximos por cada lado). La gradación de color dividida entre naranja cálido y azul frío coincide con la convención de luchadores rivales del género. Optimizado para gpt-image-2 en 16:9.',
  },
  'game-screenshot-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Captura de pantalla de juego - ARPG de los Tres Reinos: Guan Yu mata a Yan Liang',
    summary:
      'Una captura de pantalla de un RPG de acción de la icónica escena de los Tres Reinos en la que Guan Yu cabalga su corcel de guerra Liebre Roja a través de un campo de batalla bajo lluvia torrencial y carga hacia el general enemigo Yan Liang. Renderizado en el estilo cinematográfico fotorrealista de Black Myth: Wukong, Unreal Engine 5, con cámara de seguimiento en tercera persona desde detrás y a la izquierda del héroe montado. Un HUD completo de combate contra jefe (retrato, minimapa con densos puntos de enemigos, barra de habilidades con un aviso de golpe final, barra de vida flotante del jefe sobre el general enemigo) convierte la escena en un momento de combate ARPG AAA. Optimizado para gpt-image-2 en 16:9.',
  },
  'game-screenshot-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Captura de pantalla de juego - ARPG de los Tres Reinos: el tiro con arco de Lü Bu en Yuanmen',
    summary:
      'Una captura de pantalla de un RPG de acción de la famosa escena de los Tres Reinos en la que Lü Bu derriba con una flecha una alabarda lejana en la puerta del campamento para detener una batalla. Renderizado en el estilo cinematográfico fotorrealista de Black Myth: Wukong, Unreal Engine 5 Nanite/Lumen, con cámara de juego en tercera persona sobre el hombro. Una superposición de HUD completa en el juego (barras de salud + qi, minimapa, barra de habilidades, marcador de objetivo fijado con lectura de distancia a la alabarda lejana) hace que se lea como una captura real de un ARPG de nueva generación en lugar de una escena cinemática. Optimizado para gpt-image-2 en 16:9.',
  },
  'game-screenshot-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Captura de pantalla de juego - ARPG de los Tres Reinos: la huida con el niño en brazos de Zhao Yun en Changbanpo',
    summary:
      'Una captura de pantalla de un RPG de acción de la legendaria escena de los Tres Reinos en la que Zhao Yun sostiene al pequeño Liu Chan en un brazo y se abre paso a través de las líneas enemigas con una lanza en el otro en Changbanpo. Renderizado en el estilo cinematográfico fotorrealista de Black Myth: Wukong combinado con Elden Ring, Unreal Engine 5 con Nanite completo, trazado de rayos Lumen y rayos de luz volumétricos. El núcleo emocional —un brazo protegiendo al bebé envuelto, un brazo luchando por la vida— se refuerza con una superposición de HUD completa que incluye una barra de protección de ESCOLTA dedicada al bebé, un contador de combo y ventanas emergentes de números de daño en el aire sobre los enemigos lanzados. Optimizado para gpt-image-2 en 16:9.',
  },
  'game-ui-ancient-china-open-world-mmo-hud': {
    title: 'Interfaz de juego - HUD de MMO de mundo abierto de la China antigua',
    summary:
      'Genera una maqueta de captura de pantalla de HUD en el juego para un MMO de mundo abierto AAA de la China antigua, en el estilo cinematográfico fotorrealista de Black Myth: Wukong. Una hermosa protagonista espadachina ancla el centro del encuadre en una escena de antiguo santuario de montaña entre la niebla, rodeada por un HUD de MMO completo: retrato del personaje arriba a la izquierda con barras de HP/MP/aguante e iconos de buff, barra de habilidades en el centro inferior con iconos de habilidad de caligrafía china, minimapa arriba a la derecha con marcadores de misión, panel de seguimiento de misiones en el lado derecho, ventana de chat desplazable abajo a la izquierda, placas de nombre de NPC flotantes en el espacio del mundo y signo de exclamación de misión. Renderizado como una captura de pantalla de monitor realista, 16:9, adecuado para presentaciones de propuestas, imágenes clave estilo gamescom y teasers de juegos para Xiaohongshu/bilibili.',
  },
  'illustrated-city-food-map': {
    title: 'Mapa gastronómico ilustrado de la ciudad',
    summary:
      'Genera un mapa turístico dibujado a mano, estilo acuarela, con especialidades gastronómicas locales numeradas, puntos de interés y una leyenda.',
  },
  'illustration-crayon-kid-drawing-rework': {
    title: 'Ilustración - Reelaboración de dibujo infantil con ceras',
    summary:
      'Un prompt de transferencia de estilo que transforma cualquier imagen de referencia (foto de producto, captura de pantalla, retrato, maqueta de UI) en una ilustración dibujada a mano con ceras que parece hecha por un niño de 10 años. Sustituye la paleta original por colores de cera vivos y desenfadados sobre papel blanco limpio, y añade un toque infantil y caprichoso — castillos, caramelos, estrellas, nubes, arcoíris — para amplificar el ambiente inocente de cuento ilustrado. Funciona como una edición imagen a imagen en GPT-image-2 (requiere subir una imagen de referencia junto al prompt); muy adecuado para capturas de pantalla de sitios web, key art de marca, fotos de producto y retratos.',
  },
  'infographic-otaku-dance-choreography-breakdown-gokurakujodo-16-panels': {
    title: 'Infografía - Desglose de la coreografía de baile otaku (Gokuraku Jodo, 16 paneles)',
    summary:
      'Un único póster vertical 2:3 compuesto como una cuadrícula de 4×4 con 16 paneles cuadrados conectados, que forman un gráfico completo de desglose de la coreografía de la famosa canción japonesa de baile otaku 極楽浄土 (Gokuraku Jodo). Cada panel muestra a la misma chica idol de anime semirrealista y adorable (coletas rosas, uniforme escolar de idol con cuello marinero) ejecutando una pose característica del baile, de cuerpo entero, sobre un fondo rosa pastel con una pequeña franja de texto en japonés en la parte inferior y un círculo numerado en la esquina superior izquierda. Diseñado explícitamente como una hoja de REFERENCIA DE POSES para la generación de vídeo con IA: cada silueta es nítida e inequívoca, sin líneas de movimiento ni elementos de fondo que distraigan. Ajustado para gpt-image-2, proporción 2:3. Categoría: Infografía.',
  },
  'momotaro-explainer-slide-in-hybrid-style': {
    title: 'Diapositiva explicativa de Momotaro en estilo híbrido',
    summary:
      'Un prompt que combina la estética sencilla y cálida de las ilustraciones de Irasutoya con la alta densidad de información característica de las diapositivas gubernamentales japonesas.',
  },
  'notion-team-dashboard-live-artifact': {
    title: 'Panel de equipo estilo Notion (artefacto en vivo)',
    summary:
      'Maqueta de panel de equipo de una sola pantalla nativa de Notion: cuadrícula de KPI, sparkline de 7 días, feed de actividad y tabla de tareas con base de datos vinculada. Complemento visual de la skill de artefacto en vivo; combínalo con ella para ejecuciones actualizables o respaldadas por conectores, o úsalo de forma independiente como maqueta estática.',
  },
  'profile-avatar-anime-girl-to-cinematic-photo': {
    title: 'Perfil / Avatar - De chica anime a foto cinematográfica',
    summary:
      'Este prompt convierte una ilustración de referencia de personaje en un retrato realista de interior vintage de tonos cálidos, conservando el atuendo, la pose y el gato originales.',
  },
  'profile-avatar-casual-fashion-grid-photoshoot': {
    title: 'Perfil / Avatar - Sesión de fotos de moda informal en cuadrícula',
    summary:
      'Un prompt estructurado en JSON para un collage de 4 fotos de una sesión de fotos de moda informal con parámetros detallados de sujeto e iluminación.',
  },
  'profile-avatar-cinematic-south-asian-male-portrait-with-vultures': {
    title: 'Perfil / Avatar - Retrato cinematográfico de hombre del sur de Asia con buitres',
    summary:
      'Un detallado retrato cinematográfico de un joven del sur de Asia en un entorno de fantasía oscura y melancólica, rodeado de buitres y cuervos.',
  },
  'profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    title: 'Perfil / Avatar - Retrato anime cyberpunk con texto de neón en el rostro',
    summary:
      'Un elegante retrato anime bañado en neón para pósteres, arte para redes sociales o imágenes de marca futuristas.',
  },
  'profile-avatar-elegant-fantasy-girl-in-violet-garden': {
    title: 'Perfil / Avatar - Elegante chica de fantasía en un jardín violeta',
    summary:
      'Este prompt genera un pulido retrato de fantasía estilo anime de una mujer elegante con cabello brillante y peinado, ropa recargada en violeta y negro, y un escenario de jardín mágico lleno de flores, ideal para personajes',
  },
  'profile-avatar-ethereal-blue-haired-fantasy-portrait': {
    title: 'Perfil / Avatar - Retrato de fantasía etéreo de cabello azul',
    summary:
      'Este prompt genera un retrato suave y luminoso de personaje de fantasía estilo anime, ideal para crear elegante key art vertical o ilustraciones de personajes con cabello fluido y una atmósfera primaveral de ensueño.',
  },
  'profile-avatar-glamorous-woman-in-black-portrait': {
    title: 'Perfil / Avatar - Mujer glamurosa en retrato de negro',
    summary:
      'Este prompt genera un retrato fotorrealista de estilo de lujo de una mujer elegante con un atuendo negro de escote pronunciado, ideal para imágenes editoriales de moda o de belleza.',
  },
  'profile-avatar-hyper-realistic-selfie-texture-prompts': {
    title: 'Perfil / Avatar - Prompts de textura para selfies hiperrealistas',
    summary:
      'Fragmentos de prompt detallados para generar texturas de piel realistas y un encuadre auténtico de selfie de móvil, centrados en poros visibles e iluminación natural.',
  },
  'profile-avatar-lavender-fantasy-mage-portrait': {
    title: 'Perfil / Avatar - Retrato de maga de fantasía en lavanda',
    summary:
      'Este prompt genera un pulido retrato de fantasía estilo anime de una elegante princesa maga con cabello rubio brillante, flores moradas y un atuendo recargado de cristal, ideal para arte de personajes o ilustraciones mágicas',
  },
  'profile-avatar-monochrome-studio-portrait': {
    title: 'Perfil / Avatar - Retrato monocromo de estudio',
    summary:
      'Un prompt de fotografía comercial de alta gama para un retrato monocromo con un característico fondo dividido e iluminación de estudio dramática.',
  },
  'profile-avatar-old-photo-restoration-to-dslr-portrait': {
    title: 'Perfil / Avatar - Restauración de foto antigua a retrato DSLR',
    summary:
      'Este prompt restaura una foto familiar vintage de 4 personas dañada y la convierte en un retrato realista limpio, coloreado y de alta resolución para la reparación y mejora de fotos.',
  },
  'profile-avatar-poetic-woman-in-garden-portrait': {
    title: 'Perfil / Avatar - Retrato de mujer poética en un jardín',
    summary:
      'Este prompt genera un retrato realista de estilo editorial de una joven aficionada a los libros en un jardín soleado, ideal para fotografía de estilo de vida, marca literaria o imágenes elegantes de personajes.',
  },
  'profile-avatar-professional-identity-portrait-wallpaper': {
    title: 'Perfil / Avatar - Fondo de pantalla de retrato de identidad profesional',
    summary:
      'Genera un fondo de pantalla premium de alta resolución que presenta a un sujeto con atuendo profesional, junto con actividades relacionadas con su carrera y tipografía.',
  },
  'profile-avatar-realistically-imperfect-ai-selfie': {
    title: 'Perfil / Avatar - Selfie de IA realistamente imperfecto',
    summary:
      'Un prompt creativo que se usa con GPT Image 2 para generar un selfie \'fallido\' que parece una instantánea accidental y de baja calidad tomada con un smartphone.',
  },
  'profile-avatar-signed-marker-portrait-on-shikishi': {
    title: 'Perfil / Avatar - Retrato firmado a rotulador sobre shikishi',
    summary:
      'Esto genera un animado retrato firmado al estilo rotulador sobre una tabla shikishi cuadrada, útil para autógrafos de fan-art, publicaciones de ilustración conmemorativa y visuales personalizados de agradecimiento.',
  },
  'profile-avatar-snow-rabbit-empress-portrait': {
    title: 'Perfil / Avatar - Retrato de la emperatriz conejo de nieve',
    summary:
      'Un prompt de retrato de fantasía realista para generar una majestuosa mujer con temática de conejo vestida con un recargado hanfu de invierno, de pie en un templo de montaña nevada.',
  },
  'profile-avatar-snow-rabbit-mask-hanfu-portrait': {
    title: 'Perfil / Avatar - Retrato con hanfu y máscara de conejo de nieve',
    summary:
      'Este prompt genera un retrato cinematográfico de fantasía invernal de una mujer enmascarada con un Hanfu blanco de temática de conejo, ideal para arte de personajes elegante e imágenes atmosféricas de muestra generadas con IA.',
  },
  'profile-avatar-snowy-rabbit-hanfu-portrait': {
    title: 'Perfil / Avatar - Retrato de Hanfu de conejo nevado',
    summary:
      'Este prompt genera un retrato de fantasía de belleza ultradetallado de una mujer con orejas de conejo y un hanfu bordado, ideal para arte de personajes elegante, diseño de vestuario o muestras de retratos cinematográficos generados con IA.',
  },
  'profile-avatar-snowy-rabbit-spirit-portrait': {
    title: 'Perfil / Avatar - Retrato de espíritu de conejo nevado',
    summary:
      'Este prompt genera un sereno retrato de fantasía de una mujer anónima con orejas de conejo en invierno, ideal para arte de personajes atmosférico e ilustraciones de perfil estilizadas.',
  },
  'profile-avatar-song-dynasty-hanfu-portrait': {
    title: 'Perfil / Avatar - Retrato de Hanfu de la dinastía Song',
    summary:
      'Un prompt optimizado para generar un retrato detallado y realista de una belleza con Hanfu tradicional de la dinastía Song dentro de un patio antiguo.',
  },
  'social-media-post-anime-pokemon-shop-outfit-teaser-poster': {
    title: 'Publicación en redes sociales - Póster teaser de conjunto de la tienda Pokémon estilo anime',
    summary:
      'Este prompt genera un póster de anuncio de moda anime en suaves tonos pastel con una chica de cara difuminada con un vestido azul dentro de una tienda Pokémon, ideal para teasers de presentación de conjuntos e imágenes promocionales de personajes.',
  },
  'social-media-post-cinematic-elevator-scene': {
    title: 'Publicación en redes sociales - Escena cinematográfica de ascensor',
    summary:
      'Un prompt para generar una escena cinematográfica y atmosférica de una mujer dentro de un ascensor metálico con iluminación y reflejos realistas.',
  },
  'social-media-post-confused-elf-girl-at-pastel-desk': {
    title: 'Publicación en redes sociales - Chica elfa confundida en un escritorio pastel',
    summary:
      'Este prompt genera una ilustración anime en suaves tonos pastel de una chica elfa escribiendo en su ordenador en un acogedor espacio de trabajo kawaii, ideal para publicaciones en redes sociales, fondos de pantalla o arte de temática de streamers.',
  },
  'social-media-post-editorial-fashion-photography': {
    title: 'Publicación en redes sociales - Fotografía de moda editorial',
    summary:
      'Un prompt atmosférico centrado en la moda para una escena de estudio minimalista con iluminación suave y tonos cálidos.',
  },
  'social-media-post-fashion-editorial-collage': {
    title: 'Publicación en redes sociales - Collage editorial de moda',
    summary:
      'Un prompt de collage fotográfico 2x2 muy detallado para tomas editoriales de moda, centrado en un estilismo coherente, una iluminación específica y rasgos faciales de una foto de referencia.',
  },
  'social-media-post-psg-transfer-announcement-poster': {
    title: 'Publicación en redes sociales - Póster de anuncio de fichaje del PSG',
    summary:
      'Un póster de fichaje futbolístico audaz y profesional para anunciar el traspaso de un jugador al Paris Saint-Germain en redes sociales o gráficos promocionales deportivos.',
  },
  'social-media-post-sensational-girl-dance-storyboard-8-shots': {
    title: 'Publicación en redes sociales - Storyboard de baile de chica sensacional (8 tomas)',
    summary:
      'Un conjunto completo de prompts de storyboard de 8 tomas para generar una secuencia de baile coherente fotograma a fotograma de un personaje con estilo. Incluye tokens de estilo global compartidos, un prompt negativo reutilizable y ocho prompts por toma (pose de apertura, movimiento de cadera, ondulación corporal, giro de cintura en el drop, balanceo lateral de cadera, sacudida de pelo, pose de poder, pose final). Ajustado para modelos de la categoría GPT-Image-2: vocabulario conciso, sin formulaciones sensibles, lenguaje de encuadre e iluminación coherente entre tomas para que los fotogramas parezcan una coreografía continua.',
  },
  'social-media-post-showa-day-retro-culture-magazine-cover': {
    title: 'Publicación en redes sociales - Portada de revista de cultura retro del Día de Showa',
    summary:
      'Una cálida página destacada de estilo editorial sobre una festividad japonesa que combina arte de personajes anime, imágenes nostálgicas de calles de la era Showa y una maquetación informativa estilo revista para promociones culturales de temporada.',
  },
  'social-media-post-social-media-fashion-outfit-generation': {
    title: 'Publicación en redes sociales - Generación de conjuntos de moda para redes sociales',
    summary:
      'Un prompt para generar las recomendaciones de conjuntos de toda una semana al estilo de un blogger de moda basadas en el perfil de un personaje, con etiquetas de prendas y precios incluidos.',
  },
  'social-media-post-travel-snapshot-collage-prompt': {
    title: 'Publicación en redes sociales - Prompt de collage de instantáneas de viaje',
    summary:
      'Un prompt detallado para crear un collage nostálgico de 12 fotogramas de fotos de viaje estilo smartphone que representan un viaje en solitario.',
  },
  'social-media-post-vintage-sign-painter-sketch': {
    title: 'Publicación en redes sociales - Boceto vintage de rotulista',
    summary:
      'Genera un boceto a mano con rotulador sobre papel con detalles realistas como líneas de grafito y sangrado de tinta, perfecto para estilos de letras vintage.',
  },
  'vr-headset-exploded-view-poster': {
    title: 'Póster de vista despiezada de visor VR',
    summary:
      'Genera un diagrama de vista despiezada de alta tecnología de un visor VR con leyendas detalladas de los componentes y texto promocional.',
  },
  '3d-animated-boy-building-lego': {
    title: 'Niño en animación 3D construyendo con Lego',
    summary:
      'Un prompt de vídeo multitoma en estilo de animación 3D que describe a un niño ensamblando cuidadosamente piezas de Lego en una habitación, con efectos de time-lapse.',
  },
  'a-decade-of-refinement-glow-up': {
    title: 'Transformación de una década de perfeccionamiento',
    summary:
      'Un prompt de transformación para Seedance 2.0 que muestra la transición de un hombre desde un entorno informal de 2016 a un lujoso estilo de vida en el Dubái de 2026, manteniendo la coherencia del personaje.',
  },
  'ancient-guardian-dragon-rescue': {
    title: 'Rescate del antiguo dragón guardián',
    summary:
      'Un prompt cinematográfico multitoma detallado para una historia sobre una chica de un pueblo lluvioso salvada por un dragón emergente, centrado en los VFX y el sonido atmosférico.',
  },
  'ancient-indian-kingdom-fpv-video': {
    title: 'Vídeo FPV de un antiguo reino indio',
    summary:
      'Un prompt cinematográfico de ritmo trepidante al estilo de dron FPV que representa un místico reino indio con templos y selvas.',
  },
  'animation-transfer-and-camera-tracking-prompt': {
    title: 'Prompt de transferencia de animación y seguimiento de cámara',
    summary:
      'Un prompt técnico para Seedance 2.0 que aplica una referencia de movimiento específica a un personaje mientras mantiene un seguimiento de cámara fijo.',
  },
  'beat-synced-outfit-transformation-dance': {
    title: 'Baile con transformación de vestuario sincronizada al ritmo',
    summary:
      'Un prompt para Seedance 2.0 que coordina el baile de un personaje siguiendo fotogramas de desglose mientras realiza un cambio de vestuario sincronizado al ritmo.',
  },
  'character-intro-motion-graphics-sequence': {
    title: 'Secuencia de motion graphics de presentación de personajes',
    summary:
      'Un prompt complejo de motion graphics de varias etapas para presentar a un equipo de personajes con superposiciones de UI y transiciones específicas, diseñado para el modelo Seedance 2.0.',
  },
  'cinematic-birthday-celebration-sequence': {
    title: 'Secuencia cinematográfica de celebración de cumpleaños',
    summary:
      'Un prompt de vídeo multiplano muy detallado para una secuencia de cumpleaños, centrado en la coherencia del personaje y la narrativa emocional.',
  },
  'cinematic-dragon-interaction-flight': {
    title: 'Interacción cinematográfica con un dragón y vuelo',
    summary:
      'Un prompt detallado al estilo storyboard para un vídeo que muestra la interacción emocional de una mujer con un dragón, seguida de una secuencia de vuelo cinematográfica.',
  },
  'cinematic-east-asian-woman-hand-dance': {
    title: 'Baile de manos cinematográfico de una mujer del este de Asia',
    summary:
      'Un prompt de vídeo cinematográfico multiplano muy detallado para un baile de manos estilizado, con instrucciones codificadas por tiempo para el movimiento de cámara y las acciones del personaje.',
  },
  'cinematic-emotional-face-close-up': {
    title: 'Primer plano cinematográfico de un rostro emocional',
    summary:
      'Un prompt técnico muy detallado para Seedance 2.0 centrado en texturas de piel realistas y una serie de transiciones faciales emocionales complejas.',
  },
  'cinematic-marine-biologist-exploration': {
    title: 'Exploración cinematográfica de una bióloga marina',
    summary:
      'Un prompt de vídeo cinematográfico detallado para una escena submarina que muestra a una bióloga marina descubriendo el naufragio de un barco antiguo en un arrecife de coral.',
  },
  'cinematic-music-podcast-and-guitar-technique': {
    title: 'Pódcast musical cinematográfico y técnica de guitarra',
    summary:
      'Un prompt cinematográfico avanzado para generar un vídeo de pódcast musical en 4K, con un enfoque específico en la técnica de guitarra, los pinch harmonics y la estética de estudio.',
  },
  'cinematic-route-navigation-guide': {
    title: 'Guía de navegación de ruta cinematográfica',
    summary:
      'Un prompt multiescena estructurado diseñado para Seedance para crear un vídeo de navegación a pie coherente, con un personaje guía turístico recurrente y transiciones fluidas entre ubicaciones del mundo real.',
  },
  'cinematic-street-racing-sequence-for-seedance-2': {
    title: 'Secuencia cinematográfica de carreras callejeras para Seedance 2',
    summary:
      'Un prompt detallado y multiplano diseñado para Seedance 2 para generar una secuencia cinematográfica de carreras callejeras nocturnas, centrada en la concentración intensa del conductor, un trabajo de cámara dinámico y aceleraciones explosivas, estruct',
  },
  'cinematic-vampire-alley-fight-sequence': {
    title: 'Secuencia cinematográfica de pelea de vampiros en un callejón',
    summary:
      'Un prompt de acción completo para una escena de cortometraje con movimientos de cámara dinámicos y combate a alta velocidad en un callejón iluminado con neón.',
  },
  'crimson-horizon-sci-fi-cinematic-sequence': {
    title: 'Secuencia cinematográfica de ciencia ficción Crimson Horizon',
    summary:
      'Una secuencia de vídeo cinematográfica completa de 9 planos para una película de ciencia ficción titulada \'Crimson Horizon\', que detalla todo, desde el lanzamiento de un cohete hasta un inquietante encuentro alienígena en Marte.',
  },
  'cyberpunk-game-trailer-script': {
    title: 'Guion de tráiler de videojuego cyberpunk',
    summary:
      'Un extenso prompt de generación de vídeo para un tráiler de videojuego cyberpunk, que detalla el diseño de personajes, las animaciones de UI y las transiciones de entorno de un vacío blanco a una favela.',
  },
  'forbidden-city-cat-satire': {
    title: 'Sátira del gato de la Ciudad Prohibida',
    summary:
      'Un prompt complejo de comedia negra para Seedance 2.0 que presenta a un gato naranja funcionario y a un emperador hiena en un escenario satírico de la dinastía Qing.',
  },
  'hollywood-haute-couture-fantasy-video-prompt': {
    title: 'Prompt de vídeo de fantasía de alta costura de Hollywood',
    summary:
      'Un prompt de generación de vídeo detallado y multiescena para Seedance 2.0, diseñado para crear una película de fantasía de alta costura de Hollywood. El prompt especifica el estilo, la resolución (8K), el motor de renderizado (Unreal Engin',
  },
  'hunched-character-animation': {
    title: 'Animación de personaje encorvado',
    summary:
      'Instrucción para Seedance 2 para crear una animación de caminata en el sitio para una referencia de personaje específica.',
  },
  'hyperframes-html-in-canvas-iphone-device': {
    title: 'HyperFrames HTML-in-Canvas: demo de producto 3D de iPhone + MacBook',
    summary:
      'Una demo de producto de 15 segundos en la que un iPhone 15 Pro Max y un MacBook Pro reales en GLTF flotan sobre un escenario limpio con la UI real de la app renderizándose en directo en sus pantallas mediante drawElementImage. Reflejo de lente de cristal cambiante (morphing) + plataforma giratoria de 360°. Creado a partir del bloque de catálogo vfx-iphone-device.',
  },
  'hyperframes-html-in-canvas-text-cursor': {
    title: 'HyperFrames HTML-in-Canvas: revelación cinematográfica de texto con cursor',
    summary:
      'Una revelación de texto dramática de 8 segundos con brillo de cursor, rayos de sombra cromática e iluminación direccional sobre un escenario negro. Tipografía DOM real bajo posprocesamiento de shader en directo. Creado a partir del bloque de catálogo vfx-text-cursor.',
  },
  'hyperframes-html-in-canvas-shatter': {
    title: 'HyperFrames HTML-in-Canvas: outro de cristal roto',
    summary:
      'Un outro de cristal roto en HTML de 12 segundos: una página de producto o tarjeta de precios real se mantiene un instante y luego estalla en fragmentos de cristal refractantes con desenfoque de profundidad y dispersión cromática. Creado a partir del bloque de catálogo vfx-shatter. Combina bien como tarjeta final tras una composición más larga.',
  },
  'hyperframes-html-in-canvas-liquid-background': {
    title: 'HyperFrames HTML-in-Canvas: hero con fondo líquido',
    summary:
      'Un hero de 12 segundos con contenido HTML flotando sobre una superficie líquida orgánica — plano subdividido con desplazamiento de vértices, dinámica de olas en tiempo real, el DOM capturado se desliza por encima nítido y legible. Construido sobre el bloque de catálogo vfx-liquid-background.',
  },
  'hyperframes-html-in-canvas-liquid-glass': {
    title: 'HyperFrames HTML-in-Canvas: revelado de landing con efecto Liquid Glass',
    summary:
      'Un revelado voronoi de cristal líquido de 20 segundos de una landing page de producto real — el DOM se captura en directo mediante drawElementImage, se fragmenta en celdas de cristal que refractan la luz y luego se asienta en una toma hero limpia. Construido sobre el bloque de catálogo vfx-liquid-glass.',
  },
  'hyperframes-html-in-canvas-magnetic': {
    title: 'HyperFrames HTML-in-Canvas: visualización de campo magnético',
    summary:
      'Una visualización de partículas de campo magnético de 15 segundos que reacciona a un mapa de calor o gráfico en directo sobre el DOM — las partículas trazan líneas de campo que se curvan alrededor del HTML capturado, ideal para productos de ML/datos. Construido sobre el bloque de catálogo vfx-magnetic.',
  },
  'hyperframes-html-in-canvas-portal-reveal': {
    title: 'HyperFrames HTML-in-Canvas: dashboard con revelado de portal',
    summary:
      'Un portal dimensional de 10 segundos se abre sobre un dashboard de datos en directo — DOM capturado en tiempo real, derrame de luz volumétrica, partículas en el borde del portal. Construido sobre el bloque de catálogo vfx-portal. Diseñado para tomas hero de datos estilo keynote.',
  },
  'hyperframes-money-counter-hype': {
    title: 'HyperFrames: contador de dinero $0 → $10K con efecto hype (9:16)',
    summary:
      'Un clip hype vertical de HyperFrames de 6 segundos a 1080×1920 — contador estilo Apple de $0 → $10.000 con destello verde, partículas de explosión de dinero, icono de fajo de billetes y titular de remate. Construido sobre el bloque de catálogo `apple-money-count` de HyperFrames.',
  },
  'hyperframes-app-showcase-three-phones': {
    title: 'HyperFrames: showcase de app de 12 segundos — tres teléfonos flotantes',
    summary:
      'Una composición de showcase de app de 12 segundos en 16:9 — tres pantallas de iPhone flotantes suspendidas en el espacio 3D, cada una rotando por turnos para mostrar una función diferente, etiquetas de texto sincronizadas con el ritmo y cierre con bloqueo de logo. Construido directamente sobre el bloque de catálogo `app-showcase` de HyperFrames.',
  },
  'hyperframes-brand-sizzle-reel': {
    title: 'HyperFrames: sizzle reel de marca de 30 segundos',
    summary:
      'Un sizzle reel de HyperFrames de 30 segundos en 16:9 — cortes rápidos, tipografía cinética sincronizada con el ritmo, escala reactiva al audio en las palabras destacadas, transiciones con shaders entre cinco escenas y tarjeta final con destello de logo. Inspirado en el arquetipo aisoc-hype del kit para estudiantes.',
  },
  'hyperframes-saas-product-promo-30s': {
    title: 'HyperFrames: promo de producto SaaS de 30 segundos (estilo Linear)',
    summary:
      'Una composición de HyperFrames de 30 segundos inspirada en los vídeos de producto estilo Linear/ClickUp — revelados 3D de la UI, tipografía cinética sincronizada con el ritmo, capturas de pantalla de la UI animadas y tarjeta final con outro de logo. Construido a partir de bloques de catálogo de HF (ui-3d-reveal, app-showcase, logo-outro) más transiciones con shaders entre escenas.',
  },
  'hyperframes-logo-outro-cinematic': {
    title: 'HyperFrames: outro de logo cinematográfico de 4 segundos',
    summary:
      'Un outro de logo de 4 segundos en 16:9 — ensamblaje pieza a pieza del logotipo con destello, barrido de brillo sobre el bloqueo final, superposición de grano suave y CTA de una sola línea. Construido sobre los bloques `logo-outro`, `shimmer-sweep` y `grain-overlay` de HyperFrames.',
  },
  'hyperframes-product-reveal-minimal': {
    title: 'HyperFrames: revelado de producto minimalista de 5 segundos',
    summary:
      'Una composición de HyperFrames de 5 segundos para un revelado de producto de alta gama — canvas oscuro, un único acento cálido, tarjeta de título con acercamiento lento, línea de remate cinética y movimiento contenido. El agente renderiza el MP4 a partir de HTML+GSAP mediante puppeteer; no hace falta metraje de stock.',
  },
  'hyperframes-social-overlay-stack': {
    title: 'HyperFrames: pila de overlays sociales 9:16 (X · Reddit · Spotify · Instagram)',
    summary:
      'Una composición vertical de HyperFrames de 15 segundos a 1080×1920 que apila cuatro tarjetas sociales animadas sobre un loop de cámara facial — una publicación de X, una reacción de Reddit, una tarjeta de reproducción actual de Spotify y, al final, un CTA de seguir en Instagram. Cada tarjeta es un bloque de catálogo de HyperFrames; la coreografía es el valor añadido.',
  },
  'hyperframes-tiktok-karaoke-talking-head': {
    title: 'HyperFrames: talking-head de TikTok 9:16 con subtítulos karaoke',
    summary:
      'Un short vertical de HyperFrames a 1080×1920 — talking-head narrado por TTS sobre un loop de cámara facial, con subtítulos estilo karaoke sincronizados palabra a palabra, rótulo inferior animado y un overlay de seguir en TikTok al final. Refleja el arquetipo may-shorts-19 del kit para estudiantes de HyperFrames.',
  },
  'hyperframes-data-bar-chart-race': {
    title: 'HyperFrames: carrera de gráficos de barras animados (estilo NYT)',
    summary:
      'Una infografía de datos de 12 segundos en 16:9 — gráfico animado de barras + líneas con revelado escalonado de categorías, titular con serifa estilo NYT, fuente a pie de página y etiquetas de valor cinéticas. Construido directamente sobre el bloque de catálogo `data-chart` de HyperFrames.',
  },
  'hyperframes-flight-map-route': {
    title: 'HyperFrames: mapa de vuelo estilo Apple (origen → destino)',
    summary:
      'Un mapa de ruta de vuelo cinematográfico de 8 segundos en 16:9 — zoom de terreno realista, avión animado deslizándose del origen al destino a lo largo de una trayectoria curva, ciudades etiquetadas y contador cinético de distancia. Construido directamente sobre el bloque de catálogo `nyc-paris-flight` de HyperFrames, reutilizable para cualquier par de ciudades.',
  },
  'hyperframes-website-to-video-promo': {
    title: 'HyperFrames: pipeline de web a vídeo (corte de marketing de 15 segundos)',
    summary:
      'Una composición de HyperFrames de 15 segundos en 16:9 que captura una web en directo en tres tamaños de viewport y luego anima entre ellos con una división radial cromática entre escenas. Refleja el arquetipo hyperframes-sizzle del kit para estudiantes en el que la web es el recurso de origen.',
  },
  'live-action-anime-adaptation-water-vs-thunder-breathing-duel': {
    title: 'Adaptación a imagen real de anime: duelo de Respiración del Agua vs. Respiración del Trueno',
    summary:
      'Un prompt de 15 segundos muy detallado para generar una adaptación a imagen real de un duelo estilo anime, con la \'Respiración del Agua\' (dragón de agua azul) frente a la \'Respiración del Trueno\' (rayo dorado). El p',
  },
  'luxury-supercar-cinematic-narrative': {
    title: 'Narrativa cinematográfica de superdeportivo de lujo',
    summary:
      'Un prompt cinematográfico multi-toma muy detallado para Seedance 2.0 con un hombre elegante, dóbermans y un superdeportivo clásico en un escenario montañoso brumoso.',
  },
  'magical-academy-storyboard-sequence': {
    title: 'Secuencia de storyboard de academia mágica',
    summary:
      'Un prompt detallado estilo storyboard para una secuencia cinematográfica que muestra a una chica mágica en una academia, abarcando la llegada, el descubrimiento de su poder y un duelo mágico.',
  },
  'modern-rural-aesthetics-healing-short-film-video-prompt': {
    title: 'Prompt de vídeo de cortometraje sanador con estética rural moderna',
    summary:
      'Un prompt detallado de tres tomas para Seedance 2.0 con el que generar un cortometraje cinematográfico y sanador con estética rural moderna. Especifica el estilo (Cinematic Commercial, 4K/8K, Extreme Macro, nat',
  },
  'nightclub-flyer-atmospheric-animation': {
    title: 'Animación atmosférica de flyer de discoteca',
    summary:
      'Un prompt de animación sutil para Seedance 2.0 que da vida a los elementos de fondo e iluminación manteniendo el sujeto fijo',
  },
  'retro-hk-wuxia-film-aesthetic': {
    title: 'Estética de cine wuxia retro de Hong Kong',
    summary:
      'Un prompt de vídeo complejo y de varias partes que recrea la estética del cine de wuxia de Hong Kong de los años 80 y 90, con la transformación de un personaje que pasa de gato a humano mediante planos estilizados.',
  },
  'seedance-2-0-15-second-cinematic-japanese-romance-short-film': {
    title: 'Seedance 2.0: cortometraje cinematográfico de romance japonés de 15 segundos',
    summary:
      'Un prompt multiescena de 15 segundos, sumamente detallado, para Seedance 2.0, diseñado para generar un cortometraje cinematográfico y ultrarrealista de amor puro ambientado en un instituto japonés. El prompt especifica el escenario (vacío',
  },
  'seedance-2-0-80-year-old-rapper-mv': {
    title: 'Seedance 2.0: videoclip de una rapera de 80 años',
    summary:
      'Un prompt detallado de 15 segundos para Seedance 2.0 que genera un videoclip (MV) de rap callejero en horizontal 16:9 protagonizado por una mujer de 80 años. El prompt especifica el estilo (tonos fríos púrpura/azul neón, exp',
  },
  'sequence-and-movement-instruction-for-martial-arts-video': {
    title: 'Instrucciones de secuencia y movimiento para vídeo de artes marciales',
    summary:
      'Un prompt de vídeo para Seedance 2.0 que indica al modelo que anime una secuencia basada en una hoja de personaje, centrándose en movimientos y pasos concretos.',
  },
  'soul-switching-mirror-magic-sequence': {
    title: 'Secuencia mágica de intercambio de almas ante el espejo',
    summary:
      'Un prompt de vídeo narrativo que describe un evento mágico de intercambio de almas frente a un espejo, con instrucciones de cámara específicas y señales emocionales para cada segmento.',
  },
  'toaster-rocket-jumpscare': {
    title: 'Susto repentino de la tostadora cohete',
    summary:
      'Un prompt para un plano de estilo vídeo casero realista en el que un anciano se lleva un susto repentino al ver cómo una tostadora dispara el pan como un cohete.',
  },
  'traditional-dance-performance': {
    title: 'Actuación de danza tradicional',
    summary:
      'Un prompt de vídeo completo para Seedance 2.0 que genera una elegante danza tradicional basada en la coreografía y en imágenes de referencia de identidad.',
  },
  'video-seedance-three-kingdoms-guanyu-slaying-yanliang': {
    title: 'Vídeo - ARPG de los Tres Reinos - Guan Yu derrota a Yan Liang (Seedance 2.0)',
    summary:
      'Una secuencia de acción cinematográfica in-engine de ~10 s que da vida a la plantilla de imagen complementaria game-screenshot-three-kingdoms-guanyu-slaying-yanliang. Guan Yu (关羽) cabalga sobre su corcel Liebre Roja directo hacia la línea de batalla enemiga, alza la Hoja del Dragón Verde y ejecuta un único tajo limpio sobre el general rival Yan Liang. Ajustado para Seedance 2.0: disciplina de cámara cerrada, un solo golpe decisivo, física limpia de caballo y hoja, iluminación fotorrealista y absolutamente nada de sangre en pantalla (el golpe se sugiere mediante un destello dorado de qi, no con sangre). Diseñado como el complemento de vídeo directo de la plantilla de imagen correspondiente, de modo que la imagen fija y el clip puedan ofrecerse como pareja. Imagen de referencia: la plantilla de captura de Guan Yu derrotando a Yan Liang.',
  },
  'video-seedance-three-kingdoms-lyubu-yuanmen-archery': {
    title: 'Vídeo - ARPG de los Tres Reinos - Lyu Bu disparo en la puerta del campamento (Seedance 2.0)',
    summary:
      'Una secuencia de acción cinematográfica in-engine de ~10 s que da vida a la plantilla de imagen complementaria game-screenshot-three-kingdoms-lyubu-yuanmen-archery. Lyu Bu (吕布) se planta en el centro de un polvoriento campamento militar entre dos ejércitos enfrentados, tensa un arco largo lacado en rojo, mantiene la cuenta sobre la tensión y suelta una única flecha imbuida de qi con resplandor dorado a lo largo del campo, hacia una alabarda lejana clavada en el suelo. Ajustado para Seedance 2.0: disciplina de cámara cerrada, un único compás decisivo, encuadre nítido compatible con HUD, física limpia de arco y flecha, movimiento de viento, polvo y estandartes, y un etalonaje de color tipo captura de pantalla de videojuego. Diseñado como el complemento de vídeo directo de la plantilla de imagen correspondiente, de modo que la imagen fija y el clip puedan ofrecerse como pareja. Imagen de referencia: la plantilla de captura de Lyu Bu disparando en la puerta del campamento.',
  },
  'video-seedance-three-kingdoms-zhaoyun-cradle-escape': {
    title: 'Vídeo - ARPG de los Tres Reinos - Zhao Yun huye con el niño en brazos (Seedance 2.0)',
    summary:
      'Una secuencia de acción cinematográfica in-engine de ~12 s que da vida a la plantilla de imagen complementaria game-screenshot-three-kingdoms-zhaoyun-cradle-escape. Zhao Yun (赵云) cabalga sobre su caballo de guerra a través del devastado campo de batalla de Changban, acunando al heredero recién nacido A Dou en el hueco de su brazo izquierdo y empuñando su lanza con el derecho, parando un golpe entrante con una única ESQUIVA PERFECTA y saltando por encima de un carro de guerra derribado para abrirse paso. Ajustado para Seedance 2.0: disciplina de cámara cerrada, un único compás continuo, un manejo creíble de la lanza con un solo brazo, física limpia del caballo y, absolutamente, ningún daño visible al bebé. Diseñado como el complemento de vídeo directo de la plantilla de imagen correspondiente, de modo que la imagen fija y el clip puedan ofrecerse como pareja. Imagen de referencia: la plantilla de captura de Zhao Yun huyendo con el niño en brazos.',
  },
  'vintage-disney-style-pirate-crocodile-animation': {
    title: 'Animación de cocodrilo pirata al estilo Disney clásico',
    summary:
      'Un prompt narrativo multiescena para una animación clásica al estilo Disney protagonizada por un cocodrilo pirata y pájaros piratas en un barco.',
  },
  'viral-k-pop-dance-choreography': {
    title: 'Coreografía de baile K-pop viral',
    summary:
      'Un prompt detallado para Seedance 2.0 que anima a un personaje ejecutando un baile basado en un storyboard de referencia de 16 viñetas.',
  },
  'wasteland-factory-chase': {
    title: 'Persecución en la fábrica del páramo',
    summary:
      'Un prompt cinematográfico para una escena de páramo desértico a alta velocidad protagonizada por una fábrica industrial andante sobre patas y una persecución en moto de unos rebeldes.',
  },
};
