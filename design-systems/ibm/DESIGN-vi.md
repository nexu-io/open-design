# Design System Inspired by IBM

> Category: Media & Consumer
> Công nghệ doanh nghiệp. Hệ thống thiết kế Carbon, bảng màu xanh có cấu trúc.

## 1. Chủ đề Hình ảnh & Bầu không khí

Trang web của IBM là hiện thân kỹ thuật số của uy quyền doanh nghiệp, được xây dựng trên Carbon Design System — một ngôn ngữ thiết kế có cấu trúc phương pháp đến mức đọc như một bản đặc tả kỹ thuật được dựng lên thành trang web. Trang vận hành trên một sự tương phản rõ nét: nền trắng tinh (`#ffffff`) với chữ gần đen (`#161616`), được điểm xuyết bởi một điểm nhấn duy nhất, bất biến — IBM Blue 60 (`#0f62fe`). Đây không phải là chủ nghĩa tối giản vui tươi của startup công nghệ; đây là sự chính xác doanh nghiệp được chắt lọc thành từng pixel. Mỗi phần tử tồn tại trong lưới 2x cứng nhắc của Carbon, mỗi màu sắc ánh xạ tới một token ngữ nghĩa, mỗi giá trị khoảng cách bắt khớp với đơn vị cơ sở 8px.

Bộ chữ IBM Plex là xương sống của hệ thống. IBM Plex Sans ở trọng lượng nhẹ (300) cho tiêu đề hiển thị tạo ra một chất lượng thoáng đạt, gần như thanh thoát bất ngờ ở kích thước lớn — một điểm đối lập có chủ ý với trọng lực doanh nghiệp của IBM. Ở kích thước thân bài, trọng lượng thông thường (400) với giãn chữ 0.16px trên chú thích 14px đưa vào kỹ thuật theo dõi vi mô tỉ mỉ khiến văn bản Carbon cảm giác được kỹ thuật hóa hơn là thiết kế. IBM Plex Mono phục vụ mã nguồn, dữ liệu và nhãn kỹ thuật, hoàn thiện bộ ba dòng chữ cùng với IBM Plex Serif ít khi xuất hiện.

Điều định nghĩa bản sắc hình ảnh của IBM vượt ra ngoài đơn sắc cộng xanh là sự phụ thuộc vào hệ thống token thành phần của Carbon. Mỗi trạng thái tương tác ánh xạ tới một thuộc tính tùy chỉnh CSS có tiền tố `--cds-` (Carbon Design System). Các nút không có màu hardcoded; chúng tham chiếu `--cds-button-primary`, `--cds-button-primary-hover`, `--cds-button-primary-active`. Kiến trúc token hóa này có nghĩa là toàn bộ lớp hình ảnh là một lớp vỏ mỏng trên nền tảng có hệ thống sâu — tương đương thiết kế của một API được định kiểu tốt.

**Đặc điểm Chính:**
- IBM Plex Sans ở trọng lượng 300 (Light) để hiển thị — uy quyền doanh nghiệp thông qua sự tiết chế về kiểu chữ
- IBM Plex Mono cho nội dung mã nguồn và kỹ thuật với giãn chữ nhất quán 0.16px ở kích thước nhỏ
- Màu nhấn đơn lẻ: IBM Blue 60 (`#0f62fe`) — mỗi phần tử tương tác, mỗi CTA, mỗi liên kết
- Hệ thống token Carbon (`--cds-*`) điều khiển tất cả màu ngữ nghĩa, cho phép chuyển đổi chủ đề ở cấp độ biến
- Lưới khoảng cách 8px với tuân thủ nghiêm ngặt — không có giá trị tùy tiện, mọi thứ đều căn chỉnh
- Thẻ phẳng, không viền trên bề mặt `#f4f4f4` Gray 10 — chiều sâu thông qua xếp lớp màu nền, không phải đổ bóng
- Input viền-dưới (không đóng hộp) — kiểu mẫu form Carbon đặc trưng
- Border-radius 0px trên nút chính — hình chữ nhật thẳng thắn, không làm mềm

## 2. Bảng màu & Vai trò

