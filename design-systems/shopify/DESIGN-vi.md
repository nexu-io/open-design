# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ Shopify

> Category: Thương Mại Điện Tử & Bán Lẻ
> Nền tảng thương mại điện tử. Điện ảnh tối-trước, điểm nhấn xanh neon, kiểu chữ siêu mỏng.

## 1. Chủ Đề Hình Ảnh & Bầu Không Khí

Shopify.com là một rạp hát kỹ thuật số lấy tông tối làm chủ đạo — một trang web dàn dựng nền tảng thương mại của mình như một buổi ra mắt điện ảnh. Toàn bộ trải nghiệm diễn ra trên nền các bề mặt gần như đen, mang theo tiếng thì thầm nhẹ nhàng nhất của màu xanh rừng sâu (`#02090A`, `#061A1C`, `#102620`), tạo ra bầu không khí đêm tối cảm giác ít giống trang marketing SaaS hơn mà giống như một buổi ra mắt sản phẩm độc quyền tại một keynote công nghệ. Bóng tối này không lạnh lẽo hay mang tính doanh nghiệp — đó là bóng tối ấm áp, bao trùm của trải nghiệm xa xỉ, như ngồi ở hàng ghế đầu của một khán phòng tối.

Kiểu chữ là ngôi sao không thể phủ nhận. NeueHaasGrotesk — một hậu duệ tinh tế của Helvetica — xuất hiện ở tỷ lệ hoành tráng (96px) với trọng lượng cực kỳ nhẹ (330-400), tạo ra những tiêu đề trông như được khắc bằng ánh sáng hơn là in bằng mực. Tính năng OpenType `ss03` mang lại cho các chữ cái một đặc điểm độc đáo, tách biệt kiểu chữ của Shopify khỏi cách sử dụng Helvetica thông thường. Bên dưới lớp hiển thị, Inter Variable xử lý văn bản thân với độ chính xác phẫu thuật, sử dụng các trọng lượng biến số tương tự bất thường (420, 450, 550) tồn tại trong không gian giữa các điểm dừng trọng lượng truyền thống. Độ chính xác này cho thấy một công ty chú ý đến từng chi tiết.

Màu sắc được sử dụng với sự kiềm chế tột độ. Màu nhấn chính là Xanh Neon Shopify (`#36F4A4`) — một màu xanh bạc hà điện xuất hiện riêng trên các vòng focus và điểm nổi bật nhấn mạnh, đập như tín hiệu phát sáng sinh học trên nền tối. Các tông xanh mềm hơn (Aloe `#C1FBD4`, Pistachio `#D4F9E0`) cung cấp lớp rửa khí quyển. Trắng là màu chữ duy nhất quan trọng trên bề mặt tối, trong khi thang màu trung tính dựa trên kẽm (`#A1A1AA` đến `#3F3F46`) xử lý hệ thống phân cấp của thông tin lặng lẽ. Kết quả là một thiết kế khiến công nghệ thương mại có cảm giác như thuộc về một tương lai khoa học viễn tưởng.

**Đặc Điểm Chính:**
- Thiết kế tối-trước với tông màu xanh rừng-xanh ngọc sâu (không phải màu đen thuần)
- Kiểu chữ hiển thị siêu nhẹ (trọng lượng 330) ở tỷ lệ hoành tráng (96px) tạo sự hiện diện huyền diệu
- Xanh Neon (`#36F4A4`) là điểm nhấn năng lượng cao duy nhất trên nền tối
- Nút hình thuốc viên đầy đủ (bán kính 9999px) là hình dạng tương tác chính
- Bóng hộp nhiều lớp, nhiều giai đoạn tạo độ sâu như ảnh chụp
- Ảnh chụp màn hình sản phẩm được nhúng trong ngữ cảnh giao diện tối, khớp với bóng tối xung quanh
- Thang màu trung tính dựa trên kẽm cho hệ thống phân cấp chữ — cân bằng giữa ấm và lạnh

## 2. Bảng Màu & Vai Trò

### Màu Chính

- **Shopify Trắng** (`#FFFFFF`): Văn bản chính trên bề mặt tối, nền nút, các phần tử độ tương phản cao
- **Shopify Đen** (`#000000`): Nền body, văn bản nút trên trắng, cơ sở tương phản tối đa (--color-shade-100)

