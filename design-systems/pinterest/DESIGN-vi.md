# Hệ thống thiết kế lấy cảm hứng từ Pinterest

> Category: Truyền thông & Người tiêu dùng
> Khám phá trực quan. Điểm nhấn màu đỏ, lưới xây, ưu tiên hình ảnh.

## 1. Chủ đề trực quan và bầu không khí

Trang web của Pinterest là một khung vẽ ấm áp, đầy cảm hứng, coi việc khám phá trực quan như một tạp chí lifestyle. Thiết kế vận hành trên nền trắng mềm mại, hơi ấm áp với Đỏ Pinterest (`#e60023`) là điểm nhấn thương hiệu duy nhất, táo bạo. Khác với màu xanh lạnh của hầu hết các nền tảng công nghệ, thang màu trung tính của Pinterest có sắc ấm rõ rệt — màu xám nghiêng về olive/cát (`#91918c`, `#62625b`, `#e5e5e0`) thay vì thép lạnh, tạo ra không khí ấm cúng, thủ công, mời gọi người dùng khám phá.

Kiểu chữ sử dụng Pin Sans — phông chữ độc quyền tùy chỉnh với ngăn xếp dự phòng rộng bao gồm phông chữ tiếng Nhật, phản ánh tầm vươn toàn cầu của Pinterest. Ở quy mô hiển thị (70px, đậm 600), Pin Sans tạo ra các tiêu đề lớn, mời gọi. Ở kích thước nhỏ hơn, hệ thống gọn gàng: nút 12px, chú thích 12–14px. Hệ thống đặt tên biến CSS (`--comp-*`, `--sema-*`, `--base-*`) tiết lộ kiến trúc token thiết kế ba tầng tinh tế: tầng thành phần, tầng ngữ nghĩa và tầng cơ sở.

Điều phân biệt Pinterest là hệ thống bán kính góc hào phóng (12px–40px, cộng 50% cho hình tròn) và nền nút có sắc ấm. Nút thứ cấp (`#e5e5e0`) có sắc cát ấm rõ rệt thay vì xám lạnh. Nút đỏ chính sử dụng bán kính 16px — bo tròn nhưng không dạng viên thuốc. Kết hợp với nền huy hiệu ấm áp (`hsla(60,20%,98%,.5)` — lớp phủ vàng ấm tinh tế) và bố cục lấy nhiếp ảnh làm trọng tâm, kết quả là thiết kế mang cảm giác thủ công và cá nhân, không phải doanh nghiệp và vô trùng.

**Đặc điểm chính:**
- Khung vẽ trắng ấm với màu trung tính tông olive/cát — ấm cúng, không lâm sàng
- Đỏ Pinterest (`#e60023`) là điểm nhấn táo bạo duy nhất — không bao giờ kín đáo, luôn tự tin
- Phông chữ tùy chỉnh Pin Sans với ngăn xếp dự phòng toàn cầu (bao gồm CJK)
- Kiến trúc token ba tầng: `--comp-*` / `--sema-*` / `--base-*`
- Bề mặt thứ cấp ấm: xám cát (`#e5e5e0`), huy hiệu ấm (`hsla(60,20%,98%,.5)`)
- Bán kính góc hào phóng: 16px tiêu chuẩn, tối đa 40px cho các vùng chứa lớn
- Nội dung ưu tiên nhiếp ảnh — ghim/hình ảnh là yếu tố trực quan chính
- Văn bản tím đậm gần đen (`#211922`) — ấm, với gợi ý màu mận

## 2. Bảng màu và vai trò

### Thương hiệu chính
- **Đỏ Pinterest** (`#e60023`): CTA chính, điểm nhấn thương hiệu — đỏ táo bạo, tự tin
- **Xanh lá 700** (`#103c25`): `--base-color-green-700`, điểm nhấn thành công/thiên nhiên
- **Xanh lá 700 Hover** (`#0b2819`): `--base-color-hover-green-700`, xanh lá khi nhấn

### Văn bản
- **Đen mận** (`#211922`): Văn bản chính — gần đen ấm với sắc mận
- **Đen** (`#000000`): Văn bản thứ cấp, văn bản nút
- **Xám olive** (`#62625b`): Mô tả thứ cấp, văn bản mờ
- **Bạc ấm** (`#91918c`): `--comp-button-color-text-transparent-disabled`, văn bản vô hiệu, viền nhập liệu
- **Trắng** (`#ffffff`): Văn bản trên bề mặt tối/có màu

