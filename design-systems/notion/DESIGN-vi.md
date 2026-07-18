# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ Notion

> Category: Năng suất và SaaS
> Không gian làm việc tất cả trong một. Chủ nghĩa tối giản ấm áp, tiêu đề có chân (serif), bề mặt mềm mại.

## 1. Chủ Đề Hình Ảnh & Bầu Không Khí

Trang web của Notion hiện thân triết lý của chính công cụ đó: một tờ giấy trắng không cản trở công việc của bạn. Hệ thống thiết kế được xây dựng trên các tông màu trung tính ấm thay vì xám lạnh, tạo ra chủ nghĩa tối giản thân thiện đặc trưng — gợi lên cảm giác của giấy chất lượng hơn là kính vô trùng. Nền trang là trắng tinh khiết (`#ffffff`) nhưng văn bản không phải đen thuần túy — đó là màu đen ấm gần thuần (`rgba(0,0,0,0.95)`) giúp trải nghiệm đọc mượt mà hơn một cách khó nhận ra. Dải màu xám ấm (`#f6f5f4`, `#31302e`, `#615d59`, `#a39e98`) mang sắc vàng-nâu tinh tế, tạo cho giao diện sự ấm áp xúc giác, gần như là cảm giác analog.

Font chữ tùy chỉnh NotionInter (phiên bản Inter được chỉnh sửa) là xương sống của hệ thống. Ở kích cỡ hiển thị (64px), font sử dụng khoảng cách chữ âm mạnh (-2.125px), tạo ra các tiêu đề cảm giác nén chặt và chính xác. Phạm vi trọng lượng rộng hơn các hệ thống thông thường: 400 cho thân văn bản, 500 cho các phần tử giao diện, 600 cho nhãn semi-đậm và 700 cho tiêu đề hiển thị. Các tính năng OpenType `"lnum"` (số thẳng hàng) và `"locl"` (dạng bản địa hóa) được bật trên văn bản lớn hơn, bổ sung sự tinh tế về mặt typo học phần thưởng cho người đọc kỹ.

Điều làm nên sự khác biệt trong ngôn ngữ hình ảnh của Notion là triết lý về đường viền. Thay vì đường viền dày hay bóng đổ, Notion dùng đường viền cực mỏng `1px solid rgba(0,0,0,0.1)` — những đường viền tồn tại như những tiếng thì thầm, đường phân chia hầu như không nhận ra, tạo ra cấu trúc mà không có trọng lượng. Hệ thống bóng đổ cũng tiết chế tương đương: các lớp chồng nhau với độ mờ tích lũy không bao giờ vượt quá 0.05, tạo ra chiều sâu cảm nhận được hơn là nhìn thấy được.

**Key Characteristics:**
- NotionInter (Inter được chỉnh sửa) với khoảng cách chữ âm ở kích cỡ hiển thị (-2.125px ở 64px)
- Bảng màu trung tính ấm: xám mang sắc vàng-nâu (`#f6f5f4` trắng ấm, `#31302e` tối ấm)
- Văn bản gần đen qua `rgba(0,0,0,0.95)` — không phải đen thuần, tạo vi-nhiệt
- Đường viền cực mỏng: `1px solid rgba(0,0,0,0.1)` xuyên suốt — phân chia nhẹ như tiếng thì thầm
- Lớp bóng đổ nhiều tầng với độ mờ dưới 0.05 cho chiều sâu hầu như vô hình
- Xanh Notion (`#0075de`) là màu nhấn duy nhất cho CTA và các phần tử tương tác
- Badge hình viên thuốc (bán kính 9999px) với nền xanh nhạt cho các chỉ báo trạng thái
- Đơn vị khoảng cách cơ sở 8px với thang hữu cơ, không cứng nhắc

## 2. Bảng Màu & Vai Trò

