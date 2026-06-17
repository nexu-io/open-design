# Design System Inspired by Vercel

> Category: Công cụ dành cho nhà phát triển
> Triển khai frontend. Độ chính xác đen trắng, font Geist.

## 1. Chủ đề Hình ảnh & Bầu không khí

Trang web của Vercel là luận đề thị giác về hạ tầng dành cho nhà phát triển được làm trở nên vô hình — một hệ thống thiết kế kiềm chế đến mức gần như mang tính triết học. Trang có nền trắng chiếm ưu thế (`#ffffff`) với văn bản gần đen (`#171717`), tạo nên sự trống rỗng như trong phòng trưng bày, nơi mỗi yếu tố phải tự chứng minh giá trị từng pixel. Đây không phải là chủ nghĩa tối giản như một phong cách trang trí; đây là chủ nghĩa tối giản như một nguyên tắc kỹ thuật. Hệ thống thiết kế Geist đối xử với giao diện giống như trình biên dịch đối xử với mã — mọi token không cần thiết đều bị loại bỏ cho đến khi chỉ còn lại cấu trúc.

Họ font Geist tùy chỉnh là viên ngọc quý nhất. Geist Sans sử dụng khoảng cách chữ âm cực kỳ mạnh (-2.4px đến -2.88px ở kích thước hiển thị), tạo ra các tiêu đề cảm giác nén chặt, cấp bách và được thiết kế tinh xảo — như mã đã được thu gọn cho môi trường sản xuất. Ở kích thước thân bài, khoảng cách chữ được nới lỏng nhưng độ chính xác hình học vẫn duy trì. Geist Mono hoàn thiện hệ thống như người bạn đồng hành monospace dành cho mã, đầu ra terminal và nhãn kỹ thuật. Cả hai font đều bật `"liga"` OpenType (chữ ghép) trên toàn cục, thêm vào một lớp tinh tế về mặt typography khi đọc kỹ.

Điều phân biệt Vercel với các hệ thống thiết kế đơn sắc khác là triết lý bóng-thay-viền. Thay vì các viền CSS truyền thống, Vercel sử dụng `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` — một bóng không có độ lệch, không có độ mờ, lan rộng 1px tạo ra đường giống viền mà không có hệ quả của box model. Kỹ thuật này cho phép các viền tồn tại trong lớp bóng, giúp các chuyển đổi mượt mà hơn, góc bo tròn không bị cắt xén, và trọng lượng thị giác tinh tế hơn so với viền truyền thống. Toàn bộ hệ thống chiều sâu được xây dựng trên các ngăn xếp bóng đa lớp, nơi mỗi lớp phục vụ một mục đích cụ thể: một lớp cho viền, một lớp cho độ cao mềm mại, một lớp cho chiều sâu xung quanh.

**Đặc điểm chính:**
- Geist Sans với khoảng cách chữ âm cực mạnh (-2.4px đến -2.88px ở kích thước hiển thị) — văn bản như hạ tầng được nén
- Geist Mono cho mã và nhãn kỹ thuật với `"liga"` OpenType trên toàn cục
- Kỹ thuật bóng-thay-viền: `box-shadow 0px 0px 0px 1px` thay thế viền truyền thống xuyên suốt
- Ngăn xếp bóng đa lớp cho chiều sâu tinh tế (viền + độ cao + xung quanh trong một khai báo)
- Nền trắng gần thuần với văn bản `#171717` — không hoàn toàn đen, tạo độ mềm vi tương phản
- Màu nhấn theo luồng công việc: Ship Red (`#ff5b4f`), Preview Pink (`#de1d8d`), Develop Blue (`#0a72ef`)
- Hệ thống vòng focus sử dụng `hsla(212, 100%, 48%, 1)` — màu xanh bão hòa cao cho khả năng tiếp cận
- Huy hiệu hình viên thuốc (9999px) với nền tông màu cho các chỉ báo trạng thái

## 2. Bảng màu & Vai trò

