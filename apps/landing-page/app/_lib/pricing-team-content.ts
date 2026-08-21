import type { LandingLocaleCode } from '../i18n';

export const PRICING_LOCALES = [
  'en',
  'zh',
  'ja',
  'ko',
  'de',
  'fr',
  'ru',
  'es',
  'pt-br',
  'it',
  'tr',
] as const;

export type PricingLocale = (typeof PRICING_LOCALES)[number];

export interface TeamPricingContent {
  metaTitle: string;
  metaDescription: string;
  breadcrumbLabel: string;
  audienceTabsLabel: string;
  creatorTab: string;
  teamTab: string;
  billingIntervalLabel: string;
  teamTitle: string;
  teamTagline: string;
  recommended: string;
  creditLabel: string;
  seatOnly: string;
  creditUnit: string;
  seats: string;
  decreaseSeats: string;
  increaseSeats: string;
  minSeatsNote: string;
  perSeatMonth: string;
  monthlyTotal: string;
  yearlyTotal: string;
  monthlyCheckout: string;
  yearlyCheckout: string;
  teamFeatures: string[];
  enterpriseTitle: string;
  enterpriseTagline: string;
  enterpriseCta: string;
  enterpriseFeatures: string[];
}

const EN: TeamPricingContent = {
  metaTitle: 'Pricing — OpenDesign',
  metaDescription:
    'Compare OpenDesign Creator and Team plans, including model credits, per-seat collaboration, annual savings, and Enterprise support.',
  breadcrumbLabel: 'Pricing',
  audienceTabsLabel: 'Plan audience',
  creatorTab: 'Creator',
  teamTab: 'Team',
  billingIntervalLabel: 'Billing interval',
  teamTitle: 'Team',
  teamTagline: 'Built for design teams · Per-seat collaboration',
  recommended: 'Recommended',
  creditLabel: 'Monthly model credits per seat',
  seatOnly: 'Seats only, no model credits',
  creditUnit: 'model credits',
  seats: 'Seats',
  decreaseSeats: 'Decrease seats',
  increaseSeats: 'Increase seats',
  minSeatsNote: 'Team plans require at least {count} seats.',
  perSeatMonth: '/ seat / month',
  monthlyTotal: '{amount} / month for your team',
  yearlyTotal: '{amount} billed for the first year',
  monthlyCheckout: 'Upgrade team · {amount}/month',
  yearlyCheckout: 'Upgrade team · {amount}/year',
  teamFeatures: [
    'Share and manage projects, design systems, and plugins as a team',
    'Everyone can view and comment; only the project creator can edit',
    'Role-based access: Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Custom support and compliance for larger teams',
  enterpriseCta: 'Contact us',
  enterpriseFeatures: [
    'Everything in Max',
    'Shared team design system and brand source of truth',
    'A design system that learns with your team',
    'Real-time collaboration',
    'Multi-user project and artifact editing',
    'Team project and artifact library',
    'Member and permission management',
    'Unified billing and usage dashboard',
    'SSO / SAML and priority support',
  ],
};

const ZH: TeamPricingContent = {
  metaTitle: '价格方案 — OpenDesign',
  metaDescription:
    '比较 OpenDesign 创作会员与团队版方案，了解模型额度、按席位协作、年付优惠和企业支持。',
  breadcrumbLabel: '价格方案',
  audienceTabsLabel: '方案类型',
  creatorTab: '创作会员',
  teamTab: '团队版会员',
  billingIntervalLabel: '计费周期',
  teamTitle: '团队版',
  teamTagline: '为设计团队打造 · 按席位协作',
  recommended: '推荐',
  creditLabel: '每席每月模型额度',
  seatOnly: '仅席位，不含模型额度',
  creditUnit: '模型额度',
  seats: '席位数',
  decreaseSeats: '减少席位',
  increaseSeats: '增加席位',
  minSeatsNote: '团队版最少需要 {count} 个席位。',
  perSeatMonth: '/ 席 / 月',
  monthlyTotal: '团队合计 {amount} / 月',
  yearlyTotal: '首年应付 {amount}',
  monthlyCheckout: '升级团队版 · {amount}/月',
  yearlyCheckout: '升级团队版 · {amount}/年',
  teamFeatures: [
    '项目、设计系统与插件，团队统一共享与管理',
    '成员均可查看和评论项目，仅项目创建者可以编辑',
    '按角色管理权限：Owner / Admin / Member',
  ],
  enterpriseTitle: '企业版',
  enterpriseTagline: '为大团队与企业定制 · 专属支持与合规',
  enterpriseCta: '联系我们',
  enterpriseFeatures: [
    '包含 Max 全部功能',
    '团队共享设计系统 · 统一品牌事实源',
    '设计系统自进化 · 随团队产出持续学习',
    '多人实时协同同一项目',
    '项目与产物多人共同编辑',
    '团队级项目与产物资产库',
    '成员与权限管理',
    '统一账单与用量仪表盘',
    'SSO / SAML 与优先支持',
  ],
};

const JA: TeamPricingContent = {
  metaTitle: '料金プラン — OpenDesign',
  metaDescription:
    'OpenDesign のクリエイター向けプランと Team プランを比較。モデルクレジット、席単位の共同作業、年払い割引、Enterprise サポートを確認できます。',
  breadcrumbLabel: '料金プラン',
  audienceTabsLabel: 'プラン対象',
  creatorTab: 'クリエイター',
  teamTab: 'Team',
  billingIntervalLabel: '請求サイクル',
  teamTitle: 'Team',
  teamTagline: 'デザインチーム向け · 席単位の共同作業',
  recommended: 'おすすめ',
  creditLabel: '1 席あたりの月間モデルクレジット',
  seatOnly: '席のみ・モデルクレジットなし',
  creditUnit: 'モデルクレジット',
  seats: '席数',
  decreaseSeats: '席数を減らす',
  increaseSeats: '席数を増やす',
  minSeatsNote: 'Team プランは最低 {count} 席から利用できます。',
  perSeatMonth: '/ 席 / 月',
  monthlyTotal: 'チーム合計 月額 {amount}',
  yearlyTotal: '初年度の請求額 {amount}',
  monthlyCheckout: 'Team にアップグレード · 月額 {amount}',
  yearlyCheckout: 'Team にアップグレード · 年額 {amount}',
  teamFeatures: [
    'プロジェクト、Design Systems、プラグインをチームで共有・管理',
    '全員が閲覧とコメント可能。編集はプロジェクト作成者のみ',
    'Owner / Admin / Member のロールベース権限',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: '大規模チーム向けの専用サポートとコンプライアンス',
  enterpriseCta: 'お問い合わせ',
  enterpriseFeatures: [
    'Max の全機能',
    'チーム共有 Design System とブランドの信頼できる唯一の情報源',
    'チームとともに学習する Design System',
    'リアルタイム共同作業',
    '複数ユーザーによるプロジェクトと成果物の編集',
    'チームのプロジェクト・成果物ライブラリ',
    'メンバーと権限の管理',
    '統合された請求・使用量ダッシュボード',
    'SSO / SAML と優先サポート',
  ],
};

const KO: TeamPricingContent = {
  metaTitle: '요금제 — OpenDesign',
  metaDescription:
    'OpenDesign 크리에이터 및 Team 요금제의 모델 크레딧, 좌석 기반 협업, 연간 할인과 Enterprise 지원을 비교하세요.',
  breadcrumbLabel: '요금제',
  audienceTabsLabel: '요금제 대상',
  creatorTab: '크리에이터',
  teamTab: 'Team',
  billingIntervalLabel: '결제 주기',
  teamTitle: 'Team',
  teamTagline: '디자인 팀을 위한 좌석 기반 협업',
  recommended: '추천',
  creditLabel: '좌석당 월간 모델 크레딧',
  seatOnly: '좌석만 제공, 모델 크레딧 없음',
  creditUnit: '모델 크레딧',
  seats: '좌석 수',
  decreaseSeats: '좌석 줄이기',
  increaseSeats: '좌석 늘리기',
  minSeatsNote: 'Team 요금제는 최소 {count}개 좌석이 필요합니다.',
  perSeatMonth: '/ 좌석 / 월',
  monthlyTotal: '팀 합계 월 {amount}',
  yearlyTotal: '첫해 청구 금액 {amount}',
  monthlyCheckout: 'Team으로 업그레이드 · 월 {amount}',
  yearlyCheckout: 'Team으로 업그레이드 · 연 {amount}',
  teamFeatures: [
    '프로젝트, Design Systems, 플러그인을 팀에서 공유하고 관리',
    '모든 구성원이 보고 댓글을 달 수 있으며 편집은 프로젝트 생성자만 가능',
    'Owner / Admin / Member 역할 기반 권한',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: '대규모 팀을 위한 맞춤 지원과 컴플라이언스',
  enterpriseCta: '문의하기',
  enterpriseFeatures: [
    'Max의 모든 기능',
    '팀 공유 Design System과 단일 브랜드 기준',
    '팀과 함께 학습하는 Design System',
    '실시간 협업',
    '여러 사용자의 프로젝트 및 결과물 편집',
    '팀 프로젝트 및 결과물 라이브러리',
    '구성원과 권한 관리',
    '통합 결제 및 사용량 대시보드',
    'SSO / SAML 및 우선 지원',
  ],
};

const DE: TeamPricingContent = {
  metaTitle: 'Preise — OpenDesign',
  metaDescription:
    'Vergleiche OpenDesign Creator- und Team-Pläne mit Modellguthaben, Zusammenarbeit pro Sitz, Jahresrabatten und Enterprise-Support.',
  breadcrumbLabel: 'Preise',
  audienceTabsLabel: 'Planzielgruppe',
  creatorTab: 'Creator',
  teamTab: 'Team',
  billingIntervalLabel: 'Abrechnungszeitraum',
  teamTitle: 'Team',
  teamTagline: 'Für Designteams · Zusammenarbeit pro Sitz',
  recommended: 'Empfohlen',
  creditLabel: 'Monatliches Modellguthaben pro Sitz',
  seatOnly: 'Nur Sitze, kein Modellguthaben',
  creditUnit: 'Modellguthaben',
  seats: 'Sitze',
  decreaseSeats: 'Sitz entfernen',
  increaseSeats: 'Sitz hinzufügen',
  minSeatsNote: 'Team-Pläne erfordern mindestens {count} Sitze.',
  perSeatMonth: '/ Sitz / Monat',
  monthlyTotal: 'Teamgesamtpreis {amount} / Monat',
  yearlyTotal: 'Im ersten Jahr werden {amount} berechnet',
  monthlyCheckout: 'Auf Team upgraden · {amount}/Monat',
  yearlyCheckout: 'Auf Team upgraden · {amount}/Jahr',
  teamFeatures: [
    'Projekte, Design Systems und Plugins gemeinsam teilen und verwalten',
    'Alle können ansehen und kommentieren; nur Ersteller bearbeiten ihr Projekt',
    'Rollenbasierter Zugriff: Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Individueller Support und Compliance für größere Teams',
  enterpriseCta: 'Kontakt aufnehmen',
  enterpriseFeatures: [
    'Alle Funktionen von Max',
    'Geteiltes Team-Design-System und zentrale Markenquelle',
    'Ein Design System, das mit dem Team lernt',
    'Zusammenarbeit in Echtzeit',
    'Gemeinsame Bearbeitung von Projekten und Ergebnissen',
    'Team-Bibliothek für Projekte und Ergebnisse',
    'Mitglieder- und Rechteverwaltung',
    'Zentrale Abrechnung und Nutzungsübersicht',
    'SSO / SAML und bevorzugter Support',
  ],
};

const FR: TeamPricingContent = {
  metaTitle: 'Tarifs — OpenDesign',
  metaDescription:
    'Comparez les offres Creator et Team d’OpenDesign : crédits modèles, collaboration par siège, réductions annuelles et support Enterprise.',
  breadcrumbLabel: 'Tarifs',
  audienceTabsLabel: 'Public de l’offre',
  creatorTab: 'Créateur',
  teamTab: 'Équipe',
  billingIntervalLabel: 'Période de facturation',
  teamTitle: 'Équipe',
  teamTagline: 'Conçu pour les équipes de design · Collaboration par siège',
  recommended: 'Recommandé',
  creditLabel: 'Crédits modèles mensuels par siège',
  seatOnly: 'Sièges uniquement, sans crédits modèles',
  creditUnit: 'crédits modèles',
  seats: 'Sièges',
  decreaseSeats: 'Retirer un siège',
  increaseSeats: 'Ajouter un siège',
  minSeatsNote: 'Les offres Team nécessitent au moins {count} sièges.',
  perSeatMonth: '/ siège / mois',
  monthlyTotal: 'Total équipe : {amount} / mois',
  yearlyTotal: '{amount} facturés la première année',
  monthlyCheckout: 'Passer à Team · {amount}/mois',
  yearlyCheckout: 'Passer à Team · {amount}/an',
  teamFeatures: [
    'Partager et gérer en équipe projets, Design Systems et plugins',
    'Tous peuvent consulter et commenter ; seul le créateur du projet le modifie',
    'Accès par rôle : Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Support sur mesure et conformité pour les grandes équipes',
  enterpriseCta: 'Nous contacter',
  enterpriseFeatures: [
    'Toutes les fonctions de Max',
    'Design System d’équipe partagé et source de vérité de la marque',
    'Un Design System qui apprend avec votre équipe',
    'Collaboration en temps réel',
    'Édition multiutilisateur des projets et livrables',
    'Bibliothèque d’équipe de projets et livrables',
    'Gestion des membres et des autorisations',
    'Tableau de bord unifié de facturation et d’usage',
    'SSO / SAML et support prioritaire',
  ],
};

const RU: TeamPricingContent = {
  metaTitle: 'Тарифы — OpenDesign',
  metaDescription:
    'Сравните тарифы OpenDesign для авторов и команд: кредиты моделей, совместная работа по местам, годовые скидки и поддержка Enterprise.',
  breadcrumbLabel: 'Тарифы',
  audienceTabsLabel: 'Тип тарифа',
  creatorTab: 'Для авторов',
  teamTab: 'Для команд',
  billingIntervalLabel: 'Период оплаты',
  teamTitle: 'Команда',
  teamTagline: 'Для дизайн-команд · Совместная работа по местам',
  recommended: 'Рекомендуем',
  creditLabel: 'Ежемесячные кредиты моделей на место',
  seatOnly: 'Только места, без кредитов моделей',
  creditUnit: 'кредитов моделей',
  seats: 'Места',
  decreaseSeats: 'Уменьшить число мест',
  increaseSeats: 'Увеличить число мест',
  minSeatsNote: 'Для командного тарифа нужно минимум {count} места.',
  perSeatMonth: '/ место / месяц',
  monthlyTotal: '{amount} / месяц для команды',
  yearlyTotal: '{amount} за первый год',
  monthlyCheckout: 'Перейти на Team · {amount}/месяц',
  yearlyCheckout: 'Перейти на Team · {amount}/год',
  teamFeatures: [
    'Общие проекты, Design Systems и плагины с управлением для команды',
    'Все могут смотреть и комментировать; редактирует только создатель проекта',
    'Ролевой доступ: Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Индивидуальная поддержка и соответствие требованиям',
  enterpriseCta: 'Связаться с нами',
  enterpriseFeatures: [
    'Все возможности Max',
    'Общий Design System и единый источник данных бренда',
    'Design System, который учится вместе с командой',
    'Совместная работа в реальном времени',
    'Многопользовательское редактирование проектов и результатов',
    'Командная библиотека проектов и результатов',
    'Управление участниками и правами',
    'Единая панель оплаты и использования',
    'SSO / SAML и приоритетная поддержка',
  ],
};

const ES: TeamPricingContent = {
  metaTitle: 'Precios — OpenDesign',
  metaDescription:
    'Compara los planes Creator y Team de OpenDesign: créditos de modelos, colaboración por asiento, ahorro anual y soporte Enterprise.',
  breadcrumbLabel: 'Precios',
  audienceTabsLabel: 'Público del plan',
  creatorTab: 'Creadores',
  teamTab: 'Equipos',
  billingIntervalLabel: 'Periodo de facturación',
  teamTitle: 'Equipo',
  teamTagline: 'Para equipos de diseño · Colaboración por asiento',
  recommended: 'Recomendado',
  creditLabel: 'Créditos de modelos al mes por asiento',
  seatOnly: 'Solo asientos, sin créditos de modelos',
  creditUnit: 'créditos de modelos',
  seats: 'Asientos',
  decreaseSeats: 'Quitar un asiento',
  increaseSeats: 'Añadir un asiento',
  minSeatsNote: 'Los planes Team requieren al menos {count} asientos.',
  perSeatMonth: '/ asiento / mes',
  monthlyTotal: '{amount} / mes para tu equipo',
  yearlyTotal: '{amount} facturados el primer año',
  monthlyCheckout: 'Mejorar a Team · {amount}/mes',
  yearlyCheckout: 'Mejorar a Team · {amount}/año',
  teamFeatures: [
    'Compartir y gestionar proyectos, Design Systems y plugins en equipo',
    'Todos pueden ver y comentar; solo el creador del proyecto puede editarlo',
    'Acceso por roles: Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Soporte personalizado y cumplimiento para equipos grandes',
  enterpriseCta: 'Contactar',
  enterpriseFeatures: [
    'Todo lo incluido en Max',
    'Design System compartido y fuente única de verdad de marca',
    'Un Design System que aprende con tu equipo',
    'Colaboración en tiempo real',
    'Edición multiusuario de proyectos y entregables',
    'Biblioteca de proyectos y entregables del equipo',
    'Gestión de miembros y permisos',
    'Panel unificado de facturación y uso',
    'SSO / SAML y soporte prioritario',
  ],
};

const PT_BR: TeamPricingContent = {
  metaTitle: 'Preços — OpenDesign',
  metaDescription:
    'Compare os planos Creator e Team do OpenDesign, com créditos de modelos, colaboração por assento, economia anual e suporte Enterprise.',
  breadcrumbLabel: 'Preços',
  audienceTabsLabel: 'Público do plano',
  creatorTab: 'Criadores',
  teamTab: 'Equipes',
  billingIntervalLabel: 'Período de cobrança',
  teamTitle: 'Equipe',
  teamTagline: 'Feito para equipes de design · Colaboração por assento',
  recommended: 'Recomendado',
  creditLabel: 'Créditos de modelos mensais por assento',
  seatOnly: 'Apenas assentos, sem créditos de modelos',
  creditUnit: 'créditos de modelos',
  seats: 'Assentos',
  decreaseSeats: 'Diminuir assentos',
  increaseSeats: 'Aumentar assentos',
  minSeatsNote: 'Os planos Team exigem pelo menos {count} assentos.',
  perSeatMonth: '/ assento / mês',
  monthlyTotal: '{amount} / mês para sua equipe',
  yearlyTotal: '{amount} cobrados no primeiro ano',
  monthlyCheckout: 'Fazer upgrade para Team · {amount}/mês',
  yearlyCheckout: 'Fazer upgrade para Team · {amount}/ano',
  teamFeatures: [
    'Compartilhe e gerencie projetos, Design Systems e plugins em equipe',
    'Todos podem ver e comentar; apenas o criador do projeto pode editar',
    'Acesso por função: Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Suporte personalizado e conformidade para equipes maiores',
  enterpriseCta: 'Fale conosco',
  enterpriseFeatures: [
    'Tudo do Max',
    'Design System compartilhado e fonte única da marca',
    'Um Design System que aprende com sua equipe',
    'Colaboração em tempo real',
    'Edição de projetos e entregáveis por vários usuários',
    'Biblioteca de projetos e entregáveis da equipe',
    'Gestão de membros e permissões',
    'Painel unificado de cobrança e uso',
    'SSO / SAML e suporte prioritário',
  ],
};

const IT: TeamPricingContent = {
  metaTitle: 'Prezzi — OpenDesign',
  metaDescription:
    'Confronta i piani Creator e Team di OpenDesign: crediti modello, collaborazione per postazione, risparmio annuale e supporto Enterprise.',
  breadcrumbLabel: 'Prezzi',
  audienceTabsLabel: 'Destinatari del piano',
  creatorTab: 'Creator',
  teamTab: 'Team',
  billingIntervalLabel: 'Periodo di fatturazione',
  teamTitle: 'Team',
  teamTagline: 'Per i team di design · Collaborazione per postazione',
  recommended: 'Consigliato',
  creditLabel: 'Crediti modello mensili per postazione',
  seatOnly: 'Solo postazioni, senza crediti modello',
  creditUnit: 'crediti modello',
  seats: 'Postazioni',
  decreaseSeats: 'Riduci le postazioni',
  increaseSeats: 'Aumenta le postazioni',
  minSeatsNote: 'I piani Team richiedono almeno {count} postazioni.',
  perSeatMonth: '/ postazione / mese',
  monthlyTotal: '{amount} / mese per il tuo team',
  yearlyTotal: '{amount} fatturati il primo anno',
  monthlyCheckout: 'Passa a Team · {amount}/mese',
  yearlyCheckout: 'Passa a Team · {amount}/anno',
  teamFeatures: [
    'Condividi e gestisci progetti, Design Systems e plugin come team',
    'Tutti possono vedere e commentare; modifica solo chi crea il progetto',
    'Accesso basato sui ruoli: Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Supporto personalizzato e conformità per team più grandi',
  enterpriseCta: 'Contattaci',
  enterpriseFeatures: [
    'Tutto ciò che include Max',
    'Design System condiviso e fonte unica della verità del brand',
    'Un Design System che impara con il team',
    'Collaborazione in tempo reale',
    'Modifica multiutente di progetti e risultati',
    'Libreria di progetti e risultati del team',
    'Gestione di membri e autorizzazioni',
    'Dashboard unificata di fatturazione e utilizzo',
    'SSO / SAML e supporto prioritario',
  ],
};

const TR: TeamPricingContent = {
  metaTitle: 'Fiyatlandırma — OpenDesign',
  metaDescription:
    'OpenDesign Creator ve Team planlarını; model kredileri, koltuk başına iş birliği, yıllık tasarruf ve Enterprise desteğiyle karşılaştırın.',
  breadcrumbLabel: 'Fiyatlandırma',
  audienceTabsLabel: 'Plan hedefi',
  creatorTab: 'İçerik üretici',
  teamTab: 'Ekip',
  billingIntervalLabel: 'Faturalandırma dönemi',
  teamTitle: 'Ekip',
  teamTagline: 'Tasarım ekipleri için · Koltuk başına iş birliği',
  recommended: 'Önerilen',
  creditLabel: 'Koltuk başına aylık model kredisi',
  seatOnly: 'Yalnızca koltuk, model kredisi yok',
  creditUnit: 'model kredisi',
  seats: 'Koltuklar',
  decreaseSeats: 'Koltuk sayısını azalt',
  increaseSeats: 'Koltuk sayısını artır',
  minSeatsNote: 'Team planları en az {count} koltuk gerektirir.',
  perSeatMonth: '/ koltuk / ay',
  monthlyTotal: 'Ekibiniz için aylık {amount}',
  yearlyTotal: 'İlk yıl için {amount} faturalandırılır',
  monthlyCheckout: 'Team’e yükselt · {amount}/ay',
  yearlyCheckout: 'Team’e yükselt · {amount}/yıl',
  teamFeatures: [
    'Projeleri, Design Systems öğelerini ve eklentileri ekipçe paylaşın ve yönetin',
    'Herkes görüntüleyip yorum yapabilir; yalnızca proje sahibi düzenleyebilir',
    'Role dayalı erişim: Owner / Admin / Member',
  ],
  enterpriseTitle: 'Enterprise',
  enterpriseTagline: 'Büyük ekipler için özel destek ve uyumluluk',
  enterpriseCta: 'Bize ulaşın',
  enterpriseFeatures: [
    'Max kapsamındaki her şey',
    'Paylaşılan ekip Design System’ı ve tek marka doğruluk kaynağı',
    'Ekibinizle birlikte öğrenen bir Design System',
    'Gerçek zamanlı iş birliği',
    'Çok kullanıcılı proje ve çıktı düzenleme',
    'Ekip proje ve çıktı kitaplığı',
    'Üye ve izin yönetimi',
    'Birleşik faturalandırma ve kullanım paneli',
    'SSO / SAML ve öncelikli destek',
  ],
};

/**
 * Pricing is a flagship page. This table is intentionally exported so tests
 * can fail if any active landing locale silently falls back to English.
 */
export const TEAM_PRICING_CONTENT_BY_LOCALE: Record<
  PricingLocale,
  TeamPricingContent
> = {
  en: EN,
  zh: ZH,
  ja: JA,
  ko: KO,
  de: DE,
  fr: FR,
  ru: RU,
  es: ES,
  'pt-br': PT_BR,
  it: IT,
  tr: TR,
};

export function getTeamPricingContent(
  locale: LandingLocaleCode,
): TeamPricingContent {
  return TEAM_PRICING_CONTENT_BY_LOCALE[locale as PricingLocale] ?? EN;
}