### Chính
- **Đen Notion** (`rgba(0,0,0,0.95)` / `#000000f2`): Văn bản chính, tiêu đề, nội dung thân. Độ mờ 95% làm mềm đen thuần mà không hy sinh khả năng đọc.
- **Trắng thuần** (`#ffffff`): Nền trang, bề mặt thẻ, văn bản nút trên nền xanh.
- **Xanh Notion** (`#0075de`): CTA chính, màu liên kết, điểm nhấn tương tác — màu bão hòa duy nhất trong giao diện chính.

### Thương Hiệu Phụ
- **Xanh hải quân đậm** (`#213183`): Màu thương hiệu phụ, dùng tiết kiệm cho nhấn mạnh và các phần tối của tính năng.
- **Xanh hoạt động** (`#005bab`): Trạng thái nhấn/kích hoạt của nút — biến thể tối hơn của Xanh Notion.

### Thang Trung Tính Ấm
- **Trắng ấm** (`#f6f5f4`): Tông bề mặt nền, luân phiên phần, tô màu thẻ tinh tế. Sắc vàng là chìa khóa.
- **Tối ấm** (`#31302e`): Nền bề mặt tối, văn bản trong các phần tối. Ấm hơn xám tiêu chuẩn.
- **Xám ấm 500** (`#615d59`): Văn bản phụ, mô tả, nhãn mờ.
- **Xám ấm 300** (`#a39e98`): Văn bản giữ chỗ, trạng thái vô hiệu hóa, văn bản chú thích.

### Màu Nhấn Ngữ Nghĩa
- **Xanh mòng két** (`#2a9d99`): Trạng thái thành công, chỉ báo tích cực.
- **Xanh lá** (`#1aae39`): Xác nhận, badge hoàn thành.
- **Cam** (`#dd5b00`): Trạng thái cảnh báo, chỉ báo chú ý.
- **Hồng** (`#ff64c8`): Nhấn trang trí, nổi bật tính năng.
- **Tím** (`#391c57`): Tính năng cao cấp, nhấn sâu.
- **Nâu** (`#523410`): Nhấn mộc mạc, các phần tính năng ấm áp.

### Tương Tác
- **Xanh liên kết** (`#0075de`): Màu liên kết chính với gạch chân khi hover.
- **Xanh liên kết nhạt** (`#62aef0`): Biến thể liên kết nhạt hơn cho nền tối.
- **Xanh tiêu điểm** (`#097fe8`): Vòng tiêu điểm trên các phần tử tương tác.
- **Nền badge xanh** (`#f2f9ff`): Nền badge viên thuốc, bề mặt xanh nhạt.
- **Văn bản badge xanh** (`#097fe8`): Văn bản badge viên thuốc, xanh tối hơn để dễ đọc.

### Bóng Đổ & Chiều Sâu
- **Bóng thẻ** (`rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`): Độ nâng thẻ nhiều lớp.
- **Bóng sâu** (`rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`): Độ nâng sâu năm lớp cho modal và nội dung nổi bật.
- **Đường viền thì thầm** (`1px solid rgba(0,0,0,0.1)`): Đường phân chia tiêu chuẩn — thẻ, ngăn cách, phần.

## 3. Quy Tắc Kiểu Chữ

### Họ Phông
- **Chính**: `NotionInter`, với dự phòng: `Inter, -apple-system, system-ui, Segoe UI, Helvetica, Apple Color Emoji, Arial, Segoe UI Emoji, Segoe UI Symbol`
- **Tính năng OpenType**: `"lnum"` (số thẳng hàng) và `"locl"` (dạng bản địa hóa) bật trên văn bản hiển thị và tiêu đề.

### Phân Cấp

