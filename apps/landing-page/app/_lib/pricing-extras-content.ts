/*
 * Localized customer story + FAQ shown below the /pricing/ plan cards.
 *
 * Mirrors the vela subscription modal (`pricing-plans.tsx`:
 * `STORY_BY_LOCALE` + `FAQS_BY_LOCALE`). Same 10 locales as the plan cards;
 * other landing locales fall back to English. This is static copy — mirror it
 * here when vela revises the story or FAQ.
 */
import type { LandingLocaleCode } from '../i18n';

export interface StoryStat {
  value: string;
  label: string;
}
export interface StoryCopy {
  eyebrow: string;
  more: string;
  /** Renders as "{lead}{highlight}{tail}"; highlight is the brand-green span. */
  quote: { lead: string; highlight: string; tail?: string };
  name: string;
  role: string;
  chips: string[];
  stats: StoryStat[];
}

export interface FaqItem {
  q: string;
  a: string;
  cancelCta?: string;
}

const STORY_EN: StoryCopy =
  {
    eyebrow: "Customer story · Ikigai One",
    more: "Read more",
    quote: { lead: "Open Design is our ", highlight: "unfair advantage." },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20 people", "Cybersecurity & IT", "United States"],
    stats: [
      { value: "~25×", label: "cheaper per brand book" },
      { value: "~10 min", label: "a full pitch deck from one logo" },
      { value: "$1,500/mo", label: "outsourced design spend, gone" },
      { value: "~$23K/yr", label: "internal tooling it replaced" },
    ],
  };

const STORY_ZH: StoryCopy =
  {
    eyebrow: "客户故事 · Ikigai One",
    more: "查看更多",
    quote: { lead: "Open Design 是我们的", highlight: "不公平优势。" },
    name: "Anthony Reyes",
    role: "创始人，Ikigai One",
    chips: ["20 人", "网络安全 & IT", "美国"],
    stats: [
      { value: "~25×", label: "每本品牌手册更便宜" },
      { value: "~10 分钟", label: "一个 logo 出整份提案" },
      { value: "$1,500/月", label: "外包设计开销，省了" },
      { value: "~$23K/年", label: "替代掉的内部工具开销" },
    ],
  };

const STORY_ZH_TW: StoryCopy =
  {
    eyebrow: "客戶故事 · Ikigai One",
    more: "查看更多",
    quote: { lead: "Open Design 是我們的", highlight: "不公平優勢。" },
    name: "Anthony Reyes",
    role: "創辦人，Ikigai One",
    chips: ["20 人", "網路安全 & IT", "美國"],
    stats: [
      { value: "~25×", label: "每本品牌手冊更便宜" },
      { value: "~10 分鐘", label: "一個 logo 出整份提案" },
      { value: "$1,500/月", label: "外包設計開銷，省了" },
      { value: "~$23K/年", label: "替代掉的內部工具開銷" },
    ],
  };

const STORY_PT_BR: StoryCopy =
  {
    eyebrow: "História de cliente · Ikigai One",
    more: "Ler mais",
    quote: { lead: "Open Design é nossa ", highlight: "vantagem injusta." },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20 pessoas", "Cibersegurança & TI", "Estados Unidos"],
    stats: [
      { value: "~25×", label: "mais barato por brand book" },
      { value: "~10 min", label: "um pitch deck completo a partir de um logo" },
      { value: "$1,500/mês", label: "gasto com design terceirizado, eliminado" },
      { value: "~$23K/ano", label: "ferramentas internas que substituiu" },
    ],
  };

const STORY_ES: StoryCopy =
  {
    eyebrow: "Historia de cliente · Ikigai One",
    more: "Leer más",
    quote: { lead: "Open Design es nuestra ", highlight: "ventaja injusta." },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20 personas", "Ciberseguridad & TI", "Estados Unidos"],
    stats: [
      { value: "~25×", label: "más barato por brand book" },
      { value: "~10 min", label: "un pitch deck completo a partir de un logo" },
      { value: "$1,500/mes", label: "gasto en diseño externo, eliminado" },
      { value: "~$23K/año", label: "herramientas internas que reemplazó" },
    ],
  };

const STORY_RU: StoryCopy =
  {
    eyebrow: "История клиента · Ikigai One",
    more: "Подробнее",
    quote: { lead: "Open Design — наше ", highlight: "нечестное преимущество." },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20 человек", "Кибербезопасность и ИТ", "США"],
    stats: [
      { value: "~25×", label: "дешевле за бренд-бук" },
      { value: "~10 мин", label: "полный питч-дек из одного логотипа" },
      { value: "$1,500/мес", label: "расходы на аутсорс-дизайн — в прошлом" },
      { value: "~$23K/год", label: "заменённые внутренние инструменты" },
    ],
  };

const STORY_FR: StoryCopy =
  {
    eyebrow: "Témoignage client · Ikigai One",
    more: "En savoir plus",
    quote: { lead: "Open Design est notre ", highlight: "avantage déloyal." },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20 personnes", "Cybersécurité & IT", "États-Unis"],
    stats: [
      { value: "~25×", label: "moins cher par brand book" },
      { value: "~10 min", label: "un pitch deck complet à partir d'un logo" },
      { value: "$1,500/mois", label: "budget design externalisé, supprimé" },
      { value: "~$23K/an", label: "outils internes remplacés" },
    ],
  };

const STORY_KO: StoryCopy =
  {
    eyebrow: "고객 사례 · Ikigai One",
    more: "자세히 보기",
    quote: { lead: "Open Design은 우리의 ", highlight: "불공정한 우위입니다." },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20명", "사이버보안 & IT", "미국"],
    stats: [
      { value: "~25×", label: "브랜드북 1권당 비용 절감" },
      { value: "~10분", label: "로고 하나로 완성하는 피치덱" },
      { value: "$1,500/월", label: "사라진 외주 디자인 비용" },
      { value: "~$23K/년", label: "대체한 내부 도구 비용" },
    ],
  };

const STORY_DE: StoryCopy =
  {
    eyebrow: "Kundenstory · Ikigai One",
    more: "Mehr lesen",
    quote: { lead: "Open Design ist unser ", highlight: "unfairer Vorteil." },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20 Personen", "Cybersecurity & IT", "USA"],
    stats: [
      { value: "~25×", label: "günstiger pro Brand Book" },
      { value: "~10 Min.", label: "ein komplettes Pitch-Deck aus einem Logo" },
      { value: "$1,500/Mon.", label: "ausgelagerte Designkosten – weg" },
      { value: "~$23K/Jahr", label: "ersetzte interne Tools" },
    ],
  };

