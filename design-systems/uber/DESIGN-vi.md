# Hệ thống thiết kế lấy cảm hứng từ Uber

> Category: Truyền thông & Người tiêu dùng
> Nền tảng di chuyển. Đen trắng đậm nét, kiểu chữ chặt chẽ, năng lượng đô thị.

## 1. Chủ đề & Bầu không khí Hình ảnh

Ngôn ngữ thiết kế của Uber là bài học điển hình về chủ nghĩa tối giản tự tin -- một vũ trụ đen trắng nơi mỗi điểm ảnh đều có mục đích và không có gì trang trí mà không xứng đáng có mặt ở đó. Toàn bộ trải nghiệm được xây dựng trên một sự đối lập rõ ràng: đen tuyền (`#000000`) và trắng tinh (`#ffffff`), hầu như không có tông xám trung gian nào làm loãng thông điệp. Đây không phải là chủ nghĩa tối giản vô hồn của một startup chưa hoàn thiện thiết kế -- đó là sự kiềm chế có chủ ý của một thương hiệu đã đủ vững chắc đến mức có thể thì thầm mà vẫn được lắng nghe.

Phông chữ đặc trưng, UberMove, là một kiểu sans-serif hình học độc quyền với chất lượng vuông vắn, có tính kỹ thuật rõ nét. Tiêu đề bằng UberMove Bold ở 52px mang sức nặng của một tấm biển quảng cáo -- uy quyền, trực tiếp, không xin lỗi. Phông chữ bổ trợ UberMoveText xử lý nội dung thân bài và các nút với ký tự nhẹ nhàng hơn, dễ đọc hơn ở độ đậm trung bình (500). Cùng với nhau, chúng tạo ra một hệ thống kiểu chữ cảm giác như bản đồ giao thông: rõ ràng, hiệu quả, được xây dựng để quét nhanh.

Điều làm cho thiết kế của Uber thực sự nổi bật là việc sử dụng ảnh và minh họa full-bleed kết hợp với các yếu tố tương tác hình viên thuốc (999px border-radius). Các chip điều hướng, nút CTA và bộ chọn danh mục đều có hình dạng viên nang này, tạo ra ngôn ngữ giao diện trực quan, thân thiện với ngón tay cái mang đặc trưng không thể nhầm lẫn của Uber. Các hình minh họa -- những cảnh ấm áp, được cách điệu nhẹ của tài xế, hành khách và cảnh quan đô thị -- mang lại sự nhân văn vào một hệ thống mà nếu không có chúng sẽ rất lạnh lùng và đơn sắc. Trang web xen kẽ giữa các phần nội dung trắng và footer toàn đen, với bố cục thẻ card sử dụng bóng đổ nhẹ nhàng nhất có thể (rgba(0,0,0,0.12-0.16)) để tạo độ nâng tinh tế mà không phá vỡ thẩm mỹ phẳng.

**Đặc điểm chính:**
- Nền tảng đen trắng thuần túy với hầu như không có tông xám trung gian nào trong UI chrome
- UberMove (tiêu đề) + UberMoveText (thân bài/UI) -- bộ phông chữ sans-serif hình học độc quyền
- Hình viên thuốc ở mọi nơi: nút, chip, mục nav đều dùng 999px border-radius
- Hình minh họa ấm áp, mang tính con người tương phản với giao diện đơn sắc
- Bố cục thẻ card với bóng đổ siêu nhẹ (độ mờ 0.12-0.16)
- Lưới khoảng cách 8px với bố cục gọn gàng, thông tin dày đặc
- Ảnh đậm nét được tích hợp làm nền hero full-bleed
- Footer đen neo giữ trang với môi trường tối, tương phản cao

## 2. Bảng màu & Vai trò

### Màu chính
- **Uber Black** (`#000000`): Màu thương hiệu định nghĩa -- dùng cho nút chính, tiêu đề, văn bản điều hướng và footer. Không phải "gần đen" hay "đen xỉn," mà là đen thực sự, không khoan nhượng.
- **Pure White** (`#ffffff`): Màu bề mặt chính và văn bản đảo ngược. Dùng cho nền trang, bề mặt thẻ card và văn bản trên các phần tử đen.