### Thứ Cấp & Nhấn

- **Xanh Neon** (`#36F4A4`): Màu nhấn đặc trưng — vòng focus, điểm nổi bật tương tác, chỉ báo trạng thái hoạt động. Điện và phát sáng sinh học
- **Aloe** (`#C1FBD4`): Lớp rửa xanh mềm cho nền trang trí, thẻ khí quyển (--color-aloe-10)
- **Pistachio** (`#D4F9E0`): Tông xanh nhạt nhất cho sự phân biệt bề mặt tinh tế (--color-pistachio-10)

### Bề Mặt & Nền

- **Khoảng Không** (`#000000`): Nền gốc trang — đen thực sự cho độ sâu tối đa
- **Xanh Ngọc Sâu** (`#02090A`): Bề mặt thẻ, hộp chứa nội dung — gần đen với tông xanh
- **Rừng Tối** (`#061A1C`): Nền phần với đặc điểm xanh rõ ràng
- **Rừng** (`#102620`): Bề mặt tối nâng cao, nền tiêu đề — tông tối ấm nhất
- **Viền Thẻ Tối** (`#1E2C31`): Viền thẻ trên bề mặt tối, định nghĩa ranh giới tinh tế

### Trung Tính & Văn Bản (Thang Kẽm)

- **Shade-30** (`#D4D4D8`): Trung tính nhạt nhất, viền gần như vô hình trên tối (--color-shade-30)
- **Văn Bản Nhẹ** (`#A1A1AA`): Văn bản phụ, metadata, mô tả — giọng nói lặng lẽ
- **Shade-50** (`#71717A`): Văn bản cấp ba, dấu thời gian, thông tin ít quan trọng nhất (--color-shade-50)
- **Shade-60** (`#52525B`): Văn bản bị vô hiệu hóa, trung tính trang trí (--color-shade-60)
- **Shade-70** (`#3F3F46`): Đường phân cách tinh tế, ranh giới giao diện gần như vô hình (--color-shade-70)
- **Viền Sáng** (`#E4E4E7`): Viền trên bề mặt sáng (hiếm — chỉ trong modal chế độ sáng)

### Ngữ Nghĩa & Nhấn

- **Link Nhẹ** (`#9797A2`): Văn bản liên kết nhẹ với trang trí gạch chân
- **Link Xanh Xám** (`#9DABAD`): Liên kết nhẹ có tông xanh ngọc
- **Link Tím Hoa Oải Hương** (`#BDBDCA`): Biến thể liên kết nhạt hơn
- **Link Bạc Hà** (`#99B3AD`): Biến thể liên kết có tông xanh cho các phần theo chủ đề

### Hệ Thống Gradient

- **Lớp Rửa Xanh Ngọc Tối**: Gradient hướng tâm từ trung tâm `#102620` đến cạnh `#02090A` — dùng sau các màn trình bày sản phẩm
- **Khí Quyển Xanh**: Gradient môi trường xanh nhẹ sau các phần hero, tạo độ sâu mà không cần màu rắn
- **Đèn Chiếu**: Vùng sáng tập trung mờ dần đến đen — tạo ánh sáng trình chiếu kiểu keynote

## 3. Quy Tắc Kiểu Chữ

### Họ Font

**Hiển Thị:** NeueHaasGrotesk (hậu duệ tinh tế của Helvetica, font biến số)
- Dự phòng: Helvetica, Arial, sans-serif
- Tính năng OpenType: `ss03` (bộ phong cách 3 — các thay thế letterform đặc biệt)
- Trọng lượng có sẵn: 330, 360, 400, 500, 750 (biến số)
- Dùng cho tất cả tiêu đề, văn bản hero và các phần tử hiển thị lớn

**Thân:** Inter-Variable
- Dự phòng: Helvetica, Arial, sans-serif
- Tính năng OpenType: `ss03`
- Trọng lượng có sẵn: 400, 420, 450, 500, 550 (biến số)
- Dùng cho văn bản thân, liên kết, nút, phần tử giao diện

**Mono:** ui-monospace
- Dự phòng: SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New
- Dùng cho đoạn mã, nhãn dữ liệu, nội dung kỹ thuật

### Phân Cấp