const STORY_JA: StoryCopy =
  {
    eyebrow: "顧客事例 · Ikigai One",
    more: "詳しく見る",
    quote: { lead: "Open Design は私たちの", highlight: "不公平な優位性。" },
    name: "Anthony Reyes",
    role: "Founder, Ikigai One",
    chips: ["20人", "サイバーセキュリティ & IT", "アメリカ"],
    stats: [
      { value: "~25×", label: "ブランドブック1冊あたりのコスト削減" },
      { value: "~10分", label: "ロゴ1つから完成するピッチデック" },
      { value: "$1,500/月", label: "なくなった外注デザイン費" },
      { value: "~$23K/年", label: "置き換えた社内ツール費" },
    ],
  };

const FAQ_EN: FaqItem[] =
  [
    { q: "What are Open Design model credits? How are they used?", a: "Open Design model credits are the USD-denominated balance used for Open Design hosted models. Each hosted AI model call deducts from your Open Design balance by usage. BYOK calls to provider models do not consume credits. Each subscription grants the matching credit amount every billing cycle." },
    { q: "How do the plans differ? Can Free use hosted models?", a: "Free does not include Open Design model credits and supports local CLI plus BYOK only. Plus, Pro, and Max grant the model-credit amounts shown on their plan cards for different usage levels. Every plan, including Free, supports BYOK." },
    { q: "Does the price change after the first-month offer?", a: "Monthly plans can start with a first-month offer. The plan cards show the current first-month and renewal prices. The first-month offer applies only to new monthly subscriptions and once per account. Yearly billing does not use the first-month offer because it already has a lower monthly equivalent." },
    { q: "What is the difference between yearly and monthly billing?", a: "Yearly billing charges once for the full year at the lower monthly equivalent shown on each plan card. Monthly billing renews each month and can use the first-month offer. Yearly plans renew annually." },
    { q: "What happens when monthly credits run out? Do they roll over?", a: "Open Design model credits are granted by billing cycle. They reset each cycle and unused credits do not roll over. When credits run out, you can upgrade, enable auto top-up, or use BYOK provider keys to keep calling models without spending Open Design credits." },
    { q: "How does auto top-up work?", a: "After authorization, you set a monthly top-up cap. When the Open Design balance is low, the system adds credits and charges your saved payment method. Total auto top-ups in a calendar month will not exceed your cap. You can update the cap or turn it off in Wallet at any time." },
    { q: "What is BYOK? Do all plans support it?", a: "BYOK means Bring Your Own Key: add your own Anthropic, OpenAI, Google, or other provider API key and call provider models directly. BYOK does not consume Open Design balance and is available on every plan, including Free." },
    { q: "How are credits and charges handled after a plan change?", a: "This release supports upgrades only: moving to a higher tier or switching monthly to yearly. Upgrades take effect immediately, grant the new benefits, and only charge the prorated difference (your current plan's unused time is credited — you don't pay the full new-plan price). Self-service downgrades (lower tier, or yearly to monthly) are not available and that entry is disabled; to downgrade, please contact support." },
    { q: "Can I cancel a subscription anytime?", a: "Yes. Canceling stops renewal but does not end current benefits immediately. The paid period remains usable until it ends, then the account returns to Free. Yearly cancellations keep benefits through the current yearly period and do not trigger a refund.", cancelCta: "Cancel subscription" },
    { q: "How do refunds work?", a: "Canceling a subscription does not refund it or reclaim current benefits for a prorated refund. Your paid period remains usable until it ends. If you see a duplicate charge or payment issue, contact support through the help center so we can review the bill." },
  ];

const FAQ_ZH: FaqItem[] =
  [
    { q: "Open Design 模型额度是什么？怎么消耗？", a: "Open Design 模型额度是用于调用 Open Design 托管模型的余额，以美元计。每次调用 Open Design 托管的 AI 模型时，按用量从你的 Open Design 余额中扣减；使用 BYOK（自带 API Key）调用原厂模型不消耗额度。订阅后每个计费周期发放对应金额的额度。" },
    { q: "各套餐有什么区别？Free 能用托管模型吗？", a: "Free 不含 Open Design 模型额度，仅支持本地 CLI 与 BYOK 自带密钥；Plus / Pro / Max 发放的 Open Design 模型额度以套餐卡片当前显示为准，适用从个人轻度到团队高频的不同强度。所有套餐（含 Free）都支持 BYOK。" },
    { q: "首月特惠之后价格会变吗？", a: "月付可享首月特惠，套餐卡片会显示当前首月价和续费价。首月特惠仅适用于月付的新订阅、每个账户限一次；年付不参与首月特惠，但本身已是更低的折后月单价。" },
    { q: "年付和月付有什么区别？", a: "年付一次性支付全年，折合月单价以套餐卡片当前显示为准。月付按月扣费、可享首月特惠。年付一次性扣除全年费用，到期后按年续费。" },
    { q: "月度额度用完了怎么办？会累积到下月吗？", a: "套餐的 Open Design 模型额度按计费周期发放，每个周期重置、未用完不结转到下个周期。额度用完后可以：升级到更高套餐、开启自动充值在余额不足时自动补充，或改用 BYOK 自带密钥继续调用（不消耗额度）。" },
    { q: "自动充值是怎么工作的？", a: "授权后由你设定每月充值上限（这是唯一需要你设置的值）。当账户 Open Design 余额不足时，系统会自动补充额度并从你绑定的支付方式扣款，单个自然月内的累计自动充值金额不会超过你设定的上限；触发时机与每次充值金额由系统自动管理。可随时在钱包中调整上限或关闭，关闭后不再自动扣款。" },
    { q: "BYOK 是什么？所有套餐都支持吗？", a: "BYOK（Bring Your Own Key）是指填入你自己的 Anthropic、OpenAI、Google 等厂商 API Key，直接调用原厂模型，不消耗 Open Design 余额、也不受套餐模型列表限制。所有套餐（包括 Free）均支持 BYOK。" },
    { q: "升级或降级套餐后，额度和扣费怎么处理？", a: "本期仅支持「升级」：提升套餐档位、或由月付转年付，升级立即生效并下发新套餐权益、仅需补差价（按当前套餐未用时长抵扣后的差额计费，无需支付新套餐全价）。降级（降低档位或由年付转月付）暂不支持自助操作，相关入口会置灰；如需降级，请联系人工客服处理。" },
    { q: "可以随时取消订阅吗？", a: "可以。取消订阅表示取消续订，不会立即终止当前权益。当前已付费周期内仍可正常使用，到期后不再续费、不再扣款，账户自动回到 Free。年付取消后权益保留到当前年度周期结束，不支持退款或立即回收权益。", cancelCta: "取消订阅" },
    { q: "怎么申请退款？", a: "订阅取消不支持退款，也不支持通过立即回收当前权益来折算退款。取消后当前已付费周期继续可用，到期后停止续费；如果遇到重复扣款或支付异常，请通过帮助中心联系客服核查账单。" },
  ];