### Chính
- **Vercel Black** (`#171717`): Văn bản chính, tiêu đề, nền bề mặt tối. Không phải đen thuần — sắc ấm nhẹ ngăn sự khắc nghiệt.
- **Pure White** (`#ffffff`): Nền trang, bề mặt thẻ, văn bản nút trên nền tối.
- **True Black** (`#000000`): Dùng thứ cấp, `--geist-console-text-color-default`, dùng trong các bối cảnh console/mã cụ thể.

### Màu nhấn theo luồng công việc
- **Ship Red** (`#ff5b4f`): `--ship-text`, bước luồng công việc "ship to production" — đỏ san hô ấm, cấp bách.
- **Preview Pink** (`#de1d8d`): `--preview-text`, luồng công việc triển khai xem trước — hồng đậm sặc sỡ.
- **Develop Blue** (`#0a72ef`): `--develop-text`, luồng công việc phát triển — xanh sáng, tập trung.

### Màu Console / Mã
- **Console Blue** (`#0070f3`): `--geist-console-text-color-blue`, xanh tô sáng cú pháp.
- **Console Purple** (`#7928ca`): `--geist-console-text-color-purple`, tím tô sáng cú pháp.
- **Console Pink** (`#eb367f`): `--geist-console-text-color-pink`, hồng tô sáng cú pháp.

### Tương tác
- **Link Blue** (`#0072f5`): Màu liên kết chính với trang trí gạch chân.
- **Focus Blue** (`hsla(212, 100%, 48%, 1)`): `--ds-focus-color`, vòng focus trên các phần tử tương tác.
- **Ring Blue** (`rgba(147, 197, 253, 0.5)`): `--tw-ring-color`, tiện ích vòng Tailwind.

### Thang độ xám
- **Gray 900** (`#171717`): Văn bản chính, tiêu đề, văn bản điều hướng.
- **Gray 600** (`#4d4d4d`): Văn bản thứ cấp, nội dung mô tả.
- **Gray 500** (`#666666`): Văn bản cấp ba, liên kết mờ nhạt.
- **Gray 400** (`#808080`): Văn bản giữ chỗ, trạng thái vô hiệu hóa.
- **Gray 100** (`#ebebeb`): Viền, đường viền thẻ, đường phân cách.
- **Gray 50** (`#fafafa`): Tông bề mặt tinh tế, điểm nổi bật bóng bên trong.

### Bề mặt & Lớp phủ
- **Overlay Backdrop** (`hsla(0, 0%, 98%, 1)`): `--ds-overlay-backdrop-color`, nền tối modal/hộp thoại.
- **Selection Text** (`hsla(0, 0%, 95%, 1)`): `--geist-selection-text-color`, điểm nổi bật chọn văn bản.
- **Badge Blue Bg** (`#ebf5ff`): Nền huy hiệu hình viên thuốc, bề mặt xanh tông.
- **Badge Blue Text** (`#0068d6`): Văn bản huy hiệu hình viên thuốc, xanh đậm hơn cho dễ đọc.

### Bóng & Chiều sâu
- **Border Shadow** (`rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`): Đặc trưng — thay thế viền truyền thống.
- **Subtle Elevation** (`rgba(0, 0, 0, 0.04) 0px 2px 2px`): Nâng tối thiểu cho thẻ.
- **Card Stack** (`rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, rgba(0,0,0,0.04) 0px 8px 8px -8px, #fafafa 0px 0px 0px 1px`): Bóng thẻ đa lớp đầy đủ.
- **Ring Border** (`rgb(235, 235, 235) 0px 0px 0px 1px`): Vòng viền xám nhạt cho tab và hình ảnh.

## 3. Quy tắc Typography

### Họ font
- **Chính**: `Geist`, với các font dự phòng: `Arial, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol`
- **Monospace**: `Geist Mono`, với các font dự phòng: `ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New`
- **Tính năng OpenType**: `"liga"` bật toàn cục trên tất cả văn bản Geist; `"tnum"` cho số dạng bảng trên các chú thích cụ thể.

