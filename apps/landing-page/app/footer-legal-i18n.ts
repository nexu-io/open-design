// Localized labels for the footer's Company / legal column, shared by the
// sub-page footer (site-footer.astro) and the homepage footer (page.tsx).
//
// These used to live in a small inline map that only covered en/zh/zh-tw, so
// every other locale silently fell back to English in the Company column.
// This module carries all landing locales; getFooterLegalCopy() falls back to
// English for any code not present.
import type { LandingLocaleCode } from './i18n';

export interface FooterLegalCopy {
  company: string;
  about: string;
  careers: string;
  faq: string;
  privacy: string;
  terms: string;
  allAgents: string;
  allSolutions: string;
}

const EN: FooterLegalCopy = {
  company: 'Company',
  about: 'About',
  careers: 'Careers',
  faq: 'FAQ',
  privacy: 'Privacy Policy',
  terms: 'Terms',
  allAgents: 'All agents',
  allSolutions: 'All use cases',
};

const FOOTER_LEGAL_COPY = {
  en: EN,
  zh: { company: '公司', about: '关于', careers: '招聘', faq: '常见问题', privacy: '隐私政策', terms: '服务条款', allAgents: '全部 Agent', allSolutions: '全部场景' },
  'zh-tw': { company: '公司', about: '關於', careers: '招聘', faq: '常見問題', privacy: '隱私政策', terms: '服務條款', allAgents: '全部 Agent', allSolutions: '全部場景' },
  ja: { company: '会社情報', about: '概要', careers: '採用情報', faq: 'よくある質問', privacy: 'プライバシーポリシー', terms: '利用規約', allAgents: 'すべてのエージェント', allSolutions: 'すべてのユースケース' },
  ko: { company: '회사', about: '소개', careers: '채용', faq: '자주 묻는 질문', privacy: '개인정보 처리방침', terms: '이용약관', allAgents: '모든 에이전트', allSolutions: '모든 사용 사례' },
  de: { company: 'Unternehmen', about: 'Über uns', careers: 'Karriere', faq: 'FAQ', privacy: 'Datenschutz', terms: 'Nutzungsbedingungen', allAgents: 'Alle Agents', allSolutions: 'Alle Anwendungsfälle' },
  fr: { company: 'Entreprise', about: 'À propos', careers: 'Carrières', faq: 'FAQ', privacy: 'Confidentialité', terms: 'Conditions', allAgents: 'Tous les agents', allSolutions: 'Tous les cas d’usage' },
  ru: { company: 'Компания', about: 'О нас', careers: 'Вакансии', faq: 'Частые вопросы', privacy: 'Конфиденциальность', terms: 'Условия', allAgents: 'Все агенты', allSolutions: 'Все сценарии' },
  es: { company: 'Empresa', about: 'Acerca de', careers: 'Empleo', faq: 'Preguntas frecuentes', privacy: 'Privacidad', terms: 'Términos', allAgents: 'Todos los agentes', allSolutions: 'Todos los casos de uso' },
  'pt-br': { company: 'Empresa', about: 'Sobre', careers: 'Carreiras', faq: 'Perguntas frequentes', privacy: 'Privacidade', terms: 'Termos', allAgents: 'Todos os agentes', allSolutions: 'Todos os casos de uso' },
  it: { company: 'Azienda', about: 'Chi siamo', careers: 'Lavora con noi', faq: 'FAQ', privacy: 'Privacy', terms: 'Termini', allAgents: 'Tutti gli agenti', allSolutions: 'Tutti i casi d’uso' },
  vi: { company: 'Công ty', about: 'Giới thiệu', careers: 'Tuyển dụng', faq: 'Câu hỏi thường gặp', privacy: 'Quyền riêng tư', terms: 'Điều khoản', allAgents: 'Tất cả agent', allSolutions: 'Tất cả trường hợp dùng' },
  pl: { company: 'Firma', about: 'O nas', careers: 'Kariera', faq: 'FAQ', privacy: 'Prywatność', terms: 'Regulamin', allAgents: 'Wszystkie agenty', allSolutions: 'Wszystkie zastosowania' },
  id: { company: 'Perusahaan', about: 'Tentang', careers: 'Karier', faq: 'FAQ', privacy: 'Privasi', terms: 'Ketentuan', allAgents: 'Semua agent', allSolutions: 'Semua kasus penggunaan' },
  nl: { company: 'Bedrijf', about: 'Over ons', careers: 'Vacatures', faq: 'FAQ', privacy: 'Privacy', terms: 'Voorwaarden', allAgents: 'Alle agents', allSolutions: 'Alle toepassingen' },
  ar: { company: 'الشركة', about: 'من نحن', careers: 'الوظائف', faq: 'الأسئلة الشائعة', privacy: 'سياسة الخصوصية', terms: 'الشروط', allAgents: 'كل الوكلاء', allSolutions: 'كل حالات الاستخدام' },
  tr: { company: 'Şirket', about: 'Hakkımızda', careers: 'Kariyer', faq: 'SSS', privacy: 'Gizlilik', terms: 'Şartlar', allAgents: 'Tüm agent’lar', allSolutions: 'Tüm kullanım senaryoları' },
  uk: { company: 'Компанія', about: 'Про нас', careers: 'Кар’єра', faq: 'Часті запитання', privacy: 'Конфіденційність', terms: 'Умови', allAgents: 'Усі агенти', allSolutions: 'Усі сценарії' },
} satisfies Record<LandingLocaleCode, FooterLegalCopy>;

export function getFooterLegalCopy(locale: string): FooterLegalCopy {
  return (FOOTER_LEGAL_COPY as Record<string, FooterLegalCopy>)[locale] ?? EN;
}