const FAQ_ZH_TW: FaqItem[] =
  [
    { q: "Open Design 模型額度是什麼？如何消耗？", a: "Open Design 模型額度是用於調用 Open Design 托管模型的美元餘額。每次調用托管 AI 模型時，會按用量從餘額扣減；使用 BYOK 調用原廠模型不消耗額度。訂閱後每個計費週期會發放對應額度。" },
    { q: "各套餐有什麼差異？Free 能使用托管模型嗎？", a: "Free 不含 Open Design 模型額度，僅支援本地 CLI 與 BYOK。Plus、Pro、Max 發放的 Open Design 模型額度以方案卡片目前顯示為準，適用不同使用強度。所有套餐（含 Free）都支援 BYOK。" },
    { q: "首月優惠後價格會改變嗎？", a: "月付可享首月優惠，方案卡片會顯示目前首月價與續費價。首月優惠僅適用於新的月付訂閱，且每個帳戶限一次；年付不參與首月優惠，因為年付本身已是較低月均價。" },
    { q: "年付和月付有什麼不同？", a: "年付一次支付全年，折合月費以方案卡片目前顯示為準。月付逐月續費並可使用首月優惠；年付按年續費。" },
    { q: "月度額度用完怎麼辦？會結轉嗎？", a: "Open Design 模型額度按計費週期發放，每個週期重置，未用完不會結轉。額度用完後可以升級、開啟自動充值，或使用 BYOK 原廠密鑰繼續調用模型。" },
    { q: "自動充值如何運作？", a: "授權後你可以設定每月充值上限。當 Open Design 餘額偏低時，系統會自動補充額度並向已綁定的支付方式扣款；單個自然月內自動充值總額不會超過上限。你可以隨時在錢包中調整或關閉。" },
    { q: "BYOK 是什麼？所有套餐都支援嗎？", a: "BYOK 指 Bring Your Own Key：填入自己的 Anthropic、OpenAI、Google 等廠商 API Key，直接調用原廠模型。BYOK 不消耗 Open Design 餘額，所有套餐（含 Free）都支援。" },
    { q: "變更套餐後，額度和扣費如何處理？", a: "本期僅支援升級：提升套餐檔位，或從月付改為年付。升級會立即生效、發放新權益，且僅需補差價（按當前套餐未用時長抵扣後的差額計費，無需支付新套餐全價）。降級（降低檔位或由年付改月付）暫不支援自助操作，相關入口會置灰；如需降級，請聯絡人工客服處理。" },
    { q: "可以隨時取消訂閱嗎？", a: "可以。取消訂閱代表停止續費，不會立即終止當前權益。已付費週期仍可使用，到期後帳戶回到 Free。年付取消後權益保留到當前年付週期結束，不會自動退款。", cancelCta: "取消訂閱" },
    { q: "退款如何處理？", a: "取消訂閱不會自動退款，也不會透過立即回收當前權益折算退款。已付費週期可繼續使用；若遇到重複扣款或支付異常，請透過幫助中心聯絡客服核查帳單。" },
  ];

const FAQ_PT_BR: FaqItem[] =
  [
    { q: "O que são créditos de modelo Open Design? Como são usados?", a: "Créditos de modelo Open Design são o saldo em USD usado para modelos hospedados pela Open Design. Cada chamada de modelo hospedado desconta do saldo conforme o uso. Chamadas BYOK para modelos de provedores não consomem créditos. Cada assinatura concede créditos no ciclo de cobrança." },
    { q: "Como os planos diferem? O Free usa modelos hospedados?", a: "O Free não inclui créditos de modelo Open Design e oferece apenas CLI local com BYOK. Plus, Pro e Max concedem os créditos exibidos nos cartões dos planos para diferentes níveis de uso. Todos os planos, incluindo Free, aceitam BYOK." },
    { q: "O preço muda após a oferta do primeiro mês?", a: "Planos mensais podem começar com oferta no primeiro mês. Os cartões dos planos mostram os preços atuais do primeiro mês e da renovação. A oferta vale apenas para novas assinaturas mensais e uma vez por conta. O anual já tem preço mensal equivalente menor." },
    { q: "Qual a diferença entre anual e mensal?", a: "O anual cobra o ano inteiro de uma vez com o equivalente mensal menor mostrado no cartão de cada plano. O mensal renova todo mês e pode usar a oferta do primeiro mês. Planos anuais renovam anualmente." },
    { q: "O que acontece quando os créditos acabam? Eles acumulam?", a: "Créditos são concedidos por ciclo de cobrança, reiniciam a cada ciclo e não acumulam. Ao acabar, você pode fazer upgrade, ativar recarga automática ou usar chaves BYOK para continuar chamando modelos sem gastar créditos Open Design." },
    { q: "Como funciona a recarga automática?", a: "Após autorizar, você define um limite mensal. Quando o saldo Open Design fica baixo, o sistema adiciona créditos e cobra o método de pagamento salvo. O total mensal não passa do limite. Você pode ajustar ou desligar no Wallet." },
    { q: "O que é BYOK? Todos os planos suportam?", a: "BYOK significa Bring Your Own Key: use sua chave Anthropic, OpenAI, Google ou de outro provedor para chamar modelos diretamente. BYOK não consome saldo Open Design e está disponível em todos os planos." },
    { q: "Como créditos e cobranças funcionam após mudar de plano?", a: "Esta versão aceita apenas upgrades: subir de nível ou trocar mensal por anual. Upgrades entram em vigor imediatamente, liberam os novos benefícios e cobram apenas a diferença proporcional (o tempo não usado do plano atual é creditado — você não paga o preço cheio do novo plano). O downgrade (nível inferior ou anual para mensal) não está disponível como autoatendimento e fica desativado; para fazer downgrade, fale com o suporte." },
    { q: "Posso cancelar a assinatura a qualquer momento?", a: "Sim. Cancelar interrompe a renovação, mas não encerra os benefícios atuais imediatamente. O período pago continua utilizável até terminar; depois a conta volta ao Free. Cancelamentos anuais mantêm benefícios até o fim do período anual.", cancelCta: "Cancelar assinatura" },
    { q: "Como funcionam reembolsos?", a: "Cancelar uma assinatura não gera reembolso automático nem recolhe benefícios atuais para reembolso proporcional. O período pago continua utilizável. Para cobrança duplicada ou erro de pagamento, fale com o suporte pela central de ajuda." },
  ];

