# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ Cohere

> Danh mục: AI & LLM
> Nền tảng AI doanh nghiệp. Gradient rực rỡ, thẩm mỹ dashboard giàu dữ liệu.

## 1. Chủ Đề Hình Ảnh & Không Khí

Giao diện của Cohere là một bảng điều khiển doanh nghiệp được đánh bóng hoàn hảo — tự tin, gọn gàng và được thiết kế để AI cảm giác như cơ sở hạ tầng nghiêm túc thay vì đồ chơi dành cho người tiêu dùng. Trải nghiệm được xây dựng trên nền canvas trắng sáng, nơi nội dung được tổ chức trong các thẻ có bo góc rộng rãi (bán kính 22px) tạo ra ngôn ngữ chứa đựng hữu cơ, giống như đám mây. Đây là một trang web hướng tới CTO và kiến trúc sư doanh nghiệp: chuyên nghiệp mà không lạnh lùng, tinh tế mà không đáng sợ.

Ngôn ngữ thiết kế kết nối hai thế giới với hệ thống hai kiểu chữ: CohereText, một serif hiển thị tùy chỉnh với tracking chặt chẽ, mang lại trọng lượng cho tiêu đề như một tuyên ngôn công nghệ, trong khi Unica77 Cohere Web xử lý toàn bộ văn bản thân và UI với độ chính xác hình học kiểu Thụy Sĩ. Cặp đôi serif/sans này tạo nên cá tính "thẩm quyền tự tin gặp gỡ sự rõ ràng kỹ thuật" — phản ánh hoàn hảo một nền tảng AI doanh nghiệp.

Màu sắc được sử dụng với sự kiềm chế tuyệt đối — giao diện gần như hoàn toàn đen và trắng với các đường viền xám lạnh (`#d9d9dd`, `#e5e7eb`). Tím-violet chỉ xuất hiện trong các dải ảnh hero, các phần gradient và màu tương tác xanh dương (`#1863dc`) báo hiệu trạng thái hover và focus. Sự kiềm chế sắc màu này có nghĩa là khi màu sắc XUẤT HIỆN — trong ảnh chụp màn hình sản phẩm, ảnh doanh nghiệp và phần tím đậm — nó mang trọng lượng thị giác tối đa.

**Đặc Điểm Chính:**
- Canvas trắng sáng với các đường viền chứa màu xám lạnh
- Bán kính viền đặc trưng 22px — độ tròn "thẻ Cohere" đặc biệt
- Kiểu chữ tùy chỉnh kép: CohereText (serif hiển thị) + Unica77 (sans thân)
- Kiềm chế sắc màu cấp doanh nghiệp: đen, trắng, xám lạnh, nhấn tím-xanh tối thiểu
- Các phần hero tím đậm/violet tạo tương phản ấn tượng
- Các nút ghost/trong suốt chuyển sang màu xanh khi hover
- Ảnh doanh nghiệp thể hiện ứng dụng thực tế đa dạng
- CohereMono cho code và nhãn kỹ thuật với biến đổi chữ hoa

## 2. Bảng Màu & Vai Trò

### Chính
- **Cohere Black** (`#000000`): Văn bản tiêu đề chính và các yếu tố nhấn mạnh tối đa.
- **Near Black** (`#212121`): Màu liên kết thân chuẩn — mềm hơn đen thuần một chút.
- **Deep Dark** (`#17171c`): Gần đen có sắc xanh dương cho điều hướng và văn bản phần tối.

### Phụ & Nhấn
- **Interaction Blue** (`#1863dc`): Nhấn tương tác chính — xuất hiện khi hover nút, trạng thái focus và liên kết đang active. Màu hành động sắc màu duy nhất.
- **Ring Blue** (`#4c6ee6` ở 50%): Màu ring Tailwind cho chỉ báo focus bàn phím.
- **Focus Purple** (`#9b60aa`): Màu viền focus của input — một violet tắt.

### Bề Mặt & Nền
- **Pure White** (`#ffffff`): Nền trang chính và bề mặt thẻ.
- **Snow** (`#fafafa`): Bề mặt nâng cao tinh tế và nền phần sáng.
- **Lightest Gray** (`#f2f2f2`): Viền thẻ và các đường chứa mềm nhất.

