# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ Stripe

> Category: Fintech & Tiền Mã Hóa
> Hạ tầng thanh toán. Gradient tím đặc trưng, vẻ thanh lịch với font weight 300.

## 1. Chủ Đề Hình Ảnh & Bầu Không Khí

Trang web của Stripe là tiêu chuẩn vàng trong thiết kế fintech — một hệ thống vừa mang cảm giác kỹ thuật lại vừa sang trọng, vừa chính xác vừa ấm áp. Trang mở ra với nền trắng tinh khiết (`#ffffff`), tiêu đề xanh navy đậm (`#061b31`) và màu tím đặc trưng (`#533afd`) đóng vai trò vừa là neo thương hiệu vừa là điểm nhấn tương tác. Đây không phải màu tím lạnh lẽo, cứng nhắc của phần mềm doanh nghiệp; đó là màu violet bão hòa, giàu sắc thái, toát lên sự tự tin và cao cấp. Ấn tượng tổng thể giống như một tổ chức tài chính được thiết kế lại bởi một xưởng đúc chữ đẳng cấp thế giới.

Font biến thể `sohne-var` là yếu tố định nghĩa bản sắc hình ảnh của Stripe. Mỗi phần tử văn bản đều bật tập stylistic `"ss01"` của OpenType, vốn chỉnh sửa hình dạng ký tự để mang lại cảm giác hình học hiện đại và đặc biệt. Ở cỡ hiển thị (48px–56px), sohne-var chạy ở weight 300 — một font weight cực nhẹ cho tiêu đề, tạo nên uy quyền nhẹ nhàng, gần như thầm thì. Đây là điều ngược lại hoàn toàn so với quy ước "tiêu đề in đậm nổi bật"; tiêu đề của Stripe như thể chúng không cần phải hét to mới được để ý. Khoảng cách chữ âm (-1.4px ở 56px, -0.96px ở 48px) siết chặt văn bản thành các khối đặc, kỹ lưỡng. Ở cỡ nhỏ hơn, hệ thống cũng dùng weight 300 với tracking giảm theo tỉ lệ, và chữ số dạng bảng qua `"tnum"` để hiển thị dữ liệu tài chính.

Điều thực sự phân biệt Stripe là hệ thống đổ bóng của nó. Thay vì cách tiếp cận phẳng hoặc một lớp của hầu hết các trang web, Stripe sử dụng bóng đổ nhiều lớp có gam màu xanh: `rgba(50,50,93,0.25)` đặc trưng kết hợp với `rgba(0,0,0,0.1)` tạo ra những cái bóng có chiều sâu lạnh, gần như huyền ảo — như thể các phần tử đang lơ lửng trên bầu trời hoàng hôn. Gam màu xanh xám của màu bóng chính (50,50,93) gắn trực tiếp với bảng màu navy-tím của thương hiệu, khiến ngay cả độ cao cũng mang hơi hướng thương hiệu.

**Đặc Điểm Chính:**
- sohne-var với OpenType `"ss01"` trên mọi văn bản — một bộ stylistic tùy chỉnh định nghĩa letterform của thương hiệu
- Weight 300 là font weight tiêu đề đặc trưng — nhẹ nhàng, tự tin, phá vỡ quy ước
- Khoảng cách chữ âm ở cỡ hiển thị (-1.4px ở 56px, nới lỏng dần ở cỡ nhỏ hơn)
- Bóng đổ nhiều lớp màu xanh dùng `rgba(50,50,93,0.25)` — độ cao mang màu thương hiệu
- Tiêu đề xanh navy đậm (`#061b31`) thay vì đen — ấm áp, cao cấp, chuẩn tài chính
- Bo góc bảo thủ (4px–8px) — không viên thuốc, không sắc cạnh
- Điểm nhấn đỏ ruby (`#ea2261`) và hồng magenta (`#f96bee`) cho gradient và yếu tố trang trí
- `SourceCodePro` là font monospace đi kèm cho code và nhãn kỹ thuật

## 2. Bảng Màu & Vai Trò

