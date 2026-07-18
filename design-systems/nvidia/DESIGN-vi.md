# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ NVIDIA

> Danh mục: Truyền thông & Người Tiêu Dùng
> Điện toán GPU. Năng lượng xanh-đen, thẩm mỹ sức mạnh kỹ thuật.

## 1. Chủ Đề Hình Ảnh & Bầu Không Khí

Trang web của NVIDIA là một trải nghiệm công nghệ cao tương phản mạnh mẽ, truyền tải sức mạnh tính toán thô thông qua sự kiềm chế trong thiết kế. Trang được xây dựng trên nền tảng đen tuyệt đối (`#000000`) và trắng tinh (`#ffffff`), điểm xuyết bởi màu xanh đặc trưng của NVIDIA (`#76b900`) — một màu sắc cụ thể đến mức hoạt động như dấu vân tay thương hiệu. Đây không phải màu xanh tươi tốt của thiên nhiên; đó là màu xanh điện, lệch sang vàng chanh của ánh sáng do GPU tạo ra — một màu nằm giữa chartreuse và kelly green, ngay lập tức báo hiệu "NVIDIA" với bất kỳ ai trong lĩnh vực công nghệ.

Bộ phông chữ tùy chỉnh NVIDIA-EMEA (với các phông dự phòng Arial và Helvetica) tạo ra giọng điệu kiểu chữ sạch sẽ, mang tính công nghiệp. Các tiêu đề ở 36px đậm với chiều cao dòng 1.25 chặt chẽ tạo ra các khối văn bản dày đặc, có thẩm quyền. Phông chữ thiếu tính vui nhộn hình học của các sans-serif Silicon Valley — nó mang tính châu Âu, thực dụng và tập trung vào kỹ thuật. Văn bản nội dung chạy ở 15-16px, thoải mái để đọc nhưng không rộng rãi, duy trì cảm giác rằng diện tích màn hình được tối ưu hóa như bộ nhớ GPU.

Điều phân biệt thiết kế của NVIDIA với các trang web công nghệ nền tối khác là cách sử dụng điểm nhấn xanh có kỷ luật. Màu `#76b900` xuất hiện trong các viền (`2px solid #76b900`), gạch chân liên kết (`underline 2px rgb(118, 185, 0)`), và CTA — nhưng không bao giờ là nền hoặc các vùng bề mặt lớn trong nội dung chính. Màu xanh là tín hiệu, không phải bề mặt. Kết hợp với hệ thống đổ bóng sâu (`rgba(0, 0, 0, 0.3) 0px 0px 5px`) và bán kính viền tối thiểu (1-2px), hiệu ứng tổng thể là phần cứng kỹ thuật chính xác được hiển thị bằng pixel.

**Đặc Điểm Chính:**
- NVIDIA Green (`#76b900`) là điểm nhấn thuần túy — chỉ viền, gạch chân và điểm nổi bật tương tác
- Nền đen (`#000000`) chiếm ưu thế với văn bản trắng (`#ffffff`) trên các phần tối
- Phông chữ tùy chỉnh NVIDIA-EMEA với Arial/Helvetica dự phòng — công nghiệp, châu Âu, sạch sẽ
- Chiều cao dòng chặt (1.25 cho tiêu đề) tạo ra các khối văn bản dày đặc, có thẩm quyền
- Bán kính viền tối thiểu (1-2px) — góc sắc nét, được chế tác kỹ thuật xuyên suốt
- Nút viền xanh (`2px solid #76b900`) là mẫu tương tác chính
- Hệ thống biểu tượng Font Awesome 6 Pro/Sharp ở trọng lượng 900 cho biểu tượng sắc nét
- Kiến trúc đa framework (PrimeReact, Fluent UI, Element Plus) cho phép các thành phần tương tác phong phú

## 2. Bảng Màu & Vai Trò

### Thương Hiệu Chính
- **NVIDIA Green** (`#76b900`): Màu đặc trưng — viền, gạch chân liên kết, đường viền CTA, chỉ báo hoạt động. Không bao giờ dùng làm vùng tô màu lớn.
- **Đen Tuyệt Đối** (`#000000`): Nền trang chính, văn bản trên bề mặt sáng, tông màu chủ đạo.
- **Trắng Tinh** (`#ffffff`): Văn bản trên nền tối, nền phần sáng, bề mặt thẻ.