const FAQ_ES: FaqItem[] =
  [
    { q: "¿Qué son los créditos de modelo Open Design? ¿Cómo se usan?", a: "Son el saldo en USD usado para modelos alojados por Open Design. Cada llamada a un modelo alojado descuenta del saldo según el uso. Las llamadas BYOK a modelos de proveedor no consumen créditos. Cada suscripción concede créditos en cada ciclo de facturación." },
    { q: "¿En qué se diferencian los planes? ¿Free usa modelos alojados?", a: "Free no incluye créditos de modelo Open Design y solo admite CLI local con BYOK. Plus, Pro y Max conceden los créditos mostrados en sus tarjetas para distintos niveles de uso. Todos los planes, incluido Free, admiten BYOK." },
    { q: "¿El precio cambia después de la oferta del primer mes?", a: "Los planes mensuales pueden empezar con una oferta del primer mes. Las tarjetas muestran los precios actuales del primer mes y de renovación. La oferta aplica solo a nuevas suscripciones mensuales y una vez por cuenta. El anual ya tiene un equivalente mensual menor." },
    { q: "¿Cuál es la diferencia entre anual y mensual?", a: "El anual cobra todo el año de una vez con el equivalente mensual menor mostrado en cada tarjeta de plan. El mensual renueva cada mes y puede usar la oferta del primer mes. Los planes anuales renuevan anualmente." },
    { q: "¿Qué pasa si se agotan los créditos? ¿Se acumulan?", a: "Los créditos se conceden por ciclo de facturación, se reinician en cada ciclo y no se acumulan. Al agotarse, puedes subir de plan, activar recarga automática o usar claves BYOK para seguir llamando modelos sin gastar créditos Open Design." },
    { q: "¿Cómo funciona la recarga automática?", a: "Tras autorizarla, defines un límite mensual. Cuando el saldo Open Design baja, el sistema añade créditos y cobra el método de pago guardado. El total mensual no supera tu límite. Puedes cambiarlo o desactivarlo en Wallet." },
    { q: "¿Qué es BYOK? ¿Todos los planes lo admiten?", a: "BYOK significa Bring Your Own Key: usa tu propia clave de Anthropic, OpenAI, Google u otro proveedor para llamar modelos directamente. BYOK no consume saldo Open Design y está disponible en todos los planes." },
    { q: "¿Cómo se gestionan créditos y cargos al cambiar de plan?", a: "Esta versión solo admite upgrades: subir de nivel o pasar de mensual a anual. Los upgrades se aplican inmediatamente, conceden los nuevos beneficios y cobran solo la diferencia prorrateada (se acredita el tiempo no usado de tu plan actual — no pagas el precio completo del nuevo plan). El downgrade (nivel inferior o anual a mensual) no está disponible como autoservicio y queda desactivado; para bajar de plan, contacta con soporte." },
    { q: "¿Puedo cancelar la suscripción cuando quiera?", a: "Sí. Cancelar detiene la renovación, pero no corta los beneficios actuales de inmediato. El período pagado sigue disponible hasta terminar; después la cuenta vuelve a Free. Las cancelaciones anuales mantienen beneficios hasta el final del período anual.", cancelCta: "Cancelar suscripción" },
    { q: "¿Cómo funcionan los reembolsos?", a: "Cancelar una suscripción no genera reembolso automático ni retira beneficios actuales para un reembolso prorrateado. El período pagado sigue disponible. Si ves un cargo duplicado o error de pago, contacta soporte desde el centro de ayuda." },
  ];

const FAQ_RU: FaqItem[] =
  [
    { q: "Что такое кредиты моделей Open Design и как они расходуются?", a: "Кредиты моделей Open Design — это баланс в USD для моделей, размещенных Open Design. Каждый вызов размещенной модели списывает баланс по фактическому использованию. Вызовы BYOK к моделям провайдеров кредиты не тратят. Каждая подписка выдает кредиты в каждом расчетном цикле." },
    { q: "Чем отличаются планы? Может ли Free использовать размещенные модели?", a: "Free не включает кредиты моделей Open Design и поддерживает только локальный CLI с BYOK. Plus, Pro и Max дают кредиты, показанные на карточках планов, для разных уровней использования. Все планы, включая Free, поддерживают BYOK." },
    { q: "Меняется ли цена после предложения первого месяца?", a: "Месячные планы могут начинаться с предложения первого месяца. Карточки планов показывают текущие цены первого месяца и продления. Предложение действует только для новых месячных подписок и один раз на аккаунт. Годовой план уже имеет более низкий месячный эквивалент." },
    { q: "В чем разница между годовой и месячной оплатой?", a: "Годовая оплата списывается за весь год сразу с более низким месячным эквивалентом, показанным на карточке каждого плана. Месячная оплата продлевается каждый месяц и может использовать предложение первого месяца. Годовые планы продлеваются раз в год." },
    { q: "Что будет, когда месячные кредиты закончатся? Они переносятся?", a: "Кредиты выдаются по расчетным циклам, сбрасываются каждый цикл и не переносятся. Когда они заканчиваются, можно повысить план, включить автопополнение или использовать ключи BYOK для вызова моделей без расхода кредитов Open Design." },
    { q: "Как работает автопополнение?", a: "После авторизации вы задаете месячный лимит. Когда баланс Open Design становится низким, система добавляет кредиты и списывает оплату с сохраненного метода. Сумма автопополнений за месяц не превысит лимит. Лимит можно изменить или отключить в Wallet." },
    { q: "Что такое BYOK? Все планы это поддерживают?", a: "BYOK означает Bring Your Own Key: добавьте собственный ключ Anthropic, OpenAI, Google или другого провайдера и вызывайте модели напрямую. BYOK не расходует баланс Open Design и доступен во всех планах." },
    { q: "Как обрабатываются кредиты и платежи после смены плана?", a: "В этой версии доступны только повышения: переход на более высокий уровень или с месячной оплаты на годовую. Повышения применяются сразу, выдают новые преимущества и списывают только пропорциональную разницу (неиспользованное время текущего плана засчитывается — полная цена нового плана не взимается). Понижение (более низкий уровень или с годовой оплаты на месячную) недоступно в самообслуживании, и эта кнопка отключена; чтобы понизить план, обратитесь в поддержку." },
    { q: "Можно ли отменить подписку в любое время?", a: "Да. Отмена останавливает продление, но не прекращает текущие преимущества сразу. Оплаченный период остается доступным до конца, затем аккаунт возвращается на Free. При годовой отмене преимущества сохраняются до конца текущего годового периода.", cancelCta: "Отменить подписку" },
    { q: "Как работают возвраты?", a: "Отмена подписки не создает автоматический возврат и не изымает текущие преимущества для пропорционального возврата. Оплаченный период остается доступным. При двойном списании или ошибке оплаты обратитесь в поддержку через центр помощи." },
  ];