### Chính
- **IBM Blue 60** (`#0f62fe`): Màu tương tác duy nhất. Nút chính, liên kết, trạng thái focus, chỉ báo hoạt động. Đây là sắc màu chromatic duy nhất trong bảng màu UI cốt lõi.
- **Trắng** (`#ffffff`): Nền trang, bề mặt thẻ, chữ nút trên nền xanh, `--cds-background`.
- **Gray 100** (`#161616`): Chữ chính, tiêu đề, nền bề mặt tối, thanh điều hướng, chân trang. `--cds-text-primary`.

### Thang Trung tính (Họ Xám)
- **Gray 100** (`#161616`): Chữ chính, tiêu đề, chrome UI tối, nền chân trang.
- **Gray 90** (`#262626`): Bề mặt tối phụ, trạng thái hover trên nền tối.
- **Gray 80** (`#393939`): Tối bậc ba, trạng thái active.
- **Gray 70** (`#525252`): Chữ phụ, chữ trợ giúp, mô tả. `--cds-text-secondary`.
- **Gray 60** (`#6f6f6f`): Chữ placeholder, chữ vô hiệu hóa.
- **Gray 50** (`#8d8d8d`): Biểu tượng vô hiệu hóa, nhãn mờ.
- **Gray 30** (`#c6c6c6`): Viền, đường chia, viền-dưới input. `--cds-border-subtle`.
- **Gray 20** (`#e0e0e0`): Viền tinh tế, đường viền thẻ.
- **Gray 10** (`#f4f4f4`): Nền bề mặt phụ, nền thẻ, hàng xen kẽ. `--cds-layer-01`.
- **Gray 10 Hover** (`#e8e8e8`): Trạng thái hover cho bề mặt Gray 10.

### Tương tác
- **Blue 60** (`#0f62fe`): Tương tác chính — nút, liên kết, focus. `--cds-link-primary`, `--cds-button-primary`.
- **Blue 70** (`#0043ce`): Trạng thái hover liên kết. `--cds-link-primary-hover`.
- **Blue 80** (`#002d9c`): Trạng thái active/nhấn cho các phần tử xanh.
- **Blue 10** (`#edf5ff`): Bề mặt sắc xanh nhạt, nền hàng được chọn.
- **Focus Blue** (`#0f62fe`): `--cds-focus` — viền inset 2px trên các phần tử được focus.
- **Focus Inset** (`#ffffff`): `--cds-focus-inset` — vòng trong trắng cho focus trên nền tối.

### Hỗ trợ & Trạng thái
- **Red 60** (`#da1e28`): Lỗi, nguy hiểm. `--cds-support-error`.
- **Green 50** (`#24a148`): Thành công. `--cds-support-success`.
- **Yellow 30** (`#f1c21b`): Cảnh báo. `--cds-support-warning`.
- **Blue 60** (`#0f62fe`): Thông tin. `--cds-support-info`.

### Chủ đề Tối (Gray 100 Theme)
- **Nền**: Gray 100 (`#161616`). `--cds-background`.
- **Layer 01**: Gray 90 (`#262626`). Bề mặt thẻ và container.
- **Layer 02**: Gray 80 (`#393939`). Bề mặt nâng cao.
- **Text Primary**: Gray 10 (`#f4f4f4`). `--cds-text-primary`.
- **Text Secondary**: Gray 30 (`#c6c6c6`). `--cds-text-secondary`.
- **Border Subtle**: Gray 80 (`#393939`). `--cds-border-subtle`.
- **Tương tác**: Blue 40 (`#78a9ff`). Liên kết và phần tử tương tác chuyển sang màu sáng hơn để đảm bảo độ tương phản.

## 3. Quy tắc Kiểu chữ

### Họ Font
- **Chính**: `IBM Plex Sans`, với fallback: `Helvetica Neue, Arial, sans-serif`
- **Monospace**: `IBM Plex Mono`, với fallback: `Menlo, Courier, monospace`
- **Serif** (dùng hạn chế): `IBM Plex Serif`, cho bối cảnh biên tập/biểu cảm
- **Icon Font**: `ibm_icons` — glyphs biểu tượng độc quyền ở 20px

### Phân cấp

