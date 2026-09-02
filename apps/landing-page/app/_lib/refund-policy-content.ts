import type { LandingLocaleCode } from '../i18n';

export interface RefundPolicyItem { lead: string; detail?: string; }
export interface RefundPolicySection {
  title: string;
  intro?: string;
  /** Leading rules rendered as continuous prose with the intro, before the list. */
  inlineItemCount?: number;
  items: RefundPolicyItem[];
  closing?: string;
}
export interface RefundPolicyContent {
  locale: LandingLocaleCode;
  metaTitle: string;
  metaDescription: string;
  title: string;
  updatedLabel: string;
  updated: string;
  intro: string;
  preamble: string[];
  sections: RefundPolicySection[];
  contact: string;
  contactCta: string;
  supportSubject: string;
}

const EN: RefundPolicyContent = {
  locale: 'en',
  metaTitle: 'Refund Policy — OpenDesign',
  metaDescription: 'OpenDesign refund eligibility, application details, and processing time.',
  title: 'Refund Policy',
  updatedLabel: 'Last updated',
  updated: 'August 27, 2026',
  intro: 'The following rules apply to personal subscription orders purchased directly from OpenDesign.',
  preamble: [
    'Except as otherwise required by applicable law, all payments for subscriptions, credits, or other paid features are final and non-refundable. You acknowledge that once access to paid services or credits has been granted to you, the company has fully fulfilled its obligations and no refunds will be provided.',
    'In exceptional circumstances, the company may, at its sole discretion, consider requests for partial refunds.',
  ],
  sections: [
    {
      title: 'Monthly and annual subscriptions',
      inlineItemCount: 2,
      intro: 'Our refund policy varies by subscription type, local laws, and account status. Please note that after your first refund request is approved, we cannot process a second refund request.',
      items: [
        {
          lead: 'Customers in the EU, UK, or Turkey',
          detail: 'If you cancel your subscription within 14 days of purchase, you are eligible for a refund. This applies to monthly and annual subscriptions. Please indicate in your request that you are requesting a refund from the EU, UK, or Turkey.',
        },
        {
          lead: 'Customers in South Korea',
          detail: 'If you request a refund within 7 days of purchase, you are eligible for a refund.',
        },
        {
          lead: 'All other customers',
          detail: 'You may request a refund within 48 hours of purchase.',
        },
      ],
      closing: 'If approved, users who have not used any paid benefits may receive a full refund. For users who have used paid benefits, the refund amount will be reduced proportionally based on the length of service used. If our system detects excessive use of the service before the refund request, the request may be declined.',
    },
    {
      title: 'How to request a refund',
      items: [
        { lead: 'Send your request', detail: 'Email support@open-design.ai.' },
        { lead: 'Include', detail: 'Your OpenDesign account email and the reason for the request.' },
      ],
    },
    {
      title: 'Processing time',
      items: [
        { lead: 'Usage verification', detail: 'Eligibility and consumption are determined from OpenDesign backend records (refund arrival time depends on the payment provider).' },
        { lead: 'Within 10 business days', detail: 'After approval, OpenDesign will initiate the refund to the original payment method.' },
      ],
    },
    {
      title: 'Special cases',
      items: [
        { lead: 'Fraud, policy violations, or refund abuse', detail: 'Refunds are not available in these cases.' },
      ],
    },
  ],
  contact: 'To request a refund, contact:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'OpenDesign refund request',
};

const ZH: RefundPolicyContent = {
  locale: 'zh',
  metaTitle: '退款政策 — OpenDesign',
  metaDescription: '了解 OpenDesign 的退款条件、申请方式和处理时间。',
  title: '退款政策',
  updatedLabel: '最后更新',
  updated: '2026 年 8 月 27 日',
  intro: '以下规则适用于通过 OpenDesign 官网直接购买的个人订阅订单。',
  preamble: [
    '除适用法律另有规定外，所有订阅、积分或其他付费功能的付款均为最终付款，不可退款。您确认，一旦授予您付费服务或积分的访问权限，即表示公司已完全履行其义务，且不予退款。',
    '在特殊情况下，公司可自行决定是否考虑部分退款申请。',
  ],
  sections: [
    {
      title: '月度及年度订阅订单',
      inlineItemCount: 2,
      intro: '我们的退款政策因订阅类型、当地法律和账户状态而异。请注意，在第一次退款请求获批后，我们无法处理第二次退款请求。',
      items: [
        {
          lead: '欧盟、英国或土耳其的客户',
          detail: '如果您在购买后 14 天内取消订阅，您有资格获得退款。这适用于月度和年度订阅。请在您的请求中说明您正在从欧盟、英国或土耳其请求退款。',
        },
        {
          lead: '韩国的客户',
          detail: '如果您在购买后 7 天内提出请求，您有资格获得退款。',
        },
        {
          lead: '所有其他客户',
          detail: '您可以在购买后 48 小时内请求退款。',
        },
      ],
      closing: '如获批准，未使用任何付费权益的用户可获得全额退款；已使用付费权益的用户，退款金额将根据服务时长按比例扣减。如果我们的系统检测到在退款请求之前过度使用服务，请求可能会被拒绝。',
    },
    {
      title: '如何申请退款',
      items: [
        { lead: '发送申请', detail: '发送邮件至 support@open-design.ai。' },
        { lead: '提供信息', detail: 'OpenDesign 账号邮箱，以及申请退款的原因。' },
      ],
    },
    {
      title: '退款处理时间',
      items: [
        { lead: '用量核验', detail: '退款资格和实际消耗量以 OpenDesign 后台记录为准（到账时间以支付渠道为准）。' },
        { lead: '10 个工作日内', detail: '审核通过后，OpenDesign 将向原支付方式发起退款。' },
      ],
    },
    {
      title: '特殊情况',
      items: [
        { lead: '欺诈、违规使用或滥用退款政策', detail: '如涉及上述情况，将不支持退款。' },
      ],
    },
  ],
  contact: '如需申请退款，请联系：',
  contactCta: 'support@open-design.ai',
  supportSubject: 'OpenDesign 退款申请',
};