| Vai Trò | Kích Thước | Trọng Lượng | Chiều Cao Dòng | Khoảng Cách Chữ | Ghi Chú |
|------|------|--------|-------------|----------------|-------|
| Display XL | 96px | 400 | 1.00 | — | NeueHaasGrotesk, tiêu đề hero, "ss03" |
| Display XL Bold | 90.74px | 750 | 1.00 | 4.54px | NeueHaasGrotesk, hiển thị nhấn mạnh |
| Display XL Tracked | 96px | 400 | 1.00 | 2.4px | NeueHaasGrotesk, hiển thị có khoảng cách |
| Display Light | 96px | 330 | 0.96 | — | NeueHaasGrotesk, hiển thị huyền diệu |
| Heading 1 | 70px | 330 | 1.00 | — | NeueHaasGrotesk, tiêu đề phần |
| Heading 2 | 55px | 330 | 1.16 | — | NeueHaasGrotesk, tiểu mục |
| Heading 3 | 48px | 330 | 1.14 | — | NeueHaasGrotesk, tiêu đề tính năng |
| Heading 4 | 32px | 360 | 1.14 | 0.32px | NeueHaasGrotesk, tiêu đề thẻ |
| Heading 5 | 28px | 500 | 1.28 | 0.42px | NeueHaasGrotesk, tiêu đề nhỏ |
| Heading 6 | 24px | 400 | 1.14 | 0.36px | NeueHaasGrotesk, tiêu đề phụ |
| Body Large | 20px | 500 | 1.40 | 0.3px | NeueHaasGrotesk / Inter, đoạn mở đầu |
| Body | 18px | 400 | 1.56 | — | Inter-Variable, thân chuẩn |
| Body Medium | 18px | 550 | 1.56 | — | Inter-Variable, thân nhấn mạnh |
| Body Small | 16px | 400 | 1.50 | — | Inter / NeueHaasGrotesk, thân nhỏ gọn |
| Body Small Medium | 16px | 420 | 1.50 | — | Inter-Variable, nhấn mạnh nhẹ |
| Button | 16px | 400 | 1.50 | — | NeueHaasGrotesk, văn bản CTA |
| Nav Link | 18px | 500 | 1.25 | 0.72px | NeueHaasGrotesk, mục điều hướng |
| Caption | 14px | 500 | 1.49 | 0.28px | NeueHaasGrotesk / Inter, metadata |
| Caption Medium | 14px | 550 | 1.49 | 0.28px | Inter-Variable, chú thích nhấn mạnh |
| Overline | 15.36px | 400 | 1.50 | 1.54px | NeueHaasGrotesk, nhãn khoảng cách rộng |
| Micro | 13px | 500 | 1.50 | -0.13px | Inter, văn bản nhỏ khoảng cách chặt |
| Label | 12px | 400 | 1.20 | 0.72px | Inter, nhãn in hoa |
| Code | 16px | 400 | 1.50 | — | ui-monospace, in hoa, khối mã |
| Code Small | 12px | 400 | 1.33 | — | ui-monospace, in hoa, mã inline |

### Nguyên Tắc

Kiểu chữ của Shopify là bài học tuyệt vời về độ chính xác font biến số. Lớp hiển thị sống gần như hoàn toàn ở các trọng lượng 330-400 — văn bản nhẹ như lông chim trông như lơ lửng trên nền tối như ánh sáng chiếu. Đây là điều ngược lại với cách tiếp cận đậm, nặng mà hầu hết các trang SaaS theo: nơi những người khác hét to, Shopify thì thầm ở quy mô. Các tiêu đề 96px ở trọng lượng 330 tạo ra nghịch lý giữa kích thước khổng lồ và nét chữ mỏng manh khiến cảm giác vừa hoành tráng vừa mong manh. Tính năng OpenType `ss03` kích hoạt bộ phong cách cung cấp cho các ký tự cụ thể (có thể là 'a', 'g' và một số chữ số) diện mạo tinh tế hơn, phân biệt kiểu chữ của Shopify với cách sử dụng Helvetica Neue tiêu chuẩn. Inter Variable xử lý lớp thân với độ chính xác phẫu thuật, sử dụng các trọng lượng như 420 và 550 tồn tại giữa các điểm dừng truyền thống — mỗi đoạn văn bản có đúng trọng lượng hình ảnh cần thiết.

## 4. Kiểu Dáng Thành Phần

### Nút