### Màu Chính
- **Tím Stripe** (`#533afd`): Màu thương hiệu chính, nền CTA, văn bản liên kết, điểm nhấn tương tác. Màu blue-violet bão hòa neo toàn bộ hệ thống.
- **Xanh Navy Đậm** (`#061b31`): `--hds-color-heading-solid`. Màu tiêu đề chính. Không phải đen, không phải xám — xanh rất đậm thêm hơi ấm và chiều sâu cho văn bản.
- **Trắng Tinh Khiết** (`#ffffff`): Nền trang, bề mặt thẻ, văn bản nút trên nền tối.

### Thương Hiệu & Tối
- **Thương Hiệu Tối** (`#1c1e54`): `--hds-color-util-brand-900`. Indigo đậm cho các khu vực tối, nền footer và những khoảnh khắc thương hiệu đắm chìm.
- **Navy Tối** (`#0d253d`): `--hds-color-core-neutral-975`. Trung tính tối nhất — gần như đen với gam màu xanh cho độ sâu tối đa mà không khắc nghiệt.

### Màu Nhấn
- **Đỏ Ruby** (`#ea2261`): `--hds-color-accentColorMode-ruby-icon-solid`. Đỏ hồng ấm cho biểu tượng, cảnh báo và yếu tố nhấn.
- **Hồng Magenta** (`#f96bee`): `--hds-color-accentColorMode-magenta-icon-gradientMiddle`. Hồng tím sống động cho gradient và điểm nhấn trang trí.
- **Magenta Nhạt** (`#ffd7ef`): `--hds-color-util-accent-magenta-100`. Bề mặt tô màu cho thẻ và huy hiệu theo chủ đề magenta.

### Tương Tác
- **Tím Chính** (`#533afd`): Màu liên kết chính, trạng thái active, phần tử được chọn.
- **Tím Khi Hover** (`#4434d4`): Tím đậm hơn cho trạng thái hover của phần tử chính.
- **Tím Sâu** (`#2e2b8c`): `--hds-color-button-ui-iconHover`. Tím tối cho trạng thái hover biểu tượng.
- **Tím Nhạt** (`#b9b9f9`): `--hds-color-action-bg-subduedHover`. Lavender nhẹ cho nền hover dịu nhẹ.
- **Tím Trung** (`#665efd`): `--hds-color-input-selector-text-range`. Màu bộ chọn phạm vi và điểm nhấn input.

### Thang Trung Tính
- **Tiêu Đề** (`#061b31`): Tiêu đề chính, văn bản nav, nhãn đậm.
- **Nhãn** (`#273951`): `--hds-color-input-text-label`. Nhãn form, tiêu đề phụ.
- **Nội Dung** (`#64748d`): Văn bản phụ, mô tả, chú thích.
- **Xanh Thành Công** (`#15be53`): Huy hiệu trạng thái, chỉ báo thành công (với alpha 0.2–0.4 cho nền/viền).
- **Văn Bản Thành Công** (`#108c3d`): Màu văn bản huy hiệu thành công.
- **Vàng Chanh** (`#9b6829`): `--hds-color-core-lemon-500`. Nhấn cảnh báo và điểm nổi bật.

### Bề Mặt & Viền
- **Viền Mặc Định** (`#e5edf5`): Màu viền chuẩn cho thẻ, đường phân cách và container.
- **Viền Tím** (`#b9b9f9`): Viền trạng thái active/được chọn trên nút và input.
- **Viền Tím Nhạt** (`#d6d9fc`): Viền màu tím tinh tế cho các phần tử phụ.
- **Viền Magenta** (`#ffd7ef`): Viền tông hồng cho các phần tử chủ đề magenta.
- **Viền Nét Đứt** (`#362baa`): Viền nét đứt cho vùng thả và phần tử placeholder.

### Màu Bóng Đổ
- **Bóng Xanh** (`rgba(50,50,93,0.25)`): Đặc trưng — màu bóng chính có gam xanh.
- **Bóng Xanh Đậm** (`rgba(3,3,39,0.25)`): Bóng xanh sâu hơn cho các phần tử nâng cao.
- **Bóng Đen** (`rgba(0,0,0,0.1)`): Lớp bóng phụ để tăng cường chiều sâu.
- **Bóng Môi Trường** (`rgba(23,23,23,0.08)`): Bóng môi trường mềm cho độ nâng tinh tế.
- **Bóng Mềm** (`rgba(23,23,23,0.06)`): Bóng môi trường tối thiểu cho lực nâng nhẹ.

## 3. Quy Tắc Typography