### Bảng Màu Thương Hiệu Mở Rộng
- **NVIDIA Green Light** (`#bff230`): Điểm nhấn vàng chanh sáng cho điểm nổi bật và trạng thái hover.
- **Orange 400** (`#df6500`): Điểm nhấn ấm cho cảnh báo, huy hiệu nổi bật, hoặc ngữ cảnh liên quan đến năng lượng.
- **Yellow 300** (`#ef9100`): Điểm nhấn ấm thứ cấp, điểm nổi bật danh mục sản phẩm.
- **Yellow 050** (`#feeeb2`): Bề mặt ấm nhạt cho nền callout.

### Trạng Thái & Ngữ Nghĩa
- **Red 500** (`#e52020`): Trạng thái lỗi, hành động hủy, cảnh báo nghiêm trọng.
- **Red 800** (`#650b0b`): Đỏ đậm cho nền cảnh báo nghiêm trọng.
- **Green 500** (`#3f8500`): Trạng thái thành công, chỉ báo tích cực (tối hơn màu xanh thương hiệu).
- **Blue 700** (`#0046a4`): Điểm nhấn thông tin, thay thế hover liên kết.

### Trang Trí
- **Purple 800** (`#4d1368`): Tím đậm cho điểm kết gradient, ngữ cảnh cao cấp/AI.
- **Purple 100** (`#f9d4ff`): Sắc bề mặt tím nhạt.
- **Fuchsia 700** (`#8c1c55`): Điểm nhấn phong phú cho khuyến mãi đặc biệt hoặc nội dung nổi bật.

### Thang Màu Trung Tính
- **Gray 300** (`#a7a7a7`): Văn bản mờ, nhãn bị vô hiệu hóa.
- **Gray 400** (`#898989`): Văn bản thứ cấp, siêu dữ liệu.
- **Gray 500** (`#757575`): Văn bản cấp ba, trình giữ chỗ, chân trang.
- **Gray Border** (`#5e5e5e`): Viền tinh tế, đường phân chia.
- **Near Black** (`#1a1a1a`): Bề mặt tối, nền thẻ trên trang đen.

### Trạng Thái Tương Tác
- **Liên Kết Mặc Định (nền tối)** (`#ffffff`): Liên kết trắng trên nền tối.
- **Liên Kết Mặc Định (nền sáng)** (`#000000`): Liên kết đen với gạch chân xanh trên nền sáng.
- **Hover Liên Kết** (`#3860be`): Chuyển sang xanh dương khi hover trên tất cả các biến thể liên kết.
- **Hover Nút** (`#1eaedb`): Điểm nổi bật teal cho trạng thái hover nút.
- **Nút Hoạt Động** (`#007fff`): Xanh dương sáng cho trạng thái nút active/nhấn.
- **Vòng Focus** (`#000000 solid 2px`): Đường viền đen cho focus bàn phím.

### Đổ Bóng & Chiều Sâu
- **Đổ Bóng Thẻ** (`rgba(0, 0, 0, 0.3) 0px 0px 5px 0px`): Đổ bóng môi trường tinh tế cho thẻ nâng cao.

## 3. Quy Tắc Kiểu Chữ

### Bộ Phông Chữ
- **Chính**: `NVIDIA-EMEA`, với dự phòng: `Arial, Helvetica, sans-serif`
- **Phông Biểu Tượng**: `Font Awesome 6 Pro` (trọng lượng 900 cho biểu tượng solid, 700 cho regular)
- **Biểu Tượng Sharp**: `Font Awesome 6 Sharp` (trọng lượng 300 cho biểu tượng nhẹ, 400 cho regular)

### Phân Cấp