### Trung Tính & Văn Bản
- **Muted Slate** (`#93939f`): Liên kết footer và văn bản bậc ba ít nhấn mạnh — xám tông lạnh với sắc xanh dương-violet nhẹ.
- **Border Cool** (`#d9d9dd`): Viền phần và mục danh sách chuẩn — xám lạnh, hơi tím.
- **Border Light** (`#e5e7eb`): Biến thể viền nhạt hơn — gray-200 chuẩn của Tailwind.

### Hệ Thống Gradient
- **Dải Hero Tím-Violet**: Các phần gradient tím đậm tạo tương phản ấn tượng so với canvas trắng. Chúng xuất hiện như các dải toàn chiều rộng chứa ảnh chụp màn hình sản phẩm và thông điệp chính.
- **Gradient Footer Tối**: Trang chuyển tiếp qua tím đậm/than sang footer đen, tạo hiệu ứng "hoàng hôn".

## 3. Quy Tắc Typography

### Font Family
- **Hiển Thị**: `CohereText`, dự phòng: `Space Grotesk, Inter, ui-sans-serif, system-ui`
- **Thân / UI**: `Unica77 Cohere Web`, dự phòng: `Inter, Arial, ui-sans-serif, system-ui`
- **Code**: `CohereMono`, dự phòng: `Arial, ui-sans-serif, system-ui`
- **Icon**: `CohereIconDefault` (font icon tùy chỉnh)

### Phân Cấp

| Vai Trò | Font | Kích Thước | Độ Đậm | Chiều Cao Dòng | Khoảng Cách Chữ | Ghi Chú |
|------|------|------|--------|-------------|----------------|-------|
| Hiển Thị / Hero | CohereText | 72px (4.5rem) | 400 | 1.00 (chặt) | -1.44px | Tác động tối đa, thẩm quyền serif |
| Hiển Thị Phụ | CohereText | 60px (3.75rem) | 400 | 1.00 (chặt) | -1.2px | Tiêu đề phần lớn |
| Tiêu Đề Phần | Unica77 | 48px (3rem) | 400 | 1.20 (chặt) | -0.48px | Tiêu đề phần tính năng |
| Tiêu Đề Phụ | Unica77 | 32px (2rem) | 400 | 1.20 (chặt) | -0.32px | Tiêu đề thẻ, tên tính năng |
| Tiêu Đề Tính Năng | Unica77 | 24px (1.5rem) | 400 | 1.30 | normal | Tiêu đề phần nhỏ hơn |
| Thân Lớn | Unica77 | 18px (1.13rem) | 400 | 1.40 | normal | Đoạn giới thiệu |
| Thân / Nút | Unica77 | 16px (1rem) | 400 | 1.50 | normal | Thân chuẩn, văn bản nút |
| Nút Vừa | Unica77 | 14px (0.88rem) | 500 | 1.71 (thoáng) | normal | Nút nhỏ hơn, nhãn nhấn mạnh |
| Chú Thích | Unica77 | 14px (0.88rem) | 400 | 1.40 | normal | Siêu dữ liệu, mô tả |
| Nhãn Chữ Hoa | Unica77 / CohereMono | 14px (0.88rem) | 400 | 1.40 | 0.28px | Nhãn phần chữ hoa |
| Nhỏ | Unica77 | 12px (0.75rem) | 400 | 1.40 | normal | Văn bản nhỏ nhất, liên kết footer |
| Code Micro | CohereMono | 8px (0.5rem) | 400 | 1.40 | 0.16px | Nhãn code chữ hoa siêu nhỏ |

### Nguyên Tắc
- **Serif để tuyên bố, sans để tiện dụng**: CohereText mang giọng điệu thương hiệu ở kích thước hiển thị — đầu chữ serif mang lại thẩm quyền của nghiên cứu đã xuất bản cho tiêu đề. Unica77 xử lý mọi thứ chức năng với sự trung lập hình học kiểu Thụy Sĩ.
- **Tracking âm ở kích thước lớn**: CohereText dùng -1.2px đến -1.44px letter-spacing ở 60–72px, tạo các khối văn bản dày đặc, ấn tượng.
- **Độ đậm thân duy nhất**: Gần như toàn bộ Unica77 dùng độ đậm 400. Độ đậm 500 chỉ xuất hiện cho nhấn mạnh nút nhỏ. Hệ thống dựa vào kích thước và khoảng cách, không phải tương phản độ đậm.
- **Nhãn code chữ hoa**: CohereMono dùng chữ hoa với letter-spacing dương (0.16–0.28px) cho thẻ kỹ thuật và dấu phần.