| Vai trò | Phông | Cỡ | Trọng lượng | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Hiển thị Chính | NotionInter | 64px (4.00rem) | 700 | 1.00 (chặt) | -2.125px | Nén tối đa, tiêu đề bảng quảng cáo |
| Hiển thị Phụ | NotionInter | 54px (3.38rem) | 700 | 1.04 (chặt) | -1.875px | Hero phụ, tiêu đề tính năng |
| Tiêu Đề Phần | NotionInter | 48px (3.00rem) | 700 | 1.00 (chặt) | -1.5px | Tiêu đề phần tính năng, với `"lnum"` |
| Phụ Đề Lớn | NotionInter | 40px (2.50rem) | 700 | 1.50 | normal | Tiêu đề thẻ, phần phụ tính năng |
| Phụ Đề | NotionInter | 26px (1.63rem) | 700 | 1.23 (chặt) | -0.625px | Phụ tiêu đề phần, đầu nội dung |
| Tiêu Đề Thẻ | NotionInter | 22px (1.38rem) | 700 | 1.27 (chặt) | -0.25px | Thẻ tính năng, tiêu đề danh sách |
| Thân Lớn | NotionInter | 20px (1.25rem) | 600 | 1.40 | -0.125px | Giới thiệu, mô tả tính năng |
| Thân | NotionInter | 16px (1.00rem) | 400 | 1.50 | normal | Văn bản đọc tiêu chuẩn |
| Thân Vừa | NotionInter | 16px (1.00rem) | 500 | 1.50 | normal | Điều hướng, văn bản giao diện nhấn mạnh |
| Thân Bán Đậm | NotionInter | 16px (1.00rem) | 600 | 1.50 | normal | Nhãn nổi bật, trạng thái hoạt động |
| Thân Đậm | NotionInter | 16px (1.00rem) | 700 | 1.50 | normal | Tiêu đề ở kích cỡ thân |
| Nav / Nút | NotionInter | 15px (0.94rem) | 600 | 1.33 | normal | Liên kết điều hướng, văn bản nút |
| Chú Thích | NotionInter | 14px (0.88rem) | 500 | 1.43 | normal | Siêu dữ liệu, nhãn phụ |
| Chú Thích Nhẹ | NotionInter | 14px (0.88rem) | 400 | 1.43 | normal | Chú thích thân, mô tả |
| Badge | NotionInter | 12px (0.75rem) | 600 | 1.33 | 0.125px | Badge viên thuốc, tag, nhãn trạng thái |
| Vi Nhãn | NotionInter | 12px (0.75rem) | 400 | 1.33 | 0.125px | Siêu dữ liệu nhỏ, dấu thời gian |

### Nguyên Tắc
- **Nén theo tỷ lệ**: NotionInter ở kích cỡ hiển thị dùng -2.125px khoảng cách chữ ở 64px, dần dần nới lỏng đến -0.625px ở 26px và bình thường ở 16px. Sự nén tạo ra mật độ ở tiêu đề trong khi duy trì khả năng đọc ở kích cỡ thân.
- **Hệ thống bốn trọng lượng**: 400 (thân/đọc), 500 (giao diện/tương tác), 600 (nhấn mạnh/điều hướng), 700 (tiêu đề/hiển thị). Phạm vi trọng lượng rộng hơn so với hầu hết các hệ thống cho phép phân cấp tinh tế.
- **Thang ấm**: Chiều cao dòng thu hẹp khi kích cỡ tăng — 1.50 ở thân (16px), 1.23-1.27 ở phụ đề, 1.00-1.04 ở hiển thị. Điều này tạo ra tiêu đề dày đặc và có tác động hơn.
- **Theo dõi vi cỡ badge**: Văn bản badge 12px dùng khoảng cách chữ dương (0.125px) — theo dõi dương duy nhất trong hệ thống, tạo ra văn bản nhỏ rộng hơn và dễ đọc hơn.

## 4. Kiểu Dáng Thành Phần

### Nút

**Xanh Chính**
- Nền: `#0075de` (Xanh Notion)
- Văn bản: `#ffffff`
- Padding: 8px 16px
- Bán kính: 4px (tinh tế)
- Đường viền: `1px solid transparent`
- Hover: nền tối hơn thành `#005bab`
- Hoạt động: biến đổi scale(0.9)
- Tiêu điểm: viền `2px solid`, bóng `var(--shadow-level-200)`
- Dùng cho: CTA chính ("Dùng thử Notion miễn phí", "Bắt đầu")