const FAQ_FR: FaqItem[] =
  [
    { q: "Que sont les crédits de modèles Open Design ? Comment sont-ils utilisés ?", a: "Ce sont des crédits en USD utilisés pour les modèles hébergés par Open Design. Chaque appel à un modèle hébergé débite le solde selon l'usage. Les appels BYOK vers des modèles fournisseurs ne consomment pas de crédits. Chaque abonnement accorde les crédits correspondants à chaque cycle." },
    { q: "Quelle est la différence entre les plans ? Free utilise-t-il les modèles hébergés ?", a: "Free n'inclut pas de crédits Open Design et prend seulement en charge le CLI local avec BYOK. Plus, Pro et Max accordent les crédits affichés sur leurs cartes pour différents niveaux d'usage. Tous les plans, y compris Free, prennent en charge BYOK." },
    { q: "Le prix change-t-il après l'offre du premier mois ?", a: "Les plans mensuels peuvent commencer avec une offre premier mois. Les cartes affichent les prix actuels du premier mois et du renouvellement. L'offre ne s'applique qu'aux nouveaux abonnements mensuels, une fois par compte. Le plan annuel a déjà un équivalent mensuel réduit." },
    { q: "Quelle différence entre facturation annuelle et mensuelle ?", a: "L'annuel facture toute l'année en une fois avec l'équivalent mensuel plus bas affiché sur chaque carte de plan. Le mensuel renouvelle chaque mois et peut utiliser l'offre du premier mois. Les plans annuels renouvellent chaque année." },
    { q: "Que se passe-t-il quand les crédits mensuels sont épuisés ? Sont-ils reportés ?", a: "Les crédits sont accordés par cycle de facturation, réinitialisés à chaque cycle et non reportés. Une fois épuisés, vous pouvez passer à un plan supérieur, activer la recharge automatique ou utiliser BYOK pour continuer sans consommer de crédits Open Design." },
    { q: "Comment fonctionne la recharge automatique ?", a: "Après autorisation, vous définissez un plafond mensuel. Quand le solde Open Design est bas, le système ajoute des crédits et facture le moyen de paiement enregistré. Le total mensuel ne dépasse pas le plafond. Vous pouvez l'ajuster ou la désactiver dans Wallet." },
    { q: "Qu'est-ce que BYOK ? Tous les plans le prennent-ils en charge ?", a: "BYOK signifie Bring Your Own Key : ajoutez votre propre clé Anthropic, OpenAI, Google ou autre fournisseur pour appeler les modèles directement. BYOK ne consomme pas le solde Open Design et est disponible sur tous les plans." },
    { q: "Comment les crédits et frais sont-ils gérés après un changement de plan ?", a: "Cette version prend seulement en charge les upgrades : niveau supérieur ou passage de mensuel à annuel. Ils prennent effet immédiatement, accordent les nouveaux avantages et facturent seulement la différence au prorata (le temps non utilisé de votre plan actuel est crédité — vous ne payez pas le prix complet du nouveau plan). Le downgrade (niveau inférieur ou annuel vers mensuel) n'est pas disponible en libre-service et ce bouton est désactivé ; pour rétrograder, contactez le support." },
    { q: "Puis-je annuler l'abonnement à tout moment ?", a: "Oui. L'annulation arrête le renouvellement, sans couper immédiatement les avantages actuels. La période payée reste utilisable jusqu'à sa fin, puis le compte revient à Free. Les annulations annuelles conservent les avantages jusqu'à la fin de la période annuelle.", cancelCta: "Annuler l'abonnement" },
    { q: "Comment fonctionnent les remboursements ?", a: "Annuler un abonnement ne crée pas de remboursement automatique et ne retire pas les avantages actuels pour un prorata. La période payée reste utilisable. En cas de double débit ou d'erreur de paiement, contactez le support via le centre d'aide." },
  ];

const FAQ_KO: FaqItem[] =
  [
    { q: "Open Design 모델 크레딧은 무엇이며 어떻게 사용되나요?", a: "Open Design 모델 크레딧은 Open Design 호스팅 모델에 사용하는 USD 기준 잔액입니다. 호스팅 AI 모델을 호출할 때 사용량에 따라 잔액에서 차감됩니다. BYOK로 제공자 모델을 호출하는 경우 크레딧을 사용하지 않습니다. 각 구독은 결제 주기마다 해당 크레딧을 지급합니다." },
    { q: "각 플랜은 어떻게 다른가요? Free도 호스팅 모델을 쓸 수 있나요?", a: "Free에는 Open Design 모델 크레딧이 포함되지 않으며 로컬 CLI와 BYOK만 지원합니다. Plus, Pro, Max는 플랜 카드에 표시된 크레딧을 제공해 사용량 수준에 맞게 선택할 수 있습니다. Free를 포함한 모든 플랜은 BYOK를 지원합니다." },
    { q: "첫 달 할인 이후 가격이 바뀌나요?", a: "월간 플랜은 첫 달 할인으로 시작할 수 있습니다. 플랜 카드에는 현재 첫 달 가격과 갱신 가격이 표시됩니다. 첫 달 할인은 신규 월간 구독에 계정당 한 번만 적용됩니다. 연간 결제는 이미 월 환산 가격이 더 낮습니다." },
    { q: "연간 결제와 월간 결제의 차이는 무엇인가요?", a: "연간 결제는 1년치를 한 번에 결제하며 각 플랜 카드에 표시된 더 낮은 월 환산 가격을 사용합니다. 월간 결제는 매달 갱신되며 첫 달 할인을 사용할 수 있습니다. 연간 플랜은 매년 갱신됩니다." },
    { q: "월간 크레딧을 모두 쓰면 어떻게 되나요? 이월되나요?", a: "크레딧은 결제 주기마다 지급되고 주기마다 초기화되며 이월되지 않습니다. 크레딧이 부족하면 상위 플랜으로 업그레이드하거나 자동 충전을 켜거나 BYOK 키로 Open Design 크레딧 없이 모델을 계속 호출할 수 있습니다." },
    { q: "자동 충전은 어떻게 작동하나요?", a: "승인 후 월간 충전 한도를 설정합니다. Open Design 잔액이 낮아지면 시스템이 크레딧을 추가하고 저장된 결제 수단으로 청구합니다. 한 달 자동 충전 총액은 한도를 넘지 않습니다. Wallet에서 한도를 조정하거나 끌 수 있습니다." },
    { q: "BYOK란 무엇인가요? 모든 플랜에서 지원하나요?", a: "BYOK는 Bring Your Own Key의 약자로, Anthropic, OpenAI, Google 등 제공자의 API 키를 직접 추가해 모델을 호출하는 방식입니다. BYOK는 Open Design 잔액을 사용하지 않으며 모든 플랜에서 지원됩니다." },
    { q: "플랜 변경 후 크레딧과 요금은 어떻게 처리되나요?", a: "이번 릴리스에서는 업그레이드만 지원합니다. 더 높은 티어로 이동하거나 월간에서 연간 결제로 전환할 수 있습니다. 업그레이드는 즉시 적용되고 새 혜택을 지급하며 차액만 청구합니다(현재 플랜의 미사용 기간이 차감되어 새 플랜 전액을 내지 않습니다). 다운그레이드(낮은 티어 또는 연간에서 월간 전환)는 셀프서비스로 지원되지 않으며 해당 버튼은 비활성화됩니다. 다운그레이드가 필요하면 고객지원에 문의하세요." },
    { q: "구독을 언제든 취소할 수 있나요?", a: "네. 취소하면 갱신이 중단되지만 현재 혜택이 즉시 종료되지는 않습니다. 결제된 기간은 끝날 때까지 사용할 수 있고 이후 계정은 Free로 돌아갑니다. 연간 구독 취소 시 혜택은 현재 연간 기간 종료까지 유지됩니다.", cancelCta: "구독 취소" },
    { q: "환불은 어떻게 처리되나요?", a: "구독 취소는 자동 환불을 만들지 않으며 현재 혜택을 회수해 일할 환불하지 않습니다. 결제된 기간은 계속 사용할 수 있습니다. 중복 청구나 결제 오류가 있으면 도움말 센터에서 지원팀에 문의하세요." },
  ];