| Vai Trò | Phông | Cỡ | Độ Đậm | Chiều Cao Dòng | Khoảng Cách Chữ | Ghi Chú |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | NVIDIA-EMEA | 36px (2.25rem) | 700 | 1.25 (chặt) | normal | Tiêu đề tác động tối đa |
| Tiêu Đề Phần | NVIDIA-EMEA | 24px (1.50rem) | 700 | 1.25 (chặt) | normal | Tiêu đề phần, tiêu đề thẻ |
| Tiêu Đề Phụ | NVIDIA-EMEA | 22px (1.38rem) | 400 | 1.75 (rộng) | normal | Mô tả tính năng, phụ đề |
| Tiêu Đề Thẻ | NVIDIA-EMEA | 20px (1.25rem) | 700 | 1.25 (chặt) | normal | Tiêu đề thẻ và module |
| Nội Dung Lớn | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.67 (rộng) | normal | Nội dung nhấn mạnh, đoạn dẫn |
| Nội Dung | NVIDIA-EMEA | 16px (1.00rem) | 400 | 1.50 | normal | Văn bản đọc tiêu chuẩn |
| Nội Dung Đậm | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.50 | normal | Nhãn đậm, mục điều hướng |
| Nội Dung Nhỏ | NVIDIA-EMEA | 15px (0.94rem) | 400 | 1.67 (rộng) | normal | Nội dung thứ cấp, mô tả |
| Nội Dung Nhỏ Đậm | NVIDIA-EMEA | 15px (0.94rem) | 700 | 1.50 | normal | Nội dung thứ cấp nhấn mạnh |
| Nút Lớn | NVIDIA-EMEA | 18px (1.13rem) | 700 | 1.25 (chặt) | normal | Nút CTA chính |
| Nút | NVIDIA-EMEA | 16px (1.00rem) | 700 | 1.25 (chặt) | normal | Nút tiêu chuẩn |
| Nút Nhỏ Gọn | NVIDIA-EMEA | 14.4px (0.90rem) | 700 | 1.00 (chặt) | 0.144px | Nút nhỏ/nhỏ gọn |
| Liên Kết | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | Liên kết điều hướng |
| Liên Kết Hoa | NVIDIA-EMEA | 14px (0.88rem) | 700 | 1.43 | normal | `text-transform: uppercase`, nhãn điều hướng |
| Chú Thích | NVIDIA-EMEA | 14px (0.88rem) | 600 | 1.50 | normal | Siêu dữ liệu, dấu thời gian |
| Chú Thích Nhỏ | NVIDIA-EMEA | 12px (0.75rem) | 400 | 1.25 (chặt) | normal | Chữ nhỏ, pháp lý |
| Nhãn Micro | NVIDIA-EMEA | 10px (0.63rem) | 700 | 1.50 | normal | `text-transform: uppercase`, huy hiệu nhỏ |
| Micro | NVIDIA-EMEA | 11px (0.69rem) | 700 | 1.00 (chặt) | normal | Văn bản UI nhỏ nhất |

### Nguyên Tắc
- **Đậm là giọng điệu mặc định**: NVIDIA nghiêng nặng về trọng lượng 700 cho tiêu đề, nút, liên kết và nhãn. Trọng lượng 400 được dành riêng cho văn bản nội dung và mô tả — mọi thứ khác đều đậm, thể hiện sự tự tin và thẩm quyền.
- **Tiêu đề chặt, nội dung rộng**: Chiều cao dòng tiêu đề nhất quán là 1.25 (chặt), trong khi văn bản nội dung nới rộng thành 1.50-1.67. Sự tương phản này tạo ra mật độ hình ảnh ở đầu các khối nội dung và khả năng đọc thoải mái trong các đoạn văn.
- **Hoa cho điều hướng**: Nhãn liên kết sử dụng `text-transform: uppercase` với trọng lượng 700, tạo ra giọng điệu điều hướng đọc như nhãn thông số kỹ thuật phần cứng.
- **Không có tracking trang trí**: Khoảng cách chữ là normal xuyên suốt, ngoại trừ nút nhỏ gọn (0.144px). Bản thân phông chữ mang tính cách công nghiệp mà không cần thao tác.

## 4. Kiểu Dáng Thành Phần

### Nút

**Chính (Viền Xanh)**
- Nền: `transparent`
- Văn bản: `#000000`
- Padding: 11px 13px
- Viền: `2px solid #76b900`
- Bán kính: 2px
- Phông: 16px trọng lượng 700
- Hover: nền `#1eaedb`, văn bản `#ffffff`
- Active: nền `#007fff`, văn bản `#ffffff`, viền `1px solid #003eff`, scale(1)
- Focus: nền `#1eaedb`, văn bản `#ffffff`, outline `#000000 solid 2px`, opacity 0.9
- Dùng cho: CTA chính ("Tìm Hiểu Thêm", "Khám Phá Giải Pháp")

**Thứ Cấp (Viền Xanh Mỏng)**
- Nền: transparent
- Viền: `1px solid #76b900`
- Bán kính: 2px
- Dùng cho: Hành động thứ cấp, CTA thay thế