### Phân cấp

| Vai trò | Font | Cỡ | Độ đậm | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Geist | 48px (3.00rem) | 600 | 1.00–1.17 (chật) | -2.4px đến -2.88px | Nén tối đa, tác động quảng cáo |
| Section Heading | Geist | 40px (2.50rem) | 600 | 1.20 (chật) | -2.4px | Tiêu đề phần tính năng |
| Sub-heading Large | Geist | 32px (2.00rem) | 600 | 1.25 (chật) | -1.28px | Tiêu đề thẻ, phần phụ |
| Sub-heading | Geist | 32px (2.00rem) | 400 | 1.50 | -1.28px | Tiêu đề phụ nhẹ hơn |
| Card Title | Geist | 24px (1.50rem) | 600 | 1.33 | -0.96px | Thẻ tính năng |
| Card Title Light | Geist | 24px (1.50rem) | 500 | 1.33 | -0.96px | Tiêu đề thẻ thứ cấp |
| Body Large | Geist | 20px (1.25rem) | 400 | 1.80 (thoáng) | normal | Phần giới thiệu, mô tả tính năng |
| Body | Geist | 18px (1.13rem) | 400 | 1.56 | normal | Văn bản đọc tiêu chuẩn |
| Body Small | Geist | 16px (1.00rem) | 400 | 1.50 | normal | Văn bản UI tiêu chuẩn |
| Body Medium | Geist | 16px (1.00rem) | 500 | 1.50 | normal | Điều hướng, văn bản nhấn mạnh |
| Body Semibold | Geist | 16px (1.00rem) | 600 | 1.50 | -0.32px | Nhãn mạnh, trạng thái hoạt động |
| Button / Link | Geist | 14px (0.88rem) | 500 | 1.43 | normal | Nút, liên kết, chú thích |
| Button Small | Geist | 14px (0.88rem) | 400 | 1.00 (chật) | normal | Nút nhỏ gọn |
| Caption | Geist | 12px (0.75rem) | 400–500 | 1.33 | normal | Siêu dữ liệu, thẻ nhãn |
| Mono Body | Geist Mono | 16px (1.00rem) | 400 | 1.50 | normal | Khối mã |
| Mono Caption | Geist Mono | 13px (0.81rem) | 500 | 1.54 | normal | Nhãn mã |
| Mono Small | Geist Mono | 12px (0.75rem) | 500 | 1.00 (chật) | normal | `text-transform: uppercase`, nhãn kỹ thuật |
| Micro Badge | Geist | 7px (0.44rem) | 700 | 1.00 (chật) | normal | `text-transform: uppercase`, huy hiệu cực nhỏ |

### Nguyên tắc
- **Nén như bản sắc**: Geist Sans ở kích thước hiển thị sử dụng khoảng cách chữ -2.4px đến -2.88px — khoảng theo dõi âm mạnh nhất trong bất kỳ hệ thống thiết kế lớn nào. Điều này tạo ra văn bản cảm giác _thu gọn_, như mã được tối ưu hóa cho sản xuất. Khoảng theo dõi dần nới lỏng khi kích thước giảm: -1.28px ở 32px, -0.96px ở 24px, -0.32px ở 16px, và normal ở 14px.
- **Chữ ghép ở khắp nơi**: Mọi phần tử văn bản Geist đều bật `"liga"` OpenType. Chữ ghép không phải để trang trí — chúng mang tính cấu trúc, tạo ra các kết hợp glyph chặt chẽ và hiệu quả hơn.
- **Ba độ đậm, vai trò nghiêm ngặt**: 400 (thân bài/đọc), 500 (UI/tương tác), 600 (tiêu đề/nhấn mạnh). Không có đậm (700) ngoại trừ huy hiệu micro cực nhỏ. Phạm vi độ đậm hẹp này tạo ra phân cấp thông qua kích thước và khoảng theo dõi, không phải qua độ đậm.
- **Mono cho bản sắc**: Geist Mono in hoa với `"tnum"` hoặc `"liga"` đóng vai trò là giọng nói "console dành cho nhà phát triển" — nhãn kỹ thuật nhỏ gọn kết nối trang marketing với sản phẩm.