### Trạng thái tương tác & Nút
- **Hover Gray** (`#e2e2e2`): Trạng thái hover của nút trắng -- màu xám nhạt, sạch, mát, cung cấp phản hồi rõ ràng mà không ấm.
- **Hover Light** (`#f3f3f3`): Hover tinh tế cho nút trắng nổi -- màu xám vừa đủ để phản hồi tương tác nhẹ nhàng.
- **Chip Gray** (`#efefef`): Nền cho nút thứ cấp/lọc và chip điều hướng -- màu xám trung tính, cực nhạt.

### Văn bản & Nội dung
- **Body Gray** (`#4b4b4b`): Văn bản thứ cấp và liên kết footer -- màu xám trung bình thực sự, không nghiêng về tông ấm hay lạnh.
- **Muted Gray** (`#afafaf`): Văn bản bậc ba, liên kết footer bị giảm nhấn và nội dung chỗ giữ chỗ.

### Viền & Phân tách
- **Border Black** (`#000000`): Viền 1px mỏng để chứa cấu trúc -- dùng hạn chế trên dải phân cách và khung biểu mẫu.

### Bóng đổ & Chiều sâu
- **Shadow Light** (`rgba(0, 0, 0, 0.12)`): Độ nâng thẻ card tiêu chuẩn -- nâng nhẹ nhàng như lông vũ cho thẻ nội dung.
- **Shadow Medium** (`rgba(0, 0, 0, 0.16)`): Độ nâng mạnh hơn một chút cho nút hành động nổi và lớp phủ.
- **Button Press** (`rgba(0, 0, 0, 0.08)`): Bóng đổ inset cho trạng thái active/nhấn trên nút thứ cấp.

### Trạng thái liên kết
- **Default Link Blue** (`#0000ee`): Màu xanh trình duyệt tiêu chuẩn cho liên kết văn bản có gạch chân -- dùng trong nội dung thân bài.
- **Link White** (`#ffffff`): Liên kết trên bề mặt tối -- dùng trong footer và các phần tối.
- **Link Black** (`#000000`): Liên kết trên bề mặt sáng có trang trí gạch chân.

### Hệ thống gradient
- Thiết kế của Uber **hoàn toàn không có gradient**. Sự đối lập đen/trắng và các khối màu phẳng tạo ra toàn bộ phân cấp trực quan. Không có gradient nào xuất hiện ở bất cứ đâu trong hệ thống -- mọi bề mặt đều là màu solid, mọi chuyển tiếp đều là cạnh cứng hoặc bóng đổ.

## 3. Quy tắc Typography

### Bộ phông chữ
- **Tiêu đề / Display**: `UberMove`, với fallback: `UberMoveText, system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Thân bài / UI**: `UberMoveText`, với fallback: `system-ui, Helvetica Neue, Helvetica, Arial, sans-serif`

*Lưu ý: UberMove và UberMoveText là phông chữ độc quyền. Đối với các triển khai bên ngoài, hãy dùng `system-ui` hoặc Inter làm phương án thay thế gần nhất. Đặc tính hình học, tỷ lệ vuông của UberMove có thể được xấp xỉ bằng Inter hoặc DM Sans.*

### Phân cấp

| Vai trò | Phông chữ | Kích thước | Độ đậm | Chiều cao dòng | Ghi chú |
|------|------|------|--------|-------------|-------|
| Display / Hero | UberMove | 52px (3.25rem) | 700 | 1.23 (chặt) | Tác động tối đa, hiện diện như biển quảng cáo |
| Tiêu đề phần | UberMove | 36px (2.25rem) | 700 | 1.22 (chặt) | Neo các phần chính |
| Tiêu đề thẻ | UberMove | 32px (2rem) | 700 | 1.25 (chặt) | Tiêu đề thẻ và tính năng |
| Tiêu đề phụ | UberMove | 24px (1.5rem) | 700 | 1.33 | Tiêu đề phần thứ cấp |
| Tiêu đề nhỏ | UberMove | 20px (1.25rem) | 700 | 1.40 | Tiêu đề gọn, tên danh sách |
| Nav / UI lớn | UberMoveText | 18px (1.13rem) | 500 | 1.33 | Liên kết điều hướng, văn bản UI nổi bật |
| Thân bài / Nút | UberMoveText | 16px (1rem) | 400-500 | 1.25-1.50 | Văn bản thân bài tiêu chuẩn, nhãn nút |
| Chú thích | UberMoveText | 14px (0.88rem) | 400-500 | 1.14-1.43 | Siêu dữ liệu, mô tả, liên kết nhỏ |
| Micro | UberMoveText | 12px (0.75rem) | 400 | 1.67 (thoải mái) | Chữ nhỏ, văn bản pháp lý |

### Nguyên tắc
- **Tiêu đề đậm, thân bài trung bình**: Tiêu đề UberMove độc quyền ở độ đậm 700 (bold) -- mỗi tiêu đề đều có sức mạnh như biển quảng cáo. Văn bản thân bài và UI UberMoveText dùng 400-500, tạo phân cấp trực quan rõ ràng qua độ tương phản về độ đậm.
- **Chiều cao dòng tiêu đề chặt**: Tất cả tiêu đề dùng chiều cao dòng từ 1.22-1.40 -- gọn và mạnh mẽ, được thiết kế để quét nhanh hơn là đọc kỹ.
- **Typography chức năng**: Không có xử lý kiểu chữ trang trí nào ở bất cứ đâu. Không có letter-spacing, không có text-transform, không có kích thước trang trí. Mỗi phần tử văn bản đều phục vụ mục đích giao tiếp trực tiếp.
- **Hai phông chữ, vai trò nghiêm ngặt**: UberMove độc quyền cho tiêu đề. UberMoveText độc quyền cho thân bài, nút, liên kết và UI. Ranh giới này không bao giờ bị vi phạm.

## 4. Kiểu dáng Component

### Nút

**Primary Black (CTA)**
- Background: Uber Black (`#000000`)
- Text: Pure White (`#ffffff`)
- Padding: 10px 12px
- Radius: 999px (viên thuốc đầy đủ)
- Outline: none
- Focus: inset ring `rgb(255,255,255) 0px 0px 0px 2px`
- Nút hành động chính -- đậm, tương phản cao, không thể bỏ qua