const FAQ_DE: FaqItem[] =
  [
    { q: "Was sind Open Design Modell-Credits und wie werden sie genutzt?", a: "Open Design Modell-Credits sind ein USD-Guthaben für von Open Design gehostete Modelle. Jeder Aufruf eines gehosteten Modells belastet das Guthaben nach Nutzung. BYOK-Aufrufe zu Anbietermodellen verbrauchen keine Credits. Jede Subscription gewährt Credits pro Abrechnungszyklus." },
    { q: "Wie unterscheiden sich die Pläne? Kann Free gehostete Modelle nutzen?", a: "Free enthält keine Open Design Modell-Credits und unterstützt nur lokale CLI plus BYOK. Plus, Pro und Max gewähren die auf ihren Plankarten angezeigten Credits für unterschiedliche Nutzungslevel. Alle Pläne, einschließlich Free, unterstützen BYOK." },
    { q: "Ändert sich der Preis nach dem Angebot im ersten Monat?", a: "Monatspläne können mit einem Angebot im ersten Monat starten. Die Plankarten zeigen die aktuellen Preise für den ersten Monat und die Verlängerung. Das Angebot gilt nur für neue monatliche Subscriptions und einmal pro Konto. Jahrespläne haben bereits einen niedrigeren monatlichen Gegenwert." },
    { q: "Was ist der Unterschied zwischen jährlicher und monatlicher Abrechnung?", a: "Jährliche Abrechnung bezahlt das ganze Jahr auf einmal mit dem niedrigeren Monatsgegenwert, der auf jeder Plankarte angezeigt wird. Monatlich verlängert sich jeden Monat und kann das Erstmonatsangebot nutzen. Jahrespläne verlängern sich jährlich." },
    { q: "Was passiert, wenn monatliche Credits aufgebraucht sind? Werden sie übertragen?", a: "Credits werden pro Abrechnungszyklus gewährt, in jedem Zyklus zurückgesetzt und nicht übertragen. Wenn sie aufgebraucht sind, kannst du upgraden, Auto-Top-up aktivieren oder BYOK-Schlüssel nutzen, um Modelle ohne Open Design Credits aufzurufen." },
    { q: "Wie funktioniert Auto-Top-up?", a: "Nach der Autorisierung legst du ein Monatslimit fest. Wenn das Open Design Guthaben niedrig ist, fügt das System Credits hinzu und belastet die gespeicherte Zahlungsmethode. Die Summe im Kalendermonat überschreitet das Limit nicht. Du kannst es in Wallet ändern oder deaktivieren." },
    { q: "Was ist BYOK? Unterstützen alle Pläne das?", a: "BYOK bedeutet Bring Your Own Key: Du fügst deinen eigenen API-Schlüssel von Anthropic, OpenAI, Google oder anderen Anbietern hinzu und rufst Modelle direkt auf. BYOK verbraucht kein Open Design Guthaben und ist in allen Plänen verfügbar." },
    { q: "Wie werden Credits und Gebühren nach einem Planwechsel behandelt?", a: "Diese Version unterstützt nur Upgrades: Wechsel auf eine höhere Stufe oder von monatlich zu jährlich. Upgrades gelten sofort, gewähren die neuen Vorteile und berechnen nur die anteilige Differenz (die ungenutzte Zeit deines aktuellen Plans wird angerechnet – du zahlst nicht den vollen Preis des neuen Plans). Ein Downgrade (niedrigere Stufe oder jährlich zu monatlich) ist nicht im Self-Service verfügbar und diese Schaltfläche ist deaktiviert; für ein Downgrade wende dich an den Support." },
    { q: "Kann ich jederzeit kündigen?", a: "Ja. Kündigen stoppt die Verlängerung, beendet aktuelle Vorteile aber nicht sofort. Der bezahlte Zeitraum bleibt bis zum Ende nutzbar, danach kehrt das Konto zu Free zurück. Bei Jahresplänen bleiben Vorteile bis zum Ende der aktuellen Jahresperiode erhalten.", cancelCta: "Abo kündigen" },
    { q: "Wie funktionieren Rückerstattungen?", a: "Eine Kündigung erstellt keine automatische Rückerstattung und zieht aktuelle Vorteile nicht für eine anteilige Rückerstattung ein. Der bezahlte Zeitraum bleibt nutzbar. Bei doppelter Abbuchung oder Zahlungsfehler kontaktiere den Support über das Help Center." },
  ];