**Chính (Nền Trắng)**
- Nền: Trắng (`#FFFFFF`)
- Văn bản: Đen (`#000000`)
- Viền: 2px solid trong suốt
- Bán kính viền: thuốc viên đầy đủ (9999px)
- Đệm: 12px 26px 12px 16px (bất đối xứng — đệm phải nhiều hơn để cân bằng thị giác)
- Hover: giảm độ mờ nhẹ hoặc thay đổi nền
- Focus: vòng viền `#36F4A4` (Xanh Neon) 2px
- Chuyển tiếp: all 200ms ease

**Thứ Cấp (Ghost/Có Viền)**
- Nền: trong suốt
- Văn bản: Trắng (`#FFFFFF`)
- Viền: 2px solid Trắng (`#FFFFFF`)
- Bán kính viền: thuốc viên đầy đủ (9999px)
- Đệm: 12px 26px 12px 16px
- Hover: nền trắng với văn bản đen
- Focus: viền `#36F4A4` 2px

**Badge/Tag (Trung Tính Có Nền)**
- Nền: `rgba(255, 255, 255, 0.2)` (kính mờ)
- Văn bản: Trắng (`#FFFFFF`)
- Viền: không có
- Bán kính viền: hơi bo tròn (4px)
- Đệm: 12px 16px
- Font: 16px regular

### Thẻ & Hộp Chứa

- Nền: Xanh Ngọc Sâu (`#02090A`) trên các trang tối
- Viền: 1px solid `#1E2C31` (Viền Thẻ Tối) — ranh giới gần như vô hình
- Bán kính viền: 8px cho thẻ chuẩn, 12px cho thẻ nổi bật, 20px 20px 0 0 cho thẻ bo tròn trên cùng
- Bóng: Hệ thống nhiều lớp:
  - Trạng thái nghỉ: `rgba(0,0,0,0.1) 0px 0px 0px 1px, rgba(0,0,0,0.1) 0px 2px 2px, rgba(0,0,0,0.1) 0px 4px 4px, rgba(0,0,0,0.1) 0px 8px 8px` + `rgba(255,255,255,0.03) 0px 1px 0px inset`
  - Điểm nổi bật trắng inset tạo ánh sáng cạnh trên tinh tế
- Hover: bóng mở rộng, thẻ có thể sáng lên nhẹ
- Chuyển tiếp: box-shadow 300ms ease, transform 200ms ease

### Ô Nhập & Biểu Mẫu

- Nền: trong suốt hoặc Rừng Tối (`#061A1C`)
- Văn bản: Trắng (`#FFFFFF`)
- Viền: 1px solid `#3F3F46` (Shade-70)
- Bán kính viền: 8px
- Đệm: 12px 16px
- Focus: 2px solid `#36F4A4` (vòng focus Xanh Neon)
- Placeholder: Shade-50 (`#71717A`)
- Chuyển tiếp: border-color 200ms ease

### Điều Hướng

- Nền: trong suốt (phủ trên hero tối), trở thành Rừng (`#102620`) khi cuộn
- Chiều cao: ~64px
- Trái: logo wordmark Shopify (SVG, trắng trên tối)
- Giữa/Phải: liên kết điều hướng 18px/500 NeueHaasGrotesk, trắng, letter-spacing 0.72px
- CTA: Nút thuốc viên trắng "Start for free" (phải)
- CTA Thứ Cấp: Nút ghost với viền trắng
- Hover: liên kết chuyển sang Văn Bản Nhẹ (`#A1A1AA`) hoặc thêm gạch chân
- Di động: menu hamburger, lớp phủ tối toàn màn hình
- Chuyển tiếp: background 300ms ease khi cuộn

### Xử Lý Hình Ảnh

- Ảnh chụp màn hình sản phẩm: nhúng trong ngữ cảnh giao diện tối, khớp với bóng tối xung quanh
- Xem trước giao diện quản trị: hiển thị trên nền tối với viền thẻ tinh tế
- Tỷ lệ khung hình: đa dạng — hình ảnh hero rộng (khoảng 16:9), ảnh tính năng linh hoạt
- Tất cả hình ảnh nằm sát trong hộp chứa tối — không có viền hoặc khung sáng
- Tải chậm với bề mặt placeholder tối

### Chỉ Số Tin Cậy