**Secondary White**
- Background: Pure White (`#ffffff`)
- Text: Uber Black (`#000000`)
- Padding: 10px 12px
- Radius: 999px (viên thuốc đầy đủ)
- Hover: background chuyển sang Hover Gray (`#e2e2e2`)
- Focus: background chuyển sang Hover Gray, inset ring xuất hiện
- Dùng trên bề mặt tối hoặc làm hành động thứ cấp cạnh Primary Black

**Chip / Filter**
- Background: Chip Gray (`#efefef`)
- Text: Uber Black (`#000000`)
- Padding: 14px 16px
- Radius: 999px (viên thuốc đầy đủ)
- Active: inset shadow `rgba(0,0,0,0.08)`
- Chip điều hướng, bộ chọn danh mục, toggle lọc

**Floating Action**
- Background: Pure White (`#ffffff`)
- Text: Uber Black (`#000000`)
- Padding: 14px
- Radius: 999px (viên thuốc đầy đủ)
- Shadow: `rgba(0,0,0,0.16) 0px 2px 8px 0px`
- Transform: `translateY(2px)` lệch nhẹ
- Hover: background chuyển sang `#f3f3f3`
- Điều khiển bản đồ, scroll-to-top, CTA nổi

### Thẻ Card & Container
- Background: Pure White (`#ffffff`) trên các trang trắng; không có sự khác biệt rõ ràng về nền thẻ
- Border: không có theo mặc định -- thẻ được xác định bởi bóng đổ, không phải nét
- Radius: 8px cho thẻ nội dung tiêu chuẩn; 12px cho thẻ nổi bật/được quảng bá
- Shadow: `rgba(0,0,0,0.12) 0px 4px 16px 0px` cho độ nâng tiêu chuẩn
- Thẻ có mật độ nội dung cao với padding nội bộ tối thiểu
- Thẻ dẫn bằng hình ảnh dùng hình ảnh full-bleed với văn bản overlay hoặc bên dưới

### Input & Form
- Text: Uber Black (`#000000`)
- Background: Pure White (`#ffffff`)
- Border: 1px solid Black (`#000000`) -- nơi duy nhất viền hiển thị nổi bật
- Radius: 8px
- Padding: khoảng cách thoải mái tiêu chuẩn
- Focus: không có trạng thái focus tùy chỉnh được trích xuất -- dựa vào focus ring tiêu chuẩn của trình duyệt

### Điều hướng
- Thanh điều hướng cố định ở đầu với nền trắng
- Logo: wordmark/icon Uber ở 24x24px màu đen
- Liên kết: UberMoveText ở 14-18px, độ đậm 500, màu Uber Black
- Chip nav hình viên thuốc với nền Chip Gray (`#efefef`) cho điều hướng danh mục ("Ride", "Drive", "Business", "Uber Eats")
- Toggle menu: nút tròn với 50% border-radius
- Mobile: mẫu menu hamburger