const JA: RefundPolicyContent = {
  locale: 'ja',
  metaTitle: '返金ポリシー — OpenDesign',
  metaDescription: 'OpenDesign の返金条件、申請方法、処理期間についてご案内します。',
  title: '返金ポリシー',
  updatedLabel: '最終更新日',
  updated: '2026年8月27日',
  intro: '以下の規定は、OpenDesign 公式サイトから直接購入した個人向けサブスクリプションに適用されます。',
  preamble: [
    '適用法令に別段の定めがある場合を除き、サブスクリプション、クレジット、その他の有料機能に対する支払いはすべて最終的なものであり、返金されません。有料サービスまたはクレジットへのアクセスが付与された時点で、当社は義務を完全に履行したものとし、返金は行われないことに同意するものとします。',
    '例外的な状況では、当社の裁量により一部返金の申請を検討する場合があります。',
  ],
  sections: [
    {
      title: '月額および年額サブスクリプション',
      inlineItemCount: 2,
      intro: '返金ポリシーは、サブスクリプションの種類、現地法、アカウントの状態によって異なります。最初の返金申請が承認された後は、2回目の返金申請を処理できません。',
      items: [
        { lead: 'EU、英国、またはトルコのお客様', detail: '購入後14日以内にサブスクリプションを解約した場合、返金の対象となります。月額および年額サブスクリプションの両方に適用されます。申請時に、EU、英国、またはトルコからの返金申請であることを明記してください。' },
        { lead: '韓国のお客様', detail: '購入後7日以内に申請した場合、返金の対象となります。' },
        { lead: 'その他の地域のお客様', detail: '購入後48時間以内に返金を申請できます。' },
      ],
      closing: '承認された場合、有料特典を一切使用していないユーザーには全額が返金されます。有料特典を使用したユーザーの返金額は、利用したサービス期間に応じて比例して減額されます。返金申請前にサービスの過度な利用が検出された場合、申請が却下されることがあります。',
    },
    {
      title: '返金の申請方法',
      items: [
        { lead: '申請を送信', detail: 'support@open-design.ai までメールをお送りください。' },
        { lead: '必要な情報', detail: 'OpenDesign アカウントのメールアドレスと返金申請の理由をご記載ください。' },
      ],
    },
    {
      title: '返金処理期間',
      items: [
        { lead: '利用状況の確認', detail: '返金資格と実際の利用量は OpenDesign のバックエンド記録に基づきます（着金時期は決済事業者によって異なります）。' },
        { lead: '10営業日以内', detail: '承認後、OpenDesign は元のお支払い方法への返金手続きを開始します。' },
      ],
    },
    {
      title: '特別な場合',
      items: [
        { lead: '詐欺、規約違反、または返金ポリシーの悪用', detail: 'これらに該当する場合、返金は受けられません。' },
      ],
    },
  ],
  contact: '返金を申請する場合は、こちらまでご連絡ください：',
  contactCta: 'support@open-design.ai',
  supportSubject: 'OpenDesign 返金申請',
};

