import type { Locale } from '../../i18n/types';

interface HomePresetCopy {
  title: string;
  prompt: string;
}

// Home recommendations describe the user's intended result. Template details
// keep their original names and technical descriptions from the manifest.
// Every curated preset must provide copy for all supported UI locales.
const HOME_PRESET_COPY: Record<string, Record<Locale, HomePresetCopy>> = {
  'example-pm-spec': {
    'zh-CN': {
      title: '产品规格文档',
      prompt: '为一款帮助远程团队安排跨时区会议的工具撰写产品规格文档，包含用户需求、核心功能、使用流程和验收标准。',
    },
    'zh-TW': {
      title: '產品規格文件',
      prompt: '為一款協助遠端團隊安排跨時區會議的工具撰寫產品規格文件，包含使用者需求、核心功能、使用流程和驗收標準。',
    },
    en: {
      title: 'Product Specification',
      prompt: 'Write a product specification for a tool that helps remote teams schedule meetings across time zones, covering user needs, core features, user flows, and acceptance criteria.',
    },
    id: {
      title: 'Spesifikasi Produk',
      prompt: 'Tulis spesifikasi produk untuk alat yang membantu tim jarak jauh menjadwalkan rapat lintas zona waktu, mencakup kebutuhan pengguna, fitur utama, alur penggunaan, dan kriteria penerimaan.',
    },
    de: {
      title: 'Produktspezifikation',
      prompt: 'Schreibe eine Produktspezifikation für ein Tool, mit dem verteilte Teams Besprechungen über Zeitzonen hinweg planen. Beschreibe Nutzerbedürfnisse, Kernfunktionen, Nutzungsabläufe und Abnahmekriterien.',
    },
    'pt-BR': {
      title: 'Especificação de produto',
      prompt: 'Escreva uma especificação de produto para uma ferramenta que ajuda equipes remotas a agendar reuniões entre fusos horários, incluindo necessidades dos usuários, recursos principais, fluxos de uso e critérios de aceitação.',
    },
    'es-ES': {
      title: 'Especificación de producto',
      prompt: 'Redacta una especificación de producto para una herramienta que ayude a equipos remotos a programar reuniones entre zonas horarias, con necesidades de los usuarios, funciones principales, flujos de uso y criterios de aceptación.',
    },
    ru: {
      title: 'Спецификация продукта',
      prompt: 'Напиши спецификацию инструмента, который помогает удалённым командам планировать встречи в разных часовых поясах. Опиши потребности пользователей, основные функции, сценарии использования и критерии приёмки.',
    },
    fa: {
      title: 'سند مشخصات محصول',
      prompt: 'برای ابزاری که به تیم‌های دورکار در زمان‌بندی جلسه میان منطقه‌های زمانی مختلف کمک می‌کند، سند مشخصات محصول بنویس. نیازهای کاربران، قابلیت‌های اصلی، مسیرهای استفاده و معیارهای پذیرش را پوشش بده.',
    },
    ar: {
      title: 'مواصفات المنتج',
      prompt: 'اكتب وثيقة مواصفات لأداة تساعد الفرق التي تعمل عن بُعد على جدولة اجتماعات عبر مناطق زمنية مختلفة، مع احتياجات المستخدمين والميزات الأساسية ومسارات الاستخدام ومعايير القبول.',
    },
    ja: {
      title: '製品仕様書',
      prompt: '離れたタイムゾーンで働くリモートチームの会議調整ツールについて、製品仕様書を作成してください。ユーザーニーズ、主要機能、利用フロー、受け入れ基準を含めてください。',
    },
    ko: {
      title: '제품 사양서',
      prompt: '여러 시간대의 원격 팀이 회의 일정을 잡도록 돕는 도구의 제품 사양서를 작성해 주세요. 사용자 요구, 핵심 기능, 사용 흐름, 인수 기준을 포함해 주세요.',
    },
    pl: {
      title: 'Specyfikacja produktu',
      prompt: 'Napisz specyfikację narzędzia pomagającego zdalnym zespołom planować spotkania w różnych strefach czasowych. Uwzględnij potrzeby użytkowników, główne funkcje, przebieg korzystania i kryteria akceptacji.',
    },
    hu: {
      title: 'Termékspecifikáció',
      prompt: 'Írj termékspecifikációt egy eszközhöz, amely különböző időzónákban dolgozó távoli csapatoknak segít megbeszéléseket ütemezni. Térj ki a felhasználói igényekre, fő funkciókra, használati folyamatokra és elfogadási feltételekre.',
    },
    fr: {
      title: 'Spécification produit',
      prompt: 'Rédige une spécification produit pour un outil qui aide les équipes à distance à planifier des réunions entre fuseaux horaires. Présente les besoins des utilisateurs, les fonctions essentielles, les parcours et les critères d’acceptation.',
    },
    uk: {
      title: 'Специфікація продукту',
      prompt: 'Напиши специфікацію інструмента, що допомагає віддаленим командам планувати зустрічі в різних часових поясах. Опиши потреби користувачів, основні функції, сценарії використання та критерії приймання.',
    },
    tr: {
      title: 'Ürün Şartnamesi',
      prompt: 'Uzak ekiplerin farklı saat dilimlerinde toplantı planlamasını sağlayan bir araç için ürün şartnamesi yaz. Kullanıcı ihtiyaçlarını, temel özellikleri, kullanım akışlarını ve kabul kriterlerini dahil et.',
    },
    th: {
      title: 'เอกสารข้อกำหนดผลิตภัณฑ์',
      prompt: 'เขียนเอกสารข้อกำหนดผลิตภัณฑ์สำหรับเครื่องมือที่ช่วยทีมทำงานทางไกลนัดประชุมข้ามเขตเวลา โดยระบุความต้องการของผู้ใช้ ฟีเจอร์หลัก ขั้นตอนการใช้งาน และเกณฑ์การยอมรับ',
    },
    it: {
      title: 'Specifica di prodotto',
      prompt: 'Scrivi una specifica di prodotto per uno strumento che aiuti i team remoti a pianificare riunioni tra fusi orari, includendo esigenze degli utenti, funzioni principali, flussi d’uso e criteri di accettazione.',
    },
  },
  'example-finance-report': {
    'zh-CN': {
      title: '财务报告',
      prompt: '制作一家虚构咖啡品牌的季度财务报告，用合理的示例数据展示收入、成本、利润和现金流，并分析经营表现。注明数据仅供示例。',
    },
    'zh-TW': {
      title: '財務報告',
      prompt: '製作一家虛構咖啡品牌的季度財務報告，用合理的範例數據呈現收入、成本、利潤和現金流，並分析經營表現。註明數據僅供示例。',
    },
    en: {
      title: 'Financial Report',
      prompt: 'Create a quarterly financial report for a fictional coffee brand, using plausible sample data to show revenue, costs, profit, and cash flow and analyze business performance. Label the data as illustrative.',
    },
    id: {
      title: 'Laporan Keuangan',
      prompt: 'Buat laporan keuangan triwulanan untuk merek kopi fiktif. Gunakan data contoh yang masuk akal untuk menunjukkan pendapatan, biaya, laba, dan arus kas serta menganalisis kinerja usaha. Tandai data sebagai ilustrasi.',
    },
    de: {
      title: 'Finanzbericht',
      prompt: 'Erstelle einen Quartalsfinanzbericht für eine fiktive Kaffeemarke. Zeige Umsatz, Kosten, Gewinn und Cashflow anhand plausibler Beispieldaten und analysiere die Geschäftsentwicklung. Kennzeichne die Daten als Beispiel.',
    },
    'pt-BR': {
      title: 'Relatório financeiro',
      prompt: 'Crie um relatório financeiro trimestral para uma marca de café fictícia, usando dados de exemplo plausíveis para mostrar receita, custos, lucro e fluxo de caixa e analisar o desempenho do negócio. Identifique os dados como ilustrativos.',
    },
    'es-ES': {
      title: 'Informe financiero',
      prompt: 'Crea un informe financiero trimestral de una marca de café ficticia. Utiliza datos de ejemplo plausibles para mostrar ingresos, costes, beneficios y flujo de caja, y analizar el rendimiento del negocio. Indica que los datos son ilustrativos.',
    },
    ru: {
      title: 'Финансовый отчёт',
      prompt: 'Создай квартальный финансовый отчёт вымышленного кофейного бренда. На правдоподобных демонстрационных данных покажи выручку, расходы, прибыль и денежный поток, проанализируй результаты бизнеса. Отметь, что данные приведены для примера.',
    },
    fa: {
      title: 'گزارش مالی',
      prompt: 'برای یک برند خیالی قهوه، گزارش مالی سه‌ماهه تهیه کن. با داده‌های نمونه و معقول، درآمد، هزینه، سود و جریان نقدی را نشان بده و عملکرد کسب‌وکار را تحلیل کن. مشخص کن که داده‌ها صرفاً نمونه هستند.',
    },
    ar: {
      title: 'تقرير مالي',
      prompt: 'أنشئ تقريراً مالياً ربع سنوي لعلامة قهوة خيالية. استخدم بيانات توضيحية معقولة لعرض الإيرادات والتكاليف والأرباح والتدفقات النقدية وتحليل أداء النشاط. وضّح أن البيانات مخصصة للمثال.',
    },
    ja: {
      title: '財務レポート',
      prompt: '架空のコーヒーブランドの四半期財務レポートを作成してください。妥当なサンプルデータで売上、費用、利益、キャッシュフローを示し、業績を分析してください。データが例示用であることを明記してください。',
    },
    ko: {
      title: '재무 보고서',
      prompt: '가상의 커피 브랜드를 위한 분기 재무 보고서를 만들어 주세요. 타당한 예시 데이터로 매출, 비용, 이익, 현금 흐름을 보여 주고 경영 성과를 분석해 주세요. 예시 데이터임을 명시해 주세요.',
    },
    pl: {
      title: 'Raport finansowy',
      prompt: 'Przygotuj kwartalny raport finansowy fikcyjnej marki kawy. Użyj wiarygodnych danych przykładowych, aby przedstawić przychody, koszty, zysk i przepływy pieniężne oraz przeanalizować wyniki firmy. Oznacz dane jako ilustracyjne.',
    },
    hu: {
      title: 'Pénzügyi jelentés',
      prompt: 'Készíts negyedéves pénzügyi jelentést egy kitalált kávémárkának. Életszerű mintaadatokkal mutasd be a bevételt, költségeket, nyereséget és pénzforgalmat, és elemezd az üzleti teljesítményt. Jelezd, hogy az adatok szemléltető jellegűek.',
    },
    fr: {
      title: 'Rapport financier',
      prompt: 'Crée un rapport financier trimestriel pour une marque de café fictive. Utilise des données d’exemple plausibles pour présenter les revenus, les coûts, les bénéfices et la trésorerie, et analyser les performances. Indique que les données sont illustratives.',
    },
    uk: {
      title: 'Фінансовий звіт',
      prompt: 'Створи квартальний фінансовий звіт вигаданого кавового бренду. На правдоподібних демонстраційних даних покажи виручку, витрати, прибуток і грошовий потік та проаналізуй результати бізнесу. Зазнач, що дані наведено для прикладу.',
    },
    tr: {
      title: 'Finansal Rapor',
      prompt: 'Hayali bir kahve markası için üç aylık finansal rapor oluştur. Makul örnek verilerle gelir, maliyet, kâr ve nakit akışını göster ve işletme performansını analiz et. Verilerin örnek amaçlı olduğunu belirt.',
    },
    th: {
      title: 'รายงานการเงิน',
      prompt: 'สร้างรายงานการเงินรายไตรมาสของแบรนด์กาแฟสมมติ ใช้ข้อมูลตัวอย่างที่สมเหตุสมผลแสดงรายได้ ต้นทุน กำไร และกระแสเงินสด พร้อมวิเคราะห์ผลการดำเนินงาน ระบุว่าข้อมูลใช้เพื่อเป็นตัวอย่าง',
    },
    it: {
      title: 'Report finanziario',
      prompt: 'Crea un report finanziario trimestrale per un marchio di caffè immaginario. Usa dati di esempio plausibili per illustrare ricavi, costi, utili e flussi di cassa e analizzare l’andamento dell’attività. Indica che i dati sono illustrativi.',
    },
  },
  'example-clinical-case-report': {
    'zh-CN': {
      title: '临床病例报告',
      prompt: '编写一份用于教学的虚构社区获得性肺炎病例报告，包含主诉、病史、检查结果、诊断依据、诊疗经过和随访情况。注明为虚构教学病例。',
    },
    'zh-TW': {
      title: '臨床病例報告',
      prompt: '編寫一份用於教學的虛構社區型肺炎病例報告，包含主訴、病史、檢查結果、診斷依據、診療經過和追蹤情況。註明為虛構教學病例。',
    },
    en: {
      title: 'Clinical Case Report',
      prompt: 'Write a fictional case report about community-acquired pneumonia for teaching, including the chief complaint, medical history, examination findings, diagnostic reasoning, clinical course, and follow-up. Label it as a fictional teaching case.',
    },
    id: {
      title: 'Laporan Kasus Klinis',
      prompt: 'Tulis laporan kasus pneumonia komunitas fiktif untuk pembelajaran, mencakup keluhan utama, riwayat medis, hasil pemeriksaan, dasar diagnosis, perjalanan perawatan, dan tindak lanjut. Tandai sebagai kasus pembelajaran fiktif.',
    },
    de: {
      title: 'Klinischer Fallbericht',
      prompt: 'Schreibe einen fiktiven Fallbericht über eine ambulant erworbene Pneumonie für Lehrzwecke. Beschreibe Leitsymptom, Anamnese, Untersuchungsbefunde, diagnostische Begründung, Behandlungsverlauf und Nachsorge. Kennzeichne ihn als fiktiven Lehrfall.',
    },
    'pt-BR': {
      title: 'Relato de caso clínico',
      prompt: 'Escreva um relato fictício de pneumonia adquirida na comunidade para fins didáticos, incluindo queixa principal, histórico clínico, achados dos exames, justificativa diagnóstica, evolução clínica e acompanhamento. Identifique-o como caso didático fictício.',
    },
    'es-ES': {
      title: 'Informe de caso clínico',
      prompt: 'Redacta un caso ficticio de neumonía adquirida en la comunidad con fines docentes. Incluye motivo de consulta, antecedentes, resultados de las exploraciones, razonamiento diagnóstico, evolución clínica y seguimiento. Identifícalo como caso docente ficticio.',
    },
    ru: {
      title: 'Клинический случай',
      prompt: 'Напиши вымышленный учебный отчёт о случае внебольничной пневмонии. Включи жалобы, анамнез, результаты обследований, обоснование диагноза, ход лечения и последующее наблюдение. Отметь, что это вымышленный учебный случай.',
    },
    fa: {
      title: 'گزارش مورد بالینی',
      prompt: 'یک گزارش آموزشی درباره موردی خیالی از پنومونی اکتسابی از جامعه بنویس. شکایت اصلی، سابقه پزشکی، یافته‌های معاینه و آزمایش، استدلال تشخیصی، روند درمان و پیگیری را بیاور. مشخص کن که این یک مورد آموزشی خیالی است.',
    },
    ar: {
      title: 'تقرير حالة سريرية',
      prompt: 'اكتب تقريراً تعليمياً عن حالة خيالية لالتهاب رئوي مكتسب من المجتمع. ضمّن الشكوى الرئيسية والتاريخ المرضي ونتائج الفحوص ومبررات التشخيص ومسار العلاج والمتابعة. وضّح أنها حالة تعليمية خيالية.',
    },
    ja: {
      title: '臨床症例報告',
      prompt: '教育用の架空の市中肺炎症例報告を作成してください。主訴、病歴、検査所見、診断根拠、診療経過、フォローアップを含め、架空の教育症例であることを明記してください。',
    },
    ko: {
      title: '임상 증례 보고서',
      prompt: '교육용으로 가상의 지역사회획득 폐렴 증례 보고서를 작성해 주세요. 주호소, 병력, 검사 소견, 진단 근거, 진료 경과, 추적 관찰을 포함하고 가상의 교육용 증례임을 명시해 주세요.',
    },
    pl: {
      title: 'Opis przypadku klinicznego',
      prompt: 'Napisz fikcyjny opis przypadku pozaszpitalnego zapalenia płuc do celów dydaktycznych. Uwzględnij główne dolegliwości, wywiad, wyniki badań, uzasadnienie rozpoznania, przebieg leczenia i dalszą obserwację. Oznacz go jako fikcyjny przypadek dydaktyczny.',
    },
    hu: {
      title: 'Klinikai esetismertetés',
      prompt: 'Írj kitalált, oktatási célú esetismertetést közösségben szerzett tüdőgyulladásról. Tartalmazza a fő panaszt, kórelőzményt, vizsgálati eredményeket, a diagnózis indoklását, a kezelés menetét és az utánkövetést. Jelöld kitalált oktatási esetként.',
    },
    fr: {
      title: 'Rapport de cas clinique',
      prompt: 'Rédige un cas fictif de pneumonie communautaire à des fins pédagogiques, avec le motif de consultation, les antécédents, les résultats des examens, le raisonnement diagnostique, l’évolution clinique et le suivi. Identifie-le comme cas pédagogique fictif.',
    },
    uk: {
      title: 'Клінічний випадок',
      prompt: 'Напиши вигаданий навчальний звіт про випадок негоспітальної пневмонії. Додай скарги, анамнез, результати обстежень, обґрунтування діагнозу, перебіг лікування та подальше спостереження. Познач його як вигаданий навчальний випадок.',
    },
    tr: {
      title: 'Klinik Olgu Raporu',
      prompt: 'Eğitim amacıyla toplum kökenli pnömoni hakkında hayali bir olgu raporu yaz. Başlıca şikâyet, tıbbi öykü, muayene ve tetkik bulguları, tanısal gerekçe, klinik seyir ve takibi dahil et. Bunun hayali bir eğitim olgusu olduğunu belirt.',
    },
    th: {
      title: 'รายงานกรณีศึกษาทางคลินิก',
      prompt: 'เขียนรายงานผู้ป่วยปอดอักเสบที่เกิดในชุมชนแบบสมมติเพื่อการเรียนการสอน โดยมีอาการสำคัญ ประวัติ ผลตรวจ เหตุผลในการวินิจฉัย ลำดับการรักษา และการติดตามผล ระบุว่าเป็นกรณีสมมติเพื่อการศึกษา',
    },
    it: {
      title: 'Caso clinico',
      prompt: 'Scrivi un caso clinico immaginario di polmonite acquisita in comunità a scopo didattico. Includi motivo della visita, anamnesi, risultati degli esami, ragionamento diagnostico, decorso clinico e controlli successivi. Indica che si tratta di un caso didattico immaginario.',
    },
  },
  'example-resume-modern': {
    'zh-CN': {
      title: '极简简历',
      prompt: '为一位有三年工作经验的虚构产品设计师制作一页式极简简历，包含个人简介、专业技能、工作经历和代表项目。使用完整的虚构信息，并注明为示例简历。',
    },
    'zh-TW': {
      title: '極簡履歷',
      prompt: '為一位有三年工作經驗的虛構產品設計師製作一頁式極簡履歷，包含個人簡介、專業技能、工作經歷和代表專案。使用完整的虛構資訊，並註明為範例履歷。',
    },
    en: {
      title: 'Minimal Resume',
      prompt: 'Create a minimal one-page resume for a fictional product designer with three years of experience, including a profile, skills, work history, and selected projects. Fill in all details with fictional information and label it as a sample resume.',
    },
    id: {
      title: 'CV Minimalis',
      prompt: 'Buat CV minimalis satu halaman untuk desainer produk fiktif dengan pengalaman tiga tahun, mencakup profil, keterampilan, pengalaman kerja, dan proyek pilihan. Isi semua detail dengan informasi fiktif dan tandai sebagai contoh CV.',
    },
    de: {
      title: 'Minimalistischer Lebenslauf',
      prompt: 'Erstelle einen minimalistischen, einseitigen Lebenslauf für eine fiktive Person im Produktdesign mit drei Jahren Berufserfahrung. Fülle Profil, Fähigkeiten, Berufserfahrung und ausgewählte Projekte vollständig mit fiktiven Angaben aus und kennzeichne den Lebenslauf als Muster.',
    },
    'pt-BR': {
      title: 'Currículo minimalista',
      prompt: 'Crie um currículo minimalista de uma página para uma pessoa fictícia que atua em design de produto há três anos, incluindo perfil, habilidades, experiência profissional e projetos selecionados. Preencha todos os detalhes com informações fictícias e identifique-o como exemplo de currículo.',
    },
    'es-ES': {
      title: 'Currículum minimalista',
      prompt: 'Crea un currículum minimalista de una página para una persona ficticia dedicada al diseño de producto con tres años de experiencia. Incluye perfil, habilidades, experiencia laboral y proyectos destacados. Completa todos los datos con información ficticia e identifícalo como currículum de ejemplo.',
    },
    ru: {
      title: 'Минималистичное резюме',
      prompt: 'Создай минималистичное резюме на одну страницу для вымышленного продуктового дизайнера с трёхлетним опытом. Включи сведения о специалисте, навыки, опыт работы и избранные проекты. Заполни все поля вымышленными данными и обозначь документ как пример резюме.',
    },
    fa: {
      title: 'رزومه مینیمال',
      prompt: 'برای یک طراح محصول خیالی با سه سال سابقه، رزومه‌ای مینیمال و یک‌صفحه‌ای تهیه کن. معرفی، مهارت‌ها، سوابق کاری و پروژه‌های منتخب را بگنجان. همه جزئیات را با اطلاعات خیالی تکمیل کن و آن را به‌عنوان رزومه نمونه مشخص کن.',
    },
    ar: {
      title: 'سيرة ذاتية بسيطة',
      prompt: 'أنشئ سيرة ذاتية بسيطة من صفحة واحدة لمصمم منتجات خيالي لديه خبرة ثلاث سنوات. ضمّن نبذة شخصية ومهارات وخبرات عملية ومشاريع مختارة. املأ جميع التفاصيل بمعلومات خيالية ووضّح أنها سيرة ذاتية نموذجية.',
    },
    ja: {
      title: 'ミニマルな職務経歴書',
      prompt: '実務経験3年の架空のプロダクトデザイナーについて、1ページのミニマルな職務経歴書を作成してください。自己紹介、スキル、職歴、代表的なプロジェクトを架空の情報ですべて埋め、記入例であることを明記してください。',
    },
    ko: {
      title: '미니멀 이력서',
      prompt: '경력 3년인 가상의 프로덕트 디자이너를 위한 한 페이지 미니멀 이력서를 만들어 주세요. 자기소개, 기술, 경력, 대표 프로젝트를 포함하고 모든 항목을 가상의 정보로 채운 뒤 예시 이력서임을 명시해 주세요.',
    },
    pl: {
      title: 'Minimalistyczne CV',
      prompt: 'Stwórz minimalistyczne, jednostronicowe CV fikcyjnej osoby zajmującej się projektowaniem produktów z trzyletnim doświadczeniem. Uwzględnij profil, umiejętności, doświadczenie zawodowe i wybrane projekty. Uzupełnij wszystkie szczegóły fikcyjnymi danymi i oznacz dokument jako przykładowe CV.',
    },
    hu: {
      title: 'Minimalista önéletrajz',
      prompt: 'Készíts egyoldalas, minimalista önéletrajzot egy kitalált, hároméves tapasztalattal rendelkező terméktervezőnek. Tartalmazzon bemutatkozást, készségeket, munkatapasztalatot és válogatott projekteket. Minden részletet tölts ki kitalált adatokkal, és jelöld mintaönéletrajzként.',
    },
    fr: {
      title: 'CV minimaliste',
      prompt: 'Crée un CV minimaliste d’une page pour une personne fictive exerçant le design produit depuis trois ans. Inclus le profil, les compétences, l’expérience et une sélection de projets. Renseigne tous les détails avec des informations fictives et indique qu’il s’agit d’un exemple de CV.',
    },
    uk: {
      title: 'Мінімалістичне резюме',
      prompt: 'Створи мінімалістичне резюме на одну сторінку для вигаданого продуктового дизайнера з трирічним досвідом. Додай профіль, навички, досвід роботи та вибрані проєкти. Заповни всі відомості вигаданими даними й познач документ як приклад резюме.',
    },
    tr: {
      title: 'Minimal Özgeçmiş',
      prompt: 'Üç yıllık deneyime sahip hayali bir ürün tasarımcısı için tek sayfalık minimal özgeçmiş oluştur. Profil, beceriler, iş deneyimi ve seçilmiş projeleri dahil et. Tüm ayrıntıları hayali bilgilerle doldur ve örnek özgeçmiş olduğunu belirt.',
    },
    th: {
      title: 'เรซูเม่มินิมอล',
      prompt: 'สร้างเรซูเม่มินิมอลหนึ่งหน้าสำหรับนักออกแบบผลิตภัณฑ์สมมติที่มีประสบการณ์สามปี โดยมีประวัติย่อ ทักษะ ประสบการณ์ทำงาน และผลงานเด่น กรอกข้อมูลสมมติให้ครบและระบุว่าเป็นเรซูเม่ตัวอย่าง',
    },
    it: {
      title: 'Curriculum minimalista',
      prompt: 'Crea un curriculum minimalista di una pagina per una persona immaginaria con tre anni di esperienza nel design di prodotto. Includi profilo, competenze, esperienze lavorative e progetti selezionati. Completa tutti i dettagli con informazioni inventate e indicalo come curriculum di esempio.',
    },
  },
  'example-invoice': {
    'zh-CN': {
      title: '发票',
      prompt: '为一家虚构设计工作室制作品牌设计服务发票，填入完整的示例客户信息、服务项目、费用明细和付款说明。注明为示例发票。',
    },
    'zh-TW': {
      title: '發票',
      prompt: '為一家虛構設計工作室製作品牌設計服務發票，填入完整的範例客戶資訊、服務項目、費用明細和付款說明。註明為範例發票。',
    },
    en: {
      title: 'Invoice',
      prompt: 'Create an invoice for branding services from a fictional design studio, filling in complete sample client details, services, itemized fees, and payment instructions. Label it as a sample invoice.',
    },
    id: {
      title: 'Faktur',
      prompt: 'Buat faktur layanan desain merek dari studio desain fiktif, lengkap dengan contoh informasi klien, layanan, rincian biaya, dan petunjuk pembayaran. Tandai sebagai contoh faktur.',
    },
    de: {
      title: 'Rechnung',
      prompt: 'Erstelle eine Rechnung für Branding-Leistungen eines fiktiven Designstudios. Fülle Kundenangaben, Leistungen, Einzelpreise und Zahlungsinformationen mit vollständigen Beispieldaten aus. Kennzeichne sie als Musterrechnung.',
    },
    'pt-BR': {
      title: 'Fatura',
      prompt: 'Crie uma fatura de serviços de identidade de marca de um estúdio de design fictício, preenchendo dados completos de exemplo do cliente, serviços, valores discriminados e instruções de pagamento. Identifique-a como fatura de exemplo.',
    },
    'es-ES': {
      title: 'Factura',
      prompt: 'Crea una factura de servicios de diseño de marca de un estudio ficticio, con datos completos de ejemplo del cliente, servicios, importes desglosados e instrucciones de pago. Identifícala como factura de ejemplo.',
    },
    ru: {
      title: 'Счёт на оплату',
      prompt: 'Создай счёт за услуги по разработке фирменного стиля от вымышленной дизайн-студии. Укажи полные примерные данные клиента, услуги, детализацию стоимости и порядок оплаты. Обозначь документ как образец счёта.',
    },
    fa: {
      title: 'فاکتور',
      prompt: 'برای خدمات طراحی هویت برند یک استودیوی طراحی خیالی، فاکتور تهیه کن. اطلاعات نمونه مشتری، خدمات، ریز هزینه‌ها و راهنمای پرداخت را کامل بنویس. مشخص کن که فاکتور نمونه است.',
    },
    ar: {
      title: 'فاتورة',
      prompt: 'أنشئ فاتورة لخدمات تصميم هوية علامة تجارية من استوديو تصميم خيالي. املأ بيانات العميل والخدمات وتفاصيل الرسوم وتعليمات الدفع بمعلومات نموذجية كاملة. وضّح أنها فاتورة نموذجية.',
    },
    ja: {
      title: '請求書',
      prompt: '架空のデザインスタジオのブランドデザイン業務について、請求書を作成してください。顧客情報、業務内容、金額の内訳、支払い案内をサンプル情報ですべて記入し、請求書の記入例であることを明記してください。',
    },
    ko: {
      title: '청구서',
      prompt: '가상의 디자인 스튜디오가 제공한 브랜드 디자인 서비스의 청구서를 만들어 주세요. 고객 정보, 서비스 항목, 세부 비용, 결제 안내를 완전한 예시 정보로 채우고 예시 청구서임을 명시해 주세요.',
    },
    pl: {
      title: 'Faktura',
      prompt: 'Stwórz fakturę za projekt identyfikacji marki wystawioną przez fikcyjne studio projektowe. Wypełnij komplet przykładowych danych klienta, usług, szczegółowych kosztów i instrukcji płatności. Oznacz ją jako fakturę przykładową.',
    },
    hu: {
      title: 'Számla',
      prompt: 'Készíts számlát egy kitalált designstúdió arculattervezési szolgáltatásairól. Töltsd ki teljes mintaadatokkal az ügyfél adatait, a szolgáltatásokat, a tételes díjakat és a fizetési tudnivalókat. Jelöld mintaszámlaként.',
    },
    fr: {
      title: 'Facture',
      prompt: 'Crée une facture de prestations d’identité de marque pour un studio de design fictif, avec des coordonnées client complètes d’exemple, les prestations, les montants détaillés et les modalités de paiement. Indique qu’il s’agit d’une facture d’exemple.',
    },
    uk: {
      title: 'Рахунок на оплату',
      prompt: 'Створи рахунок за послуги з розробки айдентики від вигаданої дизайн-студії. Додай повні приклади даних клієнта, перелік послуг, деталізацію вартості та порядок оплати. Познач документ як зразок рахунку.',
    },
    tr: {
      title: 'Fatura',
      prompt: 'Hayali bir tasarım stüdyosunun marka tasarımı hizmetleri için fatura oluştur. Örnek müşteri bilgilerini, hizmetleri, ücret dökümünü ve ödeme talimatlarını eksiksiz doldur. Örnek fatura olduğunu belirt.',
    },
    th: {
      title: 'ใบแจ้งหนี้',
      prompt: 'สร้างใบแจ้งหนี้ค่าบริการออกแบบแบรนด์ของสตูดิโอออกแบบสมมติ กรอกข้อมูลลูกค้าตัวอย่าง รายการบริการ ค่าใช้จ่ายแยกรายการ และคำแนะนำการชำระเงินให้ครบ ระบุว่าเป็นใบแจ้งหนี้ตัวอย่าง',
    },
    it: {
      title: 'Fattura',
      prompt: 'Crea una fattura per servizi di identità di marca di uno studio di design immaginario, compilando dati completi di esempio del cliente, servizi, importi dettagliati e istruzioni di pagamento. Indicala come fattura di esempio.',
    },
  },
  'image-template-vr-headset-exploded-view-poster': {
    'zh-CN': {
      title: 'VR 头显拆解海报',
      prompt: '为一款名为 NOVA VR 的概念头显制作拆解海报，用悬浮分层展示外壳、镜片、显示屏和传感器，并配上组件标注与简短的产品文案。',
    },
    'zh-TW': {
      title: 'VR 頭戴裝置拆解海報',
      prompt: '為一款名為 NOVA VR 的概念頭戴裝置製作拆解海報，用懸浮分層呈現外殼、鏡片、顯示螢幕和感測器，並配上組件標註與簡短的產品文案。',
    },
    en: {
      title: 'VR Headset Exploded View Poster',
      prompt: 'Create an exploded-view poster for a concept headset called NOVA VR, showing the shell, lenses, displays, and sensors in floating layers with component labels and short product copy.',
    },
    id: {
      title: 'Poster Komponen Headset VR',
      prompt: 'Buat poster tampilan terurai untuk konsep headset NOVA VR, menampilkan cangkang, lensa, layar, dan sensor dalam lapisan melayang, dengan label komponen dan teks produk singkat.',
    },
    de: {
      title: 'VR-Headset als Explosionszeichnung',
      prompt: 'Erstelle ein Poster mit einer Explosionszeichnung des Konzept-Headsets NOVA VR. Zeige Gehäuse, Linsen, Displays und Sensoren in schwebenden Ebenen mit Bauteilbeschriftungen und kurzen Produkttexten.',
    },
    'pt-BR': {
      title: 'Pôster de headset VR desmontado',
      prompt: 'Crie um pôster em vista explodida de um headset conceitual chamado NOVA VR, mostrando carcaça, lentes, telas e sensores em camadas suspensas, com identificação dos componentes e textos curtos sobre o produto.',
    },
    'es-ES': {
      title: 'Póster de despiece de visor VR',
      prompt: 'Crea un póster con una vista explosionada de un visor conceptual llamado NOVA VR. Muestra carcasa, lentes, pantallas y sensores en capas flotantes, con etiquetas de los componentes y textos breves sobre el producto.',
    },
    ru: {
      title: 'Постер с разборкой VR-гарнитуры',
      prompt: 'Создай постер с разнесённым видом концептуальной гарнитуры NOVA VR. Покажи корпус, линзы, дисплеи и датчики парящими слоями с подписями компонентов и коротким текстом о продукте.',
    },
    fa: {
      title: 'پوستر نمای انفجاری هدست VR',
      prompt: 'برای هدست مفهومی NOVA VR یک پوستر نمای انفجاری بساز. بدنه، عدسی‌ها، نمایشگرها و حسگرها را در لایه‌های شناور، همراه با برچسب قطعات و متن کوتاه محصول نمایش بده.',
    },
    ar: {
      title: 'ملصق تفكيك نظارة واقع افتراضي',
      prompt: 'أنشئ ملصقاً بمنظور تفكيكي لنظارة تصورية باسم NOVA VR. اعرض الهيكل والعدسات والشاشات والمستشعرات في طبقات عائمة مع تسميات للمكونات ونصوص قصيرة عن المنتج.',
    },
    ja: {
      title: 'VRヘッドセット分解ポスター',
      prompt: 'NOVA VRというコンセプトヘッドセットの分解図ポスターを作成してください。外装、レンズ、ディスプレイ、センサーを浮遊する層で見せ、部品名と短い製品コピーを添えてください。',
    },
    ko: {
      title: 'VR 헤드셋 분해도 포스터',
      prompt: 'NOVA VR이라는 콘셉트 헤드셋의 분해도 포스터를 만들어 주세요. 외장, 렌즈, 디스플레이, 센서를 공중에 떠 있는 층으로 보여 주고 부품 이름과 짧은 제품 문구를 넣어 주세요.',
    },
    pl: {
      title: 'Plakat rozstrzelonego widoku gogli VR',
      prompt: 'Stwórz plakat z rozstrzelonym widokiem koncepcyjnych gogli NOVA VR. Pokaż obudowę, soczewki, ekrany i czujniki w unoszących się warstwach, z podpisami elementów i krótkimi tekstami o produkcie.',
    },
    hu: {
      title: 'VR-szemüveg robbantott ábrás posztere',
      prompt: 'Készíts robbantott ábrás posztert a NOVA VR nevű koncepciószemüvegről. A burkolatot, lencséket, kijelzőket és érzékelőket lebegő rétegekben mutasd be, alkatrészfeliratokkal és rövid termékszövegekkel.',
    },
    fr: {
      title: 'Affiche de casque VR en vue éclatée',
      prompt: 'Crée une affiche en vue éclatée d’un casque conceptuel nommé NOVA VR. Montre la coque, les lentilles, les écrans et les capteurs en couches flottantes, avec des légendes et de courts textes produit.',
    },
    uk: {
      title: 'Постер із розбиранням VR-гарнітури',
      prompt: 'Створи постер із рознесеним виглядом концептуальної гарнітури NOVA VR. Покажи корпус, лінзи, дисплеї та датчики шарами, що ширяють, із підписами компонентів і коротким текстом про продукт.',
    },
    tr: {
      title: 'VR Başlık Parça Görünümü Posteri',
      prompt: 'NOVA VR adlı konsept başlık için patlatılmış görünüm posteri oluştur. Gövde, lensler, ekranlar ve sensörleri havada duran katmanlar halinde, parça etiketleri ve kısa ürün metinleriyle göster.',
    },
    th: {
      title: 'โปสเตอร์แยกชิ้นส่วนแว่น VR',
      prompt: 'สร้างโปสเตอร์แสดงชิ้นส่วนแยกของแว่นแนวคิด NOVA VR จัดตัวเครื่อง เลนส์ จอแสดงผล และเซนเซอร์เป็นชั้นลอย พร้อมป้ายชื่อชิ้นส่วนและข้อความผลิตภัณฑ์สั้น ๆ',
    },
    it: {
      title: 'Poster esploso di un visore VR',
      prompt: 'Crea un poster con vista esplosa di un visore concettuale chiamato NOVA VR, mostrando scocca, lenti, schermi e sensori in strati sospesi, con etichette dei componenti e brevi testi sul prodotto.',
    },
  },
  'image-template-social-media-post-psg-transfer-announcement-poster': {
    'zh-CN': {
      title: '球员转会官宣海报',
      prompt: '设计一张虚构球员 Lucas Moreau 加盟巴黎圣日耳曼的概念转会海报，使用红蓝配色、球员肖像和醒目的 WELCOME LUCAS 标题，并在角落标注球迷概念设计。',
    },
    'zh-TW': {
      title: '球員轉會官宣海報',
      prompt: '設計一張虛構球員 Lucas Moreau 加盟巴黎聖日耳曼的概念轉會海報，使用紅藍配色、球員肖像和醒目的 WELCOME LUCAS 標題，並在角落標註球迷概念設計。',
    },
    en: {
      title: 'Player Transfer Announcement',
      prompt: 'Design a concept transfer poster for fictional player Lucas Moreau joining Paris Saint-Germain, with red and blue colors, a player portrait, and a bold WELCOME LUCAS headline. Add a small fan concept label in a corner.',
    },
    id: {
      title: 'Poster Pengumuman Transfer Pemain',
      prompt: 'Rancang poster konsep transfer pemain fiktif Lucas Moreau ke Paris Saint-Germain, dengan warna merah dan biru, potret pemain, serta judul WELCOME LUCAS yang menonjol. Tambahkan label kecil konsep penggemar di sudut.',
    },
    de: {
      title: 'Spielertransfer-Poster',
      prompt: 'Gestalte ein Transfer-Konzeptposter für den fiktiven Spieler Lucas Moreau bei Paris Saint-Germain, mit Rot und Blau, einem Spielerporträt und der auffälligen Überschrift WELCOME LUCAS. Ergänze in einer Ecke den kleinen Hinweis Fan-Konzept.',
    },
    'pt-BR': {
      title: 'Pôster de anúncio de contratação',
      prompt: 'Crie um pôster conceitual da contratação do jogador fictício Lucas Moreau pelo Paris Saint-Germain, com cores vermelha e azul, retrato do jogador e o título WELCOME LUCAS em destaque. Inclua uma pequena indicação de conceito de fã em um canto.',
    },
    'es-ES': {
      title: 'Póster de anuncio de fichaje',
      prompt: 'Diseña un póster conceptual del fichaje del jugador ficticio Lucas Moreau por el Paris Saint-Germain, con colores rojo y azul, un retrato del jugador y el titular WELCOME LUCAS destacado. Añade una pequeña indicación de concepto de aficionado en una esquina.',
    },
    ru: {
      title: 'Постер о трансфере игрока',
      prompt: 'Создай концептуальный постер о переходе вымышленного игрока Lucas Moreau в «Пари Сен-Жермен». Используй красный и синий цвета, портрет игрока и крупный заголовок WELCOME LUCAS. В углу добавь небольшую пометку «фанатский концепт».',
    },
    fa: {
      title: 'پوستر اعلام انتقال بازیکن',
      prompt: 'یک پوستر مفهومی برای پیوستن بازیکن خیالی Lucas Moreau به پاری سن ژرمن طراحی کن. از قرمز و آبی، پرتره بازیکن و تیتر برجسته WELCOME LUCAS استفاده کن و در گوشه‌ای برچسب کوچک «طرح مفهومی هواداری» بگذار.',
    },
    ar: {
      title: 'ملصق إعلان انتقال لاعب',
      prompt: 'صمّم ملصقاً تصورياً لانتقال اللاعب الخيالي Lucas Moreau إلى باريس سان جيرمان. استخدم الأحمر والأزرق وصورة اللاعب وعنوان WELCOME LUCAS بارزاً، وأضف في الزاوية عبارة صغيرة توضح أنه تصور من أحد المشجعين.',
    },
    ja: {
      title: '選手移籍発表ポスター',
      prompt: '架空の選手Lucas Moreauがパリ・サンジェルマンに加入するコンセプトポスターをデザインしてください。赤と青、選手のポートレート、大きなWELCOME LUCASの見出しを使い、隅にファン制作のコンセプトであることを小さく記載してください。',
    },
    ko: {
      title: '선수 영입 발표 포스터',
      prompt: '가상의 선수 Lucas Moreau가 파리 생제르맹에 합류하는 콘셉트 포스터를 디자인해 주세요. 빨강과 파랑, 선수 초상, 눈에 띄는 WELCOME LUCAS 제목을 사용하고 모서리에 팬 콘셉트 디자인이라는 표시를 작게 넣어 주세요.',
    },
    pl: {
      title: 'Plakat ogłoszenia transferu',
      prompt: 'Zaprojektuj koncepcyjny plakat transferu fikcyjnego zawodnika Lucas Moreau do Paris Saint-Germain. Użyj czerwieni i błękitu, portretu zawodnika oraz wyrazistego nagłówka WELCOME LUCAS. Dodaj w rogu niewielki napis „koncepcja kibicowska”.',
    },
    hu: {
      title: 'Játékosigazolási poszter',
      prompt: 'Tervezz koncepcióposztert a kitalált Lucas Moreau Paris Saint-Germainhez igazolásáról. Használj piros és kék színeket, játékosportrét és feltűnő WELCOME LUCAS címet. A sarokban kis felirattal jelezd, hogy rajongói koncepció.',
    },
    fr: {
      title: 'Affiche d’annonce de transfert',
      prompt: 'Conçois une affiche de transfert conceptuelle pour le joueur fictif Lucas Moreau au Paris Saint-Germain, avec du rouge et du bleu, un portrait du joueur et le titre WELCOME LUCAS bien visible. Ajoute une petite mention concept de fan dans un coin.',
    },
    uk: {
      title: 'Постер про трансфер гравця',
      prompt: 'Створи концептуальний постер про перехід вигаданого гравця Lucas Moreau до «Парі Сен-Жермен». Використай червоний і синій кольори, портрет гравця та виразний заголовок WELCOME LUCAS. У кутку додай невелику позначку «фанатський концепт».',
    },
    tr: {
      title: 'Oyuncu Transfer Duyurusu',
      prompt: 'Hayali oyuncu Lucas Moreau’nun Paris Saint-Germain’e transferini duyuran bir konsept poster tasarla. Kırmızı ve mavi renkler, oyuncu portresi ve belirgin WELCOME LUCAS başlığını kullan. Köşeye küçük bir taraftar konsepti etiketi ekle.',
    },
    th: {
      title: 'โปสเตอร์ประกาศย้ายทีม',
      prompt: 'ออกแบบโปสเตอร์แนวคิดการย้ายทีมของนักเตะสมมติ Lucas Moreau ไปปารีสแซงต์แชร์กแมง ใช้สีแดงและน้ำเงิน ภาพนักเตะ และหัวข้อ WELCOME LUCAS ที่โดดเด่น พร้อมข้อความเล็ก ๆ ที่มุมว่าเป็นคอนเซ็ปต์จากแฟนบอล',
    },
    it: {
      title: 'Poster di annuncio di un acquisto',
      prompt: 'Progetta un poster concettuale del trasferimento del calciatore immaginario Lucas Moreau al Paris Saint-Germain, con colori rosso e blu, ritratto del giocatore e il titolo WELCOME LUCAS in evidenza. Aggiungi in un angolo una piccola dicitura concept di un tifoso.',
    },
  },
  'image-template-social-media-post-vintage-sign-painter-sketch': {
    'zh-CN': {
      title: '复古手绘字海报',
      prompt: '把 SLOW MORNINGS 设计成复古咖啡馆招牌风的手绘字海报，搭配咖啡杯小插画，保留奶油色纸张纹理、铅笔底稿和马克笔笔触。',
    },
    'zh-TW': {
      title: '復古手繪字海報',
      prompt: '把 SLOW MORNINGS 設計成復古咖啡館招牌風的手繪字海報，搭配咖啡杯小插畫，保留奶油色紙張紋理、鉛筆底稿和麥克筆筆觸。',
    },
    en: {
      title: 'Vintage Hand-Lettered Poster',
      prompt: 'Turn SLOW MORNINGS into a hand-lettered poster inspired by vintage cafe signs, with a small coffee cup illustration, cream paper texture, pencil guidelines, and visible marker strokes.',
    },
    id: {
      title: 'Poster Huruf Tangan Retro',
      prompt: 'Ubah SLOW MORNINGS menjadi poster huruf tangan bergaya papan nama kafe retro, dengan ilustrasi kecil cangkir kopi, tekstur kertas krem, garis bantu pensil, dan goresan spidol yang terlihat.',
    },
    de: {
      title: 'Retro-Handlettering-Poster',
      prompt: 'Gestalte SLOW MORNINGS als handgezeichnetes Schriftposter im Stil alter Café-Schilder, mit einer kleinen Kaffeetassenillustration, cremefarbener Papierstruktur, Bleistift-Hilfslinien und sichtbaren Markerstrichen.',
    },
    'pt-BR': {
      title: 'Pôster de lettering retrô',
      prompt: 'Transforme SLOW MORNINGS em um pôster de lettering manual inspirado em letreiros de cafeterias antigas, com uma pequena ilustração de xícara de café, textura de papel creme, linhas-guia de lápis e traços visíveis de marcador.',
    },
    'es-ES': {
      title: 'Póster de rotulación retro',
      prompt: 'Convierte SLOW MORNINGS en un póster de rotulación a mano inspirado en los letreros de cafeterías antiguas, con una pequeña ilustración de una taza de café, textura de papel crema, guías de lápiz y trazos visibles de rotulador.',
    },
    ru: {
      title: 'Постер с ретро-леттерингом',
      prompt: 'Оформи SLOW MORNINGS как постер с ручным леттерингом в стиле старых вывесок кафе. Добавь небольшую иллюстрацию кофейной чашки, фактуру кремовой бумаги, карандашные направляющие и заметные штрихи маркера.',
    },
    fa: {
      title: 'پوستر حروف‌نگاری رترو',
      prompt: 'عبارت SLOW MORNINGS را به پوستری با حروف دست‌نویس، الهام‌گرفته از تابلوهای قدیمی کافه تبدیل کن. تصویر کوچکی از فنجان قهوه، بافت کاغذ کرم، خطوط راهنمای مدادی و رد واضح ماژیک را اضافه کن.',
    },
    ar: {
      title: 'ملصق حروف مرسومة بطابع قديم',
      prompt: 'حوّل SLOW MORNINGS إلى ملصق حروف مرسومة يدوياً مستوحى من لافتات المقاهي القديمة، مع رسم صغير لفنجان قهوة وملمس ورق كريمي وخطوط إرشادية بالقلم الرصاص وآثار واضحة لقلم التحديد.',
    },
    ja: {
      title: 'レトロな手描き文字ポスター',
      prompt: 'SLOW MORNINGSを、昔の喫茶店の看板を思わせる手描き文字ポスターにしてください。小さなコーヒーカップのイラスト、クリーム色の紙の質感、鉛筆の下書き線、マーカーの筆跡を取り入れてください。',
    },
    ko: {
      title: '레트로 손글씨 포스터',
      prompt: 'SLOW MORNINGS를 오래된 카페 간판에서 영감을 받은 손글씨 포스터로 디자인해 주세요. 작은 커피잔 그림, 크림색 종이 질감, 연필 밑그림, 눈에 보이는 마커 자국을 살려 주세요.',
    },
    pl: {
      title: 'Plakat z liternictwem retro',
      prompt: 'Zaprojektuj SLOW MORNINGS jako plakat z ręcznym liternictwem inspirowanym starymi szyldami kawiarni. Dodaj małą ilustrację filiżanki kawy, fakturę kremowego papieru, ołówkowe linie pomocnicze i widoczne ślady markera.',
    },
    hu: {
      title: 'Retró kézi betűrajzos poszter',
      prompt: 'Alakítsd a SLOW MORNINGS szöveget régi kávézótáblák ihlette, kézzel rajzolt betűs poszterré. Adj hozzá kis kávéscsésze-illusztrációt, krémszínű papírtextúrát, ceruzás segédvonalakat és látható filctollvonásokat.',
    },
    fr: {
      title: 'Affiche de lettrage rétro',
      prompt: 'Transforme SLOW MORNINGS en affiche de lettrage à la main inspirée des anciennes enseignes de cafés, avec une petite tasse illustrée, une texture de papier crème, des lignes de construction au crayon et des traits de feutre visibles.',
    },
    uk: {
      title: 'Постер із ретролетерингом',
      prompt: 'Оформи SLOW MORNINGS як постер із ручним летерингом у стилі старих вивісок кав’ярень. Додай маленьку ілюстрацію чашки кави, фактуру кремового паперу, олівцеві напрямні та помітні штрихи маркера.',
    },
    tr: {
      title: 'Retro El Yazısı Posteri',
      prompt: 'SLOW MORNINGS yazısını eski kafe tabelalarından esinlenen, elle çizilmiş bir harf posteri olarak tasarla. Küçük bir kahve fincanı çizimi, krem kâğıt dokusu, kurşun kalem kılavuz çizgileri ve görünür keçeli kalem izleri ekle.',
    },
    th: {
      title: 'โปสเตอร์ตัวอักษรวาดมือย้อนยุค',
      prompt: 'ออกแบบ SLOW MORNINGS เป็นโปสเตอร์ตัวอักษรวาดมือที่ได้แรงบันดาลใจจากป้ายร้านกาแฟเก่า พร้อมภาพถ้วยกาแฟเล็ก ๆ พื้นผิวกระดาษสีครีม เส้นร่างดินสอ และรอยปากกาเมจิกที่มองเห็นได้',
    },
    it: {
      title: 'Poster di lettering rétro',
      prompt: 'Trasforma SLOW MORNINGS in un poster di lettering a mano ispirato alle vecchie insegne dei caffè, con una piccola tazza illustrata, texture di carta color crema, linee guida a matita e tratti visibili di pennarello.',
    },
  },
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    'zh-CN': {
      title: '赛博朋克动漫头像',
      prompt: '创作一张银色短发、佩戴耳机的原创动漫角色头像，用蓝紫霓虹光照亮面部，将 DREAM IN NEON 字样融入脸部光影，背景是虚化的未来城市夜景。',
    },
    'zh-TW': {
      title: '賽博龐克動漫頭像',
      prompt: '創作一張銀色短髮、佩戴耳機的原創動漫角色頭像，用藍紫霓虹光照亮面部，將 DREAM IN NEON 字樣融入臉部光影，背景是虛化的未來城市夜景。',
    },
    en: {
      title: 'Cyberpunk Anime Avatar',
      prompt: 'Create an avatar of an original anime character with short silver hair and headphones, using blue and violet neon light across the face. Blend DREAM IN NEON lettering into the facial lighting against a blurred futuristic city at night.',
    },
    id: {
      title: 'Avatar Anime Cyberpunk',
      prompt: 'Buat avatar karakter anime orisinal berambut perak pendek dan memakai headphone. Gunakan cahaya neon biru dan ungu pada wajah, padukan tulisan DREAM IN NEON dengan pencahayaan wajah, dan gunakan latar kota masa depan pada malam hari yang diburamkan.',
    },
    de: {
      title: 'Cyberpunk-Anime-Avatar',
      prompt: 'Gestalte den Avatar einer eigenen Anime-Figur mit kurzen silbernen Haaren und Kopfhörern. Beleuchte das Gesicht mit blauem und violettem Neonlicht und integriere DREAM IN NEON in die Lichtgestaltung. Der Hintergrund zeigt eine unscharfe futuristische Stadt bei Nacht.',
    },
    'pt-BR': {
      title: 'Avatar de anime cyberpunk',
      prompt: 'Crie um avatar de um personagem original de anime com cabelo prateado curto e fones de ouvido, iluminado por neon azul e violeta. Integre DREAM IN NEON à iluminação do rosto, com uma cidade futurista noturna desfocada ao fundo.',
    },
    'es-ES': {
      title: 'Avatar de anime ciberpunk',
      prompt: 'Crea un avatar de un personaje original de anime con pelo plateado corto y auriculares, iluminado con neón azul y violeta. Integra las letras DREAM IN NEON en la iluminación del rostro, con una ciudad futurista nocturna desenfocada de fondo.',
    },
    ru: {
      title: 'Аниме-аватар в стиле киберпанк',
      prompt: 'Создай аватар оригинального аниме-персонажа с короткими серебристыми волосами и наушниками. Освети лицо синим и фиолетовым неоном, вплети надпись DREAM IN NEON в световой рисунок на лице. Фоном сделай размытый ночной город будущего.',
    },
    fa: {
      title: 'آواتار انیمه سایبرپانک',
      prompt: 'آواتاری از یک شخصیت انیمه اصیل با موهای کوتاه نقره‌ای و هدفون بساز. صورت را با نئون آبی و بنفش روشن کن و نوشته DREAM IN NEON را در نورپردازی چهره ادغام کن. پس‌زمینه، نمای محو یک شهر آینده‌نگر در شب باشد.',
    },
    ar: {
      title: 'صورة رمزية أنمي سايبربانك',
      prompt: 'أنشئ صورة رمزية لشخصية أنمي أصلية بشعر فضي قصير وسماعات رأس. أضئ الوجه بنيون أزرق وبنفسجي وادمج عبارة DREAM IN NEON في إضاءة الوجه، مع خلفية ضبابية لمدينة مستقبلية ليلاً.',
    },
    ja: {
      title: 'サイバーパンクアニメアバター',
      prompt: '短い銀髪でヘッドホンを着けたオリジナルのアニメキャラクターのアバターを作成してください。青と紫のネオンで顔を照らし、DREAM IN NEONの文字を顔の光の表現に溶け込ませ、背景にはぼかした未来都市の夜景を使ってください。',
    },
    ko: {
      title: '사이버펑크 애니메이션 아바타',
      prompt: '짧은 은발에 헤드폰을 쓴 오리지널 애니메이션 캐릭터의 아바타를 만들어 주세요. 파랑과 보라 네온으로 얼굴을 비추고 DREAM IN NEON 글자를 얼굴의 빛에 녹여 넣어 주세요. 배경은 흐릿한 미래 도시의 야경으로 해 주세요.',
    },
    pl: {
      title: 'Cyberpunkowy awatar anime',
      prompt: 'Stwórz awatar oryginalnej postaci anime z krótkimi srebrnymi włosami i słuchawkami. Oświetl twarz niebieskim i fioletowym neonem, wkomponuj napis DREAM IN NEON w światło na twarzy, a w tle umieść rozmyte futurystyczne miasto nocą.',
    },
    hu: {
      title: 'Cyberpunk anime avatár',
      prompt: 'Készíts avatárt egy eredeti animekarakterről rövid ezüst hajjal és fejhallgatóval. Világítsd meg az arcot kék és lila neonnal, építsd a DREAM IN NEON feliratot az arc fényrajzába, háttérként pedig használj elmosódott futurisztikus éjszakai várost.',
    },
    fr: {
      title: 'Avatar anime cyberpunk',
      prompt: 'Crée un avatar de personnage anime original aux cheveux argentés courts et portant un casque audio. Éclaire son visage de néons bleus et violets et intègre DREAM IN NEON à l’éclairage du visage, sur fond flou de ville futuriste nocturne.',
    },
    uk: {
      title: 'Аніме-аватар у стилі кіберпанк',
      prompt: 'Створи аватар оригінального аніме-персонажа з коротким сріблястим волоссям і навушниками. Освіти обличчя синім і фіолетовим неоном, вплети напис DREAM IN NEON у світловий малюнок на обличчі. Тло — розмите нічне місто майбутнього.',
    },
    tr: {
      title: 'Siberpunk Anime Avatarı',
      prompt: 'Kısa gümüş saçlı ve kulaklıklı özgün bir anime karakterinin avatarını oluştur. Yüzü mavi ve mor neonla aydınlat, DREAM IN NEON yazısını yüzdeki ışığa yedir ve arka planda bulanık bir gelecek şehrinin gece manzarasını kullan.',
    },
    th: {
      title: 'อวตารอนิเมะไซเบอร์พังก์',
      prompt: 'สร้างอวตารตัวละครอนิเมะต้นฉบับผมสั้นสีเงินสวมหูฟัง ใช้แสงนีออนสีน้ำเงินและม่วงบนใบหน้า ผสานข้อความ DREAM IN NEON เข้ากับแสงบนใบหน้า โดยมีฉากหลังเป็นเมืองอนาคตยามค่ำคืนแบบเบลอ',
    },
    it: {
      title: 'Avatar anime cyberpunk',
      prompt: 'Crea un avatar di un personaggio anime originale con capelli argento corti e cuffie. Illumina il volto con neon blu e viola e integra la scritta DREAM IN NEON nella luce del viso, con una città futuristica notturna sfocata sullo sfondo.',
    },
  },
  'image-template-profile-avatar-monochrome-studio-portrait': {
    'zh-CN': {
      title: '黑白棚拍肖像',
      prompt: '生成一张虚构年轻创意工作者的黑白棚拍肖像，人物穿黑色高领上衣、神态自然，以深浅分割背景和侧面柔光突出面部轮廓，保留真实皮肤质感。',
    },
    'zh-TW': {
      title: '黑白棚拍肖像',
      prompt: '生成一張虛構年輕創意工作者的黑白棚拍肖像，人物穿黑色高領上衣、神態自然，以深淺分割背景和側面柔光突出面部輪廓，保留真實皮膚質感。',
    },
    en: {
      title: 'Black and White Studio Portrait',
      prompt: 'Generate a black and white studio portrait of a fictional young creative professional in a black turtleneck with a relaxed expression. Use a split light-and-dark background and soft side lighting to define the face, preserving natural skin texture.',
    },
    id: {
      title: 'Potret Studio Hitam Putih',
      prompt: 'Buat potret studio hitam putih seorang pekerja kreatif muda fiktif yang mengenakan atasan turtleneck hitam dengan ekspresi santai. Gunakan latar terbagi terang dan gelap serta cahaya samping lembut untuk menonjolkan wajah, sambil mempertahankan tekstur kulit alami.',
    },
    de: {
      title: 'Schwarz-Weiß-Studioporträt',
      prompt: 'Erzeuge ein Schwarz-Weiß-Studioporträt einer fiktiven jungen Person aus der Kreativbranche mit schwarzem Rollkragenpullover und entspanntem Gesichtsausdruck. Nutze einen hell-dunkel geteilten Hintergrund und weiches Seitenlicht, das die Gesichtszüge und natürliche Hautstruktur betont.',
    },
    'pt-BR': {
      title: 'Retrato de estúdio em preto e branco',
      prompt: 'Gere um retrato de estúdio em preto e branco de uma pessoa jovem fictícia da área criativa, com blusa preta de gola alta e expressão descontraída. Use fundo dividido entre claro e escuro e luz lateral suave para destacar o rosto, preservando a textura natural da pele.',
    },
    'es-ES': {
      title: 'Retrato de estudio en blanco y negro',
      prompt: 'Genera un retrato de estudio en blanco y negro de una persona joven ficticia del sector creativo, con jersey negro de cuello alto y expresión relajada. Usa un fondo dividido entre claro y oscuro y una luz lateral suave que destaque el rostro, manteniendo la textura natural de la piel.',
    },
    ru: {
      title: 'Чёрно-белый студийный портрет',
      prompt: 'Создай чёрно-белый студийный портрет вымышленного молодого специалиста творческой профессии в чёрной водолазке со спокойным выражением лица. Используй фон из светлой и тёмной половин и мягкий боковой свет, подчёркивающий черты лица и естественную текстуру кожи.',
    },
    fa: {
      title: 'پرتره استودیویی سیاه‌وسفید',
      prompt: 'یک پرتره استودیویی سیاه‌وسفید از فردی جوان و خیالی در حرفه‌ای خلاق بساز که یقه‌اسکی مشکی پوشیده و حالت چهره آرامی دارد. با پس‌زمینه دو بخش روشن و تیره و نور جانبی نرم، فرم صورت را برجسته کن و بافت طبیعی پوست را نگه دار.',
    },
    ar: {
      title: 'بورتريه استوديو بالأبيض والأسود',
      prompt: 'أنشئ بورتريهاً بالأبيض والأسود لشخص خيالي شاب يعمل في مجال إبداعي، يرتدي كنزة سوداء بياقة عالية وتبدو عليه ملامح هادئة. استخدم خلفية مقسمة إلى فاتح وداكن وإضاءة جانبية ناعمة لإبراز الوجه مع الحفاظ على ملمس البشرة الطبيعي.',
    },
    ja: {
      title: 'モノクロのスタジオポートレート',
      prompt: '黒いタートルネックを着た、架空の若いクリエイティブ職の人物のモノクロスタジオポートレートを生成してください。自然な表情、明暗に分かれた背景、柔らかなサイドライトで顔の輪郭を際立たせ、自然な肌の質感を残してください。',
    },
    ko: {
      title: '흑백 스튜디오 인물 사진',
      prompt: '검은 터틀넥을 입고 편안한 표정을 지은 가상의 젊은 창작자의 흑백 스튜디오 인물 사진을 생성해 주세요. 밝고 어둡게 나뉜 배경과 부드러운 측면 조명으로 얼굴 윤곽을 살리고 자연스러운 피부 질감을 유지해 주세요.',
    },
    pl: {
      title: 'Czarno-biały portret studyjny',
      prompt: 'Wygeneruj czarno-biały portret studyjny fikcyjnej młodej osoby z branży kreatywnej w czarnym golfie, ze swobodnym wyrazem twarzy. Użyj tła podzielonego na jasną i ciemną część oraz miękkiego światła bocznego, aby podkreślić rysy i zachować naturalną fakturę skóry.',
    },
    hu: {
      title: 'Fekete-fehér stúdióportré',
      prompt: 'Készíts fekete-fehér stúdióportrét egy kitalált fiatal kreatív szakemberről, fekete garbóban, nyugodt arckifejezéssel. Használj világos és sötét részre osztott hátteret és lágy oldalfényt az arcvonások kiemelésére, a természetes bőrtextúra megőrzésével.',
    },
    fr: {
      title: 'Portrait studio en noir et blanc',
      prompt: 'Génère un portrait studio en noir et blanc d’une jeune personne fictive travaillant dans la création, en col roulé noir et à l’expression détendue. Utilise un fond partagé entre clair et sombre et une lumière latérale douce qui souligne le visage tout en préservant la texture naturelle de la peau.',
    },
    uk: {
      title: 'Чорно-білий студійний портрет',
      prompt: 'Створи чорно-білий студійний портрет вигаданої молодої людини творчої професії в чорній водолазці зі спокійним виразом обличчя. Використай тло зі світлої та темної половин і м’яке бічне світло, що підкреслює риси обличчя та природну текстуру шкіри.',
    },
    tr: {
      title: 'Siyah Beyaz Stüdyo Portresi',
      prompt: 'Siyah balıkçı yaka kazaklı, rahat ifadeli, yaratıcı bir meslekte çalışan hayali bir gencin siyah beyaz stüdyo portresini oluştur. Doğal cilt dokusunu koruyarak yüz hatlarını vurgulamak için açık ve koyu bölünmüş arka plan ile yumuşak yan ışık kullan.',
    },
    th: {
      title: 'ภาพพอร์ตเทรตสตูดิโอขาวดำ',
      prompt: 'สร้างภาพพอร์ตเทรตสตูดิโอขาวดำของคนหนุ่มสาวสมมติในสายงานสร้างสรรค์ สวมเสื้อคอเต่าสีดำและมีสีหน้าผ่อนคลาย ใช้ฉากหลังแบ่งส่วนสว่างและมืดกับแสงด้านข้างนุ่ม ๆ เพื่อเน้นใบหน้าและคงพื้นผิวผิวหนังตามธรรมชาติ',
    },
    it: {
      title: 'Ritratto in studio in bianco e nero',
      prompt: 'Genera un ritratto in studio in bianco e nero di una giovane persona immaginaria del settore creativo, con dolcevita nero ed espressione rilassata. Usa uno sfondo diviso tra chiaro e scuro e luce laterale morbida per definire il volto, preservando la texture naturale della pelle.',
    },
  },
  'example-fs-creative-voltage': {
    'zh-CN': {
      title: '种子轮融资路演',
      prompt: '为我的创业项目制作一份融资路演，讲清市场机会、产品优势、业务进展和融资计划。',
    },
    'zh-TW': {
      title: '種子輪融資簡報',
      prompt: '為我的創業專案製作一份融資簡報，講清市場機會、產品優勢、業務進展和融資計畫。',
    },
    en: {
      title: 'Seed Funding Pitch',
      prompt: 'Create a pitch deck for my startup that explains the market opportunity, product advantages, business traction, and fundraising plan.',
    },
    id: {
      title: 'Presentasi Pendanaan Awal',
      prompt: 'Buat presentasi pendanaan untuk startup saya yang menjelaskan peluang pasar, keunggulan produk, perkembangan bisnis, dan rencana pendanaan.',
    },
    de: {
      title: 'Seed-Finanzierungspräsentation',
      prompt: 'Erstelle eine Finanzierungspräsentation für mein Startup, die Marktchance, Produktvorteile, Geschäftsentwicklung und Finanzierungsplan erläutert.',
    },
    'pt-BR': {
      title: 'Apresentação para rodada seed',
      prompt: 'Crie uma apresentação de captação para minha startup que explique a oportunidade de mercado, os diferenciais do produto, a evolução do negócio e o plano de investimento.',
    },
    'es-ES': {
      title: 'Presentación de ronda semilla',
      prompt: 'Crea una presentación de financiación para mi startup que explique la oportunidad de mercado, las ventajas del producto, la evolución del negocio y el plan de financiación.',
    },
    ru: {
      title: 'Презентация для посевного раунда',
      prompt: 'Создай инвестиционную презентацию моего стартапа, раскрывающую рыночную возможность, преимущества продукта, развитие бизнеса и план привлечения средств.',
    },
    fa: {
      title: 'ارائه جذب سرمایه بذری',
      prompt: 'برای استارتاپ من یک ارائه جذب سرمایه تهیه کن که فرصت بازار، مزیت‌های محصول، پیشرفت کسب‌وکار و برنامه تأمین مالی را توضیح دهد.',
    },
    ar: {
      title: 'عرض تمويل تأسيسي',
      prompt: 'أنشئ عرضاً لجمع التمويل لشركتي الناشئة يشرح فرصة السوق ومزايا المنتج وتقدم الأعمال وخطة التمويل.',
    },
    ja: {
      title: 'シードラウンドの資金調達資料',
      prompt: '私のスタートアップの資金調達プレゼンを作成してください。市場機会、製品の強み、事業の進捗、資金調達計画を説明してください。',
    },
    ko: {
      title: '시드 투자 유치 발표',
      prompt: '제 스타트업의 투자 유치 발표 자료를 만들어 주세요. 시장 기회, 제품 강점, 사업 진행 상황, 투자 유치 계획을 설명해 주세요.',
    },
    pl: {
      title: 'Prezentacja rundy zalążkowej',
      prompt: 'Stwórz prezentację inwestorską mojego startupu, przedstawiającą szansę rynkową, zalety produktu, rozwój biznesu i plan pozyskania finansowania.',
    },
    hu: {
      title: 'Magvető befektetői prezentáció',
      prompt: 'Készíts befektetői prezentációt a startupomnak, amely bemutatja a piaci lehetőséget, a termék előnyeit, az üzleti előrehaladást és a finanszírozási tervet.',
    },
    fr: {
      title: 'Présentation de levée d’amorçage',
      prompt: 'Crée une présentation de levée de fonds pour ma startup qui explique l’opportunité de marché, les atouts du produit, les progrès de l’activité et le plan de financement.',
    },
    uk: {
      title: 'Презентація для посівного раунду',
      prompt: 'Створи інвестиційну презентацію мого стартапу, що пояснює ринкову можливість, переваги продукту, розвиток бізнесу та план залучення коштів.',
    },
    tr: {
      title: 'Tohum Yatırım Sunumu',
      prompt: 'Girişimim için pazar fırsatını, ürün avantajlarını, işin ilerleyişini ve yatırım planını açıklayan bir yatırım sunumu oluştur.',
    },
    th: {
      title: 'พรีเซนเทชันระดมทุนรอบ Seed',
      prompt: 'สร้างพรีเซนเทชันระดมทุนสำหรับสตาร์ทอัพของฉัน โดยอธิบายโอกาสทางการตลาด จุดเด่นผลิตภัณฑ์ ความคืบหน้าธุรกิจ และแผนระดมทุน',
    },
    it: {
      title: 'Presentazione per un round seed',
      prompt: 'Crea una presentazione di raccolta fondi per la mia startup che illustri opportunità di mercato, vantaggi del prodotto, progressi dell’attività e piano di finanziamento.',
    },
  },
  'example-fs-electric-studio': {
    'zh-CN': {
      title: 'B2B 销售提案',
      prompt: '为企业客户制作一份销售提案，围绕客户痛点介绍解决方案、预期收益和实施计划。',
    },
    'zh-TW': {
      title: 'B2B 銷售提案',
      prompt: '為企業客戶製作一份銷售提案，圍繞客戶痛點介紹解決方案、預期效益和實施計畫。',
    },
    en: {
      title: 'B2B Sales Proposal',
      prompt: 'Create a sales proposal for an enterprise customer, addressing their pain points with a solution, expected benefits, and an implementation plan.',
    },
    id: {
      title: 'Proposal Penjualan B2B',
      prompt: 'Buat proposal penjualan untuk klien perusahaan, yang menjawab masalah mereka dengan solusi, manfaat yang diharapkan, dan rencana implementasi.',
    },
    de: {
      title: 'B2B-Verkaufspräsentation',
      prompt: 'Erstelle eine Verkaufspräsentation für einen Unternehmenskunden, die seine Probleme mit einer Lösung, dem erwarteten Nutzen und einem Umsetzungsplan adressiert.',
    },
    'pt-BR': {
      title: 'Proposta comercial B2B',
      prompt: 'Crie uma proposta comercial para um cliente empresarial, abordando suas dificuldades com uma solução, os benefícios esperados e um plano de implementação.',
    },
    'es-ES': {
      title: 'Propuesta comercial B2B',
      prompt: 'Crea una propuesta comercial para un cliente empresarial que aborde sus problemas con una solución, los beneficios esperados y un plan de implantación.',
    },
    ru: {
      title: 'Коммерческое предложение B2B',
      prompt: 'Создай коммерческое предложение для корпоративного клиента: опиши его проблемы, решение, ожидаемые выгоды и план внедрения.',
    },
    fa: {
      title: 'پیشنهاد فروش سازمانی',
      prompt: 'برای یک مشتری سازمانی، پیشنهاد فروشی تهیه کن که مشکلات او را با راه‌حل، مزایای مورد انتظار و برنامه اجرا پاسخ دهد.',
    },
    ar: {
      title: 'عرض مبيعات للشركات',
      prompt: 'أنشئ عرض مبيعات لعميل من الشركات يعالج مشكلاته من خلال حل وفوائد متوقعة وخطة تنفيذ.',
    },
    ja: {
      title: 'B2B営業提案書',
      prompt: '企業顧客向けの営業提案書を作成してください。顧客の課題に対する解決策、期待される効果、導入計画を示してください。',
    },
    ko: {
      title: 'B2B 영업 제안서',
      prompt: '기업 고객을 위한 영업 제안서를 만들어 주세요. 고객의 문제에 대한 해결책, 기대 효과, 도입 계획을 제시해 주세요.',
    },
    pl: {
      title: 'Oferta sprzedażowa B2B',
      prompt: 'Stwórz ofertę sprzedażową dla klienta biznesowego, która odpowiada na jego problemy rozwiązaniem, oczekiwanymi korzyściami i planem wdrożenia.',
    },
    hu: {
      title: 'B2B értékesítési ajánlat',
      prompt: 'Készíts értékesítési ajánlatot egy vállalati ügyfélnek, amely a problémáira megoldást, várható előnyöket és bevezetési tervet kínál.',
    },
    fr: {
      title: 'Proposition commerciale B2B',
      prompt: 'Crée une proposition commerciale pour une entreprise cliente, en répondant à ses difficultés par une solution, les bénéfices attendus et un plan de mise en œuvre.',
    },
    uk: {
      title: 'Комерційна пропозиція B2B',
      prompt: 'Створи комерційну пропозицію для корпоративного клієнта: опиши його проблеми, рішення, очікувані вигоди та план упровадження.',
    },
    tr: {
      title: 'B2B Satış Teklifi',
      prompt: 'Kurumsal bir müşteri için sorunlarına çözüm, beklenen faydalar ve uygulama planı sunan bir satış teklifi oluştur.',
    },
    th: {
      title: 'ข้อเสนอขาย B2B',
      prompt: 'สร้างข้อเสนอขายสำหรับลูกค้าองค์กร โดยนำเสนอวิธีแก้ปัญหาของลูกค้า ประโยชน์ที่คาดหวัง และแผนการนำไปใช้',
    },
    it: {
      title: 'Proposta commerciale B2B',
      prompt: 'Crea una proposta commerciale per un cliente aziendale che risponda alle sue difficoltà con una soluzione, i benefici previsti e un piano di implementazione.',
    },
  },
  'example-html-ppt-zhangzara-block-frame': {
    'zh-CN': {
      title: '董事会汇报',
      prompt: '帮我把现有演示文稿打磨成适合董事会汇报的版本，理清叙事、突出关键证据，并统一视觉风格。',
    },
    'zh-TW': {
      title: '董事會簡報',
      prompt: '幫我把現有簡報打磨成適合董事會報告的版本，理清敘事、突出關鍵證據，並統一視覺風格。',
    },
    en: {
      title: 'Board Presentation',
      prompt: 'Refine my existing presentation for a board meeting by clarifying the narrative, highlighting key evidence, and creating a consistent visual style.',
    },
    id: {
      title: 'Presentasi Dewan Direksi',
      prompt: 'Sempurnakan presentasi saya yang sudah ada untuk rapat dewan direksi dengan memperjelas alur cerita, menonjolkan bukti utama, dan menyatukan gaya visual.',
    },
    de: {
      title: 'Präsentation für den Vorstand',
      prompt: 'Überarbeite meine bestehende Präsentation für eine Vorstandssitzung: Schärfe den roten Faden, hebe die wichtigsten Belege hervor und vereinheitliche die visuelle Gestaltung.',
    },
    'pt-BR': {
      title: 'Apresentação ao conselho',
      prompt: 'Aprimore minha apresentação existente para uma reunião do conselho, esclarecendo a narrativa, destacando as principais evidências e unificando o estilo visual.',
    },
    'es-ES': {
      title: 'Presentación al consejo',
      prompt: 'Mejora mi presentación existente para una reunión del consejo: aclara el hilo narrativo, destaca las pruebas clave y unifica el estilo visual.',
    },
    ru: {
      title: 'Презентация для совета директоров',
      prompt: 'Доработай мою существующую презентацию для совета директоров: выстрой последовательное повествование, выдели ключевые доказательства и приведи оформление к единому стилю.',
    },
    fa: {
      title: 'ارائه به هیئت‌مدیره',
      prompt: 'ارائه فعلی من را برای جلسه هیئت‌مدیره بهبود بده. مسیر روایت را روشن کن، شواهد کلیدی را برجسته کن و سبک بصری را یکدست کن.',
    },
    ar: {
      title: 'عرض لمجلس الإدارة',
      prompt: 'حسّن عرضي الحالي ليلائم اجتماع مجلس الإدارة، مع توضيح تسلسل الأفكار وإبراز الأدلة الرئيسية وتوحيد الأسلوب البصري.',
    },
    ja: {
      title: '取締役会向けプレゼン',
      prompt: '既存のプレゼンを取締役会向けに磨き上げてください。話の流れを明確にし、重要な根拠を強調し、ビジュアルスタイルを統一してください。',
    },
    ko: {
      title: '이사회 보고 자료',
      prompt: '기존 발표 자료를 이사회 보고에 맞게 다듬어 주세요. 이야기 흐름을 명확히 하고 핵심 근거를 강조하며 시각적 스타일을 통일해 주세요.',
    },
    pl: {
      title: 'Prezentacja dla zarządu',
      prompt: 'Dopracuj moją istniejącą prezentację na posiedzenie zarządu: uporządkuj narrację, podkreśl kluczowe dowody i nadaj spójny styl wizualny.',
    },
    hu: {
      title: 'Igazgatósági prezentáció',
      prompt: 'Dolgozd át a meglévő prezentációmat igazgatósági ülésre. Tedd világossá a történetvezetést, emeld ki a legfontosabb bizonyítékokat, és egységesítsd a vizuális stílust.',
    },
    fr: {
      title: 'Présentation au conseil',
      prompt: 'Améliore ma présentation existante pour une réunion du conseil d’administration : clarifie le fil narratif, souligne les preuves essentielles et harmonise le style visuel.',
    },
    uk: {
      title: 'Презентація для ради директорів',
      prompt: 'Удоскональ мою наявну презентацію для засідання ради директорів: вибудуй чітку розповідь, виділи ключові докази та узгодь візуальний стиль.',
    },
    tr: {
      title: 'Yönetim Kurulu Sunumu',
      prompt: 'Mevcut sunumumu yönetim kurulu toplantısına uygun hale getir. Anlatı akışını netleştir, temel kanıtları vurgula ve görsel tarzı tutarlı hale getir.',
    },
    th: {
      title: 'พรีเซนเทชันสำหรับคณะกรรมการ',
      prompt: 'ปรับปรุงพรีเซนเทชันที่มีอยู่ของฉันให้เหมาะกับการประชุมคณะกรรมการ ทำให้ลำดับเรื่องชัดเจน เน้นหลักฐานสำคัญ และใช้รูปแบบภาพที่สอดคล้องกัน',
    },
    it: {
      title: 'Presentazione al consiglio',
      prompt: 'Migliora la mia presentazione esistente per una riunione del consiglio di amministrazione, chiarendo il filo narrativo, evidenziando le prove principali e uniformando lo stile visivo.',
    },
  },
  'example-fs-notebook-tabs': {
    'zh-CN': {
      title: '毕业设计答辩',
      prompt: '为我的毕业设计制作答辩演示，清楚呈现研究问题、解决方法、成果验证和创新点。',
    },
    'zh-TW': {
      title: '畢業專題口試',
      prompt: '為我的畢業專題製作口試簡報，清楚呈現研究問題、解決方法、成果驗證和創新之處。',
    },
    en: {
      title: 'Capstone Defense',
      prompt: 'Create a defense presentation for my capstone project, clearly presenting the research problem, approach, validation results, and original contributions.',
    },
    id: {
      title: 'Presentasi Sidang Tugas Akhir',
      prompt: 'Buat presentasi sidang tugas akhir saya yang menjelaskan masalah penelitian, pendekatan, hasil validasi, dan kontribusi orisinal.',
    },
    de: {
      title: 'Präsentation zur Abschlussarbeit',
      prompt: 'Erstelle eine Präsentation zur Verteidigung meiner Abschlussarbeit, die Forschungsfrage, Vorgehen, Validierungsergebnisse und eigenständige Beiträge klar darstellt.',
    },
    'pt-BR': {
      title: 'Apresentação de TCC',
      prompt: 'Crie uma apresentação de defesa do meu trabalho de conclusão de curso, expondo com clareza o problema de pesquisa, a abordagem, os resultados da validação e as contribuições originais.',
    },
    'es-ES': {
      title: 'Defensa de proyecto de fin de grado',
      prompt: 'Crea una presentación para defender mi proyecto de fin de grado, exponiendo claramente el problema de investigación, el enfoque, los resultados de validación y las aportaciones originales.',
    },
    ru: {
      title: 'Защита дипломного проекта',
      prompt: 'Создай презентацию для защиты моего дипломного проекта. Ясно изложи исследовательскую проблему, подход, результаты проверки и оригинальный вклад.',
    },
    fa: {
      title: 'ارائه دفاع پروژه پایانی',
      prompt: 'برای دفاع از پروژه پایانی من ارائه‌ای تهیه کن که مسئله پژوهش، رویکرد، نتایج اعتبارسنجی و دستاوردهای اصیل را روشن نشان دهد.',
    },
    ar: {
      title: 'عرض مناقشة مشروع التخرج',
      prompt: 'أنشئ عرضاً لمناقشة مشروع تخرجي يوضح مشكلة البحث والمنهج المتبع ونتائج التحقق والإسهامات الأصلية.',
    },
    ja: {
      title: '卒業制作の発表資料',
      prompt: '私の卒業制作の発表資料を作成してください。研究課題、アプローチ、検証結果、独自の貢献を明確に示してください。',
    },
    ko: {
      title: '졸업 프로젝트 발표',
      prompt: '제 졸업 프로젝트의 심사 발표 자료를 만들어 주세요. 연구 문제, 접근 방법, 검증 결과, 독창적인 기여를 명확히 보여 주세요.',
    },
    pl: {
      title: 'Obrona projektu dyplomowego',
      prompt: 'Stwórz prezentację do obrony mojego projektu dyplomowego. Jasno przedstaw problem badawczy, podejście, wyniki weryfikacji i oryginalny wkład.',
    },
    hu: {
      title: 'Diplomaprojekt-védés',
      prompt: 'Készíts prezentációt a diplomaprojektem védéséhez, amely világosan bemutatja a kutatási problémát, a megközelítést, az ellenőrzés eredményeit és az eredeti hozzájárulást.',
    },
    fr: {
      title: 'Soutenance de projet de fin d’études',
      prompt: 'Crée une présentation de soutenance pour mon projet de fin d’études, exposant clairement la problématique, la démarche, les résultats de validation et les contributions originales.',
    },
    uk: {
      title: 'Захист дипломного проєкту',
      prompt: 'Створи презентацію для захисту мого дипломного проєкту. Чітко виклади дослідницьку проблему, підхід, результати перевірки та оригінальний внесок.',
    },
    tr: {
      title: 'Bitirme Projesi Savunması',
      prompt: 'Bitirme projem için araştırma problemini, yaklaşımı, doğrulama sonuçlarını ve özgün katkıları açıkça sunan bir savunma sunumu oluştur.',
    },
    th: {
      title: 'พรีเซนเทชันสอบโครงงานจบ',
      prompt: 'สร้างพรีเซนเทชันสอบโครงงานจบของฉัน โดยนำเสนอปัญหาวิจัย วิธีดำเนินงาน ผลการตรวจสอบ และผลงานริเริ่มอย่างชัดเจน',
    },
    it: {
      title: 'Discussione del progetto di laurea',
      prompt: 'Crea una presentazione per la discussione del mio progetto di laurea, illustrando chiaramente il problema di ricerca, l’approccio, i risultati della validazione e i contributi originali.',
    },
  },
  'example-guizang-ppt': {
    'zh-CN': {
      title: '品牌增长方案',
      prompt: '制作一份品牌增长方案，讲清目标人群、品牌定位、营销行动和衡量效果的指标。',
    },
    'zh-TW': {
      title: '品牌成長方案',
      prompt: '製作一份品牌成長方案，講清目標受眾、品牌定位、行銷行動和衡量成效的指標。',
    },
    en: {
      title: 'Brand Growth Plan',
      prompt: 'Create a brand growth plan that defines the target audience, brand positioning, marketing actions, and metrics for measuring results.',
    },
    id: {
      title: 'Rencana Pertumbuhan Merek',
      prompt: 'Buat rencana pertumbuhan merek yang menjelaskan target audiens, posisi merek, kegiatan pemasaran, dan metrik untuk mengukur hasil.',
    },
    de: {
      title: 'Markenwachstumsplan',
      prompt: 'Erstelle einen Markenwachstumsplan mit Zielgruppe, Markenpositionierung, Marketingmaßnahmen und Kennzahlen zur Erfolgsmessung.',
    },
    'pt-BR': {
      title: 'Plano de crescimento de marca',
      prompt: 'Crie um plano de crescimento de marca que defina público-alvo, posicionamento, ações de marketing e métricas para medir os resultados.',
    },
    'es-ES': {
      title: 'Plan de crecimiento de marca',
      prompt: 'Crea un plan de crecimiento de marca que defina el público objetivo, el posicionamiento, las acciones de marketing y las métricas para medir los resultados.',
    },
    ru: {
      title: 'План роста бренда',
      prompt: 'Создай план роста бренда с описанием целевой аудитории, позиционирования, маркетинговых действий и показателей для оценки результатов.',
    },
    fa: {
      title: 'برنامه رشد برند',
      prompt: 'یک برنامه رشد برند تهیه کن که مخاطب هدف، جایگاه برند، اقدامات بازاریابی و شاخص‌های سنجش نتیجه را مشخص کند.',
    },
    ar: {
      title: 'خطة نمو العلامة التجارية',
      prompt: 'أنشئ خطة لنمو العلامة التجارية تحدد الجمهور المستهدف والتموضع والإجراءات التسويقية ومؤشرات قياس النتائج.',
    },
    ja: {
      title: 'ブランド成長計画',
      prompt: 'ターゲット層、ブランドのポジショニング、マーケティング施策、成果を測る指標を明確にしたブランド成長計画を作成してください。',
    },
    ko: {
      title: '브랜드 성장 계획',
      prompt: '목표 고객, 브랜드 포지셔닝, 마케팅 활동, 성과 측정 지표를 정의하는 브랜드 성장 계획을 만들어 주세요.',
    },
    pl: {
      title: 'Plan rozwoju marki',
      prompt: 'Stwórz plan rozwoju marki definiujący grupę docelową, pozycjonowanie, działania marketingowe i wskaźniki pomiaru wyników.',
    },
    hu: {
      title: 'Márkanövekedési terv',
      prompt: 'Készíts márkanövekedési tervet a célközönség, a márkapozicionálás, a marketinglépések és az eredménymutatók meghatározásával.',
    },
    fr: {
      title: 'Plan de croissance de marque',
      prompt: 'Crée un plan de croissance de marque qui définit le public cible, le positionnement, les actions marketing et les indicateurs de résultats.',
    },
    uk: {
      title: 'План розвитку бренду',
      prompt: 'Створи план розвитку бренду з цільовою аудиторією, позиціонуванням, маркетинговими діями та показниками для оцінки результатів.',
    },
    tr: {
      title: 'Marka Büyüme Planı',
      prompt: 'Hedef kitleyi, marka konumlandırmasını, pazarlama adımlarını ve sonuçları ölçme metriklerini tanımlayan bir marka büyüme planı oluştur.',
    },
    th: {
      title: 'แผนเติบโตของแบรนด์',
      prompt: 'สร้างแผนเติบโตของแบรนด์ที่ระบุกลุ่มเป้าหมาย ตำแหน่งแบรนด์ กิจกรรมการตลาด และตัวชี้วัดผลลัพธ์',
    },
    it: {
      title: 'Piano di crescita del marchio',
      prompt: 'Crea un piano di crescita del marchio che definisca pubblico di riferimento, posizionamento, azioni di marketing e metriche per misurare i risultati.',
    },
  },
  'example-velar-luxury-real-estate': {
    'zh-CN': {
      title: '高端地产展示页',
      prompt: '为一个高端住宅项目设计展示页，用大幅建筑摄影和流畅的滚动动效呈现项目特色。',
    },
    'zh-TW': {
      title: '高端地產展示頁',
      prompt: '為一個高端住宅專案設計展示頁，用大幅建築攝影和流暢的捲動動畫呈現專案特色。',
    },
    en: {
      title: 'Luxury Property Website',
      prompt: 'Design a website for a luxury residential development, showcasing its character through large architectural photos and smooth scroll animations.',
    },
    id: {
      title: 'Situs Properti Mewah',
      prompt: 'Rancang situs untuk proyek hunian mewah, menampilkan karakternya melalui foto arsitektur berukuran besar dan animasi gulir yang mulus.',
    },
    de: {
      title: 'Website für Luxusimmobilien',
      prompt: 'Gestalte eine Website für ein luxuriöses Wohnprojekt, die dessen Charakter mit großformatigen Architekturfotos und flüssigen Scrollanimationen zeigt.',
    },
    'pt-BR': {
      title: 'Site de empreendimento de luxo',
      prompt: 'Crie um site para um empreendimento residencial de luxo, destacando sua identidade com grandes fotografias de arquitetura e animações suaves de rolagem.',
    },
    'es-ES': {
      title: 'Web de promoción inmobiliaria de lujo',
      prompt: 'Diseña una web para una promoción residencial de lujo que muestre su carácter con grandes fotografías de arquitectura y animaciones de desplazamiento fluidas.',
    },
    ru: {
      title: 'Сайт элитной недвижимости',
      prompt: 'Разработай сайт элитного жилого комплекса, передающий его характер с помощью крупных архитектурных фотографий и плавной анимации при прокрутке.',
    },
    fa: {
      title: 'وب‌سایت املاک لوکس',
      prompt: 'برای یک پروژه مسکونی لوکس، وب‌سایتی طراحی کن که با عکس‌های بزرگ معماری و انیمیشن‌های روان اسکرول، ویژگی‌های آن را نشان دهد.',
    },
    ar: {
      title: 'موقع عقارات فاخرة',
      prompt: 'صمّم موقعاً لمشروع سكني فاخر يعرض طابعه من خلال صور معمارية كبيرة وحركات تمرير سلسة.',
    },
    ja: {
      title: '高級住宅プロジェクトのサイト',
      prompt: '高級住宅プロジェクトの紹介サイトをデザインしてください。大きな建築写真となめらかなスクロールアニメーションで、その魅力を伝えてください。',
    },
    ko: {
      title: '고급 주거 단지 웹사이트',
      prompt: '고급 주거 단지를 소개하는 웹사이트를 디자인해 주세요. 대형 건축 사진과 부드러운 스크롤 애니메이션으로 프로젝트의 개성을 보여 주세요.',
    },
    pl: {
      title: 'Strona luksusowej inwestycji',
      prompt: 'Zaprojektuj stronę luksusowej inwestycji mieszkaniowej, podkreślającą jej charakter dużymi zdjęciami architektury i płynnymi animacjami przewijania.',
    },
    hu: {
      title: 'Luxuslakópark weboldala',
      prompt: 'Tervezz weboldalt egy luxus lakóingatlan-fejlesztésnek, amely nagy építészeti fotókkal és gördülékeny görgetési animációkkal mutatja be annak karakterét.',
    },
    fr: {
      title: 'Site immobilier haut de gamme',
      prompt: 'Conçois un site pour un programme résidentiel haut de gamme, en mettant en valeur son caractère avec de grandes photos d’architecture et des animations de défilement fluides.',
    },
    uk: {
      title: 'Сайт елітної нерухомості',
      prompt: 'Розроби сайт елітного житлового комплексу, що передає його характер великими архітектурними фотографіями та плавною анімацією під час прокручування.',
    },
    tr: {
      title: 'Lüks Konut Web Sitesi',
      prompt: 'Lüks bir konut projesi için büyük mimari fotoğraflar ve akıcı kaydırma animasyonlarıyla projenin karakterini yansıtan bir web sitesi tasarla.',
    },
    th: {
      title: 'เว็บไซต์โครงการที่พักหรู',
      prompt: 'ออกแบบเว็บไซต์สำหรับโครงการที่อยู่อาศัยระดับหรู แสดงเอกลักษณ์ด้วยภาพสถาปัตยกรรมขนาดใหญ่และแอนิเมชันเลื่อนหน้าที่ลื่นไหล',
    },
    it: {
      title: 'Sito immobiliare di lusso',
      prompt: 'Progetta un sito per un complesso residenziale di lusso, mettendone in risalto il carattere con grandi fotografie di architettura e animazioni di scorrimento fluide.',
    },
  },
  'example-hr-onboarding': {
    'zh-CN': {
      title: '新员工入职指南',
      prompt: '制作一份新员工入职指南，包含第一周日程、团队介绍、学习任务和设备清单。',
    },
    'zh-TW': {
      title: '新員工入職指南',
      prompt: '製作一份新員工入職指南，包含第一週日程、團隊介紹、學習任務和設備清單。',
    },
    en: {
      title: 'New Hire Onboarding Guide',
      prompt: 'Create a new hire onboarding guide with a first-week schedule, team introductions, learning tasks, and an equipment checklist.',
    },
    id: {
      title: 'Panduan Karyawan Baru',
      prompt: 'Buat panduan karyawan baru dengan jadwal minggu pertama, perkenalan tim, tugas pembelajaran, dan daftar perlengkapan.',
    },
    de: {
      title: 'Leitfaden für neue Mitarbeitende',
      prompt: 'Erstelle einen Leitfaden für neue Mitarbeitende mit einem Plan für die erste Woche, Teamvorstellungen, Lernaufgaben und einer Ausstattungsliste.',
    },
    'pt-BR': {
      title: 'Guia de integração de novos funcionários',
      prompt: 'Crie um guia de integração de novos funcionários com agenda da primeira semana, apresentação da equipe, atividades de aprendizagem e lista de equipamentos.',
    },
    'es-ES': {
      title: 'Guía de incorporación',
      prompt: 'Crea una guía para nuevos empleados con el programa de la primera semana, presentaciones del equipo, tareas de aprendizaje y una lista de equipos.',
    },
    ru: {
      title: 'Руководство для новых сотрудников',
      prompt: 'Создай руководство для новых сотрудников с расписанием первой недели, знакомством с командой, учебными заданиями и списком оборудования.',
    },
    fa: {
      title: 'راهنمای کارکنان جدید',
      prompt: 'یک راهنمای کارکنان جدید با برنامه هفته اول، معرفی تیم، فعالیت‌های یادگیری و فهرست تجهیزات تهیه کن.',
    },
    ar: {
      title: 'دليل الموظفين الجدد',
      prompt: 'أنشئ دليلاً للموظفين الجدد يتضمن جدول الأسبوع الأول والتعريف بالفريق ومهام التعلم وقائمة المعدات.',
    },
    ja: {
      title: '新入社員向けガイド',
      prompt: '新入社員向けガイドを作成してください。最初の1週間の予定、チーム紹介、学習課題、備品チェックリストを含めてください。',
    },
    ko: {
      title: '신입 직원 온보딩 가이드',
      prompt: '첫 주 일정, 팀 소개, 학습 과제, 장비 체크리스트가 포함된 신입 직원 온보딩 가이드를 만들어 주세요.',
    },
    pl: {
      title: 'Przewodnik dla nowych pracowników',
      prompt: 'Stwórz przewodnik dla nowych pracowników z harmonogramem pierwszego tygodnia, przedstawieniem zespołu, zadaniami edukacyjnymi i listą sprzętu.',
    },
    hu: {
      title: 'Új munkatársak útmutatója',
      prompt: 'Készíts útmutatót az új munkatársaknak az első hét programjával, a csapat bemutatásával, tanulási feladatokkal és eszközlistával.',
    },
    fr: {
      title: 'Guide d’intégration',
      prompt: 'Crée un guide pour les nouvelles recrues avec le programme de la première semaine, la présentation de l’équipe, des activités d’apprentissage et une liste du matériel.',
    },
    uk: {
      title: 'Посібник для нових співробітників',
      prompt: 'Створи посібник для нових співробітників із розкладом першого тижня, знайомством із командою, навчальними завданнями та списком обладнання.',
    },
    tr: {
      title: 'Yeni Çalışan Rehberi',
      prompt: 'İlk hafta programı, ekip tanıtımları, öğrenme görevleri ve ekipman listesi içeren bir yeni çalışan rehberi oluştur.',
    },
    th: {
      title: 'คู่มือพนักงานใหม่',
      prompt: 'สร้างคู่มือพนักงานใหม่ที่มีตารางสัปดาห์แรก การแนะนำทีม กิจกรรมการเรียนรู้ และรายการอุปกรณ์',
    },
    it: {
      title: 'Guida per nuovi dipendenti',
      prompt: 'Crea una guida per nuovi dipendenti con il programma della prima settimana, presentazioni del team, attività formative e un elenco delle attrezzature.',
    },
  },
  'example-pricing-page': {
    'zh-CN': {
      title: '产品定价页',
      prompt: '设计一个产品定价页，清楚对比各套餐的价格与功能，并解答常见购买问题。',
    },
    'zh-TW': {
      title: '產品定價頁',
      prompt: '設計一個產品定價頁，清楚比較各方案的價格與功能，並解答常見購買問題。',
    },
    en: {
      title: 'Product Pricing Page',
      prompt: 'Design a product pricing page that clearly compares plan prices and features and answers common purchase questions.',
    },
    id: {
      title: 'Halaman Harga Produk',
      prompt: 'Rancang halaman harga produk yang membandingkan harga dan fitur setiap paket dengan jelas serta menjawab pertanyaan pembelian yang umum.',
    },
    de: {
      title: 'Produktpreisseite',
      prompt: 'Gestalte eine Produktpreisseite, die Preise und Funktionen der Tarife klar vergleicht und häufige Fragen zum Kauf beantwortet.',
    },
    'pt-BR': {
      title: 'Página de preços',
      prompt: 'Crie uma página de preços que compare claramente os valores e recursos dos planos e responda às dúvidas comuns sobre a compra.',
    },
    'es-ES': {
      title: 'Página de precios',
      prompt: 'Diseña una página de precios que compare claramente los importes y las funciones de los planes y responda a las dudas habituales de compra.',
    },
    ru: {
      title: 'Страница тарифов',
      prompt: 'Разработай страницу тарифов, которая наглядно сравнивает цены и возможности планов и отвечает на частые вопросы о покупке.',
    },
    fa: {
      title: 'صفحه قیمت‌گذاری محصول',
      prompt: 'یک صفحه قیمت‌گذاری طراحی کن که قیمت و قابلیت‌های طرح‌ها را به‌روشنی مقایسه کند و به پرسش‌های رایج خرید پاسخ دهد.',
    },
    ar: {
      title: 'صفحة أسعار المنتج',
      prompt: 'صمّم صفحة أسعار تقارن بوضوح بين أسعار الخطط وميزاتها وتجيب عن أسئلة الشراء الشائعة.',
    },
    ja: {
      title: '料金プランページ',
      prompt: '各プランの料金と機能をわかりやすく比較し、購入時によくある質問に答える料金ページをデザインしてください。',
    },
    ko: {
      title: '제품 요금제 페이지',
      prompt: '각 요금제의 가격과 기능을 명확히 비교하고 구매 관련 자주 묻는 질문에 답하는 요금제 페이지를 디자인해 주세요.',
    },
    pl: {
      title: 'Strona cennika',
      prompt: 'Zaprojektuj stronę cennika, która jasno porównuje ceny i funkcje planów oraz odpowiada na częste pytania dotyczące zakupu.',
    },
    hu: {
      title: 'Termékárak oldala',
      prompt: 'Tervezz árazási oldalt, amely egyértelműen összehasonlítja a csomagok árait és funkcióit, és megválaszolja a gyakori vásárlási kérdéseket.',
    },
    fr: {
      title: 'Page de tarifs',
      prompt: 'Conçois une page de tarifs qui compare clairement les prix et les fonctionnalités des offres et répond aux questions d’achat courantes.',
    },
    uk: {
      title: 'Сторінка тарифів',
      prompt: 'Розроби сторінку тарифів, що наочно порівнює ціни й можливості планів та відповідає на поширені запитання щодо купівлі.',
    },
    tr: {
      title: 'Ürün Fiyatlandırma Sayfası',
      prompt: 'Paket fiyatlarını ve özelliklerini açıkça karşılaştıran, sık sorulan satın alma sorularını yanıtlayan bir fiyatlandırma sayfası tasarla.',
    },
    th: {
      title: 'หน้าราคาผลิตภัณฑ์',
      prompt: 'ออกแบบหน้าราคาที่เปรียบเทียบราคาและฟีเจอร์แต่ละแพ็กเกจอย่างชัดเจน พร้อมตอบคำถามที่พบบ่อยก่อนซื้อ',
    },
    it: {
      title: 'Pagina dei prezzi',
      prompt: 'Progetta una pagina dei prezzi che confronti chiaramente costi e funzioni dei piani e risponda alle domande d’acquisto più comuni.',
    },
  },
  'example-gamified-app': {
    'zh-CN': {
      title: '游戏化习惯应用',
      prompt: '设计一款把每日习惯变成闯关任务的手机应用，用经验值、等级和连续打卡记录成长。',
    },
    'zh-TW': {
      title: '遊戲化習慣應用',
      prompt: '設計一款把每日習慣變成闖關任務的手機應用，用經驗值、等級和連續打卡記錄成長。',
    },
    en: {
      title: 'Gamified Habit App',
      prompt: 'Design a mobile app that turns daily habits into quests, tracking progress with experience points, levels, and daily streaks.',
    },
    id: {
      title: 'Aplikasi Kebiasaan Bergamifikasi',
      prompt: 'Rancang aplikasi seluler yang mengubah kebiasaan harian menjadi misi, dengan poin pengalaman, level, dan rangkaian hari berturut-turut untuk memantau perkembangan.',
    },
    de: {
      title: 'Gamifizierte Gewohnheiten-App',
      prompt: 'Gestalte eine mobile App, die tägliche Gewohnheiten in Aufgaben verwandelt und Fortschritte mit Erfahrungspunkten, Leveln und Serien aufeinanderfolgender Tage erfasst.',
    },
    'pt-BR': {
      title: 'App de hábitos gamificado',
      prompt: 'Crie um aplicativo que transforme hábitos diários em missões, acompanhando o progresso com pontos de experiência, níveis e sequências de dias consecutivos.',
    },
    'es-ES': {
      title: 'App de hábitos gamificada',
      prompt: 'Diseña una aplicación móvil que convierta los hábitos diarios en misiones y registre el progreso con puntos de experiencia, niveles y rachas de días consecutivos.',
    },
    ru: {
      title: 'Приложение привычек с геймификацией',
      prompt: 'Разработай мобильное приложение, превращающее ежедневные привычки в задания и отслеживающее прогресс с помощью очков опыта, уровней и серий последовательных дней.',
    },
    fa: {
      title: 'اپ عادت‌سازی بازی‌وار',
      prompt: 'یک اپ موبایل طراحی کن که عادت‌های روزانه را به مأموریت تبدیل کند و پیشرفت را با امتیاز تجربه، سطح و زنجیره روزهای متوالی دنبال کند.',
    },
    ar: {
      title: 'تطبيق عادات بأسلوب الألعاب',
      prompt: 'صمّم تطبيقاً للهاتف يحوّل العادات اليومية إلى مهام، ويتابع التقدم عبر نقاط الخبرة والمستويات وسلاسل الأيام المتتالية.',
    },
    ja: {
      title: 'ゲーム感覚の習慣化アプリ',
      prompt: '毎日の習慣をクエストに変えるモバイルアプリをデザインしてください。経験値、レベル、連続達成日数で成長を記録できるようにしてください。',
    },
    ko: {
      title: '게임형 습관 앱',
      prompt: '매일의 습관을 퀘스트로 바꾸는 모바일 앱을 디자인해 주세요. 경험치, 레벨, 연속 달성 일수로 성장을 기록할 수 있게 해 주세요.',
    },
    pl: {
      title: 'Aplikacja nawyków z grywalizacją',
      prompt: 'Zaprojektuj aplikację mobilną, która zamienia codzienne nawyki w misje i śledzi postępy za pomocą punktów doświadczenia, poziomów i serii kolejnych dni.',
    },
    hu: {
      title: 'Játékos szokásépítő alkalmazás',
      prompt: 'Tervezz mobilalkalmazást, amely a napi szokásokat küldetésekké alakítja, és tapasztalati pontokkal, szintekkel és egymást követő napok sorozataival követi a fejlődést.',
    },
    fr: {
      title: 'Application d’habitudes gamifiée',
      prompt: 'Conçois une application mobile qui transforme les habitudes quotidiennes en quêtes et suit les progrès avec des points d’expérience, des niveaux et des séries de jours consécutifs.',
    },
    uk: {
      title: 'Застосунок звичок із гейміфікацією',
      prompt: 'Розроби мобільний застосунок, що перетворює щоденні звички на завдання та відстежує прогрес за допомогою балів досвіду, рівнів і серій послідовних днів.',
    },
    tr: {
      title: 'Oyunlaştırılmış Alışkanlık Uygulaması',
      prompt: 'Günlük alışkanlıkları görevlere dönüştüren; deneyim puanları, seviyeler ve ardışık gün serileriyle ilerlemeyi takip eden bir mobil uygulama tasarla.',
    },
    th: {
      title: 'แอปสร้างนิสัยแบบเกม',
      prompt: 'ออกแบบแอปมือถือที่เปลี่ยนนิสัยประจำวันเป็นภารกิจ โดยติดตามพัฒนาการด้วยค่าประสบการณ์ เลเวล และจำนวนวันที่ทำต่อเนื่อง',
    },
    it: {
      title: 'App di abitudini gamificata',
      prompt: 'Progetta un’app mobile che trasformi le abitudini quotidiane in missioni, monitorando i progressi con punti esperienza, livelli e serie di giorni consecutivi.',
    },
  },
  'example-open-design-landing': {
    'zh-CN': {
      title: '拼贴风品牌官网',
      prompt: '为我的品牌设计一个杂志拼贴风官网，用醒目的标题、图片拼贴和滚动动效介绍产品。',
    },
    'zh-TW': {
      title: '拼貼風品牌官網',
      prompt: '為我的品牌設計一個雜誌拼貼風官網，用醒目的標題、圖片拼貼和捲動動畫介紹產品。',
    },
    en: {
      title: 'Editorial Collage Brand Website',
      prompt: 'Design a magazine-inspired website for my brand, introducing the product with bold headlines, image collages, and scroll animations.',
    },
    id: {
      title: 'Situs Merek Bergaya Kolase',
      prompt: 'Rancang situs bergaya majalah untuk merek saya, memperkenalkan produk melalui judul yang menonjol, kolase gambar, dan animasi gulir.',
    },
    de: {
      title: 'Markenwebsite im Collage-Stil',
      prompt: 'Gestalte eine magazininspirierte Website für meine Marke, die das Produkt mit auffälligen Überschriften, Bildcollagen und Scrollanimationen vorstellt.',
    },
    'pt-BR': {
      title: 'Site de marca em estilo colagem',
      prompt: 'Crie um site inspirado em revistas para minha marca, apresentando o produto com títulos marcantes, colagens de imagens e animações de rolagem.',
    },
    'es-ES': {
      title: 'Web de marca con estilo collage',
      prompt: 'Diseña una web inspirada en revistas para mi marca, presentando el producto con titulares llamativos, collages de imágenes y animaciones de desplazamiento.',
    },
    ru: {
      title: 'Сайт бренда в стиле коллажа',
      prompt: 'Разработай для моего бренда сайт в журнальном стиле, представляющий продукт с помощью выразительных заголовков, фотоколлажей и анимации при прокрутке.',
    },
    fa: {
      title: 'وب‌سایت برند به سبک کلاژ',
      prompt: 'برای برند من وب‌سایتی الهام‌گرفته از مجله طراحی کن که محصول را با تیترهای برجسته، کلاژ تصاویر و انیمیشن‌های اسکرول معرفی کند.',
    },
    ar: {
      title: 'موقع علامة تجارية بأسلوب الكولاج',
      prompt: 'صمّم موقعاً مستوحى من المجلات لعلامتي التجارية يقدّم المنتج بعناوين بارزة وصور مجمّعة وحركات تمرير.',
    },
    ja: {
      title: 'コラージュ風ブランドサイト',
      prompt: '私のブランド向けに、雑誌を思わせるサイトをデザインしてください。印象的な見出し、画像のコラージュ、スクロールアニメーションで製品を紹介してください。',
    },
    ko: {
      title: '콜라주 스타일 브랜드 웹사이트',
      prompt: '제 브랜드를 위한 잡지 스타일 웹사이트를 디자인해 주세요. 눈에 띄는 제목, 이미지 콜라주, 스크롤 애니메이션으로 제품을 소개해 주세요.',
    },
    pl: {
      title: 'Strona marki w stylu kolażu',
      prompt: 'Zaprojektuj dla mojej marki stronę inspirowaną magazynami, przedstawiającą produkt za pomocą wyrazistych nagłówków, kolaży zdjęć i animacji przewijania.',
    },
    hu: {
      title: 'Kollázs stílusú márkaweboldal',
      prompt: 'Tervezz magazinok ihlette weboldalt a márkámnak, amely feltűnő címekkel, képkollázsokkal és görgetési animációkkal mutatja be a terméket.',
    },
    fr: {
      title: 'Site de marque en style collage',
      prompt: 'Conçois un site inspiré des magazines pour ma marque, présentant le produit avec des titres marquants, des collages d’images et des animations de défilement.',
    },
    uk: {
      title: 'Сайт бренду в стилі колажу',
      prompt: 'Розроби для мого бренду сайт у журнальному стилі, який представляє продукт виразними заголовками, фотоколажами та анімацією під час прокручування.',
    },
    tr: {
      title: 'Kolaj Tarzı Marka Web Sitesi',
      prompt: 'Markam için ürünü dikkat çekici başlıklar, görsel kolajlar ve kaydırma animasyonlarıyla tanıtan, dergilerden esinlenmiş bir web sitesi tasarla.',
    },
    th: {
      title: 'เว็บไซต์แบรนด์สไตล์คอลลาจ',
      prompt: 'ออกแบบเว็บไซต์ที่ได้แรงบันดาลใจจากนิตยสารให้แบรนด์ของฉัน แนะนำผลิตภัณฑ์ผ่านหัวข้อที่สะดุดตา ภาพคอลลาจ และแอนิเมชันเลื่อนหน้า',
    },
    it: {
      title: 'Sito del marchio in stile collage',
      prompt: 'Progetta un sito ispirato alle riviste per il mio marchio, presentando il prodotto con titoli d’impatto, collage di immagini e animazioni di scorrimento.',
    },
  },
  'example-motion-showreel': {
    'zh-CN': {
      title: '动效设计师自荐片',
      prompt: '做一段动感的 15 秒动效视频，展示你是一位多么出色的动效设计师，就像放进简历里的作品集自荐片。全力以赴。',
    },
    'zh-TW': {
      title: '動效設計師自薦片',
      prompt: '做一段動感的 15 秒動效影片，展示你是一位多麼出色的動效設計師，就像放進履歷裡的作品集自薦片。全力以赴。',
    },
    en: {
      title: 'Motion Designer Showreel',
      prompt: 'make a dynamic 15-second motion graphics video that shows what an incredible motion designer you are, like it\'s your showreel for a résumé. go all out.',
    },
    id: {
      title: 'Showreel Desainer Motion',
      prompt: 'buat video motion graphics dinamis 15 detik yang menunjukkan betapa hebatnya kamu sebagai desainer motion, seperti showreel untuk CV-mu. kerahkan semuanya.',
    },
    de: {
      title: 'Motion-Designer-Showreel',
      prompt: 'Mach ein dynamisches 15-Sekunden-Motion-Graphics-Video, das zeigt, was für ein unglaublicher Motion Designer du bist – wie dein Showreel für den Lebenslauf. Gib alles.',
    },
    'pt-BR': {
      title: 'Showreel de Motion Designer',
      prompt: 'faça um vídeo de motion graphics dinâmico de 15 segundos que mostre o motion designer incrível que você é, como o seu showreel para o currículo. capriche ao máximo.',
    },
    'es-ES': {
      title: 'Showreel de motion designer',
      prompt: 'haz un vídeo de motion graphics dinámico de 15 segundos que muestre el increíble motion designer que eres, como tu showreel para el currículum. dalo todo.',
    },
    ru: {
      title: 'Шоурил моушн-дизайнера',
      prompt: 'сделай динамичное 15-секундное моушн-видео, которое покажет, какой ты потрясающий моушн-дизайнер, — как шоурил для резюме. выложись на полную.',
    },
    fa: {
      title: 'شوریل طراح موشن',
      prompt: 'یک ویدیوی موشن‌گرافیک پویا و ۱۵ ثانیه‌ای بساز که نشان دهد چه طراح موشن فوق‌العاده‌ای هستی، مثل شوریل رزومه‌ات. سنگ تمام بگذار.',
    },
    ar: {
      title: 'شوريل مصمم موشن',
      prompt: 'اصنع فيديو موشن جرافيك ديناميكيًا مدته 15 ثانية يُظهر كم أنت مصمم موشن مذهل، كأنه الشوريل الخاص بسيرتك الذاتية. ابذل أقصى ما لديك.',
    },
    ja: {
      title: 'モーションデザイナーのショーリール',
      prompt: 'あなたがどれほどすごいモーションデザイナーかを見せる、ダイナミックな 15 秒のモーショングラフィックス動画を作って。履歴書に添えるショーリールのように。全力で。',
    },
    ko: {
      title: '모션 디자이너 쇼릴',
      prompt: '당신이 얼마나 뛰어난 모션 디자이너인지 보여 주는 역동적인 15초 모션 그래픽 영상을 만들어 줘. 이력서용 쇼릴처럼. 전력을 다해서.',
    },
    pl: {
      title: 'Showreel motion designera',
      prompt: 'zrób dynamiczny, 15-sekundowy film motion graphics, który pokaże, jak niesamowitym motion designerem jesteś — jak showreel do CV. daj z siebie wszystko.',
    },
    hu: {
      title: 'Motion designer showreel',
      prompt: 'készíts egy dinamikus, 15 másodperces motion graphics videót, ami megmutatja, milyen elképesztő motion designer vagy — mint egy showreel az önéletrajzodhoz. hozd ki belőle a maximumot.',
    },
    fr: {
      title: 'Showreel de motion designer',
      prompt: 'fais une vidéo de motion design dynamique de 15 secondes qui montre quel motion designer incroyable tu es, comme ton showreel pour un CV. donne tout.',
    },
    uk: {
      title: 'Шоурил моушн-дизайнера',
      prompt: 'зроби динамічне 15-секундне моушн-відео, яке покаже, який ти неймовірний моушн-дизайнер, — як шоурил для резюме. викладись на повну.',
    },
    tr: {
      title: 'Motion tasarımcısı showreel',
      prompt: 'ne kadar inanılmaz bir motion tasarımcısı olduğunu gösteren, özgeçmişin için bir showreel gibi dinamik, 15 saniyelik bir motion graphics videosu yap. elinden gelenin en iyisini yap.',
    },
    th: {
      title: 'โชว์รีลนักออกแบบโมชัน',
      prompt: 'ทำวิดีโอโมชันกราฟิกไดนามิกยาว 15 วินาทีที่แสดงให้เห็นว่าคุณเป็นนักออกแบบโมชันที่เก่งแค่ไหน เหมือนโชว์รีลสำหรับเรซูเม่ ทุ่มให้สุด',
    },
    it: {
      title: 'Showreel da motion designer',
      prompt: 'crea un video di motion graphics dinamico di 15 secondi che mostri che motion designer incredibile sei, come il tuo showreel per il curriculum. dai il massimo.',
    },
  },
  'example-motion-product-promo': {
    'zh-CN': {
      title: '产品宣传片',
      prompt: '为虚构的创作者支付产品 Pennyflow 做一支 15 秒的产品宣传片，按节拍剪辑。一个网点风格的 3D 吉祥物小声说「psst…」，然后问「Got something to sell?」。课程、电子书、App 三张商品卡片弹到蓝色画面上，手机商店逐项填满，结账面板依次处理刷卡付款、加购、增值税和收款，最后盖上「Handled.」印章。结尾是「You create. We handle the flow.」和带 Start selling 按钮的 Pennyflow 品牌字。',
    },
    'zh-TW': {
      title: '產品宣傳片',
      prompt: '為虛構的創作者支付產品 Pennyflow 做一支 15 秒的產品宣傳片，依節拍剪輯。一個網點風格的 3D 吉祥物小聲說「psst…」，然後問「Got something to sell?」。課程、電子書、App 三張商品卡片彈到藍色畫面上，手機商店逐項填滿，結帳面板依序處理刷卡付款、加購、增值稅和收款，最後蓋上「Handled.」印章。結尾是「You create. We handle the flow.」和帶 Start selling 按鈕的 Pennyflow 品牌字。',
    },
    en: {
      title: 'Product Promo',
      prompt: 'Make a 15-second product promo for Pennyflow, a fictional payments product for creators, cut on the beat. A halftone 3D mascot whispers "psst…" and asks "Got something to sell?". Cards for courses, ebooks and apps pop onto a blue screen, a phone store fills in, and a checkout board handles card payment, an upsell, VAT and payouts before a "Handled." stamp lands. End on "You create. We handle the flow." and the Pennyflow wordmark with a Start selling button.',
    },
    id: {
      title: 'Video Promosi Produk',
      prompt: 'Buat video promosi produk 15 detik untuk Pennyflow, produk pembayaran fiktif untuk kreator, dipotong mengikuti ketukan. Maskot 3D bergaya halftone berbisik "psst…" lalu bertanya "Got something to sell?". Kartu kursus, ebook, dan aplikasi muncul di layar biru, toko di ponsel terisi, dan papan checkout menangani pembayaran kartu, upsell, PPN, serta pencairan dana sebelum cap "Handled." mendarat. Tutup dengan "You create. We handle the flow." dan logo Pennyflow dengan tombol Start selling.',
    },
    de: {
      title: 'Produkt-Promo',
      prompt: 'Mach ein 15-sekündiges Produkt-Promo für Pennyflow, ein fiktives Zahlungsprodukt für Creator, im Takt geschnitten. Ein 3D-Maskottchen im Halftone-Look flüstert „psst…“ und fragt „Got something to sell?“. Karten für Kurse, E-Books und Apps springen auf einen blauen Screen, ein Handy-Shop füllt sich, und ein Checkout-Board erledigt Kartenzahlung, Upsell, Mehrwertsteuer und Auszahlungen, bevor der Stempel „Handled.“ landet. Schluss mit „You create. We handle the flow.“ und der Pennyflow-Wortmarke mit einem Start-selling-Button.',
    },
    'pt-BR': {
      title: 'Vídeo promocional de produto',
      prompt: 'Faça um vídeo promocional de 15 segundos para a Pennyflow, um produto fictício de pagamentos para criadores, cortado no ritmo. Um mascote 3D em meio-tom sussurra "psst…" e pergunta "Got something to sell?". Cards de cursos, e-books e apps surgem numa tela azul, uma loja no celular se preenche e um painel de checkout cuida do pagamento com cartão, do upsell, do imposto e dos repasses até o carimbo "Handled." cair. Termine com "You create. We handle the flow." e a logomarca Pennyflow com um botão Start selling.',
    },
    'es-ES': {
      title: 'Vídeo promocional de producto',
      prompt: 'Haz un vídeo promocional de 15 segundos para Pennyflow, un producto ficticio de pagos para creadores, montado al ritmo. Una mascota 3D en semitono susurra "psst…" y pregunta "Got something to sell?". Tarjetas de cursos, ebooks y apps aparecen sobre una pantalla azul, una tienda en el móvil se completa y un panel de pago gestiona el cobro con tarjeta, la venta adicional, el IVA y los pagos hasta que cae el sello "Handled.". Termina con "You create. We handle the flow." y el logotipo de Pennyflow con un botón Start selling.',
    },
    ru: {
      title: 'Промо-ролик продукта',
      prompt: 'Сделай 15-секундный промо-ролик для Pennyflow — вымышленного платёжного продукта для авторов, с монтажом в ритм. 3D-маскот в растровой стилистике шепчет «psst…» и спрашивает «Got something to sell?». Карточки курсов, электронных книг и приложений появляются на синем экране, магазин в телефоне заполняется, а панель оплаты обрабатывает оплату картой, допродажу, НДС и выплаты, пока не опускается штамп «Handled.». Финал — «You create. We handle the flow.» и логотип Pennyflow с кнопкой Start selling.',
    },
    fa: {
      title: 'ویدیوی تبلیغاتی محصول',
      prompt: 'یک ویدیوی تبلیغاتی ۱۵ ثانیه‌ای برای Pennyflow بساز، محصول پرداخت خیالی برای سازندگان محتوا، با تدوین هماهنگ با ضرب. یک شخصیت سه‌بعدی با بافت نقطه‌ای آرام می‌گوید «psst…» و می‌پرسد «Got something to sell?». کارت‌های دوره، کتاب الکترونیکی و اپلیکیشن روی صفحه‌ای آبی ظاهر می‌شوند، فروشگاهی در گوشی پر می‌شود و صفحهٔ پرداخت، پرداخت با کارت، فروش افزوده، مالیات و تسویه را انجام می‌دهد تا مهر «Handled.» بخورد. با «You create. We handle the flow.» و لوگوی Pennyflow همراه دکمهٔ Start selling تمام کن.',
    },
    ar: {
      title: 'فيديو ترويجي لمنتج',
      prompt: 'اصنع فيديو ترويجيًا مدته 15 ثانية لـ Pennyflow، وهو منتج دفع خيالي لصنّاع المحتوى، مع مونتاج على الإيقاع. تميمة ثلاثية الأبعاد بنمط النقاط النصفية تهمس "psst…" ثم تسأل "Got something to sell?". تظهر بطاقات للدورات والكتب الإلكترونية والتطبيقات على شاشة زرقاء، ويمتلئ متجر على الهاتف، وتتولى لوحة الدفع الدفع بالبطاقة والبيع الإضافي وضريبة القيمة المضافة والتحويلات حتى يهبط ختم "Handled.". اختم بعبارة "You create. We handle the flow." وشعار Pennyflow مع زر Start selling.',
    },
    ja: {
      title: '製品プロモーション動画',
      prompt: 'クリエイター向けの架空の決済サービス Pennyflow の 15 秒プロモーション動画を、ビートに合わせた編集で作って。網点スタイルの 3D マスコットが「psst…」とささやき、「Got something to sell?」と問いかける。講座・電子書籍・アプリのカードが青い画面にポップし、スマホのストアが埋まり、決済ボードがカード決済、アップセル、付加価値税、入金を処理して「Handled.」のスタンプが押される。最後は「You create. We handle the flow.」と、Start selling ボタン付きの Pennyflow のロゴで締める。',
    },
    ko: {
      title: '제품 홍보 영상',
      prompt: '크리에이터를 위한 가상의 결제 서비스 Pennyflow의 15초 제품 홍보 영상을 비트에 맞춰 편집해서 만들어 줘. 망점 스타일의 3D 마스코트가 "psst…"라고 속삭이고 "Got something to sell?"라고 묻는다. 강의, 전자책, 앱 카드가 파란 화면에 튀어나오고, 휴대폰 스토어가 채워지고, 결제 보드가 카드 결제, 추가 판매, 부가세, 정산을 처리한 뒤 "Handled." 도장이 찍힌다. 마지막은 "You create. We handle the flow."와 Start selling 버튼이 있는 Pennyflow 로고로 끝낸다.',
    },
    pl: {
      title: 'Film promocyjny produktu',
      prompt: 'Zrób 15-sekundowy film promocyjny dla Pennyflow, fikcyjnego produktu płatniczego dla twórców, zmontowany do rytmu. Maskotka 3D w stylu rastra szepcze „psst…” i pyta „Got something to sell?”. Karty kursów, e-booków i aplikacji wyskakują na niebieskim ekranie, sklep w telefonie się zapełnia, a panel płatności obsługuje płatność kartą, dosprzedaż, VAT i wypłaty, aż spada pieczątka „Handled.”. Zakończ hasłem „You create. We handle the flow.” i logo Pennyflow z przyciskiem Start selling.',
    },
    hu: {
      title: 'Termékpromóciós videó',
      prompt: 'Készíts egy 15 másodperces termékpromót a Pennyflow-nak, egy kitalált, alkotóknak szóló fizetési terméknek, ütemre vágva. Egy rasztermintás 3D kabalafigura azt suttogja: „psst…”, majd megkérdezi: „Got something to sell?”. Kurzus-, e-könyv- és alkalmazáskártyák ugranak egy kék képernyőre, megtelik egy mobilos webshop, a fizetési panel pedig intézi a kártyás fizetést, a kiegészítő vásárlást, az áfát és a kifizetéseket, mire lecsap a „Handled.” pecsét. Zárd a „You create. We handle the flow.” felirattal és a Pennyflow logóval egy Start selling gombbal.',
    },
    fr: {
      title: 'Vidéo promo produit',
      prompt: 'Fais une vidéo promo produit de 15 secondes pour Pennyflow, un produit de paiement fictif pour les créateurs, montée sur le rythme. Une mascotte 3D en trame chuchote « psst… » puis demande « Got something to sell? ». Des cartes de cours, d’ebooks et d’apps surgissent sur un écran bleu, une boutique sur téléphone se remplit, et un tableau de paiement gère le paiement par carte, la vente additionnelle, la TVA et les versements avant que le tampon « Handled. » ne tombe. Termine sur « You create. We handle the flow. » et le logo Pennyflow avec un bouton Start selling.',
    },
    uk: {
      title: 'Промо-ролик продукту',
      prompt: 'Зроби 15-секундний промо-ролик для Pennyflow — вигаданого платіжного продукту для авторів, із монтажем у ритм. 3D-маскот у растровій стилістиці шепоче «psst…» і питає «Got something to sell?». Картки курсів, електронних книжок і застосунків з’являються на синьому екрані, магазин у телефоні заповнюється, а панель оплати обробляє оплату карткою, допродаж, ПДВ і виплати, доки не опускається штамп «Handled.». Фінал — «You create. We handle the flow.» і логотип Pennyflow з кнопкою Start selling.',
    },
    tr: {
      title: 'Ürün Tanıtım Videosu',
      prompt: 'İçerik üreticileri için kurgusal bir ödeme ürünü olan Pennyflow için ritme göre kurgulanmış 15 saniyelik bir tanıtım videosu yap. Raster dokulu 3D bir maskot "psst…" diye fısıldıyor ve "Got something to sell?" diye soruyor. Kurs, e-kitap ve uygulama kartları mavi bir ekrana fırlıyor, telefondaki mağaza doluyor ve ödeme panosu kartla ödemeyi, ek satışı, KDV’yi ve ödemeleri hallediyor; ardından "Handled." damgası iniyor. "You create. We handle the flow." ve Start selling düğmeli Pennyflow logosuyla bitir.',
    },
    th: {
      title: 'วิดีโอโปรโมตสินค้า',
      prompt: 'ทำวิดีโอโปรโมตสินค้า 15 วินาทีให้ Pennyflow ผลิตภัณฑ์รับชำระเงินสมมติสำหรับครีเอเตอร์ ตัดต่อตามจังหวะ มาสคอต 3D ลายฮาล์ฟโทนกระซิบว่า "psst…" แล้วถามว่า "Got something to sell?" การ์ดคอร์ส อีบุ๊ก และแอปเด้งขึ้นบนจอสีน้ำเงิน ร้านค้าในมือถือค่อย ๆ เต็ม และแผงชำระเงินจัดการการจ่ายด้วยบัตร การขายเพิ่ม ภาษีมูลค่าเพิ่ม และการโอนเงิน ก่อนตรา "Handled." จะประทับลง ปิดท้ายด้วย "You create. We handle the flow." และโลโก้ Pennyflow พร้อมปุ่ม Start selling',
    },
    it: {
      title: 'Video promozionale di prodotto',
      prompt: 'Crea un video promozionale di 15 secondi per Pennyflow, un prodotto di pagamento di fantasia per creator, montato a tempo. Una mascotte 3D a retino sussurra "psst…" e chiede "Got something to sell?". Schede di corsi, ebook e app spuntano su uno schermo blu, un negozio sul telefono si riempie e un pannello di pagamento gestisce pagamento con carta, upsell, IVA e accrediti prima che cada il timbro "Handled.". Chiudi con "You create. We handle the flow." e il logo Pennyflow con un pulsante Start selling.',
    },
  },
  'example-motion-ui-morph': {
    'zh-CN': {
      title: '纯代码 UI 动效',
      prompt: '做一段 14 秒、Dribbble 水准的 UI 动效，120 BPM，7 小节，每一拍都有变化。全程只有一个形状、不切镜：从 Generate 按钮依次变成加载、对勾、灵动岛、带播放/暂停变形的音乐播放器、被拖动的进度条、拖过最大值会被拉长的音量滑块、开关、液态标签指示器、自动绘制并带悬停提示的图表、可以输入的 ⌘K 命令面板、提示条，最后回到按钮。所有变化都由光标真实的点击和拖拽驱动。浅暖灰背景、黑白组件、一款干净的界面字体（Geist）。全程弹簧动画，最多一点点回弹。最后一帧和第一帧相同，可以无缝循环。',
    },
    'zh-TW': {
      title: '純程式碼 UI 動效',
      prompt: '做一段 14 秒、Dribbble 水準的 UI 動效，120 BPM，7 小節，每一拍都有變化。全程只有一個形狀、不切鏡：從 Generate 按鈕依序變成載入、勾號、動態島、帶播放/暫停變形的音樂播放器、被拖動的進度條、拖過最大值會被拉長的音量滑桿、開關、液態分頁指示器、自動繪製並帶懸停提示的圖表、可以輸入的 ⌘K 指令面板、提示條，最後回到按鈕。所有變化都由游標真實的點擊和拖曳驅動。淺暖灰背景、黑白元件、一款乾淨的介面字體（Geist）。全程彈簧動畫，最多一點點回彈。最後一格和第一格相同，可以無縫循環。',
    },
    en: {
      title: 'One-Shape UI Motion',
      prompt: 'Make a 14-second Dribbble-level UI motion piece at 120 BPM, 7 bars, something happening on every beat. One shape, never cut: it morphs from a Generate button into a loader, a check, a dynamic island, a music player with a play/pause morph, a scrubbed progress bar, a volume slider that stretches when dragged past max, a toggle, a liquid tab indicator, a chart that draws itself with a hover tooltip, a ⌘K palette you type into, a toast, and back to the button. A cursor drives every change with real clicks and drags. Light warm-gray canvas, black and white components, one clean UI font (Geist). Springs everywhere, a tiny overshoot at most. The last frame is the first frame, so it loops.',
    },
    id: {
      title: 'Motion UI Satu Bentuk',
      prompt: 'Buat karya motion UI 14 detik setara Dribbble pada 120 BPM, 7 bar, ada sesuatu di setiap ketukan. Satu bentuk tanpa potongan: berubah dari tombol Generate menjadi loader, centang, dynamic island, pemutar musik dengan morf play/pause, progress bar yang digeser, slider volume yang meregang saat ditarik melewati maksimum, toggle, indikator tab cair, grafik yang menggambar dirinya dengan tooltip saat hover, palet ⌘K yang diketik, toast, lalu kembali ke tombol. Kursor menggerakkan setiap perubahan dengan klik dan seret nyata. Kanvas abu-abu hangat terang, komponen hitam putih, satu font UI bersih (Geist). Spring di mana-mana, overshoot sangat kecil. Frame terakhir sama dengan frame pertama agar berulang mulus.',
    },
    de: {
      title: 'UI-Motion aus einer Form',
      prompt: 'Erstelle ein 14-sekündiges UI-Motion-Stück auf Dribbble-Niveau bei 120 BPM, 7 Takte, auf jedem Beat passiert etwas. Eine Form, kein Schnitt: Sie morpht vom Generate-Button zu Loader, Häkchen, Dynamic Island, Musikplayer mit Play/Pause-Morph, gescrubbtem Fortschrittsbalken, Lautstärkeregler, der sich über das Maximum hinaus dehnt, Toggle, flüssigem Tab-Indikator, einem sich selbst zeichnenden Chart mit Hover-Tooltip, einer ⌘K-Palette mit Eingabe, einem Toast und zurück zum Button. Ein Cursor steuert jede Änderung mit echten Klicks und Drags. Heller warmgrauer Hintergrund, schwarze und weiße Komponenten, eine klare UI-Schrift (Geist). Überall Federn, höchstens minimales Überschwingen. Das letzte Bild ist das erste, damit es loopt.',
    },
    'pt-BR': {
      title: 'Motion de UI em uma forma',
      prompt: 'Crie uma peça de motion de UI de 14 segundos no nível do Dribbble, a 120 BPM, 7 compassos, algo acontecendo em cada batida. Uma forma, sem cortes: ela vira de um botão Generate para um loader, um check, uma dynamic island, um player de música com morph de play/pause, uma barra de progresso arrastada, um slider de volume que estica ao passar do máximo, um toggle, um indicador de abas líquido, um gráfico que se desenha com tooltip no hover, uma paleta ⌘K em que se digita, um toast e de volta ao botão. Um cursor conduz cada mudança com cliques e arrastes reais. Fundo cinza-quente claro, componentes em preto e branco, uma fonte de UI limpa (Geist). Molas em tudo, no máximo um overshoot mínimo. O último frame é igual ao primeiro, para fazer loop.',
    },
    'es-ES': {
      title: 'Motion de UI con una sola forma',
      prompt: 'Crea una pieza de motion de UI de 14 segundos al nivel de Dribbble, a 120 BPM, 7 compases, algo en cada tiempo. Una sola forma, sin cortes: pasa de un botón Generate a un loader, un check, una dynamic island, un reproductor con morph de play/pausa, una barra de progreso arrastrada, un slider de volumen que se estira al pasar del máximo, un interruptor, un indicador de pestañas líquido, un gráfico que se dibuja solo con tooltip al pasar el cursor, una paleta ⌘K en la que se escribe, un toast y vuelta al botón. Un cursor provoca cada cambio con clics y arrastres reales. Fondo gris cálido claro, componentes en blanco y negro, una fuente de UI limpia (Geist). Muelles en todo, como mucho un rebote mínimo. El último fotograma es el primero, para que haga bucle.',
    },
    ru: {
      title: 'UI-моушн из одной формы',
      prompt: 'Сделай 14-секундный UI-моушн уровня Dribbble, 120 BPM, 7 тактов, на каждую долю что-то происходит. Одна форма без склеек: она превращается из кнопки Generate в лоадер, галочку, dynamic island, плеер с морфингом play/pause, прокручиваемый прогресс-бар, слайдер громкости, который растягивается при перетягивании за максимум, переключатель, «жидкий» индикатор вкладок, график, рисующий себя с тултипом при наведении, палитру ⌘K с вводом текста, тост — и обратно в кнопку. Каждое изменение запускает курсор настоящими кликами и перетаскиванием. Светлый тёплый серый фон, чёрно-белые компоненты, один чистый UI-шрифт (Geist). Пружины везде, максимум крошечный перелёт. Последний кадр совпадает с первым, чтобы зацикливалось.',
    },
    fa: {
      title: 'موشن رابط کاربری با یک شکل',
      prompt: 'یک قطعهٔ موشن رابط کاربری ۱۴ ثانیه‌ای در سطح Dribbble بساز، ۱۲۰ BPM، ۷ میزان، روی هر ضرب اتفاقی بیفتد. فقط یک شکل، بدون برش: از دکمهٔ Generate به لودر، تیک، dynamic island، پخش‌کنندهٔ موسیقی با دگردیسی play/pause، نوار پیشرفتی که کشیده می‌شود، اسلایدر صدایی که وقتی از حداکثر بیشتر کشیده شود کش می‌آید، سوئیچ، نشانگر سیال تب، نموداری که خودش رسم می‌شود با راهنمای هاور، پالت ⌘K که در آن تایپ می‌شود، اعلان و دوباره دکمه تبدیل می‌شود. نشانگر ماوس هر تغییر را با کلیک و کشیدن واقعی انجام می‌دهد. پس‌زمینهٔ خاکستری گرم روشن، اجزای سیاه و سفید، یک فونت رابط کاربری تمیز (Geist). همه‌جا فنری، حداکثر کمی برگشت. فریم آخر همان فریم اول است تا حلقه شود.',
    },
    ar: {
      title: 'موشن واجهة بشكل واحد',
      prompt: 'اصنع عمل موشن لواجهة مستخدم مدته 14 ثانية بمستوى Dribbble، على إيقاع 120 BPM، 7 مازورات، وحدث في كل نبضة. شكل واحد دون قطع: يتحول من زر Generate إلى مؤشر تحميل، علامة صح، dynamic island، مشغل موسيقى مع تحول تشغيل/إيقاف، شريط تقدم يُسحب، شريط صوت يتمدد عند سحبه بعد الحد الأقصى، مفتاح تبديل، مؤشر تبويبات سائل، رسم بياني يرسم نفسه مع تلميح عند المرور، لوحة ⌘K يُكتب فيها، إشعار، ثم يعود إلى الزر. يقود مؤشر الفأرة كل تغيير بنقرات وسحب حقيقي. خلفية رمادية دافئة فاتحة، مكونات بالأبيض والأسود، خط واجهة نظيف واحد (Geist). نوابض في كل مكان، وارتداد ضئيل على الأكثر. الإطار الأخير هو الأول ليتكرر بسلاسة.',
    },
    ja: {
      title: 'ワンシェイプ UI モーション',
      prompt: 'Dribbble レベルの 14 秒の UI モーションを作って。120 BPM、7 小節、毎拍なにかが起きる。ひとつの図形をカットなしで、Generate ボタン → ローダー → チェック → ダイナミックアイランド → 再生/一時停止がモーフする音楽プレーヤー → ドラッグされるプログレスバー → 最大を超えて引っ張ると伸びる音量スライダー → トグル → 液体のようなタブインジケーター → ホバーでツールチップが出る自動描画チャート → 入力できる ⌘K パレット → トースト → ボタンへ戻る。すべての変化はカーソルの実際のクリックとドラッグで起こす。明るいウォームグレーの背景、白黒のコンポーネント、クリーンな UI フォント 1 種（Geist）。全部スプリングで、オーバーシュートはごくわずか。最後のフレームを最初のフレームと同じにしてループさせる。',
    },
    ko: {
      title: '원 셰이프 UI 모션',
      prompt: 'Dribbble 수준의 14초 UI 모션을 만들어 줘. 120 BPM, 7마디, 매 박자마다 무언가 일어나야 해. 하나의 도형을 컷 없이: Generate 버튼에서 로더, 체크, 다이내믹 아일랜드, 재생/일시정지가 모핑되는 뮤직 플레이어, 드래그되는 진행 바, 최대치를 넘겨 끌면 늘어나는 볼륨 슬라이더, 토글, 액체 같은 탭 인디케이터, 호버 툴팁이 있는 스스로 그려지는 차트, 입력하는 ⌘K 팔레트, 토스트를 거쳐 다시 버튼으로. 모든 변화는 커서의 실제 클릭과 드래그로 일어나. 밝은 웜 그레이 배경, 흑백 컴포넌트, 깔끔한 UI 폰트 하나(Geist). 전부 스프링, 오버슈트는 아주 살짝만. 마지막 프레임이 첫 프레임과 같아 루프되게.',
    },
    pl: {
      title: 'UI motion z jednego kształtu',
      prompt: 'Stwórz 14-sekundowy UI motion na poziomie Dribbble, 120 BPM, 7 taktów, coś dzieje się na każdym uderzeniu. Jeden kształt, bez cięć: zmienia się z przycisku Generate w loader, ptaszek, dynamic island, odtwarzacz muzyki z morfem play/pause, przewijany pasek postępu, suwak głośności rozciągający się po przeciągnięciu za maksimum, przełącznik, płynny wskaźnik zakładek, wykres rysujący się sam z tooltipem po najechaniu, paletę ⌘K z wpisywaniem, toast i z powrotem w przycisk. Kursor wywołuje każdą zmianę prawdziwymi kliknięciami i przeciągnięciami. Jasne, ciepłoszare tło, czarno-białe komponenty, jedna czysta czcionka UI (Geist). Wszędzie sprężyny, najwyżej minimalne przestrzelenie. Ostatnia klatka jest pierwszą, żeby się zapętlało.',
    },
    hu: {
      title: 'Egyformás UI motion',
      prompt: 'Készíts egy 14 másodperces, Dribbble-szintű UI motiont, 120 BPM, 7 ütem, minden ütemre történik valami. Egyetlen forma vágás nélkül: Generate gombból töltésjelző, pipa, dynamic island, lejátszás/szünet morfos zenelejátszó, húzott folyamatjelző, maximumon túlhúzva megnyúló hangerőcsúszka, kapcsoló, folyékony fülindikátor, önmagát kirajzoló diagram hover-tooltippel, gépelhető ⌘K paletta, értesítés, majd vissza a gombba. Minden változást a kurzor valódi kattintásai és húzásai indítanak. Világos meleg szürke háttér, fekete-fehér komponensek, egy tiszta UI-betűtípus (Geist). Mindenhol rugó, legfeljebb minimális túllendülés. Az utolsó képkocka megegyezik az elsővel, hogy ismétlődjön.',
    },
    fr: {
      title: 'Motion d’UI en une seule forme',
      prompt: 'Crée une pièce de motion d’UI de 14 secondes au niveau Dribbble, à 120 BPM, 7 mesures, il se passe quelque chose à chaque temps. Une seule forme, sans coupe : elle passe d’un bouton Generate à un loader, une coche, une dynamic island, un lecteur audio avec morph lecture/pause, une barre de progression qu’on fait défiler, un curseur de volume qui s’étire au-delà du maximum, un interrupteur, un indicateur d’onglets liquide, un graphique qui se dessine avec une info-bulle au survol, une palette ⌘K où l’on tape, un toast, puis retour au bouton. Un curseur déclenche chaque changement par de vrais clics et glisser-déposer. Fond gris chaud clair, composants noir et blanc, une seule police d’UI nette (Geist). Des ressorts partout, au plus un minuscule dépassement. La dernière image est la première, pour que ça boucle.',
    },
    uk: {
      title: 'UI-моушн з однієї форми',
      prompt: 'Зроби 14-секундний UI-моушн рівня Dribbble, 120 BPM, 7 тактів, на кожну долю щось відбувається. Одна форма без склейок: вона перетворюється з кнопки Generate на лоадер, галочку, dynamic island, плеєр із морфінгом play/pause, прогрес-бар, який перемотують, повзунок гучності, що розтягується при перетягуванні за максимум, перемикач, «рідкий» індикатор вкладок, графік, що малює себе з підказкою при наведенні, палітру ⌘K з введенням тексту, тост — і назад у кнопку. Кожну зміну запускає курсор справжніми кліками й перетягуванням. Світлий теплий сірий фон, чорно-білі компоненти, один чистий UI-шрифт (Geist). Пружини всюди, максимум крихітний переліт. Останній кадр збігається з першим, щоб зациклювалося.',
    },
    tr: {
      title: 'Tek şekilli UI motion',
      prompt: 'Dribbble seviyesinde, 120 BPM’de, 7 ölçü, her vuruşta bir şey olan 14 saniyelik bir UI motion yap. Tek bir şekil, kesme yok: Generate butonundan yükleyiciye, onay işaretine, dynamic island’a, play/pause dönüşümlü müzik çalara, kaydırılan ilerleme çubuğuna, maksimumun ötesine çekilince uzayan ses kaydırıcısına, anahtara, sıvı sekme göstergesine, hover’da ipucu gösteren kendini çizen grafiğe, içine yazılan ⌘K paletine, bildirime ve tekrar butona dönüşür. Her değişimi imleç gerçek tıklama ve sürüklemelerle yönetir. Açık sıcak gri zemin, siyah beyaz bileşenler, tek bir temiz UI fontu (Geist). Her yerde yay hareketi, en fazla minicik bir aşma. Son kare ilk kareyle aynı, döngü olsun.',
    },
    th: {
      title: 'UI โมชันจากรูปทรงเดียว',
      prompt: 'สร้าง UI โมชันระดับ Dribbble ยาว 14 วินาที 120 BPM 7 ห้อง มีอะไรเกิดขึ้นทุกจังหวะ ใช้รูปทรงเดียวไม่มีการตัด: เปลี่ยนจากปุ่ม Generate เป็นตัวโหลด เครื่องหมายถูก dynamic island เครื่องเล่นเพลงที่มอร์ฟปุ่มเล่น/หยุด แถบความคืบหน้าที่ถูกลาก สไลเดอร์เสียงที่ยืดออกเมื่อลากเกินสุด สวิตช์ ตัวบอกแท็บแบบของเหลว กราฟที่วาดตัวเองพร้อมทูลทิปเมื่อชี้ พาเลตต์ ⌘K ที่พิมพ์ได้ toast แล้วกลับมาเป็นปุ่ม เคอร์เซอร์เป็นตัวสั่งทุกการเปลี่ยนแปลงด้วยการคลิกและลากจริง พื้นหลังเทาอุ่นอ่อน คอมโพเนนต์ขาวดำ ฟอนต์ UI สะอาดหนึ่งแบบ (Geist) ใช้สปริงทั้งหมด เด้งเกินได้นิดเดียว เฟรมสุดท้ายเหมือนเฟรมแรกเพื่อให้วนลูป',
    },
    it: {
      title: 'UI motion da una sola forma',
      prompt: 'Crea un pezzo di UI motion di 14 secondi da Dribbble, a 120 BPM, 7 battute, succede qualcosa a ogni battito. Una sola forma, senza tagli: passa da un pulsante Generate a un loader, una spunta, una dynamic island, un player musicale con morph play/pausa, una barra di avanzamento trascinata, uno slider del volume che si allunga oltre il massimo, un interruttore, un indicatore di tab liquido, un grafico che si disegna da solo con tooltip al passaggio, una palette ⌘K in cui si scrive, un toast e di nuovo il pulsante. Un cursore guida ogni cambiamento con clic e trascinamenti reali. Sfondo grigio caldo chiaro, componenti in bianco e nero, un solo font UI pulito (Geist). Molle ovunque, al massimo un minimo overshoot. L’ultimo fotogramma è il primo, così va in loop.',
    },
  },
  'example-motion-visual-lesson': {
    'zh-CN': {
      title: '让灵感成真',
      prompt: '做一支 20 秒的纸张拼贴动画。窗边的女孩写下「OpenDesign, what can you design?」，折成纸飞机寄给 OpenDesign 小伙伴。它通过点按原型、展开网站、翻动 PPT、贴上海报和放映动效来回答，把五件作品收成一本小册子寄回。女孩翻开看到「It starts with your idea.」。保留手工撕纸、水粉笔触、纸片人物和背景音乐。 结尾女孩抱住作品册、挥手感谢，再把写着“What will you design?”的纸贴到窗边，双手收回胸前，向观众发出设计邀请。',
    },
    'zh-TW': {
      title: '讓靈感成真',
      prompt: '做一支 20 秒的紙張拼貼動畫。窗邊的女孩寫下「OpenDesign, what can you design?」，摺成紙飛機寄給 OpenDesign 小夥伴。它透過點按原型、展開網站、翻動 PPT、貼上海報和放映動效來回答，把五件作品收成一本小冊子寄回。女孩翻開看到「It starts with your idea.」。保留手工撕紙、水粉筆觸、紙片人物和背景音樂。 結尾女孩抱住作品冊、揮手感謝，再把寫著“What will you design?”的紙貼到窗邊，雙手收回胸前，向觀眾發出設計邀請。',
    },
    en: {
      title: 'Bring Ideas to Life',
      prompt: 'Make a 20-second paper-cutout story. A girl sends “OpenDesign, what can you design?” on a paper plane. The OpenDesign buddy answers by tapping an interactive prototype, unfolding a website, turning PPT pages, sticking a poster and animating a filmstrip. The five works become a little book that returns to her: “It starts with your idea.” Keep torn paper, gouache brushwork, cutout characters and the background music. To close, she hugs the book, waves thanks, pins a note reading “What will you design?” beside the window and brings her hands together: an invitation to the viewer.',
    },
    id: {
      title: 'Wujudkan Ide',
      prompt: 'Cerita potongan kertas 20 detik: seorang gadis bertanya apa yang bisa didesain OpenDesign. Prototipe interaktif, situs web, PPT, poster dan film animasi menjadi buku kemungkinan. Semuanya dimulai dari idemu. Di akhir, ia memeluk buku, melambaikan tangan sebagai terima kasih, lalu menempelkan catatan “What will you design?” di dekat jendela dan menyatukan kedua tangan: undangan bagi penonton untuk mendesain.',
    },
    de: {
      title: 'Ideen zum Leben erwecken',
      prompt: 'Eine 20-sekündige Papiercollage: Ein Mädchen fragt OpenDesign, was es gestalten kann. Interaktive Prototypen, Websites, Präsentationen, Poster und Animationsfilme werden zu einem Buch voller Möglichkeiten. Alles beginnt mit deiner Idee. Zum Schluss drückt sie das Buch an sich, winkt zum Dank, klebt „What will you design?“ neben das Fenster und legt die Hände zusammen: eine Einladung an das Publikum.',
    },
    'pt-BR': {
      title: 'Dê vida às ideias',
      prompt: 'Um conto de 20 segundos em recortes de papel: uma menina pergunta o que o OpenDesign pode criar. Protótipos interativos, sites, apresentações, pôsteres e animações viram um livro de possibilidades. Tudo começa com sua ideia. No final, ela abraça o livro, acena em agradecimento, cola “What will you design?” junto à janela e une as mãos, convidando o público a criar seu próprio design.',
    },
    'es-ES': {
      title: 'Da vida a tus ideas',
      prompt: 'Una historia de 20 segundos en papel recortado: una niña pregunta qué puede diseñar OpenDesign. Prototipos interactivos, webs, presentaciones, carteles y animaciones forman un libro de posibilidades. Todo empieza con tu idea. Al final, abraza el libro, saluda en agradecimiento, pega “What will you design?” junto a la ventana y junta las manos: una invitación al público a diseñar.',
    },
    ru: {
      title: 'Воплощай идеи в жизнь',
      prompt: '20-секундная бумажная история: девочка спрашивает, что умеет создавать OpenDesign. Интерактивные прототипы, сайты, презентации, плакаты и анимация собираются в книгу возможностей. Всё начинается с вашей идеи. В финале она обнимает книгу, благодарно машет, приклеивает у окна записку “What will you design?” и складывает ладони: это приглашение зрителю придумать свой дизайн.',
    },
    fa: {
      title: 'به ایده‌ها جان بده',
      prompt: 'داستان کاغذبری ۲۰ ثانیه‌ای: دختری می‌پرسد OpenDesign چه چیزی می‌تواند طراحی کند. نمونه‌های تعاملی، وب‌سایت‌ها، ارائه‌ها، پوسترها و فیلم‌های متحرک به کتابی از امکان‌ها تبدیل می‌شوند. همه‌چیز با ایدهٔ شما آغاز می‌شود. در پایان، دختر کتاب را در آغوش می‌گیرد، برای تشکر دست تکان می‌دهد، یادداشت «What will you design?» را کنار پنجره می‌چسباند و دست‌هایش را جمع می‌کند؛ دعوتی از تماشاگر برای طراحی.',
    },
    ar: {
      title: 'امنح أفكارك الحياة',
      prompt: 'قصة من قصاصات الورق مدتها 20 ثانية: تسأل فتاة عمّا يستطيع OpenDesign تصميمه. نماذج تفاعلية ومواقع وعروض تقديمية وملصقات وأفلام متحركة تجتمع في كتاب من الإمكانات. كل شيء يبدأ بفكرتك. في النهاية تحتضن الكتاب وتلوّح بالشكر، ثم تلصق ورقة تحمل “What will you design?” بجانب النافذة وتضم يديها: دعوة للمشاهد إلى التصميم.',
    },
    ja: {
      title: 'アイデアをかたちに',
      prompt: '20秒の切り絵風ストーリー。女の子がOpenDesignに「何をデザインできる？」と尋ねると、インタラクティブなプロトタイプ、Webサイト、PPT、ポスター、モーション動画が一冊の作品集になります。始まりは、あなたのアイデア。 最後に女の子が本を抱きしめ、感謝して手を振り、「What will you design?」と書いた紙を窓辺に貼って両手を合わせます。観客にデザインを呼びかける締めくくりです。',
    },
    ko: {
      title: '아이디어를 현실로',
      prompt: '20초 종이 콜라주 이야기. 소녀가 OpenDesign에게 무엇을 디자인할 수 있는지 물으면 인터랙티브 프로토타입, 웹사이트, PPT, 포스터, 모션 영상이 작품집으로 모입니다. 당신의 아이디어에서 시작됩니다. 마지막에는 소녀가 책을 안고 감사의 손인사를 한 뒤 “What will you design?” 쪽지를 창가에 붙이고 두 손을 모읍니다. 관객에게 디자인을 권하는 마무리입니다.',
    },
    pl: {
      title: 'Tchnij życie w pomysły',
      prompt: '20-sekundowa opowieść z papierowych wycinanek: dziewczynka pyta, co potrafi projektować OpenDesign. Interaktywne prototypy, strony, prezentacje, plakaty i animacje tworzą książkę możliwości. Wszystko zaczyna się od twojego pomysłu. Na końcu przytula książkę, macha na podziękowanie, przykleja obok okna kartkę „What will you design?” i składa dłonie: to zaproszenie dla widza do projektowania.',
    },
    hu: {
      title: 'Keltsd életre az ötleteket',
      prompt: '20 másodperces papírkollázs-történet: egy kislány megkérdezi, mit tud tervezni az OpenDesign. Interaktív prototípusok, weboldalak, prezentációk, plakátok és animációk állnak össze a lehetőségek könyvévé. Minden az ötleteddel kezdődik. Végül magához öleli a könyvet, köszönetképpen integet, az ablak mellé ragasztja a „What will you design?” feliratot, és összeteszi a kezét: ezzel a nézőt hívja tervezésre.',
    },
    fr: {
      title: 'Donnez vie à vos idées',
      prompt: 'Une histoire de 20 secondes en papier découpé : une fillette demande ce qu’OpenDesign peut créer. Prototypes interactifs, sites, présentations, affiches et animations composent un livre de possibilités. Tout commence par votre idée. Pour finir, elle serre le livre contre elle, fait un signe de remerciement, colle « What will you design? » près de la fenêtre et joint les mains : une invitation adressée au public.',
    },
    uk: {
      title: 'Втілюй ідеї в життя',
      prompt: '20-секундна історія з паперової аплікації: дівчинка запитує, що вміє створювати OpenDesign. Інтерактивні прототипи, сайти, презентації, плакати й анімації складаються в книгу можливостей. Усе починається з вашої ідеї. Наприкінці вона обіймає книжку, вдячно махає, приклеює біля вікна записку “What will you design?” і складає долоні: це запрошення глядачеві створити власний дизайн.',
    },
    tr: {
      title: 'Fikirlerine Hayat Ver',
      prompt: '20 saniyelik kâğıt kolaj hikâyesi: bir kız OpenDesign’a neler tasarlayabildiğini sorar. Etkileşimli prototipler, web siteleri, sunumlar, posterler ve animasyonlar bir olasılıklar kitabına dönüşür. Her şey fikrinle başlar. Sonunda kitabı kucaklar, teşekkür için el sallar, pencerenin yanına “What will you design?” yazılı notu yapıştırıp ellerini birleştirir: izleyiciye bir tasarım daveti.',
    },
    th: {
      title: 'ทำไอเดียให้เป็นจริง',
      prompt: 'เรื่องราวกระดาษตัดแปะ 20 วินาที เด็กผู้หญิงถามว่า OpenDesign ออกแบบอะไรได้บ้าง ต้นแบบโต้ตอบ เว็บไซต์ สไลด์ PPT โปสเตอร์ และภาพเคลื่อนไหวรวมเป็นหนังสือแห่งความเป็นไปได้ ทุกอย่างเริ่มจากไอเดียของคุณ ตอนจบเธอกอดหนังสือ โบกมือขอบคุณ แล้วติดกระดาษ “What will you design?” ไว้ข้างหน้าต่างและประสานมือ เป็นคำเชิญให้ผู้ชมออกแบบผลงานของตนเอง',
    },
    it: {
      title: 'Dai vita alle idee',
      prompt: 'Una storia di 20 secondi in carta ritagliata: una bambina chiede cosa sa progettare OpenDesign. Prototipi interattivi, siti, presentazioni, poster e animazioni compongono un libro di possibilità. Tutto inizia dalla tua idea. Alla fine abbraccia il libro, saluta per ringraziare, attacca “What will you design?” accanto alla finestra e unisce le mani: un invito a progettare rivolto al pubblico.',
    },
  },
  'example-motion-future': {
    'zh-CN': {
      title: '未来已来',
      prompt: '做一支 20 秒的高能科技短片，主题是「未来已来」（The future is already here），120 BPM 卡点，配色为电光蓝、黑、白和镀铬。开场是 3D 方块从 1 个裂变到 64 个，接着是 SIGNAL、扫描中的视网膜和 97.2%、写着 WAKE UP 的文字隧道、液态金属质感的 THE FUTURE。然后出现 FUTURE.EXE 桌面窗口、LOADING 99% 进度条和 3-2-1 倒计时，再是标着 PRISM、BOLT、PLANET、MIND 的四个玻璃质感物体、环形漩涡和棋盘格网格。最后落在巨大的镀铬 3D 字 FUTURE 和 IS ALREADY HERE.，以故障效果切到 END OF TRANSMISSION 收尾。粗重的展示字体（Unbounded Black），细等宽字体的 HUD 带时间码和画面标签，全程按节拍硬切。',
    },
    'zh-TW': {
      title: '未來已來',
      prompt: '做一支 20 秒的高能科技短片，主題是「未來已來」（The future is already here），120 BPM 卡點，配色為電光藍、黑、白和鍍鉻。開場是 3D 方塊從 1 個裂變到 64 個，接著是 SIGNAL、掃描中的視網膜和 97.2%、寫著 WAKE UP 的文字隧道、液態金屬質感的 THE FUTURE。然後出現 FUTURE.EXE 桌面視窗、LOADING 99% 進度條和 3-2-1 倒數，再是標著 PRISM、BOLT、PLANET、MIND 的四個玻璃質感物件、環形漩渦和棋盤格網格。最後落在巨大的鍍鉻 3D 字 FUTURE 和 IS ALREADY HERE.，以故障效果切到 END OF TRANSMISSION 收尾。粗重的展示字體（Unbounded Black），細等寬字體的 HUD 帶時間碼和畫面標籤，全程按節拍硬切。',
    },
    en: {
      title: 'The Future Is Already Here',
      prompt: 'Make a 20-second high-energy tech reel titled "The future is already here", cut to 120 BPM in electric blue, black, white and chrome. Open with 3D cubes multiplying from 1 to 64, then SIGNAL, a scanning retina with 97.2%, a word tunnel that reads WAKE UP, and THE FUTURE in liquid chrome. Show a FUTURE.EXE desktop window, a LOADING 99% bar and a 3-2-1 countdown, then four glass objects labelled PRISM, BOLT, PLANET and MIND, a ring vortex and a checker grid. Land on a big chrome 3D FUTURE with IS ALREADY HERE. and end on a glitch into END OF TRANSMISSION. Heavy display type (Unbounded Black), a thin monospace HUD with timecode and frame labels, hard cuts on the beat.',
    },
    id: {
      title: 'Masa Depan Sudah Tiba',
      prompt: 'Buat reel teknologi penuh energi 20 detik berjudul "The future is already here", dipotong pada 120 BPM dengan warna biru elektrik, hitam, putih, dan krom. Buka dengan kubus 3D yang berlipat dari 1 menjadi 64, lalu SIGNAL, retina yang dipindai dengan 97.2%, terowongan kata bertuliskan WAKE UP, dan THE FUTURE dalam krom cair. Tampilkan jendela desktop FUTURE.EXE, bilah LOADING 99%, dan hitung mundur 3-2-1, lalu empat objek kaca berlabel PRISM, BOLT, PLANET, dan MIND, pusaran cincin, dan grid papan catur. Akhiri pada FUTURE krom 3D besar dengan IS ALREADY HERE. lalu glitch menjadi END OF TRANSMISSION. Tipografi display tebal (Unbounded Black), HUD monospace tipis dengan timecode dan label frame, potongan tajam mengikuti ketukan.',
    },
    de: {
      title: 'Die Zukunft ist schon da',
      prompt: 'Erstelle ein energiegeladenes 20-Sekunden-Tech-Reel mit dem Titel „The future is already here“, geschnitten auf 120 BPM in Elektroblau, Schwarz, Weiß und Chrom. Starte mit 3D-Würfeln, die sich von 1 auf 64 vervielfachen, dann SIGNAL, eine gescannte Netzhaut mit 97.2 %, ein Worttunnel mit WAKE UP und THE FUTURE in flüssigem Chrom. Zeig ein FUTURE.EXE-Desktopfenster, einen LOADING-99-%-Balken und einen 3-2-1-Countdown, dann vier Glasobjekte mit den Labels PRISM, BOLT, PLANET und MIND, einen Ringwirbel und ein Schachbrettraster. Lande auf einem großen Chrom-3D-FUTURE mit IS ALREADY HERE. und ende mit einem Glitch zu END OF TRANSMISSION. Schwere Display-Schrift (Unbounded Black), ein dünnes Monospace-HUD mit Timecode und Frame-Labels, harte Schnitte auf dem Beat.',
    },
    'pt-BR': {
      title: 'O futuro já chegou',
      prompt: 'Crie um reel tech de 20 segundos cheio de energia chamado "The future is already here", cortado a 120 BPM em azul elétrico, preto, branco e cromo. Abra com cubos 3D se multiplicando de 1 para 64, depois SIGNAL, uma retina sendo escaneada com 97.2%, um túnel de palavras com WAKE UP e THE FUTURE em cromo líquido. Mostre uma janela de desktop FUTURE.EXE, uma barra LOADING 99% e uma contagem 3-2-1, depois quatro objetos de vidro rotulados PRISM, BOLT, PLANET e MIND, um vórtice de anéis e uma grade quadriculada. Termine num grande FUTURE cromado em 3D com IS ALREADY HERE. e feche com um glitch para END OF TRANSMISSION. Tipografia display pesada (Unbounded Black), um HUD monoespaçado fino com timecode e rótulos de quadro, cortes secos no ritmo.',
    },
    'es-ES': {
      title: 'El futuro ya está aquí',
      prompt: 'Crea un reel tecnológico de 20 segundos lleno de energía titulado "The future is already here", montado a 120 BPM en azul eléctrico, negro, blanco y cromo. Empieza con cubos 3D que se multiplican de 1 a 64, después SIGNAL, una retina escaneada con 97.2 %, un túnel de palabras que dice WAKE UP y THE FUTURE en cromo líquido. Muestra una ventana de escritorio FUTURE.EXE, una barra LOADING 99 % y una cuenta atrás 3-2-1, luego cuatro objetos de cristal con las etiquetas PRISM, BOLT, PLANET y MIND, un vórtice de anillos y una cuadrícula de ajedrez. Termina en un gran FUTURE cromado en 3D con IS ALREADY HERE. y cierra con un glitch hacia END OF TRANSMISSION. Tipografía display pesada (Unbounded Black), un HUD monoespaciado fino con código de tiempo y etiquetas de plano, cortes secos al ritmo.',
    },
    ru: {
      title: 'Будущее уже здесь',
      prompt: 'Сделай 20-секундный энергичный технологичный рил под названием «The future is already here», смонтированный под 120 BPM, в электрик-синем, чёрном, белом и хроме. Начни с 3D-кубов, которые размножаются от 1 до 64, затем SIGNAL, сканируемая сетчатка с 97.2%, туннель из слов WAKE UP и THE FUTURE из жидкого хрома. Покажи окно рабочего стола FUTURE.EXE, полосу LOADING 99% и отсчёт 3-2-1, затем четыре стеклянных объекта с подписями PRISM, BOLT, PLANET и MIND, кольцевой вихрь и шахматную сетку. Заверши большим хромированным 3D-словом FUTURE с IS ALREADY HERE. и глитчем в END OF TRANSMISSION. Тяжёлый акцидентный шрифт (Unbounded Black), тонкий моноширинный HUD с таймкодом и подписями кадров, жёсткие склейки в такт.',
    },
    fa: {
      title: 'آینده همین حالاست',
      prompt: 'یک ریل فناوری پرانرژی ۲۰ ثانیه‌ای با عنوان «The future is already here» بساز، با تدوین ۱۲۰ BPM و رنگ‌های آبی الکتریک، مشکی، سفید و کروم. با مکعب‌های سه‌بعدی که از ۱ به ۶۴ تکثیر می‌شوند شروع کن، سپس SIGNAL، شبکیه‌ای در حال اسکن با 97.2%، تونل کلماتی با WAKE UP و THE FUTURE از کروم مایع. پنجرهٔ دسکتاپ FUTURE.EXE، نوار LOADING 99% و شمارش معکوس ۳-۲-۱ را نشان بده، بعد چهار شیء شیشه‌ای با برچسب‌های PRISM، BOLT، PLANET و MIND، گردابی از حلقه‌ها و شبکهٔ شطرنجی. روی FUTURE کرومی سه‌بعدی بزرگ با IS ALREADY HERE. فرود بیا و با گلیچ به END OF TRANSMISSION تمام کن. فونت نمایشی سنگین (Unbounded Black)، HUD نازک تک‌فاصله با تایم‌کد و برچسب فریم، برش‌های تند روی ضرب.',
    },
    ar: {
      title: 'المستقبل هنا بالفعل',
      prompt: 'اصنع ريلًا تقنيًا عالي الطاقة مدته 20 ثانية بعنوان "The future is already here"، بمونتاج على 120 BPM وبألوان الأزرق الكهربائي والأسود والأبيض والكروم. ابدأ بمكعبات ثلاثية الأبعاد تتضاعف من 1 إلى 64، ثم SIGNAL، وشبكية عين تُمسح مع 97.2%، ونفق كلمات يقول WAKE UP، وTHE FUTURE بالكروم السائل. اعرض نافذة سطح مكتب FUTURE.EXE وشريط LOADING 99% وعدًا تنازليًا 3-2-1، ثم أربعة أجسام زجاجية بعناوين PRISM وBOLT وPLANET وMIND، ودوامة حلقات وشبكة شطرنجية. انتهِ بكلمة FUTURE كروم ثلاثية الأبعاد ضخمة مع IS ALREADY HERE. ثم خلل بصري إلى END OF TRANSMISSION. خط عرض ثقيل (Unbounded Black)، وواجهة HUD رفيعة بخط أحادي المسافة مع رمز زمني وعناوين إطارات، وقطعات حادة على الإيقاع.',
    },
    ja: {
      title: '未来はもう来ている',
      prompt: '「The future is already here」をテーマに、120 BPM でカットするエレクトリックブルー・黒・白・クロームの 20 秒ハイエナジーなテックリールを作って。3D キューブが 1 から 64 に増える開幕、SIGNAL、97.2% と表示されるスキャン中の網膜、WAKE UP と書かれたワードトンネル、液体クロームの THE FUTURE。FUTURE.EXE のデスクトップウィンドウ、LOADING 99% のバー、3-2-1 のカウントダウン、PRISM・BOLT・PLANET・MIND とラベルのついた 4 つのガラスのオブジェクト、リングの渦、チェッカーグリッド。最後は巨大なクローム 3D の FUTURE と IS ALREADY HERE. に着地し、グリッチで END OF TRANSMISSION へ。重いディスプレイ書体（Unbounded Black）、タイムコードとフレームラベル付きの細い等幅 HUD、ビートに合わせたハードカット。',
    },
    ko: {
      title: '미래는 이미 와 있다',
      prompt: '"The future is already here"를 주제로 한 20초 하이 에너지 테크 릴을 만들어 줘. 120 BPM 컷, 일렉트릭 블루·검정·흰색·크롬. 3D 큐브가 1개에서 64개로 늘어나며 시작하고, SIGNAL, 97.2%가 뜨는 스캔 중인 망막, WAKE UP이 적힌 단어 터널, 리퀴드 크롬 THE FUTURE. FUTURE.EXE 데스크톱 창, LOADING 99% 바, 3-2-1 카운트다운, PRISM·BOLT·PLANET·MIND 라벨이 붙은 유리 오브젝트 4개, 링 소용돌이, 체커 그리드. 마지막은 거대한 크롬 3D FUTURE와 IS ALREADY HERE.로 착지하고 글리치로 END OF TRANSMISSION에서 끝내. 굵은 디스플레이 서체(Unbounded Black), 타임코드와 프레임 라벨이 있는 얇은 고정폭 HUD, 비트에 맞춘 하드 컷.',
    },
    pl: {
      title: 'Przyszłość już tu jest',
      prompt: 'Stwórz 20-sekundowy, energetyczny reel technologiczny zatytułowany „The future is already here”, cięty w 120 BPM, w elektrycznym błękicie, czerni, bieli i chromie. Zacznij od sześcianów 3D mnożących się z 1 do 64, potem SIGNAL, skanowana siatkówka z 97.2%, tunel słów z napisem WAKE UP i THE FUTURE z płynnego chromu. Pokaż okno pulpitu FUTURE.EXE, pasek LOADING 99% i odliczanie 3-2-1, następnie cztery szklane obiekty podpisane PRISM, BOLT, PLANET i MIND, wir pierścieni i szachownicę. Zakończ wielkim chromowanym 3D FUTURE z IS ALREADY HERE. i glitchem w END OF TRANSMISSION. Ciężki krój display (Unbounded Black), cienki monospace HUD z kodem czasowym i etykietami klatek, ostre cięcia w rytm.',
    },
    hu: {
      title: 'A jövő már itt van',
      prompt: 'Készíts egy 20 másodperces, energikus tech reelt „The future is already here” címmel, 120 BPM-re vágva, elektromos kék, fekete, fehér és króm színekben. Kezdd 3D kockákkal, amelyek 1-ről 64-re sokszorozódnak, aztán SIGNAL, egy szkennelt retina 97.2%-kal, egy WAKE UP feliratú szóalagút és folyékony krómból THE FUTURE. Mutass egy FUTURE.EXE asztali ablakot, egy LOADING 99% sávot és egy 3-2-1 visszaszámlálást, majd négy PRISM, BOLT, PLANET és MIND feliratú üvegtárgyat, egy gyűrűörvényt és egy sakktáblarácsot. Érkezz meg egy nagy króm 3D FUTURE-re az IS ALREADY HERE. sorral, és zárd egy glitch-csel END OF TRANSMISSION-be. Nehéz display betű (Unbounded Black), vékony monospace HUD időkóddal és képkockacímkékkel, kemény vágások ütemre.',
    },
    fr: {
      title: 'Le futur est déjà là',
      prompt: 'Crée un reel tech de 20 secondes très énergique intitulé « The future is already here », monté à 120 BPM en bleu électrique, noir, blanc et chrome. Ouvre sur des cubes 3D qui se multiplient de 1 à 64, puis SIGNAL, une rétine scannée avec 97.2 %, un tunnel de mots qui dit WAKE UP et THE FUTURE en chrome liquide. Montre une fenêtre de bureau FUTURE.EXE, une barre LOADING 99 % et un compte à rebours 3-2-1, puis quatre objets en verre étiquetés PRISM, BOLT, PLANET et MIND, un vortex d’anneaux et une grille en damier. Termine sur un grand FUTURE chromé en 3D avec IS ALREADY HERE. et finis par un glitch vers END OF TRANSMISSION. Typo d’affichage lourde (Unbounded Black), un HUD fin en chasse fixe avec timecode et libellés de plans, coupes franches sur le temps.',
    },
    uk: {
      title: 'Майбутнє вже тут',
      prompt: 'Зроби 20-секундний енергійний технологічний рил під назвою «The future is already here», змонтований під 120 BPM, в електрик-синьому, чорному, білому й хромі. Почни з 3D-кубів, що розмножуються від 1 до 64, далі SIGNAL, сітківка, яку сканують, із 97.2%, тунель зі слів WAKE UP і THE FUTURE з рідкого хрому. Покажи вікно робочого столу FUTURE.EXE, смугу LOADING 99% і відлік 3-2-1, потім чотири скляні об’єкти з підписами PRISM, BOLT, PLANET і MIND, кільцевий вихор і шахову сітку. Заверши великим хромованим 3D-словом FUTURE з IS ALREADY HERE. і глітчем у END OF TRANSMISSION. Важкий акцидентний шрифт (Unbounded Black), тонкий моноширинний HUD з таймкодом і підписами кадрів, жорсткі склейки в такт.',
    },
    tr: {
      title: 'Gelecek çoktan geldi',
      prompt: '"The future is already here" başlıklı, 120 BPM’e göre kesilmiş, elektrik mavisi, siyah, beyaz ve krom renklerde 20 saniyelik yüksek enerjili bir teknoloji reel’i yap. 1’den 64’e çoğalan 3D küplerle aç, ardından SIGNAL, 97.2% gösteren taranan bir retina, WAKE UP yazan bir kelime tüneli ve sıvı kromdan THE FUTURE. Bir FUTURE.EXE masaüstü penceresi, LOADING 99% çubuğu ve 3-2-1 geri sayımı göster; sonra PRISM, BOLT, PLANET ve MIND etiketli dört cam nesne, halka girdabı ve dama ızgarası. Büyük krom 3D FUTURE ve IS ALREADY HERE. ile bitir, bir glitch ile END OF TRANSMISSION’a geç. Kalın display yazı (Unbounded Black), zaman kodlu ve kare etiketli ince monospace HUD, vuruşta sert kesmeler.',
    },
    th: {
      title: 'อนาคตมาถึงแล้ว',
      prompt: 'สร้างเทครีลพลังสูงยาว 20 วินาทีชื่อ "The future is already here" ตัดตามจังหวะ 120 BPM ในโทนน้ำเงินไฟฟ้า ดำ ขาว และโครม เปิดด้วยลูกบาศก์ 3D ที่ทวีคูณจาก 1 เป็น 64 ตามด้วย SIGNAL เรตินาที่กำลังถูกสแกนพร้อม 97.2% อุโมงค์คำที่เขียนว่า WAKE UP และ THE FUTURE แบบโครมเหลว แสดงหน้าต่างเดสก์ท็อป FUTURE.EXE แถบ LOADING 99% และนับถอยหลัง 3-2-1 แล้วตามด้วยวัตถุแก้วสี่ชิ้นที่ติดป้าย PRISM, BOLT, PLANET และ MIND วังวนวงแหวน และกริดลายตาราง จบที่ตัวอักษรโครม 3D ขนาดใหญ่ FUTURE พร้อม IS ALREADY HERE. แล้วกลิตช์ไปสู่ END OF TRANSMISSION ใช้ฟอนต์ดิสเพลย์หนา (Unbounded Black) HUD ฟอนต์โมโนสเปซบางพร้อมไทม์โค้ดและป้ายเฟรม และตัดฉับตามจังหวะ',
    },
    it: {
      title: 'Il futuro è già qui',
      prompt: 'Crea un reel tech di 20 secondi ad alta energia intitolato "The future is already here", montato a 120 BPM in blu elettrico, nero, bianco e cromo. Apri con cubi 3D che si moltiplicano da 1 a 64, poi SIGNAL, una retina scansionata con 97.2%, un tunnel di parole che dice WAKE UP e THE FUTURE in cromo liquido. Mostra una finestra desktop FUTURE.EXE, una barra LOADING 99% e un conto alla rovescia 3-2-1, poi quattro oggetti in vetro etichettati PRISM, BOLT, PLANET e MIND, un vortice di anelli e una griglia a scacchi. Chiudi su un grande FUTURE cromato in 3D con IS ALREADY HERE. e finisci con un glitch verso END OF TRANSMISSION. Tipografia display pesante (Unbounded Black), un sottile HUD monospazio con timecode ed etichette di fotogramma, tagli netti a tempo.',
    },
  },
};

export function homePresetCopy(pluginId: string, locale: string): HomePresetCopy | undefined {
  const copy: Partial<Record<string, HomePresetCopy>> | undefined = HOME_PRESET_COPY[pluginId];
  return copy?.[locale];
}
