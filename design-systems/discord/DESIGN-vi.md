# Design System Inspired by Discord

> Category: Năng suất & SaaS
> Nền tảng thoại / chat. Blurple đậm, giao diện ưu tiên tối, điểm nhấn accent vui tươi.

## 1. Chủ đề Hình ảnh & Không khí

Sản phẩm của Discord được thiết kế cho những buổi tối, các buổi raid và voice nhóm — do đó toàn bộ giao diện ưu tiên chế độ tối. Canvas mặc định là `Background Primary` sâu (`#313338` chủ đề sáng, `#1e1f22` chủ đề tối), với các cột chat được xếp lớp trên các sắc thái sáng hoặc tối hơn một chút để phân biệt kênh, luồng và bảng bên. **Blurple** đặc trưng (`#5865f2`) được dành riêng cho nhãn hiệu, CTA chính, đề cập và affordance "you" — dùng tiết kiệm để nổi bật so với các màu trung tính đã giảm độ bão hòa.

Typography dùng **gg sans** (bản thay thế Whitney tùy chỉnh của Discord) cho văn xuôi và chrome, với các hình dạng hình học bo tròn mang lại cảm giác gần gũi nhưng vẫn dễ đọc ở kích thước nhỏ mà ứng dụng chat yêu cầu. Tiêu đề tăng dần từng bước; các hàng chat khít nhau (4–8px giữa các nhóm tin nhắn) để nhiều giờ cuộn lại vẫn dễ dàng quét qua.

Ngôn ngữ hình dạng bo tròn nhưng không quá mềm mại: bán kính 8px trên thẻ, 4px trên input, viên thuốc đầy đủ trên huy hiệu trạng thái và thẻ. Avatar server là hình vuông bo góc ở 48px, biến thành hình tròn khi hover — một chuyển động nhỏ đã trở thành một phần bản sắc thương hiệu.

**Đặc điểm chính:**
- Giao diện ưu tiên tối: `#1e1f22` / `#2b2d31` / `#313338` (3 cấp độ sâu)
- Blurple `#5865f2` là accent bão hòa duy nhất trên bề mặt chat
- gg sans (phong cách Whitney) cho toàn bộ văn bản — thân thiện, hình học, trung tính
- Avatar server hình vuông bo góc (bán kính 16px) chuyển sang hình tròn khi hover
- Khoảng cách hàng chat khít, padding bảng bên rộng rãi
- Chấm trạng thái: xanh lá online, vàng idle, đỏ dnd, xám offline
- Đường phân cách 1px căn pixel chính xác ở màu trắng nhạt với alpha thấp

## 2. Bảng màu & Vai trò

### Màu chính
- **Blurple** (`#5865f2`): Màu chính thương hiệu, CTA chính, điểm nổi bật đề cập.
- **Blurple Hover** (`#4752c4`): Hover/active cho blurple.
- **Blurple Soft** (`#7289da`): Blurple kế thừa, accent phụ trong marketing.

### Bề mặt (Chủ đề tối — mặc định)
- **Background Tertiary** (`#1e1f22`): Thanh danh sách server, nền sâu nhất.
- **Background Secondary** (`#2b2d31`): Thanh bên kênh, thanh bên cài đặt.
- **Background Primary** (`#313338`): Bề mặt chat, cột tin nhắn.
- **Background Floating** (`#111214`): Popover nổi, tooltip, tự động hoàn thành.
- **Background Modifier Hover** (`rgba(78, 80, 88, 0.3)`): Overlay hover trên hàng.
- **Background Modifier Selected** (`rgba(78, 80, 88, 0.6)`): Hàng đang active.

### Bề mặt (Chủ đề sáng)
- **Light Bg Primary** (`#ffffff`): Bề mặt chat trong chủ đề sáng.
- **Light Bg Secondary** (`#f2f3f5`): Thanh bên trong chủ đề sáng.
- **Light Bg Tertiary** (`#e3e5e8`): Bề mặt sáng sâu nhất.

### Văn bản
- **Header Primary** (`#f2f3f5`): Tiêu đề kênh, tiêu đề modal trong chủ đề tối.
- **Header Secondary** (`#b5bac1`): Tiêu đề bị giảm độ nổi bật.
- **Text Normal** (`#dbdee1`): Văn bản thân trong chủ đề tối — hơi lạnh hơn trắng thuần.
- **Text Muted** (`#949ba4`): Dấu thời gian, tên server, metadata phụ.
- **Text Link** (`#00a8fc`): Hyperlink trong tin nhắn — xanh trời, khác biệt với blurple.
- **Channels Default** (`#80848e`): Tên kênh không active trong thanh bên.

### Trạng thái & Ngữ nghĩa
- **Status Online** (`#23a55a`): Chấm online, trạng thái thành công.
- **Status Idle** (`#f0b232`): Chấm idle, đang vắng.
- **Status DND** (`#f23f43`): Không làm phiền, cũng dùng làm màu đỏ hủy.
- **Status Streaming** (`#593695`): Màu tím "Streaming".
- **Status Offline** (`#80848e`): Màu xám offline.
- **Mention Highlight** (`rgba(88, 101, 242, 0.1)`): Lớp phủ blurple nhẹ trên hàng @mention.

### Đường viền & Phân cách
- **Background Modifier Accent** (`rgba(255, 255, 255, 0.06)`): Đường phân cách chuẩn trong chủ đề tối.
- **Border Subtle** (`#3f4147`): Đường phân cách đặc cho thẻ.