const KO: RefundPolicyContent = {
  locale: 'ko',
  metaTitle: '환불 정책 — OpenDesign',
  metaDescription: 'OpenDesign의 환불 조건, 신청 방법 및 처리 기간을 확인하세요.',
  title: '환불 정책',
  updatedLabel: '최종 업데이트',
  updated: '2026년 8월 27일',
  intro: '다음 규정은 OpenDesign 공식 웹사이트에서 직접 구매한 개인 구독 주문에 적용됩니다.',
  preamble: [
    '관련 법률에서 달리 요구하는 경우를 제외하고, 구독, 크레딧 또는 기타 유료 기능에 대한 모든 결제는 최종 결제이며 환불되지 않습니다. 유료 서비스 또는 크레딧에 대한 접근 권한이 부여되는 즉시 회사가 의무를 완전히 이행한 것으로 간주되며 환불되지 않음을 확인합니다.',
    '예외적인 경우 회사는 단독 재량으로 부분 환불 신청을 검토할 수 있습니다.',
  ],
  sections: [
    {
      title: '월간 및 연간 구독',
      inlineItemCount: 2,
      intro: '환불 정책은 구독 유형, 현지 법률 및 계정 상태에 따라 달라집니다. 첫 번째 환불 요청이 승인된 후에는 두 번째 환불 요청을 처리할 수 없습니다.',
      items: [
        { lead: 'EU, 영국 또는 튀르키예 고객', detail: '구매 후 14일 이내에 구독을 취소하면 환불받을 수 있습니다. 월간 및 연간 구독 모두에 적용됩니다. 요청 시 EU, 영국 또는 튀르키예에서 환불을 요청한다는 점을 명시해 주세요.' },
        { lead: '대한민국 고객', detail: '구매 후 7일 이내에 요청하면 환불받을 수 있습니다.' },
        { lead: '그 외 모든 고객', detail: '구매 후 48시간 이내에 환불을 요청할 수 있습니다.' },
      ],
      closing: '승인되는 경우 유료 혜택을 전혀 사용하지 않은 사용자는 전액 환불을 받을 수 있습니다. 유료 혜택을 사용한 사용자의 환불 금액은 이용한 서비스 기간에 따라 비례하여 차감됩니다. 환불 요청 전에 서비스가 과도하게 사용된 것으로 시스템에서 감지되면 요청이 거절될 수 있습니다.',
    },
    {
      title: '환불 신청 방법',
      items: [
        { lead: '신청 보내기', detail: 'support@open-design.ai로 이메일을 보내 주세요.' },
        { lead: '정보 제공', detail: 'OpenDesign 계정 이메일과 환불 신청 사유를 알려 주세요.' },
      ],
    },
    {
      title: '환불 처리 기간',
      items: [
        { lead: '사용량 확인', detail: '환불 자격과 실제 사용량은 OpenDesign 백엔드 기록을 기준으로 합니다(입금 시점은 결제 제공업체에 따라 다릅니다).' },
        { lead: '영업일 기준 10일 이내', detail: '승인 후 OpenDesign은 원래 결제 수단으로 환불을 시작합니다.' },
      ],
    },
    {
      title: '특별한 경우',
      items: [
        { lead: '사기, 정책 위반 또는 환불 정책 악용', detail: '이러한 경우에는 환불이 지원되지 않습니다.' },
      ],
    },
  ],
  contact: '환불을 신청하려면 다음으로 문의하세요:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'OpenDesign 환불 신청',
};