### Font Family
- **Chính**: `sohne-var`, fallback: `SF Pro Display`
- **Monospace**: `SourceCodePro`, fallback: `SFMono-Regular`
- **Tính Năng OpenType**: `"ss01"` bật toàn cục trên mọi văn bản sohne-var; `"tnum"` cho chữ số dạng bảng trong dữ liệu tài chính và chú thích.

### Phân Cấp

| Vai Trò | Font | Cỡ | Weight | Chiều Cao Dòng | Khoảng Cách Chữ | Tính Năng | Ghi Chú |
|------|------|------|--------|-------------|----------------|----------|-------|
| Display Hero | sohne-var | 56px (3.50rem) | 300 | 1.03 (chật) | -1.4px | ss01 | Cỡ tối đa, uy quyền thầm thì |
| Display Lớn | sohne-var | 48px (3.00rem) | 300 | 1.15 (chật) | -0.96px | ss01 | Tiêu đề hero phụ |
| Tiêu Đề Khu Vực | sohne-var | 32px (2.00rem) | 300 | 1.10 (chật) | -0.64px | ss01 | Tiêu đề khu vực tính năng |
| Tiêu Đề Phụ Lớn | sohne-var | 26px (1.63rem) | 300 | 1.12 (chật) | -0.26px | ss01 | Tiêu đề thẻ, tiểu mục |
| Tiêu Đề Phụ | sohne-var | 22px (1.38rem) | 300 | 1.10 (chật) | -0.22px | ss01 | Đầu khu vực nhỏ hơn |
| Nội Dung Lớn | sohne-var | 18px (1.13rem) | 300 | 1.40 | bình thường | ss01 | Mô tả tính năng, văn bản giới thiệu |
| Nội Dung | sohne-var | 16px (1.00rem) | 300-400 | 1.40 | bình thường | ss01 | Văn bản đọc chuẩn |
| Nút | sohne-var | 16px (1.00rem) | 400 | 1.00 (chật) | bình thường | ss01 | Văn bản nút chính |
| Nút Nhỏ | sohne-var | 14px (0.88rem) | 400 | 1.00 (chật) | bình thường | ss01 | Nút phụ/gọn |
| Liên Kết | sohne-var | 14px (0.88rem) | 400 | 1.00 (chật) | bình thường | ss01 | Liên kết điều hướng |
| Chú Thích | sohne-var | 13px (0.81rem) | 400 | bình thường | bình thường | ss01 | Nhãn nhỏ, siêu dữ liệu |
| Chú Thích Nhỏ | sohne-var | 12px (0.75rem) | 300-400 | 1.33-1.45 | bình thường | ss01 | Chữ nhỏ, dấu thời gian |
| Chú Thích Dạng Bảng | sohne-var | 12px (0.75rem) | 300-400 | 1.33 | -0.36px | tnum | Dữ liệu tài chính, số |
| Micro | sohne-var | 10px (0.63rem) | 300 | 1.15 (chật) | 0.1px | ss01 | Nhãn rất nhỏ, điểm đánh dấu trục |
| Micro Dạng Bảng | sohne-var | 10px (0.63rem) | 300 | 1.15 (chật) | -0.3px | tnum | Dữ liệu biểu đồ, số nhỏ |
| Nano | sohne-var | 8px (0.50rem) | 300 | 1.07 (chật) | bình thường | ss01 | Nhãn nhỏ nhất |
| Code Nội Dung | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (rộng) | bình thường | -- | Khối code, cú pháp |
| Code Đậm | SourceCodePro | 12px (0.75rem) | 700 | 2.00 (rộng) | bình thường | -- | Code đậm, từ khóa |
| Nhãn Code | SourceCodePro | 12px (0.75rem) | 500 | 2.00 (rộng) | bình thường | hoa | Nhãn kỹ thuật |
| Code Micro | SourceCodePro | 9px (0.56rem) | 500 | 1.00 (chật) | bình thường | ss01 | Chú thích code rất nhỏ |