### Tương tác
- **Xanh dương tiêu điểm** (`#435ee5`): `--comp-button-color-border-focus-outer-transparent`, vòng tiêu điểm
- **Tím hiệu năng** (`#6845ab`): `--sema-color-hover-icon-performance-plus`, tính năng hiệu năng
- **Tím gợi ý** (`#7e238b`): `--sema-color-hover-text-recommendation`, gợi ý AI
- **Xanh dương liên kết** (`#2b48d4`): Màu văn bản liên kết
- **Xanh dương Facebook** (`#0866ff`): `--facebook-background-color`, đăng nhập mạng xã hội
- **Xanh dương nhấn** (`#617bff`): `--base-color-pressed-blue-200`, trạng thái nhấn

### Bề mặt và viền
- **Xám cát** (`#e5e5e0`): Nền nút thứ cấp — ấm, thủ công
- **Sáng ấm** (`#e0e0d9`): Nền nút tròn, huy hiệu
- **Rửa ấm** (`hsla(60, 20%, 98%, 0.5)`): `--comp-badge-color-background-wash-light`, nền huy hiệu ấm tinh tế
- **Sương** (`#f6f6f3`): Bề mặt sáng (ở 50% độ mờ)
- **Viền vô hiệu** (`#c8c8c1`): `--sema-color-border-disabled`, viền vô hiệu
- **Xám hover** (`#bcbcb3`): `--base-color-hover-grayscale-150`, viền khi di chuột
- **Bề mặt tối** (`#33332e`): Nền phần tối

### Ngữ nghĩa
- **Đỏ lỗi** (`#9e0a0a`): Trạng thái lỗi hộp kiểm/biểu mẫu

## 3. Quy tắc kiểu chữ

### Họ phông chữ
- **Chính**: `Pin Sans`, dự phòng: `-apple-system, system-ui, Segoe UI, Roboto, Oxygen-Sans, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, Helvetica, ヒラギノ角ゴ Pro W3, メイリオ, Meiryo, ＭＳ Ｐゴシック, Arial`

### Phân cấp

| Vai trò | Phông chữ | Kích thước | Độ đậm | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Hiển thị anh hùng | Pin Sans | 70px (4,38rem) | 600 | normal | normal | Tác động tối đa |
| Tiêu đề phần | Pin Sans | 28px (1,75rem) | 700 | normal | -1,2px | Tracking âm |
| Nội dung | Pin Sans | 16px (1,00rem) | 400 | 1,40 | normal | Đọc tiêu chuẩn |
| Chú thích đậm | Pin Sans | 14px (0,88rem) | 700 | normal | normal | Siêu dữ liệu mạnh |
| Chú thích | Pin Sans | 12px (0,75rem) | 400–500 | 1,50 | normal | Văn bản nhỏ, thẻ |
| Nút | Pin Sans | 12px (0,75rem) | 400 | normal | normal | Nhãn nút |

### Nguyên tắc
- **Thang kiểu chữ gọn**: Phạm vi 12px–70px với bước nhảy lớn — hầu hết văn bản chức năng ở 12–16px, tạo phân cấp thông tin dày đặc kiểu ứng dụng.
- **Phân phối độ đậm ấm**: 600–700 cho tiêu đề, 400–500 cho nội dung. Không có độ đậm siêu nhẹ — kiểu chữ luôn có trọng lượng.
- **Tracking âm trên tiêu đề**: -1,2px trên tiêu đề 28px tạo ra tiêu đề phần ấm cúng, gần gũi.
- **Một họ phông duy nhất**: Pin Sans xử lý tất cả — không phát hiện phông hiển thị thứ cấp hay phông đơn cách.

## 4. Kiểu thành phần

### Nút

**Đỏ chính**
- Nền: `#e60023` (Đỏ Pinterest)
- Văn bản: `#000000` (đen — lựa chọn bất thường cho tương phản trên đỏ)
- Đệm: 6px 14px
- Bán kính: 16px (bo tròn hào phóng, không dạng viên thuốc)
- Viền: `2px solid rgba(255, 255, 255, 0)` (trong suốt)
- Tiêu điểm: viền ngữ nghĩa + đường viền qua biến CSS

**Cát thứ cấp**
- Nền: `#e5e5e0` (xám cát ấm)
- Văn bản: `#000000`
- Đệm: 6px 14px
- Bán kính: 16px
- Tiêu điểm: cùng hệ thống viền ngữ nghĩa