const DE: RefundPolicyContent = {
  locale: 'de',
  metaTitle: 'Rückerstattungsrichtlinie — OpenDesign',
  metaDescription: 'Informationen zu Anspruch, Antrag und Bearbeitungszeit für Rückerstattungen bei OpenDesign.',
  title: 'Rückerstattungsrichtlinie',
  updatedLabel: 'Zuletzt aktualisiert',
  updated: '27. August 2026',
  intro: 'Die folgenden Regeln gelten für persönliche Abonnements, die direkt über die OpenDesign-Website erworben wurden.',
  preamble: [
    'Sofern das anwendbare Recht nichts anderes vorschreibt, sind alle Zahlungen für Abonnements, Guthaben oder andere kostenpflichtige Funktionen endgültig und nicht erstattungsfähig. Sie bestätigen, dass das Unternehmen seine Verpflichtungen vollständig erfüllt hat, sobald Ihnen der Zugang zu kostenpflichtigen Diensten oder Guthaben gewährt wurde, und keine Rückerstattung erfolgt.',
    'In Ausnahmefällen kann das Unternehmen nach eigenem Ermessen Anträge auf eine teilweise Rückerstattung prüfen.',
  ],
  sections: [
    {
      title: 'Monats- und Jahresabonnements',
      inlineItemCount: 2,
      intro: 'Unsere Rückerstattungsrichtlinie hängt von der Art des Abonnements, den örtlichen Gesetzen und dem Kontostatus ab. Nach Genehmigung des ersten Rückerstattungsantrags können wir keinen zweiten Antrag bearbeiten.',
      items: [
        { lead: 'Kundinnen und Kunden in der EU, im Vereinigten Königreich oder in der Türkei', detail: 'Wenn Sie Ihr Abonnement innerhalb von 14 Tagen nach dem Kauf kündigen, haben Sie Anspruch auf eine Rückerstattung. Dies gilt für Monats- und Jahresabonnements. Geben Sie in Ihrem Antrag an, dass Sie die Rückerstattung aus der EU, dem Vereinigten Königreich oder der Türkei beantragen.' },
        { lead: 'Kundinnen und Kunden in Südkorea', detail: 'Wenn Sie den Antrag innerhalb von 7 Tagen nach dem Kauf stellen, haben Sie Anspruch auf eine Rückerstattung.' },
        { lead: 'Alle anderen Kundinnen und Kunden', detail: 'Sie können innerhalb von 48 Stunden nach dem Kauf eine Rückerstattung beantragen.' },
      ],
      closing: 'Bei Genehmigung erhalten Nutzer, die keine kostenpflichtigen Leistungen verwendet haben, eine vollständige Rückerstattung. Bei bereits genutzten kostenpflichtigen Leistungen wird der Erstattungsbetrag anteilig entsprechend der genutzten Leistungsdauer gekürzt. Erkennt unser System vor dem Antrag eine übermäßige Nutzung des Dienstes, kann der Antrag abgelehnt werden.',
    },
    {
      title: 'So beantragen Sie eine Rückerstattung',
      items: [
        { lead: 'Antrag senden', detail: 'Senden Sie eine E-Mail an support@open-design.ai.' },
        { lead: 'Angaben beifügen', detail: 'Nennen Sie die E-Mail-Adresse Ihres OpenDesign-Kontos und den Grund für den Antrag.' },
      ],
    },
    {
      title: 'Bearbeitungszeit',
      items: [
        { lead: 'Nutzungsprüfung', detail: 'Anspruch und tatsächliche Nutzung richten sich nach den Backend-Daten von OpenDesign (der Zahlungseingang hängt vom Zahlungsanbieter ab).' },
        { lead: 'Innerhalb von 10 Werktagen', detail: 'Nach der Genehmigung veranlasst OpenDesign die Rückerstattung auf die ursprüngliche Zahlungsmethode.' },
      ],
    },
    {
      title: 'Sonderfälle',
      items: [
        { lead: 'Betrug, Richtlinienverstöße oder Missbrauch der Rückerstattungsrichtlinie', detail: 'In diesen Fällen ist keine Rückerstattung möglich.' },
      ],
    },
  ],
  contact: 'Für einen Rückerstattungsantrag kontaktieren Sie:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'OpenDesign Rückerstattungsantrag',
};

const FR: RefundPolicyContent = {
  locale: 'fr',
  metaTitle: 'Politique de remboursement — OpenDesign',
  metaDescription: 'Consultez les conditions, la procédure et les délais de remboursement d’OpenDesign.',
  title: 'Politique de remboursement',
  updatedLabel: 'Dernière mise à jour',
  updated: '27 août 2026',
  intro: 'Les règles suivantes s’appliquent aux abonnements individuels achetés directement sur le site officiel d’OpenDesign.',
  preamble: [
    'Sauf disposition contraire de la loi applicable, tous les paiements relatifs aux abonnements, crédits ou autres fonctionnalités payantes sont définitifs et non remboursables. Vous reconnaissez qu’une fois l’accès aux services payants ou aux crédits accordé, l’entreprise a pleinement exécuté ses obligations et qu’aucun remboursement ne sera accordé.',
    'Dans des circonstances exceptionnelles, l’entreprise peut, à sa seule discrétion, examiner une demande de remboursement partiel.',
  ],
  sections: [
    {
      title: 'Abonnements mensuels et annuels',
      inlineItemCount: 2,
      intro: 'Notre politique de remboursement varie selon le type d’abonnement, la législation locale et l’état du compte. Après l’approbation d’une première demande de remboursement, nous ne pouvons pas en traiter une seconde.',
      items: [
        { lead: 'Clients de l’UE, du Royaume-Uni ou de Turquie', detail: 'Si vous annulez votre abonnement dans les 14 jours suivant l’achat, vous pouvez bénéficier d’un remboursement. Cette règle s’applique aux abonnements mensuels et annuels. Précisez dans votre demande que vous sollicitez le remboursement depuis l’UE, le Royaume-Uni ou la Turquie.' },
        { lead: 'Clients de Corée du Sud', detail: 'Si vous présentez votre demande dans les 7 jours suivant l’achat, vous pouvez bénéficier d’un remboursement.' },
        { lead: 'Tous les autres clients', detail: 'Vous pouvez demander un remboursement dans les 48 heures suivant l’achat.' },
      ],
      closing: 'En cas d’approbation, les utilisateurs n’ayant utilisé aucun avantage payant peuvent recevoir un remboursement intégral. Pour ceux ayant utilisé des avantages payants, le montant sera réduit au prorata de la durée de service utilisée. Si notre système détecte une utilisation excessive avant la demande, celle-ci peut être refusée.',
    },
    {
      title: 'Comment demander un remboursement',
      items: [
        { lead: 'Envoyer la demande', detail: 'Envoyez un e-mail à support@open-design.ai.' },
        { lead: 'Fournir les informations', detail: 'Indiquez l’adresse e-mail de votre compte OpenDesign et le motif de la demande.' },
      ],
    },
    {
      title: 'Délai de traitement',
      items: [
        { lead: 'Vérification de l’utilisation', detail: 'L’éligibilité et la consommation réelle sont déterminées d’après les données du système OpenDesign (le délai de réception dépend du prestataire de paiement).' },
        { lead: 'Sous 10 jours ouvrés', detail: 'Après approbation, OpenDesign initiera le remboursement vers le moyen de paiement d’origine.' },
      ],
    },
    {
      title: 'Cas particuliers',
      items: [
        { lead: 'Fraude, violation des règles ou abus de la politique de remboursement', detail: 'Aucun remboursement n’est accordé dans ces cas.' },
      ],
    },
  ],
  contact: 'Pour demander un remboursement, contactez :',
  contactCta: 'support@open-design.ai',
  supportSubject: 'Demande de remboursement OpenDesign',
};