### Nguyên Tắc
- **Font nhẹ là đặc trưng**: Weight 300 ở cỡ hiển thị là lựa chọn typography đặc biệt nhất của Stripe. Trong khi những thương hiệu khác dùng 600–700 để thu hút sự chú ý, Stripe dùng sự nhẹ nhàng như xa xỉ — văn bản tự tin đến mức không cần weight nặng mới toát lên uy quyền.
- **ss01 ở mọi nơi**: Bộ stylistic `"ss01"` là bất di bất dịch. Nó chỉnh sửa các glyph cụ thể (có thể là các dạng thay thế `a`, `g`, `l`) để tạo ra cảm giác hình học, đương đại hơn trên toàn bộ văn bản sohne-var.
- **Hai chế độ OpenType**: `"ss01"` cho văn bản hiển thị/nội dung, `"tnum"` cho chữ số dạng bảng trong dữ liệu tài chính. Chúng không bao giờ chồng lên nhau — một số trong đoạn văn dùng ss01, một số trong bảng dữ liệu dùng tnum.
- **Tracking lũy tiến**: Khoảng cách chữ siết dần theo tỉ lệ với cỡ chữ: -1.4px ở 56px, -0.96px ở 48px, -0.64px ở 32px, -0.26px ở 26px, bình thường từ 16px trở xuống.
- **Đơn giản hai weight**: Chủ yếu 300 (nội dung và tiêu đề) và 400 (UI/nút). Không có in đậm (700) trong font chính — SourceCodePro dùng 500/700 cho độ tương phản code.

## 4. Kiểu Dáng Thành Phần

### Nút

**Tím Chính**
- Nền: `#533afd`
- Chữ: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Font: 16px sohne-var weight 400, `"ss01"`
- Hover: nền `#4434d4`
- Dùng cho: CTA chính ("Bắt đầu ngay", "Liên hệ bán hàng")

**Ghost / Có Viền**
- Nền: trong suốt
- Chữ: `#533afd`
- Padding: 8px 16px
- Radius: 4px
- Viền: `1px solid #b9b9f9`
- Font: 16px sohne-var weight 400, `"ss01"`
- Hover: nền chuyển sang `rgba(83,58,253,0.05)`
- Dùng cho: Hành động phụ

**Thông Tin Trong Suốt**
- Nền: trong suốt
- Chữ: `#2874ad`
- Padding: 8px 16px
- Radius: 4px
- Viền: `1px solid rgba(43,145,223,0.2)`
- Dùng cho: Hành động cấp ba/thông tin

**Ghost Trung Tính**
- Nền: trong suốt (`rgba(255,255,255,0)`)
- Chữ: `rgba(16,16,16,0.3)`
- Padding: 8px 16px
- Radius: 4px
- Viền ngoài: `1px solid rgb(212,222,233)`
- Dùng cho: Hành động bị vô hiệu hóa hoặc tắt tiếng

### Thẻ & Container
- Nền: `#ffffff`
- Viền: `1px solid #e5edf5` (chuẩn) hoặc `1px solid #061b31` (điểm nhấn tối)
- Radius: 4px (chật), 5px (chuẩn), 6px (thoải mái), 8px (nổi bật)
- Bóng (chuẩn): `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px`
- Bóng (môi trường): `rgba(23,23,23,0.08) 0px 15px 35px 0px`
- Hover: bóng tăng cường, thường thêm lớp màu xanh

### Huy Hiệu / Thẻ Tag / Pill
**Pill Trung Tính**
- Nền: `#ffffff`
- Chữ: `#000000`
- Padding: 0px 6px
- Radius: 4px
- Viền: `1px solid #f6f9fc`
- Font: 11px weight 400

**Huy Hiệu Thành Công**
- Nền: `rgba(21,190,83,0.2)`
- Chữ: `#108c3d`
- Padding: 1px 6px
- Radius: 4px
- Viền: `1px solid rgba(21,190,83,0.4)`
- Font: 10px weight 300

### Input & Form
- Viền: `1px solid #e5edf5`
- Radius: 4px
- Focus: `1px solid #533afd` hoặc vòng tím
- Nhãn: `#273951`, 14px sohne-var
- Chữ: `#061b31`
- Placeholder: `#64748d`

### Điều Hướng
- Nav ngang gọn gàng trên nền trắng, dính với backdrop mờ
- Logo thương hiệu căn trái
- Liên kết: sohne-var 14px weight 400, chữ `#061b31` với `"ss01"`
- Radius: 6px cho container nav
- CTA: nút tím căn phải ("Đăng nhập", "Bắt đầu ngay")
- Mobile: nút toggle hamburger với radius 6px