## 4. Kiểu Dáng Component

### Nút

**Ghost / Trong Suốt**
- Nền: trong suốt (`rgba(255, 255, 255, 0)`)
- Văn bản: Cohere Black (`#000000`)
- Không có viền hiển thị
- Hover: văn bản chuyển sang Interaction Blue (`#1863dc`), độ mờ 0.8
- Focus: outline đặc 2px màu Interaction Blue
- Kiểu nút chính — vô hình cho đến khi tương tác

**Đặc Tối**
- Nền: tối/đen
- Văn bản: Pure White
- Dành cho CTA trên bề mặt sáng
- Hình viên thuốc hoặc bán kính chuẩn

**Có Viền**
- Chứa đựng dựa trên viền
- Dùng trong hành động phụ

### Thẻ & Container
- Nền: Pure White (`#ffffff`)
- Viền: solid mỏng Lightest Gray (`1px solid #f2f2f2`) cho thẻ tinh tế; Cool Border (`#d9d9dd`) cho thẻ nhấn mạnh
- Bán kính: **22px** — bán kính Cohere đặc trưng cho thẻ chính, hình ảnh và container hộp thoại. Cũng dùng 4px, 8px, 16px, 20px cho các phần tử nhỏ hơn
- Đổ bóng: tối thiểu — Cohere dựa vào màu nền và viền thay vì bóng
- Đặc biệt: bán kính `0px 0px 22px 22px` (bo chỉ phần dưới) cho container phần
- Hộp thoại: bán kính 8px cho modal/dialog

### Input & Form
- Văn bản: trắng trên input tối, đen trên sáng
- Viền focus: Focus Purple (`#9b60aa`) với `1px solid`
- Đổ bóng focus: ring đỏ (`rgb(179, 0, 0) 0px 0px 0px 2px`) — có thể cho chỉ báo trạng thái lỗi
- Outline focus: Interaction Blue solid 2px

### Điều Hướng
- Nav ngang gọn trên nền trắng hoặc tối
- Logo: wordmark Cohere (SVG tùy chỉnh)
- Liên kết: văn bản tối ở 16px Unica77
- CTA: nút đặc tối
- Di động: thu gọn hamburger

### Xử Lý Hình Ảnh
- Ảnh doanh nghiệp với đối tượng và môi trường đa dạng
- Ảnh hero sắc tím cho các phần ấn tượng
- Ảnh chụp màn hình UI sản phẩm trên bề mặt tối
- Hình ảnh với bán kính 22px phù hợp hệ thống thẻ
- Các phần gradient tím toàn chiều rộng

### Component Đặc Biệt

**Hệ Thống Thẻ 22px**
- Bán kính viền 22px là chữ ký hình ảnh của Cohere
- Tất cả thẻ chính, hình ảnh và container dùng bán kính này
- Tạo sự mềm mại hữu cơ, giống mây — khác biệt so với kiểu 8–12px thông thường

**Thanh Tin Tưởng Doanh Nghiệp**
- Logo công ty hiển thị trong dải ngang
- Thể hiện việc áp dụng doanh nghiệp
- Xử lý logo đơn sắc, gọn gàng

**Dải Hero Tím**
- Các phần tím đậm toàn chiều rộng chứa showcase sản phẩm
- Tạo điểm ngắt thị giác ấn tượng trong luồng trang trắng
- Ảnh chụp màn hình sản phẩm nổi trong môi trường tím

**Thẻ Code Chữ Hoa**
- CohereMono chữ hoa với letter-spacing
- Dùng làm dấu phần và nhãn phân loại
- Tạo phân cấp thông tin kỹ thuật, có cấu trúc

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách
- Đơn vị cơ sở: 8px
- Thang đo: 2px, 6px, 8px, 10px, 12px, 16px, 20px, 22px, 24px, 28px, 32px, 36px, 40px, 56px, 60px
- Padding nút thay đổi theo biến thể
- Padding nội bộ thẻ: khoảng 24–32px
- Khoảng cách dọc phần: rộng rãi (56–60px giữa các phần)