**Nhỏ Gọn / Inline**
- Phông: 14.4px trọng lượng 700
- Khoảng cách chữ: 0.144px
- Chiều cao dòng: 1.00
- Dùng cho: CTA inline, điều hướng nhỏ gọn

### Thẻ & Vùng Chứa
- Nền: `#ffffff` (sáng) hoặc `#1a1a1a` (phần tối)
- Viền: không có (cạnh sạch) hoặc `1px solid #5e5e5e`
- Bán kính: 2px
- Đổ bóng: `rgba(0, 0, 0, 0.3) 0px 0px 5px 0px` cho thẻ nâng cao
- Hover: tăng cường đổ bóng
- Padding: 16-24px bên trong

### Liên Kết
- **Trên Nền Tối**: `#ffffff`, không gạch chân, hover chuyển sang `#3860be`
- **Trên Nền Sáng**: `#000000` hoặc `#1a1a1a`, gạch chân `2px solid #76b900`, hover chuyển sang `#3860be`, gạch chân bị xóa
- **Liên Kết Xanh**: `#76b900`, hover chuyển sang `#3860be`
- **Liên Kết Mờ**: `#666666`, hover chuyển sang `#3860be`

### Điều Hướng
- Nền đen tối (`#000000`)
- Logo căn trái, wordmark NVIDIA nổi bật
- Liên kết: NVIDIA-EMEA 14px trọng lượng 700 hoa, `#ffffff`
- Hover: chuyển màu, không thay đổi gạch chân
- Mega-menu thả xuống cho danh mục sản phẩm
- Dính khi cuộn với backdrop

### Xử Lý Hình Ảnh
- Hình ảnh sản phẩm/GPU là ảnh hero, thường là toàn chiều rộng
- Hình ảnh screenshot với đổ bóng tinh tế để tạo chiều sâu
- Lớp phủ gradient xanh trên các phần hero tối
- Vùng chứa avatar hình tròn với bán kính 50%

### Thành Phần Đặc Trưng

**Thẻ Sản Phẩm**
- Thẻ trắng hoặc tối sạch với bán kính tối thiểu (2px)
- Viền điểm nhấn xanh hoặc gạch chân trên tiêu đề
- Mẫu tiêu đề đậm + mô tả nhẹ hơn
- CTA với viền xanh ở phía dưới

**Bảng Thông Số Kỹ Thuật**
- Bố cục lưới công nghiệp
- Nền hàng xen kẽ (chuyển xám tinh tế)
- Nhãn đậm, giá trị thường
- Điểm nổi bật xanh cho số liệu quan trọng

**Banner Cookie/Đồng Ý**
- Vị trí cố định ở dưới cùng
- Nút bo tròn (bán kính 2px)
- Xử lý viền xám

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách
- Đơn vị cơ sở: 8px
- Thang: 1px, 2px, 3px, 4px, 5px, 6px, 7px, 8px, 9px, 10px, 11px, 12px, 13px, 15px
- Giá trị padding chính: 8px, 11px, 13px, 16px, 24px, 32px
- Khoảng cách phần: 48-80px padding dọc

### Lưới & Vùng Chứa
- Chiều rộng nội dung tối đa: khoảng 1200px (có giới hạn)
- Phần hero toàn chiều rộng với văn bản có giới hạn
- Phần tính năng: lưới 2-3 cột cho thẻ sản phẩm
- Một cột cho nội dung bài viết/blog
- Bố cục thanh bên cho tài liệu

### Triết Lý Khoảng Trắng
- **Mật độ có mục đích**: NVIDIA sử dụng khoảng cách chặt hơn các trang SaaS thông thường, phản ánh mật độ nội dung kỹ thuật. Khoảng trắng tồn tại để phân tách các khái niệm, không tạo ra sự trống rỗng sang trọng.
- **Nhịp điệu phần**: Các phần tối xen kẽ với các phần trắng, sử dụng màu nền (không chỉ khoảng cách) để phân tách các khối nội dung.
- **Mật độ thẻ**: Các thẻ sản phẩm nằm gần nhau với khoảng cách 16-20px, tạo cảm giác catalog hơn là gallery.

### Thang Bán Kính Viền
- Micro (1px): Span inline, phần tử nhỏ
- Tiêu chuẩn (2px): Nút, thẻ, vùng chứa, input — mặc định cho hầu hết mọi thứ
- Tròn (50%): Hình ảnh avatar, chỉ báo tab tròn

