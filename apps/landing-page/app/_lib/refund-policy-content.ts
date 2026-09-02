import type { LandingLocaleCode } from '../i18n';

export interface RefundPolicyItem { lead: string; detail?: string; }
export interface RefundPolicySection { title: string; items: RefundPolicyItem[]; note?: string; }
export interface RefundPolicyContent {
  metaTitle: string;
  metaDescription: string;
  title: string;
  updatedLabel: string;
  updated: string;
  intro: string;
  sections: RefundPolicySection[];
  contact: string;
  contactCta: string;
}

const EN: RefundPolicyContent = {
  metaTitle: 'Refund Policy — OpenDesign',
  metaDescription: 'OpenDesign refund eligibility, application details, and processing time.',
  title: 'Refund Policy',
  updatedLabel: 'Last updated',
  updated: 'August 27, 2026',
  intro: 'The following rules apply to personal subscription orders purchased directly from OpenDesign.',
  sections: [
    {
      title: 'Monthly and annual subscriptions',
      items: [{
        lead: 'Within 7 calendar days of payment',
        detail: 'If the paid benefits included in the order remain unused, you may request a full refund. Once any paid benefit has been used, the order is not refundable.',
      }],
    },
    {
      title: 'How to request a refund',
      items: [
        { lead: 'Send your request', detail: 'Email support@open-design.ai.' },
        { lead: 'Include', detail: 'Your OpenDesign account email, order or payment transaction number, and the reason for the request.' },
      ],
    },
    {
      title: 'Processing time',
      items: [
        { lead: 'Usage verification', detail: 'Eligibility and consumption are determined from OpenDesign backend records.' },
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
};

const ZH: RefundPolicyContent = {
  metaTitle: '退款政策 — OpenDesign',
  metaDescription: '了解 OpenDesign 的退款条件、申请方式和处理时间。',
  title: '退款政策',
  updatedLabel: '最后更新',
  updated: '2026 年 8 月 27 日',
  intro: '以下规则适用于通过 OpenDesign 官网直接购买的个人订阅订单。',
  sections: [
    {
      title: '月度及年度订阅订单',
      items: [{
        lead: '付款成功后 7 个自然日内',
        detail: '若本笔订单包含的付费权益尚未使用，可申请全额退款；一旦使用，则不支持退款。',
      }],
    },
    {
      title: '如何申请退款',
      items: [
        { lead: '发送申请', detail: '发送邮件至 support@open-design.ai。' },
        { lead: '提供信息', detail: 'OpenDesign 账号邮箱、订单号或支付交易号，以及申请退款的原因。' },
      ],
    },
    {
      title: '退款处理时间',
      items: [
        { lead: '用量核验', detail: '退款资格和实际消耗量以 OpenDesign 后台记录为准。' },
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
};

const CONTENT: Partial<Record<LandingLocaleCode, RefundPolicyContent>> = { en: EN, zh: ZH };

export function getRefundPolicyContent(locale: LandingLocaleCode): RefundPolicyContent {
  return CONTENT[locale] ?? EN;
}