**Phụ / Cấp Ba**
- Nền: `rgba(0,0,0,0.05)` (xám ấm trong suốt)
- Văn bản: `#000000` (gần đen)
- Padding: 8px 16px
- Bán kính: 4px
- Hover: màu văn bản thay đổi, scale(1.05)
- Hoạt động: biến đổi scale(0.9)
- Dùng cho: Hành động phụ, gửi biểu mẫu

**Ghost / Nút Liên Kết**
- Nền: trong suốt
- Văn bản: `rgba(0,0,0,0.95)`
- Trang trí: gạch chân khi hover
- Dùng cho: Hành động cấp ba, liên kết nội tuyến

**Nút Badge Viên Thuốc**
- Nền: `#f2f9ff` (xanh nhạt)
- Văn bản: `#097fe8`
- Padding: 4px 8px
- Bán kính: 9999px (viên thuốc đầy đủ)
- Phông: 12px trọng lượng 600
- Dùng cho: Badge trạng thái, nhãn tính năng, tag "Mới"

### Thẻ & Vùng Chứa
- Nền: `#ffffff`
- Đường viền: `1px solid rgba(0,0,0,0.1)` (đường viền thì thầm)
- Bán kính: 12px (thẻ tiêu chuẩn), 16px (thẻ nổi bật/hero)
- Bóng: `rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.84688px, rgba(0,0,0,0.02) 0px 0.8px 2.925px, rgba(0,0,0,0.01) 0px 0.175px 1.04062px`
- Hover: tăng cường bóng đổ tinh tế
- Thẻ hình ảnh: bán kính trên 12px, hình ảnh lấp đầy nửa trên

### Đầu Vào & Biểu Mẫu
- Nền: `#ffffff`
- Văn bản: `rgba(0,0,0,0.9)`
- Đường viền: `1px solid #dddddd`
- Padding: 6px
- Bán kính: 4px
- Tiêu điểm: vòng viền xanh
- Giữ chỗ: xám ấm `#a39e98`

### Điều Hướng
- Nav ngang sạch sẽ trên nền trắng, không cố định
- Logo thương hiệu căn trái (biểu tượng 33x34px + wordmark)
- Liên kết: NotionInter 15px trọng lượng 500-600, văn bản gần đen
- Hover: chuyển màu sang `var(--color-link-primary-text-hover)`
- CTA: nút viên thuốc xanh ("Dùng thử Notion miễn phí") căn phải
- Di động: menu thu gọn với biểu tượng hamburger
- Menu thả xuống sản phẩm với menu phân loại nhiều cấp

### Xử Lý Hình Ảnh
- Ảnh chụp màn hình sản phẩm với viền `1px solid rgba(0,0,0,0.1)`
- Hình ảnh với góc trên bo tròn: bán kính `12px 12px 0px 0px`
- Ảnh chụp màn hình bảng điều khiển/không gian làm việc chiếm ưu thế trong các phần tính năng
- Nền gradient ấm phía sau các hình minh họa hero (hình minh họa nhân vật trang trí)

### Thành Phần Đặc Biệt

**Thẻ Tính Năng Với Hình Minh Họa**
- Đầu trang minh họa lớn (La Sóng Lớn, ảnh chụp màn hình giao diện sản phẩm)
- Thẻ bán kính 12px với đường viền thì thầm
- Tiêu đề 22px trọng lượng 700, mô tả 16px trọng lượng 400
- Biến thể nền trắng ấm (`#f6f5f4`) cho các phần luân phiên

**Thanh Tin Tưởng / Lưới Logo**
- Logo công ty (phần đội ngũ tin tưởng) theo màu thương hiệu của họ
- Bố cục cuộn ngang hoặc lưới với số lượng đội
- Hiển thị số liệu: số lớn + mẫu mô tả