### Lưới & Container
- Chiều rộng container tối đa: đến 2560px (rất rộng) với scaling đáp ứng
- Hero: căn giữa với typography ấn tượng
- Phần tính năng: lưới thẻ nhiều cột
- Phần doanh nghiệp: dải tím toàn chiều rộng
- 26 breakpoint được phát hiện — hệ thống đáp ứng chi tiết cực kỳ

### Triết Lý Khoảng Trắng
- **Sự rõ ràng doanh nghiệp**: Mỗi phần trình bày một đề xuất rõ ràng với khoảng thở giữa các phần.
- **Ảnh là hero**: Các phần ảnh lớn cung cấp điểm nhấn thị giác mà không cần các yếu tố thiết kế trang trí.
- **Nhóm thẻ**: Nội dung liên quan được nhóm vào thẻ bo góc 22px, tạo ra các cụm thông tin tự nhiên.

### Thang Đo Bán Kính Viền
- Sắc nét (4px): Các phần tử điều hướng, thẻ nhỏ, phân trang
- Thoải mái (8px): Hộp thoại, container phụ, thẻ nhỏ
- Rộng rãi (16px): Container nổi bật, thẻ vừa
- Lớn (20px): Thẻ tính năng lớn
- Đặc trưng (22px): Thẻ chính, ảnh hero, container chính — bán kính Cohere ĐẶC TRƯNG
- Viên thuốc (9999px): Nút, thẻ, chỉ báo trạng thái

## 6. Chiều Sâu & Độ Nâng

| Cấp | Xử Lý | Sử Dụng |
|-------|-----------|-----|
| Phẳng (Cấp 0) | Không bóng, không viền | Nền trang, khối văn bản |
| Có Viền (Cấp 1) | `1px solid #f2f2f2` hoặc `#d9d9dd` | Thẻ chuẩn, dấu phân cách danh sách |
| Dải Tím (Cấp 2) | Nền tím đậm toàn chiều rộng | Phần hero, showcase tính năng |

**Triết Lý Đổ Bóng**: Cohere gần như không có bóng. Chiều sâu được truyền đạt qua **tương phản màu nền** (thẻ trắng trên dải tím, bề mặt trắng trên snow), **chứa đựng bằng viền** (viền xám lạnh), và **luân phiên phần sáng-tối** ấn tượng. Khi các phần tử cần độ nâng, chúng đạt được bằng cách trở nên trắng trên tối thay vì đổ bóng.

## 7. Nên và Không Nên