**Hành động tròn**
- Nền: `#e0e0d9` (sáng ấm)
- Văn bản: `#211922` (đen mận)
- Bán kính: 50% (tròn)
- Dùng: hành động ghim, điều khiển điều hướng

**Ghost / Trong suốt**
- Nền: trong suốt
- Văn bản: `#000000`
- Không viền
- Dùng: hành động cấp ba

### Thẻ và vùng chứa
- Thẻ ghim ưu tiên nhiếp ảnh với bán kính hào phóng (12px–20px)
- Không có bóng hộp truyền thống trên hầu hết thẻ
- Nền trắng hoặc sương ấm
- Viền trắng dày 8px trên một số vùng chứa hình ảnh

### Nhập liệu
- Nhập email: nền trắng, viền `1px solid #91918c`, bán kính 16px, đệm 11px 15px
- Tiêu điểm: hệ thống viền ngữ nghĩa + đường viền qua biến CSS

### Điều hướng
- Tiêu đề gọn gàng trên nền trắng hoặc ấm
- Logo Pinterest + thanh tìm kiếm căn giữa
- Pin Sans 16px cho liên kết điều hướng
- Điểm nhấn Đỏ Pinterest cho trạng thái hoạt động

### Xử lý hình ảnh
- Lưới xây kiểu ghim (bố cục đặc trưng của Pinterest)
- Góc bo tròn: 12px–20px trên hình ảnh
- Nhiếp ảnh là nội dung chính — mỗi ghim là một hình ảnh
- Viền trắng dày (8px) trên vùng chứa hình ảnh nổi bật

## 5. Nguyên tắc bố cục

### Hệ thống khoảng cách
- Đơn vị cơ sở: 8px
- Thang: 4px, 6px, 7px, 8px, 10px, 11px, 12px, 16px, 18px, 20px, 22px, 24px, 32px, 80px, 100px
- Bước nhảy lớn: 32px → 80px → 100px cho khoảng cách phần

### Lưới và vùng chứa
- Lưới xây cho nội dung ghim (bố cục đặc trưng)
- Các phần nội dung căn giữa với chiều rộng tối đa hào phóng
- Chân trang tối toàn chiều rộng
- Thanh tìm kiếm là yếu tố điều hướng chính

### Triết lý khoảng trắng
- **Mật độ cảm hứng**: Lưới xây đóng gói ghim chặt chẽ — mật độ nội dung CHÍNH LÀ đề xuất giá trị. Khoảng trắng tồn tại giữa các phần, không trong lưới.
- **Thở ở trên, mật độ ở dưới**: Các phần anh hùng/nổi bật nhận được đệm hào phóng; lưới ghim gọn gàng và đắm chìm.

### Thang bán kính viền
- Tiêu chuẩn (12px): Thẻ nhỏ, liên kết
- Nút (16px): Nút, nhập liệu, thẻ vừa
- Thoải mái (20px): Thẻ nổi bật
- Lớn (28px): Vùng chứa lớn
- Phần (32px): Phần tử tab, bảng lớn
- Anh hùng (40px): Vùng chứa anh hùng, khối nổi bật lớn
- Tròn (50%): Nút hành động, chỉ báo tab

## 6. Độ sâu và độ cao

| Mức độ | Xử lý | Dùng |
|-------|-----------|-----|
| Phẳng (Mức 0) | Không bóng | Mặc định — ghim dựa vào nội dung, không bóng |
| Tinh tế (Mức 1) | Bóng tối thiểu (từ token) | Lớp phủ nổi, menu thả xuống |
| Tiêu điểm (Trợ năng) | Vòng `--sema-color-border-focus-outer-default` | Trạng thái tiêu điểm |

**Triết lý bóng đổ**: Pinterest sử dụng bóng tối thiểu. Lưới xây dựa vào nội dung (nhiếp ảnh) để tạo sự thú vị trực quan thay vì hiệu ứng độ cao. Độ sâu đến từ sắc ấm của màu bề mặt và góc bo tròn hào phóng của vùng chứa.

## 7. Nên làm và không nên làm