**Thẻ Số Liệu**
- Hiển thị số lớn (ví dụ: "$4.200 ROI")
- NotionInter 40px+ trọng lượng 700 cho số liệu
- Mô tả bên dưới bằng văn bản thân xám ấm
- Vùng chứa thẻ với đường viền thì thầm

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách
- Đơn vị cơ sở: 8px
- Thang: 2px, 3px, 4px, 5px, 6px, 7px, 8px, 11px, 12px, 14px, 16px, 24px, 32px
- Thang hữu cơ không cứng nhắc với các giá trị phân số (5.6px, 6.4px) cho điều chỉnh vi

### Lưới & Vùng Chứa
- Chiều rộng nội dung tối đa: khoảng 1200px
- Hero: cột đơn căn giữa với padding trên rộng rãi (80-120px)
- Phần tính năng: lưới 2-3 cột cho thẻ
- Nền phần toàn chiều rộng màu trắng ấm (`#f6f5f4`) cho luân phiên
- Ảnh chụp màn hình code/bảng điều khiển được chứa với đường viền thì thầm

### Triết Lý Khoảng Trắng
- **Nhịp dọc rộng rãi**: 64-120px giữa các phần chính. Notion để nội dung thở với padding dọc rộng lớn.
- **Luân phiên ấm áp**: Các phần trắng xen kẽ với các phần trắng ấm (`#f6f5f4`), tạo ra nhịp điệu hình ảnh nhẹ nhàng không có những thay đổi màu đột ngột.
- **Mật độ ưu tiên nội dung**: Các khối văn bản thân gọn gàng (chiều cao dòng 1.50) nhưng được bao quanh bởi lề rộng, tạo ra những đảo nội dung dễ đọc trong biển khoảng trắng.

### Thang Bán Kính Đường Viền
- Vi (4px): Nút, đầu vào, phần tử tương tác chức năng
- Tinh tế (5px): Liên kết, mục danh sách, mục menu
- Tiêu chuẩn (8px): Thẻ nhỏ, vùng chứa, phần tử nội tuyến
- Thoải mái (12px): Thẻ tiêu chuẩn, vùng chứa tính năng, đầu hình ảnh
- Lớn (16px): Thẻ hero, nội dung nổi bật, khối quảng cáo
- Viên thuốc đầy đủ (9999px): Badge, viên thuốc, chỉ báo trạng thái
- Vòng tròn (100%): Chỉ báo tab, avatar

## 6. Chiều Sâu & Độ Nâng

| Cấp | Xử lý | Dùng cho |
|-------|-----------|-----|
| Phẳng (Cấp 0) | Không bóng, không viền | Nền trang, khối văn bản |
| Thì thầm (Cấp 1) | `1px solid rgba(0,0,0,0.1)` | Đường viền tiêu chuẩn, viền thẻ, ngăn cách |
| Thẻ Mềm (Cấp 2) | Lớp bóng 4 tầng (độ mờ tối đa 0.04) | Thẻ nội dung, khối tính năng |
| Thẻ Sâu (Cấp 3) | Lớp bóng 5 tầng (độ mờ tối đa 0.05, mờ 52px) | Modal, bảng nổi bật, phần tử hero |
| Tiêu Điểm (Khả Năng Tiếp Cận) | Viền `2px solid var(--focus-color)` | Tiêu điểm bàn phím trên tất cả phần tử tương tác |

**Triết Lý Bóng Đổ**: Hệ thống bóng đổ của Notion dùng nhiều lớp với độ mờ riêng lẻ cực thấp (0.01 đến 0.05) tích lũy thành độ nâng mượt mà, trông tự nhiên. Bóng thẻ 4 lớp trải dài từ 1.04px đến 18px mờ, tạo ra độ dốc chiều sâu thay vì bóng cứng đơn lẻ. Bóng sâu 5 lớp kéo dài đến 52px mờ ở độ mờ 0.05, tạo ra che khuất môi trường xung quanh cảm giác như ánh sáng tự nhiên thay vì chiều sâu do máy tính tạo ra. Cách tiếp cận theo lớp này làm cho các phần tử có vẻ được nhúng vào trang thay vì nổi trên đó.