### Xử lý hình ảnh
- Cảnh được vẽ tay ấm áp (không phải ảnh chụp cho các phần tính năng)
- Phong cách minh họa: người được cách điệu nhẹ, bảng màu ấm trong minh họa, cảm giác đương đại
- Các phần hero dùng ảnh chụp đậm nét hoặc minh họa làm nền full-width
- Mã QR cho CTA tải ứng dụng
- Tất cả hình ảnh dùng border-radius tiêu chuẩn 8px hoặc 12px khi được chứa trong thẻ

### Component đặc trưng

**Điều hướng Pill theo Danh mục**
- Hàng ngang các nút hình viên thuốc cho điều hướng cấp cao nhất ("Ride", "Drive", "Business", "Uber Eats", "About")
- Mỗi pill: nền Chip Gray, văn bản đen, radius 999px
- Trạng thái active được biểu thị bằng nền đen với văn bản trắng (đảo ngược)

**Hero với Hành động kép**
- Hero chia đôi: văn bản/CTA bên trái, bản đồ/minh họa bên phải
- Hai trường nhập liệu cạnh nhau cho điểm đón/điểm đến
- Nút CTA "See prices" dạng pill đen

**Thẻ Lên kế hoạch trước**
- Thẻ quảng bá tính năng như "Uber Reserve" và lên kế hoạch chuyến đi
- Nhiều minh họa với hình ảnh ấm áp, lấy con người làm trung tâm
- Nút CTA đen với văn bản trắng ở cuối

## 5. Nguyên tắc Bố cục

### Hệ thống khoảng cách
- Đơn vị cơ sở: 8px
- Thang: 4px, 6px, 8px, 10px, 12px, 14px, 16px, 18px, 20px, 24px, 32px
- Padding nút: 10px 12px (gọn) hoặc 14px 16px (thoải mái)
- Padding nội bộ thẻ: khoảng 24-32px
- Khoảng cách dọc phần: rộng rãi nhưng hiệu quả -- khoảng 64-96px giữa các phần chính

### Lưới & Container
- Chiều rộng container tối đa: khoảng 1136px, căn giữa
- Hero: bố cục chia đôi với văn bản bên trái, hình ảnh bên phải
- Các phần tính năng: lưới thẻ 2 cột hoặc đơn cột full-width
- Footer: lưới liên kết nhiều cột trên nền đen
- Các phần full-width mở rộng đến cạnh viewport

### Triết lý khoảng trắng
- **Hiệu quả, không thoáng đãng**: Khoảng trắng của Uber là chức năng -- đủ để phân tách, không bao giờ đủ để cảm thấy trống. Đây là khoảng cách kiểu hệ thống giao thông: gọn gàng, rõ ràng, có mục đích.
- **Thẻ dày đặc nội dung**: Thẻ đóng gói thông tin chặt chẽ với khoảng cách nội bộ tối thiểu, dựa vào bóng đổ và radius để xác định ranh giới.
- **Không gian thở của phần**: Các phần chính có khoảng cách dọc rộng rãi, nhưng trong các phần, các phần tử được nhóm chặt chẽ.

### Thang Border Radius
- Sắc nét (0px): Không dùng góc vuông cho các phần tử tương tác
- Tiêu chuẩn (8px): Thẻ nội dung, trường input, listbox
- Thoải mái (12px): Thẻ nổi bật, container lớn hơn, thẻ liên kết
- Viên thuốc đầy đủ (999px): Tất cả nút, chip, mục điều hướng, pill
- Tròn (50%): Ảnh avatar, container icon, điều khiển tròn

## 6. Chiều sâu & Độ nổi

| Cấp | Xử lý | Dùng cho |
|-------|-----------|-----|
| Phẳng (Level 0) | Không có bóng, nền solid | Nền trang, nội dung inline, phần văn bản |
| Tinh tế (Level 1) | `rgba(0,0,0,0.12) 0px 4px 16px` | Thẻ nội dung tiêu chuẩn, khối tính năng |
| Trung bình (Level 2) | `rgba(0,0,0,0.16) 0px 4px 16px` | Thẻ nổi, phần tử overlay |
| Nổi (Level 3) | `rgba(0,0,0,0.16) 0px 2px 8px` + translateY(2px) | Nút hành động nổi, điều khiển bản đồ |
| Nhấn (Level 4) | `rgba(0,0,0,0.08) inset` (999px spread) | Trạng thái nút active/nhấn |
| Focus Ring | `rgb(255,255,255) 0px 0px 0px 2px inset` | Chỉ báo focus bàn phím |