const RU: RefundPolicyContent = {
  locale: 'ru',
  metaTitle: 'Политика возврата средств — OpenDesign',
  metaDescription: 'Условия, порядок подачи заявки и сроки возврата средств OpenDesign.',
  title: 'Политика возврата средств',
  updatedLabel: 'Последнее обновление',
  updated: '27 августа 2026 г.',
  intro: 'Следующие правила применяются к личным подпискам, приобретённым непосредственно на официальном сайте OpenDesign.',
  preamble: [
    'Если применимое законодательство не требует иного, все платежи за подписки, кредиты и другие платные функции являются окончательными и не подлежат возврату. Вы подтверждаете, что после предоставления доступа к платным услугам или кредитам компания полностью выполнила свои обязательства и возврат не производится.',
    'В исключительных случаях компания может по своему усмотрению рассмотреть заявление на частичный возврат.',
  ],
  sections: [
    {
      title: 'Месячные и годовые подписки',
      inlineItemCount: 2,
      intro: 'Правила возврата зависят от типа подписки, местного законодательства и состояния аккаунта. После одобрения первого запроса на возврат мы не можем обработать второй запрос.',
      items: [
        { lead: 'Клиенты из ЕС, Великобритании или Турции', detail: 'При отмене подписки в течение 14 дней после покупки вы имеете право на возврат. Это относится к месячным и годовым подпискам. Укажите в запросе, что обращаетесь за возвратом из ЕС, Великобритании или Турции.' },
        { lead: 'Клиенты из Южной Кореи', detail: 'Если вы подадите запрос в течение 7 дней после покупки, вы имеете право на возврат.' },
        { lead: 'Все остальные клиенты', detail: 'Вы можете запросить возврат в течение 48 часов после покупки.' },
      ],
      closing: 'В случае одобрения пользователи, не использовавшие платные преимущества, получают полный возврат. Для пользователей, уже использовавших платные преимущества, сумма возврата уменьшается пропорционально использованному сроку услуги. Если до подачи запроса система обнаружит чрезмерное использование сервиса, запрос может быть отклонён.',
    },
    {
      title: 'Как запросить возврат',
      items: [
        { lead: 'Отправьте запрос', detail: 'Напишите на support@open-design.ai.' },
        { lead: 'Укажите информацию', detail: 'Укажите адрес электронной почты аккаунта OpenDesign и причину возврата.' },
      ],
    },
    {
      title: 'Срок обработки',
      items: [
        { lead: 'Проверка использования', detail: 'Право на возврат и фактический объём использования определяются по данным серверной системы OpenDesign (срок зачисления зависит от платёжного провайдера).' },
        { lead: 'В течение 10 рабочих дней', detail: 'После одобрения OpenDesign инициирует возврат на исходный способ оплаты.' },
      ],
    },
    {
      title: 'Особые случаи',
      items: [
        { lead: 'Мошенничество, нарушение правил или злоупотребление политикой возврата', detail: 'В этих случаях возврат не предоставляется.' },
      ],
    },
  ],
  contact: 'Чтобы запросить возврат, напишите:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'Запрос на возврат OpenDesign',
};

