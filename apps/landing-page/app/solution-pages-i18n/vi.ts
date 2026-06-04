import type { SolutionLocaleCopy } from './types';

export const VI: SolutionLocaleCopy = {
  prototype: {
    title: 'Xây dựng nguyên mẫu tương tác với Open Design + Claude Code',
    description:
      'Biến một câu lệnh thành nguyên mẫu nhiều màn hình có thể nhấp được mà không cần rời khỏi terminal. Open Design trang bị cho coding agent của bạn các kỹ năng thiết kế, mẫu và hệ thống thiết kế để tạo ra nguyên mẫu thực sự mà bạn có thể mở trong trình duyệt.',
    breadcrumb: 'Nguyên mẫu',
    label: 'Trường hợp sử dụng · Nguyên mẫu',
    heading: 'Tạo nguyên mẫu nhanh như một câu lệnh',
    lead: 'Mô tả luồng bạn đang hình dung và để agent dựng nên một nguyên mẫu thực sự, có thể nhấp được — nhiều màn hình, kiểu dáng dùng chung và tương tác trực tiếp — kết xuất thẳng ra HTML mà bạn có thể mở, chia sẻ và bàn giao cho đội kỹ thuật.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một bàn tay phác thảo wireframe biến thành nguyên mẫu ứng dụng nhiều màn hình có thể nhấp được',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design là lớp thiết kế cho coding agent mà bạn đang dùng. Với việc tạo nguyên mẫu, điều đó nghĩa là đi từ một ý tưởng dài một đoạn đến một nguyên mẫu có thể điều hướng, được tạo kiểu trong một phiên làm việc — không cần công cụ thiết kế, không cần bước xuất, không có khoảng trống bàn giao.',
    stepsTitle: 'Tạo nguyên mẫu với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả luồng',
        body: 'Nói cho agent biết bạn đang xây dựng gì bằng ngôn ngữ tự nhiên — “một luồng onboarding với màn hình chào mừng, bộ chọn gói và màn hình xác nhận.” Open Design nạp kỹ năng nguyên mẫu để agent biết phải tạo ra các màn hình, chứ không phải một trang đơn lẻ.',
        imageAlt:
          'Minh họa một người gõ mô tả bằng ngôn ngữ tự nhiên về một luồng ứng dụng vào terminal',
      },
      {
        title: 'Tạo các màn hình đã được tạo kiểu',
        body: 'Agent áp dụng hệ thống thiết kế và mẫu nguyên mẫu từ Open Design, nên mọi màn hình đều dùng chung kiểu chữ, khoảng cách và các thành phần thay vì trông như bản nháp thô. Bạn nhận được một bộ màn hình mạch lạc, không phải những mockup rời rạc.',
        imageAlt:
          'Minh họa nhiều màn hình ứng dụng xuất hiện theo trình tự, tất cả cùng chung một phong cách thị giác nhất quán',
      },
      {
        title: 'Kết nối các tương tác',
        body: 'Nút bấm điều hướng, tab chuyển đổi, modal mở ra. Nguyên mẫu kết xuất thành HTML khép kín, nên nó hoạt động như sản phẩm thật trong mọi trình duyệt — không cần tài khoản công cụ tạo nguyên mẫu để xem.',
        imageAlt:
          'Minh họa một con trỏ nhấp qua các màn hình được liên kết với các mũi tên thể hiện sự điều hướng giữa chúng',
      },
      {
        title: 'Lặp lại và bàn giao',
        body: 'Tinh chỉnh bằng cách trò chuyện với agent — “đổi bộ chọn gói thành bố cục ba cột.” Vì sản phẩm nằm trong dự án của bạn, thiết kế và mã nguồn cuối cùng dùng chung một nguồn chân lý, khép lại khoảng trống bàn giao quen thuộc giữa nhà thiết kế và kỹ sư.',
        imageAlt:
          'Minh họa một nguyên mẫu đang được chỉnh sửa rồi chuyển cho một kỹ sư, với thiết kế và mã nguồn hợp nhất thành một tệp',
      },
    ],
    tableTitle: 'Tạo nguyên mẫu với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Công cụ tạo nguyên mẫu truyền thống',
    tableRows: [
      {
        capability: 'Đi từ ý tưởng đến màn hình đầu tiên',
        withOd: 'Một câu lệnh trong agent bạn đang mở sẵn',
        without: 'Mở một công cụ riêng, tạo tệp, kéo các hộp bằng tay',
      },
      {
        capability: 'Nhiều màn hình được liên kết',
        withOd: 'Được tạo thành một bộ với kiểu dáng dùng chung và điều hướng hoạt động',
        without: 'Vẽ và liên kết từng khung thủ công',
      },
      {
        capability: 'Hệ thống thị giác nhất quán',
        withOd: 'Lấy từ một hệ thống thiết kế tái sử dụng mà agent áp dụng',
        without: 'Tạo lại theo từng tệp hoặc duy trì bằng tay',
      },
      {
        capability: 'Kết quả có thể chia sẻ',
        withOd: 'HTML khép kín — mở trong mọi trình duyệt, không cần tài khoản',
        without: 'Người xem cần một chỗ hoặc một liên kết chia sẻ trong công cụ của nhà cung cấp',
      },
      {
        capability: 'Con đường đến mã nguồn thật',
        withOd: 'Sản phẩm nằm trong repo của bạn; thiết kế và mã nguồn dùng chung một nguồn',
        without: 'Xây dựng lại từ đầu sau một lần bàn giao riêng',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Thuê bao theo từng chỗ, lưu trữ bởi nhà cung cấp, giới hạn xuất',
      },
    ],
    featuresTitle: 'Bạn có thể tạo nguyên mẫu cho những gì',
    features: [
      {
        title: 'Ứng dụng web nhiều màn hình',
        body: 'Luồng đầy đủ với điều hướng dùng chung — onboarding, dashboard, cài đặt — không phải trang đơn lẻ.',
        thumb: 'example-web-prototype',
      },
      {
        title: 'Luồng ứng dụng di động',
        body: 'Hành trình di động từng màn hình với các chuyển cảnh và trạng thái mang cảm giác native.',
        thumb: 'example-mobile-app',
      },
      {
        title: 'Trang đích',
        body: 'Trang tiếp thị và trang đích SaaS mà bạn có thể nhấp qua và phát hành.',
        thumb: 'example-saas-landing',
      },
      {
        title: 'Bất kỳ gu thẩm mỹ nào',
        body: 'Biên tập, mềm mại hay brutalist — nguyên mẫu mang một phong cách mạch lạc từ đầu đến cuối.',
        thumb: 'example-web-prototype-taste-editorial',
      },
      {
        title: 'Danh sách chờ và bảng giá',
        body: 'Các bề mặt chuyển đổi — danh sách chờ, bảng giá — được kết nối và đúng thương hiệu.',
        thumb: 'example-waitlist-page',
      },
      {
        title: 'Game hóa và vui nhộn',
        body: 'Các ý tưởng nặng tương tác nơi chuyển động và trạng thái là một phần của màn chào hàng.',
        thumb: 'example-gamified-app',
      },
    ],
    galleryTitle: 'Những nguyên mẫu mọi người đã xây dựng với Open Design',
    galleryLead:
      'Mỗi cái trong số này bắt đầu từ một câu lệnh và kết xuất thành một sản phẩm có thể nhấp được. Chọn một mẫu gần với ý tưởng của bạn, mô tả biến thể của bạn, và agent sẽ điều chỉnh nó.',
    gallery: [
      { thumb: "example-dating-web", caption: "Ứng dụng hẹn hò web — luồng nhiều màn hình" },
      { thumb: "example-hr-onboarding", caption: "Luồng onboarding nhân sự" },
      { thumb: "example-kami-landing", caption: "Trang đích sản phẩm" },
      { thumb: "example-web-prototype-taste-soft", caption: "Nguyên mẫu web phong cách mềm mại" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu nguyên mẫu',
    faqTitle: 'Câu hỏi thường gặp về tạo nguyên mẫu',
    faq: [
      {
        q: 'Tôi có cần một công cụ thiết kế như Figma để tạo nguyên mẫu với Open Design không?',
        a: 'Không. Open Design chạy bên trong coding agent của bạn và kết xuất nguyên mẫu thành HTML. Bạn mô tả luồng bằng ngôn ngữ; agent tạo ra các màn hình. Không có công cụ canvas riêng nào để học hay phải trả phí.',
      },
      {
        q: 'Các nguyên mẫu có tương tác được hay chỉ là mockup tĩnh?',
        a: 'Tương tác được. Điều hướng, tab và modal đều hoạt động vì đầu ra là HTML và CSS thật. Bạn có thể nhấp qua nó trong mọi trình duyệt y như một người dùng thực sự.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Open Design hoạt động với Claude Code, Codex, Cursor Agent, Gemini CLI và hơn một chục adapter chính chủ khác. Bạn dùng khóa nhà cung cấp của riêng mình; không có gì được lưu trữ thay cho bạn.',
      },
      {
        q: 'Một nguyên mẫu có thể trở thành sản phẩm thật không?',
        a: 'Đó chính là mục đích. Sản phẩm nằm trong dự án của bạn, nên cùng một hệ thống thiết kế và các thành phần được mang vào mã sản xuất thay vì bị vứt bỏ sau một lần bàn giao.',
      },
    ],
    ctaTitle: 'Tạo nguyên mẫu cho ý tưởng tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến câu “sẽ ra sao nếu” tiếp theo của bạn thành thứ bạn có thể nhấp vào — ngay trong agent bạn đang dùng.',
  },
  dashboard: {
    title: 'Tạo dashboard dữ liệu với Open Design + Claude Code',
    description:
      'Mô tả các chỉ số bạn theo dõi và để coding agent dựng nên một dashboard được tạo kiểu, đáp ứng — biểu đồ, thẻ KPI và bảng kết xuất thành HTML mà bạn có thể lưu trữ ở bất cứ đâu. Không cần chỗ trong công cụ BI, không cần trình dựng kéo-thả.',
    breadcrumb: 'Dashboard',
    label: 'Trường hợp sử dụng · Dashboard',
    heading: 'Dashboard từ một mô tả, không phải trình dựng kéo-thả',
    lead: 'Nói cho agent biết phải hiển thị gì và nó nên trông như thế nào. Open Design cung cấp các mẫu biểu đồ, hệ thống bố cục và ngôn ngữ thị giác để bạn có được một dashboard mạch lạc, trình bày được — không phải một bức tường widget kiểu mặc định.',
    heroImageAlt:
      'Minh họa kiểu biên tập về những con số thô bên trái chảy thành một dashboard gọn gàng gồm biểu đồ và thẻ KPI bên phải',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một bản mô tả các chỉ số bằng ngôn ngữ tự nhiên thành một dashboard được tạo kiểu mà agent kết xuất ra HTML — được phiên bản hóa trong repo của bạn, lưu trữ được ở bất cứ đâu, không có thuê bao BI theo từng chỗ.',
    stepsTitle: 'Dashboard với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả các chỉ số',
        body: 'Liệt kê điều quan trọng — “người dùng hoạt động hàng tuần, doanh thu theo gói, tỷ lệ rời bỏ và xu hướng 30 ngày.” Agent nạp kỹ năng dashboard để biết phải bố trí thẻ KPI, biểu đồ và một bảng thay vì một khối văn bản đơn lẻ.',
        imageAlt: 'Minh họa một người liệt kê các chỉ số họ quan tâm',
      },
      {
        title: 'Chọn các mẫu biểu đồ',
        body: 'Open Design đi kèm các mẫu biểu đồ và bố cục, nên xu hướng trở thành biểu đồ đường, các phân tách trở thành biểu đồ cột, và tỷ lệ trở thành kiểu biểu đồ phù hợp — kiểu chữ và khoảng cách nhất quán xuyên suốt thay vì các mặc định lệch lạc.',
        imageAlt: 'Minh họa nhiều loại biểu đồ được sắp xếp thành một lưới mạch lạc',
      },
      {
        title: 'Kết nối dữ liệu của bạn',
        body: 'Trỏ dashboard tới một CSV, một endpoint JSON, hoặc dán các hàng mẫu vào. Nó kết xuất thành HTML khép kín tự cập nhật khi dữ liệu thay đổi — mở trong mọi trình duyệt, thả lên bất kỳ host tĩnh nào.',
        imageAlt: 'Minh họa một tệp dữ liệu kết nối vào một dashboard cập nhật trực tiếp',
      },
      {
        title: 'Tinh chỉnh và phát hành',
        body: 'Điều chỉnh bằng cách trò chuyện với agent — “nhóm doanh thu theo khu vực, đưa hàng KPI lên trên cùng.” Sản phẩm nằm trong dự án của bạn, nên dashboard có thể được xem xét và phiên bản hóa như bất kỳ mã nào khác.',
        imageAlt: 'Minh họa một dashboard đang được tinh chỉnh rồi triển khai',
      },
    ],
    tableTitle: 'Dashboard với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Công cụ BI / viết mã thủ công',
    tableRows: [
      {
        capability: 'Đi từ danh sách chỉ số đến bố cục',
        withOd: 'Một câu lệnh; agent bố trí thẻ, biểu đồ và bảng',
        without: 'Kéo từng widget một, hoặc viết mã biểu đồ từ đầu',
      },
      {
        capability: 'Hệ thống thị giác nhất quán',
        withOd: 'Mẫu biểu đồ và khoảng cách từ một hệ thống thiết kế tái sử dụng',
        without: 'Kiểu widget mặc định, hoặc tạo kiểu bằng tay cho từng biểu đồ',
      },
      {
        capability: 'Kết nối dữ liệu',
        withOd: 'CSV / JSON / các hàng được dán vào, kết xuất thành HTML trực tiếp',
        without: 'Trình kết nối của nhà cung cấp hoặc đường ống dữ liệu tùy biến',
      },
      {
        capability: 'Lưu trữ và chia sẻ',
        withOd: 'HTML khép kín trên bất kỳ host tĩnh nào, không cần tài khoản',
        without: 'Người xem cần một chỗ trong nhà cung cấp BI',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Nằm trong repo của bạn; so sánh diff được như mã',
        without: 'Bị khóa bên trong nhà cung cấp, không có diff thực sự',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Thuê bao theo từng chỗ, lưu trữ bởi nhà cung cấp',
      },
    ],
    featuresTitle: 'Bạn có thể xây dựng những gì',
    features: [
      { title: "Phân tích sản phẩm", body: "Người dùng hoạt động, phễu, giữ chân — các chỉ số mà một đội sản phẩm sống cùng.", thumb: "example-dashboard" },
      { title: "Chỉ số repo và dev", body: "Sao, PR, sức khỏe CI — dashboard kỹ thuật từ dữ liệu của riêng bạn.", thumb: "example-github-dashboard" },
      { title: "Báo cáo tài chính", body: "Doanh thu, mức đốt vốn, đường băng được bố trí thành một báo cáo chia sẻ được.", thumb: "example-finance-report" },
      { title: "Vận hành trực tiếp", body: "Chỉ số thời gian thực làm mới khi dữ liệu nền thay đổi.", thumb: "example-live-dashboard" },
      { title: "Mạng xã hội và tiếp thị", body: "Hiệu suất kênh và theo dõi chiến dịch trong một khung nhìn.", thumb: "example-social-media-dashboard" },
      { title: "Báo cáo theo lĩnh vực", body: "Báo cáo có cấu trúc cho bất kỳ ngành nào — từ lâm sàng đến giao dịch.", thumb: "example-clinical-case-report" },
    ],
    galleryTitle: 'Những dashboard mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những dashboard thật được kết xuất từ một câu lệnh và một nguồn dữ liệu. Bắt đầu từ một cái gần với của bạn và mô tả các chỉ số bạn theo dõi.',
    gallery: [
      { thumb: "example-data-report", caption: "Báo cáo dữ liệu" },
      { thumb: "example-flowai-live-dashboard-template", caption: "Dashboard vận hành trực tiếp" },
      { thumb: "example-trading-analysis-dashboard-template", caption: "Dashboard phân tích giao dịch" },
      { thumb: "example-frame-data-chart-nyt", caption: "Biểu đồ dữ liệu kiểu biên tập" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu dashboard',
    faqTitle: 'Câu hỏi thường gặp về dashboard',
    faq: [
      {
        q: 'Tôi có cần một công cụ BI như Tableau hay Looker không?',
        a: 'Không. Open Design kết xuất dashboard thành HTML bên trong coding agent của bạn. Bạn mô tả các chỉ số và trỏ nó tới dữ liệu của bạn; không có nền tảng BI riêng nào để cấp phép hay học.',
      },
      {
        q: 'Dữ liệu đến từ đâu?',
        a: 'Một CSV, một endpoint JSON, hoặc các hàng bạn dán vào. Dashboard là HTML và JavaScript thuần, nên bạn kiểm soát chính xác nơi nó đọc từ đó — không có gì được proxy qua một dịch vụ lưu trữ.',
      },
      {
        q: 'Đồng đội không rành kỹ thuật có xem được không?',
        a: 'Có. Đầu ra là một trang web khép kín. Bất kỳ ai có liên kết hoặc tệp đều có thể mở nó trong trình duyệt — không cần tài khoản, không cần chỗ.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và hơn một chục adapter chính chủ khác. Bạn dùng khóa nhà cung cấp của riêng mình.',
      },
    ],
    ctaTitle: 'Xây dashboard của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến các chỉ số của bạn thành một dashboard bạn có thể lưu trữ ở bất cứ đâu — ngay trong agent bạn đang dùng.',
  },
  slides: {
    title: 'Tạo bộ slide thuyết trình với Open Design + Claude Code',
    description:
      'Biến một dàn ý thành một bộ slide được thiết kế, đúng thương hiệu mà không cần mở ứng dụng thuyết trình. Open Design trang bị cho coding agent của bạn các mẫu slide và một hệ thống thị giác, kết xuất slide thành HTML mà bạn có thể trình bày, xuất hoặc chia sẻ.',
    breadcrumb: 'Slide',
    label: 'Trường hợp sử dụng · Slide',
    heading: 'Bộ slide trông được thiết kế, viết bằng một câu lệnh',
    lead: 'Trao cho agent một dàn ý và một tông giọng. Open Design áp dụng một mẫu slide và hệ thống thị giác để mọi slide đều được bố trí, sắp chữ và đúng thương hiệu — không phải một danh sách gạch đầu dòng trên nền trống.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một dàn ý bên trái biến thành một chuỗi slide thuyết trình được thiết kế bên phải',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một dàn ý thành một bộ slide HTML được thiết kế mà agent kết xuất trong một phiên — trình bày trong trình duyệt, xuất ra PDF hoặc PPTX, và giữ mã nguồn trong repo của bạn.',
    stepsTitle: 'Bộ slide với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Đưa cho nó dàn ý',
        body: 'Dán các điểm nói chuyện của bạn hoặc một cấu trúc thô. Agent nạp kỹ năng slide để tạo ra một chuỗi slide được bố trí, không phải một tài liệu dài.',
        imageAlt: 'Minh họa một dàn ý văn bản đang được trao cho một agent',
      },
      {
        title: 'Chọn phong cách bộ slide',
        body: 'Open Design đi kèm các mẫu slide — biên tập, Thụy Sĩ quốc tế, kỹ thuật tối màu và nhiều hơn nữa. Agent áp dụng một mẫu để kiểu chữ, lưới và điểm nhấn nhất quán trên mọi slide.',
        imageAlt: 'Minh họa nhiều tùy chọn phong cách bộ slide được đặt cạnh nhau',
      },
      {
        title: 'Tạo các slide',
        body: 'Mỗi điểm trở thành một slide được thiết kế với phân cấp đúng — tiêu đề, hình ảnh hỗ trợ, điểm nhấn dữ liệu. Nó kết xuất thành HTML, nên trình bày toàn màn hình trong mọi trình duyệt.',
        imageAlt: 'Minh họa một chuỗi slide hoàn chỉnh với kiểu dáng nhất quán',
      },
      {
        title: 'Trình bày, xuất, lặp lại',
        body: 'Trình bày từ trình duyệt, hoặc xuất ra PDF / PPTX để chia sẻ. Tinh chỉnh bằng cách trò chuyện với agent — “gọn lại slide dữ liệu, thêm một lời kêu gọi hành động kết thúc.” Mã nguồn bộ slide ở lại trong dự án của bạn.',
        imageAlt: 'Minh họa một bộ slide đang được trình bày và xuất ra nhiều định dạng',
      },
    ],
    tableTitle: 'Bộ slide với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'PowerPoint / Keynote / công cụ slide AI',
    tableRows: [
      {
        capability: 'Đi từ dàn ý đến slide',
        withOd: 'Một câu lệnh; agent bố trí mọi slide',
        without: 'Dựng từng slide bằng tay, hoặc vật lộn với một mẫu',
      },
      {
        capability: 'Thiết kế nhất quán',
        withOd: 'Mẫu slide với một lưới và hệ thống kiểu chữ thực sự',
        without: 'Trôi dạt chủ đề, căn chỉnh thủ công, mặc định lệch thương hiệu',
      },
      {
        capability: 'Dữ liệu và sơ đồ',
        withOd: 'Biểu đồ và điểm nhấn được kết xuất như một phần của slide',
        without: 'Dán hình ảnh tĩnh hoặc dựng lại biểu đồ mỗi lần',
      },
      {
        capability: 'Định dạng xuất',
        withOd: 'HTML để trình bày, cộng thêm xuất PDF / PPTX',
        without: 'Bị khóa vào định dạng của một ứng dụng',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Mã nguồn nằm trong repo của bạn, so sánh diff được',
        without: 'Tệp nhị phân, không có diff có ý nghĩa',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Giấy phép ứng dụng hoặc tiện ích AI bổ sung theo từng chỗ',
      },
    ],
    featuresTitle: 'Bạn có thể trình bày những gì',
    features: [
      { title: "Pitch deck", body: "Bộ slide gọi vốn và bán hàng với câu chuyện mạnh mẽ và các slide dữ liệu sạch sẽ.", thumb: "example-html-ppt-pitch-deck" },
      { title: "Thụy Sĩ / biên tập", body: "Bộ slide theo lưới, đậm kiểu chữ trông như được chỉ đạo nghệ thuật.", thumb: "example-deck-swiss-international" },
      { title: "Mô-đun khóa học", body: "Bộ slide giảng dạy với các bước rõ ràng, điểm nhấn và nhịp độ.", thumb: "example-html-ppt-course-module" },
      { title: "Bộ slide biểu đồ dữ liệu", body: "Bộ slide tối màu, thiên về biểu đồ cho phân tích và đánh giá.", thumb: "example-html-ppt-graphify-dark-graph" },
      { title: "Chế độ người trình bày", body: "Bộ slide kiểu reveal được dựng để trình bày trực tiếp trong trình duyệt.", thumb: "example-html-ppt-presenter-mode-reveal" },
      { title: "Bản thiết kế kỹ thuật", body: "Bộ slide kiến trúc và kiến thức ánh xạ các hệ thống phức tạp.", thumb: "example-html-ppt-knowledge-arch-blueprint" },
    ],
    galleryTitle: 'Những bộ slide mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những bộ slide thật được kết xuất từ một dàn ý. Chọn một phong cách gần với bài nói của bạn và mô tả nội dung.',
    gallery: [
      { thumb: "example-deck-guizang-editorial", caption: "Bộ slide tạp chí biên tập" },
      { thumb: "example-guizang-ppt", caption: "Keynote có minh họa" },
      { thumb: "example-deck-open-slide-canvas", caption: "Bộ slide open slide canvas" },
      { thumb: "example-html-ppt-obsidian-claude-gradient", caption: "Bộ slide chủ đề gradient" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu bộ slide',
    faqTitle: 'Câu hỏi thường gặp về slide',
    faq: [
      {
        q: 'Tôi có cần PowerPoint hoặc Keynote không?',
        a: 'Không. Open Design kết xuất bộ slide thành HTML bên trong coding agent của bạn và có thể xuất ra PDF hoặc PPTX. Bạn trình bày từ trình duyệt hoặc bàn giao một tệp — không cần ứng dụng thuyết trình nào để dựng nó.',
      },
      {
        q: 'Đây có chỉ là các gạch đầu dòng do AI tạo ra không?',
        a: 'Không. Agent áp dụng một mẫu slide thực sự với một lưới, thang kiểu chữ và phân cấp thị giác, nên các slide trông được thiết kế chứ không phải tự động điền.',
      },
      {
        q: 'Tôi có thể xuất ra PowerPoint cho khách hàng không?',
        a: 'Có. Bộ slide xuất ra PPTX và PDF bên cạnh HTML bạn trình bày từ đó, nên chúng phù hợp với bất cứ điều gì khán giả mong đợi.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Dựng bộ slide tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến dàn ý của bạn thành một bộ slide được thiết kế — ngay trong agent bạn đang dùng.',
  },
  image: {
    title: 'Tạo đồ họa đúng thương hiệu với Open Design + Claude Code',
    description:
      'Tạo thẻ mạng xã hội, ảnh bìa bài viết và đồ họa tiếp thị từ một câu lệnh — được bố trí với kiểu chữ thực sự và hệ thống thương hiệu của bạn, kết xuất thành HTML sắc nét mà bạn có thể xuất ra PNG. Không cần ứng dụng thiết kế, không cần thuê bao mẫu.',
    breadcrumb: 'Hình ảnh',
    label: 'Trường hợp sử dụng · Hình ảnh',
    heading: 'Đồ họa đúng thương hiệu, được tạo và bố trí cho bạn',
    lead: 'Mô tả thẻ hoặc ảnh bìa bạn cần. Open Design dựng nó với kiểu chữ, lưới thực sự và màu thương hiệu của bạn — rồi kết xuất thành HTML mà bạn có thể xuất ra hình ảnh, thay vì vật lộn với một ứng dụng thiết kế hay một mẫu chung chung.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một câu lệnh biến thành một bộ thẻ mạng xã hội và ảnh bìa bài viết được bố trí',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một câu lệnh thành một đồ họa được sắp chữ, đúng thương hiệu mà agent kết xuất thành HTML và xuất ra PNG — lặp lại được, phiên bản hóa được, và không có công cụ thiết kế theo từng chỗ.',
    stepsTitle: 'Đồ họa với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả đồ họa',
        body: 'Nói nó là gì — “một thẻ Twitter cho buổi ra mắt của chúng tôi với tiêu đề và một câu trích dẫn.” Agent nạp đúng kỹ năng để dựng một đồ họa được bố trí, không phải một khối văn bản thuần.',
        imageAlt: 'Minh họa một người mô tả một thẻ mạng xã hội họ cần',
      },
      {
        title: 'Áp dụng hệ thống thương hiệu',
        body: 'Open Design lấy màu sắc, kiểu chữ và khoảng cách của bạn từ một hệ thống thiết kế tái sử dụng, nên mọi thẻ đều khớp với phần còn lại của thương hiệu thay vì trông như một thứ làm một lần.',
        imageAlt: 'Minh họa màu thương hiệu và kiểu chữ đang được áp dụng vào một bố cục thẻ',
      },
      {
        title: 'Kết xuất và xuất ra',
        body: 'Đồ họa kết xuất thành HTML ở chính xác kích thước bạn cần — thẻ mạng xã hội, ảnh bìa, banner — rồi xuất ra PNG. Chữ sắc nét, bố cục thực sự, không cần nhích thủ công.',
        imageAlt: 'Minh họa một đồ họa đang kết xuất và xuất ra một tệp hình ảnh',
      },
      {
        title: 'Tái sử dụng công thức',
        body: 'Vì nó là một mẫu, đồ họa tiếp theo chỉ cách một câu lệnh — đổi tiêu đề, giữ bố cục. Một loạt thẻ giữ nhất quán hoàn hảo.',
        imageAlt: 'Minh họa một mẫu thẻ tạo ra một loạt đồ họa nhất quán',
      },
    ],
    tableTitle: 'Đồ họa với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Ứng dụng thiết kế / mẫu chung chung',
    tableRows: [
      {
        capability: 'Đi từ ý tưởng đến đồ họa được bố trí',
        withOd: 'Một câu lệnh; agent dựng kiểu chữ và bố cục',
        without: 'Mở một ứng dụng, đặt từng phần tử bằng tay',
      },
      {
        capability: 'Giữ đúng thương hiệu',
        withOd: 'Màu sắc và kiểu chữ từ một hệ thống thiết kế tái sử dụng',
        without: 'Chọn lại kiểu thương hiệu theo từng tệp, hoặc trôi dạt lệch thương hiệu',
      },
      {
        capability: 'Một loạt nhất quán',
        withOd: 'Cùng mẫu, nội dung mới — một bộ được căn chỉnh hoàn hảo',
        without: 'Căn chỉnh lại từng biến thể thủ công',
      },
      {
        capability: 'Xuất ra',
        withOd: 'HTML ở chính xác kích thước, xuất ra PNG',
        without: 'Định cỡ canvas và cài đặt xuất thủ công',
      },
      {
        capability: 'Lặp lại được',
        withOd: 'Một công thức điều khiển bằng câu lệnh trong repo của bạn',
        without: 'Một tệp làm một lần mà bạn tạo lại mỗi lần',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Công cụ thiết kế theo từng chỗ hoặc chợ mẫu',
      },
    ],
    featuresTitle: 'Bạn có thể tạo những gì',
    features: [
      { title: "Thẻ mạng xã hội", body: "Thẻ X / Twitter được dựng với tiêu đề và thương hiệu của bạn.", thumb: "example-card-twitter" },
      { title: "Ảnh bìa bài viết", body: "Ảnh bìa kiểu biên tập, kiểu tạp chí cho bài đăng và bản tin.", thumb: "example-article-magazine" },
      { title: "Thẻ Xiaohongshu", body: "Thẻ kiểu RedNote được tinh chỉnh cho feed đó.", thumb: "example-card-xiaohongshu" },
      { title: "Đồ họa hero", body: "Hình hero kiểu lỏng, gradient cho website và buổi ra mắt.", thumb: "example-frame-liquid-bg-hero" },
      { title: "Carousel", body: "Carousel mạng xã hội nhiều slide giữ nhất quán qua các khung.", thumb: "example-social-carousel" },
      { title: "Khung mockup UI", body: "Khung thông báo và khung thiết bị để kể chuyện sản phẩm.", thumb: "example-frame-macos-notification" },
    ],
    galleryTitle: 'Những đồ họa mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những thẻ và ảnh bìa thật được kết xuất từ một câu lệnh. Chọn một cái gần với điều bạn cần và thay nội dung của bạn vào.',
    gallery: [
      { thumb: "example-html-ppt-xhs-pastel-card", caption: "Thẻ mạng xã hội pastel" },
      { thumb: "example-html-ppt-zhangzara-editorial-tri-tone", caption: "Poster biên tập ba tông màu" },
      { thumb: "example-magazine-poster", caption: "Poster kiểu tạp chí" },
      { thumb: "example-html-ppt-zhangzara-biennale-yellow", caption: "Ảnh bìa biên tập đậm nét" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu đồ họa',
    faqTitle: 'Câu hỏi thường gặp về hình ảnh',
    faq: [
      {
        q: 'Đây có phải là một trình tạo ảnh AI như Midjourney không?',
        a: 'Không. Open Design dựng đồ họa với bố cục và kiểu chữ thực sự — tiêu đề của bạn, thương hiệu của bạn, kích thước chính xác — và kết xuất thành HTML mà bạn xuất ra PNG. Đó là việc dựng thiết kế, không phải tạo điểm ảnh.',
      },
      {
        q: 'Tôi có thể tạo một loạt thẻ nhất quán không?',
        a: 'Có. Vì mỗi đồ họa là một mẫu, bạn giữ bố cục và đổi nội dung, nên cả một loạt giữ được căn chỉnh hoàn hảo và đúng thương hiệu.',
      },
      {
        q: 'Nó có thể tạo những kích thước nào?',
        a: 'Bất kỳ kích thước nào — đồ họa kết xuất ở chính xác kích thước bạn chỉ định, từ một thẻ mạng xã hội hình vuông đến một banner rộng, rồi xuất ra PNG.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Tạo đồ họa tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến một câu lệnh thành một đồ họa đúng thương hiệu — ngay trong agent bạn đang dùng.',
  },
  video: {
    title: 'Tạo đồ họa chuyển động và video ngắn với Open Design + Claude Code',
    description:
      'Biến một kịch bản thành các khung hình động và video dạng ngắn — thẻ tiêu đề, nền chuyển động và đoạn kết được dựng với hệ thống thương hiệu của bạn và kết xuất từ HTML. Không cần bộ công cụ đồ họa chuyển động, không cần kéo timeline.',
    breadcrumb: 'Video',
    label: 'Trường hợp sử dụng · Video',
    heading: 'Đồ họa chuyển động từ một kịch bản, không phải một timeline',
    lead: 'Mô tả khoảnh khắc bạn muốn — một màn hé lộ tiêu đề, một hoạt cảnh dữ liệu, một đoạn kết logo. Open Design dựng các khung hình động với hệ thống thương hiệu của bạn và kết xuất chúng thành video, không cần bộ công cụ đồ họa chuyển động.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một kịch bản biến thành một chuỗi khung hình video động',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design biến một kịch bản thành các khung hình động, đúng thương hiệu mà agent kết xuất thành video dạng ngắn — được dựng từ HTML, phiên bản hóa trong repo của bạn, không có trình chỉnh sửa timeline nào để học.',
    stepsTitle: 'Chuyển động với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Mô tả khoảnh khắc',
        body: 'Nói điều gì nên xảy ra — “một tiêu đề glitch chuyển thành logo của chúng tôi, rồi một thẻ kết thúc.” Agent nạp kỹ năng chuyển động để tạo ra các khung hình động, không phải một hình ảnh tĩnh.',
        imageAlt: 'Minh họa một người mô tả một chuỗi chuyển động',
      },
      {
        title: 'Áp dụng phong cách thương hiệu và chuyển động',
        body: 'Open Design cung cấp các mẫu khung hình — vệt sáng điện ảnh, tiêu đề glitch, đoạn kết logo — và áp dụng màu sắc cùng kiểu chữ của bạn, nên chuyển động trông có chủ ý và đúng thương hiệu.',
        imageAlt: 'Minh họa kiểu dáng thương hiệu được áp dụng vào các khung hình động',
      },
      {
        title: 'Kết xuất các khung hình thành video',
        body: 'Các khung hình được dựng trong HTML và kết xuất thành video, nên thời lượng và bố cục chính xác và lặp lại được — không cần dựng keyframe thủ công trên một timeline.',
        imageAlt: 'Minh họa các khung hình HTML đang kết xuất thành một đoạn video',
      },
      {
        title: 'Lặp lại và xuất ra',
        body: 'Tinh chỉnh bằng cách trò chuyện với agent — “làm chậm màn hé lộ tiêu đề, thêm một chú thích.” Xuất các đoạn clip dạng ngắn cho mạng xã hội hoặc sản phẩm. Mã nguồn ở lại trong dự án của bạn.',
        imageAlt: 'Minh họa một đoạn video đang được tinh chỉnh và xuất ra cho mạng xã hội',
      },
    ],
    tableTitle: 'Chuyển động với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'After Effects / bộ công cụ chuyển động',
    tableRows: [
      {
        capability: 'Đi từ kịch bản đến khung hình động',
        withOd: 'Một câu lệnh; agent dựng chuỗi hình',
        without: 'Dựng keyframe từng phần tử trên một timeline bằng tay',
      },
      {
        capability: 'Giữ đúng thương hiệu',
        withOd: 'Mẫu khung hình + màu sắc và kiểu chữ của bạn',
        without: 'Dựng lại kiểu dáng thương hiệu theo từng dự án',
      },
      {
        capability: 'Thời lượng chính xác, lặp lại được',
        withOd: 'Được dựng trong HTML, kết xuất một cách xác định',
        without: 'Kéo thủ công, khó tái tạo',
      },
      {
        capability: 'Xuất ra cho mạng xã hội',
        withOd: 'Các đoạn clip dạng ngắn được kết xuất thành video',
        without: 'Cài đặt sẵn xuất và vật lộn với codec',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Mã nguồn khung hình nằm trong repo của bạn, so sánh diff được',
        without: 'Tệp dự án nhị phân, không có diff thực sự',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ',
        without: 'Bộ công cụ đắt tiền, đường cong học tập dốc',
      },
    ],
    featuresTitle: 'Bạn có thể làm động những gì',
    features: [
      { title: "Hyperframes", body: "Các chuỗi chuyển động từng khung hình được dựng từ HTML.", thumb: "example-video-hyperframes" },
      { title: "Mạng xã hội dạng ngắn", body: "Clip dọc được dựng cho các feed mạng xã hội.", thumb: "example-video-shortform" },
      { title: "Bộ khung hình chuyển động", body: "Các khung hình động tái sử dụng được mà bạn dựng thành một đoạn clip.", thumb: "example-motion-frames" },
      { title: "Vệt sáng điện ảnh", body: "Chuyển cảnh kiểu phim và nền tạo không khí.", thumb: "example-frame-light-leak-cinema" },
      { title: "Tiêu đề glitch", body: "Màn hé lộ tiêu đề với chuyển động và kết cấu.", thumb: "example-frame-glitch-title" },
      { title: "Đoạn kết logo", body: "Hoạt cảnh kết thúc gắn thương hiệu cho bất kỳ đoạn clip nào.", thumb: "example-frame-logo-outro" },
    ],
    galleryTitle: 'Những chuyển động mọi người đã xây dựng với Open Design',
    galleryLead:
      'Những khung hình động và đoạn clip thật được kết xuất từ một câu lệnh. Chọn một cái gần với ý tưởng của bạn và mô tả chuyển động.',
    gallery: [
      { thumb: "example-hyperframes", caption: "Chuỗi hyperframes" },
      { thumb: "example-frame-liquid-bg-hero", caption: "Nền chuyển động kiểu lỏng" },
      { thumb: "example-frame-macos-notification", caption: "Khung UI động" },
      { thumb: "example-frame-data-chart-nyt", caption: "Biểu đồ dữ liệu động" },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt các mẫu chuyển động',
    faqTitle: 'Câu hỏi thường gặp về video',
    faq: [
      {
        q: 'Tôi có cần After Effects hoặc một bộ công cụ đồ họa chuyển động không?',
        a: 'Không. Open Design dựng các khung hình động trong HTML và kết xuất chúng thành video bên trong coding agent của bạn. Không có trình chỉnh sửa timeline nào để học hay cấp phép.',
      },
      {
        q: 'Loại video này phù hợp cho việc gì?',
        a: 'Chuyển động dạng ngắn — thẻ tiêu đề, hoạt cảnh dữ liệu, đoạn kết logo, clip mạng xã hội. Nó được dựng cho chuyển động thương hiệu và sản phẩm, không phải dựng phim dài tập.',
      },
      {
        q: 'Thời lượng có tái tạo được không?',
        a: 'Có. Vì các khung hình được dựng trong mã và kết xuất một cách xác định, bạn nhận được cùng một kết quả mỗi lần và có thể tinh chỉnh nó chính xác bằng một câu lệnh.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Làm động ý tưởng tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến một kịch bản thành chuyển động — ngay trong agent bạn đang dùng.',
  },
  designSystem: {
    title: 'Xây dựng và áp dụng một hệ thống thiết kế với Open Design + Claude Code',
    description:
      'Nắm bắt thương hiệu của bạn thành một hệ thống thiết kế tái sử dụng mà coding agent áp dụng cho mọi sản phẩm — màu sắc, kiểu chữ, thành phần và tông giọng trong một DESIGN.md. Định nghĩa một lần; mọi nguyên mẫu, bộ slide và dashboard đều giữ đúng thương hiệu.',
    breadcrumb: 'Hệ thống thiết kế',
    label: 'Trường hợp sử dụng · Hệ thống thiết kế',
    heading: 'Một hệ thống thiết kế, áp dụng cho mọi thứ agent của bạn tạo ra',
    lead: 'Định nghĩa thương hiệu của bạn một lần và Open Design mang nó vào mọi đầu ra — nguyên mẫu, bộ slide, dashboard, đồ họa. Hệ thống nằm trong repo của bạn dưới dạng một DESIGN.md mà agent đọc, nên sự nhất quán là tự động, không phải thủ công.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một hệ thống thiết kế duy nhất tỏa ra thành nhiều sản phẩm đúng thương hiệu',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design nắm bắt thương hiệu của bạn thành một hệ thống thiết kế di động mà agent áp dụng cho mọi sản phẩm — định nghĩa một lần trong repo của bạn, thực thi ở mọi nơi, không có công cụ thiết kế trung tâm nào canh giữ nó.',
    stepsTitle: 'Hệ thống thiết kế với Open Design hoạt động như thế nào',
    steps: [
      {
        title: 'Nắm bắt hệ thống',
        body: 'Mô tả thương hiệu của bạn — màu sắc, kiểu chữ, khoảng cách, giọng điệu — hoặc trỏ agent tới một website hiện có để trích xuất nó. Open Design viết nó vào một DESIGN.md nằm trong dự án của bạn.',
        imageAlt: 'Minh họa một thương hiệu đang được nắm bắt vào một tệp hệ thống thiết kế duy nhất',
      },
      {
        title: 'Bắt đầu từ một nền tảng đã được kiểm chứng',
        body: 'Open Design đi kèm hơn 140 hệ thống thiết kế tham khảo — từ Apple và Linear đến biên tập và brutalist. Fork một cái gần với thương hiệu của bạn thay vì bắt đầu từ một trang trống.',
        imageAlt: 'Minh họa một thư viện các hệ thống thiết kế tham khảo đang được duyệt',
      },
      {
        title: 'Áp dụng nó ở mọi nơi',
        body: 'Mọi kỹ năng khác đều đọc cùng một hệ thống, nên một nguyên mẫu, một bộ slide và một dashboard đều dùng chung một ngôn ngữ thị giác — mà không cần bạn chỉ định lại mỗi lần.',
        imageAlt: 'Minh họa một hệ thống được áp dụng nhất quán qua nhiều loại sản phẩm',
      },
      {
        title: 'Tiến hóa nó ở một nơi',
        body: 'Thay đổi hệ thống và lần kết xuất tiếp theo phản ánh nó ở mọi nơi. Vì nó là một tệp trong repo của bạn, các quyết định thiết kế được xem xét và phiên bản hóa như mã.',
        imageAlt: 'Minh họa một hệ thống thiết kế đang được cập nhật và lan truyền tới mọi đầu ra',
      },
    ],
    tableTitle: 'Hệ thống thiết kế với Open Design so với cách cũ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Thư viện công cụ thiết kế / hướng dẫn phong cách',
    tableRows: [
      {
        capability: 'Định nghĩa hệ thống',
        withOd: 'Một DESIGN.md mà agent đọc, fork từ hơn 140 tham khảo',
        without: 'Một hướng dẫn phong cách tĩnh hoặc một thư viện gắn với công cụ',
      },
      {
        capability: 'Áp dụng qua các loại sản phẩm',
        withOd: 'Cùng một hệ thống cấp cho nguyên mẫu, bộ slide, dashboard, đồ họa',
        without: 'Triển khai lại theo từng công cụ và từng tệp',
      },
      {
        capability: 'Giữ mọi thứ nhất quán',
        withOd: 'Tự động — mọi kỹ năng đọc một nguồn',
        without: 'Kỷ luật thủ công; trôi dạt theo thời gian',
      },
      {
        capability: 'Tiến hóa thương hiệu',
        withOd: 'Sửa một lần; lần kết xuất tiếp theo cập nhật ở mọi nơi',
        without: 'Tìm-và-thay qua các tệp và công cụ',
      },
      {
        capability: 'Xem xét và phiên bản hóa',
        withOd: 'Nằm trong repo của bạn, so sánh diff được như mã',
        without: 'Bị chôn trong một công cụ thiết kế, khó kiểm toán',
      },
      {
        capability: 'Chi phí và khóa nhà cung cấp',
        withOd: 'Mã nguồn mở, di động, chạy cục bộ',
        without: 'Bị khóa vào một thuê bao công cụ thiết kế',
      },
    ],
    featuresTitle: 'Những hệ thống bạn có thể bắt đầu từ đó',
    features: [
      { title: "Apple", body: "Thẩm mỹ sạch sẽ, kiềm chế, dùng font hệ thống.", thumb: "design-system-apple" },
      { title: "Linear", body: "Diện mạo công cụ sản phẩm sắc nét với khoảng cách chặt chẽ.", thumb: "design-system-linear-app" },
      { title: "Notion", body: "Mềm mại, ưu tiên tài liệu, dễ tiếp cận.", thumb: "design-system-notion" },
      { title: "Figma", body: "Vui nhộn, nhiều màu sắc, năng lượng công cụ sáng tạo.", thumb: "design-system-figma" },
      { title: "OpenAI", body: "Tối giản, trung tính, cấp độ nghiên cứu.", thumb: "design-system-openai" },
      { title: "GitHub", body: "Dày đặc, kỹ thuật, native với lập trình viên.", thumb: "design-system-github" },
    ],
    galleryTitle: 'Các hệ thống thiết kế trong Open Design',
    galleryLead:
      'Một vài trong số hơn 140 hệ thống tham khảo mà bạn có thể fork làm điểm khởi đầu. Chọn một cái gần với thương hiệu của bạn và điều chỉnh nó.',
    gallery: [
      { thumb: "design-system-airbnb", caption: "Hệ thống kiểu Airbnb" },
      { thumb: "design-system-vercel", caption: "Hệ thống kiểu Vercel" },
      { thumb: "design-system-stripe", caption: "Hệ thống kiểu Stripe" },
      { thumb: "design-system-spotify", caption: "Hệ thống kiểu Spotify" },
    ],
    exampleHref: '/plugins/systems/',
    exampleLinkLabel: 'Duyệt các hệ thống thiết kế',
    faqTitle: 'Câu hỏi thường gặp về hệ thống thiết kế',
    faq: [
      {
        q: 'Hệ thống thiết kế ở đây chính xác là gì?',
        a: 'Một tệp DESIGN.md trong repo của bạn nắm bắt màu sắc, kiểu chữ, khoảng cách, thành phần và giọng điệu. Mọi kỹ năng của Open Design đều đọc nó, nên thương hiệu của bạn được áp dụng tự động cho bất cứ thứ gì agent tạo ra.',
      },
      {
        q: 'Tôi có phải bắt đầu từ con số không không?',
        a: 'Không. Open Design đi kèm hơn 140 hệ thống thiết kế tham khảo mà bạn có thể fork — từ Apple và Linear đến biên tập và brutalist — rồi điều chỉnh theo thương hiệu của bạn.',
      },
      {
        q: 'Làm sao nó giữ nhất quán qua các bộ slide, dashboard và nguyên mẫu?',
        a: 'Vì tất cả các kỹ năng đó đều đọc cùng một DESIGN.md. Định nghĩa hệ thống một lần và sự nhất quán là tự động thay vì thứ bạn phải canh chừng bằng tay.',
      },
      {
        q: 'Tôi có thể dùng những agent nào?',
        a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.',
      },
    ],
    ctaTitle: 'Định nghĩa hệ thống thiết kế của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và trao cho agent của bạn một thương hiệu để áp dụng ở mọi nơi — ngay trong agent bạn đang dùng.',
  },
  roleSoloBuilder: {
    title: 'Open Design cho nhà phát triển độc lập & indie hacker',
    description:
      'Bứt tốc như cả một đội ngũ chỉ với một người. Open Design biến coding agent của bạn thành nửa thiết kế cho startup của bạn — prototype, trang đích, dashboard và hình ảnh thương hiệu, tất cả từ một câu lệnh, tất cả đúng nhận diện thương hiệu, tất cả nằm trong repo của bạn.',
    breadcrumb: 'Nhà phát triển độc lập',
    label: 'Dành cho · Nhà phát triển độc lập',
    heading: 'Đội ngũ thiết kế của bạn chính là agent bạn đang chạy',
    lead: 'Không cần nhà thiết kế, không cần ngân sách, không cần bàn giao. Hãy mô tả điều bạn cần và agent kết xuất ra ngay — một trang đích sáng nay, một dashboard chiều nay, các thẻ mạng xã hội trước khi bạn phát hành — tất cả cùng chia sẻ một hệ thống thiết kế mà bạn định nghĩa một lần.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một người ngồi tại bàn làm việc được bao quanh bởi một trang đích, một ứng dụng, một dashboard và các thẻ mạng xã hội, tất cả cùng một phong cách nhất quán',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design là bộ phận thiết kế mà một nhà sáng lập đơn độc chưa từng có: từ câu lệnh đến sản phẩm trên mọi bề mặt mà sản phẩm của bạn cần, trên một thương hiệu, không cần bàn giao và không cần công cụ phụ.',
    stepsTitle: 'Cách một nhà phát triển độc lập dùng Open Design',
    steps: [
      {
        title: 'Định nghĩa thương hiệu một lần',
        body: 'Ghi lại màu sắc, kiểu chữ và giọng điệu trong một DESIGN.md (hoặc fork một trong hơn 140 hệ thống tham chiếu). Mọi sản phẩm bạn tạo ra sau đó đều tự động đúng nhận diện thương hiệu.',
        imageAlt: 'Minh họa một tệp định nghĩa thương hiệu duy nhất',
      },
      {
        title: 'Tạo bất cứ thứ gì bạn cần tiếp theo',
        body: 'Prototype, trang đích, dashboard, bộ slide thuyết trình, thẻ mạng xã hội — cùng một agent, cùng một thương hiệu, mỗi thứ một câu lệnh. Không cần đổi công cụ hay mua thêm chỗ ngồi.',
        imageAlt: 'Minh họa nhiều loại sản phẩm sinh ra từ một câu lệnh',
      },
      {
        title: 'Phát hành luôn — nó đã là thật rồi',
        body: 'Mọi thứ được kết xuất thành HTML / mã trong repo của bạn, nên prototype trở thành sản phẩm và trang đích lên sóng. Không có bản mô phỏng dùng một lần rồi bỏ.',
        imageAlt: 'Minh họa một sản phẩm đi thẳng từ câu lệnh đến trạng thái phát hành trực tiếp',
      },
    ],
    tableTitle: 'Làm độc lập với Open Design so với làm theo cách vất vả',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Tự xoay xở như hiện nay',
    tableRows: [
      { capability: 'Bao phủ mọi bề mặt thiết kế', withOd: 'Một agent làm prototype, trang đích, dashboard, thương hiệu', without: 'Chắp vá năm công cụ SaaS và hướng dẫn lại với nhau' },
      { capability: 'Giữ đúng thương hiệu', withOd: 'Một DESIGN.md áp dụng ở mọi nơi một cách tự động', without: 'Tạo lại diện mạo trên từng công cụ, lệch dần theo thời gian' },
      { capability: 'Di chuyển với tốc độ của người độc lập', withOd: 'Từ ý tưởng đến sản phẩm trong một câu lệnh', without: 'Học một công cụ thiết kế mà bạn không có thời gian cho nó' },
      { capability: 'Phát hành, không phải mô phỏng', withOd: 'HTML / mã trong repo của bạn, sẵn sàng triển khai', without: 'Một bản mô phỏng vẫn cần ai đó dựng lên' },
      { capability: 'Chi phí', withOd: 'Mã nguồn mở, dùng khóa của riêng bạn, chạy cục bộ', without: 'Cả chồng đăng ký tính phí theo từng chỗ ngồi' },
    ],
    featuresTitle: 'Những gì một nhà phát triển độc lập có thể phát hành',
    features: [
      { title: 'Trang đích', body: 'Trang đích tiếp thị và SaaS, có thể nhấp qua lại và chạy thật.', thumb: 'example-saas-landing' },
      { title: 'Prototype sản phẩm', body: 'Ứng dụng web nhiều màn hình để kiểm chứng ý tưởng.', thumb: 'example-web-prototype' },
      { title: 'Dashboard', body: 'Các góc nhìn chỉ số và quản trị cho sản phẩm của bạn.', thumb: 'example-dashboard' },
      { title: 'Đồ họa thương hiệu', body: 'Ảnh bìa và poster khớp với thương hiệu của bạn.', thumb: 'example-magazine-poster' },
      { title: 'Luồng di động', body: 'Các màn hình ứng dụng khi bạn vượt ra ngoài web.', thumb: 'example-mobile-app' },
      { title: 'Thẻ mạng xã hội', body: 'Thẻ ra mắt và cập nhật cho mọi kênh.', thumb: 'example-card-twitter' },
    ],
    galleryTitle: 'Dựng độc lập với Open Design',
    galleryLead:
      'Mọi bề mặt mà một startup một người cần, từ một câu lệnh. Hãy chọn một thứ gần với bước đi tiếp theo của bạn và mô tả nó.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Trang đích SaaS' },
      { thumb: 'example-web-prototype', caption: 'Prototype sản phẩm' },
      { thumb: 'example-dashboard', caption: 'Dashboard sản phẩm' },
      { thumb: 'example-card-twitter', caption: 'Thẻ mạng xã hội ra mắt' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt mẫu',
    faqTitle: 'Câu hỏi thường gặp cho nhà phát triển độc lập',
    faq: [
      { q: 'Tôi không phải nhà thiết kế — liệu tôi thực sự dùng được không?', a: 'Được. Bạn mô tả điều bạn muốn bằng ngôn ngữ đời thường; agent áp dụng một hệ thống thiết kế và kết xuất nó. Kỹ năng nằm ở việc viết câu lệnh, không phải ở việc đẩy từng điểm ảnh.' },
      { q: 'Nó bao phủ mọi thứ, hay chỉ một thứ?', a: 'Mọi thứ mà một sản phẩm nhỏ cần — prototype, trang đích, dashboard, bộ slide, đồ họa — từ cùng một agent và cùng một thương hiệu.' },
      { q: 'Đầu ra trở thành cái gì?', a: 'HTML / mã thật trong repo của bạn, nên một prototype có thể trở thành sản phẩm và một trang đích có thể lên sóng, thay vì một bản mô phỏng bạn vứt đi.' },
      { q: 'Tôi có thể dùng những agent nào?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.' },
    ],
    ctaTitle: 'Dựng trọn dự án của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và để một agent trở thành đội ngũ thiết kế của bạn — ngay trong agent bạn đang dùng.',
  },
  roleDesigner: {
    title: 'Open Design cho nhà thiết kế',
    description:
      'Dành thời gian cho gu thẩm mỹ, không phải cho việc cực nhọc. Open Design để agent của bạn lo phần sản xuất lặp đi lặp lại — biến thể, trạng thái, toàn bộ hệ thống thiết kế — trong khi bạn định hướng diện mạo và giữ quyền quyết định cuối cùng.',
    breadcrumb: 'Nhà thiết kế',
    label: 'Dành cho · Nhà thiết kế',
    heading: 'Định hướng thiết kế — để agent lo phần sản xuất',
    lead: 'Bạn đặt ra hệ thống và tiêu chuẩn; agent kết xuất các màn hình, các trạng thái, các biến thể, các bản dựng độ trung thực cao. Bớt đẩy hình chữ nhật, thêm việc quyết định thế nào là tốt.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một nhà thiết kế đang định hướng trong khi một agent điền vào các màn hình, biến thể và một hệ thống thiết kế',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design là trợ lý sản xuất không bao giờ biết mệt: bạn định nghĩa hệ thống thiết kế và phán định gu thẩm mỹ; agent tạo ra phần còn lại, đúng hệ thống, trong repo của bạn.',
    stepsTitle: 'Cách một nhà thiết kế dùng Open Design',
    steps: [
      {
        title: 'Mã hóa hệ thống của bạn',
        body: 'Biến thương hiệu của bạn thành một DESIGN.md — thang kiểu chữ, màu sắc, khoảng cách, thành phần, giọng điệu. Đây là nguồn chân lý mà agent tuân theo.',
        imageAlt: 'Minh họa một hệ thống thiết kế được ghi lại thành một tệp',
      },
      {
        title: 'Tạo phần đuôi dài',
        body: 'Mọi màn hình, trạng thái và biến thể mà lẽ ra bạn phải dựng bằng tay — agent kết xuất chúng đúng hệ thống, nên 80% phần nhàm chán xong trong vài phút.',
        imageAlt: 'Minh họa nhiều màn hình đúng hệ thống được tạo cùng một lúc',
      },
      {
        title: 'Định hướng và tinh chỉnh',
        body: 'Phê bình bằng ngôn ngữ — “siết chặt khoảng cách, làm trạng thái rỗng ấm áp hơn.” Bạn giữ quyền quyết định cuối cùng; agent thực hiện các vòng lặp.',
        imageAlt: 'Minh họa một nhà thiết kế đưa ra định hướng và thiết kế cập nhật theo',
      },
    ],
    tableTitle: 'Thiết kế với Open Design so với cách thủ công',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Công cụ thiết kế thủ công',
    tableRows: [
      { capability: 'Dựng một hệ thống thiết kế', withOd: 'Một DESIGN.md mà agent áp dụng ở mọi nơi', without: 'Một thư viện bạn bảo trì bằng tay trên từng công cụ' },
      { capability: 'Tạo biến thể & trạng thái', withOd: 'Được tạo đúng hệ thống từ một câu lệnh', without: 'Nhân bản từng khung và tinh chỉnh từng cái' },
      { capability: 'Bản dựng độ trung thực cao', withOd: 'Kết xuất thành HTML thật, không phải bản mô phỏng phẳng', without: 'Công việc tỉ mỉ từng điểm ảnh mà kỹ thuật vẫn dựng lại' },
      { capability: 'Giữ sự nhất quán', withOd: 'Một hệ thống, được thực thi tự động', without: 'Kỷ luật thủ công; lệch dần theo thời gian' },
      { capability: 'Bàn giao', withOd: 'Sản phẩm chính là mã — không có khoảng cách phiên dịch', without: 'Tài liệu đặc tả và bản đánh dấu chỉnh sửa' },
    ],
    featuresTitle: 'Những gì một nhà thiết kế có thể định hướng',
    features: [
      { title: 'Bố cục biên tập', body: 'Bố cục được chỉ đạo nghệ thuật, dựa trên lưới.', thumb: 'example-web-prototype-taste-editorial' },
      { title: 'Bìa bài viết', body: 'Bìa và bài đặc sắc theo phong cách tạp chí.', thumb: 'example-article-magazine' },
      { title: 'Poster', body: 'Poster kiểu chữ táo bạo, đúng thương hiệu.', thumb: 'example-magazine-poster' },
      { title: 'Bộ mạng xã hội', body: 'Carousel nhiều khung nhất quán.', thumb: 'example-social-carousel' },
      { title: 'Màn hình ứng dụng', body: 'Màn hình di động và web độ trung thực cao.', thumb: 'example-mobile-app' },
      { title: 'Dashboard', body: 'Giao diện dữ liệu tôn trọng hệ thống của bạn.', thumb: 'example-dashboard' },
    ],
    galleryTitle: 'Được định hướng với Open Design',
    galleryLead:
      'Công việc độ trung thực cao, đúng hệ thống mà agent tạo ra từ định hướng. Hãy chọn một thứ gần với phong cách của bạn và tinh chỉnh nó.',
    gallery: [
      { thumb: 'example-web-prototype-taste-editorial', caption: 'Bố cục biên tập' },
      { thumb: 'example-article-magazine', caption: 'Bìa tạp chí' },
      { thumb: 'example-social-carousel', caption: 'Carousel mạng xã hội' },
      { thumb: 'example-magazine-poster', caption: 'Poster kiểu chữ' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt mẫu',
    faqTitle: 'Câu hỏi thường gặp cho nhà thiết kế',
    faq: [
      { q: 'Cái này có thay thế tôi không?', a: 'Không — nó thay thế việc cực nhọc. Bạn đặt ra hệ thống và gu thẩm mỹ; agent lo phần sản xuất lặp đi lặp lại để bạn dành thời gian cho những quyết định mà chỉ bạn mới làm được.' },
      { q: 'Làm sao tôi giữ quyền kiểm soát diện mạo?', a: 'DESIGN.md của bạn là bản giao kèo. Agent kết xuất trong phạm vi đó, và bạn phê bình bằng ngôn ngữ cho đến khi nó đúng.' },
      { q: 'Đầu ra có chỉnh sửa được / có thật không?', a: 'Đó là HTML/CSS thật, không phải bản xuất phẳng — nên nó đi thẳng vào sản xuất thay vì bị dựng lại.' },
      { q: 'Tôi có thể dùng những agent nào?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.' },
    ],
    ctaTitle: 'Định hướng thiết kế tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và để agent lo phần sản xuất trong khi bạn phán định gu thẩm mỹ — ngay trong agent bạn đang dùng.',
  },
  roleEngineering: {
    title: 'Open Design cho kỹ sư',
    description:
      'Bỏ qua bước bàn giao thiết kế. Open Design biến một DESIGN.md thành front-end thật mà coding agent của bạn viết trực tiếp — giao diện đúng hệ thống, prototype và dashboard, ngay trong repo, không cần vòng lặp qua lại với Figma.',
    breadcrumb: 'Kỹ thuật',
    label: 'Dành cho · Kỹ thuật',
    heading: 'Từ đặc tả đến front-end, không bàn giao ở giữa',
    lead: 'Hãy trỏ agent của bạn vào một DESIGN.md và một bản mô tả; nó viết mã front-end thật, đúng hệ thống — thành phần, màn hình, dashboard — ngay trong dự án của bạn. Không bản đánh dấu chỉnh sửa, không “chờ thiết kế.”',
    heroImageAlt:
      'Minh họa kiểu biên tập về một DESIGN.md chảy thẳng vào mã front-end và giao diện được kết xuất, bỏ qua bước bàn giao',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design khép lại khoảng cách từ nhà thiết kế đến kỹ sư bằng cách làm cho hệ thống thiết kế trở nên máy đọc được: chính agent viết mã của bạn cũng áp dụng hệ thống và kết xuất giao diện thật.',
    stepsTitle: 'Cách một kỹ sư dùng Open Design',
    steps: [
      {
        title: 'Đọc hệ thống, không phải bản đánh dấu',
        body: 'DESIGN.md nằm trong repo. Agent của bạn đọc nó theo cách nó đọc phần còn lại của mã nguồn — không có đặc tả xuất ra để diễn giải.',
        imageAlt: 'Minh họa một agent đang đọc một DESIGN.md song song với mã',
      },
      {
        title: 'Tạo giao diện đúng hệ thống',
        body: 'Hãy mô tả màn hình hoặc thành phần; agent viết front-end vốn đã khớp với hệ thống. Prototype, dashboard quản trị, công cụ nội bộ — trong vài phút.',
        imageAlt: 'Minh họa mã giao diện được tạo ra để khớp với một hệ thống thiết kế',
      },
      {
        title: 'Nó đã là mã của bạn rồi',
        body: 'Đầu ra là HTML / mã framework trong repo của bạn, có thể xem xét trong một PR. Không có bước phiên dịch giữa “thiết kế” và “bản dựng.”',
        imageAlt: 'Minh họa giao diện được tạo ra hạ cánh thành một PR có thể xem xét',
      },
    ],
    tableTitle: 'Front-end với Open Design so với cách bàn giao',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Bàn giao từ thiết kế sang phát triển',
    tableRows: [
      { capability: 'Có một thiết kế để dựng từ đó', withOd: 'Một DESIGN.md mà agent của bạn đọc trực tiếp', without: 'Một tệp Figma mà bạn diễn giải lại bằng tay' },
      { capability: 'Khớp với hệ thống', withOd: 'Được thực thi tự động ngay lúc tạo', without: 'Ước lượng bằng mắt so với đặc tả, sai lệch len lỏi vào' },
      { capability: 'Dựng công cụ nội bộ / dashboard', withOd: 'Câu lệnh → front-end đúng hệ thống trong repo', without: 'Chờ một nhà thiết kế, rồi dựng nó hai lần' },
      { capability: 'Xem xét', withOd: 'Đó là mã — so sánh khác biệt trong một PR', without: 'So sánh từng điểm ảnh với một bản mô phỏng' },
      { capability: 'Chi phí & khóa nhà cung cấp', withOd: 'Mã nguồn mở, trong repo của bạn, chạy cục bộ', without: 'Một công cụ thiết kế mà cả đội phải mua bản quyền' },
    ],
    featuresTitle: 'Những gì một kỹ sư có thể tạo ra',
    features: [
      { title: 'Giao diện ứng dụng web', body: 'Front-end nhiều màn hình từ một bản mô tả.', thumb: 'example-web-prototype' },
      { title: 'Dashboard cho lập trình viên', body: 'Dashboard repo, CI và chỉ số.', thumb: 'example-github-dashboard' },
      { title: 'Báo cáo dữ liệu', body: 'Báo cáo có cấu trúc từ dữ liệu của bạn.', thumb: 'example-data-report' },
      { title: 'Dashboard quản trị', body: 'Công cụ nội bộ và góc nhìn quản trị.', thumb: 'example-dashboard' },
      { title: 'Trang đích', body: 'Trang tiếp thị mà không cần chờ thiết kế.', thumb: 'example-saas-landing' },
      { title: 'Kanban / bảng', body: 'Giao diện quy trình làm việc nội bộ.', thumb: 'example-kanban-board' },
    ],
    galleryTitle: 'Được dựng bởi kỹ sư với Open Design',
    galleryLead:
      'Front-end thật, đúng hệ thống được tạo ra ngay trong repo. Hãy chọn một thứ gần với cái bạn đang dựng và mô tả nó.',
    gallery: [
      { thumb: 'example-web-prototype', caption: 'Giao diện ứng dụng web' },
      { thumb: 'example-github-dashboard', caption: 'Dashboard cho lập trình viên' },
      { thumb: 'example-data-report', caption: 'Báo cáo dữ liệu' },
      { thumb: 'example-kanban-board', caption: 'Giao diện bảng nội bộ' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt mẫu',
    faqTitle: 'Câu hỏi thường gặp về kỹ thuật',
    faq: [
      { q: 'Tôi vẫn cần một nhà thiết kế chứ?', a: 'Cho thương hiệu và định hướng thì có. Nhưng để dựng giao diện đúng hệ thống và công cụ nội bộ, agent đọc DESIGN.md và viết front-end — không cần vòng bàn giao qua lại.' },
      { q: 'Nó tạo ra cái gì?', a: 'Mã HTML / framework thật trong repo của bạn, có thể xem xét trong một PR — không phải một bản mô phỏng bạn phải dựng lại.' },
      { q: 'Làm sao nó giữ đúng hệ thống?', a: 'DESIGN.md là nguồn chân lý; agent áp dụng nó ngay lúc tạo, nên đầu ra khớp mà không cần kiểm tra điểm ảnh thủ công.' },
      { q: 'Tôi có thể dùng những agent nào?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.' },
    ],
    ctaTitle: 'Tạo giao diện tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến một DESIGN.md thành front-end — ngay trong agent bạn đang dùng.',
  },
  roleProductManagers: {
    title: 'Open Design cho quản lý sản phẩm',
    description:
      'Đừng chờ băng thông thiết kế để truyền đạt một ý tưởng. Open Design để một PM biến một câu lệnh thành một prototype có thể nhấp được hoặc một wireframe — để đồng thuận với các bên liên quan và brief cho đội, mà không cần một phiếu yêu cầu thiết kế.',
    breadcrumb: 'Quản lý sản phẩm',
    label: 'Dành cho · Quản lý sản phẩm',
    heading: 'Biến ý tưởng thành có thể nhấp được trước buổi kickoff',
    lead: 'Hãy mô tả luồng và agent của bạn kết xuất một prototype thật, có thể nhấp được mà bạn có thể đặt trước mặt các bên liên quan ngay hôm nay — để các buổi review bàn về chính thứ đó, không phải một đoạn văn trong tài liệu.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một PM biến một ý tưởng đã viết thành một prototype có thể nhấp được trình bày cho các bên liên quan',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design trao cho một PM một cách không cần thiết kế để làm ý tưởng trở nên hữu hình: từ câu lệnh đến prototype phục vụ sự đồng thuận và các bản brief, mà không tiêu hết ngân sách thiết kế của đội.',
    stepsTitle: 'Cách một PM dùng Open Design',
    steps: [
      {
        title: 'Mô tả luồng',
        body: 'Viết hành trình người dùng bằng ngôn ngữ đời thường — các màn hình, các trạng thái, đường đi thuận lợi. Không cần công cụ vẽ wireframe.',
        imageAlt: 'Minh họa một PM đang mô tả một luồng người dùng',
      },
      {
        title: 'Nhận một prototype có thể nhấp được',
        body: 'Agent kết xuất các màn hình điều hướng được mà bạn thực sự có thể nhấp qua — rõ ràng hơn nhiều so với một slide hay một tài liệu cho buổi review của bên liên quan.',
        imageAlt: 'Minh họa một prototype có thể nhấp được tạo ra từ một bản mô tả',
      },
      {
        title: 'Đồng thuận và bàn giao',
        body: 'Chia sẻ liên kết, thu thập phản hồi trên chính thứ đó, rồi chuyển prototype cho thiết kế/kỹ thuật như một điểm khởi đầu chính xác, chung.',
        imageAlt: 'Minh họa một prototype được chia sẻ để đồng thuận rồi bàn giao cho đội',
      },
    ],
    tableTitle: 'Công việc PM với Open Design so với chờ thiết kế',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Không có nó như hiện nay',
    tableRows: [
      { capability: 'Làm một ý tưởng trở nên hữu hình', withOd: 'Câu lệnh → prototype có thể nhấp được do chính bạn làm', without: 'Mở một phiếu thiết kế và chờ băng thông' },
      { capability: 'Đồng thuận với các bên liên quan', withOd: 'Họ nhấp vào luồng thật', without: 'Họ đọc một tài liệu và hình dung mỗi người một khác' },
      { capability: 'Brief cho đội', withOd: 'Một prototype cụ thể làm đặc tả', without: 'Một bức tường chữ và những vòng qua lại' },
      { capability: 'Lặp trước khi dựng', withOd: 'Đổi nó trong một câu lệnh, chia sẻ lại', without: 'Thêm một vòng trong hàng đợi thiết kế' },
      { capability: 'Chi phí', withOd: 'Mã nguồn mở, ngay trong agent bạn đang dùng', without: 'Giờ thiết kế tiêu cho những concept dùng một lần rồi bỏ' },
    ],
    featuresTitle: 'Những gì một PM có thể đặt trước mặt mọi người',
    features: [
      { title: 'Luồng di động', body: 'Hành trình ứng dụng đầu cuối, có thể nhấp được.', thumb: 'example-mobile-app' },
      { title: 'Luồng onboarding', body: 'Chào mừng → thiết lập → lần chạy đầu tiên.', thumb: 'example-mobile-onboarding' },
      { title: 'Bảng & quy trình', body: 'Giao diện Kanban và quy trình cho các đặc tả.', thumb: 'example-kanban-board' },
      { title: 'Dashboard', body: 'Góc nhìn chỉ số để định khung vấn đề.', thumb: 'example-dashboard' },
      { title: 'Prototype web', body: 'Luồng web nhiều màn hình để review.', thumb: 'example-web-prototype' },
      { title: 'Góc nhìn xu hướng', body: 'Ảnh chụp 30 ngày và xu hướng để có bối cảnh.', thumb: 'example-last30days' },
    ],
    galleryTitle: 'Được làm prototype bởi các PM với Open Design',
    galleryLead:
      'Các luồng có thể nhấp được kết xuất từ một bản mô tả, sẵn sàng cho một buổi review của bên liên quan. Hãy chọn một thứ gần với ý tưởng của bạn và mô tả nó.',
    gallery: [
      { thumb: 'example-mobile-app', caption: 'Luồng di động' },
      { thumb: 'example-mobile-onboarding', caption: 'Luồng onboarding' },
      { thumb: 'example-kanban-board', caption: 'Bảng quy trình' },
      { thumb: 'example-web-prototype', caption: 'Prototype web' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt mẫu',
    faqTitle: 'Câu hỏi thường gặp cho quản lý sản phẩm',
    faq: [
      { q: 'Tôi không biết thiết kế — cái này có dành cho tôi không?', a: 'Có. Bạn mô tả luồng bằng lời; agent làm cho nó có thể nhấp được. Nó dành cho việc truyền đạt và đồng thuận, không cần công cụ thiết kế.' },
      { q: 'Đó là một prototype thật hay một bản mô phỏng?', a: 'Thật và có thể nhấp được — điều hướng và các trạng thái hoạt động, nên các bên liên quan phản ứng với chính trải nghiệm thực tế.' },
      { q: 'Nó có thay thế thiết kế không?', a: 'Không — nó trao cho thiết kế và kỹ thuật một điểm khởi đầu chính xác, chung thay vì một đặc tả bằng chữ, và để dành băng thông thiết kế cho công việc thực sự cần đến.' },
      { q: 'Tôi có thể dùng những agent nào?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.' },
    ],
    ctaTitle: 'Biến ý tưởng của bạn thành có thể nhấp được ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến đặc tả tiếp theo của bạn thành thứ mà mọi người có thể nhấp — ngay trong agent bạn đang dùng.',
  },
  roleMarketing: {
    title: 'Open Design cho đội tiếp thị',
    description:
      'Phát hành chiến dịch với tốc độ của nội dung. Open Design để agent của bạn tạo ra trang đích, thẻ mạng xã hội và hình ảnh chiến dịch từ một câu lệnh — đúng thương hiệu, theo yêu cầu, không cần xếp hàng chờ thiết kế.',
    breadcrumb: 'Tiếp thị',
    label: 'Dành cho · Tiếp thị',
    heading: 'Hình ảnh chiến dịch với tốc độ của một câu lệnh',
    lead: 'Trang đích, thẻ mạng xã hội, ảnh bìa, đồ họa thông báo — được mô tả bằng ngôn ngữ, kết xuất đúng thương hiệu, phát hành ngay trong ngày. Không phiếu thiết kế, không vật lộn với mẫu.',
    heroImageAlt:
      'Minh họa kiểu biên tập về một người làm tiếp thị biến một bản brief thành một trang đích và một bộ thẻ mạng xã hội đúng thương hiệu',
    tldrTitle: 'Tóm lại một câu',
    tldrBody:
      'Open Design là nguồn lực thiết kế luôn sẵn sàng cho tiếp thị: từ câu lệnh đến tài sản cho trang đích và mạng xã hội, đúng thương hiệu, để chiến dịch phát hành với tốc độ bạn viết nội dung.',
    stepsTitle: 'Cách một đội tiếp thị dùng Open Design',
    steps: [
      {
        title: 'Khóa thương hiệu',
        body: 'DESIGN.md của bạn nắm giữ màu sắc, kiểu chữ và giọng điệu. Mọi tài sản agent tạo ra đều tự động đúng thương hiệu — không cần tạo lại phong cách cho từng tài sản.',
        imageAlt: 'Minh họa một hệ thống thương hiệu áp dụng cho các tài sản tiếp thị',
      },
      {
        title: 'Tạo chiến dịch',
        body: 'Trang đích, thẻ mạng xã hội, ảnh bìa, đồ họa thông báo — mỗi thứ một câu lệnh, một bộ nhất quán trên mọi kênh.',
        imageAlt: 'Minh họa một bộ chiến dịch đầy đủ được tạo ra từ các câu lệnh',
      },
      {
        title: 'Phát hành và lặp',
        body: 'Trang đích kết xuất thành HTML bạn có thể triển khai; đồ họa xuất ra PNG. Đổi dòng tiêu đề, kết xuất lại cả bộ — không cần chờ hàng đợi.',
        imageAlt: 'Minh họa các tài sản chiến dịch được phát hành và được lặp lại nhanh chóng',
      },
    ],
    tableTitle: 'Tiếp thị với Open Design so với cảnh chạy đôn chạy đáo thường lệ',
    tableColCapability: 'Điều bạn cần',
    tableColWithOd: 'Với Open Design',
    tableColWithout: 'Không có nó như hiện nay',
    tableRows: [
      { capability: 'Ra mắt một trang đích', withOd: 'Câu lệnh → trang đúng thương hiệu, có thể triển khai', without: 'Brief thiết kế hoặc vật lộn với một trình dựng website' },
      { capability: 'Một bộ mạng xã hội nhất quán', withOd: 'Cùng mẫu, nội dung mới, căn chỉnh hoàn hảo', without: 'Căn chỉnh lại từng thẻ bằng tay' },
      { capability: 'Giữ đúng thương hiệu', withOd: 'Một DESIGN.md áp dụng cho mọi tài sản', without: 'Hy vọng mỗi tài sản khớp với hướng dẫn' },
      { capability: 'Di chuyển với tốc độ chiến dịch', withOd: 'Tài sản trong một câu lệnh, ngay trong ngày', without: 'Xếp hàng phía sau tồn đọng thiết kế' },
      { capability: 'Chi phí', withOd: 'Mã nguồn mở, không có công cụ thiết kế tính phí theo chỗ ngồi', without: 'Đăng ký cộng với giờ thiết kế' },
    ],
    featuresTitle: 'Những gì một đội tiếp thị có thể phát hành',
    features: [
      { title: 'Trang đích', body: 'Trang đích chiến dịch và sản phẩm, có thể triển khai.', thumb: 'example-saas-landing' },
      { title: 'Thẻ mạng xã hội', body: 'Thẻ X / Twitter đúng thương hiệu.', thumb: 'example-card-twitter' },
      { title: 'Carousel', body: 'Bộ mạng xã hội nhiều slide, nhất quán.', thumb: 'example-social-carousel' },
      { title: 'Poster', body: 'Poster thông báo và sự kiện.', thumb: 'example-magazine-poster' },
      { title: 'Bìa bài viết', body: 'Bìa blog và bản tin.', thumb: 'example-article-magazine' },
      { title: 'Trang web', body: 'Microsite và trang chiến dịch.', thumb: 'example-web-prototype' },
    ],
    galleryTitle: 'Được phát hành bởi tiếp thị với Open Design',
    galleryLead:
      'Các tài sản chiến dịch đúng thương hiệu được kết xuất từ một câu lệnh. Hãy chọn một thứ gần với chiến dịch của bạn và thay nội dung của bạn vào.',
    gallery: [
      { thumb: 'example-saas-landing', caption: 'Trang đích chiến dịch' },
      { thumb: 'example-card-twitter', caption: 'Thẻ mạng xã hội' },
      { thumb: 'example-social-carousel', caption: 'Carousel mạng xã hội' },
      { thumb: 'example-magazine-poster', caption: 'Poster thông báo' },
    ],
    exampleHref: '/plugins/templates/',
    exampleLinkLabel: 'Duyệt mẫu',
    faqTitle: 'Câu hỏi thường gặp về tiếp thị',
    faq: [
      { q: 'Chúng tôi có cần một nhà thiết kế cho mọi tài sản không?', a: 'Không. Agent kết xuất trang đích và tài sản mạng xã hội đúng thương hiệu từ một câu lệnh, nên đội phát hành công việc chiến dịch thường lệ mà không cần xếp hàng chờ thiết kế.' },
      { q: 'Làm sao các tài sản giữ đúng thương hiệu?', a: 'DESIGN.md của bạn được áp dụng cho mọi thứ một cách tự động — màu sắc, kiểu chữ và giọng điệu xuyên suốt mọi tài sản.' },
      { q: 'Các trang đích có thực sự lên sóng được không?', a: 'Có — chúng kết xuất thành HTML bạn có thể triển khai, và đồ họa xuất ra PNG. Đây là các tài sản phát hành được, không phải bản mô phỏng.' },
      { q: 'Tôi có thể dùng những agent nào?', a: 'Claude Code, Codex, Cursor Agent, Gemini CLI và nhiều adapter chính chủ khác, với khóa nhà cung cấp của riêng bạn.' },
    ],
    ctaTitle: 'Phát hành chiến dịch tiếp theo của bạn ngay tối nay',
    ctaBody:
      'Gắn sao cho repo, cài Open Design, và biến các bản brief thành tài sản đúng thương hiệu — ngay trong agent bạn đang dùng.',
  },
};