### Chiều Sâu Trang Trí
- Phần hero: hình minh họa nhân vật trang trí (phong cách vui tươi, vẽ tay)
- Luân phiên phần: chuyển nền từ trắng sang trắng ấm (`#f6f5f4`)
- Không có viền phần cứng — sự phân cách đến từ thay đổi màu nền và khoảng cách

## 7. Hành Vi Đáp Ứng

### Điểm Ngắt
| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Di động Nhỏ | <400px | Cột đơn chặt chẽ, padding tối thiểu |
| Di động | 400-600px | Di động tiêu chuẩn, bố cục xếp chồng |
| Máy tính bảng Nhỏ | 600-768px | Lưới 2 cột bắt đầu |
| Máy tính bảng | 768-1080px | Lưới thẻ đầy đủ, padding mở rộng |
| Máy tính để bàn Nhỏ | 1080-1200px | Bố cục máy tính để bàn tiêu chuẩn |
| Máy tính để bàn | 1200-1440px | Bố cục đầy đủ, chiều rộng nội dung tối đa |
| Máy tính để bàn Lớn | >1440px | Căn giữa, lề rộng rãi |

### Vùng Chạm
- Nút dùng padding thoải mái (8px-16px dọc)
- Liên kết điều hướng ở 15px với khoảng cách đầy đủ
- Badge viên thuốc có 8px padding ngang cho vùng chạm
- Nút chuyển đổi menu di động dùng nút hamburger tiêu chuẩn

### Chiến Lược Thu Gọn
- Hero: hiển thị 64px -> thu nhỏ xuống 40px -> 26px trên di động, duy trì khoảng cách chữ tỷ lệ
- Điều hướng: liên kết ngang + CTA xanh -> menu hamburger
- Thẻ tính năng: 3 cột -> 2 cột -> cột đơn xếp chồng
- Ảnh chụp màn hình sản phẩm: duy trì tỷ lệ khung hình với hình ảnh đáp ứng
- Logo thanh tin tưởng: lưới -> cuộn ngang trên di động
- Chân trang: nhiều cột -> cột đơn xếp chồng
- Khoảng cách phần: 80px+ -> 48px trên di động

### Hành Vi Hình Ảnh
- Ảnh chụp màn hình không gian làm việc duy trì đường viền thì thầm ở mọi kích cỡ
- Hình minh họa hero thu nhỏ theo tỷ lệ
- Ảnh chụp màn hình sản phẩm dùng hình ảnh đáp ứng với bán kính đường viền nhất quán
- Các phần trắng ấm toàn chiều rộng duy trì xử lý từ cạnh đến cạnh

## 8. Khả Năng Tiếp Cận & Trạng Thái

### Hệ Thống Tiêu Điểm
- Tất cả phần tử tương tác nhận chỉ báo tiêu điểm hiển thị
- Viền tiêu điểm: `2px solid` với màu tiêu điểm + cấp bóng 200
- Điều hướng bàn phím được hỗ trợ trong tất cả thành phần tương tác
- Văn bản độ tương phản cao: gần đen trên trắng vượt WCAG AAA (tỷ lệ >14:1)

### Trạng Thái Tương Tác
- **Mặc định**: Giao diện tiêu chuẩn với đường viền thì thầm
- **Hover**: Thay đổi màu trên văn bản, scale(1.05) trên nút, gạch chân trên liên kết
- **Hoạt động/Nhấn**: Biến đổi scale(0.9), biến thể nền tối hơn
- **Tiêu điểm**: Vòng viền xanh với tăng cường bóng đổ
- **Vô hiệu hóa**: Văn bản xám ấm (`#a39e98`), độ mờ giảm