const ES: RefundPolicyContent = {
  locale: 'es',
  metaTitle: 'Política de reembolso — OpenDesign',
  metaDescription: 'Consulta los requisitos, el proceso de solicitud y los plazos de reembolso de OpenDesign.',
  title: 'Política de reembolso',
  updatedLabel: 'Última actualización',
  updated: '27 de agosto de 2026',
  intro: 'Las siguientes reglas se aplican a las suscripciones personales adquiridas directamente en el sitio web oficial de OpenDesign.',
  preamble: [
    'Salvo que la legislación aplicable disponga lo contrario, todos los pagos por suscripciones, créditos u otras funciones de pago son definitivos y no reembolsables. Confirmas que, una vez concedido el acceso a los servicios de pago o a los créditos, la empresa ha cumplido íntegramente sus obligaciones y no se realizará ningún reembolso.',
    'En circunstancias excepcionales, la empresa podrá, a su entera discreción, considerar solicitudes de reembolso parcial.',
  ],
  sections: [
    {
      title: 'Suscripciones mensuales y anuales',
      inlineItemCount: 2,
      intro: 'Nuestra política de reembolso varía según el tipo de suscripción, la legislación local y el estado de la cuenta. Una vez aprobada la primera solicitud de reembolso, no podremos tramitar una segunda.',
      items: [
        { lead: 'Clientes de la UE, el Reino Unido o Turquía', detail: 'Si cancelas la suscripción dentro de los 14 días posteriores a la compra, puedes optar a un reembolso. Se aplica a suscripciones mensuales y anuales. Indica en tu solicitud que pides el reembolso desde la UE, el Reino Unido o Turquía.' },
        { lead: 'Clientes de Corea del Sur', detail: 'Si presentas la solicitud dentro de los 7 días posteriores a la compra, puedes optar a un reembolso.' },
        { lead: 'Todos los demás clientes', detail: 'Puedes solicitar un reembolso dentro de las 48 horas posteriores a la compra.' },
      ],
      closing: 'Si se aprueba, los usuarios que no hayan utilizado ningún beneficio de pago podrán recibir un reembolso completo. Para quienes hayan utilizado beneficios de pago, el importe se reducirá proporcionalmente según el tiempo de servicio utilizado. Si nuestro sistema detecta un uso excesivo antes de la solicitud, esta podrá ser rechazada.',
    },
    {
      title: 'Cómo solicitar un reembolso',
      items: [
        { lead: 'Envía la solicitud', detail: 'Escribe a support@open-design.ai.' },
        { lead: 'Proporciona la información', detail: 'Indica el correo de tu cuenta de OpenDesign y el motivo de la solicitud.' },
      ],
    },
    {
      title: 'Plazo de tramitación',
      items: [
        { lead: 'Verificación del uso', detail: 'La elegibilidad y el consumo real se determinan según los registros del sistema de OpenDesign (el tiempo de recepción depende del proveedor de pago).' },
        { lead: 'En un plazo de 10 días laborables', detail: 'Tras la aprobación, OpenDesign iniciará el reembolso al método de pago original.' },
      ],
    },
    {
      title: 'Casos especiales',
      items: [
        { lead: 'Fraude, incumplimiento de políticas o abuso de la política de reembolso', detail: 'No se ofrecen reembolsos en estos casos.' },
      ],
    },
  ],
  contact: 'Para solicitar un reembolso, contacta con:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'Solicitud de reembolso de OpenDesign',
};