- Thống kê hiển thị nổi bật: "15+" (năm), "150M+" (người mua)
- Các con số ở quy mô hiển thị trong NeueHaasGrotesk
- Phần kêu gọi hệ sinh thái đối tác/nhà phát triển
- Lời chứng thực theo chủ đề tối tích hợp vào luồng trang

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách

Đơn vị cơ sở: 8px

| Token | Giá Trị | Sử Dụng |
|-------|-------|-----|
| space-1 | 4px | Khoảng cách inline chặt |
| space-2 | 8px | Đơn vị cơ sở, khoảng biểu tượng |
| space-3 | 12px | Đệm thẻ, lề chặt |
| space-4 | 16px | Đệm phần tử chuẩn |
| space-5 | 24px | Khoảng thẻ, đệm phần |
| space-6 | 28px | Khoảng cách phần trung bình |
| space-7 | 32px | Ngắt phần |
| space-8 | 36px | Đệm lớn |
| space-9 | 40px | Đệm phần chính |
| space-10 | 64px | Đệm phần hero, khoảng rộng |

### Lưới & Hộp Chứa

- Chiều rộng hộp chứa tối đa: ~1280px (căn giữa)
- Hero: toàn chiều rộng, nền tối từ cạnh đến cạnh với văn bản căn giữa
- Các phần tính năng: bố cục 2 cột với văn bản và ảnh chụp màn hình sản phẩm
- Các phần thống kê: bố cục ngang với số lớn
- Đệm ngang: 64px desktop, 32px tablet, 16px mobile
- Khoảng lưới: 24-32px giữa các khối nội dung chính

### Triết Lý Khoảng Trắng

Chiến lược khoảng trắng của Shopify mang tính sân khấu. Các phần được tách biệt bởi những khoảng rộng lớn của không gian tối — 80px đến 120px khoảng thở màu đen thuần — tạo nhịp điệu của một bài thuyết trình, không phải trang web. Mỗi khối nội dung là "slide" của riêng nó trong lần cuộn kiểu keynote. Trong các phần, khoảng cách chặt hơn và có chủ đích hơn, tạo mật độ tiêu điểm so với khoảng trống mở rộng. Sự tương phản giữa sự trống rỗng ở cấp độ vĩ mô và độ chính xác ở cấp độ vi mô tạo nên nhịp điệu điện ảnh của trang.

### Thang Bán Kính Viền

| Giá Trị | Ngữ Cảnh |
|-------|---------|
| 4px | Tag, badge, vi phần tử |
| 8px | Thẻ chuẩn, ô nhập, hộp video |
| 12px | Thẻ nổi bật, hộp hình ảnh, nút (không phải thuốc viên) |
| 20px | Thẻ bo tròn trên cùng (20px 20px 0 0), tiêu đề modal |
| 340px | Phần tử trang trí bo tròn lớn |
| 9999px | Nút thuốc viên, badge thuốc viên, phần tử điều hướng |

## 6. Độ Sâu & Độ Cao

| Cấp Độ | Xử Lý | Sử Dụng |
|-------|-----------|-----|
| Cơ Sở | Không bóng, bề mặt tối | Nền trang mặc định |
| Tinh Tế | `rgba(0,0,0,0.1) 0px 0px 0px 1px` + ánh sáng trắng inset | Thẻ trạng thái nghỉ |
| Trung Bình | Nhiều lớp: vòng 1px + 2px + 4px + 8px chồng bóng | Thẻ nâng cao, phần nổi bật |
| Cao | `rgba(0,0,0,0.25) 0px 25px 50px -12px` | Modal, dropdown, lớp phủ |
| Focus | `0px 0px 0px 2px #36F4A4` | Vòng focus bàn phím (Xanh Neon) |

Hệ thống bóng của Shopify phức tạp một cách bất thường. Thay vì bóng giá trị đơn, thẻ sử dụng phương pháp xếp chồng nhiều lớp: vòng 1px để định nghĩa ranh giới, độ mờ dần 2px/4px/8px cho sự giảm ánh sáng tự nhiên, và ánh sáng trắng inset tinh tế (`rgba(255,255,255,0.03)`) mô phỏng bề mặt kính được chiếu sáng từ trên. Trên nền tối, các bóng tối từ các bề mặt đã tối, nên các bóng hoạt động giống như "che khuất môi trường" hơn là độ cao truyền thống — thẻ trông như chìm nhẹ vào bề mặt thay vì nổi lên trên.