## 3. Quy tắc Typography

### Font Family
- **Body / UI / Headings**: `gg sans`, fallback: `"Helvetica Neue", Helvetica, Arial, sans-serif`
- **Display (kế thừa / Whitney)**: `Whitney`, fallback: `gg sans`
- **Code / Mono**: `"gg mono"`, fallback: `Consolas, Andale Mono, Courier New, Courier, monospace`

### Phân cấp

| Vai trò | Font | Kích thước | Độ đậm | Line Height | Letter Spacing | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | gg sans | 56px (3.5rem) | 800 | 1.1 | -0.02em | Hero marketing |
| Page Heading | gg sans | 24px (1.5rem) | 700 | 1.25 | normal | Tiêu đề cài đặt/hồ sơ |
| Channel Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | `#general`, tiêu đề kênh |
| Message Body | gg sans | 16px (1rem) | 400 | 1.375 | normal | Văn bản chat chuẩn |
| Username | gg sans | 16px (1rem) | 500 | 1.25 | normal | Tác giả tin nhắn |
| Timestamp | gg sans | 12px (0.75rem) | 500 | 1.25 | normal | "Today at 4:32 PM" |
| Sidebar Channel | gg sans | 16px (1rem) | 500 | 1.25 | normal | Hàng danh sách kênh |
| Server Name | gg sans | 16px (1rem) | 600 | 1.25 | normal | Tiêu đề server |
| Caption / Meta | gg sans | 12px (0.75rem) | 400 | 1.3 | 0.02em | Văn bản trạng thái, thẻ đã sửa |
| Code Inline | gg mono | 0.875em | 400 | inherit | normal | `code` nội tuyến |
| Code Block | gg mono | 14px (0.875rem) | 400 | 1.5 | normal | Khối ```triple-fenced``` |

### Nguyên tắc
- **Hình học thân thiện**: gg sans thay Whitney với các đầu chữ bo tròn trên a/g/s — thương hiệu muốn sự ấm áp mà không đánh đổi khả năng đọc.
- **Tương phản trọng lượng thay vì tương phản màu sắc**: phân cấp đến từ các bước độ đậm 400→500→600→700→800; bề mặt giữ trung tính.
- **Body 16px**: tin nhắn chat không thu nhỏ dưới 16px. Mật độ đến từ line-height (1.375), không phải kích thước font.

## 4. Kiểu dáng Component

### Buttons

**Primary**
- Background: `#5865f2`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#4752c4`
- Dùng cho: CTA chính, "Continue", "Join Server"

**Secondary**
- Background: `#4e5058`
- Text: `#ffffff`
- Padding: 8px 16px
- Radius: 4px
- Hover: `#6d6f78`

**Tertiary / Subtle (kiểu Link)**
- Background: transparent
- Text: `#dbdee1`
- Hover: gạch chân văn bản, không thay đổi background

**Danger**
- Background: `#da373c`
- Text: `#ffffff`
- Hover: `#a12d2f`

### Inputs
- Background: `#1e1f22`
- Text: `#dbdee1`
- Border: 1px solid `#1e1f22`
- Radius: 4px
- Padding: 10px 12px
- Focus: border `#5865f2`

### Avatar Server
- Kích thước: 48×48px
- Radius: 16px (hình vuông bo góc) mặc định; chuyển sang 50% khi hover và active.
- Trạng thái active: viên thuốc trắng 4px ở cạnh trái của cột icon.

### Chấm trạng thái
- Kích thước: 10×10px
- Border: 3px solid background-tertiary (tạo hiệu ứng "khắc")
- Vị trí: góc dưới phải của avatar.

### Cards / Embeds
- Background: `#2b2d31` (tối) hoặc `#f2f3f5` (sáng)
- Đường viền trái: 4px solid màu accent của embed.
- Radius: 4px
- Padding: 8px 16px

### Mention Pill
- Background: `rgba(88, 101, 242, 0.3)`
- Text: `#c9cdfb`
- Padding: 0 2px
- Radius: 3px

## 5. Khoảng cách & Bố cục

- **Đơn vị cơ bản**: 4px. Tỉ lệ: 4, 8, 12, 16, 20, 24, 32, 40.
- **Thanh server**: rộng 72px, cố định.
- **Thanh bên kênh**: rộng 240px.
- **Danh sách thành viên**: rộng 240px trên desktop.
- **Cột chat**: linh hoạt, tối thiểu 380px.

## 6. Chuyển động

- **Thời lượng**: 200ms cho hover; 350ms cho chuyển đổi avatar sang hình tròn; 80ms cho hiệu ứng mờ dần của tooltip.
- **Easing**: `cubic-bezier(0.215, 0.61, 0.355, 1)` cho chuyển đổi avatar (nhanh rồi ổn định).
- **Nhịp đập thông báo**: 1.4s ease-in-out vô hạn trên chỉ báo mention chưa đọc.

## 7. Hướng dẫn Sử dụng

- Giữ nguyên vỏ tối, mật độ compact và phân cấp action blurple cùng nhau; sử dụng blurple trên bố cục marketing kiểu sáng sẽ phá vỡ cảm giác sản phẩm Discord.
- Giữ các bề mặt nặng về điều hướng được cấu trúc xung quanh các thanh rail, thanh bên và cột chat thay vì các thẻ trang trí độc lập.
- Dùng ngôn ngữ avatar hình vuông bo góc và chấm trạng thái khi đại diện cho người, server hoặc sự hiện diện đang hoạt động.
