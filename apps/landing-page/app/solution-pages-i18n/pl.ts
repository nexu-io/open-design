import type { SolutionLocaleCopy } from './types';

export const PL: SolutionLocaleCopy = {
  prototype: {
    title: 'Buduj interaktywne prototypy z Open Design + Claude Code',
    description:
      'Zamień polecenie w klikalny, wieloekranowy prototyp bez opuszczania terminala. Open Design daje Twojemu coding agentowi umiejętności projektowe, szablony i system projektowy, by tworzyć prawdziwe prototypy, które otworzysz w przeglądarce.',
    breadcrumb: 'Prototyp',
    label: 'Przypadek użycia · Prototyp',
    heading: 'Prototypuj z szybkością polecenia',
    lead: 'Opisz przepływ, który masz w głowie, a agent złoży prawdziwy, klikalny prototyp — wiele ekranów, wspólne style i działające interakcje — wyrenderowany wprost do HTML, który otworzysz, udostępnisz i przekażesz inżynierom.',
    heroImageAlt:
      'Redakcyjna ilustracja dłoni szkicującej wireframe, który zamienia się w klikalny, wieloekranowy prototyp aplikacji',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design to warstwa projektowa dla coding agenta, którego już używasz. W prototypowaniu oznacza to przejście od pomysłu opisanego w jednym akapicie do nawigowalnego, ostylowanego prototypu w jednej sesji — bez narzędzia projektowego, bez kroku eksportu, bez luki przy przekazywaniu.',
    stepsTitle: 'Jak działa prototypowanie z Open Design',
    steps: [
      {
        title: 'Opisz przepływ',
        body: 'Powiedz agentowi prostym językiem, co budujesz — „przepływ onboardingu z ekranem powitalnym, wyborem planu i potwierdzeniem”. Open Design ładuje umiejętność prototypowania, więc agent wie, że ma stworzyć ekrany, a nie pojedynczą stronę.',
        imageAlt:
          'Ilustracja osoby wpisującej w terminalu opis przepływu aplikacji prostym językiem',
      },
      {
        title: 'Wygeneruj ostylowane ekrany',
        body: 'Agent stosuje system projektowy i szablony prototypów z Open Design, więc każdy ekran dzieli typografię, odstępy i komponenty, zamiast wyglądać jak zgrubny szkic. Otrzymujesz spójny zestaw ekranów, a nie rozłączne makiety.',
        imageAlt:
          'Ilustracja kilku ekranów aplikacji pojawiających się po kolei, wszystkie w jednym spójnym stylu wizualnym',
      },
      {
        title: 'Połącz interakcje',
        body: 'Przyciski nawigują, zakładki się przełączają, modale się otwierają. Prototyp renderuje się do samodzielnego HTML, więc zachowuje się jak prawdziwy produkt w każdej przeglądarce — by go obejrzeć, nie potrzeba konta w narzędziu do prototypowania.',
        imageAlt:
          'Ilustracja kursora klikającego przez połączone ekrany, ze strzałkami pokazującymi nawigację między nimi',
      },
      {
        title: 'Iteruj i przekaż dalej',
        body: 'Dopracuj go w rozmowie z agentem — „zmień wybór planu na układ trójkolumnowy”. Ponieważ artefakt żyje w Twoim projekcie, projekt i docelowy kod dzielą jedno źródło prawdy, zamykając typową lukę przy przekazywaniu pracy od projektanta do inżyniera.',
        imageAlt:
          'Ilustracja prototypu, który jest poprawiany, a następnie przekazywany inżynierowi, gdzie projekt i kod łączą się w jeden plik',
      },
    ],
    tableTitle: 'Prototypowanie z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Tradycyjne narzędzia do prototypowania',
    tableRows: [
      {
        capability: 'Przejść od pomysłu do pierwszego ekranu',
        withOd: 'Jedno polecenie w agencie, którego już masz otwartego',
        without: 'Otwórz osobne narzędzie, załóż plik, przeciągaj prostokąty ręcznie',
      },
      {
        capability: 'Wiele połączonych ekranów',
        withOd: 'Wygenerowane jako zestaw ze wspólnymi stylami i działającą nawigacją',
        without: 'Każda ramka rysowana i łączona ręcznie',
      },
      {
        capability: 'Spójny system wizualny',
        withOd: 'Czerpany z wielokrotnego systemu projektowego, który agent stosuje',
        without: 'Odtwarzany w każdym pliku lub utrzymywany ręcznie',
      },
      {
        capability: 'Wynik gotowy do udostępnienia',
        withOd: 'Samodzielny HTML — otwiera się w każdej przeglądarce, bez konta',
        without: 'Oglądający potrzebuje miejsca lub linku do udostępnienia w narzędziu dostawcy',
      },
      {
        capability: 'Droga do prawdziwego kodu',
        withOd: 'Artefakt żyje w Twoim repozytorium; projekt i kod dzielą jedno źródło',
        without: 'Budowany od zera po osobnym przekazaniu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Abonament za stanowisko, hostowane u dostawcy, ograniczony eksport',
      },
    ],
    featuresTitle: 'Co możesz prototypować',
    features: [
      {
        title: 'Wieloekranowe aplikacje webowe',
        body: 'Pełne przepływy ze wspólną nawigacją — onboarding, dashboardy, ustawienia — a nie pojedyncze strony.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Przepływy aplikacji mobilnych',
        body: 'Mobilne ścieżki ekran po ekranie z przejściami i stanami, które sprawiają wrażenie natywnych.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Strony docelowe',
        body: 'Strony marketingowe i landingi SaaS, które możesz przeklikać i wdrożyć.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Dowolny gust wizualny',
        body: 'Redakcyjny, miękki czy brutalistyczny — prototyp niesie spójny styl od początku do końca.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Lista oczekujących i cennik',
        body: 'Powierzchnie konwersji — listy oczekujących, tabele cenowe — podłączone i zgodne z marką.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Grywalizacja i zabawa',
        body: 'Koncepcje nasycone interakcją, w których ruch i stan są częścią prezentacji.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Prototypy, które ludzie zbudowali z Open Design',
    galleryLead:
      'Każdy z nich zaczął się od polecenia i wyrenderował do klikalnego artefaktu. Wybierz szablon bliski Twojemu pomysłowi, opisz swoją wariację, a agent go dostosuje.',
    gallery: [
      { thumb: "example-dating-web", caption: "Webowa aplikacja randkowa — przepływ wieloekranowy" },
      { thumb: "example-hr-onboarding", caption: "Przepływ onboardingu HR" },
      { thumb: "example-kami-landing", caption: "Strona docelowa produktu" },
      { thumb: "example-web-prototype-taste-soft", caption: "Webowy prototyp w miękkim stylu" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony prototypów',
    faqTitle: 'FAQ o prototypowaniu',
    faq: [
      {
        q: 'Czy potrzebuję narzędzia projektowego jak Figma, by prototypować z Open Design?',
        a: 'Nie. Open Design działa wewnątrz Twojego coding agenta i renderuje prototypy do HTML. Opisujesz przepływ językiem; agent tworzy ekrany. Nie ma osobnego narzędzia z płótnem, którego trzeba się uczyć lub za które trzeba płacić.',
      },
      {
        q: 'Czy prototypy są interaktywne, czy to tylko statyczne makiety?',
        a: 'Interaktywne. Nawigacja, zakładki i modale działają, bo wynik to prawdziwy HTML i CSS. Możesz przeklikać go w każdej przeglądarce dokładnie tak, jak zrobiłby to użytkownik.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Open Design współpracuje z Claude Code, Codex, Cursor Agent, Gemini CLI i kilkunastoma innymi natywnymi adapterami. Korzystasz z własnych kluczy dostawcy; nic nie jest hostowane za Ciebie.',
      },
      {
        q: 'Czy prototyp może stać się prawdziwym produktem?',
        a: 'O to właśnie chodzi. Artefakt żyje w Twoim projekcie, więc ten sam system projektowy i komponenty przechodzą do kodu produkcyjnego, zamiast być wyrzucane po przekazaniu.',
      },
    ],
    ctaTitle: 'Sprototypuj swój kolejny pomysł jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień swoje kolejne „a gdyby” w coś, co możesz kliknąć — w agencie, którego już używasz.',
  },
  dashboard: {
    title: 'Generuj dashboardy danych z Open Design + Claude Code',
    description:
      'Opisz metryki, które śledzisz, a Twój coding agent zbuduje ostylowany, responsywny dashboard — wykresy, karty KPI i tabele wyrenderowane do HTML, który zahostujesz gdziekolwiek. Bez stanowiska w narzędziu BI, bez kreatora przeciągnij i upuść.',
    breadcrumb: 'Dashboard',
    label: 'Przypadek użycia · Dashboard',
    heading: 'Dashboardy z opisu, a nie z kreatora przeciągnij i upuść',
    lead: 'Powiedz agentowi, co pokazać i jak ma to wyglądać. Open Design dostarcza wzorce wykresów, system układu i język wizualny, więc otrzymujesz spójny, prezentowalny dashboard — a nie ścianę domyślnie ostylowanych widżetów.',
    heroImageAlt:
      'Redakcyjna ilustracja surowych liczb po lewej, które przepływają w czysty dashboard z wykresami i kartami KPI po prawej',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia opisaną prostym językiem specyfikację Twoich metryk w ostylowany dashboard, który agent renderuje do HTML — wersjonowany w Twoim repozytorium, hostowalny gdziekolwiek, bez abonamentu BI za stanowisko.',
    stepsTitle: 'Jak działają dashboardy z Open Design',
    steps: [
      {
        title: 'Opisz metryki',
        body: 'Wypisz, co się liczy — „aktywni użytkownicy tygodniowo, przychód według planu, churn i trend 30-dniowy”. Agent ładuje umiejętność dashboardu, więc wie, że ma rozłożyć karty KPI, wykresy i tabelę, a nie pojedynczy blok tekstu.',
        imageAlt: 'Ilustracja osoby wypisującej metryki, na których jej zależy',
      },
      {
        title: 'Wybierz wzorce wykresów',
        body: 'Open Design dostarcza szablony wykresów i układów, więc trendy stają się wykresami liniowymi, podziały słupkami, a proporcje właściwą wizualizacją — spójna typografia i odstępy w całości, zamiast niedopasowanych domyślnych ustawień.',
        imageAlt: 'Ilustracja kilku typów wykresów ułożonych w spójną siatkę',
      },
      {
        title: 'Podłącz swoje dane',
        body: 'Wskaż dashboardowi plik CSV, endpoint JSON lub wklej przykładowe wiersze. Renderuje się do samodzielnego HTML, który aktualizuje się wraz z danymi — otwórz go w każdej przeglądarce, wrzuć na dowolny statyczny hosting.',
        imageAlt: 'Ilustracja pliku danych łączącego się z dashboardem aktualizowanym na żywo',
      },
      {
        title: 'Dopracuj i wdróż',
        body: 'Dostosuj go w rozmowie z agentem — „pogrupuj przychód według regionu, przenieś wiersz KPI na górę”. Artefakt żyje w Twoim projekcie, więc dashboard można recenzować i wersjonować jak każdy inny kod.',
        imageAlt: 'Ilustracja dashboardu, który jest dopracowywany, a następnie wdrażany',
      },
    ],
    tableTitle: 'Dashboardy z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Narzędzia BI / ręcznie kodowane',
    tableRows: [
      {
        capability: 'Przejść od listy metryk do układu',
        withOd: 'Jedno polecenie; agent rozkłada karty, wykresy i tabele',
        without: 'Przeciągaj widżety jeden po drugim albo pisz kod wykresów od zera',
      },
      {
        capability: 'Spójny system wizualny',
        withOd: 'Wzorce wykresów i odstępy z wielokrotnego systemu projektowego',
        without: 'Domyślne style widżetów albo stylowanie ręczne dla każdego wykresu',
      },
      {
        capability: 'Podłączenie danych',
        withOd: 'CSV / JSON / wklejone wiersze, renderowane do żywego HTML',
        without: 'Konektory dostawcy lub niestandardowa instalacja danych',
      },
      {
        capability: 'Hosting i udostępnianie',
        withOd: 'Samodzielny HTML na dowolnym statycznym hostingu, bez konta',
        without: 'Oglądający potrzebuje stanowiska u dostawcy BI',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Żyje w Twoim repozytorium; porównywalny diffem jak kod',
        without: 'Zamknięty u dostawcy, bez prawdziwego diffu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Abonament za stanowisko, hostowane u dostawcy',
      },
    ],
    featuresTitle: 'Co możesz zbudować',
    features: [
      { title: "Analityka produktu", body: "Aktywni użytkownicy, lejki, retencja — metryki, którymi żyje zespół produktowy.", thumb: "example-dashboard" },
      { title: "Metryki repo i dev", body: "Gwiazdki, PR-y, kondycja CI — dashboardy inżynierskie z Twoich własnych danych.", thumb: "example-github-dashboard" },
      { title: "Raporty finansowe", body: "Przychód, spalanie gotówki, runway rozłożone w udostępnialny raport.", thumb: "example-finance-report" },
      { title: "Operacje na żywo", body: "Metryki w czasie rzeczywistym, które odświeżają się, gdy zmieniają się dane źródłowe.", thumb: "example-live-dashboard" },
      { title: "Social i marketing", body: "Wydajność kanałów i śledzenie kampanii w jednym widoku.", thumb: "example-social-media-dashboard" },
      { title: "Raporty dziedzinowe", body: "Ustrukturyzowane raporty dla dowolnej dziedziny — od klinicznej po tradingową.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Dashboardy, które ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe dashboardy wyrenderowane z polecenia i źródła danych. Zacznij od jednego bliskiego Twojemu i opisz metryki, które śledzisz.',
    gallery: [
      { thumb: "example-data-report", caption: "Raport danych" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard operacji na żywo" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard analizy tradingowej" },
      { thumb: "example-frame-data-chart-nyt", caption: "Redakcyjny wykres danych" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony dashboardów',
    faqTitle: 'FAQ o dashboardach',
    faq: [
      {
        q: 'Czy potrzebuję narzędzia BI jak Tableau lub Looker?',
        a: 'Nie. Open Design renderuje dashboardy do HTML wewnątrz Twojego coding agenta. Opisujesz metryki i wskazujesz mu swoje dane; nie ma osobnej platformy BI, którą trzeba licencjonować lub poznawać.',
      },
      {
        q: 'Skąd biorą się dane?',
        a: 'Z pliku CSV, endpointu JSON lub wierszy, które wklejasz. Dashboard to czysty HTML i JavaScript, więc kontrolujesz dokładnie, skąd czyta — nic nie jest przekierowywane przez hostowaną usługę.',
      },
      {
        q: 'Czy nietechniczni członkowie zespołu mogą go oglądać?',
        a: 'Tak. Wynik to samodzielna strona internetowa. Każdy z linkiem lub plikiem może otworzyć ją w przeglądarce — bez konta, bez stanowiska.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i kilkunastu innych natywnych adapterów. Korzystasz z własnych kluczy dostawcy.',
      },
    ],
    ctaTitle: 'Zbuduj swój dashboard jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień swoje metryki w dashboard, który zahostujesz gdziekolwiek — w agencie, którego już używasz.',
  },
  slides: {
    title: 'Generuj prezentacje z Open Design + Claude Code',
    description:
      'Zamień konspekt w zaprojektowaną, zgodną z marką prezentację bez otwierania aplikacji do prezentacji. Open Design daje Twojemu coding agentowi szablony slajdów i system wizualny, renderując slajdy do HTML, które zaprezentujesz, wyeksportujesz lub udostępnisz.',
    breadcrumb: 'Slajdy',
    label: 'Przypadek użycia · Slajdy',
    heading: 'Prezentacje, które wyglądają na zaprojektowane, napisane poleceniem',
    lead: 'Przekaż agentowi konspekt i ton. Open Design stosuje szablon prezentacji i system wizualny, więc każdy slajd jest rozłożony, złożony typograficznie i zgodny z marką — a nie listą punktowaną na pustym tle.',
    heroImageAlt:
      'Redakcyjna ilustracja konspektu po lewej, który zamienia się w sekwencję zaprojektowanych slajdów prezentacji po prawej',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia konspekt w zaprojektowaną prezentację HTML, którą agent renderuje w jednej sesji — zaprezentuj ją w przeglądarce, wyeksportuj do PDF lub PPTX i zachowaj źródło w swoim repozytorium.',
    stepsTitle: 'Jak działają prezentacje z Open Design',
    steps: [
      {
        title: 'Podaj konspekt',
        body: 'Wklej swoje punkty do omówienia lub zgrubną strukturę. Agent ładuje umiejętność prezentacji, więc tworzy sekwencję rozłożonych slajdów, a nie jeden długi dokument.',
        imageAlt: 'Ilustracja tekstowego konspektu przekazywanego agentowi',
      },
      {
        title: 'Wybierz styl prezentacji',
        body: 'Open Design dostarcza szablony prezentacji — redakcyjny, szwajcarski międzynarodowy, ciemny techniczny i więcej. Agent stosuje jeden, więc typografia, siatka i akcenty pozostają spójne na każdym slajdzie.',
        imageAlt: 'Ilustracja kilku opcji stylu prezentacji ułożonych obok siebie',
      },
      {
        title: 'Wygeneruj slajdy',
        body: 'Każdy punkt staje się zaprojektowanym slajdem z właściwą hierarchią — tytuły, wizualizacje wspierające, wyróżnienia danych. Renderuje się do HTML, więc prezentuje się pełnoekranowo w każdej przeglądarce.',
        imageAlt: 'Ilustracja sekwencji gotowych slajdów ze spójnym stylem',
      },
      {
        title: 'Prezentuj, eksportuj, iteruj',
        body: 'Prezentuj z przeglądarki lub wyeksportuj do PDF / PPTX, by udostępnić. Dopracuj go w rozmowie z agentem — „zwarcie slajd z danymi, dodaj końcowe wezwanie do działania”. Źródło prezentacji zostaje w Twoim projekcie.',
        imageAlt: 'Ilustracja prezentacji, która jest pokazywana i eksportowana do wielu formatów',
      },
    ],
    tableTitle: 'Prezentacje z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'PowerPoint / Keynote / narzędzia AI do slajdów',
    tableRows: [
      {
        capability: 'Przejść od konspektu do slajdów',
        withOd: 'Jedno polecenie; agent rozkłada każdy slajd',
        without: 'Buduj każdy slajd ręcznie albo walcz z szablonem',
      },
      {
        capability: 'Spójny projekt',
        withOd: 'Szablony prezentacji z prawdziwą siatką i systemem typograficznym',
        without: 'Dryf motywu, ręczne wyrównywanie, domyślne ustawienia niezgodne z marką',
      },
      {
        capability: 'Dane i diagramy',
        withOd: 'Wykresy i wyróżnienia renderowane jako część slajdu',
        without: 'Wklejanie statycznych obrazów lub odbudowa wykresów za każdym razem',
      },
      {
        capability: 'Formaty eksportu',
        withOd: 'HTML do prezentacji plus eksport do PDF / PPTX',
        without: 'Uwięziony w formacie jednej aplikacji',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Źródło żyje w Twoim repozytorium, porównywalne diffem',
        without: 'Plik binarny, bez sensownego diffu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Licencja aplikacji lub dodatek AI za stanowisko',
      },
    ],
    featuresTitle: 'Co możesz zaprezentować',
    features: [
      { title: "Pitch decki", body: "Prezentacje inwestorskie i sprzedażowe z mocną narracją i czystymi slajdami danych.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Szwajcarski / redakcyjny", body: "Oparte na siatce, typograficzne prezentacje, które wyglądają na opracowane artystycznie.", thumb: "example-deck-swiss-international" },
      { title: "Moduły kursowe", body: "Prezentacje szkoleniowe z jasnymi krokami, wyróżnieniami i tempem.", thumb: "example-html-ppt-course-module" },
      { title: "Prezentacje z wykresami", body: "Ciemne, eksponujące wykresy prezentacje do analityki i przeglądów.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Tryb prezentera", body: "Prezentacje w stylu reveal zbudowane do pokazywania na żywo w przeglądarce.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Plany techniczne", body: "Prezentacje architektury i wiedzy, które mapują złożone systemy.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Prezentacje, które ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe prezentacje wyrenderowane z konspektu. Wybierz styl bliski Twojemu wystąpieniu i opisz treść.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Redakcyjna prezentacja magazynowa" },
      { thumb: "example-guizang-ppt", caption: "Ilustrowany keynote" },
      { thumb: "example-deck-open-slide-canvas", caption: "Prezentacja open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Prezentacja w motywie gradientowym" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony prezentacji',
    faqTitle: 'FAQ o slajdach',
    faq: [
      {
        q: 'Czy potrzebuję PowerPointa lub Keynote?',
        a: 'Nie. Open Design renderuje prezentacje do HTML wewnątrz Twojego coding agenta i może eksportować do PDF lub PPTX. Prezentujesz z przeglądarki lub przekazujesz plik — by ją zbudować, nie potrzeba aplikacji do prezentacji.',
      },
      {
        q: 'Czy to tylko punkty wygenerowane przez AI?',
        a: 'Nie. Agent stosuje prawdziwy szablon prezentacji z siatką, skalą typograficzną i hierarchią wizualną, więc slajdy wyglądają na zaprojektowane, a nie automatycznie wypełnione.',
      },
      {
        q: 'Czy mogę wyeksportować do PowerPointa dla klienta?',
        a: 'Tak. Prezentacje eksportują się do PPTX i PDF obok HTML, z którego prezentujesz, więc pasują do tego, czego oczekuje odbiorca.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Zbuduj swoją kolejną prezentację jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień swój konspekt w zaprojektowaną prezentację — w agencie, którego już używasz.',
  },
  image: {
    title: 'Generuj grafiki zgodne z marką z Open Design + Claude Code',
    description:
      'Twórz karty społecznościowe, okładki artykułów i grafiki marketingowe z polecenia — rozłożone z prawdziwą typografią i Twoim systemem marki, wyrenderowane do ostrego HTML, który wyeksportujesz do PNG. Bez aplikacji projektowej, bez abonamentu na szablony.',
    breadcrumb: 'Grafika',
    label: 'Przypadek użycia · Grafika',
    heading: 'Grafiki zgodne z marką, wygenerowane i rozłożone za Ciebie',
    lead: 'Opisz kartę lub okładkę, której potrzebujesz. Open Design komponuje ją z prawdziwą typografią, siatką i Twoimi kolorami marki — a potem renderuje do HTML, który wyeksportujesz jako obraz, zamiast mocować się z aplikacją projektową lub ogólnym szablonem.',
    heroImageAlt:
      'Redakcyjna ilustracja polecenia, które zamienia się w zestaw rozłożonych kart społecznościowych i okładek artykułów',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia polecenie w złożoną typograficznie, zgodną z marką grafikę, którą agent renderuje do HTML i eksportuje do PNG — powtarzalną, wersjonowaną i wolną od narzędzi projektowych rozliczanych za stanowisko.',
    stepsTitle: 'Jak działają grafiki z Open Design',
    steps: [
      {
        title: 'Opisz grafikę',
        body: 'Powiedz, czym jest — „karta na Twitter na nasz launch z nagłówkiem i cytatem”. Agent ładuje właściwą umiejętność, więc komponuje rozłożoną grafikę, a nie zwykły blok tekstu.',
        imageAlt: 'Ilustracja osoby opisującej kartę społecznościową, której potrzebuje',
      },
      {
        title: 'Zastosuj system marki',
        body: 'Open Design czerpie Twoje kolory, typografię i odstępy z wielokrotnego systemu projektowego, więc każda karta pasuje do reszty Twojej marki, zamiast wyglądać na jednorazową.',
        imageAlt: 'Ilustracja kolorów marki i typografii nakładanych na układ karty',
      },
      {
        title: 'Wyrenderuj i wyeksportuj',
        body: 'Grafika renderuje się do HTML w dokładnie potrzebnych wymiarach — karta społecznościowa, okładka, baner — a potem eksportuje do PNG. Ostry tekst, prawdziwy układ, bez ręcznego poprawiania.',
        imageAlt: 'Ilustracja grafiki, która renderuje się i eksportuje do pliku obrazu',
      },
      {
        title: 'Wykorzystaj przepis ponownie',
        body: 'Ponieważ to szablon, kolejna grafika jest o jedno polecenie dalej — zmień nagłówek, zachowaj układ. Serie kart pozostają idealnie spójne.',
        imageAlt: 'Ilustracja jednego szablonu karty tworzącego spójną serię grafik',
      },
    ],
    tableTitle: 'Grafiki z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Aplikacje projektowe / ogólne szablony',
    tableRows: [
      {
        capability: 'Przejść od pomysłu do rozłożonej grafiki',
        withOd: 'Jedno polecenie; agent komponuje typografię i układ',
        without: 'Otwórz aplikację, umieść każdy element ręcznie',
      },
      {
        capability: 'Pozostać zgodnym z marką',
        withOd: 'Kolory i typografia z wielokrotnego systemu projektowego',
        without: 'Wybieraj style marki w każdym pliku albo dryfuj od marki',
      },
      {
        capability: 'Spójna seria',
        withOd: 'Ten sam szablon, nowa treść — idealnie wyrównany zestaw',
        without: 'Wyrównuj każdy wariant ręcznie',
      },
      {
        capability: 'Eksport',
        withOd: 'HTML w dokładnych wymiarach, eksportowany do PNG',
        without: 'Ręczne ustawianie rozmiaru płótna i opcji eksportu',
      },
      {
        capability: 'Powtarzalność',
        withOd: 'Przepis sterowany poleceniem w Twoim repozytorium',
        without: 'Jednorazowy plik odtwarzany za każdym razem',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Narzędzie projektowe za stanowisko lub marketplace szablonów',
      },
    ],
    featuresTitle: 'Co możesz stworzyć',
    features: [
      { title: "Karty społecznościowe", body: "Karty na X / Twitter skomponowane z Twoim nagłówkiem i marką.", thumb: "example-card-twitter" },
      { title: "Okładki artykułów", body: "Redakcyjne, magazynowe okładki do postów i newsletterów.", thumb: "example-article-magazine" },
      { title: "Karty Xiaohongshu", body: "Karty w stylu RedNote dostrojone do tego feedu.", thumb: "example-card-xiaohongshu" },
      { title: "Grafiki hero", body: "Płynne, gradientowe wizualizacje hero do stron i launchy.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Karuzele", body: "Wieloslajdowe karuzele społecznościowe, które pozostają spójne między ramkami.", thumb: "example-social-carousel" },
      { title: "Ramki makiet UI", body: "Ramki powiadomień i urządzeń do opowiadania historii produktu.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Grafiki, które ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe karty i okładki wyrenderowane z polecenia. Wybierz jedną bliską temu, czego potrzebujesz, i podmień swoją treść.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Pastelowa karta społecznościowa" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Redakcyjny plakat trójtonowy" },
      { thumb: "example-magazine-poster", caption: "Plakat w stylu magazynowym" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Wyrazista redakcyjna okładka" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony grafik',
    faqTitle: 'FAQ o grafikach',
    faq: [
      {
        q: 'Czy to generator obrazów AI jak Midjourney?',
        a: 'Nie. Open Design komponuje grafiki z prawdziwym układem i typografią — Twój nagłówek, Twoja marka, dokładne wymiary — i renderuje do HTML, który eksportujesz jako PNG. To kompozycja projektowa, a nie generowanie pikseli.',
      },
      {
        q: 'Czy mogę stworzyć spójną serię kart?',
        a: 'Tak. Ponieważ każda grafika to szablon, zachowujesz układ i zmieniasz treść, więc cała seria pozostaje idealnie wyrównana i zgodna z marką.',
      },
      {
        q: 'Jakie rozmiary potrafi tworzyć?',
        a: 'Dowolne — grafika renderuje się w dokładnie podanych przez Ciebie wymiarach, od kwadratowej karty społecznościowej po szeroki baner, a potem eksportuje do PNG.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Stwórz swoją kolejną grafikę jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień polecenie w grafikę zgodną z marką — w agencie, którego już używasz.',
  },
  video: {
    title: 'Generuj grafikę ruchomą i krótkie wideo z Open Design + Claude Code',
    description:
      'Zamień scenariusz w animowane klatki i krótkie wideo — plansze tytułowe, ruchome tła i końcówki skomponowane z Twoim systemem marki i wyrenderowane z HTML. Bez pakietu do grafiki ruchomej, bez przewijania osi czasu.',
    breadcrumb: 'Wideo',
    label: 'Przypadek użycia · Wideo',
    heading: 'Grafika ruchoma ze scenariusza, a nie z osi czasu',
    lead: 'Opisz moment, którego chcesz — odsłonięcie tytułu, animację danych, końcówkę z logo. Open Design komponuje animowane klatki z Twoim systemem marki i renderuje je do wideo, bez potrzeby pakietu do grafiki ruchomej.',
    heroImageAlt:
      'Redakcyjna ilustracja scenariusza, który zamienia się w sekwencję animowanych klatek wideo',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design zamienia scenariusz w animowane, zgodne z marką klatki, które agent renderuje do krótkiego wideo — skomponowane z HTML, wersjonowane w Twoim repozytorium, bez edytora osi czasu, którego trzeba się uczyć.',
    stepsTitle: 'Jak działa ruch z Open Design',
    steps: [
      {
        title: 'Opisz moment',
        body: 'Powiedz, co ma się wydarzyć — „glitchowy tytuł, który przechodzi w nasze logo, a potem plansza końcowa”. Agent ładuje umiejętność ruchu, więc tworzy animowane klatki, a nie statyczny obraz.',
        imageAlt: 'Ilustracja osoby opisującej sekwencję ruchu',
      },
      {
        title: 'Zastosuj styl marki i ruchu',
        body: 'Open Design dostarcza szablony klatek — filmowe rozbłyski światła, glitchowe tytuły, końcówki z logo — i nakłada Twoje kolory oraz typografię, więc ruch wygląda na zamierzony i zgodny z marką.',
        imageAlt: 'Ilustracja stylu marki nakładanego na animowane klatki',
      },
      {
        title: 'Wyrenderuj klatki do wideo',
        body: 'Klatki są komponowane w HTML i renderowane do wideo, więc czas i układ są precyzyjne i powtarzalne — bez ręcznego ustawiania klatek kluczowych na osi czasu.',
        imageAlt: 'Ilustracja klatek HTML renderujących się w klip wideo',
      },
      {
        title: 'Iteruj i eksportuj',
        body: 'Dopracuj go w rozmowie z agentem — „zwolnij odsłonięcie tytułu, dodaj napis”. Eksportuj krótkie klipy na social media lub do produktu. Źródło zostaje w Twoim projekcie.',
        imageAlt: 'Ilustracja klipu wideo, który jest dopracowywany i eksportowany na social media',
      },
    ],
    tableTitle: 'Ruch z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'After Effects / pakiety do grafiki ruchomej',
    tableRows: [
      {
        capability: 'Przejść od scenariusza do animowanych klatek',
        withOd: 'Jedno polecenie; agent komponuje sekwencję',
        without: 'Ustawiaj klatki kluczowe każdego elementu na osi czasu ręcznie',
      },
      {
        capability: 'Pozostać zgodnym z marką',
        withOd: 'Szablony klatek + Twoje kolory i typografia',
        without: 'Odbudowuj stylowanie marki w każdym projekcie',
      },
      {
        capability: 'Precyzyjny, powtarzalny czas',
        withOd: 'Skomponowane w HTML, renderowane deterministycznie',
        without: 'Ręczne przewijanie, trudne do odtworzenia',
      },
      {
        capability: 'Eksport na social media',
        withOd: 'Krótkie klipy renderowane do wideo',
        without: 'Presety eksportu i walka z kodekami',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Źródło klatek żyje w Twoim repozytorium, porównywalne diffem',
        without: 'Binarny plik projektu, bez prawdziwego diffu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, własne klucze, działa lokalnie',
        without: 'Drogi pakiet, stroma krzywa uczenia',
      },
    ],
    featuresTitle: 'Co możesz animować',
    features: [
      { title: "Hyperframes", body: "Sekwencje ruchu klatka po klatce skomponowane z HTML.", thumb: "example-video-hyperframes" },
      { title: "Krótkie formy społecznościowe", body: "Pionowe klipy zbudowane pod feedy społecznościowe.", thumb: "example-video-shortform" },
      { title: "Zestawy klatek ruchu", body: "Wielokrotne animowane klatki, które komponujesz w klip.", thumb: "example-motion-frames" },
      { title: "Filmowe rozbłyski światła", body: "Filmowe przejścia i atmosferyczne tła.", thumb: "example-frame-light-leak-cinema" },
      { title: "Glitchowe tytuły", body: "Odsłonięcia tytułów z ruchem i teksturą.", thumb: "example-frame-glitch-title" },
      { title: "Końcówki z logo", body: "Markowe animacje końcowe do dowolnego klipu.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Ruch, który ludzie zbudowali z Open Design',
    galleryLead:
      'Prawdziwe animowane klatki i klipy wyrenderowane z polecenia. Wybierz jeden bliski Twojemu pomysłowi i opisz ruch.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Sekwencja hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Płynne ruchome tło" },
      { thumb: "example-frame-macos-notification", caption: "Animowana ramka UI" },
      { thumb: "example-frame-data-chart-nyt", caption: "Animowany wykres danych" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony ruchu',
    faqTitle: 'FAQ o wideo',
    faq: [
      {
        q: 'Czy potrzebuję After Effects lub pakietu do grafiki ruchomej?',
        a: 'Nie. Open Design komponuje animowane klatki w HTML i renderuje je do wideo wewnątrz Twojego coding agenta. Nie ma edytora osi czasu, którego trzeba się uczyć lub który trzeba licencjonować.',
      },
      {
        q: 'Do jakiego rodzaju wideo to się nadaje?',
        a: 'Do krótkich form ruchu — plansze tytułowe, animacje danych, końcówki z logo, klipy społecznościowe. Jest zbudowane pod ruch marki i produktu, a nie pod montaż pełnometrażowy.',
      },
      {
        q: 'Czy czas jest odtwarzalny?',
        a: 'Tak. Ponieważ klatki są komponowane w kodzie i renderowane deterministycznie, za każdym razem otrzymujesz ten sam wynik i możesz go precyzyjnie dostroić poleceniem.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Zanimuj swój kolejny pomysł jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień scenariusz w ruch — w agencie, którego już używasz.',
  },
  designSystem: {
    title: 'Zbuduj i zastosuj system projektowy z Open Design + Claude Code',
    description:
      'Uchwyć swoją markę jako wielokrotny system projektowy, który Twój coding agent stosuje do każdego artefaktu — kolory, typografia, komponenty i ton w jednym DESIGN.md. Zdefiniuj raz; każdy prototyp, prezentacja i dashboard pozostaje zgodny z marką.',
    breadcrumb: 'System projektowy',
    label: 'Przypadek użycia · System projektowy',
    heading: 'Jeden system projektowy, zastosowany do wszystkiego, co tworzy Twój agent',
    lead: 'Zdefiniuj swoją markę raz, a Open Design przenosi ją do każdego efektu — prototypów, prezentacji, dashboardów, grafik. System żyje w Twoim repozytorium jako DESIGN.md, który agent czyta, więc spójność jest automatyczna, a nie ręczna.',
    heroImageAlt:
      'Redakcyjna ilustracja pojedynczego systemu projektowego promieniującego na wiele artefaktów zgodnych z marką',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design ujmuje Twoją markę jako przenośny system projektowy, który agent stosuje do każdego artefaktu — zdefiniowany raz w Twoim repozytorium, egzekwowany wszędzie, bez centralnego narzędzia projektowego, które by go strzegło.',
    stepsTitle: 'Jak działają systemy projektowe z Open Design',
    steps: [
      {
        title: 'Uchwyć system',
        body: 'Opisz swoją markę — kolory, typografię, odstępy, głos — albo wskaż agentowi istniejącą stronę, by ją wyodrębnił. Open Design zapisuje to w DESIGN.md, który żyje w Twoim projekcie.',
        imageAlt: 'Ilustracja marki ujmowanej w pojedynczy plik systemu projektowego',
      },
      {
        title: 'Zacznij od sprawdzonej bazy',
        body: 'Open Design dostarcza ponad 140 referencyjnych systemów projektowych — od Apple i Linear po redakcyjne i brutalistyczne. Sforkuj jeden bliski Twojej marce zamiast zaczynać od pustej strony.',
        imageAlt: 'Ilustracja przeglądanej galerii referencyjnych systemów projektowych',
      },
      {
        title: 'Stosuj go wszędzie',
        body: 'Każda inna umiejętność czyta ten sam system, więc prototyp, prezentacja i dashboard dzielą jeden język wizualny — bez ponownego określania go za każdym razem.',
        imageAlt: 'Ilustracja jednego systemu stosowanego spójnie w wielu typach artefaktów',
      },
      {
        title: 'Rozwijaj go w jednym miejscu',
        body: 'Zmień system, a kolejny render odzwierciedli to wszędzie. Ponieważ to plik w Twoim repozytorium, decyzje projektowe są recenzowane i wersjonowane jak kod.',
        imageAlt: 'Ilustracja systemu projektowego, który jest aktualizowany i propagowany do wszystkich efektów',
      },
    ],
    tableTitle: 'Systemy projektowe z Open Design kontra dawny sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Biblioteki narzędzi projektowych / przewodniki stylu',
    tableRows: [
      {
        capability: 'Zdefiniować system',
        withOd: 'DESIGN.md, który agent czyta, sforkowany z ponad 140 referencji',
        without: 'Statyczny przewodnik stylu lub biblioteka związana z narzędziem',
      },
      {
        capability: 'Stosować w różnych typach artefaktów',
        withOd: 'Ten sam system zasila prototypy, prezentacje, dashboardy, grafiki',
        without: 'Wdrażany na nowo w każdym narzędziu i pliku',
      },
      {
        capability: 'Utrzymać wszystko spójnym',
        withOd: 'Automatycznie — każda umiejętność czyta jedno źródło',
        without: 'Ręczna dyscyplina; dryfuje z czasem',
      },
      {
        capability: 'Rozwijać markę',
        withOd: 'Edytuj raz; kolejny render aktualizuje się wszędzie',
        without: 'Wyszukiwanie i zamiana w plikach i narzędziach',
      },
      {
        capability: 'Recenzja i wersjonowanie',
        withOd: 'Żyje w Twoim repozytorium, porównywalny diffem jak kod',
        without: 'Zakopany w narzędziu projektowym, trudny do audytu',
      },
      {
        capability: 'Koszt i uzależnienie od dostawcy',
        withOd: 'Open source, przenośny, działa lokalnie',
        without: 'Uwięziony w abonamencie narzędzia projektowego',
      },
    ],
    featuresTitle: 'Systemy, od których możesz zacząć',
    features: [
      { title: "Apple", body: "Czysta, powściągliwa estetyka z fontem systemowym.", thumb: "design-system-apple" },
      { title: "Linear", body: "Wyrazisty wygląd narzędzia produktowego z ciasnymi odstępami.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Miękki, zorientowany na dokument, przystępny.", thumb: "design-system-notion" },
      { title: "Figma", body: "Zabawowa, kolorowa energia narzędzia kreatywnego.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Minimalistyczny, neutralny, na poziomie badawczym.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Gęsty, techniczny, natywny dla deweloperów.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Systemy projektowe w Open Design',
    galleryLead:
      'Kilka z ponad 140 referencyjnych systemów, które możesz sforkować jako punkt wyjścia. Wybierz jeden bliski Twojej marce i dostosuj go.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "System w stylu Airbnb" },
      { thumb: "design-system-vercel", caption: "System w stylu Vercel" },
      { thumb: "design-system-stripe", caption: "System w stylu Stripe" },
      { thumb: "design-system-spotify", caption: "System w stylu Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Przeglądaj systemy projektowe',
    faqTitle: 'FAQ o systemie projektowym',
    faq: [
      {
        q: 'Czym dokładnie jest tutaj system projektowy?',
        a: 'Plikiem DESIGN.md w Twoim repozytorium, który ujmuje kolory, typografię, odstępy, komponenty i głos. Każda umiejętność Open Design go czyta, więc Twoja marka jest stosowana automatycznie do wszystkiego, co tworzy agent.',
      },
      {
        q: 'Czy muszę zaczynać od zera?',
        a: 'Nie. Open Design dostarcza ponad 140 referencyjnych systemów projektowych, które możesz sforkować — od Apple i Linear po redakcyjne i brutalistyczne — a potem dostosować do swojej marki.',
      },
      {
        q: 'Jak pozostaje spójny między prezentacjami, dashboardami i prototypami?',
        a: 'Ponieważ wszystkie te umiejętności czytają ten sam DESIGN.md. Zdefiniuj system raz, a spójność jest automatyczna, zamiast być czymś, czego pilnujesz ręcznie.',
      },
      {
        q: 'Których agentów mogę używać?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i więcej natywnych adapterów, z własnymi kluczami dostawcy.',
      },
    ],
    ctaTitle: 'Zdefiniuj swój system projektowy jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i daj swojemu agentowi jedną markę do stosowania wszędzie — w agencie, którego już używasz.',
  },
  roleSoloBuilder: {
    title: 'Open Design dla samodzielnych twórców i indie hackerów',
    description:
      'Twórz jak cały zespół w pojedynkę. Open Design zamienia Twojego agenta kodującego w projektową połowę Twojego startupu — prototypy, strony docelowe, pulpity i materiały marki, wszystko z jednego polecenia, wszystko spójne z marką, wszystko w Twoim repozytorium.',
    breadcrumb: 'Samodzielny twórca',
    label: 'Dla · Samodzielnych twórców',
    heading: 'Twój zespół projektowy to agent, którego już używasz',
    lead: 'Bez projektanta, bez budżetu, bez przekazywania prac. Opisz, czego potrzebujesz, a Twój agent to wyrenderuje — stronę docelową rano, pulpit po południu, karty społecznościowe, zanim wydasz produkt — wszystko współdzieli jeden system projektowy, który zdefiniowałeś raz.',
    heroImageAlt:
      'Redakcyjna ilustracja jednej osoby przy biurku otoczonej stroną docelową, aplikacją, pulpitem i kartami społecznościowymi, wszystko w jednym spójnym stylu',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design to dział projektowy, którego samodzielny założyciel nigdy nie miał: od polecenia do gotowego materiału na każdej powierzchni, jakiej potrzebuje Twój produkt, na jednej marce, bez przekazywania prac i bez dodatkowych narzędzi.',
    stepsTitle: 'Jak samodzielny twórca korzysta z Open Design',
    steps: [
      {
        title: 'Zdefiniuj swoją markę raz',
        body: 'Zapisz kolory, typografię i ton w pliku DESIGN.md (albo sforkuj jeden z ponad 140 systemów referencyjnych). Każdy materiał, który potem wygenerujesz, jest automatycznie spójny z marką.',
        imageAlt: 'Ilustracja pojedynczego pliku definicji marki',
      },
      {
        title: 'Wygeneruj cokolwiek potrzebujesz dalej',
        body: 'Prototyp, strona docelowa, pulpit, prezentacja, karta społecznościowa — ten sam agent, ta sama marka, każde z jednego polecenia. Bez przełączania narzędzi i dokupywania licencji.',
        imageAlt: 'Ilustracja wielu typów materiałów powstających z jednego polecenia',
      },
      {
        title: 'Wydaj to — to już jest realne',
        body: 'Wszystko renderuje się do HTML / kodu w Twoim repozytorium, więc prototyp staje się produktem, a strona docelowa wchodzi na żywo. Żadnych makiet do wyrzucenia.',
        imageAlt: 'Ilustracja materiału przechodzącego prosto z polecenia do działającej wersji',
      },
    ],
    tableTitle: 'Tworzenie w pojedynkę z Open Design vs robienie tego na trudniejszy sposób',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Radząc sobie samodzielnie dzisiaj',
    tableRows: [
      { capability: 'Pokryj każdą powierzchnię projektową', withOd: 'Jeden agent robi prototyp, stronę docelową, pulpit i markę', without: 'Sklejasz ze sobą pięć narzędzi SaaS i poradników' },
      { capability: 'Zachowaj spójność z marką', withOd: 'Jeden DESIGN.md stosowany wszędzie automatycznie', without: 'Odtwarzasz wygląd w każdym narzędziu, z czasem rozjeżdża się' },
      { capability: 'Działaj w tempie pojedynczej osoby', withOd: 'Od pomysłu do materiału w jednym poleceniu', without: 'Uczysz się narzędzia projektowego, na które nie masz czasu' },
      { capability: 'Wydawaj, nie makietuj', withOd: 'HTML / kod w Twoim repozytorium, gotowy do wdrożenia', without: 'Makieta, którą ktoś i tak musi zbudować' },
      { capability: 'Koszt', withOd: 'Otwarte źródło, własne klucze, działa lokalnie', without: 'Stos subskrypcji rozliczanych za każde miejsce' },
    ],
    featuresTitle: 'Co samodzielny twórca może wydać',
    features: [
      { title: 'Strony docelowe', body: 'Strony marketingowe i SaaS, klikalne i działające na żywo.', thumb: 'example-saas-landing' },
      { title: 'Prototypy produktu', body: 'Wieloekranowe aplikacje webowe do weryfikacji pomysłu.', thumb: 'example-web-prototype' },
      { title: 'Pulpity', body: 'Widoki metryk i panele administracyjne dla Twojego produktu.', thumb: 'example-dashboard' },
      { title: 'Grafika marki', body: 'Okładki i plakaty pasujące do Twojej marki.', thumb: 'example-magazine-poster' },
      { title: 'Przepływy mobilne', body: 'Ekrany aplikacji, gdy wychodzisz poza web.', thumb: 'example-mobile-app' },
      { title: 'Karty społecznościowe', body: 'Karty premierowe i aktualizacyjne dla każdego kanału.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Zbudowane w pojedynkę z Open Design',
    galleryLead:
      'Każda powierzchnia, jakiej potrzebuje jednoosobowy startup, z jednego polecenia. Wybierz coś bliskiego Twojemu kolejnemu krokowi i opisz to.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Strona docelowa SaaS' },
      { thumb: 'example-web-prototype', caption: 'Prototyp produktu' },
      { thumb: 'example-dashboard', caption: 'Pulpit produktu' },
      { thumb: 'example-card-twitter', caption: 'Premierowa karta społecznościowa' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony',
    faqTitle: 'FAQ dla samodzielnego twórcy',
    faq: [
      { q: 'Nie jestem projektantem — czy naprawdę mogę tego używać?', a: 'Tak. Opisujesz, czego chcesz, zwykłym językiem; agent stosuje system projektowy i to renderuje. Umiejętnością jest napisanie polecenia, a nie przesuwanie pikseli.' },
      { q: 'Czy obejmuje wszystko, czy tylko jedną rzecz?', a: 'Wszystko, czego potrzebuje mały produkt — prototypy, strony docelowe, pulpity, prezentacje, grafikę — od tego samego agenta i tej samej marki.' },
      { q: 'Czym stają się wyniki?', a: 'Prawdziwym HTML / kodem w Twoim repozytorium, więc prototyp może stać się produktem, a strona docelowa może wejść na żywo, zamiast być makietą, którą wyrzucasz.' },
      { q: 'Których agentów mogę używać?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i kolejne natywne adaptery, z Twoimi własnymi kluczami dostawców.' },
    ],
    ctaTitle: 'Zbuduj całość jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i pozwól jednemu agentowi być Twoim zespołem projektowym — w agencie, którego już używasz.',
  },
  roleDesigner: {
    title: 'Open Design dla projektantów',
    description:
      'Poświęcaj czas na smak, nie na mozół. Open Design pozwala Twojemu agentowi zająć się powtarzalną pracą produkcyjną — wariantami, stanami, całymi systemami projektowymi — podczas gdy Ty kierujesz wyglądem i masz ostatnie słowo.',
    breadcrumb: 'Projektant',
    label: 'Dla · Projektantów',
    heading: 'Kieruj projektem — pozwól agentowi zająć się produkcją',
    lead: 'Ty ustalasz system i standard; agent renderuje ekrany, stany, warianty, makiety o wysokiej wierności. Mniej przesuwania prostokątów, więcej decydowania, jak wygląda dobro.',
    heroImageAlt:
      'Redakcyjna ilustracja projektanta kierującego pracą, podczas gdy agent uzupełnia ekrany, warianty i system projektowy',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design to asystent produkcji, który nigdy się nie męczy: Ty definiujesz system projektowy i wyrokujesz o smaku; agent generuje resztę, zgodnie z systemem, w Twoim repozytorium.',
    stepsTitle: 'Jak projektant korzysta z Open Design',
    steps: [
      {
        title: 'Zakoduj swój system',
        body: 'Zamień swoją markę w plik DESIGN.md — skalę typografii, kolor, odstępy, komponenty, ton. To źródło prawdy, którego agent przestrzega.',
        imageAlt: 'Ilustracja systemu projektowego zapisanego jako plik',
      },
      {
        title: 'Wygeneruj długi ogon',
        body: 'Każdy ekran, stan i wariant, które inaczej budowałbyś ręcznie — agent renderuje je zgodnie z systemem, więc nudne 80% jest gotowe w kilka minut.',
        imageAlt: 'Ilustracja wielu zgodnych z systemem ekranów wygenerowanych naraz',
      },
      {
        title: 'Kieruj i dopracowuj',
        body: 'Krytykuj językiem — „zacieśnij odstępy, ociepl pusty stan.” Masz ostatnie słowo; agent wykonuje iteracje.',
        imageAlt: 'Ilustracja projektanta dającego wskazówki i projektu aktualizującego się',
      },
    ],
    tableTitle: 'Projektowanie z Open Design vs sposób ręczny',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Ręczne narzędzia projektowe',
    tableRows: [
      { capability: 'Zbuduj system projektowy', withOd: 'DESIGN.md, który agent stosuje wszędzie', without: 'Biblioteka utrzymywana ręcznie w każdym narzędziu' },
      { capability: 'Twórz warianty i stany', withOd: 'Generowane zgodnie z systemem z jednego polecenia', without: 'Powielasz ramki i dłubiesz przy każdej z osobna' },
      { capability: 'Makiety o wysokiej wierności', withOd: 'Renderowane do prawdziwego HTML, nie płaska makieta', without: 'Praca na pikselach, którą inżynieria i tak odbudowuje' },
      { capability: 'Zachowaj spójność', withOd: 'Jeden system, egzekwowany automatycznie', without: 'Ręczna dyscyplina; z czasem się rozjeżdża' },
      { capability: 'Przekazanie prac', withOd: 'Materiał to kod — brak luki tłumaczenia', without: 'Dokumenty specyfikacji i adnotacje korekcyjne' },
    ],
    featuresTitle: 'Czym projektant może kierować',
    features: [
      { title: 'Układy redakcyjne', body: 'Kierowane artystycznie kompozycje oparte na siatce.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Okładki artykułów', body: 'Okładki i materiały w stylu magazynowym.', thumb: 'example-article-magazine' },
      { title: 'Plakaty', body: 'Odważne plakaty typograficzne zgodne z marką.', thumb: 'example-magazine-poster' },
      { title: 'Zestawy społecznościowe', body: 'Spójne wieloklatkowe karuzele.', thumb: 'example-social-carousel' },
      { title: 'Ekrany aplikacji', body: 'Ekrany mobilne i webowe o wysokiej wierności.', thumb: 'example-mobile-app' },
      { title: 'Pulpity', body: 'Interfejs danych, który respektuje Twój system.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Kierowane z Open Design',
    galleryLead:
      'Praca o wysokiej wierności, zgodna z systemem, którą agent stworzył na podstawie wskazówek. Wybierz coś bliskiego Twojemu stylowi i dopracuj to.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Układ redakcyjny' },
      { thumb: 'example-article-magazine', caption: 'Okładka magazynowa' },
      { thumb: 'example-social-carousel', caption: 'Karuzela społecznościowa' },
      { thumb: 'example-magazine-poster', caption: 'Plakat typograficzny' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony',
    faqTitle: 'FAQ dla projektanta',
    faq: [
      { q: 'Czy to mnie zastąpi?', a: 'Nie — zastępuje mozół. Ty ustalasz system i smak; agent wykonuje powtarzalną produkcję, więc poświęcasz czas na decyzje, które tylko Ty możesz podjąć.' },
      { q: 'Jak zachowam kontrolę nad wyglądem?', a: 'Twój DESIGN.md to kontrakt. Agent renderuje w jego ramach, a Ty krytykujesz językiem, aż będzie dobrze.' },
      { q: 'Czy wynik jest edytowalny / prawdziwy?', a: 'To prawdziwy HTML/CSS, nie płaski eksport — więc przechodzi wprost do produkcji, zamiast być odbudowywany.' },
      { q: 'Których agentów mogę używać?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i kolejne natywne adaptery, z Twoimi własnymi kluczami dostawców.' },
    ],
    ctaTitle: 'Pokieruj swoim kolejnym projektem jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i pozwól agentowi zająć się produkcją, podczas gdy Ty wyrokujesz o smaku — w agencie, którego już używasz.',
  },
  roleEngineering: {
    title: 'Open Design dla inżynierów',
    description:
      'Pomiń przekazywanie projektu. Open Design zamienia DESIGN.md w prawdziwy front-end, który Twój agent kodujący pisze bezpośrednio — zgodny z systemem interfejs, prototypy i pulpity, w repozytorium, bez podróży tam i z powrotem do Figmy.',
    breadcrumb: 'Inżynieria',
    label: 'Dla · Inżynierii',
    heading: 'Od specyfikacji do front-endu, bez przekazywania prac po drodze',
    lead: 'Wskaż agentowi plik DESIGN.md i opis; pisze on zgodny z systemem, prawdziwy kod front-endu — komponenty, ekrany, pulpity — wprost w Twoim projekcie. Żadnych adnotacji korekcyjnych, żadnego „czekania na projekt.”',
    heroImageAlt:
      'Redakcyjna ilustracja pliku DESIGN.md płynącego wprost do kodu front-endu i wyrenderowanego interfejsu, z pominięciem etapu przekazania prac',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design domyka lukę między projektantem a inżynierem, czyniąc system projektowy odczytywalnym maszynowo: ten sam agent, który pisze Twój kod, stosuje system i renderuje prawdziwy interfejs.',
    stepsTitle: 'Jak inżynier korzysta z Open Design',
    steps: [
      {
        title: 'Czytaj system, nie adnotacje',
        body: 'Plik DESIGN.md żyje w repozytorium. Twój agent czyta go tak, jak czyta resztę bazy kodu — żadnych wyeksportowanych specyfikacji do interpretowania.',
        imageAlt: 'Ilustracja agenta czytającego DESIGN.md obok kodu',
      },
      {
        title: 'Generuj zgodny z systemem interfejs',
        body: 'Opisz ekran lub komponent; agent pisze front-end, który już pasuje do systemu. Prototypy, pulpity administracyjne, narzędzia wewnętrzne — w kilka minut.',
        imageAlt: 'Ilustracja kodu interfejsu wygenerowanego tak, by pasował do systemu projektowego',
      },
      {
        title: 'To już Twój kod',
        body: 'Wynikiem jest HTML / kod frameworka w Twoim repozytorium, do przejrzenia w PR. Brak etapu tłumaczenia między „projektem” a „buildem.”',
        imageAlt: 'Ilustracja wygenerowanego interfejsu lądującego jako możliwy do przejrzenia PR',
      },
    ],
    tableTitle: 'Front-end z Open Design vs sposób z przekazywaniem prac',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Przekazanie z projektu do dev',
    tableRows: [
      { capability: 'Mieć projekt, z którego budujesz', withOd: 'DESIGN.md, który Twój agent czyta bezpośrednio', without: 'Plik Figmy, który reinterpretujesz ręcznie' },
      { capability: 'Dopasuj się do systemu', withOd: 'Egzekwowane automatycznie w momencie generowania', without: 'Mierzysz okiem względem specyfikacji, wkrada się rozjazd' },
      { capability: 'Buduj narzędzia wewnętrzne / pulpity', withOd: 'Polecenie → zgodny z systemem front-end w repozytorium', without: 'Czekasz na projektanta, potem budujesz to dwa razy' },
      { capability: 'Przegląd', withOd: 'To kod — porównaj różnice w PR', without: 'Porównywanie pikseli z makietą' },
      { capability: 'Koszt i uzależnienie', withOd: 'Otwarte źródło, w Twoim repozytorium, działa lokalnie', without: 'Narzędzie projektowe, na które cały zespół musi mieć licencję' },
    ],
    featuresTitle: 'Co inżynier może wygenerować',
    features: [
      { title: 'Interfejs aplikacji webowej', body: 'Wieloekranowy front-end z opisu.', thumb: 'example-web-prototype' },
      { title: 'Pulpity deweloperskie', body: 'Pulpity repozytorium, CI i metryk.', thumb: 'example-github-dashboard' },
      { title: 'Raporty danych', body: 'Ustrukturyzowane raporty z Twoich danych.', thumb: 'example-data-report' },
      { title: 'Pulpity administracyjne', body: 'Narzędzia wewnętrzne i widoki administracyjne.', thumb: 'example-dashboard' },
      { title: 'Strony docelowe', body: 'Strony marketingowe bez czekania na projekt.', thumb: 'example-saas-landing' },
      { title: 'Kanban / tablice', body: 'Wewnętrzne interfejsy przepływu pracy.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Zbudowane przez inżynierów z Open Design',
    galleryLead:
      'Prawdziwy, zgodny z systemem front-end wygenerowany wprost w repozytorium. Wybierz coś bliskiego temu, co budujesz, i opisz to.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'Interfejs aplikacji webowej' },
      { thumb: 'example-github-dashboard', caption: 'Pulpit deweloperski' },
      { thumb: 'example-data-report', caption: 'Raport danych' },
      { thumb: 'example-kanban-board', caption: 'Wewnętrzny interfejs tablicy' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony',
    faqTitle: 'FAQ inżynierskie',
    faq: [
      { q: 'Czy nadal potrzebuję projektanta?', a: 'Do marki i kierunku tak. Ale do budowania zgodnego z systemem interfejsu i narzędzi wewnętrznych agent czyta DESIGN.md i pisze front-end — bez podróży tam i z powrotem z przekazywaniem prac.' },
      { q: 'Co generuje na wyjściu?', a: 'Prawdziwy HTML / kod frameworka w Twoim repozytorium, do przejrzenia w PR — nie makietę, którą reimplementujesz.' },
      { q: 'Jak utrzymuje zgodność z systemem?', a: 'DESIGN.md jest źródłem prawdy; agent stosuje go w momencie generowania, więc wynik pasuje bez ręcznego sprawdzania pikseli.' },
      { q: 'Których agentów mogę używać?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i kolejne natywne adaptery, z Twoimi własnymi kluczami dostawców.' },
    ],
    ctaTitle: 'Wygeneruj swój kolejny interfejs jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień DESIGN.md we front-end — w agencie, którego już używasz.',
  },
  roleProductManagers: {
    title: 'Open Design dla menedżerów produktu',
    description:
      'Przestań czekać na przepustowość projektową, by zakomunikować pomysł. Open Design pozwala PM-owi zamienić polecenie w klikalny prototyp lub szkielet — by uzgodnić stanowiska interesariuszy i poinstruować zespół, bez zgłoszenia projektowego.',
    breadcrumb: 'Menedżerowie produktu',
    label: 'Dla · Menedżerów produktu',
    heading: 'Spraw, by pomysł był klikalny jeszcze przed startem',
    lead: 'Opisz przepływ, a Twój agent wyrenderuje prawdziwy, klikalny prototyp, który możesz dziś postawić przed interesariuszami — by spotkania omawiały rzecz samą, a nie akapit w dokumencie.',
    heroImageAlt:
      'Redakcyjna ilustracja PM-a zamieniającego spisany pomysł w klikalny prototyp pokazywany interesariuszom',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design daje PM-owi sposób bez projektowania, by uczynić pomysły namacalnymi: od polecenia do prototypu dla uzgodnień i instrukcji, bez wydawania budżetu projektowego zespołu.',
    stepsTitle: 'Jak PM korzysta z Open Design',
    steps: [
      {
        title: 'Opisz przepływ',
        body: 'Spisz podróż użytkownika zwykłym językiem — ekrany, stany, ścieżkę optymistyczną. Bez narzędzia do szkieletowania.',
        imageAlt: 'Ilustracja PM-a opisującego przepływ użytkownika',
      },
      {
        title: 'Otrzymaj klikalny prototyp',
        body: 'Agent renderuje nawigowalne ekrany, które naprawdę możesz przeklikać — znacznie czytelniejsze niż slajd czy dokument na spotkanie z interesariuszami.',
        imageAlt: 'Ilustracja klikalnego prototypu powstałego z opisu',
      },
      {
        title: 'Uzgodnij i przekaż',
        body: 'Udostępnij link, zbierz opinie na rzeczy samej, a potem przekaż prototyp projektowi/inżynierii jako precyzyjny, wspólny punkt wyjścia.',
        imageAlt: 'Ilustracja prototypu udostępnionego do uzgodnień, a następnie przekazanego zespołowi',
      },
    ],
    tableTitle: 'Praca PM-a z Open Design vs czekanie na projekt',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Bez tego dzisiaj',
    tableRows: [
      { capability: 'Uczyń pomysł namacalnym', withOd: 'Polecenie → klikalny prototyp zrobiony przez Ciebie', without: 'Składasz zgłoszenie projektowe i czekasz na przepustowość' },
      { capability: 'Uzgodnij stanowiska interesariuszy', withOd: 'Klikają prawdziwy przepływ', without: 'Czytają dokument i każdy wyobraża go sobie inaczej' },
      { capability: 'Poinstruuj zespół', withOd: 'Konkretny prototyp jako specyfikacja', without: 'Ściana tekstu i wymiana zdań tam i z powrotem' },
      { capability: 'Iteruj przed budową', withOd: 'Zmień to w poleceniu, udostępnij ponownie', without: 'Kolejna runda w kolejce projektowej' },
      { capability: 'Koszt', withOd: 'Otwarte źródło, w agencie, którego już używasz', without: 'Godziny projektowe wydane na koncepcje do wyrzucenia' },
    ],
    featuresTitle: 'Co PM może postawić przed ludźmi',
    features: [
      { title: 'Przepływy mobilne', body: 'Pełne podróże po aplikacji, klikalne.', thumb: 'example-mobile-app' },
      { title: 'Przepływy onboardingu', body: 'Powitanie → konfiguracja → pierwsze uruchomienie.', thumb: 'example-mobile-onboarding' },
      { title: 'Tablice i przepływy', body: 'Interfejsy Kanban i procesów do specyfikacji.', thumb: 'example-kanban-board' },
      { title: 'Pulpity', body: 'Widoki metryk, by ująć problem w ramy.', thumb: 'example-dashboard' },
      { title: 'Prototypy webowe', body: 'Wieloekranowe przepływy webowe do przeglądu.', thumb: 'example-web-prototype' },
      { title: 'Widoki trendów', body: 'Migawki 30-dniowe i trendowe dla kontekstu.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Prototypowane przez PM-ów z Open Design',
    galleryLead:
      'Klikalne przepływy wyrenderowane z opisu, gotowe na przegląd z interesariuszami. Wybierz coś bliskiego Twojemu pomysłowi i opisz to.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Przepływ mobilny' },
      { thumb: 'example-mobile-onboarding', caption: 'Przepływ onboardingu' },
      { thumb: 'example-kanban-board', caption: 'Tablica przepływu pracy' },
      { thumb: 'example-web-prototype', caption: 'Prototyp webowy' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony',
    faqTitle: 'FAQ menedżera produktu',
    faq: [
      { q: 'Nie umiem projektować — czy to dla mnie?', a: 'Tak. Opisujesz przepływ słowami; agent czyni go klikalnym. Służy do komunikowania i uzgadniania, bez narzędzia projektowego.' },
      { q: 'Czy to prawdziwy prototyp, czy makieta?', a: 'Prawdziwy i klikalny — nawigacja i stany działają, więc interesariusze reagują na faktyczne doświadczenie.' },
      { q: 'Czy zastępuje projekt?', a: 'Nie — daje projektowi i inżynierii precyzyjny, wspólny punkt wyjścia zamiast specyfikacji tekstowej i oszczędza przepustowość projektową na pracę, która jej wymaga.' },
      { q: 'Których agentów mogę używać?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i kolejne natywne adaptery, z Twoimi własnymi kluczami dostawców.' },
    ],
    ctaTitle: 'Uczyń swój pomysł klikalnym jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień swoją kolejną specyfikację w coś, co ludzie mogą kliknąć — w agencie, którego już używasz.',
  },
  roleMarketing: {
    title: 'Open Design dla zespołów marketingu',
    description:
      'Wydawaj kampanie w tempie treści. Open Design pozwala Twojemu agentowi tworzyć strony docelowe, karty społecznościowe i materiały kampanijne z jednego polecenia — zgodne z marką, na żądanie, bez kolejkowania projektu.',
    breadcrumb: 'Marketing',
    label: 'Dla · Marketingu',
    heading: 'Materiały kampanijne w tempie polecenia',
    lead: 'Strony docelowe, karty społecznościowe, okładki, grafiki z ogłoszeniami — opisane językiem, wyrenderowane zgodnie z marką, wydane tego samego dnia. Bez zgłoszenia projektowego, bez mocowania się z szablonami.',
    heroImageAlt:
      'Redakcyjna ilustracja marketingowca zamieniającego brief w stronę docelową i zestaw zgodnych z marką kart społecznościowych',
    tldrTitle: 'W jednym zdaniu',
    tldrBody:
      'Open Design to zawsze dostępny zasób projektowy dla marketingu: od polecenia do materiału na strony docelowe i media społecznościowe, zgodnego z marką, by kampanie wychodziły w tempie, w jakim piszesz teksty.',
    stepsTitle: 'Jak zespół marketingu korzysta z Open Design',
    steps: [
      {
        title: 'Zablokuj markę',
        body: 'Twój DESIGN.md trzyma kolory, typografię i ton. Każdy materiał, który tworzy agent, jest automatycznie zgodny z marką — bez ponownego stylizowania każdego z osobna.',
        imageAlt: 'Ilustracja systemu marki zastosowanego do materiałów marketingowych',
      },
      {
        title: 'Wygeneruj kampanię',
        body: 'Strona docelowa, karty społecznościowe, okładki, grafiki z ogłoszeniami — każde z jednego polecenia, spójny zestaw na każdym kanale.',
        imageAlt: 'Ilustracja pełnego zestawu kampanii wygenerowanego z poleceń',
      },
      {
        title: 'Wydaj i iteruj',
        body: 'Strony docelowe renderują się do HTML, który możesz wdrożyć; grafiki eksportują się do PNG. Zmień nagłówek, wyrenderuj zestaw ponownie — bez czekania w kolejce.',
        imageAlt: 'Ilustracja materiałów kampanijnych wychodzących i szybko iterowanych',
      },
    ],
    tableTitle: 'Marketing z Open Design vs zwykła gonitwa',
    tableColCapability: 'Czego potrzebujesz',
    tableColWithOd: 'Z Open Design',
    tableColWithout: 'Bez tego dzisiaj',
    tableRows: [
      { capability: 'Uruchom stronę docelową', withOd: 'Polecenie → zgodna z marką strona, gotowa do wdrożenia', without: 'Brief projektowy albo walka z kreatorem stron' },
      { capability: 'Spójny zestaw społecznościowy', withOd: 'Ten sam szablon, nowy tekst, idealnie wyrównane', without: 'Ręczne wyrównywanie każdej karty' },
      { capability: 'Zachowaj spójność z marką', withOd: 'Jeden DESIGN.md zastosowany do każdego materiału', without: 'Liczysz, że każdy materiał trafi w wytyczne' },
      { capability: 'Działaj w tempie kampanii', withOd: 'Materiał w poleceniu, tego samego dnia', without: 'Kolejka za zaległościami projektowymi' },
      { capability: 'Koszt', withOd: 'Otwarte źródło, brak narzędzia projektowego rozliczanego za miejsce', without: 'Subskrypcje plus godziny projektowe' },
    ],
    featuresTitle: 'Co zespół marketingu może wydać',
    features: [
      { title: 'Strony docelowe', body: 'Strony kampanijne i produktowe, gotowe do wdrożenia.', thumb: 'example-saas-landing' },
      { title: 'Karty społecznościowe', body: 'Karty X / Twitter zgodne z marką.', thumb: 'example-card-twitter' },
      { title: 'Karuzele', body: 'Wieloslajdowe zestawy społecznościowe, spójne.', thumb: 'example-social-carousel' },
      { title: 'Plakaty', body: 'Plakaty z ogłoszeniami i na wydarzenia.', thumb: 'example-magazine-poster' },
      { title: 'Okładki artykułów', body: 'Okładki blogów i newsletterów.', thumb: 'example-article-magazine' },
      { title: 'Strony webowe', body: 'Mikrowitryny i strony kampanijne.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Wydane przez marketing z Open Design',
    galleryLead:
      'Zgodne z marką materiały kampanijne wyrenderowane z polecenia. Wybierz coś bliskiego Twojej kampanii i podmień własny tekst.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Strona docelowa kampanii' },
      { thumb: 'example-card-twitter', caption: 'Karta społecznościowa' },
      { thumb: 'example-social-carousel', caption: 'Karuzela społecznościowa' },
      { thumb: 'example-magazine-poster', caption: 'Plakat z ogłoszeniem' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Przeglądaj szablony',
    faqTitle: 'FAQ marketingowe',
    faq: [
      { q: 'Czy potrzebujemy projektanta do każdego materiału?', a: 'Nie. Agent renderuje zgodne z marką strony docelowe i materiały społecznościowe z polecenia, więc zespół wydaje rutynową pracę kampanijną bez kolejkowania projektu.' },
      { q: 'Jak materiały zachowują zgodność z marką?', a: 'Twój DESIGN.md jest stosowany do wszystkiego automatycznie — kolory, typografia i ton przenoszą się na każdy materiał.' },
      { q: 'Czy strony docelowe naprawdę mogą wejść na żywo?', a: 'Tak — renderują się do HTML, który możesz wdrożyć, a grafiki eksportują się do PNG. To materiały gotowe do wydania, nie makiety.' },
      { q: 'Których agentów mogę używać?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI i kolejne natywne adaptery, z Twoimi własnymi kluczami dostawców.' },
    ],
    ctaTitle: 'Wydaj swoją kolejną kampanię jeszcze dziś wieczorem',
    ctaBody:
      'Daj gwiazdkę repozytorium, zainstaluj Open Design i zamień briefy w zgodne z marką materiały — w agencie, którego już używasz.',
  },
};