| Vai trò | Font | Kích thước | Trọng lượng | Chiều cao dòng | Giãn chữ | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Display 01 | IBM Plex Sans | 60px (3.75rem) | 300 (Light) | 1.17 (70px) | 0 | Tác động tối đa, trọng lượng nhẹ cho sự thanh lịch |
| Display 02 | IBM Plex Sans | 48px (3.00rem) | 300 (Light) | 1.17 (56px) | 0 | Hero phụ, fallback responsive |
| Heading 01 | IBM Plex Sans | 42px (2.63rem) | 300 (Light) | 1.19 (50px) | 0 | Tiêu đề biểu cảm |
| Heading 02 | IBM Plex Sans | 32px (2.00rem) | 400 (Regular) | 1.25 (40px) | 0 | Tiêu đề phần |
| Heading 03 | IBM Plex Sans | 24px (1.50rem) | 400 (Regular) | 1.33 (32px) | 0 | Tiêu đề tiểu mục |
| Heading 04 | IBM Plex Sans | 20px (1.25rem) | 600 (Semibold) | 1.40 (28px) | 0 | Tiêu đề thẻ, tiêu đề tính năng |
| Heading 05 | IBM Plex Sans | 20px (1.25rem) | 400 (Regular) | 1.40 (28px) | 0 | Tiêu đề thẻ nhẹ hơn |
| Body Long 01 | IBM Plex Sans | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Văn bản đọc tiêu chuẩn |
| Body Long 02 | IBM Plex Sans | 16px (1.00rem) | 600 (Semibold) | 1.50 (24px) | 0 | Nội dung nhấn mạnh, nhãn |
| Body Short 01 | IBM Plex Sans | 14px (0.88rem) | 400 (Regular) | 1.29 (18px) | 0.16px | Nội dung thu gọn, chú thích |
| Body Short 02 | IBM Plex Sans | 14px (0.88rem) | 600 (Semibold) | 1.29 (18px) | 0.16px | Chú thích đậm, mục điều hướng |
| Caption 01 | IBM Plex Sans | 12px (0.75rem) | 400 (Regular) | 1.33 (16px) | 0.32px | Siêu dữ liệu, dấu thời gian |
| Code 01 | IBM Plex Mono | 14px (0.88rem) | 400 (Regular) | 1.43 (20px) | 0.16px | Mã inline, terminal |
| Code 02 | IBM Plex Mono | 16px (1.00rem) | 400 (Regular) | 1.50 (24px) | 0 | Khối mã |
| Mono Display | IBM Plex Mono | 42px (2.63rem) | 400 (Regular) | 1.19 (50px) | 0 | Hero mono trang trí |

### Nguyên tắc
- **Trọng lượng nhẹ ở kích thước hiển thị**: Bộ kiểu chữ biểu cảm của Carbon sử dụng trọng lượng 300 (Light) ở 42px trở lên. Điều này tạo ra một sự căng thẳng đặc biệt — nội dung nói chuyện với uy quyền doanh nghiệp trong khi các chữ cái thì thầm với sự nhẹ nhàng về kiểu chữ.
- **Vi theo dõi ở kích thước nhỏ**: Giãn chữ 0.16px ở 14px và 0.32px ở 12px. Những giá trị tưởng như không đáng kể này là vũ khí bí mật của Carbon cho khả năng đọc ở kích thước nhỏ gọn — chúng mở ra các nét chữ IBM Plex vừa đủ.
- **Ba trọng lượng chức năng**: 300 (hiển thị/biểu cảm), 400 (nội dung/đọc), 600 (nhấn mạnh/nhãn UI). Trọng lượng 700 vắng mặt có chủ ý trong thang kiểu chữ sản xuất.
- **Năng suất so với Biểu cảm**: Các bộ năng suất sử dụng chiều cao dòng chặt hơn (1.29) cho UI dày đặc. Các bộ biểu cảm thở hơn (1.40-1.50) cho nội dung marketing và biên tập.

## 4. Kiểu dáng Thành phần

### Nút

