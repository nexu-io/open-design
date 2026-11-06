# Hệ thống thiết kế lấy cảm hứng từ Duolingo

> Category: Năng suất & SaaS
> Nền tảng học ngôn ngữ. Xanh cú mèo tươi sáng, bóng đổ dày, niềm vui gamification.

## 1. Chủ đề hình ảnh và bầu không khí

Duolingo là gamification được thể hiện qua ngôn ngữ hình ảnh. Giao diện sáng rực một cách không ngại ngùng, với **xanh cú mèo** (`#58cc02`) là màu chính của thương hiệu và bóng đổ dày 4px ở đáy mỗi phần tử tương tác trông như một nút 3D đang chờ được nhấn. Trang có nền trắng (`#ffffff`) với viền dày 2–3px màu xám đậm (`#e5e5e5`), toàn bộ hệ thống gợi nhớ đến ứng dụng iOS năm 2015 được tái sinh với phân cấp tốt hơn.

Kiểu chữ dùng **Feather Bold** (phông sans-serif bo tròn tùy chỉnh) cho chrome và **Mona Sans** (hoặc Inter) cho thân văn bản. Kích thước hiển thị lớn và tự tin — Duolingo không bao giờ thì thầm. Tiêu đề thường có nét gạch chân màu xanh hoặc đặt trên viên thuốc xanh, và linh vật Duo (một con cú xanh) xuất hiện như một nhân vật minh họa năng động, không phải logo tĩnh.

Ngôn ngữ hình dạng thân thiện: bán kính 16–20px trên thẻ, 12px trên nút, 9999px trên chip và thanh tiến trình. Biểu tượng được tô đầy, bo tròn và mã hóa màu theo kỹ năng — mỗi bề mặt bài học có một cặp màu có thể nhận biết ngay lập tức.

**Đặc điểm chính:**
- Xanh cú mèo (`#58cc02`) là màu thương hiệu chiếm ưu thế, dùng trên hơn 30% bề mặt
- Bóng đổ dày 4px ở đáy mỗi nút (tính năng "nhấn xúc giác")
- Viền đặc 2–3px, không bao giờ dùng đường mảnh
- Feather Bold (hiển thị bo tròn) + Mona Sans (thân văn bản)
- Chữ lớn tự tin — kích thước hiển thị bắt đầu từ 48px và tăng lên
- Linh vật-nhân vật: cú Duo xuất hiện trong onboarding, lỗi, chuỗi
- Cam chuỗi (`#ff9600`) và hồng đá quý (`#ce82ff`) là màu thương hiệu phụ

## 2. Bảng màu và vai trò

### Màu chính
- **Xanh cú mèo** (`#58cc02`): Màu chính thương hiệu, CTA chính, câu trả lời đúng.
- **Xanh cú mèo đậm** (`#58a700`): Màu nhấn/bóng cho nút xanh.
- **Xanh cú mèo nhạt** (`#89e219`): Hover, tô màu nhẹ.
- **Xanh cú mèo lạt** (`#dbf8c5`): Bề mặt nhẹ, banner thành công.

### Điểm nhấn phụ
- **Cam chuỗi** (`#ff9600`): Đếm chuỗi, biểu tượng lửa, năng lượng cao cấp.
- **Cam chuỗi đậm** (`#cc7a00`): Cam khi nhấn.
- **Hồng đá quý** (`#ce82ff`): Tiền tệ đá quý, Super Duolingo.
- **Xanh lươn** (`#1cb0f6`): Nút gợi ý, liên kết thông tin.
- **Đỏ hồng y** (`#ff4b4b`): Câu trả lời sai, mất mạng.
- **Vàng ong** (`#ffc800`): Huy hiệu chuyên nghiệp, thành tích.

### Bề mặt
- **Tuyết** (`#ffffff`): Nền chính.
- **Lươn** (`#f7f7f7`): Phân tách phần, bề mặt phụ.
- **Thiên nga** (`#e5e5e5`): Nền bị vô hiệu hóa, khối nhúng.
- **Sói** (`#777777`): Đường phân chia tối, văn bản phụ.

### Mực và văn bản
- **Đen lươn** (`#3c3c3c`): Văn bản chính.
- **Sói** (`#777777`): Văn bản phụ, chú thích.
- **Thỏ** (`#afafaf`): Bị vô hiệu hóa, chỗ đặt dữ liệu.

### Viền
- **Thiên nga** (`#e5e5e5`): Viền tiêu chuẩn 2px.
- **Thỏ** (`#afafaf`): Viền nhấn mạnh khi hover.

## 3. Quy tắc kiểu chữ

### Họ phông chữ
- **Hiển thị / UI / Tiêu đề**: `Feather Bold`, dự phòng: `'DIN Round Pro', 'Helvetica Neue', sans-serif`
- **Thân văn bản / Dài**: `Mona Sans`, dự phòng: `'Helvetica Neue', system-ui, sans-serif`
- **Mã (hiếm, trường học/quản trị)**: `JetBrains Mono`, dự phòng: `ui-monospace, Menlo, monospace`

### Phân cấp