## 4. Phong cách Thành phần

### Nút

**Nút trắng chính (Viền bằng bóng)**
- Nền: `#ffffff`
- Văn bản: `#171717`
- Đệm: 0px 6px (tối thiểu — rộng theo nội dung)
- Bán kính: 6px (bo tròn tinh tế)
- Bóng: `rgb(235, 235, 235) 0px 0px 0px 1px` (vòng viền)
- Khi di chuột: nền chuyển sang `var(--ds-gray-1000)` (tối)
- Focus: viền `2px solid var(--ds-focus-color)` + bóng `var(--ds-focus-ring)`
- Dùng: Nút thứ cấp tiêu chuẩn

**Nút tối chính (Suy luận từ hệ thống Geist)**
- Nền: `#171717`
- Văn bản: `#ffffff`
- Đệm: 8px 16px
- Bán kính: 6px
- Dùng: CTA chính ("Start Deploying", "Get Started")

**Nút / Huy hiệu hình viên thuốc**
- Nền: `#ebf5ff` (xanh tông)
- Văn bản: `#0068d6`
- Đệm: 0px 10px
- Bán kính: 9999px (hình viên thuốc đầy)
- Font: 12px độ đậm 500
- Dùng: Huy hiệu trạng thái, thẻ nhãn, nhãn tính năng

**Hình viên thuốc lớn (Điều hướng)**
- Nền: trong suốt hoặc `#171717`
- Bán kính: 64px–100px
- Dùng: Điều hướng tab, bộ chọn phần

### Thẻ & Vùng chứa
- Nền: `#ffffff`
- Viền: thông qua bóng — `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Bán kính: 8px (tiêu chuẩn), 12px (thẻ nổi bật/hình ảnh)
- Ngăn xếp bóng: `rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px`
- Thẻ hình ảnh: `1px solid #ebebeb` với bán kính trên 12px
- Khi di chuột: tăng cường bóng tinh tế

### Ô nhập & Biểu mẫu
- Radio: kiểu dáng tiêu chuẩn với focus nền `var(--ds-gray-200)`
- Bóng focus: `1px 0 0 0 var(--ds-gray-alpha-600)`
- Viền focus: `2px solid var(--ds-focus-color)` — vòng focus xanh nhất quán
- Viền: thông qua kỹ thuật bóng, không phải viền truyền thống

### Điều hướng
- Điều hướng ngang gọn gàng trên nền trắng, dính
- Logotype Vercel căn trái, 262x52px
- Liên kết: Geist 14px độ đậm 500, văn bản `#171717`
- Hoạt động: độ đậm 600 hoặc gạch chân
- CTA: nút hình viên thuốc tối ("Start Deploying", "Contact Sales")
- Di động: menu hamburger thu gọn
- Menu thả xuống sản phẩm với menu đa cấp

### Xử lý hình ảnh
- Ảnh chụp màn hình sản phẩm với viền `1px solid #ebebeb`
- Hình ảnh bo tròn trên: bán kính `12px 12px 0px 0px`
- Ảnh chụp màn hình dashboard/xem trước mã chiếm ưu thế trong các phần tính năng
- Nền gradient mềm mại phía sau hình ảnh hero (pastel đa màu)

### Thành phần đặc biệt

**Đường ống luồng công việc**
- Đường ống ngang ba bước: Develop → Preview → Ship
- Mỗi bước có màu nhấn riêng: Xanh → Hồng → Đỏ
- Kết nối bằng đường/mũi tên
- Ẩn dụ thị giác cho đề xuất giá trị cốt lõi của Vercel

**Thanh tin cậy / Lưới logo**
- Logo công ty (Perplexity, ChatGPT, Cursor, v.v.) ở dạng grayscale
- Cuộn ngang hoặc bố cục lưới
- Phân cách viền `#ebebeb` tinh tế

