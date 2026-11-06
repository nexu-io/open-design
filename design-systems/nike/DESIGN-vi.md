# Hệ Thống Thiết Kế Lấy Cảm Hứng từ Nike

> Category: Thương Mại Điện Tử & Bán Lẻ
> Bán lẻ thể thao. Giao diện đơn sắc, typography chữ hoa khổng lồ, ảnh toàn viền.

## 1. Chủ Đề Hình Ảnh & Bầu Không Khí

Nike.com là một ngôi đền bán lẻ đầy chuyển động — một trang web truyền tải năng lượng bùng nổ của thể thao vào trải nghiệm mua sắm kỹ thuật số. Thiết kế vận hành theo nguyên tắc đơn giản triệt để: lược bỏ tất cả về đen, trắng và xám để ảnh chụp thể thao và màu sắc sản phẩm có thể thống trị mà không bị cạnh tranh. Kết quả trông không giống một trang web mà giống một tạp chí thể thao được dàn trang với độ chính xác của một tạp chí cao cấp. Mỗi pixel không gian đều đang bán sản phẩm hoặc dẫn hướng đến sản phẩm.

"Podium CDS" (Hệ thống thiết kế lõi nội bộ của Nike) thiết lập một nền tảng đơn sắc mạnh mẽ. Giao diện tan biến vào văn bản màu đen (`#111111`) và bề mặt trắng, cho phép ảnh hero — vận động viên đang đổ mồ hôi, giày đang bay giữa không trung, năng lượng sân vận động — gánh vác trọng lượng cảm xúc. Khi màu sắc xuất hiện trong giao diện, nó gần như chỉ mang tính chức năng: đỏ cho lỗi, xanh dương cho liên kết, xanh lá cho thành công. Chính sản phẩm mới là câu chuyện màu sắc. Sự kiềm chế này tạo ra một nghịch lý thị giác: những trang màu sắc nhất trên internet lại cảm giác tối giản nhất, bởi vì tất cả sự sống động đều đến từ hàng hóa chứ không phải giao diện.

Hệ thống typography là nửa còn lại của nhận diện hình ảnh Nike. Các tiêu đề chữ hoa khổng lồ theo font Nike Futura ND — một biến thể Futura condensed tùy chỉnh với line-height cực kỳ chặt (0.90) — xuyên qua hình ảnh hero như một cú sốc kiểu chữ. Bên dưới các tiêu đề, họ font Helvetica Now xử lý mọi thứ từ điều hướng đến mô tả sản phẩm với sự rõ ràng chính xác kiểu Thụy Sĩ. Sự phân tách giữa kiểu chữ display biểu cảm và kiểu chữ thân văn chức năng phản ánh sự duality thương hiệu của Nike: cảm hứng gặp thực thi.

**Key Characteristics:**
- Giao diện đơn sắc (đen/trắng/xám) để ảnh chụp sản phẩm là nguồn màu sắc duy nhất
- Typography display chữ hoa khổng lồ (96px, line-height 0.90) xuyên qua hình ảnh hero
- Ảnh toàn viền không có border radius — hình ảnh lấp đầy mọi cạnh có sẵn
- Các nút hình viên thuốc (radius 30px) là yếu tố tương tác chính
- Lưới khoảng cách 8px với kỷ luật thể thao — mọi phép đo đều bám vào hệ thống
- Kiến trúc mua sắm theo danh mục với các thẻ ảnh điều hướng lớn
- Mô hình độ cao không đổ bóng, ít viền — phân biệt bề mặt chỉ bằng sự thay đổi màu xám

## 2. Bảng Màu & Vai Trò

### Màu Chính