### Độ Sâu Trang Trí

- **Gradient xanh ngọc tối**: Lớp rửa hướng tâm xung quanh sau các phần hero và màn trình bày sản phẩm
- **Hiệu ứng đèn chiếu**: Khu vực sáng tập trung mờ dần đến đen, tạo ánh sáng sân khấu kiểu keynote
- **Ánh sáng cạnh**: Các cạnh màu sáng tinh tế trên thẻ tối qua box-shadow inset
- **Quầng sáng xanh khí quyển**: Tông xanh nhạt trong gradient nền, phản ánh màu nhấn thương hiệu

## 7. Nên Làm & Không Nên Làm

### Nên Làm

- Sử dụng hệ thống phân cấp bề mặt xanh ngọc-đen tối (Khoảng Không → Xanh Ngọc Sâu → Rừng Tối → Rừng) cho độ sâu
- Giữ kiểu chữ hiển thị ở trọng lượng 330-400 — sự nhẹ nhàng huyền diệu là chữ ký của thiết kế
- Sử dụng Xanh Neon (`#36F4A4`) riêng cho các trạng thái focus và điểm nổi bật nhấn quan trọng
- Áp dụng bán kính 9999px cho tất cả nút CTA chính — thuốc viên đầy đủ là không thể thương lượng
- Sử dụng hệ thống bóng nhiều lớp cho độ cao thẻ — bóng đơn trông phẳng
- Duy trì tính năng OpenType `ss03` trên tất cả văn bản — đó là một phần của bản sắc kiểu chữ
- Sử dụng Inter Variable cho văn bản thân và NeueHaasGrotesk cho tiêu đề — không bao giờ trộn vai trò của chúng
- Tạo khoảng cách sân khấu giữa các phần (80px+) cho nhịp điệu điện ảnh

### Không Nên Làm