**Triết lý bóng đổ**: Uber dùng bóng đổ thuần túy như một công cụ cấu trúc, không bao giờ trang trí. Bóng đổ luôn là đen ở độ mờ rất thấp (0.08-0.16), tạo ra độ nâng tối thiểu cần thiết để phân tách các lớp nội dung. Bán kính blur là vừa phải (8-16px) -- đủ để cảm giác tự nhiên nhưng không bao giờ kịch tính. Không có bóng có màu, không có ngăn xếp bóng nhiều lớp và không có hiệu ứng phát sáng môi trường. Chiều sâu được truyền đạt nhiều hơn thông qua sự tương phản phần đen/trắng hơn là qua độ nâng bóng đổ.

## 7. Nên làm & Không nên làm

### Nên làm
- Dùng đen thực sự (`#000000`) và trắng tinh (`#ffffff`) làm bảng màu chính -- sự tương phản rõ nét CHÍNH LÀ Uber
- Dùng 999px border-radius cho tất cả nút, chip và các phần tử điều hướng hình viên thuốc
- Giữ tất cả tiêu đề bằng UberMove Bold (700) để tạo tác động ở cấp biển quảng cáo
- Dùng bóng đổ siêu nhẹ (độ mờ 0.12-0.16) cho độ nâng thẻ -- hầu như không nhìn thấy
- Duy trì phong cách bố cục gọn, mật độ thông tin cao -- Uber ưu tiên hiệu quả hơn sự thoáng đãng
- Dùng hình minh họa ấm áp, lấy con người làm trung tâm để làm mềm giao diện đơn sắc
- Áp dụng radius 8px cho thẻ nội dung và 12px cho container nổi bật
- Dùng UberMoveText ở độ đậm 500 cho điều hướng và văn bản UI nổi bật
- Ghép nút chính đen với nút thứ cấp trắng cho bố cục hành động kép

### Không nên làm
- Đừng đưa màu sắc vào UI chrome -- giao diện của Uber nghiêm ngặt là đen, trắng và xám
- Đừng dùng góc bo tròn ít hơn 999px trên nút -- hình viên thuốc đầy đủ là yếu tố nhận dạng cốt lõi
- Đừng áp dụng bóng đổ nặng hoặc drop shadow với độ mờ cao -- chiều sâu là siêu nhẹ
- Đừng dùng phông chữ serif ở bất cứ đâu -- typography của Uber độc quyền là geometric sans-serif
- Đừng tạo bố cục thoáng, rộng rãi với khoảng trắng thừa -- mật độ của Uber là có chủ ý
- Đừng dùng gradient hoặc color overlay -- mọi bề mặt đều là màu phẳng, solid
- Đừng trộn UberMove vào văn bản thân bài hoặc UberMoveText vào tiêu đề -- phân cấp là nghiêm ngặt
- Đừng dùng viền trang trí -- viền là chức năng (input, dải phân cách) hoặc vắng mặt hoàn toàn
- Đừng làm mềm sự tương phản đen/trắng bằng off-white hay near-black -- sự đối lập là có chủ ý

## 8. Hành vi Responsive

### Breakpoint
| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Mobile Small | 320px | Bố cục tối thiểu, đơn cột, input xếp chồng, typography gọn |
| Mobile | 600px | Mobile tiêu chuẩn, bố cục xếp chồng, nav hamburger |
| Tablet Small | 768px | Lưới hai cột bắt đầu, bố cục thẻ mở rộng |
| Tablet | 1119px | Bố cục tablet đầy đủ, nội dung hero cạnh nhau |
| Desktop Small | 1120px | Lưới desktop kích hoạt, nav pill nằm ngang |
| Desktop | 1136px | Bố cục desktop đầy đủ, chiều rộng container tối đa, hero chia đôi |

### Vùng chạm
- Tất cả nút pill: chiều cao tối thiểu 44px (padding dọc 10-14px + line-height)
- Chip điều hướng: padding rộng rãi 14px 16px để ngón tay cái nhấn thoải mái
- Điều khiển tròn (menu, đóng): radius 50% đảm bảo vùng chạm lớn, dễ nhấn
- Bề mặt thẻ phục vụ như vùng chạm toàn diện trên mobile