## 6. Chiều Sâu & Độ Nâng

| Mức | Xử Lý | Dùng Cho |
|-------|-----------|-----|
| Phẳng (Mức 0) | Không đổ bóng | Nền trang, văn bản inline |
| Tinh Tế (Mức 1) | `rgba(0,0,0,0.3) 0px 0px 5px 0px` | Thẻ tiêu chuẩn, modal |
| Viền (Mức 1b) | `1px solid #5e5e5e` | Phân chia nội dung, viền phần |
| Điểm Nhấn Xanh (Mức 2) | `2px solid #76b900` | Phần tử hoạt động, CTA, mục được chọn |
| Focus (Khả Năng Tiếp Cận) | outline `2px solid #000000` | Vòng focus bàn phím |

**Triết Lý Đổ Bóng**: Hệ thống chiều sâu của NVIDIA là tối giản và thực dụng. Về cơ bản chỉ có một giá trị đổ bóng — độ mờ môi trường 5px ở 30% độ mờ đục — được sử dụng hạn chế cho thẻ và modal. Tín hiệu chiều sâu chính không phải là đổ bóng mà là _tương phản màu_: nền đen bên cạnh các phần trắng, viền xanh trên bề mặt đen. Điều này tạo ra lớp hình ảnh giống phần cứng, nơi chiều sâu đến từ sự khác biệt vật liệu, không phải ánh sáng giả lập.

### Chiều Sâu Trang Trí
- Lớp phủ gradient xanh phía sau nội dung hero
- Gradient từ tối đến tối hơn (đen sang gần đen) cho chuyển tiếp phần
- Không có glassmorphism hay hiệu ứng mờ — rõ ràng hơn bầu không khí

## 7. Hành Vi Responsive

### Điểm Dừng
| Tên | Chiều Rộng | Thay Đổi Chính |
|------|-------|-------------|
| Mobile Nhỏ | <375px | Một cột nhỏ gọn, padding giảm |
| Mobile | 375-425px | Bố cục mobile tiêu chuẩn |
| Mobile Lớn | 425-600px | Mobile rộng hơn, một số gợi ý 2 cột |
| Tablet Nhỏ | 600-768px | Lưới 2 cột bắt đầu |
| Tablet | 768-1024px | Lưới thẻ đầy đủ, điều hướng mở rộng |
| Desktop | 1024-1350px | Bố cục desktop tiêu chuẩn |
| Desktop Lớn | >1350px | Chiều rộng nội dung tối đa, lề rộng rãi |

### Mục Tiêu Chạm
- Nút sử dụng padding 11px 13px cho mục tiêu chạm thoải mái
- Liên kết điều hướng ở 14px hoa với khoảng cách đầy đủ
- Nút viền xanh cung cấp mục tiêu chạm tương phản cao trên nền tối
- Mobile: menu hamburger thu gọn với overlay toàn màn hình

### Chiến Lược Thu Gọn
- Hero: tiêu đề 36px thu nhỏ tỷ lệ
- Điều hướng: điều hướng ngang đầy đủ thu gọn thành menu hamburger ở ~1024px
- Thẻ sản phẩm: 3 cột sang 2 cột sang một cột xếp chồng
- Footer: lưới đa cột thu gọn thành cột xếp chồng đơn
- Khoảng cách phần: 64-80px giảm xuống 32-48px trên mobile
- Hình ảnh: duy trì tỷ lệ khung hình, thu nhỏ theo chiều rộng vùng chứa

### Hành Vi Hình Ảnh
- Hình ảnh GPU/sản phẩm duy trì độ phân giải cao ở mọi kích thước
- Hình ảnh hero thu nhỏ tỷ lệ với viewport
- Hình ảnh thẻ sử dụng tỷ lệ khung hình nhất quán
- Các phần tối toàn màn hình duy trì xử lý cạnh-tới-cạnh

## 8. Hành Vi Responsive (Mở Rộng)

### Thu Nhỏ Kiểu Chữ
- Display 36px thu nhỏ xuống ~24px trên mobile
- Tiêu đề phần 24px thu nhỏ xuống ~20px trên mobile
- Văn bản nội dung duy trì 15-16px trên tất cả các điểm dừng
- Văn bản nút duy trì 16px cho mục tiêu chạm nhất quán