### Nên làm
- Dùng trung tính ấm (`#e5e5e0`, `#e0e0d9`, `#91918c`) — sắc ấm olive/cát là bản sắc
- Áp dụng Đỏ Pinterest (`#e60023`) chỉ cho CTA chính — táo bạo và độc nhất
- Dùng Pin Sans độc quyền — một phông cho tất cả
- Áp dụng bán kính viền hào phóng: 16px cho nút/nhập liệu, 20px+ cho thẻ
- Giữ lưới xây dày đặc — mật độ nội dung là giá trị
- Dùng nền huy hiệu ấm (`hsla(60,20%,98%,.5)`) cho lớp rửa ấm tinh tế
- Dùng `#211922` (đen mận) cho văn bản chính — ấm hơn đen thuần

### Không nên làm
- Không dùng trung tính xám lạnh — luôn dùng sắc ấm/olive
- Không dùng đen thuần (`#000000`) làm văn bản chính — dùng đen mận (`#211922`)
- Không dùng nút dạng viên thuốc — bán kính 16px là bo tròn nhưng không phải viên thuốc
- Không thêm bóng nặng — Pinterest phẳng theo thiết kế, độ sâu từ nội dung
- Không dùng bán kính viền nhỏ (<12px) trên thẻ — bo tròn hào phóng là cốt lõi
- Không giới thiệu màu thương hiệu bổ sung — đỏ + trung tính ấm là bảng màu đầy đủ
- Không dùng độ đậm phông nhẹ — Pin Sans tối thiểu 400

## 8. Hành vi đáp ứng

### Điểm dừng
| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Di động | <576px | Một cột, bố cục gọn |
| Di động lớn | 576–768px | Lưới ghim 2 cột |
| Máy tính bảng | 768–890px | Lưới mở rộng |
| Máy tính nhỏ | 890–1312px | Lưới xây tiêu chuẩn |
| Máy tính | 1312–1440px | Bố cục đầy đủ |
| Máy tính lớn | 1440–1680px | Cột lưới mở rộng |
| Siêu rộng | >1680px | Mật độ lưới tối đa |

### Chiến lược thu gọn
- Lưới ghim: 5+ cột → 3 → 2 → 1
- Điều hướng: thanh tìm kiếm + biểu tượng → điều hướng di động đơn giản
- Phần nổi bật: cạnh nhau → xếp chồng
- Anh hùng: 70px → thu nhỏ theo tỷ lệ
- Chân trang: tối nhiều cột → xếp chồng

## 9. Hướng dẫn gợi ý cho tác nhân

### Tham khảo màu nhanh
- Thương hiệu: Đỏ Pinterest (`#e60023`)
- Nền: Trắng (`#ffffff`)
- Văn bản: Đen mận (`#211922`)
- Văn bản thứ cấp: Xám olive (`#62625b`)
- Bề mặt nút: Xám cát (`#e5e5e0`)
- Viền: Bạc ấm (`#91918c`)
- Tiêu điểm: Xanh dương tiêu điểm (`#435ee5`)

### Gợi ý thành phần mẫu
- "Tạo anh hùng: nền trắng. Tiêu đề 70px Pin Sans đậm 600, đen mận (#211922). Nút CTA đỏ (#e60023, bán kính 16px, đệm 6px 14px). Nút cát thứ cấp (#e5e5e0, bán kính 16px)."
- "Thiết kế thẻ ghim: nền trắng, bán kính 16px, không bóng. Nhiếp ảnh lấp đầy phần trên, mô tả 16px Pin Sans đậm 400 bên dưới bằng #62625b."
- "Xây nút hành động tròn: nền #e0e0d9, bán kính 50%, biểu tượng #211922."
- "Tạo trường nhập: nền trắng, 1px solid #91918c, bán kính 16px, đệm 11px 15px. Tiêu điểm: đường viền xanh qua token ngữ nghĩa."
- "Thiết kế chân trang tối: nền #33332e. Logo chữ thảo Pinterest màu trắng. Liên kết 12px Pin Sans bằng #91918c."

### Hướng dẫn lặp
1. Trung tính ấm ở khắp nơi — xám olive/cát, không bao giờ thép lạnh
2. Đỏ Pinterest chỉ cho CTA — táo bạo và độc nhất
3. Bán kính 16px trên nút/nhập liệu, 20px+ trên thẻ — hào phóng nhưng không viên thuốc
4. Pin Sans là phông duy nhất — gọn 12px cho giao diện, 70px cho hiển thị
5. Nhiếp ảnh mang thiết kế — giao diện giữ ấm và tối giản
6. Đen mận (#211922) cho văn bản — ấm hơn đen thuần