const FAQ_JA: FaqItem[] =
  [
    { q: "Open Design モデルクレジットとは何ですか？どのように消費されますか？", a: "Open Design モデルクレジットは、Open Design がホストするモデルに使う USD 建ての残高です。ホストモデルを呼び出すたびに使用量に応じて差し引かれます。BYOK でプロバイダーモデルを呼び出す場合、クレジットは消費されません。各サブスクリプションは請求サイクルごとに対応するクレジットを付与します。" },
    { q: "各プランの違いは？Free でホストモデルは使えますか？", a: "Free には Open Design モデルクレジットが含まれず、ローカル CLI と BYOK のみをサポートします。Plus、Pro、Max はプランカードに表示されるクレジットを付与し、利用量に応じて選べます。Free を含むすべてのプランで BYOK を利用できます。" },
    { q: "初月オファー後に価格は変わりますか？", a: "月額プランは初月オファーで開始できます。プランカードには現在の初月価格と更新価格が表示されます。初月オファーは新規月額サブスクリプションにアカウントごと 1 回のみ適用されます。年額はすでに月換算価格が低くなっています。" },
    { q: "年額と月額の違いは何ですか？", a: "年額は 1 年分を一括で支払い、各プランカードに表示される低い月換算価格を使用します。月額は毎月更新され、初月オファーを利用できます。年額プランは毎年更新されます。" },
    { q: "月間クレジットを使い切るとどうなりますか？繰り越されますか？", a: "クレジットは請求サイクルごとに付与され、各サイクルでリセットされます。未使用分は繰り越されません。使い切った場合はアップグレード、自動チャージの有効化、または BYOK キーを使って Open Design クレジットを使わずにモデル呼び出しを継続できます。" },
    { q: "自動チャージはどのように機能しますか？", a: "承認後、月間チャージ上限を設定します。Open Design 残高が少なくなると、システムがクレジットを追加し、保存済みの支払い方法に請求します。月間合計は上限を超えません。Wallet で上限変更や停止ができます。" },
    { q: "BYOK とは何ですか？すべてのプランで使えますか？", a: "BYOK は Bring Your Own Key の略で、自分の Anthropic、OpenAI、Google などの API キーを追加してモデルを直接呼び出す方式です。BYOK は Open Design 残高を消費せず、すべてのプランで利用できます。" },
    { q: "プラン変更後、クレジットと請求はどう処理されますか？", a: "このリリースではアップグレードのみ対応します。上位ティアへの移行、または月額から年額への変更です。アップグレードは即時反映され、新しい特典を付与し、差額のみを請求します（現在のプランの未使用期間が差し引かれ、新プランの満額は請求されません）。ダウングレード（下位ティア、または年額から月額）はセルフサービスでは利用できず、その操作は無効化されています。ダウングレードが必要な場合はサポートへお問い合わせください。" },
    { q: "サブスクリプションはいつでもキャンセルできますか？", a: "はい。キャンセルすると更新は停止しますが、現在の特典はすぐには終了しません。支払い済み期間は終了まで利用でき、その後アカウントは Free に戻ります。年額キャンセルの場合、特典は現在の年額期間終了まで維持されます。", cancelCta: "サブスクをキャンセル" },
    { q: "返金はどのように扱われますか？", a: "サブスクリプションのキャンセルで自動返金は発生せず、現在の特典を回収して日割り返金することもありません。支払い済み期間は引き続き利用できます。重複請求や支払いエラーがある場合は、ヘルプセンターからサポートへ連絡してください。" },
  ];

const STORY_BY_LOCALE: Partial<Record<LandingLocaleCode, StoryCopy>> = {
  "en": STORY_EN,
  "zh": STORY_ZH,
  "zh-tw": STORY_ZH_TW,
  "pt-br": STORY_PT_BR,
  "es": STORY_ES,
  "ru": STORY_RU,
  "fr": STORY_FR,
  "ko": STORY_KO,
  "de": STORY_DE,
  "ja": STORY_JA,
};

const FAQ_BY_LOCALE: Partial<Record<LandingLocaleCode, FaqItem[]>> = {
  "en": FAQ_EN,
  "zh": FAQ_ZH,
  "zh-tw": FAQ_ZH_TW,
  "pt-br": FAQ_PT_BR,
  "es": FAQ_ES,
  "ru": FAQ_RU,
  "fr": FAQ_FR,
  "ko": FAQ_KO,
  "de": FAQ_DE,
  "ja": FAQ_JA,
};

/** Customer story copy, falling back to English. */
export function getStory(locale: LandingLocaleCode): StoryCopy {
  return STORY_BY_LOCALE[locale] ?? STORY_BY_LOCALE.en!;
}

/** Pricing FAQ items, falling back to English. */
export function getFaqs(locale: LandingLocaleCode): FaqItem[] {
  return FAQ_BY_LOCALE[locale] ?? FAQ_BY_LOCALE.en!;
}

const FAQ_TITLE_BY_LOCALE: Partial<Record<LandingLocaleCode, string>> = {
  en: 'FAQ',
  zh: '常见问题',
  'zh-tw': '常見問題',
  ja: 'よくある質問',
  ko: '자주 묻는 질문',
  de: 'FAQ',
  fr: 'FAQ',
  ru: 'FAQ',
  es: 'Preguntas frecuentes',
  'pt-br': 'Perguntas frequentes',
};

/** Localized FAQ section heading, falling back to English. */
export function getFaqTitle(locale: LandingLocaleCode): string {
  return FAQ_TITLE_BY_LOCALE[locale] ?? FAQ_TITLE_BY_LOCALE.en!;
}


export interface EnterpriseCopy {
  title: string;
  badge: string;
  description: string;
  leadCta: string;
  features: string[];
}

/** Team/enterprise lead-capture email. */
export const ENTERPRISE_EMAIL = 'support@open-design.ai';

const ENTERPRISE_ZH: EnterpriseCopy = {
  title: "团队版",
  badge: "即将上线",
  description: "团队协作与企业定制 · 本期暂未开放，敬请期待",
  leadCta: "申请团队版",
  features: [
    "包含 Max 全部功能",
    "团队共享设计系统 · 统一品牌事实源",
    "设计系统自进化 · 随团队产出持续学习",
    "多人实时协同同一项目",
    "项目与产物多人共同编辑",
    "团队级项目与产物资产库",
    "成员与权限管理",
    "统一账单 & 用量仪表盘",
    "SSO / SAML & 优先支持",
  ],
};

const ENTERPRISE_EN: EnterpriseCopy = {
  title: "Team",
  badge: "Coming soon",
  description: "Team collaboration and enterprise customization are not available in this release.",
  leadCta: "Request access",
  features: [
    "Everything in Max",
    "Shared team design systems — one brand source of truth",
    "Self-evolving design system that learns from your team",
    "Real-time multiplayer collaboration on projects",
    "Co-edit designs & deliverables together",
    "Shared team project & asset library",
    "Member roles & permissions",
    "Unified billing & usage dashboard",
    "SSO / SAML & priority support",
  ],
};