**Nút Chính (Xanh)**
- Nền: `#0f62fe` (Blue 60) → `--cds-button-primary`
- Chữ: `#ffffff` (White)
- Padding: 14px 63px 14px 15px (bất đối xứng — chỗ cho biểu tượng theo sau)
- Border: 1px solid transparent
- Border-radius: 0px (hình chữ nhật sắc nét — chữ ký Carbon)
- Chiều cao: 48px (mặc định), 40px (nhỏ gọn), 64px (biểu cảm)
- Hover: `#0353e9` (Blue 60 Hover) → `--cds-button-primary-hover`
- Active: `#002d9c` (Blue 80) → `--cds-button-primary-active`
- Focus: `2px solid #0f62fe` inset + `1px solid #ffffff` bên trong

**Nút Phụ (Xám)**
- Nền: `#393939` (Gray 80)
- Chữ: `#ffffff`
- Hover: `#4c4c4c` (Gray 70)
- Active: `#6f6f6f` (Gray 60)
- Padding/radius giống như nút chính

**Nút Bậc Ba (Ghost Xanh)**
- Nền: transparent
- Chữ: `#0f62fe` (Blue 60)
- Border: 1px solid `#0f62fe`
- Hover: chữ `#0353e9` + sắc xanh nhạt nền Blue 10
- Border-radius: 0px

**Nút Ghost**
- Nền: transparent
- Chữ: `#0f62fe` (Blue 60)
- Padding: 14px 16px
- Border: none
- Hover: sắc xám nhạt nền `#e8e8e8`

**Nút Nguy hiểm**
- Nền: `#da1e28` (Red 60)
- Chữ: `#ffffff`
- Hover: `#b81921` (Red 70)

### Thẻ & Container
- Nền: `#ffffff` trên chủ đề trắng, `#f4f4f4` (Gray 10) cho thẻ nâng cao
- Border: none (thiết kế phẳng — không viền hoặc đổ bóng trên hầu hết thẻ)
- Border-radius: 0px (phù hợp với thẩm mỹ nút chữ nhật)
- Hover: nền chuyển sang `#e8e8e8` (Gray 10 Hover) cho thẻ có thể nhấp
- Padding nội dung: 16px
- Phân tách: xếp lớp màu nền (trắng → gray 10 → trắng) thay vì đổ bóng

### Input & Form
- Nền: `#f4f4f4` (Gray 10) — `--cds-field`
- Chữ: `#161616` (Gray 100)
- Padding: 0px 16px (chỉ ngang)
- Chiều cao: 40px (mặc định), 48px (lớn)
- Border: none ở hai bên/trên — `2px solid transparent` dưới
- Viền-dưới active: `2px solid #161616` (Gray 100)
- Focus: `2px solid #0f62fe` (Blue 60) viền-dưới — `--cds-focus`
- Lỗi: `2px solid #da1e28` (Red 60) viền-dưới
- Nhãn: 12px IBM Plex Sans, giãn chữ 0.32px, Gray 70
- Chữ trợ giúp: 12px, Gray 60
- Placeholder: Gray 60 (`#6f6f6f`)
- Border-radius: 0px (trên) — input có góc sắc

### Điều hướng
- Nền: `#161616` (Gray 100) — masthead tối toàn chiều rộng
- Chiều cao: 48px
- Logo: IBM 8-thanh, trắng trên nền tối, căn trái
- Liên kết: 14px IBM Plex Sans, trọng lượng 400, mặc định `#c6c6c6` (Gray 30)
- Hover liên kết: chữ `#ffffff`
- Liên kết active: `#ffffff` với chỉ báo viền-dưới
- Bộ chuyển đổi nền tảng: tab ngang căn trái
- Tìm kiếm: trường tìm kiếm trượt ra được kích hoạt bằng biểu tượng
- Mobile: hamburger với bảng trượt sang trái

### Liên kết
- Mặc định: `#0f62fe` (Blue 60) không gạch chân
- Hover: `#0043ce` (Blue 70) có gạch chân
- Đã thăm: vẫn là Blue 60 (không thay đổi trạng thái đã thăm)
- Liên kết inline: mặc định gạch chân trong nội dung thân bài

### Thành phần Đặc trưng