const PT_BR: RefundPolicyContent = {
  locale: 'pt-br',
  metaTitle: 'Política de reembolso — OpenDesign',
  metaDescription: 'Consulte os critérios, a solicitação e o prazo de processamento de reembolsos da OpenDesign.',
  title: 'Política de reembolso',
  updatedLabel: 'Última atualização',
  updated: '27 de agosto de 2026',
  intro: 'As regras a seguir se aplicam às assinaturas pessoais compradas diretamente no site oficial da OpenDesign.',
  preamble: [
    'Salvo quando a legislação aplicável exigir o contrário, todos os pagamentos por assinaturas, créditos ou outros recursos pagos são definitivos e não reembolsáveis. Você reconhece que, assim que o acesso aos serviços pagos ou créditos for concedido, a empresa terá cumprido integralmente suas obrigações e nenhum reembolso será concedido.',
    'Em circunstâncias excepcionais, a empresa poderá, a seu exclusivo critério, considerar solicitações de reembolso parcial.',
  ],
  sections: [
    {
      title: 'Assinaturas mensais e anuais',
      inlineItemCount: 2,
      intro: 'Nossa política de reembolso varia conforme o tipo de assinatura, as leis locais e o status da conta. Depois que a primeira solicitação de reembolso for aprovada, não poderemos processar uma segunda solicitação.',
      items: [
        { lead: 'Clientes da UE, do Reino Unido ou da Turquia', detail: 'Se você cancelar a assinatura em até 14 dias após a compra, terá direito a um reembolso. Isso se aplica a assinaturas mensais e anuais. Informe na solicitação que está pedindo o reembolso a partir da UE, do Reino Unido ou da Turquia.' },
        { lead: 'Clientes da Coreia do Sul', detail: 'Se você enviar a solicitação em até 7 dias após a compra, terá direito a um reembolso.' },
        { lead: 'Todos os demais clientes', detail: 'Você pode solicitar um reembolso em até 48 horas após a compra.' },
      ],
      closing: 'Se aprovado, usuários que não utilizaram nenhum benefício pago poderão receber reembolso integral. Para usuários que utilizaram benefícios pagos, o valor será reduzido proporcionalmente ao período de serviço utilizado. Se nosso sistema detectar uso excessivo antes da solicitação, ela poderá ser recusada.',
    },
    {
      title: 'Como solicitar um reembolso',
      items: [
        { lead: 'Envie a solicitação', detail: 'Envie um e-mail para support@open-design.ai.' },
        { lead: 'Forneça as informações', detail: 'Informe o e-mail da sua conta OpenDesign e o motivo da solicitação.' },
      ],
    },
    {
      title: 'Prazo de processamento',
      items: [
        { lead: 'Verificação de uso', detail: 'A elegibilidade e o consumo real são determinados pelos registros do sistema da OpenDesign (o prazo de recebimento depende do provedor de pagamento).' },
        { lead: 'Em até 10 dias úteis', detail: 'Após a aprovação, a OpenDesign iniciará o reembolso para o método de pagamento original.' },
      ],
    },
    {
      title: 'Casos especiais',
      items: [
        { lead: 'Fraude, violações das regras ou abuso da política de reembolso', detail: 'Não haverá reembolso nesses casos.' },
      ],
    },
  ],
  contact: 'Para solicitar um reembolso, entre em contato:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'Solicitação de reembolso OpenDesign',
};

const IT: RefundPolicyContent = {
  locale: 'it',
  metaTitle: 'Politica di rimborso — OpenDesign',
  metaDescription: 'Consulta i requisiti, la procedura e i tempi di rimborso di OpenDesign.',
  title: 'Politica di rimborso',
  updatedLabel: 'Ultimo aggiornamento',
  updated: '27 agosto 2026',
  intro: 'Le seguenti regole si applicano agli abbonamenti personali acquistati direttamente sul sito ufficiale di OpenDesign.',
  preamble: [
    'Salvo diversa disposizione della legge applicabile, tutti i pagamenti per abbonamenti, crediti o altre funzionalità a pagamento sono definitivi e non rimborsabili. Riconosci che, una volta concesso l’accesso ai servizi a pagamento o ai crediti, la società ha adempiuto integralmente ai propri obblighi e non verrà concesso alcun rimborso.',
    'In circostanze eccezionali, la società può, a propria esclusiva discrezione, prendere in considerazione richieste di rimborso parziale.',
  ],
  sections: [
    {
      title: 'Abbonamenti mensili e annuali',
      inlineItemCount: 2,
      intro: 'La nostra politica di rimborso varia in base al tipo di abbonamento, alle leggi locali e allo stato dell’account. Dopo l’approvazione della prima richiesta di rimborso, non possiamo elaborarne una seconda.',
      items: [
        { lead: 'Clienti dell’UE, del Regno Unito o della Turchia', detail: 'Se annulli l’abbonamento entro 14 giorni dall’acquisto, hai diritto a un rimborso. La regola si applica agli abbonamenti mensili e annuali. Specifica nella richiesta che stai chiedendo il rimborso dall’UE, dal Regno Unito o dalla Turchia.' },
        { lead: 'Clienti della Corea del Sud', detail: 'Se presenti la richiesta entro 7 giorni dall’acquisto, hai diritto a un rimborso.' },
        { lead: 'Tutti gli altri clienti', detail: 'Puoi richiedere un rimborso entro 48 ore dall’acquisto.' },
      ],
      closing: 'Se approvato, gli utenti che non hanno utilizzato alcun vantaggio a pagamento possono ricevere un rimborso completo. Per gli utenti che hanno utilizzato vantaggi a pagamento, l’importo sarà ridotto proporzionalmente in base alla durata del servizio utilizzato. Se il sistema rileva un uso eccessivo prima della richiesta, questa può essere rifiutata.',
    },
    {
      title: 'Come richiedere un rimborso',
      items: [
        { lead: 'Invia la richiesta', detail: 'Invia un’e-mail a support@open-design.ai.' },
        { lead: 'Fornisci le informazioni', detail: 'Indica l’e-mail del tuo account OpenDesign e il motivo della richiesta.' },
      ],
    },
    {
      title: 'Tempi di elaborazione',
      items: [
        { lead: 'Verifica dell’utilizzo', detail: 'L’idoneità e il consumo effettivo sono determinati in base ai dati del sistema OpenDesign (il tempo di accredito dipende dal fornitore di pagamento).' },
        { lead: 'Entro 10 giorni lavorativi', detail: 'Dopo l’approvazione, OpenDesign avvierà il rimborso sul metodo di pagamento originale.' },
      ],
    },
    {
      title: 'Casi speciali',
      items: [
        { lead: 'Frode, violazioni delle regole o abuso della politica di rimborso', detail: 'In questi casi non è previsto alcun rimborso.' },
      ],
    },
  ],
  contact: 'Per richiedere un rimborso, contatta:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'Richiesta di rimborso OpenDesign',
};