### Độ Tương Phản Màu
- Văn bản chính (rgba(0,0,0,0.95)) trên trắng: tỷ lệ ~18:1
- Văn bản phụ (#615d59) trên trắng: tỷ lệ ~5.5:1 (WCAG AA)
- CTA xanh (#0075de) trên trắng: tỷ lệ ~4.6:1 (WCAG AA cho văn bản lớn)
- Văn bản badge (#097fe8) trên nền badge (#f2f9ff): tỷ lệ ~4.5:1 (WCAG AA cho văn bản lớn)

## 9. Hướng Dẫn Prompt Cho Tác Nhân

### Tham Chiếu Màu Nhanh
- CTA chính: Xanh Notion (`#0075de`)
- Nền: Trắng thuần (`#ffffff`)
- Nền thay thế: Trắng ấm (`#f6f5f4`)
- Văn bản tiêu đề: Gần đen (`rgba(0,0,0,0.95)`)
- Văn bản thân: Gần đen (`rgba(0,0,0,0.95)`)
- Văn bản phụ: Xám ấm 500 (`#615d59`)
- Văn bản mờ: Xám ấm 300 (`#a39e98`)
- Đường viền: `1px solid rgba(0,0,0,0.1)`
- Liên kết: Xanh Notion (`#0075de`)
- Vòng tiêu điểm: Xanh tiêu điểm (`#097fe8`)

### Ví Dụ Prompt Thành Phần
- "Tạo phần hero trên nền trắng. Tiêu đề 64px NotionInter trọng lượng 700, line-height 1.00, letter-spacing -2.125px, color rgba(0,0,0,0.95). Phụ đề 20px trọng lượng 600, line-height 1.40, color #615d59. Nút CTA xanh (#0075de, bán kính 4px, padding 8px 16px, văn bản trắng) và nút ghost (nền trong suốt, văn bản gần đen, gạch chân khi hover)."
- "Thiết kế thẻ: nền trắng, viền 1px solid rgba(0,0,0,0.1), bán kính 12px. Dùng lớp bóng: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px. Tiêu đề 22px NotionInter trọng lượng 700, letter-spacing -0.25px. Thân 16px trọng lượng 400, color #615d59."
- "Xây dựng badge viên thuốc: nền #f2f9ff, văn bản #097fe8, bán kính 9999px, padding 4px 8px, 12px NotionInter trọng lượng 600, letter-spacing 0.125px."
- "Tạo điều hướng: tiêu đề trắng. NotionInter 15px trọng lượng 600 cho liên kết, văn bản gần đen. CTA viên thuốc xanh 'Dùng thử Notion miễn phí' căn phải (nền #0075de, văn bản trắng, bán kính 4px)."
- "Thiết kế bố cục phần luân phiên: các phần trắng xen kẽ với phần trắng ấm (#f6f5f4). Mỗi phần có 64-80px padding dọc, max-width 1200px căn giữa. Tiêu đề phần 48px trọng lượng 700, line-height 1.00, letter-spacing -1.5px."

### Hướng Dẫn Lặp
1. Luôn dùng trung tính ấm — xám của Notion có sắc vàng-nâu (#f6f5f4, #31302e, #615d59, #a39e98), không bao giờ xám-xanh
2. Khoảng cách chữ thu nhỏ theo kích cỡ phông: -2.125px ở 64px, -1.875px ở 54px, -0.625px ở 26px, bình thường ở 16px
3. Bốn trọng lượng: 400 (đọc), 500 (tương tác), 600 (nhấn mạnh), 700 (công bố)
4. Đường viền là tiếng thì thầm: 1px solid rgba(0,0,0,0.1) — không bao giờ nặng hơn
5. Bóng dùng 4-5 lớp với độ mờ riêng lẻ không bao giờ vượt quá 0.05
6. Nền phần trắng ấm (#f6f5f4) thiết yếu cho nhịp điệu hình ảnh
7. Badge viên thuốc (9999px) cho trạng thái/tag, bán kính 4px cho nút và đầu vào
8. Xanh Notion (#0075de) là màu bão hòa duy nhất trong giao diện chính — dùng tiết kiệm cho CTA và liên kết
