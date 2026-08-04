import type { OpenDesignPluginCopy } from '../open-design-plugin-i18n';

const tr: OpenDesignPluginCopy = {
  metadata: {
    title: 'Codex/ChatGPT için Open Design | Open Design Cloud Eklentisini Kurun',
    description:
      'Open Design Cloud eklentisini Codex/ChatGPT’ye kurun; web siteleri, sunumlar, prototipler ve tasarım sistemlerini aynı görev içinde oluşturun.',
    keywords:
      'Open Design Codex eklentisi, ChatGPT masaüstü eklentisi, Codex eklenti kurulumu, Open Design Cloud, Codex tasarım eklentisi, Codex MCP',
  },
  hero: {
    title: 'Codex/ChatGPT için Open Design eklentisi',
    leadBefore: 'Aşağıdaki talimatı şu uygulamadaki herhangi bir göreve girin:',
    chatgptLabel: 'ChatGPT masaüstü uygulaması',
    installAria: 'Open Design Cloud eklentisini Codex/ChatGPT’ye kur',
    copy: 'Kopyala',
    github: 'Kaynak kodu GitHub’da görüntüle ↗',
  },
  agentInstall: {
    howToName: 'Open Design eklentisini Codex’e kurun',
    howToDescription:
      'Open Design Codex eklentisini kurmak ve yerel MCP kaydını yapmak için ajan tarafından uygulanabilir adımlar.',
    eyebrow: 'Ajan tarafından okunabilir kurulum protokolü',
    title: 'Codex eklentisini eksiksiz kurun.',
    intro:
      'Kullanıcı sizden Open Design’ı kurmanızı istediyse bu protokolü sırayla uygulayın. İstek, yalnızca kullanıcının Codex eklentisi ve MCP yapılandırmasında değişiklik yapılmasına izin verir. İlgisiz eklenti mağazalarını, eklentileri, MCP sunucularını ve kimlik doğrulama durumunu koruyun.',
    downloadLabel: 'Resmî Open Design indirme sayfası ↗',
    steps: [
      {
        title: 'Desteklenen ortam için ön kontrolleri yapın',
        body:
          'plugin.minimumCodexCliVersion ve plugin.minimumOpenDesignVersion değerlerini release-manifest.json dosyasından okuyun. Herhangi bir yapılandırma değişikliğinden önce her iki minimum gereksinimin de karşılanmasını zorunlu tutun. Open Design çalışma zamanı sürümünü yalnızca yoklanan Open Design CLI’dan veya kod imzası ve Gatekeeper kontrollerini geçen imzalı bir macOS uygulama paketindeki CFBundleShortVersionString değerinden kabul edin. od eksikse veya PATH üzerinde gölgelenmişse (/usr/bin/od dahil) ya da daemon durmuşsa imzalı paket yoklamasına geçin. Doğrulanmış iki yoklama yönteminden hiçbiri kullanılamıyorsa değişiklik yapmadan önce durun; kullanıcıyı, istemciye özel mutlak yol kod parçacığını kopyalaması için Open Design Settings → MCP server bölümüne yönlendirin ve ardından yeniden deneyin. Kullanıcıyı yalnızca uygulama yoksa veya sürümü çok eskiyse resmî indirme sayfasına yönlendirin; bir yükleyiciyi sessizce indirmeyin veya doğrulanmamış bir betiği çalıştırmayın.',
      },
      {
        title: 'Yapılandırmayı değiştirmeden önce inceleyin',
        body:
          'Gerekli seçiciyi ve sürümü release-manifest.json dosyasından okuyun, ardından bunları incelediğiniz Codex durumuyla karşılaştırın. MCP durumunu yalnızca codex mcp list --json çıktısından türetilen filtrelenmiş MCP anlık görüntüsü üzerinden inceleyin. Çıktıya yalnızca name, enabled, transport.type ve command alanlarını dahil edin; args, env, env_vars, headers ve token alanlarını çıktı vermeden önce atın. open-design sonucunun bulunmaması beklenen bir durumdur ve engelleyici değildir. Taşıma değerleri kimlik bilgileri içerebileceğinden ham listeyi veya codex mcp get open-design --json çıktısını asla yazdırmayın ya da raporlamayın. open-design eklenti mağazası adı başka bir kaynağa işaret ediyorsa durun ve çakışmayı bildirin. open-design@open-design öğesini yalnızca kurulu sürümü release-manifest.json içinde bildirilen sürümle eşleşiyorsa koruyun.',
      },
      {
        title: 'Yalnızca eksik bileşenleri kurun',
        body:
          'Eklenti mağazası komutunu yalnızca kanonik eklenti mağazası yoksa çalıştırın; eklenti mağazasını ekleme işlemi başarısız olursa eklenti komutunu çalıştırmadan durun. open-design@open-design eksikse eklenti komutunu çalıştırın. Farklı bir sürüm kuruluysa güncellemeden veya yeniden kurmadan önce kullanıcıdan onay isteyin; bu adımı yalnızca açık onay aldıktan sonra OPEN_DESIGN_PLUGIN_UPDATE_CONFIRMED=1 ile yeniden çalıştırın. Yalnızca gerekli sürüm tam olarak mevcutsa kurulumu atlayın. alreadyAdded: true sonucu başarıdır. Codex yapılandırmasını elle düzenlemeyin veya eklenti dosyalarını Codex ana dizinine kopyalamayın.',
      },
      {
        title: 'Yerel Open Design MCP’nin hazır olduğundan emin olun',
        body:
          'Mevcut bir open-design MCP’yi yalnızca etkinse, stdio kullanıyorsa ve mutlak command değeri doğrulanmış bir Open Design başlatıcısıyla eşleşiyorsa koruyun. Aksi halde, kurulu Open Design uygulamasıyla sağlanan MCP yükleyicisini çalıştırın. POSIX sistemlerinde, çözümlenmiş od yolunu yalnızca yoklaması open-design-cli:mcp-install:v1 sonucunu verdikten sonra çalıştırın. Bu yol yoksa, /usr/bin/od tarafından gölgeleniyorsa veya yol üzerinden işlem tamamlanamıyorsa doğrulanmış, imzalı macOS uygulama paketini /usr/bin/open ve --headless --mcp-install codex ile çalıştırın; ardından aynı yapısal kontrolleri uygulayarak yalnızca filtrelenmiş MCP anlık görüntüsünü düzenli olarak sorgulayın. Doğrulanmış bir başlatıcı yoksa durun, kullanıcıyı istemciye özel mutlak yol kod parçacığını kopyalaması için Open Design Settings → MCP server bölümüne yönlendirin ve bu adımı yeniden deneyin. Asla bir localhost portu tahmin etmeyin veya codex mcp login çalıştırmayın; Vela ile oturum açma Open Design’da yapılır.',
      },
      {
        title: 'Doğrulayın, raporlayın ve yeni bir görev başlatın',
        body:
          'open-design@open-design eklenti kimliğini, kanonik eklenti mağazası kaynağını ve kurulu sürümünün release-manifest.json içindeki plugin.version ile tam olarak eşleştiğini doğrulayın. Kurulum sırasında kullanılan aynı doğrulanmış Open Design başlatıcısıyla mutlak command değeri eşleşen, open-design adlı etkin bir stdio MCP bulunduğunu doğrulamak için filtrelenmiş MCP anlık görüntüsünü kullanın. Yalnızca name, enabled, transport.type ve command alanlarını inceleyin; ham args, env, env_vars, headers, token, bearer token, API key ve Vela kimlik bilgisi değerleri çıktı veya raporlarda asla görünmemelidir. Nelerin kurulduğunu ve henüz karşılanmamış Open Design ya da Vela ile oturum açma ön koşullarını bildirin. Kurulu eklenti anlık görüntüsünü yükleyebilmesi için yeni bir Codex görevi başlatın, ardından @open-design çağrısını yapın.',
      },
    ],
  },
  demo: {
    title: 'Bir kez kurun. Codex/ChatGPT içinden tasarlayın.',
    lead:
      'Önce Codex ile Open Design çalışma alanının tamamını görün, ardından gerçek kurulumdan sonuca uzanan akışı adım adım izleyin.',
    overviewAlt:
      'Tamamlanan Goodfield kafe web sitesiyle birlikte Open Design eklentisinin kullanıldığı gerçek bir Codex görevi',
    overviewLabel: 'Gerçek Codex görevi',
    overviewCaption:
      'İstem, Open Design aktarımı, oluşturulan dosyalar ve tamamlanan web sitesi tek bir çalışma alanında görünür kalır.',
    stepListAria: 'Gerçek Codex eklentisi akışının beş aşaması',
    installPhase: 'Kurulum',
    installTitle: 'Kurulumu Codex’e yaptırın',
    installBody:
      'Bu talimatı bir Codex görevine yapıştırın. Codex, kanonik Git eklenti mağazası kaynağını ekler, eklentiyi yalnızca eksikse kurar ve herkese açık bir katalog kaydı gerektirmeden yerel MCP kurulumunu tamamlar.',
    installNote: 'Codex’e bir kez yapıştırın; tüm kurulum ayrıntıları sizin için halledilir.',
    steps: [
      {
        phase: 'Kullanım',
        title: 'Yeni bir Codex görevi başlatın',
        body:
          'Codex kurulumu tamamladıktan sonra yeni görevde kurulu Open Design eklentisini açın ve başlamak için “Try now” seçeneğini belirleyin.',
        alt:
          'Codex içindeki gerçek Open Design eklentisi ayrıntı ekranı ve Try now düğmesi',
      },
      {
        phase: 'Oluşturma',
        title: 'Tasarım özetini yazın',
        body:
          'Open Design’dan bahsedin; ardından oluşturulacak içeriği, metinleri, görsel yönü ve duyarlı tasarım gereksinimlerini açıklayın.',
        alt:
          'Open Design’dan sıcak ve samimi bir mahalle kafesi web sitesi oluşturmasını isteyen gerçek bir Codex istemi',
      },
      {
        phase: 'Oluşturma',
        title: 'Canlı aktarımı izleyin',
        body:
          'Codex yönü onaylar, projeyi oluşturur ve dosyalar canlı olarak görünürken işi Open Design’a aktarır.',
        alt:
          'Mahalle kafesi web sitesi oluşturulurken görünen gerçek Codex ve Open Design çalışma alanı',
      },
      {
        phase: 'Oluşturma',
        title: 'Sonucu inceleyin',
        body:
          'Aynı görev, duyarlı Goodfield kafe açılış sayfasını, oluşturulan görselleri ve düzenlenebilir dosyaları sunar.',
        alt:
          'Codex içindeki Open Design eklentisiyle oluşturulan tamamlanmış Goodfield mahalle kafesi açılış sayfası',
      },
    ],
  },
  use: {
    title: 'Tam istemle başlayın.',
    lead:
      'Codex eklenti menüsünden Open Design’ı seçin, oluşturmak istediğiniz içeriği açıklayın ve aynı görevde geliştirmeye devam edin. Codex, eklenti etiketini bir Open Design çipi olarak gösterir.',
    promptLabel: 'Kaydedilen Codex görevinde kullanılan istem',
    copyPrompt: 'Codex istemini kopyala',
    galleryAria: 'Open Design ile oluşturulan örnekler',
    templates: [
      {
        alt:
          'Dokulu bir kesim matı ve mantar nesne içeren Oryzo ürün açılış sayfası',
        label: 'Ürün lansmanı',
      },
      {
        alt: 'Tipografik harita içeren Open Design Osaka etkinlik açılış sayfası',
        label: 'Etkinlik sayfası',
      },
      {
        alt: 'Fable 5 için koyu renkli, editoryal ürün web sitesi',
        label: 'Editoryal site',
      },
      {
        alt: 'Aydınlık bir tuval üzerinde Open Design model zaman çizelgesi arayüzü',
        label: 'Etkileşimli hikâye',
      },
    ],
    promptListAria: 'Open Design Cloud istem örnekleri',
    prompts: [
      { title: 'Web sitesi' },
      { title: 'Sunumlar' },
      { title: 'Prototip' },
      { title: 'Tasarım sistemi' },
    ],
  },
  faq: {
    title: 'Kurulumdan önce merak edilenler',
    lead: 'Görevin kontrolü Codex’te kalır. Görsel iş akışını Open Design yönetir.',
    items: [
      {
        q: 'Eklenti Codex’e ne kazandırır?',
        a:
          'Codex’e web siteleri, sunumlar, prototipler ve tasarım sistemleri için bir Open Design iş akışı ekler. Eklenti; özetler, projeler ve çıktı üretimi için yerel Open Design MCP bağlantısını kullanır.',
      },
      {
        q: 'Hangi Codex ürünleri destekleniyor?',
        a:
          'Mevcut paket Codex Desktop ve Codex CLI ürünlerini destekler. İlk desteklenen çalışma ortamı Codex’tir.',
      },
      {
        q: 'Kurulumdan önce nelere ihtiyacım var?',
        a:
          'Codex CLI 0.144.6 veya daha yeni bir sürüm ile Open Design 0.17.0 veya daha yeni bir sürüm kullanın. Yerel MCP kaydını yapmadan önce Open Design’ı kurun.',
      },
      {
        q: 'Neden yeni bir Codex görevi açmam gerekiyor?',
        a:
          'Codex, eklenti ve MCP özelliklerini görev başlatılırken yükler. Yeni bir görev, az önce kurulan Open Design Cloud eklentisini algılar.',
      },
      {
        q: 'Open Design penceresinin açık kalması gerekiyor mu?',
        a:
          'Hayır. Kayıtlı yerel MCP, gerektiğinde imzalı Open Design çalışma zamanını görünür bir pencere olmadan başlatabilir.',
      },
    ],
  },
  final: {
    aria: 'Open Design Cloud eklentisini Codex/ChatGPT’ye kur',
    title: 'Open Design’ı bir sonraki Codex/ChatGPT görevinize taşıyın.',
    bodyBeforeMention: 'Eklentiyi kurun, yerel MCP bağlantısını yapın ve',
    bodyAfterMention: 'etiketini kullanın.',
    copy: 'Kopyala',
    download: 'Open Design’ı indir',
    source: 'Kaynak kodu görüntüle',
  },
  clipboard: {
    copying: 'Kopyalanıyor…',
    copied: 'Kopyalandı',
    failed: 'Seçip kopyalayın',
  },
  schema: {
    pageName: 'Codex/ChatGPT için Open Design Cloud Eklentisi',
    applicationName: 'Codex/ChatGPT için Open Design Cloud Eklentisi',
  },
};

export default tr;