const TR: RefundPolicyContent = {
  locale: 'tr',
  metaTitle: 'Para İade Politikası — OpenDesign',
  metaDescription: 'OpenDesign para iadesi uygunluğu, başvuru bilgileri ve işlem süresi.',
  title: 'Para İade Politikası',
  updatedLabel: 'Son güncelleme',
  updated: '27 Ağustos 2026',
  intro: 'Aşağıdaki kurallar, doğrudan OpenDesign resmî web sitesinden satın alınan bireysel abonelikler için geçerlidir.',
  preamble: [
    'Yürürlükteki yasaların aksini gerektirdiği durumlar dışında, abonelikler, krediler veya diğer ücretli özellikler için yapılan tüm ödemeler kesindir ve iade edilmez. Ücretli hizmetlere veya kredilere erişim verildiğinde şirketin yükümlülüklerini tamamen yerine getirdiğini ve para iadesi yapılmayacağını kabul edersiniz.',
    'İstisnai durumlarda şirket, tamamen kendi takdirine bağlı olarak kısmi para iadesi taleplerini değerlendirebilir.',
  ],
  sections: [
    {
      title: 'Aylık ve yıllık abonelikler',
      inlineItemCount: 2,
      intro: 'Para iade politikamız abonelik türüne, yerel yasalara ve hesap durumuna göre değişir. İlk para iadesi talebiniz onaylandıktan sonra ikinci bir talebi işleme alamayız.',
      items: [
        { lead: 'AB, Birleşik Krallık veya Türkiye’deki müşteriler', detail: 'Aboneliğinizi satın alma tarihinden itibaren 14 gün içinde iptal ederseniz para iadesi almaya hak kazanırsınız. Bu kural aylık ve yıllık abonelikler için geçerlidir. Talebinizde AB, Birleşik Krallık veya Türkiye’den para iadesi istediğinizi belirtin.' },
        { lead: 'Güney Kore’deki müşteriler', detail: 'Satın alma tarihinden itibaren 7 gün içinde talepte bulunursanız para iadesi almaya hak kazanırsınız.' },
        { lead: 'Diğer tüm müşteriler', detail: 'Satın alma tarihinden itibaren 48 saat içinde para iadesi talep edebilirsiniz.' },
      ],
      closing: 'Onaylanması hâlinde, hiçbir ücretli avantajı kullanmamış kullanıcılar tam para iadesi alabilir. Ücretli avantajları kullanmış kullanıcıların iade tutarı, kullanılan hizmet süresine göre orantılı olarak azaltılır. Sistemimiz talep öncesinde hizmetin aşırı kullanıldığını tespit ederse talep reddedilebilir.',
    },
    {
      title: 'Para iadesi nasıl talep edilir',
      items: [
        { lead: 'Talebi gönderin', detail: 'support@open-design.ai adresine e-posta gönderin.' },
        { lead: 'Bilgileri sağlayın', detail: 'OpenDesign hesap e-posta adresinizi ve talep nedeninizi belirtin.' },
      ],
    },
    {
      title: 'İşlem süresi',
      items: [
        { lead: 'Kullanım doğrulaması', detail: 'Uygunluk ve gerçek kullanım, OpenDesign arka uç kayıtlarına göre belirlenir (tutarın hesaba geçme süresi ödeme sağlayıcısına bağlıdır).' },
        { lead: '10 iş günü içinde', detail: 'Onaylandıktan sonra OpenDesign, iadeyi ilk ödeme yöntemine başlatır.' },
      ],
    },
    {
      title: 'Özel durumlar',
      items: [
        { lead: 'Dolandırıcılık, politika ihlalleri veya para iade politikasının kötüye kullanılması', detail: 'Bu durumlarda para iadesi yapılmaz.' },
      ],
    },
  ],
  contact: 'Para iadesi talep etmek için iletişime geçin:',
  contactCta: 'support@open-design.ai',
  supportSubject: 'OpenDesign para iadesi talebi',
};

const CONTENT: Partial<Record<LandingLocaleCode, RefundPolicyContent>> = {
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

export function getRefundPolicyContent(locale: LandingLocaleCode): RefundPolicyContent {
  return CONTENT[locale] ?? EN;
}