### Yếu Tố Trang Trí
**Viền Nét Đứt**
- `1px dashed #362baa` (tím) cho vùng placeholder/thả
- `1px dashed #ffd7ef` (magenta) cho viền trang trí chủ đề magenta

**Điểm Nhấn Gradient**
- Gradient đỏ ruby đến hồng magenta (`#ea2261` sang `#f96bee`) cho trang trí hero
- Khu vực thương hiệu tối dùng nền `#1c1e54` với chữ trắng

## 5. Nguyên Tắc Layout

### Hệ Thống Khoảng Cách
- Đơn vị cơ bản: 8px
- Thang: 1px, 2px, 4px, 6px, 8px, 10px, 11px, 12px, 14px, 16px, 18px, 20px
- Đáng chú ý: Thang dày đặc ở đầu nhỏ (cứ 2px từ 4–12), phản ánh UI hướng chính xác của Stripe cho dữ liệu tài chính

### Lưới & Container
- Chiều rộng nội dung tối đa: khoảng 1080px
- Hero: một cột giữa với padding rộng rãi, tiêu đề nhẹ
- Khu vực tính năng: lưới 2–3 cột cho thẻ tính năng
- Khu vực tối toàn chiều rộng với nền `#1c1e54` để đắm chìm thương hiệu
- Xem trước code/dashboard như các thẻ chứa với bóng màu xanh

### Triết Lý Khoảng Trắng
- **Khoảng cách chính xác**: Khác với sự trống rỗng bao la của các hệ thống tối giản, Stripe dùng khoảng trắng có chủ đích, đã được đo lường. Mỗi khoảng trống là một lựa chọn typography có chủ ý.
- **Dữ liệu dày đặc, chrome rộng rãi**: Hiển thị dữ liệu tài chính (bảng, biểu đồ) được đóng gói chặt, nhưng chrome UI xung quanh chúng có khoảng cách rộng rãi. Điều này tạo ra cảm giác mật độ được kiểm soát — như một bảng tính được tổ chức tốt trong một khung đẹp.
- **Nhịp điệu khu vực**: Các khu vực trắng xen kẽ với các khu vực thương hiệu tối (`#1c1e54`), tạo nhịp điệu sáng/tối ấn tượng ngăn ngừa sự đơn điệu mà không đưa vào màu sắc tùy tiện.

### Thang Bo Góc
- Micro (1px): Phần tử tinh tế, bo góc nhẹ
- Chuẩn (4px): Nút, input, huy hiệu, thẻ — người lao động chính
- Thoải Mái (5px): Container thẻ chuẩn
- Thư Giãn (6px): Điều hướng, phần tử tương tác lớn hơn
- Lớn (8px): Thẻ nổi bật, phần tử hero
- Ghép: `0px 0px 6px 6px` cho container bo góc dưới (bảng tab, footer dropdown)

## 6. Chiều Sâu & Độ Cao

| Cấp Độ | Xử Lý | Dùng Cho |
|-------|-----------|-----|
| Phẳng (Cấp 0) | Không bóng | Nền trang, văn bản inline |
| Môi Trường (Cấp 1) | `rgba(23,23,23,0.06) 0px 3px 6px` | Nâng thẻ nhẹ, gợi ý hover |
| Chuẩn (Cấp 2) | `rgba(23,23,23,0.08) 0px 15px 35px` | Thẻ chuẩn, bảng nội dung |
| Nâng Cao (Cấp 3) | `rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px` | Thẻ nổi bật, dropdown, popover |
| Sâu (Cấp 4) | `rgba(3,3,39,0.25) 0px 14px 21px -14px, rgba(0,0,0,0.1) 0px 8px 17px -8px` | Modal, bảng nổi |
| Vòng (Khả Năng Tiếp Cận) | viền `2px solid #533afd` | Vòng focus bàn phím |

