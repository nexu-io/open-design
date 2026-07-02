import type { DeepPartial, CommunityCopy } from '../community-i18n';

const tr: DeepPartial<CommunityCopy> = {
  hub: {
    title: "Topluluk — Open Design",
    desc: "Open Design topluluğu: herkesin gözü önünde iş çıkaran katkıcılar, yerel atölyeler düzenleyen elçiler ve Discord'u sıcak tutan moderatörler.",
    heroTitle: "Açık tasarım <em>şekillenir</em><br/>onu siz yayımlayınca.",
    heroLead:
      "Open Design herkesin gözü önünde, insanlar tarafından inşa ediliyor. Skill'ler, DESIGN.md sistemleri, plugin'ler, dokümanlar: her commit bir fırça darbesi. Aşağıdan bir kapı seçin, kendi odanızı bulun.",
    cardMetaH: "İlk merge'de otomatik basılır",
    cardMetaS: "PNG · X'te paylaşılır",
    cardHeroAlt:
      "Open Design katkıcı onur kartı — @dev-kp-eloper, en iyi %99,9, Giotto kademesi",
    cards: [
      {
        ord: "I",
        title: "Katkıcılar",
        sub: "İşi <em>yayımlayan</em> eller.",
        body: "Maintainer'lar, haftalık liderlik tabloları, tüm zamanların listesi ve bugün üstlenebileceğiniz açık issue'lar. Ayrıca kod yazmayanların ilk eserlerini kayıt defterine göndermesi için sıfır kod yolu.",
      },
      {
        ord: "II",
        title: "Elçiler",
        sub: "Şehrinizde Open Design'ın <em>sesi</em>.",
        body: "Yerel bir atölye açın. Buluşmaları, demoları, gece geç saatlere kadar süren eleştirileri toplayın. Bütçe, materyal ve çekirdek ekibe özel bir kanalla desteklenir.",
      },
      {
        ord: "III",
        title: "Moderatörler",
        sub: "<em>Katkıcıların</em> takıldığı oda.",
        body: "Ajan-tasarım çağının ön saflarında. Discord, dünyanın en keskin AI-native tasarımcılarının toplandığı yer. Odayı sıcak tutan yöneticilerle tanışın.",
      },
    ],
  },
  contributors: {
    title: "Katkıcılar — Open Design",
    desc: "Open Design'a katkıda bulunun: maintainer'lar, haftalık ve tüm zamanların katkıcı liderlik tabloları, good first issue'lar ve ilk eserinizi yayımlamak için sıfır kod yolu.",
    heroTitle: "İşi <em>yayımlayan</em> eller.",
    heroLead:
      "Open Design herkesin gözü önünde, insanlar tarafından inşa ediliyor. Skill'ler, DESIGN.md sistemleri, plugin'ler, dokümanlar: her commit bir fırça darbesi. Bir issue seçin, bir PR gönderin ve merge edildiğiniz an eşi benzeri olmayan bir onur kartı kazanın.",
    showcase: {
      kicker: "Her şeyi plugin yap",
      h2: "Sahne olarak Open Design. Gösteri olarak <em>sizin işiniz</em>.",
      intro:
        "Atölye aynı zamanda bir galeri. İşi ortaya çıkarmanıza yardım etmek adresin yarısı; odanın gelip bakmasını sağlamak diğer yarısı. Yayımladığınız her eser bir kasada değil, dünyanın onu bulabileceği bir duvarda yerini alır.",
      tenets: [
        {
          h3: "Her şey <em>bir plugin olabilir</em>.",
          body: "Stüdyonun ortaya koyduğu her şey (içerik, bitmiş bir ürün, bir şablon, bir Skill, bir iş akışı) yeniden bir plugin'e katlanabilir. Kayıt defteri her biçimi kabul eder; kapıda bekçi yoktur.",
        },
        {
          h3: "İlk eseriniz, sizin <em>kabulünüz</em>.",
          body: "İlk eserinizin kayıt defterine düştüğü gün, adınız duvara katılır. Ziyaretçi rozeti değil. Sizden önce gelen herkesin yanında, katkıcı listesinde kalıcı bir satır.",
        },
        {
          h3: "Bir kez girince, <em>yol alır</em>.",
          body: '<a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">open-design.ai/plugins</a> adresindeki kayıt defteri yalnızca eşiktir. Oradan en güçlü eserler dışarıya taşınır: X platformuna, Discord üzerindeki <span class="num">#showcase</span> kanalına, bültene, video reel akışlarına. Her aktarım odayı genişletir; dünya sizin elinizle tanışır.',
        },
        {
          h3: "Bir <em>ilk darbeye</em> mi ihtiyacınız var?",
          body: '<a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">plugin kayıt defterinde</a> gezinin. Orada asılı eserler kendi eseriniz için birer çıra. Kıvılcımı ödünç alın, sonra yalnızca sizin elinizin yapabileceği eseri yaratın.',
        },
      ],
      pane: {
        kicker: "Skill",
        h3: "Bırakın <em>ajan</em> sizin için yayımlasın.",
        lede: "Koda dokunmak istemeyen üreticiler için. Tüm katkı, sade bir dille konuşulan tek bir skill içinde yaşar. Fırça işi ajana kalır.",
        copy: "Kopyala",
        copied: "Kopyalandı",
        steps: [
          {
            h4: "Komutu ajana verin",
            body: "Yukarıdaki komutu Open Design içindeki ajana ya da zaten elinizin altında tuttuğunuz herhangi birine yapıştırın: Claude Code, Codex, Cursor. Kendini kurar.",
          },
          {
            h4: "Skill'i uyandırın",
            body: "<code>/od-contribute</code> yazın ya da az önce kurduğunuz şeyi çalıştırmasını ajana söyleyin. İki ifade de kapıyı açar.",
          },
          {
            h4: "Galeriye yarım dakika",
            body: "Gerisini ajan yürür. Eseriniz yaklaşık otuz saniye içinde açık kaynak deposuna yola çıkar; ilk fırsatta inceleriz ve yerine düştüğü an, oda sizin elinizle tanışır.",
          },
        ],
      },
    },
    maintainers: {
      kicker: "Dümeni tutmak",
      h2: "<em>Maintainer'lar</em>.",
      intro:
        "Maintainer'lar Open Design'ın yönünü ve kalitesini korur: katkıları inceler, standardı tutarlı tutar ve daha fazla katkıcının projede yerini kazanmasına alan açar.",
      role: "Maintainer",
      bios: {
        "Nagendhra-web":
          "Nagendhra, üretim gerçeğine dair bir veri mühendisinin içgüdüsünü getiriyor: hatayı bul, uç durumu ölç ve düzgünce düzelt. Open Design'da bu; deploy ön kontrol çalışmalarında, asset paketleme sağlamlaştırmasında ve katkıcılar iş yayımladığında projeyi güvenilir hissettiren Windows düzeltmelerinde kendini gösteriyor.",
        "Sid-Qin":
          "Sid, bir tasarımcının detay gözüne sahip çok yönlü mühendis: hem bozuk CLI yolunu hem de eğri duran etkileşim öğesini fark eden türden bir maintainer. Open Design'da Sid; export akışlarını, plugin eylemlerini, Windows shim'lerini, MIME işlemeyi ve ajan altyapısını bir topluluğun üzerine inşa edebileceği kadar keskin tutuyor.",
      },
    },
    allTime: {
      kicker: "Tüm zamanların sinyali",
      h2: "<em>Derin kökleri</em> olan katkıcılar.",
      intro:
        "Fikirleri, düzeltmeleri ve zanaati ortak Open Design standardına dönüştürmeyi sürdüren yetenekli katkıcıların uzun soluklu bir kaydı.",
      rankLabel: "Tüm zamanların katkıcısı",
      week: "Depo geçmişi",
      quote:
        "Uzun kuyruk önemlidir: tasarım sistemleri, doküman düzeltmeleri, örnekler ve küçük onarımlar, açık bir tasarım dilinin güvenilir hale gelme biçimidir.",
      handleSuffix: "· derin katkıcı sinyali",
      statCommits: "Commit'ler",
      statExternalRank: "Dış sıralama",
      headContributor: "Katkıcı",
      headCommits: "Commit'ler",
      headRank: "Sıra",
    },
    weekly: {
      kicker: "Bu haftanın sinyali",
      h2: "<em>Bu hafta</em> öne çıkan on katkıcı.",
      intro:
        "PR'lar merge eden, ürünü geliştiren ve Open Design'ı canlı hissettiren keskin katkıcıların anlık görüntüsü.",
      rankLabel: "Bu haftanın lideri",
      week: "Son 7 gün",
      handleSuffix: "· bu hafta önde",
      blurbTemplate:
        "{name} bu hafta {prs} merge edilmiş PR ve Open Design'ı hareket halinde tutan istikrarlı zanaatiyle tempoyu belirliyor.",
      statRank: "Sıra",
      statPrs: "PR · 7g",
      headContributor: "Katkıcı",
      headPrs: "PR",
      headRank: "Sıra",
    },
    issues: {
      kicker: "İlk katkınızı seçin",
      h2: "Açık issue'lar, <em>sizin için etiketlendi</em>.",
      intro:
        'Open Design deposundaki <span class="num">label:&ldquo;good first issue&rdquo;</span> etiketinden canlı olarak. Bir issue üzerine yorum yaparak onu üstlenin; bir maintainer bir gün içinde size atayacaktır.',
      loading: "good first issue",
      foot: 'İlk <span class="num" id="issue-count">—</span> açık good-first-issue gösteriliyor',
      seeAll: "Tümünü GitHub'da gör",
      empty: "Şu anda açık good-first-issue yok. Yarın tekrar bakın ya da kendiniz bir tane açın",
      rateLimited:
        "Önizlemede GitHub hız sınırına ulaşıldı. Canlı good-first-issue aramasını GitHub'da açın.",
    },
    onboard: {
      kicker: "Dört adım · her seviyeye uygun",
      h2: "Bir öğleden sonrada sıfırdan <em>merge'e</em>.",
      intro:
        "İster tasarımcı, ister yazar, ister mühendis olun ya da sadece bir yazım hatası fark etmiş olun, size uygun bir katkı biçimi var. İşte yol.",
      steps: [
        {
          n: "Adım 01",
          h3: "Bir <em>kıvılcım</em> bulun.",
          body: "Yukarıdaki good-first-issue listesine göz atın ya da geliştirmek istediğiniz bir şeyi anlatan yeni bir issue açın. Tasarımcılar: DESIGN.md sistemleri en kolay giriş noktasıdır.",
        },
        {
          n: "Adım 02",
          h3: "Bir <em>taslak</em> PR açın.",
          body: "Fork'layın, dallanın, push edin. Taslak olarak işaretleyin. Bu, erkenden geri bildirim istediğinizi gösterir. Hangi issue'yu kapattığını belirtin. CI hızlıdır; bot-cards kendi dalında kalır.",
        },
        {
          n: "Adım 03",
          h3: "<em>Bir insanla</em> inceleyin.",
          body: "Bir maintainer 24 saat içinde inceler. Nazik ve somutuz, asla bekçilik yapmayız. Takılırsanız PR bağlantısını Discord #help kanalına bırakın.",
        },
        {
          n: "Adım 04",
          h3: "Merge → <em>kart</em>.",
          body: "Bot, merge edildiğiniz an onur kartınızı basar ve bot-cards dalına push eder. Onu X'te #OpenDesign ile paylaşın; en iyilerini yeniden paylaşıyoruz.",
        },
      ],
      cta: "Katkı rehberini okuyun",
    },
  },
  ambassadors: {
    title: "Elçiler — Open Design",
    desc: "Open Design elçisi olun: yerel bir atölye açın, buluşmalar ve eleştiriler düzenleyin; bütçe, materyal ve çekirdek ekibe özel bir kanal edinin.",
    heroTitle: "Şehrinizde Open Design'ın <em>sesi</em> olun.",
    heroLead:
      "Yerel bir atölye açın. Buluşmaları, demoları, gece geç saatlere kadar süren eleştirileri toplayın. Sizi bütçe, materyal ve çekirdek ekibe özel bir kanalla destekliyoruz.",
    program: {
      kicker: "Program",
      h2: "Meslek, <em>himaye</em>, ahit.",
      applyCta: "Google Form ile başvurun",
      applyNote:
        "Elçiler, Open Design'ı bir depodan; katkıcıların masada mürekkep ve soğumuş kahveyle bir odada buluşabileceği bir şeye dönüştürür.",
      cols: [
        {
          n: "I · Meslek",
          h3: "<em>Yerel sahnenin</em> ressamları.",
          lede: "Tasarımcılar, geliştiriciler, organizatörler: zaten başkalarını bir araya getiren türden. Bu buluşmaya bir bayrak veriyoruz.",
          items: [
            "<b>Yerel Atölye Ev Sahibi:</b> düzenli bir buluşmayı, çalışma grubunu ya da gece geç saatlere kadar süren bir hack'i yaşatırsınız.",
            "<b>Çevrimiçi topluluk lideri:</b> Discord, WeChat, Telegram, X space'leri.",
            "<b>Aktif katkıcı ya da savunucu:</b> zaten iş yayımlayan, zanaat paylaşan, yeni gelenlere yol gösteren.",
            "<b>İsmi taşımaktan rahat:</b> Davranış Kuralları'na bağlı, markaya özenli.",
          ],
        },
        {
          n: "II · Himaye",
          h3: "<em>Atölyenin</em> sunduğu.",
          lede: "Gönüllü rozeti değil. Bütçesi, itibarı ve erişimi olan işleyen bir bağ.",
          items: [
            "<b>Sitede bir sayfa:</b> portre, şehir, biyografi, sosyal hesaplar, etkinliklerinizin günlüğü.",
            "<b>İlk görüş:</b> beta özellikleri, dahili yol haritası önizlemeleri, sıranın önündeki sürümler.",
            "<b>Atölye kiti:</b> posterler, sunumlar, demo eserler, promosyon ürünleri; mekan, içecek ve fotoğrafçılık için bir kese.",
            "<b>Stüdyoya bir hat:</b> özel kanal, aylık senkron, geri bildiriminiz için ayrılmış bir yol.",
            "<b>İleriye bir yol:</b> onur kartları ve kademeler; bölgesel lider, konuşmacı ya da ücretli topluluk rollerine giden bir patika ile.",
          ],
        },
        {
          n: "III · Ahit",
          h3: "Stüdyonun <em>disiplini</em>.",
          lede: "Mütevazı ama bağlayıcı bir taahhüt. Uzun süreli devamsızlık, mezun statüsüne katlanır; çember küçük ve ciddi kalır.",
          items: [
            "<b>Bir araya getirin</b> — yerel ya da çevrimiçi, ayda veya çeyrekte en az bir etkinlik.",
            "<b>Yeni geleni karşılayın.</b> Yeni gelenlere ilk katkıları boyunca yol gösterin.",
            "<b>Yakından dinleyin.</b> Kullanıcılardan, tasarımcılardan, geliştiricilerden, ekiplerden dürüst geri bildirim toplayın.",
            "<b>Bir kayıt bırakın.</b> Her buluşmadan sonra bir özet yayımlayın: katılım, fotoğraflar, bağlantılar, olası adaylar.",
            "<b>İsmi iyi taşıyın.</b> Davranış Kuralları'na uyun; markanın kötüye kullanımı yok, stüdyo adına imzalanan anlaşma yok.",
          ],
        },
      ],
    },
    roster: {
      kicker: "Sahada",
      h2: "<em>Elçilerle</em> tanışın.",
      intro:
        "Open Design'ın daha fazla tasarımcı ve ekibe ulaşmasına yardım eden yerel organizatörler, üreticiler ve topluluk kurucuları.",
      places: [
        "Sunshine Coast, Avustralya",
        "Kuala Lumpur, Malezya",
        "Japonya",
        "Çin",
      ],
    },
  },
  moderators: {
    title: "Moderatörler — Open Design",
    desc: "Open Design Discord moderatörleriyle tanışın ve AI-native tasarımcıların iş yayımladığı, plugin açtığı, betaları test ettiği ve birbirini takılıp kaldığı yerden çıkardığı odaya katılın.",
    heroTitle: "<em>Katkıcıların</em> takıldığı oda.",
    heroLead:
      "Ajan-tasarım çağının ön saflarında. Discord, dünyanın en keskin AI-native tasarımcılarının toplandığı yer. Odayı sıcak tutan yöneticilerle tanışın.",
    discord: {
      kicker: "Katkıcıların takıldığı yer",
      h2: "<em>PR'ınızı inceleyecek</em> kişilerle konuşun.",
      body: "Ajan-tasarım çağının ön saflarında. Discord'umuz, dünyanın en keskin AI-native tasarımcılarının toplandığı yer: iş yayımlayan, plugin açan, betaları test eden, birbirini takılıp kalınan yerden çıkaran. İçeri adım atın. Yaptığınız şeyi getirin.",
      joinCta: "Discord'a katılın",
      discussionsCta: "GitHub Discussions",
      cards: [
        {
          role: "Stüdyodan",
          bio: "Open Design kurucu ekibinden. Discord'un takılmak için güzel bir yer olarak kalmasını umuyor. İstediğiniz zaman, her soru için el sallayın.",
        },
        {
          role: "Odanın yöneticisi",
          bio: "Discord ve topluluk bakımında deneyimli bir el. Odayı sıcak, kapıları açık, sohbeti akışkan tutar. Open Design tutkunu.",
        },
      ],
      channelNotes: ["yayımlanan iş", "üreticiler", "erken geri bildirim", "takılmaktan kurtulma"],
    },
  },
};

export default tr;