**Khối Nội dung (Hero/Feature)**
- Dải nền trắng/gray-10 xen kẽ toàn chiều rộng
- Tiêu đề căn trái với kiểu hiển thị 60px hoặc 48px
- CTA là nút chính xanh với biểu tượng mũi tên
- Hình ảnh/minh họa căn phải hoặc bên dưới trên mobile

**Tile (Thẻ có thể nhấp)**
- Nền: `#f4f4f4` hoặc `#ffffff`
- Hover toàn chiều rộng viền-dưới hoặc chuyển màu nền
- Biểu tượng mũi tên góc dưới phải khi hover
- Không đổ bóng — sự phẳng là bản sắc

**Tag / Nhãn**
- Nền: màu ngữ cảnh ở độ mờ 10% (ví dụ: Blue 10, Red 10)
- Chữ: màu cấp 60 tương ứng
- Padding: 4px 8px
- Border-radius: 24px (hình viên — ngoại lệ so với quy tắc 0px)
- Font: 12px trọng lượng 400

**Banner Thông báo**
- Thanh toàn chiều rộng, thường là nền Blue 60 hoặc Gray 100
- Chữ trắng, 14px
- Biểu tượng đóng/bỏ qua căn phải

## 5. Nguyên tắc Bố cục

### Hệ thống Khoảng cách
- Đơn vị cơ sở: 8px (lưới 2x của Carbon)
- Thang khoảng cách thành phần: 2px, 4px, 8px, 12px, 16px, 24px, 32px, 40px, 48px
- Thang khoảng cách bố cục: 16px, 24px, 32px, 48px, 64px, 80px, 96px, 160px
- Đơn vị mini: 8px (khoảng cách nhỏ nhất có thể dùng)
- Padding trong thành phần: thường 16px
- Khoảng cách giữa thẻ/tile: 1px (đường tóc) hoặc 16px (tiêu chuẩn)

### Lưới & Container
- Lưới 16 cột (hệ thống lưới 2x của Carbon)
- Chiều rộng nội dung tối đa: 1584px (điểm dừng tối đa)
- Rãnh cột: 32px (16px trên mobile)
- Lề: 16px (mobile), 32px (tablet+)
- Nội dung thường trải rộng 8-12 cột cho độ dài dòng dễ đọc
- Các phần full-bleed xen kẽ với nội dung có chứa

### Triết lý Khoảng trắng
- **Mật độ chức năng**: Carbon ưu tiên mật độ năng suất hơn khoảng trắng rộng rãi. Các phần được đóng gói chặt so với các hệ thống thiết kế hướng người dùng tiêu dùng — điều này phản ánh DNA doanh nghiệp của IBM.
- **Phân vùng màu nền**: Thay vì padding lớn giữa các phần, IBM sử dụng màu nền xen kẽ (trắng → gray 10 → trắng) để tạo sự phân tách hình ảnh với khoảng cách dọc tối thiểu.
- **Nhịp điệu 48px nhất quán**: Các chuyển tiếp phần chính sử dụng khoảng cách dọc 48px. Các phần hero có thể sử dụng 80px–96px.

### Thang Border Radius
- **0px**: Nút chính, input, tile, thẻ — cách xử lý chiếm ưu thế. Carbon về cơ bản là hình chữ nhật.
- **2px**: Thỉnh thoảng trên các phần tử tương tác nhỏ (tag)
- **24px**: Tag/nhãn (hình viên — ngoại lệ bo tròn duy nhất)
- **50%**: Vòng tròn avatar, container biểu tượng

## 6. Chiều sâu & Độ nổi

| Cấp độ | Xử lý | Sử dụng |
|-------|-----------|-----|
| Phẳng (Level 0) | Không đổ bóng, nền `#ffffff` | Bề mặt trang mặc định |
| Layer 01 | Không đổ bóng, nền `#f4f4f4` | Thẻ, tile, phần xen kẽ |
| Layer 02 | Không đổ bóng, nền `#e0e0e0` | Bảng nâng cao trong Layer 01 |
| Nổi | `0 2px 6px rgba(0,0,0,0.3)` | Dropdown, tooltip, menu tràn |
| Overlay | `0 2px 6px rgba(0,0,0,0.3)` + màn tối | Hộp thoại modal, bảng bên |
| Focus | `2px solid #0f62fe` inset + `1px solid #ffffff` | Vòng focus bàn phím |
| Viền-dưới | `2px solid #161616` trên cạnh dưới | Input active, chỉ báo tab active |