- **Nike Black** (`#111111`): Nền tảng — văn bản chính, nền nút, văn bản nav, lớp phủ hero. Cố ý không phải đen thuần túy (#000000), tạo ra trải nghiệm đọc mềm mại hơn một chút
- **Nike White** (`#FFFFFF`): Canvas trang chính, văn bản nút trên nền tối, bề mặt thẻ, nền thanh nav

### Bề Mặt & Nền

- **Snow** (`#FAFAFA`): Bề mặt sáng nhất, phân biệt tinh tế gần trắng (--podium-cds-color-grey-50)
- **Light Gray** (`#F5F5F5`): Nền thứ cấp, nền input tìm kiếm, placeholder ảnh, skeleton loading (--podium-cds-color-grey-100)
- **Hover Gray** (`#E5E5E5`): Nền trạng thái hover, nền nút disabled (--podium-cds-color-grey-200)
- **Dark Surface** (`#28282A`): Nền chính trên các phần tối/đảo ngược (--podium-cds-color-grey-800)
- **Deep Charcoal** (`#1F1F21`): Nền chính đảo ngược, bề mặt tối nhất không phải đen (--podium-cds-color-grey-900)
- **Dark Hover** (`#39393B`): Trạng thái hover trên nền tối (--podium-cds-color-grey-700)

### Màu Trung Tính & Văn Bản

- **Primary Text** (`#111111`): Văn bản thân chính, tiêu đề, liên kết nav (--podium-cds-color-text-primary)
- **Secondary Text** (`#707072`): Văn bản mô tả, metadata, timestamps, nhãn giá (--podium-cds-color-text-secondary)
- **Disabled Text** (`#9E9EA0`): Các yếu tố không hoạt động, tùy chọn không khả dụng (--podium-cds-color-text-disabled)
- **Disabled Inverse** (`#4B4B4D`): Văn bản disabled trên nền tối (--podium-cds-color-text-disabled-inverse)
- **Border Primary** (`#707072`): Màu viền tiêu chuẩn, khớp với văn bản thứ cấp
- **Border Secondary** (`#CACACB`): Viền tinh tế, viền input, đường kẻ phân cách (--podium-cds-color-grey-300)
- **Border Disabled** (`#CACACB`): Trạng thái viền không hoạt động
- **Border Active** (`#111111`): Viền active/focused, khớp với văn bản chính

### Ngữ Nghĩa & Nhấn Mạnh

- **Nike Red** (`#D30005`): Lỗi nghiêm trọng, badge sale, thông báo khẩn cấp (--podium-cds-color-red-600)
- **Bright Red** (`#EE0005`): Red-500, đỏ nhạt hơn một chút để nhấn mạnh
- **Nike Orange Badge** (`#D33918`): Văn bản badge, callout quảng cáo (--podium-cds-color-text-badge)
- **Orange Flash** (`#FF5000`): Nhấn màu cam biểu cảm (--podium-cds-color-orange-400)
- **Success Green** (`#007D48`): Xác nhận, tính khả dụng, trạng thái tích cực (--podium-cds-color-green-600)
- **Success Inverse** (`#1EAA52`): Thành công trên nền tối (--podium-cds-color-green-500)
- **Link Blue** (`#1151FF`): Liên kết văn bản, điểm nhấn thông tin (--podium-cds-color-blue-500)
- **Info Inverse** (`#1190FF`): Liên kết trên nền tối (--podium-cds-color-blue-400)
- **Warning Yellow** (`#FEDF35`): Nền cảnh báo, banner chú ý (--podium-cds-color-yellow-200)
- **Focus Ring** (`rgba(39, 93, 197, 1)`): Vòng chỉ báo focus bằng bàn phím

### Dải Màu Mở Rộng (Podium CDS)

Mỗi dải màu chạy từ 50–900 để sử dụng biểu cảm trong các campaign và trang sản phẩm:

- **Red**: `#FFE5E5` → `#EE0005` → `#530300`
- **Orange**: `#FFE2D6` → `#FF5000` → `#3E1009`
- **Yellow**: `#FEF087` → `#FCA600` → `#99470A`
- **Green**: `#DFFFB9` → `#1EAA52` → `#003C2A`
- **Teal**: `#D4FFFB` → `#008E98` → `#043441`
- **Blue**: `#D6EEFF` → `#1151FF` → `#020664`
- **Purple**: `#E4E1FC` → `#6E0FF6` → `#1C0060`
- **Pink**: `#FFE1F3` → `#ED1AA0` → `#4C012D`

### Hệ Thống Gradient

Nike tránh sử dụng gradient trong giao diện. Khi gradient xuất hiện, chúng mang tính nhiếp ảnh — được áp dụng cho nền hero sản phẩm (ví dụ: một đôi giày đỏ trên nền gradient đỏ-đến-đỏ-đậm hơn). Bản thân hệ thống thiết kế chỉ dùng màu phẳng.

## 3. Quy Tắc Typography

### Họ Font

**Display:** Nike Futura ND (biến thể Futura condensed tùy chỉnh độc quyền của Nike)
- Fallbacks: Helvetica Now Text Medium, Helvetica, Arial
- Được dùng độc quyền cho các tiêu đề display chữ hoa lớn
- Đặc trưng bởi line-height chặt (0.90) và uppercase transform

**Heading:** Helvetica Now Display Medium
- Fallbacks: Helvetica, Arial
- Dùng cho tiêu đề phần và tiêu đề sản phẩm ở 24–32px

**Body Medium:** Helvetica Now Text Medium (weight 500)
- Fallbacks: Helvetica, Arial
- Dùng cho liên kết, nút, chú thích, văn bản thân nhấn mạnh

**Body:** Helvetica Now Text (weight 400)
- Fallbacks: Helvetica, Arial
- Dùng cho văn bản thân tiêu chuẩn, mô tả, metadata

**Arabic:** Neue Frutiger Arabic — thay thế theo ngôn ngữ cụ thể

### Phân Cấp

| Vai Trò | Kích Thước | Weight | Line Height | Letter Spacing | Ghi Chú |
|------|------|--------|-------------|----------------|-------|
| Display | 96px | 500 | 0.90 | — | Nike Futura ND, chữ hoa, tiêu đề hero |
| Heading 1 | 32px | 500 | 1.20 | — | Helvetica Now Display Medium, tiêu đề phần |
| Heading 2 | 24px | 500 | 1.20 | — | Helvetica Now Display Medium, tiêu đề phụ |
| Heading 3 | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, tiêu đề thẻ |
| Body | 16px | 400 | 1.75 | — | Helvetica Now Text, mô tả sản phẩm |
| Body Medium | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, văn bản nhấn mạnh |
| Link | 16px | 500 | 1.75 | — | Helvetica Now Text Medium, liên kết điều hướng |
| Link Small | 14px | 500 | 1.86 | — | Helvetica Now Text Medium, liên kết footer/tiện ích |
| Button | 16px | 500 | 1.50 | — | Helvetica Now Text Medium, văn bản CTA |
| Button Small | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, nút phụ |
| Caption | 14px | 500 | 1.50 | — | Helvetica Now Text Medium, nhãn giá |
| Small | 12px | 500 | 1.50 | — | Helvetica Now Text Medium, timestamps |
| Tiny | 12px | 400 | 1.50 | — | Helvetica Now Text, văn bản pháp lý |

### Nguyên Tắc

Typography của Nike là một nghiên cứu về sự căng thẳng. Lớp display — Nike Futura ND ở 96px với line-height 0.90 tàn bạo — được thiết kế để cảm giác như bảng điểm sân vận động: khổng lồ, condensed, chữ hoa, không thể bỏ qua. Nó biến các tiêu đề thành tiếng hét trận chiến. Bên dưới lớp display, Helvetica Now cung cấp một điểm đối lập lâm sàng: độ dễ đọc chính xác kiểu Thụy Sĩ với line-height 1.75 thoải mái để duyệt sản phẩm dễ chịu. Weight 500 (Medium) chiếm ưu thế xuyên suốt văn bản thân, mang lại cho văn xuôi của Nike một chút quyết đoán nhẹ nhàng mà không nặng nề như bold — mọi câu đều đọc như một khuyến nghị tự tin, không phải tiếng hét.

## 4. Tạo Kiểu Thành Phần

### Nút

**Chính**
- Background: Nike Black (`#111111`)
- Văn bản: White (`#FFFFFF`), 16px/500, Helvetica Now Text Medium
- Border: không có
- Border radius: viên thuốc bo tròn hoàn toàn (30px)
- Padding: ~12px 24px
- Hover: background chuyển sang Grey-500 (`#707072`), màu văn bản hover
- Active: hiệu ứng ripple scale(0) với opacity 0.5
- Focus: vòng box-shadow 2px trong `rgba(39, 93, 197, 1)`
- Transition: background 200ms ease

**Chính trên Nền Tối**
- Background: White (`#FFFFFF`)
- Văn bản: Black (`#111111`)
- Hover: background chuyển sang Grey-300 (`#CACACB`)

**Phụ (Viền)**
- Background: transparent
- Văn bản: Nike Black (`#111111`)
- Border: 1.5px solid `#CACACB` (grey-300)
- Border radius: 30px
- Hover: viền tối hơn thành `#707072`, background thành grey-200

**Disabled**
- Background: Grey-200 (`#E5E5E5`)
- Văn bản: Grey-400 (`#9E9EA0`)
- Cursor: not-allowed

**Nút Icon**
- Background: Grey-100 (`#F5F5F5`)
- Hình dạng: radius 30px (hoặc 50% cho hình tròn)
- Padding: 6px
- Hover: nền Grey-500

### Thẻ & Container

- Background: White (`#FFFFFF`) — không có ranh giới thẻ hiển thị trong hầu hết các trường hợp
- Border radius: 0px cho thẻ ảnh sản phẩm (hình ảnh tràn cạnh), 20px cho container tương tác
- Shadow: không có — Nike không dùng bóng thẻ nào cả
- Hover: không có hiệu ứng nâng trên thẻ sản phẩm; gạch chân trên liên kết văn bản trong thẻ
- Thẻ sản phẩm: ảnh ở trên (không có radius), metadata văn bản bên dưới với khoảng cách 12px
- Thẻ danh mục: ảnh toàn viền với văn bản phủ trên nền gradient tối
- Transition: opacity 200ms ease cho việc đổi ảnh khi hover

### Input & Form

- Background: Grey-100 (`#F5F5F5`)
- Border: 1px solid `#CACACB` khi hiển thị, hoặc không viền trên tìm kiếm
- Border radius: 24px (input tìm kiếm), 8px (input form)
- Font: Helvetica Now Text, 16px
- Focus: border chuyển sang `#111111` (border-active), vòng focus 2px trong `rgba(39, 93, 197, 1)`
- Lỗi: border `#D30005` (critical)
- Placeholder: Grey-500 (`#707072`)
- Transition: border-color 200ms ease

### Điều Hướng

- Background: White (`#FFFFFF`), sticky
- Chiều cao: ~60px desktop
- Trái: Logo Nike Swoosh (SVG 24x24px)
- Giữa: Liên kết danh mục (New & Featured, Men, Women, Kids, Sale) ở 16px/500 Helvetica Now Text Medium
- Phải: Tìm kiếm (input radius 24px), Yêu thích, icon Giỏ hàng
- Hover: màu văn bản chuyển sang Grey-500 (`#707072`)
- Mobile: menu hamburger, overlay toàn màn hình
- Banner trên cùng: thanh thông báo quảng cáo với nền tối (#111111) và văn bản trắng

### Xử Lý Ảnh

- Ảnh hero: toàn viền, không có border radius, tràn cạnh
- Lưới sản phẩm: tỉ lệ vuông (1:1) hoặc 4:3, không có border radius
- Thẻ danh mục: 16:9 hoặc 4:3, toàn viền với văn bản phủ
- Placeholder ảnh: nền solid Grey-100 (`#F5F5F5`)
- Lazy loading: native loading="lazy", skeleton dùng nền #F5F5F5
- Hover sản phẩm: đổi ảnh thứ cấp (nhìn trước → nhìn bên)

### Banner Quảng Cáo

- Nền tối (`#111111`) toàn chiều rộng với văn bản trắng
- Padding chặt (8-12px dọc)
- Văn bản căn giữa, 12px/500 Helvetica Now Text Medium
- Dùng cho khuyến mãi vận chuyển, lợi ích thành viên, thông báo sale

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách

Đơn vị cơ sở: 4px (lưới chính là bội số của 8px)

| Token | Giá Trị | Sử Dụng |
|-------|-------|-----|
| space-1 | 4px | Khoảng cách icon chặt, khoảng cách inline |
| space-2 | 8px | Đơn vị cơ sở, khoảng cách icon nút |
| space-3 | 12px | Padding nội bộ thẻ, margin chặt |
| space-4 | 16px | Padding tiêu chuẩn, khoảng cách nav |
| space-5 | 20px | Khoảng cách giữa thẻ sản phẩm |
| space-6 | 24px | Padding nội bộ phần, khoảng cách lưới |
| space-7 | 32px | Ngắt phần |
| space-8 | 48px | Padding phần lớn |
| space-9 | 64px | Padding phần hero |
| space-10 | 80px | Khoảng cách phần lớn |

### Lưới & Container

- Chiều rộng container tối đa: 1920px
- Chiều rộng nội dung tiêu chuẩn: ~1440px với padding ngang
- Lưới sản phẩm: 3 cột trên desktop, 2 cột trên tablet, 1 cột trên mobile
- Lưới danh mục: 3 cột với ảnh toàn viền
- Khoảng cách lưới: 4-12px giữa các thẻ sản phẩm (cố ý chặt)
- Padding ngang: 48px desktop, 24px tablet, 16px mobile

### Triết Lý Whitespace

Chiến lược whitespace của Nike cố ý hung hăng — không phải theo cách thở rộng, thoáng đãng của một thương hiệu thời trang, mà theo cách nén cao mật độ lấp đầy mọi pixel bằng nội dung hoặc khoảng trống có chủ đích. Các lưới sản phẩm sử dụng khoảng cách tối thiểu (4-12px) để tạo cảm giác phong phú và đa dạng. Các ngắt phần rộng rãi (48-80px) để phân tách các bối cảnh mua sắm. Hiệu ứng tổng thể là một cửa hàng cảm giác chật ních sản phẩm trong khi vẫn có thể điều hướng được — như một siêu thị thể thao được tổ chức tốt.

### Thang Đo Border Radius

| Giá Trị | Bối Cảnh |
|-------|---------|
| 0px | Ảnh sản phẩm, ảnh chụp hero (cạnh sắc) |
| 8px | Input form (không phải tìm kiếm) |
| 18px | Các yếu tố tương tác nhỏ |
| 20px | Container, thẻ với nội dung giao diện |
| 24px | Input tìm kiếm, viên thuốc vừa |
| 30px | Nút, tag, bộ lọc (viên thuốc đầy) |
| 50% | Nút icon hình tròn, placeholder avatar |

## 6. Độ Sâu & Độ Cao

| Cấp | Xử Lý | Sử Dụng |
|-------|-----------|-----|
| Flat | Không shadow, không border | Trạng thái mặc định cho mọi thứ |
| Divider | `0px -1px 0px 0px #E5E5E5 inset` | Đường inset tinh tế giữa các phần |
| Focus | `0 0 0 2px rgba(39, 93, 197, 1)` | Vòng focus bàn phím |
| Overlay | Lớp phủ tối lên ảnh chụp | Khả năng đọc văn bản trên ảnh |

Triết lý độ cao của Nike là phẳng triệt để. Không có bóng thẻ, không có hiệu ứng nâng khi hover, không có yếu tố nổi. Độ sâu được truyền đạt hoàn toàn qua màu sắc — các phần tối lùi ra sau, các phần sáng tiến ra trước, sự thay đổi xám biểu thị thay đổi trạng thái. Sự phẳng này củng cố cá tính thương hiệu thể thao, thực dụng: không có phô trương hình ảnh, chỉ giao tiếp trực tiếp. "Bóng" duy nhất trong toàn bộ hệ thống là đường phân cách inset 1px và vòng focus bắt buộc theo tiêu chuẩn accessibility.

### Độ Sâu Trang Trí

- **Lớp phủ ảnh hero**: Lớp phủ gradient tối lên ảnh toàn viền để đảm bảo khả năng đọc văn bản
- **Gradient nền sản phẩm**: Nền màu phía sau ảnh sản phẩm hero (ví dụ: giày đỏ trên gradient đỏ)
- **Thanh banner**: Dải quảng cáo tối solid (#111111) ở đầu trang

## 7. Nên và Không Nên

### Nên

- Dùng Nike Black (#111111) cho tất cả văn bản chính — không bao giờ dùng thuần #000000
- Giữ nút hình viên thuốc (radius 30px) và giới hạn ở biến thể chính/phụ
- Dùng ảnh toàn viền, tràn cạnh cho các phần hero — không có border radius trên ảnh
- Để ảnh chụp sản phẩm cung cấp tất cả sự sống động màu sắc; giữ giao diện đơn sắc
- Dùng Nike Futura ND chữ hoa CHỈ cho tiêu đề display (96px+)
- Duy trì khoảng cách lưới sản phẩm chặt (4-12px) để cảm giác dày đặc, phong phú
- Dùng Grey-100 (#F5F5F5) cho tất cả nền input và placeholder
- Dành màu sắc độc quyền cho ý nghĩa ngữ nghĩa (đỏ=lỗi, xanh lá=thành công, xanh dương=liên kết)
- Dùng weight 500 (Medium) cho tất cả các yếu tố văn bản tương tác

### Không Nên

- Không thêm bóng vào thẻ — mô hình độ cao của Nike hoàn toàn phẳng
- Không dùng border radius trên ảnh sản phẩm — chỉ các yếu tố giao diện mới có góc bo tròn
- Không đưa màu thương hiệu ngoài thang xám vào các yếu tố giao diện
- Không dùng Nike Futura ND dưới 24px — nó hoàn toàn là font display
- Không thêm hiệu ứng nâng khi hover — thẻ Nike không animate khi hover
- Không dùng weight thường (400) cho nút hoặc liên kết — luôn dùng 500
- Không đặt nền màu sau các yếu tố giao diện — màu sắc được dành riêng cho bối cảnh sản phẩm
- Không dùng nhiều hơn hai cấp phân cấp văn bản mỗi thẻ (tiêu đề + thân)
- Không thêm đường phân cách trang trí — đường inset 1px là mẫu phân cách duy nhất
- Không làm mềm độ tương phản — thiết kế của Nike cố ý đẩy đen-trên-trắng đến mức tối đa

## 8. Hành Vi Responsive

### Breakpoint

| Tên | Chiều Rộng | Thay Đổi Chính |
|------|-------|-------------|
| Mobile | <640px | Một cột, nav hamburger, văn bản display thu nhỏ, padding 16px chặt |
| Small Tablet | 640-768px | Lưới sản phẩm 2 cột bắt đầu, nav vẫn thu gọn |
| Tablet | 768-960px | Lưới 2 cột, thẻ danh mục thu nhỏ, padding ngang 24px |
| Small Desktop | 960-1024px | Nav mở rộng ngang đầy đủ, lưới sản phẩm 3 cột |
| Desktop | 1024-1440px | Bố cục đầy đủ, nav mở rộng, lưới 3 cột, padding 48px |
| Large Desktop | >1440px | Container max-width căn giữa, margin tăng, ảnh hero toàn viền |

### Vùng Chạm

- Vùng chạm tối thiểu: 44x44px (WCAG AAA)
- Icon nav mobile: vùng chạm 48x48px
- Thẻ sản phẩm: toàn bề mặt có thể chạm
- Pill lọc: chiều cao tối thiểu 36px với padding 12px

### Chiến Lược Thu Gọn

- **Điều hướng**: Liên kết danh mục đầy đủ → menu hamburger dưới 960px; các icon tìm kiếm, yêu thích, giỏ hàng vẫn hiển thị
- **Lưới sản phẩm**: 3 cột → 2 cột ở 960px → 1 cột ở 640px
- **Phần hero**: Văn bản display thu nhỏ từ 96px → 64px → 48px; ảnh hero vẫn toàn viền ở mọi kích thước
- **Thẻ danh mục**: 3 cột → 2 cột → 1 cột với hình ảnh toàn viền được duy trì
- **Padding phần**: 80px → 48px → 32px → 24px khi viewport thu hẹp
- **Banner quảng cáo**: văn bản xuống dòng hoặc cắt ngắn, duy trì nền tối

### Hành Vi Ảnh

- Ảnh responsive qua Nike CDN (`c.static-nike.com`) với tham số chiều rộng
- Ảnh sản phẩm: srcset với nhiều độ phân giải (w_320, w_640, w_960, w_1920)
- Ảnh hero: toàn viền ở mọi breakpoint, tỉ lệ khung hình thay đổi (16:9 desktop → 4:3 mobile)
- Lazy loading: native loading="lazy", placeholder grey-100 trong khi tải
- Chỉ đạo nghệ thuật: crop hero thay đổi giữa bố cục desktop và mobile

## 9. Hướng Dẫn Agent Prompt

### Tham Chiếu Màu Nhanh

- CTA chính: Nike Black (`#111111`)
- Background: White (`#FFFFFF`)
- Bề mặt thứ cấp: Light Gray (`#F5F5F5`)
- Văn bản tiêu đề: Nike Black (`#111111`)
- Văn bản thân / hover: Secondary Text (`#707072`)
- Border: Border Secondary (`#CACACB`)
- Lỗi: Nike Red (`#D30005`)
- Liên kết: Link Blue (`#1151FF`)

### Ví Dụ Prompt Thành Phần

- "Tạo phần hero sản phẩm với ảnh toàn viền tràn cạnh, không có border radius, lớp phủ gradient tối cho văn bản, và tiêu đề chữ hoa khổng lồ 96px/500 theo phong cách Nike Futura với line-height 0.90 và nút viên thuốc Nike Black (#111111) (radius 30px)"
- "Thiết kế lưới thẻ sản phẩm 3 cột với ảnh vuông (không có border radius), khoảng cách 4px giữa các thẻ, tên sản phẩm ở 16px/500 Nike Black (#111111), giá ở 14px/500, và văn bản phụ ở Grey-500 (#707072)"
- "Xây dựng thanh điều hướng trắng sticky với logo căn trái, liên kết danh mục căn giữa ở 16px/500 (#111111) với màu hover #707072, và tìm kiếm căn phải (radius 24px, nền #F5F5F5), icon yêu thích và giỏ hàng"
- "Tạo dải banner quảng cáo với nền #111111, văn bản trắng 12px/500 căn giữa, và padding dọc 8px — toàn chiều rộng, không có border radius"
- "Thiết kế nút phụ có viền với nền transparent, border 1.5px #CACACB, radius viên thuốc 30px, văn bản 16px/500 #111111, border hover tối hơn thành #707072"

### Hướng Dẫn Lặp Lại

Khi tinh chỉnh các màn hình hiện có được tạo với hệ thống thiết kế này:
1. Tập trung vào MỘT thành phần tại một thời điểm
2. Tham chiếu tên màu cụ thể và mã hex từ tài liệu này
3. Nhớ rằng: ảnh chụp sản phẩm là màu sắc — giao diện giữ đơn sắc
4. Dùng thang xám cho thay đổi trạng thái: #F5F5F5 → #E5E5E5 → #CACACB → #707072
5. Nếu có gì đó trông quá màu sắc trong giao diện, có lẽ đúng là vậy — Nike giữ giao diện thang xám
6. Kiểu chữ display (Nike Futura) luôn phải là chữ hoa và không bao giờ dưới 24px
7. Kiểu chữ thân (Helvetica Now) hầu như luôn nên ở weight 500 cho các yếu tố tương tác