**Triết Lý Bóng Đổ**: Hệ thống bóng của Stripe được xây dựng trên nguyên tắc chiều sâu màu sắc. Trong khi hầu hết hệ thống thiết kế dùng bóng xám trung tính hoặc đen, màu bóng chính của Stripe (`rgba(50,50,93,0.25)`) là xanh xám đậm phản chiếu bảng màu navy của thương hiệu. Điều này tạo ra những cái bóng không chỉ thêm chiều sâu — mà còn thêm bầu không khí thương hiệu. Phương pháp nhiều lớp ghép bóng màu xanh này với lớp đen thuần phụ (`rgba(0,0,0,0.1)`) ở offset khác, tạo ra chiều sâu kiểu parallax nơi bóng mang màu thương hiệu ngồi xa hơn phần tử và bóng trung tính ngồi gần hơn. Các giá trị spread âm (-30px, -18px) đảm bảo bóng không mở rộng ra ngoài dấu chân ngang của phần tử, giữ độ cao theo chiều dọc và kiểm soát được.

### Chiều Sâu Trang Trí
- Khu vực thương hiệu tối (`#1c1e54`) tạo chiều sâu đắm chìm thông qua tương phản màu nền
- Lớp phủ gradient với chuyển tiếp đỏ ruby sang hồng magenta cho trang trí hero
- Màu bóng `rgba(0,55,112,0.08)` (`--hds-color-shadow-sm-top`) cho bóng cạnh trên của phần tử dính

## 7. Nên Làm & Không Nên Làm

### Nên Làm
- Dùng sohne-var với `"ss01"` trên mỗi phần tử văn bản — bộ stylistic CHÍNH LÀ thương hiệu
- Dùng weight 300 cho tất cả tiêu đề và văn bản nội dung — sự nhẹ nhàng là đặc trưng
- Áp dụng bóng màu xanh (`rgba(50,50,93,0.25)`) cho tất cả phần tử nâng cao
- Dùng `#061b31` (xanh navy đậm) cho tiêu đề thay vì `#000000` — sự ấm áp rất quan trọng
- Giữ border-radius trong khoảng 4px–8px — bo góc bảo thủ là có chủ ý
- Dùng `"tnum"` cho bất kỳ hiển thị số dạng bảng/tài chính nào
- Xếp lớp bóng: xanh xa + trung tính gần để tạo parallax chiều sâu
- Dùng tím `#533afd` làm màu tương tác/CTA chính

### Không Nên Làm
- Đừng dùng weight 600–700 cho tiêu đề sohne-var — weight 300 là giọng nói thương hiệu
- Đừng dùng border-radius lớn (12px+, hình viên thuốc) trên thẻ hoặc nút — Stripe bảo thủ
- Đừng dùng bóng xám trung tính — luôn tô màu xanh (`rgba(50,50,93,...)`)
- Đừng bỏ qua `"ss01"` trên bất kỳ văn bản sohne-var nào — các glyph thay thế định nghĩa tính cách
- Đừng dùng đen thuần (`#000000`) cho tiêu đề — luôn dùng `#061b31` xanh navy đậm
- Đừng dùng màu nhấn ấm (cam, vàng) cho phần tử tương tác — tím là màu chính
- Đừng áp dụng khoảng cách chữ dương ở cỡ hiển thị — Stripe tracking chặt
- Đừng dùng các điểm nhấn magenta/ruby cho nút hoặc liên kết — chúng chỉ dành cho trang trí/gradient

## 8. Hành Vi Responsive

### Breakpoint
| Tên | Chiều Rộng | Thay Đổi Chính |
|------|-------|-------------|
| Mobile | <640px | Một cột, cỡ tiêu đề thu nhỏ, thẻ xếp chồng |
| Tablet | 640–1024px | Lưới 2 cột, padding vừa phải |
| Desktop | 1024–1280px | Layout đầy đủ, lưới tính năng 3 cột |
| Desktop Lớn | >1280px | Nội dung giữa với lề rộng rãi |

### Vùng Chạm
- Nút có padding thoải mái (8px–16px dọc)
- Liên kết điều hướng 14px với khoảng cách đầy đủ
- Huy hiệu có ít nhất 6px padding ngang cho vùng tap
- Nút toggle nav mobile với radius 6px

### Chiến Lược Thu Gọn
- Hero: hiển thị 56px -> 32px trên mobile, duy trì weight 300
- Điều hướng: liên kết ngang + CTA -> toggle hamburger
- Thẻ tính năng: 3 cột -> 2 cột -> một cột xếp chồng
- Khu vực thương hiệu tối: duy trì xử lý toàn chiều rộng, giảm padding bên trong
- Bảng dữ liệu tài chính: cuộn ngang trên mobile
- Khoảng cách khu vực: 64px+ -> 40px trên mobile
- Thang typography thu lại: cỡ hero 56px -> 48px -> 32px qua các breakpoint