**Thẻ số liệu**
- Hiển thị số lớn (ví dụ: "10x faster")
- Geist 48px độ đậm 600 cho số liệu
- Mô tả bên dưới bằng văn bản thân bài màu xám
- Vùng chứa thẻ có viền bằng bóng

## 5. Nguyên tắc Bố cục

### Hệ thống khoảng cách
- Đơn vị cơ sở: 8px
- Thang: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 16px, 32px, 36px, 40px
- Lưu ý: nhảy từ 16px lên 32px — không có 20px hay 24px trong thang chính

### Lưới & Vùng chứa
- Chiều rộng nội dung tối đa: khoảng 1200px
- Hero: một cột căn giữa với đệm trên hào phóng
- Phần tính năng: lưới 2–3 cột cho thẻ
- Đường phân cách toàn chiều rộng sử dụng `border-bottom: 1px solid #171717`
- Ảnh chụp màn hình mã/dashboard toàn chiều rộng hoặc có viền

### Triết lý khoảng trắng
- **Sự trống rỗng như phòng trưng bày**: Đệm dọc lớn giữa các phần (80px–120px+). Khoảng trắng CHÍNH LÀ thiết kế — nó truyền đạt rằng Vercel không cần chứng minh gì và không có gì cần che giấu.
- **Văn bản nén, không gian mở rộng**: Khoảng cách chữ âm mạnh trên tiêu đề được cân bằng bởi khoảng trắng xung quanh rộng rãi. Văn bản dày đặc; không gian xung quanh nó bao la.
- **Nhịp phần**: Các phần trắng xen kẽ với các phần trắng — không có sự thay đổi màu sắc giữa các phần. Sự phân tách đến từ viền (viền bóng) và khoảng cách mà thôi.

### Thang bán kính bo tròn
- Micro (2px): Đoạn mã nội dòng, span nhỏ
- Tinh tế (4px): Vùng chứa nhỏ
- Tiêu chuẩn (6px): Nút, liên kết, phần tử chức năng
- Thoải mái (8px): Thẻ, mục danh sách
- Hình ảnh (12px): Thẻ nổi bật, vùng chứa hình ảnh (bo tròn trên)
- Lớn (64px): Hình viên thuốc điều hướng tab
- XL (100px): Liên kết điều hướng lớn
- Hình viên thuốc đầy (9999px): Huy hiệu, hình viên thuốc trạng thái, thẻ nhãn
- Tròn (50%): Nút chuyển đổi menu, vùng chứa avatar

## 6. Chiều sâu & Độ cao

| Mức | Xử lý | Dùng |
|-------|-----------|-----|
| Phẳng (Mức 0) | Không có bóng | Nền trang, khối văn bản |
| Vòng (Mức 1) | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Bóng-thay-viền cho hầu hết các phần tử |
| Vòng nhạt (Mức 1b) | `rgb(235,235,235) 0px 0px 0px 1px` | Vòng nhạt hơn cho tab, hình ảnh |
| Thẻ tinh tế (Mức 2) | Vòng + `rgba(0,0,0,0.04) 0px 2px 2px` | Thẻ tiêu chuẩn với nâng tối thiểu |
| Thẻ đầy đủ (Mức 3) | Vòng + Tinh tế + `rgba(0,0,0,0.04) 0px 8px 8px -8px` + vòng trong `#fafafa` | Thẻ nổi bật, bảng được làm nổi bật |
| Focus (Khả năng tiếp cận) | Viền `2px solid hsla(212, 100%, 48%, 1)` | Focus bàn phím trên tất cả phần tử tương tác |

**Triết lý bóng**: Vercel có thể là hệ thống bóng tinh vi nhất trong thiết kế web hiện đại. Thay vì sử dụng bóng cho độ cao theo nghĩa truyền thống của Material Design, Vercel sử dụng các ngăn xếp bóng đa giá trị, trong đó mỗi lớp có một mục đích kiến trúc riêng biệt: một lớp tạo "viền" (lan rộng 0px, 1px), một lớp thêm độ mềm xung quanh (mờ 2px), một lớp xử lý chiều sâu theo khoảng cách (mờ 8px với lan rộng âm), và một vòng trong (`#fafafa`) tạo ra điểm nổi bật tinh tế khiến thẻ "phát sáng" từ bên trong. Cách tiếp cận nhiều lớp này có nghĩa là các thẻ cảm giác được xây dựng, không phải lơ lửng.

