# Design System Inspired by OpenAI

> Category: AI & LLM
> Hệ thống gần như đơn sắc, bình tĩnh, lấy màu teal-đen đậm làm nền tảng, kết hợp khoảng trắng rộng rãi và kiểu chữ mang phong cách báo chí.

## 1. Chủ Đề Hình Ảnh & Không Khí

Bề mặt sản phẩm của OpenAI gợi lên hình ảnh một phòng thí nghiệm nghiên cứu được chỉnh trang để ra mắt công chúng — lâm sàng, kiềm chế, chủ ý giữ yên lặng. Nền trang là trắng tinh (`#ffffff`) xếp lớp trên mực gần đen (`#0d0d0d`) với ánh teal tinh tế, khiến ngay cả văn bản cũng mang cảm giác hơi lạnh thay vì tối một cách quyết liệt. Kết quả là một sự trung tính màu sắc đặt đầu ra mô hình, mã lệnh và văn xuôi lên hàng đầu, không phải lớp giao diện bao quanh chúng.

Dấu hiệu nhận diện là việc dùng **Söhne** (hoặc font hệ thống thay thế `inter`) ở độ đậm vừa phải — 400 cho phần thân, 500 cho điều hướng và nhãn, 600 cho nhấn mạnh — kết hợp với **Signifier**, một font chữ serif hiện đại dùng cho tiêu đề hiển thị mang tính biên tập. Trong khi phần lớn thương hiệu AI nghiêng về tương lai, những tiêu đề serif của OpenAI mang lại cho sản phẩm một giọng điệu văn học kín đáo, như thể mỗi thông báo đều là một bài luận.

Hệ thống hình dạng đồng nhất và mềm mại: bán kính 8px–12px, pill 9999px cho thẻ và chip, không có góc cạnh thô ráp ở bất kỳ đâu. Ranh giới giữa các section được đánh dấu bằng khoảng trắng thay vì đường kẻ phân cách; khi đường viền xuất hiện, chúng là những đường chân tóc `#e5e5e5` mang cảm giác như sự vắng mặt của màu sắc hơn là sự hiện diện của nó.

**Key Characteristics:**
- Nền trắng tinh (`#ffffff`) với mực teal-đen đậm (`#0d0d0d`)
- Söhne / Inter ở độ đậm khiêm tốn (400, 500, 600) — kiềm chế hơn là khẳng định
- Serif Signifier cho tiêu đề hiển thị mang phong cách biên tập
- Bán kính mềm 8–12px ở mọi nơi; pill 9999px cho chip
- Đường viền chân tóc (`#e5e5e5`) dùng tiết kiệm; khoảng trắng là yếu tố phân cách chính
- Minh họa đơn màu teal đậm — không có gradient trong các dấu hiệu
- Line-height rộng rãi (1.55–1.65) và tracking gần bằng không

## 2. Bảng Màu & Vai Trò

### Primary
- **Pure White** (`#ffffff`): Nền chính, bề mặt card, nền nút.
- **Ink Black** (`#0d0d0d`): Văn bản chính, dấu thương hiệu, CTA chính.
- **Soft Black** (`#1a1a1a`): Tiêu đề phụ, mực thay thế cho văn bản không quan trọng.

### Surface & Background
- **Mist** (`#fafafa`): Nền ngắt section, bề mặt footer.
- **Pearl** (`#f5f5f5`): Bề mặt card, panel nổi.
- **Cloud** (`#ececec`): Nền bị tắt, tô màu đường phân cách.

### Brand Accent
- **OpenAI Teal** (`#10a37f`): Màu chính của thương hiệu, link, huy hiệu nổi bật — màu duy nhất trong một hệ thống vốn trung tính.
- **Teal Deep** (`#0a7a5e`): Trạng thái hover và nhấn cho màu thương hiệu.
- **Teal Soft** (`#e8f5f0`): Tô màu bề mặt cho huy hiệu thành công, chú thích nổi bật.

### Neutrals & Text
- **Graphite** (`#3c3c3c`): Văn bản nội dung, màu đọc mặc định.
- **Slate** (`#6e6e6e`): Văn bản phụ, chú thích, metadata.
- **Ash** (`#9b9b9b`): Văn bản bậc ba, placeholder, nhãn bị tắt.
- **Stone** (`#c4c4c4`): Đường phân cách trang trí, biểu tượng mờ.

### Semantic & Border
- **Border Hairline** (`#e5e5e5`): Đường phân cách chân tóc tiêu chuẩn.
- **Border Soft** (`#ededed`): Đường viền card trên nền trắng.
- **Error** (`#ef4146`): Xác nhận, hành động hủy.
- **Warning** (`#f5a623`): Màu hổ phách nhẹ cho trạng thái cảnh báo.
- **Info** (`#2563eb`): Sắc độ link thông tin (dùng tiết kiệm; teal vẫn chiếm ưu thế).

## 3. Quy Tắc Typography