**Triết lý Đổ bóng**: Carbon có chủ ý tránh dùng đổ bóng. IBM đạt được chiều sâu chủ yếu thông qua xếp lớp màu nền — xếp chồng các bề mặt xám ngày càng tối hơn thay vì thêm box-shadow. Điều này tạo ra thẩm mỹ phẳng, lấy cảm hứng từ in ấn, nơi phân cấp được truyền đạt qua giá trị màu sắc, không phải ánh sáng mô phỏng. Đổ bóng được dành riêng cho các phần tử nổi (dropdown, tooltip, modal) nơi phần tử thực sự chồng lên nội dung. Sự kiềm chế này mang lại cho bóng hiếm hoi tác động có ý nghĩa — khi có gì đó nổi trong Carbon, nó thật sự quan trọng.

## 7. Nên và Không nên

### Nên
- Sử dụng IBM Plex Sans ở trọng lượng 300 cho kích thước hiển thị (42px+) — sự nhẹ nhàng là có chủ ý
- Áp dụng giãn chữ 0.16px trên chữ thân bài 14px và 0.32px trên chú thích 12px
- Sử dụng border-radius 0px trên nút, input, thẻ và tile — hình chữ nhật là hệ thống
- Tham chiếu tên token `--cds-*` khi triển khai (ví dụ: `--cds-button-primary`, `--cds-text-primary`)
- Sử dụng xếp lớp màu nền (trắng → gray 10 → gray 20) cho chiều sâu thay vì đổ bóng
- Sử dụng viền-dưới (không phải hộp) cho chỉ báo trường input
- Duy trì chiều cao nút mặc định 48px và padding bất đối xứng để chứa biểu tượng
- Áp dụng Blue 60 (`#0f62fe`) làm màu nhấn duy nhất — một màu xanh để kiểm soát tất cả

### Không nên
- Đừng bo tròn góc nút — radius 0px là bản sắc Carbon
- Đừng sử dụng đổ bóng trên thẻ hoặc tile — sự phẳng mới là điểm mấu chốt
- Đừng thêm màu nhấn bổ sung — hệ thống của IBM là đơn sắc + xanh
- Đừng sử dụng trọng lượng 700 (Bold) — thang dừng ở 600 (Semibold)
- Đừng thêm giãn chữ vào văn bản kích thước hiển thị — theo dõi chỉ dành cho 14px trở xuống
- Đừng đóng hộp input với viền đầy đủ — input Carbon chỉ sử dụng viền-dưới
- Đừng sử dụng nền gradient — bề mặt IBM là màu đặc phẳng
- Đừng sai lệch khỏi lưới khoảng cách 8px — mọi giá trị đều phải chia hết cho 8 (với 2px và 4px cho các điều chỉnh micro)

## 8. Hành vi Responsive

### Điểm dừng
| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Small (sm) | 320px | Cột đơn, điều hướng hamburger, lề 16px |
| Medium (md) | 672px | Lưới 2 cột bắt đầu, nội dung mở rộng |
| Large (lg) | 1056px | Điều hướng đầy đủ hiển thị, lưới 3-4 cột |
| X-Large (xlg) | 1312px | Mật độ nội dung tối đa, bố cục rộng |
| Max | 1584px | Chiều rộng nội dung tối đa, căn giữa với lề |

### Vùng chạm
- Chiều cao nút: mặc định 48px, tối thiểu 40px (nhỏ gọn)
- Liên kết điều hướng: chiều cao hàng 48px cho chạm
- Chiều cao input: mặc định 40px, lớn 48px
- Nút biểu tượng: vùng chạm vuông 48px
- Mục menu mobile: hàng toàn chiều rộng 48px