| Vai trò | Phông | Kích thước | Độ đậm | Chiều cao dòng | Khoảng cách | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Hiển thị | Feather Bold | 56px (3.5rem) | 800 | 1.05 | -0.01em | Anh hùng onboarding |
| H1 | Feather Bold | 32px (2rem) | 800 | 1.15 | -0.005em | Tiêu đề trang |
| H2 | Feather Bold | 24px (1.5rem) | 800 | 1.2 | normal | Tiêu đề phần |
| H3 | Feather Bold | 18px (1.125rem) | 700 | 1.25 | normal | Tiêu đề thẻ, hàng bài học |
| Thân lớn | Mona Sans | 17px (1.0625rem) | 500 | 1.5 | normal | Gợi ý bài học, hướng dẫn |
| Thân | Mona Sans | 15px (0.9375rem) | 400 | 1.5 | normal | Văn xuôi tiêu chuẩn |
| Chú thích | Mona Sans | 13px (0.8125rem) | 600 | 1.4 | 0.01em | Đếm XP, siêu dữ liệu |
| Nút | Feather Bold | 16px (1rem) | 800 | 1.2 | 0.02em | Nhãn nút tiêu chuẩn |
| Chuỗi | Feather Bold | 14px (0.875rem) | 800 | 1.2 | normal | Số chuỗi, trên ngọn lửa |

### Nguyên tắc
- **800 là mặc định**: Feather Bold chạy ở 800 trên tiêu đề và nút. 700 trông yếu trong hệ thống này.
- **Chữ lớn**: kích thước tiêu đề lớn hơn 25–40% so với các thương hiệu sản phẩm điển hình — sự tự tin là bản sắc.
- **Hình dạng chữ bo tròn**: mỗi glyph có đầu cuối mềm mại; chân cứng sẽ phá vỡ hợp đồng thân thiện.

## 4. Kiểu dáng thành phần

### Nút

**Chính (Xanh cú mèo)**
- Nền: `#58cc02`
- Văn bản: `#ffffff`
- Đệm: 14px 24px
- Bán kính: 16px
- Border-bottom: 4px solid `#58a700` (bóng đổ dày)
- Hover: nền `#89e219`
- Kích hoạt: translate-y 4px, border-bottom 0 (nút "nhấn xuống")
- Dùng: "Tiếp tục", "Kiểm tra", CTA chính.

**Phụ (Trắng có bóng dưới)**
- Nền: `#ffffff`
- Văn bản: `#777777`
- Viền: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Bán kính: 16px
- Đệm: 14px 24px
- Hover: văn bản `#3c3c3c`, viền `#afafaf`

**Cam chuỗi**
- Nền: `#ff9600`
- Văn bản: `#ffffff`
- Border-bottom: 4px solid `#cc7a00`
- Dùng: mục tiêu chuỗi, "Bắt đầu chuỗi"

**Lỗi (Đỏ hồng y)**
- Nền: `#ff4b4b`
- Văn bản: `#ffffff`
- Border-bottom: 4px solid `#cc3b3b`
- Dùng: phản hồi câu trả lời sai.

### Thẻ / Ô bài học
- Nền: `#ffffff`
- Viền: 2px solid `#e5e5e5`
- Border-bottom: 4px solid `#e5e5e5`
- Bán kính: 16px
- Đệm: 16px
- Hover: nâng 2px, bóng `0 4px 0 #d7d7d7`

### Nút cây kỹ năng (Bong bóng bài học)
- Kích thước: 80×72px
- Nền: tông màu kỹ năng (xanh khi kích hoạt, xám khi khóa)
- Border-bottom: 6px solid biến thể đậm hơn
- Bán kính: 50% (tròn)
- Kích hoạt: nhịp 1.0 → 1.05 mỗi 1.6s

### Ô nhập liệu
- Nền: `#ffffff`
- Viền: 2px solid `#e5e5e5`
- Bán kính: 12px
- Đệm: 12px 16px
- Tiêu điểm: viền `#1cb0f6` (xanh lươn), vòng `0 0 0 3px rgba(28, 176, 246, 0.2)`

### Thanh tiến trình
- Đường ray: `#e5e5e5`
- Tô: `#58cc02` (hoặc `#ff9600` cho chuỗi)
- Bán kính: 9999px
- Chiều cao: 16px
- Tô hoạt ảnh: 320ms ease-out khi tăng.

## 5. Khoảng cách & Bố cục

- **Đơn vị cơ sở**: 4px. Thang: 4, 8, 12, 16, 24, 32, 48, 64.
- **Vùng chứa**: tối đa 1080px, rãnh 24px.
- **Cột cây bài học**: rộng 320px; canh giữa trên desktop.

## 6. Chuyển động

- **Thời lượng**: 180ms nhấn nút; 320ms mở khóa nút kỹ năng; 1.6s nhịp nút kích hoạt.
- **Easing**: `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-out, vượt nhẹ) cho mở khóa.
- **Linh vật**: Duo chớp mắt mỗi 4–6s, nhảy tại các mốc chuỗi (480ms ease-out lò xo).

## 7. Hướng dẫn sử dụng

- Giữ nguyên màu xanh cú mèo bão hòa cao, bóng đổ dày ở đáy và hình học bài học bo tròn cùng nhau; nút xanh phẳng đơn lẻ không tạo ra cảm giác Duolingo.
- Dành kiểu chữ đậm cỡ lớn cho các khoảnh khắc bài học, chuỗi và tiến trình khi sản phẩm cần sự khích lệ hoặc phản hồi.
- Dùng chuyển động vui nhộn tiết kiệm xung quanh các thay đổi trạng thái tiến trình, tránh hoạt ảnh nảy generic trên mọi điều khiển.