### Chiều sâu trang trí
- Gradient hero: lớp rửa gradient đa màu pastel mềm mại đằng sau nội dung hero (hầu như vô hình, tạo bầu không khí)
- Viền phần: `1px solid #171717` (đường tối đầy đủ) giữa các phần lớn
- Không có sự thay đổi màu nền — chiều sâu đến hoàn toàn từ việc xếp lớp bóng và tương phản viền

## 7. Nên và Không nên

### Nên
- Dùng Geist Sans với khoảng cách chữ âm mạnh ở kích thước hiển thị (-2.4px đến -2.88px ở 48px)
- Dùng bóng-thay-viền (`0px 0px 0px 1px rgba(0,0,0,0.08)`) thay vì viền CSS truyền thống
- Bật `"liga"` trên tất cả văn bản Geist — chữ ghép mang tính cấu trúc, không phải tùy chọn
- Dùng hệ thống ba độ đậm: 400 (thân bài), 500 (UI), 600 (tiêu đề)
- Áp dụng màu nhấn theo luồng công việc (Đỏ/Hồng/Xanh) chỉ trong bối cảnh luồng công việc của chúng
- Dùng ngăn xếp bóng đa lớp cho thẻ (viền + độ cao + xung quanh + điểm nổi bật bên trong)
- Giữ bảng màu không màu — các sắc xám từ `#171717` đến `#ffffff` là hệ thống
- Dùng `#171717` thay vì `#000000` cho văn bản chính — sắc ấm vi tế quan trọng

### Không nên
- Không dùng khoảng cách chữ dương trên Geist Sans — luôn âm hoặc bằng không
- Không dùng độ đậm 700 (đậm) trên văn bản thân bài — 600 là tối đa, chỉ dùng cho tiêu đề
- Không dùng `border` CSS truyền thống trên thẻ — dùng kỹ thuật viền-bóng
- Không đưa màu ấm (cam, vàng, xanh lá) vào chrome UI
- Không áp dụng màu nhấn theo luồng công việc (Ship Red, Preview Pink, Develop Blue) mang tính trang trí
- Không dùng bóng nặng (> 0.1 độ mờ) — hệ thống bóng ở mức thì thầm
- Không tăng khoảng cách chữ cho văn bản thân bài — Geist được thiết kế để chạy chặt
- Không dùng bán kính hình viên thuốc (9999px) trên nút hành động chính — hình viên thuốc chỉ dành cho huy hiệu/thẻ nhãn
- Không bỏ qua vòng trong `#fafafa` trong bóng thẻ — đó là ánh sáng tạo nên sự hoạt động của hệ thống

## 8. Hành vi Responsive

### Điểm dừng
| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Mobile Small | <400px | Một cột chặt, đệm tối thiểu |
| Mobile | 400–600px | Di động tiêu chuẩn, bố cục xếp chồng |
| Tablet Small | 600–768px | Lưới 2 cột bắt đầu |
| Tablet | 768–1024px | Lưới thẻ đầy đủ, đệm mở rộng |
| Desktop Small | 1024–1200px | Bố cục desktop tiêu chuẩn |
| Desktop | 1200–1400px | Bố cục đầy đủ, chiều rộng nội dung tối đa |
| Large Desktop | >1400px | Căn giữa, lề rộng rãi |

### Mục tiêu chạm
- Nút dùng đệm thoải mái (8px–16px dọc)
- Liên kết điều hướng ở 14px với khoảng cách đủ
- Huy hiệu hình viên thuốc có 10px đệm ngang cho mục tiêu chạm
- Nút chuyển đổi menu di động dùng nút tròn bán kính 50%