### Chiến lược Thu gọn
- Hero: hiển thị 60px → 42px → tiêu đề 32px khi viewport thu hẹp
- Điều hướng: masthead ngang đầy đủ → hamburger với bảng trượt ra
- Lưới: 4 cột → 2 cột → cột đơn
- Tile/thẻ: lưới ngang → xếp dọc
- Hình ảnh: duy trì tỷ lệ khung hình, max-width 100%
- Chân trang: nhóm liên kết nhiều cột → cột đơn xếp chồng
- Padding phần: 48px → 32px → 16px

### Hành vi Hình ảnh
- Hình ảnh responsive với `max-width: 100%`
- Minh họa sản phẩm thu phóng theo tỷ lệ
- Hình ảnh hero có thể chuyển từ cạnh nhau sang xếp chồng bên dưới
- Trực quan hóa dữ liệu duy trì tỷ lệ khung hình với cuộn ngang trên mobile

## 9. Hướng dẫn Prompt Agent

### Tham chiếu Màu Nhanh
- CTA chính: IBM Blue 60 (`#0f62fe`)
- Nền: White (`#ffffff`)
- Chữ tiêu đề: Gray 100 (`#161616`)
- Chữ thân bài: Gray 100 (`#161616`)
- Chữ phụ: Gray 70 (`#525252`)
- Bề mặt/Thẻ: Gray 10 (`#f4f4f4`)
- Viền: Gray 30 (`#c6c6c6`)
- Liên kết: Blue 60 (`#0f62fe`)
- Hover liên kết: Blue 70 (`#0043ce`)
- Vòng focus: Blue 60 (`#0f62fe`)
- Lỗi: Red 60 (`#da1e28`)
- Thành công: Green 50 (`#24a148`)

### Ví dụ Prompt Thành phần
- "Tạo phần hero trên nền trắng. Tiêu đề ở 60px IBM Plex Sans trọng lượng 300, line-height 1.17, màu #161616. Phụ đề ở 16px trọng lượng 400, line-height 1.50, màu #525252, max-width 640px. Nút CTA xanh (nền #0f62fe, chữ #ffffff, border-radius 0px, chiều cao 48px, padding 14px 63px 14px 15px)."
- "Thiết kế tile thẻ: nền #f4f4f4, border-radius 0px, padding 16px. Tiêu đề ở 20px IBM Plex Sans trọng lượng 600, line-height 1.40, màu #161616. Nội dung ở 14px trọng lượng 400, letter-spacing 0.16px, line-height 1.29, màu #525252. Hover: nền chuyển sang #e8e8e8."
- "Tạo trường form: nền #f4f4f4, border-radius 0px, chiều cao 40px, padding ngang 16px. Nhãn trên ở 12px trọng lượng 400, letter-spacing 0.32px, màu #525252. Viền-dưới: mặc định 2px solid transparent, 2px solid #0f62fe khi focus. Placeholder: #6f6f6f."
- "Tạo thanh điều hướng tối: nền #161616, chiều cao 48px. Logo IBM trắng căn trái. Liên kết ở 14px IBM Plex Sans trọng lượng 400, màu #c6c6c6. Hover: chữ #ffffff. Active: #ffffff với viền dưới 2px."
- "Tạo thành phần tag: nền Blue 10 (#edf5ff), chữ Blue 60 (#0f62fe), padding 4px 8px, border-radius 24px, 12px IBM Plex Sans trọng lượng 400."

### Hướng dẫn Lặp lại
1. Luôn sử dụng border-radius 0px trên nút, input và thẻ — đây là điều không thể thương lượng trong Carbon
2. Giãn chữ chỉ ở kích thước nhỏ: 0.16px ở 14px, 0.32px ở 12px — không bao giờ trên chữ hiển thị
3. Ba trọng lượng: 300 (hiển thị), 400 (nội dung), 600 (nhấn mạnh) — không đậm
4. Blue 60 là màu nhấn duy nhất — không thêm sắc nhấn phụ
5. Chiều sâu đến từ xếp lớp màu nền (trắng → #f4f4f4 → #e0e0e0), không phải đổ bóng
6. Input chỉ có viền-dưới, không bao giờ đóng hộp hoàn toàn
7. Sử dụng tiền tố `--cds-` cho tên token để duy trì tương thích với Carbon
8. 48px là chiều cao phần tử tương tác phổ quát
