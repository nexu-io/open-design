# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ GitHub

> Category: Công Cụ Dành Cho Nhà Phát Triển
> Nền tảng ưu tiên mã nguồn. Mật độ chức năng cao, độ chính xác xanh-trên-trắng, nền tảng Primer.

## 1. Chủ Đề Hình Ảnh & Không Khí

Bề mặt của GitHub được thiết kế theo kiểu kỹ thuật, không phải trang trí. Mỗi pixel đều thể hiện một quan điểm rõ ràng: đây là công cụ dành cho những người quan tâm đến diff, build và pull request. Nền trang là `#ffffff` sạch sẽ (chế độ sáng) hoặc `#0d1117` (chế độ tối), với nội dung được sắp xếp trên các ô chữ nhật dày đặc được phân cách bằng các đường viền mỏng như tóc thay vì khoảng trắng. Mật độ thông tin là thương hiệu — các hàng danh sách, dòng mã, tiêu đề kho lưu trữ và thẻ thông báo đều được xếp gần nhau để người dùng chuyên nghiệp có thể quét hàng trăm mục mà không cần cuộn.

Điểm nhấn đặc trưng là **màu xanh Primer** (`#0969da`) cho các liên kết và hành động chính, và **màu xanh lá GitHub** (`#1a7f37`) cho trạng thái đã hợp nhất, thành công và nút hợp nhất. Cả hai màu đều có vẻ hơi tắt so với màu xanh dương và xanh lá của các sản phẩm dành cho người tiêu dùng — đủ bão hòa để đọc được trên nền chữ xám dày đặc, nhưng đủ kiềm chế để hòa vào nền khi nhiều màu xuất hiện trong cùng một khung nhìn.

Typography sử dụng bộ font **system-ui** xuyên suốt toàn bộ sản phẩm để văn bản hiển thị sắc nét trên mọi hệ điều hành, kết hợp với **SFMono / Menlo / Consolas** cho mã nguồn. Không có font hiển thị biên tập; giọng văn của GitHub chính là giọng của hệ thống mà bạn đang sử dụng.

**Đặc Điểm Chính:**
- Nền trắng thuần (`#ffffff`) hoặc xanh đen đậm (`#0d1117`) — không ấm áp, không tông màu
- Đường viền xám mỏng như tóc (`#d0d7de`) xác định mọi ô và bảng
- Màu xanh Primer (`#0969da`) cho liên kết/chính; màu xanh lá GitHub (`#1a7f37`) cho thành công/hợp nhất
- system-ui cho văn xuôi; SFMono cho mã — không có kiểu chữ tùy chỉnh
- Các hàng danh sách dày đặc với padding tối thiểu; khoảng trắng hiếm gặp
- Biểu tượng Octicon ở 16px / 24px — nét đơn, hình học, nhất quán
- Huy hiệu trạng thái dạng pill với ngữ nghĩa màu sắc mạnh

## 2. Bảng Màu & Vai Trò

### Chính
- **Canvas Default** (`#ffffff`): Nền trang chính, chủ đề sáng.
- **Canvas Subtle** (`#f6f8fa`): Bề mặt phụ, thanh bên, nền ô nhập liệu, dải tiêu đề.
- **Canvas Inset** (`#eaeef2`): Nền khối mã, bề mặt nhúng sâu.
- **Fg Default** (`#1f2328`): Văn bản chính, tiêu đề, mực in.
- **Fg Muted** (`#656d76`): Văn bản phụ, chú thích, đường dẫn file.

### Điểm Nhấn Thương Hiệu
- **Primer Blue** (`#0969da`): Liên kết, CTA chính, vòng tiêu điểm — màu tương tác toàn cục.
- **Primer Blue Hover** (`#0550ae`): Trạng thái hover/nhấn cho màu xanh chính.
- **Accent Subtle** (`#ddf4ff`): Bề mặt xanh nhạt cho các hộp chú ý, banner thông tin.

### Ngữ Nghĩa
- **Success / Merge Green** (`#1a7f37`): PR đã hợp nhất, huy hiệu thành công, nút hợp nhất.
- **Success Subtle** (`#dafbe1`): Tông màu bề mặt thành công.
- **Open Green** (`#1a7f37`): Trạng thái issue/PR đang "mở".
- **Closed / Danger Red** (`#cf222e`): PR đã đóng, hành động phá hủy, lỗi xác thực.
- **Danger Subtle** (`#ffebe9`): Bề mặt banner lỗi.
- **Attention / Warning Yellow** (`#9a6700`): Văn bản cảnh báo trên nền hổ phách.
- **Attention Subtle** (`#fff8c5`): Bề mặt banner cảnh báo.
- **Done Purple** (`#8250df`): Đã hợp nhất và lưu trữ, trạng thái "hoàn thành", huy hiệu cao cấp.
- **Sponsor Pink** (`#bf3989`): Biểu tượng trái tim Sponsors, thương hiệu GitHub sponsors.

### Đường Viền & Phân Cách
- **Border Default** (`#d0d7de`): Đường viền mỏng tiêu chuẩn, viền ô.
- **Border Muted** (`#d8dee4`): Đường phân cách bên trong một ô.
- **Border Subtle** (`#eaeef2`): Đường phân cách hàng bảng mờ nhạt.

### Chủ Đề Tối
- **Dark Canvas** (`#0d1117`): Nền trang tối.
- **Dark Surface** (`#161b22`): Thanh bên, tiêu đề, bề mặt phụ.
- **Dark Border** (`#30363d`): Đường viền tiêu chuẩn chế độ tối.
- **Dark Fg** (`#e6edf3`): Văn bản chính trên nền tối.

## 3. Quy Tắc Typography

