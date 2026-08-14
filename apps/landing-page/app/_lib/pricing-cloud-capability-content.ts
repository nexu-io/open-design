import type { LandingLocaleCode } from '../i18n';

export interface PricingCloudCapabilityContent {
  eyebrow: string;
  title: string;
  body: string;
  cards: readonly [
    { label: string; note?: string },
    { label: string; note?: string },
    { label: string; note?: string },
  ];
}

const EN: PricingCloudCapabilityContent = {
  eyebrow: 'OPEN DESIGN CLOUD',
  title: 'One model credit balance for agents and multimodal creation',
  body: 'From understanding a brief and planning design tasks to generating images, there is no need to configure separate provider API keys. See the estimated cost before generation and pay only for actual usage after completion. Video generation is coming soon.',
  cards: [
    { label: 'Professional design agent' },
    { label: 'Image generation' },
    { label: 'Video generation', note: 'Coming soon' },
  ],
};

const CONTENT: Partial<Record<LandingLocaleCode, PricingCloudCapabilityContent>> = {
  en: EN,
  zh: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: '一份模型额度，驱动 Agent 与多模态创作',
    body: '从理解需求、规划并执行设计任务，到生成图片，无需分别配置供应商 API Key。生成前展示预估费用，成功后按实际用量扣除。视频生成即将上线。',
    cards: [{ label: '专业设计 Agent' }, { label: '图片生成' }, { label: '视频生成', note: '即将上线' }],
  },
  ja: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'ひとつのモデルクレジットで、Agentとマルチモーダル制作を',
    body: '要件の理解、デザインタスクの計画・実行から画像生成まで、プロバイダーごとのAPIキー設定は不要です。生成前に見積料金を表示し、完了後に実際の使用量だけを差し引きます。動画生成は近日公開予定です。',
    cards: [{ label: 'プロ向けデザインAgent' }, { label: '画像生成' }, { label: '動画生成', note: '近日公開' }],
  },
  ko: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: '하나의 모델 크레딧으로 Agent와 멀티모달 제작을',
    body: '요구사항 이해와 디자인 작업 계획·실행부터 이미지 생성까지 공급자별 API 키를 따로 설정할 필요가 없습니다. 생성 전에 예상 비용을 확인하고 완료 후 실제 사용량만 차감합니다. 동영상 생성은 곧 제공됩니다.',
    cards: [{ label: '전문 디자인 Agent' }, { label: '이미지 생성' }, { label: '동영상 생성', note: '출시 예정' }],
  },
  de: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'Ein Modellguthaben für Agents und multimodale Kreation',
    body: 'Von der Anforderungsanalyse und Planung bis zur Bilderstellung sind keine separaten API-Schlüssel der Anbieter nötig. Vor der Generierung sehen Sie die Kostenschätzung, danach wird nur die tatsächliche Nutzung berechnet. Videogenerierung folgt in Kürze.',
    cards: [{ label: 'Professioneller Design-Agent' }, { label: 'Bilderstellung' }, { label: 'Videogenerierung', note: 'Demnächst' }],
  },
  fr: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'Un seul crédit modèle pour les agents et la création multimodale',
    body: 'De la compréhension du besoin et de la planification à la génération d’images, aucune clé API fournisseur distincte n’est nécessaire. Le coût estimé s’affiche avant la génération, puis seule l’utilisation réelle est débitée. La génération vidéo arrive bientôt.',
    cards: [{ label: 'Agent de design professionnel' }, { label: 'Génération d’images' }, { label: 'Génération vidéo', note: 'Bientôt' }],
  },
  ru: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'Единый баланс моделей для агентов и мультимодального творчества',
    body: 'От анализа задачи и планирования до генерации изображений — отдельные API-ключи поставщиков не нужны. До запуска показывается оценка стоимости, после завершения списывается только фактическое использование. Генерация видео скоро появится.',
    cards: [{ label: 'Профессиональный дизайн-агент' }, { label: 'Генерация изображений' }, { label: 'Генерация видео', note: 'Скоро' }],
  },
  es: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'Un solo saldo de modelos para agentes y creación multimodal',
    body: 'Desde entender el encargo y planificar las tareas hasta generar imágenes, no necesitas configurar claves API de cada proveedor. Verás el coste estimado antes de generar y solo se descontará el uso real al finalizar. La generación de vídeo llegará pronto.',
    cards: [{ label: 'Agente de diseño profesional' }, { label: 'Generación de imágenes' }, { label: 'Generación de vídeo', note: 'Próximamente' }],
  },
  'pt-br': {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'Um único saldo de modelos para agentes e criação multimodal',
    body: 'Da compreensão do briefing e planejamento das tarefas à geração de imagens, não é preciso configurar chaves de API de cada fornecedor. Veja o custo estimado antes de gerar e pague apenas pelo uso real após a conclusão. A geração de vídeo chega em breve.',
    cards: [{ label: 'Agente de design profissional' }, { label: 'Geração de imagens' }, { label: 'Geração de vídeo', note: 'Em breve' }],
  },
  it: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'Un solo credito modelli per agenti e creazione multimodale',
    body: 'Dalla comprensione del brief e pianificazione delle attività alla generazione di immagini, non servono chiavi API separate per ogni provider. Il costo stimato appare prima della generazione e viene addebitato solo l’utilizzo effettivo. La generazione video arriverà presto.',
    cards: [{ label: 'Agent di design professionale' }, { label: 'Generazione immagini' }, { label: 'Generazione video', note: 'Prossimamente' }],
  },
  tr: {
    eyebrow: 'OPEN DESIGN CLOUD',
    title: 'Agent ve çok modlu üretim için tek model bakiyesi',
    body: 'İhtiyacı anlamaktan tasarım görevlerini planlayıp yürütmeye ve görsel üretmeye kadar ayrı sağlayıcı API anahtarları gerekmez. Üretimden önce tahmini maliyeti görün; tamamlandığında yalnızca gerçek kullanım düşülsün. Video üretimi yakında geliyor.',
    cards: [{ label: 'Profesyonel tasarım Agentı' }, { label: 'Görsel üretimi' }, { label: 'Video üretimi', note: 'Yakında' }],
  },
};

export function getPricingCloudCapabilityContent(
  locale: LandingLocaleCode,
): PricingCloudCapabilityContent {
  return CONTENT[locale] ?? EN;
}