### Hành Vi Hình Ảnh
- Screenshot dashboard/sản phẩm duy trì bóng màu xanh ở mọi kích thước
- Trang trí gradient hero đơn giản hóa trên mobile
- Khối code duy trì xử lý `SourceCodePro`, có thể cuộn ngang
- Hình ảnh thẻ duy trì border-radius nhất quán 4px–6px

## 9. Hướng Dẫn Prompt Cho Agent

### Tham Chiếu Màu Nhanh
- CTA chính: Tím Stripe (`#533afd`)
- Hover CTA: Tím Đậm (`#4434d4`)
- Nền: Trắng Tinh Khiết (`#ffffff`)
- Tiêu đề: Xanh Navy Đậm (`#061b31`)
- Nội dung: Xám Xanh (`#64748d`)
- Văn bản nhãn: Xám Xanh Đậm (`#273951`)
- Viền: Xanh Nhạt (`#e5edf5`)
- Liên kết: Tím Stripe (`#533afd`)
- Khu vực tối: Thương Hiệu Tối (`#1c1e54`)
- Thành công: Xanh Lá (`#15be53`)
- Nhấn trang trí: Đỏ Ruby (`#ea2261`), Hồng Magenta (`#f96bee`)

### Ví Dụ Prompt Component
- "Tạo khu vực hero trên nền trắng. Tiêu đề 48px sohne-var weight 300, line-height 1.15, letter-spacing -0.96px, màu #061b31, font-feature-settings 'ss01'. Phụ đề 18px weight 300, line-height 1.40, màu #64748d. Nút CTA tím (#533afd, radius 4px, padding 8px 16px, chữ trắng) và nút ghost (trong suốt, 1px solid #b9b9f9, chữ #533afd, radius 4px)."
- "Thiết kế thẻ: nền trắng, viền 1px solid #e5edf5, radius 6px. Bóng: rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px. Tiêu đề 22px sohne-var weight 300, letter-spacing -0.22px, màu #061b31, 'ss01'. Nội dung 16px weight 300, #64748d."
- "Xây dựng huy hiệu thành công: nền rgba(21,190,83,0.2), chữ #108c3d, radius 4px, padding 1px 6px, 10px sohne-var weight 300, viền 1px solid rgba(21,190,83,0.4)."
- "Tạo điều hướng: header dính trắng với backdrop-filter blur(12px). sohne-var 14px weight 400 cho liên kết, chữ #061b31, 'ss01'. CTA tím 'Bắt đầu ngay' căn phải (nền #533afd, chữ trắng, radius 4px). Container nav radius 6px."
- "Thiết kế khu vực thương hiệu tối: nền #1c1e54, chữ trắng. Tiêu đề 32px sohne-var weight 300, letter-spacing -0.64px, 'ss01'. Nội dung 16px weight 300, rgba(255,255,255,0.7). Thẻ bên trong dùng viền rgba(255,255,255,0.1) với radius 6px."

### Hướng Dẫn Lặp
1. Luôn bật `font-feature-settings: "ss01"` trên văn bản sohne-var — đây là DNA typography của thương hiệu
2. Weight 300 là mặc định; chỉ dùng 400 cho nút/liên kết/điều hướng
3. Công thức bóng: `rgba(50,50,93,0.25) 0px Y1 B1 -S1, rgba(0,0,0,0.1) 0px Y2 B2 -S2` trong đó Y1/B1 lớn hơn (bóng xa) và Y2/B2 nhỏ hơn (bóng gần)
4. Màu tiêu đề là `#061b31` (xanh navy đậm), nội dung là `#64748d` (xám xanh), nhãn là `#273951` (xám xanh đậm)
5. Border-radius giữ trong khoảng 4px–8px — không dùng hình viên thuốc hoặc bo góc lớn
6. Dùng `"tnum"` cho bất kỳ số nào trong bảng, biểu đồ, hoặc hiển thị tài chính
7. Khu vực tối dùng `#1c1e54` — không phải đen, không phải xám, mà là indigo thương hiệu sâu
8. SourceCodePro cho code ở 12px/500 với line-height 2.00 (rất rộng rãi cho khả năng đọc)