### Nên
- Dùng bán kính viền 22px trên tất cả thẻ và container chính — đó là chữ ký hình ảnh
- Dùng CohereText cho tiêu đề hiển thị (72px, 60px) với letter-spacing âm
- Dùng Unica77 cho tất cả văn bản thân và UI ở độ đậm 400
- Giữ bảng màu đen-và-trắng với viền xám lạnh
- Dùng Interaction Blue (#1863dc) chỉ cho trạng thái tương tác hover/focus
- Dùng phần tím đậm cho các điểm ngắt thị giác ấn tượng và showcase sản phẩm
- Áp dụng chữ hoa + letter-spacing trên CohereMono cho nhãn phần
- Duy trì ảnh phù hợp doanh nghiệp với đối tượng đa dạng

### Không Nên
- Đừng dùng bán kính viền khác 22px trên thẻ chính — bán kính đặc trưng quan trọng
- Đừng đưa màu ấm vào — bảng màu nghiêm ngặt là tông lạnh
- Đừng dùng bóng nặng — chiều sâu đến từ tương phản màu và viền
- Đừng dùng độ đậm đậm (700+) cho văn bản thân — 400–500 là phạm vi
- Đừng bỏ qua phân cấp serif/sans — CohereText cho tiêu đề, Unica77 cho thân
- Đừng dùng tím làm màu bề mặt cho thẻ — tím được dành riêng cho các phần toàn chiều rộng
- Đừng giảm khoảng cách phần xuống dưới 40px — bố cục doanh nghiệp cần khoảng thở
- Đừng mặc định trang trí nút — ghost/trong suốt là trạng thái cơ sở

## 8. Hành Vi Đáp Ứng

### Breakpoint
| Tên | Chiều Rộng | Thay Đổi Chính |
|------|-------|-------------|
| Mobile Nhỏ | <425px | Bố cục nhỏ gọn, khoảng cách tối thiểu |
| Mobile | 425–640px | Một cột, thẻ xếp chồng |
| Mobile Lớn | 640–768px | Điều chỉnh khoảng cách nhỏ |
| Máy Tính Bảng | 768–1024px | Lưới 2 cột bắt đầu |
| Desktop | 1024–1440px | Bố cục nhiều cột đầy đủ |
| Desktop Lớn | 1440–2560px | Chiều rộng container tối đa |

*26 breakpoint được phát hiện — một trong các trang đáp ứng chi tiết nhất trong bộ dữ liệu.*

### Vùng Chạm
- Nút đủ kích thước cho tương tác chạm
- Liên kết điều hướng với khoảng cách thoải mái
- Bề mặt thẻ là vùng chạm

### Chiến Lược Thu Gọn
- **Điều hướng**: Nav đầy đủ thu gọn thành hamburger
- **Lưới tính năng**: Nhiều cột → 2 cột → một cột
- **Văn bản hero**: 72px → 48px → 32px thu nhỏ dần
- **Phần tím**: Duy trì toàn chiều rộng, nội dung xếp chồng
- **Lưới thẻ**: 3 → 2 → 1 cột

### Hành Vi Hình Ảnh
- Ảnh thu phóng tỷ lệ trong container bán kính 22px
- Ảnh chụp màn hình sản phẩm duy trì tỷ lệ khung hình
- Các phần tím thu phóng nền theo tỷ lệ

## 9. Hướng Dẫn Prompt Agent

### Tham Chiếu Màu Nhanh
- Văn Bản Chính: "Cohere Black (#000000)"
- Nền Trang: "Pure White (#ffffff)"
- Văn Bản Phụ: "Near Black (#212121)"
- Nhấn Hover: "Interaction Blue (#1863dc)"
- Văn Bản Mờ: "Muted Slate (#93939f)"
- Viền Thẻ: "Lightest Gray (#f2f2f2)"
- Viền Phần: "Border Cool (#d9d9dd)"

### Ví Dụ Prompt Component
- "Tạo phần hero trên Pure White (#ffffff) với CohereText ở 72px độ đậm 400, line-height 1.0, letter-spacing -1.44px. Văn bản Cohere Black. Phụ đề trong Unica77 ở 18px độ đậm 400, line-height 1.4."
- "Thiết kế thẻ tính năng với bán kính viền 22px, viền 1px solid Lightest Gray (#f2f2f2) trên nền trắng. Tiêu đề trong Unica77 ở 32px, letter-spacing -0.32px. Thân trong Unica77 ở 16px, Muted Slate (#93939f)."
- "Xây dựng nút ghost: nền trong suốt, văn bản Cohere Black trong Unica77 ở 16px. Khi hover, văn bản chuyển sang Interaction Blue (#1863dc) với độ mờ 0.8. Focus: outline solid 2px Interaction Blue."
- "Tạo phần tím đậm toàn chiều rộng với văn bản trắng. CohereText ở 60px cho tiêu đề. Ảnh chụp màn hình sản phẩm nổi bên trong dùng bán kính viền 22px."
- "Thiết kế nhãn phần dùng CohereMono ở 14px, chữ hoa, letter-spacing 0.28px. Văn bản Muted Slate (#93939f)."

### Hướng Dẫn Lặp
1. Tập trung vào MỘT component tại một thời điểm
2. Luôn dùng bán kính 22px cho thẻ chính — "độ tròn thẻ Cohere"
3. Chỉ định kiểu chữ — CohereText cho tiêu đề, Unica77 cho thân, CohereMono cho nhãn
4. Các phần tử tương tác dùng Interaction Blue (#1863dc) chỉ khi hover
5. Giữ bề mặt trắng với viền xám lạnh — không có tông ấm
6. Tím dành cho các phần toàn chiều rộng, không bao giờ là nền thẻ