### Font Chữ
- **Nội dung / Giao diện**: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`
- **Mã nguồn / Mono**: `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`
- **Emoji**: `"Apple Color Emoji", "Segoe UI Emoji"`

### Phân Cấp

| Vai trò | Font | Kích thước | Độ đậm | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Display | system-ui | 32px (2rem) | 600 | 1.25 | -0.01em | Tiêu đề kho lưu trữ, hero marketing |
| H1 | system-ui | 24px (1.5rem) | 600 | 1.25 | normal | Tiêu đề trang |
| H2 | system-ui | 20px (1.25rem) | 600 | 1.25 | normal | Tiêu đề mục |
| H3 | system-ui | 16px (1rem) | 600 | 1.25 | normal | Tiểu mục, tiêu đề bảng |
| Body | system-ui | 14px (0.875rem) | 400 | 1.5 | normal | Cỡ chữ mặc định — không phải 16px |
| Body Small | system-ui | 12px (0.75rem) | 400 | 1.4 | normal | Chú thích, metadata file |
| Code | SFMono | 12px (0.75rem) | 400 | 1.45 | normal | Khối mã, diff |
| Code Inline | SFMono | 0.85em | 400 | inherit | normal | Đoạn `code` inline |

### Nguyên Tắc
- **Body 14px, không phải 16px**: Mật độ văn xuôi của GitHub là bản sắc của nó. Sản phẩm hiển thị ở 14px để vừa nhiều hàng hơn trong một khung nhìn.
- **Độ đậm nhị phân**: 400 cho mọi thứ theo mặc định; 600 cho tiêu đề và nhấn mạnh. Không dùng 500, không dùng 700.
- **Luôn dùng font hệ thống**: không bao giờ tải webfont cho giao diện — văn bản phải hiển thị ngay lập tức trên kết nối chậm.

## 4. Kiểu Dáng Thành Phần

### Nút

**Chính (Xanh Lá)**
- Nền: `#1f883d`
- Chữ: `#ffffff`
- Viền: 1px solid `rgba(31, 35, 40, 0.15)`
- Padding: 5px 16px
- Radius: 6px
- Bóng đổ: `0 1px 0 rgba(31,35,40,0.1)`
- Hover: nền `#1a7f37`
- Dùng cho: "Tạo kho lưu trữ", "Hợp nhất pull request"

**Mặc Định**
- Nền: `#f6f8fa`
- Chữ: `#1f2328`
- Viền: 1px solid `#d0d7de`
- Padding: 5px 16px
- Radius: 6px
- Hover: nền `#f3f4f6`, viền `#d0d7de`

**Viền Ngoài (Kiểu Liên Kết Xanh)**
- Nền: `#ffffff`
- Chữ: `#0969da`
- Viền: 1px solid `#d0d7de`
- Hover: nền `#0969da`, chữ `#ffffff`

**Nguy Hiểm**
- Nền: `#ffffff`
- Chữ: `#cf222e`
- Viền: 1px solid `#d0d7de`
- Hover: nền `#a40e26`, chữ `#ffffff`, viền `#a40e26`

### Thẻ / Hộp
- Nền: `#ffffff`
- Viền: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 16px (tiêu đề) + 16px (nội dung)
- Tiêu đề có dải `#f6f8fa` với đường viền dưới.

### Ô Nhập Liệu
- Nền: `#ffffff`
- Viền: 1px solid `#d0d7de`
- Radius: 6px
- Padding: 5px 12px
- Tiêu điểm: viền `#0969da`, vòng `0 0 0 3px rgba(9,105,218,0.3)`

### Pill Trạng Thái (Issue / PR)
- **Mở**: nền `#1a7f37`, chữ trắng, padding 4px 10px, radius 9999px.
- **Đóng**: nền `#cf222e`, chữ trắng.
- **Đã hợp nhất**: nền `#8250df`, chữ trắng.
- **Bản nháp**: nền `#6e7781`, chữ trắng.

### Nhãn (Tags trên Issues/PRs)
- Padding: 0 7px
- Radius: 9999px
- Font: 12px / 500
- Nền và chữ được tính theo chương trình (màu nhãn → chữ được tính để đảm bảo độ tương phản).

## 5. Khoảng Cách & Bố Cục

- **Đơn vị cơ bản**: 4px. Thang khoảng cách: 4, 8, 12, 16, 24, 32, 40, 48.
- **Chiều rộng trang tối đa**: 1280px (`Container-xl`).
- **Thanh bên**: 296px trên desktop, thu gọn dưới 1012px.
- **Padding hàng**: 16px theo chiều ngang, 12px theo chiều dọc (danh sách dày đặc theo thiết kế).

## 6. Chuyển Động

- **Thời lượng**: 80ms cho hover; 200ms cho menu/popover mở.
- **Easing**: `ease-out` cho mở, `ease-in` cho đóng.
- **Tránh**: hoạt ảnh tải trang, parallax, micro-interaction liên tục. Mọi thứ xuất hiện; chúng không biểu diễn.

## 7. Guardrail Sử Dụng

- Giữ danh sách dày đặc, hộp có viền và typography hệ thống cùng nhau; các nút xanh lá đơn lẻ không đủ để tạo ra bề mặt sản phẩm giống GitHub.
- Dùng màu xanh lá cho các hành động xây dựng kho lưu trữ, màu xanh dương cho liên kết và tiêu điểm, và chỉ dùng đỏ/tím/xám cho trạng thái issue, PR và workflow.
- Ưu tiên giao diện yên tĩnh, viền rõ ràng và khoảng cách gọn gàng hơn bóng đổ trang trí hay thẻ kiểu marketing lớn.