const ENTERPRISE_ZH_TW: EnterpriseCopy = {
  title: "團隊版",
  badge: "即將上線",
  description: "團隊協作與企業定制 · 本期暫未開放，敬請期待",
  leadCta: "申請團隊版",
  features: [
    "包含 Max 全部功能",
    "團隊共享設計系統 · 統一品牌事實源",
    "設計系統自進化 · 隨團隊產出持續學習",
    "多人即時協同同一專案",
    "專案與產物多人共同編輯",
    "團隊級專案與產物資產庫",
    "成員與權限管理",
    "統一帳單 & 用量儀表板",
    "SSO / SAML & 優先支援",
  ],
};

const ENTERPRISE_PT_BR: EnterpriseCopy = {
  title: "Equipe",
  badge: "Em breve",
  description: "Colaboração em equipe e personalização empresarial ainda não estão disponíveis nesta versão.",
  leadCta: "Solicitar acesso",
  features: [
    "Tudo do Max",
    "Design systems compartilhados — fonte única da marca",
    "Design system que evolui sozinho com o trabalho da equipe",
    "Colaboração em tempo real nos projetos",
    "Coedição de designs e entregáveis",
    "Biblioteca compartilhada de projetos e ativos",
    "Funções e permissões de membros",
    "Faturamento e painel de uso unificados",
    "SSO / SAML e suporte prioritário",
  ],
};

const ENTERPRISE_ES: EnterpriseCopy = {
  title: "Equipo",
  badge: "Próximamente",
  description: "La colaboración en equipo y personalización empresarial no están disponibles en esta versión.",
  leadCta: "Solicitar acceso",
  features: [
    "Todo lo de Max",
    "Design systems compartidos — fuente única de marca",
    "Design system que se autoevoluciona con el trabajo del equipo",
    "Colaboración en tiempo real en proyectos",
    "Coedición de diseños y entregables",
    "Biblioteca compartida de proyectos y recursos",
    "Roles y permisos de miembros",
    "Facturación y panel de uso unificados",
    "SSO / SAML y soporte prioritario",
  ],
};

const ENTERPRISE_RU: EnterpriseCopy = {
  title: "Команда",
  badge: "Скоро",
  description: "Командная работа и корпоративная настройка недоступны в этой версии.",
  leadCta: "Запросить доступ",
  features: [
    "Всё из Max",
    "Общие дизайн-системы команды — единый источник бренда",
    "Самоэволюционирующая дизайн-система, обучается на работе команды",
    "Совместная работа над проектами в реальном времени",
    "Совместное редактирование дизайнов и материалов",
    "Общая библиотека проектов и ресурсов команды",
    "Роли и права участников",
    "Единый биллинг и панель использования",
    "SSO / SAML и приоритетная поддержка",
  ],
};

const ENTERPRISE_FR: EnterpriseCopy = {
  title: "Équipe",
  badge: "Bientôt",
  description: "La collaboration d'équipe et la personnalisation entreprise ne sont pas disponibles dans cette version.",
  leadCta: "Demander l’accès",
  features: [
    "Tout ce qui est dans Max",
    "Design systems partagés — source unique de marque",
    "Design system auto-évolutif qui apprend du travail de l’équipe",
    "Collaboration en temps réel sur les projets",
    "Coédition des designs et livrables",
    "Bibliothèque partagée de projets et ressources",
    "Rôles et permissions des membres",
    "Facturation et tableau de bord d’usage unifiés",
    "SSO / SAML et support prioritaire",
  ],
};

const ENTERPRISE_KO: EnterpriseCopy = {
  title: "팀",
  badge: "출시 예정",
  description: "팀 협업과 엔터프라이즈 맞춤 기능은 이번 버전에서 제공되지 않습니다.",
  leadCta: "액세스 요청",
  features: [
    "Max의 모든 기능 포함",
    "팀 공유 디자인 시스템 — 단일 브랜드 기준",
    "팀 작업으로 스스로 진화하는 디자인 시스템",
    "프로젝트 실시간 공동 작업",
    "디자인·산출물 공동 편집",
    "팀 프로젝트·에셋 공유 라이브러리",
    "멤버 역할 및 권한 관리",
    "통합 청구 및 사용량 대시보드",
    "SSO / SAML 및 우선 지원",
  ],
};

const ENTERPRISE_DE: EnterpriseCopy = {
  title: "Team",
  badge: "Demnächst",
  description: "Team-Zusammenarbeit und Enterprise-Anpassung sind in dieser Version nicht verfügbar.",
  leadCta: "Zugang anfragen",
  features: [
    "Alles aus Max",
    "Geteilte Team-Designsysteme — eine Markenquelle",
    "Selbstentwickelndes Designsystem, das aus der Teamarbeit lernt",
    "Echtzeit-Zusammenarbeit an Projekten",
    "Gemeinsames Bearbeiten von Designs und Ergebnissen",
    "Geteilte Team-Projekt- und Asset-Bibliothek",
    "Mitgliederrollen und Berechtigungen",
    "Einheitliche Abrechnung und Nutzungs-Dashboard",
    "SSO / SAML und priorisierter Support",
  ],
};

const ENTERPRISE_JA: EnterpriseCopy = {
  title: "チーム",
  badge: "近日公開",
  description: "チームコラボレーションとエンタープライズ向けカスタマイズは、このリリースでは利用できません。",
  leadCta: "アクセスを申請",
  features: [
    "Max のすべての機能を含む",
    "チーム共有デザインシステム — ブランドの単一情報源",
    "チームの成果から自己進化するデザインシステム",
    "プロジェクトのリアルタイム共同編集",
    "デザインと成果物の共同編集",
    "チームのプロジェクト・アセット共有ライブラリ",
    "メンバーの役割と権限管理",
    "統合請求と利用状況ダッシュボード",
    "SSO / SAML と優先サポート",
  ],
};

const ENTERPRISE_BY_LOCALE: Partial<Record<LandingLocaleCode, EnterpriseCopy>> = {
  "zh": ENTERPRISE_ZH,
  "en": ENTERPRISE_EN,
  "zh-tw": ENTERPRISE_ZH_TW,
  "pt-br": ENTERPRISE_PT_BR,
  "es": ENTERPRISE_ES,
  "ru": ENTERPRISE_RU,
  "fr": ENTERPRISE_FR,
  "ko": ENTERPRISE_KO,
  "de": ENTERPRISE_DE,
  "ja": ENTERPRISE_JA,
};

/** Team/enterprise banner copy, falling back to English. */
export function getEnterprise(locale: LandingLocaleCode): EnterpriseCopy {
  return ENTERPRISE_BY_LOCALE[locale] ?? ENTERPRISE_BY_LOCALE.en!;
}