- Không dùng màu đen thuần (#000000) cho văn bản trên nền tối — chỉ dùng trắng (#FFFFFF)
- Không đưa màu ấm (cam, đỏ, vàng) vào — bảng màu hoàn toàn lạnh (xanh lá, xanh ngọc, trung tính)
- Không dùng trọng lượng font trên 500 cho văn bản thân NeueHaasGrotesk — trọng lượng nặng phá vỡ cảm giác huyền diệu
- Không áp dụng màu nhấn xanh cho bề mặt lớn — Xanh Neon chỉ dành cho điểm nổi bật nhỏ, chính xác
- Không dùng góc nhọn (bán kính 0px) trên các phần tử tương tác — mọi thứ đều bo tròn
- Không thêm nền sáng — chủ đề tối là cơ bản, không phải tùy chọn
- Không dùng box-shadow một lớp — phương pháp xếp chồng là hệ thống
- Không đặt line-height trên 1.56 cho văn bản thân — văn bản của Shopify tương đối nhỏ gọn
- Không trộn NeueHaasGrotesk và Inter ở cùng kích thước/vai trò — thang trọng lượng của chúng khác nhau
- Không dùng letter-spacing dưới 0 cho tiêu đề — tiêu đề Shopify theo dõi trung tính hoặc dương

## 8. Hành Vi Responsive

### Điểm Ngắt

| Tên | Chiều Rộng | Thay Đổi Chính |
|------|-------|-------------|
| Mobile | <640px | Một cột, điều hướng hamburger, văn bản hiển thị thu về 48px, đệm 16px |
| Tablet | 640-1024px | Lưới 2 cột bắt đầu, văn bản hiển thị ở 70px, đệm 32px |
| Desktop | 1024-1440px | Bố cục đầy đủ, điều hướng mở rộng, hiển thị 96px, đệm 64px |
| Desktop Lớn | >1440px | Hộp chứa chiều rộng tối đa căn giữa, khoảng cách phần tăng |

### Vùng Chạm

- Vùng chạm tối thiểu: 44x44px (WCAG AAA)
- Nút thuốc viên: chiều cao tối thiểu 48px với đệm ngang rộng rãi
- Liên kết điều hướng: vùng chạm 44px
- Bề mặt thẻ: toàn bộ thẻ có thể chạm khi được liên kết

### Chiến Lược Thu Gọn

- **Điều hướng**: Liên kết ngang đầy đủ → menu hamburger dưới 1024px; logo và nút CTA vẫn hiển thị
- **Phần hero**: hiển thị 96px → 70px trên tablet → 48px trên mobile; duy trì căn giữa một cột
- **Phần tính năng**: văn bản+hình ảnh 2 cột → xếp chồng một cột dưới 768px
- **Thống kê**: Hàng ngang → dọc xếp chồng trên mobile
- **Đệm phần**: 64px → 40px → 24px → 16px khi viewport thu hẹp
- **Thẻ**: Lưới → xếp chồng, duy trì toàn chiều rộng trên mobile

### Hành Vi Hình Ảnh

- Ảnh chụp màn hình sản phẩm: responsive trong hộp chứa tối, duy trì tỷ lệ khung hình
- Hình ảnh hero: toàn chiều rộng trên tất cả điểm ngắt, tải chậm với placeholder tối
- Xem trước giao diện quản trị: thu nhỏ theo tỷ lệ, có thể cắt trên mobile
- Tất cả hình ảnh sử dụng CDN (`cdn.shopify.com`) với srcset responsive

## 9. Hướng Dẫn Prompt Cho Tác Nhân

### Tham Chiếu Màu Nhanh

- CTA chính: Shopify Trắng (`#FFFFFF`)
- Nền trang: Đen Khoảng Không (`#000000`)
- Bề mặt thẻ: Xanh Ngọc Sâu (`#02090A`)
- Nền phần: Rừng Tối (`#061A1C`)
- Nền nâng cao: Rừng (`#102620`)
- Màu nhấn: Xanh Neon (`#36F4A4`)
- Văn bản thân: Trắng (`#FFFFFF`)
- Văn bản nhẹ: Nhẹ (`#A1A1AA`)
- Viền tối: Viền Thẻ Tối (`#1E2C31`)

### Ví Dụ Prompt Thành Phần

- "Tạo phần hero trên nền đen thực (#000000) với tiêu đề NeueHaasGrotesk 96px/330 màu trắng, phụ đề 20px/500 màu #A1A1AA và hai nút thuốc viên: nền trắng (bán kính 9999px) và ghost với viền trắng 2px"
- "Thiết kế thẻ tính năng trên Xanh Ngọc Sâu (#02090A) với viền 1px #1E2C31, bán kính 12px, bóng nhiều lớp (vòng 1px + độ mờ 2px/4px/8px ở 10% đen), chứa tiêu đề trắng 32px/360 và văn bản thân #A1A1AA 18px/400"
- "Xây dựng phần thống kê trên Rừng Tối (#061A1C) với số trắng 96px/750 (NeueHaasGrotesk), nhãn mô tả #A1A1AA 16px/400 và khoảng cách rộng rãi 64px giữa các khối thống kê"
- "Tạo điều hướng cố định với nền trong suốt (trở thành #102620 khi cuộn), logo Shopify trắng bên trái, liên kết điều hướng trắng 18px/500 với letter-spacing 0.72px và nút thuốc viên trắng 'Start for free' bên phải"
- "Thiết kế tag/badge với nền kính mờ rgba(255,255,255,0.2), bán kính 4px, đệm 12px 16px, văn bản trắng 16px — nổi trên bề mặt thẻ tối"

### Hướng Dẫn Lặp Lại

Khi tinh chỉnh các màn hình hiện có được tạo bằng hệ thống thiết kế này:
1. Tập trung vào MỘT thành phần tại một thời điểm
2. Tham chiếu tên màu cụ thể và mã hex từ tài liệu này
3. Nhớ rằng: đây là thiết kế TỐI-TRƯỚC — bề mặt sáng là ngoại lệ, không phải quy tắc
4. Văn bản hiển thị phải luôn cảm giác nhẹ như lông chim (trọng lượng 330-400) — nếu trông nặng, giảm trọng lượng
5. Xanh Neon (#36F4A4) quý giá — dùng tiết kiệm chỉ cho focus và màu nhấn
6. Hệ thống phân cấp bề mặt tối (đen → xanh ngọc sâu → rừng tối → rừng) tạo độ sâu tinh tế
7. Các bóng có nhiều lớp — một giá trị `box-shadow` đơn sẽ không nắm bắt được cảm giác thẻ Shopify
8. Tính năng OpenType `ss03` phải hoạt động trên tất cả văn bản để nhất quán kiểu chữ