### Chiến Lược Phần Tối/Sáng
- Các phần tối (nền đen, văn bản trắng) xen kẽ với các phần sáng (nền trắng, văn bản đen)
- Điểm nhấn xanh vẫn nhất quán trên cả hai loại bề mặt
- Trên tối: liên kết trắng, gạch chân xanh
- Trên sáng: liên kết đen, gạch chân xanh
- Sự xen kẽ này tạo ra nhịp cuộn tự nhiên và nhóm nội dung

## 9. Hướng Dẫn Agent Prompt

### Tham Chiếu Màu Nhanh
- Điểm nhấn chính: NVIDIA Green (`#76b900`)
- Nền tối: Đen Tuyệt Đối (`#000000`)
- Nền sáng: Trắng Tinh (`#ffffff`)
- Văn bản tiêu đề (nền tối): Trắng (`#ffffff`)
- Văn bản tiêu đề (nền sáng): Đen (`#000000`)
- Văn bản nội dung (nền sáng): Đen (`#000000`) hoặc Near Black (`#1a1a1a`)
- Văn bản nội dung (nền tối): Trắng (`#ffffff`) hoặc Gray 300 (`#a7a7a7`)
- Hover liên kết: Xanh Dương (`#3860be`)
- Viền điểm nhấn: `2px solid #76b900`
- Hover nút: Teal (`#1eaedb`)

### Ví Dụ Prompt Thành Phần
- "Tạo phần hero trên nền đen. Tiêu đề ở 36px NVIDIA-EMEA trọng lượng 700, chiều cao dòng 1.25, màu #ffffff. Phụ đề ở 18px trọng lượng 400, chiều cao dòng 1.67, màu #a7a7a7. Nút CTA với nền transparent, viền 2px solid #76b900, bán kính 2px, padding 11px 13px, văn bản #ffffff. Hover: nền #1eaedb, văn bản trắng."
- "Thiết kế thẻ sản phẩm: nền trắng, bán kính viền 2px, box-shadow rgba(0,0,0,0.3) 0px 0px 5px. Tiêu đề ở 20px NVIDIA-EMEA trọng lượng 700, chiều cao dòng 1.25, màu #000000. Nội dung ở 15px trọng lượng 400, chiều cao dòng 1.67, màu #757575. Điểm nhấn gạch chân xanh trên tiêu đề: border-bottom 2px solid #76b900."
- "Xây dựng thanh điều hướng: nền #000000, sticky trên cùng. Logo NVIDIA căn trái. Liên kết ở 14px NVIDIA-EMEA trọng lượng 700 hoa, màu #ffffff. Hover: màu #3860be. Nút CTA viền xanh căn phải."
- "Tạo phần tính năng tối: nền #000000. Nhãn phần ở 14px trọng lượng 700 hoa, màu #76b900. Tiêu đề ở 24px trọng lượng 700, màu #ffffff. Mô tả ở 16px trọng lượng 400, màu #a7a7a7. Ba thẻ sản phẩm theo hàng với khoảng cách 20px."
- "Thiết kế footer: nền #000000. Bố cục đa cột với nhóm liên kết. Liên kết ở 14px trọng lượng 400, màu #a7a7a7. Hover: màu #76b900. Thanh dưới cùng với văn bản pháp lý ở 12px, màu #757575."

### Hướng Dẫn Lặp Lại
1. Luôn dùng `#76b900` làm điểm nhấn, không bao giờ là nền — đây là màu tín hiệu cho viền, gạch chân và điểm nổi bật
2. Nút mặc định là transparent với viền xanh — nền tô màu chỉ xuất hiện trên trạng thái hover/active
3. Trọng lượng 700 là giọng điệu chủ đạo cho tất cả các phần tử tương tác và tiêu đề; 400 chỉ dành cho đoạn văn nội dung
4. Bán kính viền là 2px cho mọi thứ — bo tròn sắc nét, tối thiểu này là cốt lõi của thẩm mỹ công nghiệp
5. Phần tối dùng văn bản trắng; phần sáng dùng văn bản đen — điểm nhấn xanh hoạt động giống nhau trên cả hai
6. Hover liên kết luôn là `#3860be` (xanh dương) bất kể màu mặc định của liên kết
7. Chiều cao dòng 1.25 cho tiêu đề, 1.50-1.67 cho văn bản nội dung — duy trì sự tương phản này cho phân cấp hình ảnh
8. Điều hướng dùng hoa 14px đậm — kiểu chữ nhãn phần cứng này là một phần của giọng điệu thương hiệu