### Chiến lược thu gọn
- **Điều hướng**: Nav pill nằm ngang thu gọn thành menu hamburger với toggle tròn
- **Hero**: Bố cục chia đôi (văn bản + bản đồ/hình ảnh) xếp thành một cột -- văn bản trên, hình ảnh dưới
- **Trường input**: Input pickup/destination cạnh nhau xếp dọc
- **Thẻ tính năng**: Lưới 2 cột thu gọn thành thẻ xếp chồng full-width
- **Tiêu đề**: Display 52px thu nhỏ qua 36px, 32px, 24px, 20px
- **Footer**: Lưới liên kết nhiều cột thu gọn thành accordion hoặc đơn cột xếp chồng
- **Category pill**: Cuộn ngang với overflow trên màn hình nhỏ hơn

### Hành vi hình ảnh
- Minh họa co giãn tỷ lệ trong container của chúng
- Hình hero duy trì tỷ lệ khung hình, có thể cắt xén trên màn hình nhỏ hơn
- Các phần mã QR ẩn trên mobile (tải ứng dụng chuyển sang liên kết store trực tiếp)
- Hình ảnh thẻ duy trì border radius 8-12px ở mọi kích thước

## 9. Hướng dẫn Agent Prompt

### Tham chiếu màu nhanh
- Primary Button: "Uber Black (#000000)"
- Page Background: "Pure White (#ffffff)"
- Button Text (trên đen): "Pure White (#ffffff)"
- Button Text (trên trắng): "Uber Black (#000000)"
- Secondary Text: "Body Gray (#4b4b4b)"
- Tertiary Text: "Muted Gray (#afafaf)"
- Chip Background: "Chip Gray (#efefef)"
- Hover State: "Hover Gray (#e2e2e2)"
- Card Shadow: "rgba(0,0,0,0.12) 0px 4px 16px"
- Footer Background: "Uber Black (#000000)"

### Ví dụ prompt component
- "Create a hero section on Pure White (#ffffff) with a headline at 52px UberMove Bold (700), line-height 1.23. Use Uber Black (#000000) text. Add a subtitle in Body Gray (#4b4b4b) at 16px UberMoveText weight 400 with 1.50 line-height. Place an Uber Black (#000000) pill CTA button with Pure White text, 999px radius, padding 10px 12px."
- "Design a category navigation bar with horizontal pill buttons. Each pill: Chip Gray (#efefef) background, Uber Black (#000000) text, 14px 16px padding, 999px border-radius. Active pill inverts to Uber Black background with Pure White text. Use UberMoveText at 14px weight 500."
- "Build a feature card on Pure White (#ffffff) with 8px border-radius and shadow rgba(0,0,0,0.12) 0px 4px 16px. Title in UberMove at 24px weight 700, description in Body Gray (#4b4b4b) at 16px UberMoveText. Add a black pill CTA button at the bottom."
- "Create a dark footer on Uber Black (#000000) with Pure White (#ffffff) heading text in UberMove at 20px weight 700. Footer links in Muted Gray (#afafaf) at 14px UberMoveText. Links hover to Pure White. Multi-column grid layout."
- "Design a floating action button with Pure White (#ffffff) background, 999px radius, 14px padding, and shadow rgba(0,0,0,0.16) 0px 2px 8px. Hover shifts background to #f3f3f3. Use for scroll-to-top or map controls."

### Hướng dẫn lặp lại
1. Tập trung vào MỘT component mỗi lần
2. Tham chiếu bảng màu đen/trắng nghiêm ngặt -- "dùng Uber Black (#000000)" không phải "làm tối nó"
3. Luôn chỉ định radius 999px cho nút và pill -- đây là không thể thương lượng cho nhận dạng Uber
4. Mô tả bộ phông chữ rõ ràng -- "UberMove Bold cho tiêu đề, UberMoveText Medium cho nhãn"
5. Cho bóng đổ, dùng "whisper shadow (rgba(0,0,0,0.12) 0px 4px 16px)" -- không bao giờ dùng drop shadow nặng
6. Giữ bố cục gọn và mật độ thông tin cao -- Uber là hiệu quả, không thoáng đãng
7. Minh họa nên ấm áp và mang tính con người -- mô tả "người được cách điệu trong tông ấm" không phải hình dạng trừu tượng
8. Ghép CTA đen với secondary trắng cho bố cục hành động kép cân bằng