### Font Family
- **Display / Editorial**: `Signifier`, với fallback: `'Source Serif Pro', Georgia, serif`
- **Body / UI**: `Söhne`, với fallback: `Inter, system-ui, -apple-system, 'Segoe UI', sans-serif`
- **Code / Mono**: `Söhne Mono`, với fallback: `ui-monospace, 'JetBrains Mono', Menlo, Consolas, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display | Signifier | 56px (3.5rem) | 400 | 1.08 | -0.02em | Hero biên tập, tiêu đề thông báo |
| H1 | Söhne | 40px (2.5rem) | 600 | 1.15 | -0.01em | Tiêu đề trang |
| H2 | Söhne | 28px (1.75rem) | 600 | 1.2 | -0.005em | Tiêu đề section |
| H3 | Söhne | 20px (1.25rem) | 600 | 1.3 | normal | Tiêu đề phụ section |
| Body Large | Söhne | 18px (1.125rem) | 400 | 1.6 | normal | Đoạn văn mở đầu |
| Body | Söhne | 16px (1rem) | 400 | 1.65 | normal | Văn bản đọc tiêu chuẩn |
| Body Small | Söhne | 14px (0.875rem) | 400 | 1.55 | normal | Nội dung card, giao diện dày đặc |
| Caption | Söhne | 13px (0.8125rem) | 500 | 1.4 | 0.01em | Metadata, huy hiệu |
| Label | Söhne | 12px (0.75rem) | 500 | 1.3 | 0.04em | Eyebrow, liên kết điều hướng viết hoa |
| Code | Söhne Mono | 14px (0.875rem) | 400 | 1.55 | normal | Khối mã, đầu ra terminal |

### Nguyên Tắc
- **Kiềm chế là bản sắc**: độ đậm tối đa 600; 700+ trông không phù hợp với thương hiệu. Phân cấp đến từ kích thước và màu sắc, không phải độ đậm.
- **Serif cho hồn, sans cho hệ thống**: Signifier chỉ xuất hiện trong những khoảnh khắc hiển thị biên tập. Giao diện sản phẩm chỉ dùng sans.
- **Tracking âm trên display**: -0.02em ở kích thước display; tracking trở về không ở 16px.

## 4. Phong Cách Component

### Buttons

**Primary**
- Background: `#0d0d0d`
- Text: `#ffffff`
- Padding: 10px 18px
- Radius: 9999px (full pill) trên chip, 12px trên CTA dạng chữ nhật
- Hover: nền `#1a1a1a`
- Dùng cho: CTA chính, "Try ChatGPT", "Sign in"

**Secondary**
- Background: `#ffffff`
- Text: `#0d0d0d`
- Border: 1px solid `#e5e5e5`
- Padding: 10px 18px
- Radius: 12px
- Hover: nền `#fafafa`, border `#d4d4d4`

**Brand Accent**
- Background: `#10a37f`
- Text: `#ffffff`
- Padding: 10px 18px
- Radius: 12px
- Hover: `#0a7a5e`
- Dùng cho: CTA nâng cấp nổi bật, luồng thành công

### Cards
- Background: `#ffffff`
- Border: 1px solid `#ededed`
- Radius: 16px
- Padding: 24px–32px
- Shadow: không có mặc định; khi hover `0 4px 16px rgba(13,13,13,0.06)`

### Inputs
- Background: `#ffffff`
- Border: 1px solid `#e5e5e5`
- Radius: 12px
- Padding: 12px 14px
- Focus: border `#10a37f`, ring `0 0 0 3px rgba(16,163,127,0.12)`

### Pills & Tags
- Background: `#f5f5f5`
- Text: `#3c3c3c`
- Padding: 4px 10px
- Radius: 9999px
- Font: 12px / 500

## 5. Spacing & Layout

- **Đơn vị cơ bản**: 4px. Thang: 4, 8, 12, 16, 24, 32, 48, 64, 96, 128.
- **Container**: max-width 1200px, gutter 24px trên mobile, 48px trên desktop.
- **Nhịp section**: 96–128px dọc giữa các section chính; 64px trên mobile.
- **Grid**: 12 cột desktop, 4 cột mobile, khoảng cách 24px.

## 6. Motion

- **Duration**: 150–220ms cho hover; 280–360ms cho chuyển đổi layout.
- **Easing**: `cubic-bezier(0.16, 1, 0.3, 1)` (smooth out) cho entrance.
- **Kiềm chế**: không parallax, không scroll-jacking. Chỉ dùng fade và translate tinh tế.

## 7. Hướng Dẫn Sử Dụng

- Duy trì sự kiềm chế biên tập trung tính, bán kính mềm và việc dùng accent tiết kiệm cùng nhau; accent xanh lá đơn độc không tạo ra bề mặt mang phong cách OpenAI.
- Chỉ dùng những khoảnh khắc hiển thị kiểu Signifier cho phân cấp biên tập hoặc thông báo, giữ các control sản phẩm trong hệ thống sans.
- Tránh motion trang trí, shadow nặng và card trang trí quá khổ; hệ thống phải mang cảm giác bình tĩnh, dễ đọc và có chủ đích.