### Chiến lược thu gọn
- Hero: hiển thị 48px → thu nhỏ, duy trì khoảng theo dõi âm theo tỷ lệ
- Điều hướng: liên kết ngang + CTA → menu hamburger
- Thẻ tính năng: 3 cột → 2 cột → một cột xếp chồng
- Ảnh chụp màn hình mã: duy trì tỷ lệ khung hình, có thể cuộn ngang
- Logo thanh tin cậy: lưới → cuộn ngang
- Footer: nhiều cột → một cột xếp chồng
- Khoảng cách phần: 80px+ → 48px trên di động

### Hành vi hình ảnh
- Ảnh chụp màn hình dashboard duy trì xử lý viền ở mọi kích thước
- Gradient hero mềm mại/đơn giản hơn trên di động
- Ảnh chụp màn hình sản phẩm dùng hình ảnh responsive với bán kính viền nhất quán
- Các phần toàn chiều rộng duy trì xử lý từ cạnh đến cạnh

## 9. Hướng dẫn Prompt cho Agent

### Tham chiếu màu nhanh
- CTA chính: Vercel Black (`#171717`)
- Nền: Pure White (`#ffffff`)
- Văn bản tiêu đề: Vercel Black (`#171717`)
- Văn bản thân bài: Gray 600 (`#4d4d4d`)
- Viền (bóng): `rgba(0, 0, 0, 0.08) 0px 0px 0px 1px`
- Liên kết: Link Blue (`#0072f5`)
- Vòng focus: Focus Blue (`hsla(212, 100%, 48%, 1)`)

### Ví dụ prompt thành phần
- "Create a hero section on white background. Headline at 48px Geist weight 600, line-height 1.00, letter-spacing -2.4px, color #171717. Subtitle at 20px Geist weight 400, line-height 1.80, color #4d4d4d. Dark CTA button (#171717, 6px radius, 8px 16px padding) and ghost button (white, shadow-border rgba(0,0,0,0.08) 0px 0px 0px 1px, 6px radius)."
- "Design a card: white background, no CSS border. Use shadow stack: rgba(0,0,0,0.08) 0px 0px 0px 1px, rgba(0,0,0,0.04) 0px 2px 2px, #fafafa 0px 0px 0px 1px. Radius 8px. Title at 24px Geist weight 600, letter-spacing -0.96px. Body at 16px weight 400, #4d4d4d."
- "Build a pill badge: #ebf5ff background, #0068d6 text, 9999px radius, 0px 10px padding, 12px Geist weight 500."
- "Create navigation: white sticky header. Geist 14px weight 500 for links, #171717 text. Dark pill CTA 'Start Deploying' right-aligned. Shadow-border on bottom: rgba(0,0,0,0.08) 0px 0px 0px 1px."
- "Design a workflow section showing three steps: Develop (text color #0a72ef), Preview (#de1d8d), Ship (#ff5b4f). Each step: 14px Geist Mono uppercase label + 24px Geist weight 600 title + 16px weight 400 description in #4d4d4d."

### Hướng dẫn lặp lại
1. Luôn dùng bóng-thay-viền thay vì viền CSS — `0px 0px 0px 1px rgba(0,0,0,0.08)` là nền tảng
2. Khoảng cách chữ theo tỷ lệ với cỡ font: -2.4px ở 48px, -1.28px ở 32px, -0.96px ở 24px, normal ở 14px
3. Chỉ ba độ đậm: 400 (đọc), 500 (tương tác), 600 (thông báo)
4. Màu sắc mang tính chức năng, không bao giờ trang trí — màu luồng công việc (Đỏ/Hồng/Xanh) chỉ đánh dấu các giai đoạn đường ống
5. Vòng trong `#fafafa` trong bóng thẻ là thứ tạo ra ánh sáng bên trong đặc trưng của thẻ Vercel
6. Geist Mono in hoa cho nhãn kỹ thuật, Geist Sans cho mọi thứ còn lại
