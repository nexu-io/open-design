# Hệ Thống Thiết Kế Lấy Cảm Hứng từ PlayStation

> Category: Truyền thông & Tiêu dùng
> Bán lẻ máy chơi game. Bố cục kênh ba bề mặt, kiểu chữ hiển thị mang thẩm quyền trầm lắng, hiệu ứng hover-scale màu lam ngọc.

## 1. Chủ Đề & Bầu Không Khí Trực Quan

PlayStation.com thể hiện mình như bộ phận marketing của một thương hiệu điện tử tiêu dùng cao cấp vốn kinh doanh giải trí. Trang được tổ chức theo **kênh dọc các bề mặt xen kẽ nhau**: phần đầu trang và hero gần-đen, một chuỗi các bảng biên tập trắng giấy ở giữa, và phần footer xanh coban sâu giữ vững toàn bộ trải nghiệm. Giữa các chế độ bề mặt đó, trang web dựa mạnh vào nhiếp ảnh và render sản phẩm 3D — máy console PS5, bìa game, tay cầm DualSense — để phần cứng tạo ra cảm xúc trong khi phần giao diện vẫn giữ sự tiết chế.

Điểm nhấn typography đặc trưng là **SST Light (weight 300) ở kích thước lớn**. Font SST tùy chỉnh của Sony được dùng từ 22px đến 54px ở weight 300, mang lại cho tiêu đề hiển thị một chất lượng thì thầm, thanh lịch — gần với quảng cáo đồng hồ xa xỉ hơn là cửa hàng game. "Thẩm quyền trầm lắng" đó hoàn toàn trái ngược với tiếng hét của Manuka của The Verge hay mật độ kiosks báo của Wired — PlayStation muốn kiểu chữ lùi lại và sản phẩm dẫn đầu. Nội dung và giao diện UI dùng weight 500–700, nhưng giọng *hiển thị* luôn nhất quán mỏng và bình tĩnh.

Nơi duy nhất sự tiết chế bị phá vỡ là **tương tác**. Mọi nút chính đều có cùng một hiệu ứng hover: fill chuyển sang lam ngọc điện `#1eaedb`, đường viền trắng 2px xuất hiện, vòng ngoài màu xanh PlayStation 2px nở ra phía sau, và toàn bộ nút **scale lên 1.2×**. Sự kết hợp giữa hiệu ứng màu sắc, đường viền, vòng ngoài và scale-lift là một nét đặc trưng duy nhất của Sony trong số các thương hiệu lớn — một hiệu ứng animation "power-on" thu nhỏ mà trang lặp lại hàng trăm lần trên một trang đơn.

**Đặc Điểm Chính:**
- Bố cục kênh ba bề mặt: hero gần-đen, nội dung trắng giấy, footer xanh coban — xen kẽ nhau, không bao giờ hòa lẫn
- SST weight 300 ở 22–54px cho hiển thị — tiêu đề "thẩm quyền trầm lắng" để ảnh sản phẩm dẫn đầu
- PlayStation Blue `#0070cc` là màu neo thương hiệu; lam ngọc `#1eaedb` dành riêng cho trạng thái hover/focus
- Mọi phần tử tương tác đều scale 1.2× khi hover — nét đặc trưng "power-on" lift độc đáo của PlayStation
- Nút pill với bán kính đầy đủ 999px; art trong các hình chữ nhật bo góc 12–24px
- Commerce-orange `#d53b00` dùng riêng cho CTA mua hàng / trạng thái mua trên PlayStation Store
- Hỗ trợ breakpoint rộng đến 2120px — trang mở rộng toàn bộ đến ngữ cảnh duyệt trên TV 4K

## 2. Bảng Màu & Vai Trò

### Chính (Neo Thương Hiệu)
- **PlayStation Blue** (`#0070cc`): Màu neo của thương hiệu. Dùng cho footer chính, liên kết nội tuyến, fill nút chính trên bề mặt tối, và mọi marker "chính thức". Coi đây là bất biến — đây là màu thương hiệu gắn liền nhất trong ký ức người tiêu dùng.
- **Console Black** (`#000000`): Đen thuần cho phần đầu trang, nền hero, và các khu trình bày sản phẩm. PlayStation dùng màu đen để đóng khung phần cứng như bảo tàng dùng màu đen đóng khung tác phẩm điêu khắc.

### Phụ & Nhấn Mạnh
- **PlayStation Cyan** (`#1eaedb`): Màu tương tác. Chỉ áp dụng cho trạng thái hover, focus, và active của nút và liên kết. Không bao giờ xuất hiện làm màu nền mặc định hay màu chữ ở trạng thái nghỉ. Kết hợp với đường viền `#ffffff` 2px và vòng ngoài `#0070cc` 2px khi hover để có hiệu ứng đặc trưng đầy đủ.
- **Link Hover Blue** (`#1883fd`): Biến thể sáng hơn dùng cho hover trên liên kết văn bản nội tuyến. Khác với Cyan — đây là màu liên kết, Cyan là màu nút.
- **Dark Link Blue** (`#0068bd`): Màu liên kết ở trạng thái nghỉ trên bề mặt sáng — người anh em bão hòa hơn một chút của màu xanh thương hiệu.

### Bề Mặt & Nền
- **Paper White** (`#ffffff`): Canvas nội dung chính cho các bảng biên tập giữa phần đầu và footer.
- **Ice Mist** (`#f5f7fa`): Điểm dừng cuối của gradient phần sáng. Dùng tinh tế phía sau một số bảng để nâng chúng khỏi trắng thuần túy.
- **Divider Tint** (`#f3f3f3`): Màu đường ngang phân cách yên tĩnh giữa các hàng nội dung.
- **Masthead Black** (`#000000`): Canvas nav trên và hero — dành riêng cho các khu hiển thị sản phẩm nổi bật.
- **Shadow Black** (`#121314`): Điểm neo bắt đầu của gradient phần tối khi bảng cần chiều sâu không khí.
- **Filter Mist** (`rgba(245, 247, 250, 0.3)`): Nền trong mờ dùng sau các thanh filter cố định — khoảnh khắc "glassmorphism" duy nhất trên trang.

### Trung Tính & Chữ
- **Display Ink** (`#000000`): Tiêu đề hiển thị chính trên bề mặt trắng.
- **Deep Charcoal** (`#1f1f1f`): Tiêu đề nội dung và màu liên kết ở trạng thái nghỉ — nhẹ hơn đen thuần một chút để giảm viền thị giác trên các khối lớn.
- **Body Gray** (`#6b6b6b`): Chữ nội dung phụ và metadata.
- **Mute Gray** (`#cccccc`): Nhãn cấp ba, trạng thái vô hiệu.
- **Placeholder Ink** (`rgba(0, 0, 0, 0.6)`): Chữ placeholder của form — 60% đen, không phải giá trị xám riêng.
- **Inverse White** (`#ffffff`): Chữ chính trên bề mặt tối và xanh.
- **Dark-Link Blue** (`#53b1ff`): Màu liên kết ở trạng thái nghỉ trên bề mặt tối/đen — biến thể bay bổng nhẹ hơn của PlayStation Blue để dễ đọc trên nền đen.

### Ngữ Nghĩa & Thương Mại
- **Commerce Orange** (`#d53b00`): Dành riêng cho CTA mua hàng trên PlayStation Store, callout giá, và badge "đang giảm giá". Màu ấm duy nhất trên trang — dùng tiết kiệm và không bao giờ ngoài ngữ cảnh thương mại.
- **Commerce Orange Active** (`#aa2f00`): Trạng thái nhấn/active của nút thương mại.
- **Warning Red** (`#c81b3a`): Lỗi form và cảnh báo hành động hủy.
- **Shadow Wash 80** (`rgba(0, 0, 0, 0.8)`): Lớp phủ bóng nổi bật dùng sau chữ hero trên ảnh sản phẩm.
- **Shadow Wash 16** (`rgba(0, 0, 0, 0.16)`): Vòng elevation nhẹ trên các thẻ.
- **Shadow Wash 08** (`rgba(0, 0, 0, 0.08)`): Elevation thẻ rất nhẹ — hầu như không nhìn thấy nhưng phân tách bảng trắng khỏi nền trắng.
- **Shadow Wash 06** (`rgba(0, 0, 0, 0.06)`): Bóng nhẹ nhất trong hệ thống.

### Hệ Thống Gradient
PlayStation sử dụng **hai gradient phần** và không có gì khác:
- **Light Section Gradient**: từ `#ffffff` → `#f5f7fa` — một lớp rửa gần như không thể nhận thấy, yên tĩnh nâng một bảng lên khỏi canvas.
- **Dark Section Gradient**: từ `#121314` → `#000000` — một lớp rửa dọc ngắn tạo vignette tinh tế cho bảng hero mà không tạo ra bất kỳ sự dịch chuyển màu sắc nào.

Cả hai gradient đều **chỉ dùng làm nền phần**, không bao giờ bên trong component. Không có nút gradient, không có chữ gradient, không có hào quang phát sáng. Thương hiệu là màu xanh — không phải xanh-đến-tím, không phải xanh-đến-lam ngọc.

## 3. Quy Tắc Typography

### Họ Font
- **SST** / **Playstation SST** (Sony, độc quyền) — fallback: `Arial`, `Helvetica`. Font chữ toàn cầu tùy chỉnh của Sony, được thiết kế bởi Toshi Omagari và Akira Kobayashi. Bao gồm các weight 300 / 500 / 600 / 700 trên toàn trang chủ. Weight **300 ở 22–54px** là chữ ký typography của PlayStation.
- **SST (condensed / alternate)** — fallback: `helvetica`, `arial`. Biến thể nén dùng trong một số module UI nơi chiều rộng quan trọng.
- **Arial** — fallback tiện ích cho biến thể nút hiếm gặp được render bằng sans hệ thống.

### Hệ Thống Phân Cấp

| Vai trò | Font | Kích thước | Weight | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|---|---|---|---|---|---|---|
| Hero Display (XL) | SST | 54px / 3.38rem | 300 | 1.25 | -0.1px | Khoảnh khắc SST lớn nhất trên trang — tiêu đề xa xỉ weight nhẹ |
| Hero Display (L) | SST | 44px / 2.75rem | 300 | 1.25 | 0.1px | Tiêu đề hero phụ |
| Large Display | SST | 35px / 2.20rem | 300 | 1.25 | — | Tiêu đề bảng tính năng |
| Mid Display | SST | 28px / 1.75rem | 300 | 1.25 | 0.1px | Tiêu đề phần |
| Compact Display | SST | 22px / 1.38rem | 300 | 1.25 | 0.1px | Tiêu đề module — vẫn ở weight nhẹ 300 |
| Playstation SST Sub | Playstation SST | 22.5px / 1.41rem | 400 | 1.30 | — | Sub-heading khuyến mãi |
| UI Heading Small | SST | 18px / 1.13rem | 600 | 1.00 | — | Tiêu đề UI chặt |
| Button / CTA | SST | 18px / 1.13rem | 500 | 1.25 | 0.4px | Nhãn nút chính |
| Button / Emphasized | SST | 18px / 1.13rem | 700 | 1.25 | 0.45px | CTA nhấn mạnh cao hơn (mua, đăng ký) |
| Button Serif | SST | 18px / 1.13rem | 600 | 1.50 | — | Nhãn nút phụ |
| Body Relaxed | SST | 18px / 1.13rem | 400 | 1.50 | 0.1px | Nội dung đọc tiêu chuẩn |
| Link Body | SST | 18px / 1.13rem | 400 | 1.50 | — | Văn bản liên kết nội tuyến |
| Compact Button | SST | 14px / 0.88rem | 700 | 1.25 | 0.324px | CTA mini trong thẻ |
| Utility Caption | SST | 14px / 0.88rem | 500 | 1.50 | — | Chú thích, nhãn tag |
| Caption Body | SST | 14px / 0.88rem | 400 | 1.50 | — | Metadata tiêu chuẩn |
| Playstation Caption Bold | Playstation SST | 14px / 0.88rem | 700 | 1.40 | — | Chú thích nhấn mạnh |
| Playstation Caption Mid | Playstation SST | 14px / 0.88rem | 600 | 1.40 | — | Chú thích semi-bold |
| Playstation Button | Playstation SST | 14.4px / 0.90rem | 700 | 1.00 | 0.144px | Nút UI với leading chặt |
| Playstation Tab | Playstation SST | 14px / 0.88rem | 400 | 1.10 | 0.14px | Nhãn tab/pill |
| Playstation Compact Caption | Playstation SST | 12.8px / 0.80rem | 400 | 1.10 | — | Chú thích UI nhỏ nhất |
| Micro Caption | SST | 12px / 0.75rem | 500 | 1.50 | — | Microcopy footer, văn bản pháp lý |
| Compact Caption Bold | SST | 12.06px / 0.75rem | 700 | 1.50 | — | Văn bản micro nhấn mạnh |

### Nguyên Tắc
- **Weight 300 ở kích thước lớn là giọng nói.** PlayStation là thương hiệu console lớn duy nhất dùng kiểu hiển thị weight nhẹ cho tiêu đề hero. Hãy chống lại sự cám dỗ "nâng cấp" kiểu hiển thị lên 500 hay 700 — sự trầm lắng chính là tính cách.
- **Weight nhảy vọt ở tầng UI.** Dưới 18px hệ thống chuyển sang 500–700 để dễ đọc. Gradient weight từ 300 (hiển thị) → 400 (nội dung) → 500 (chú thích) → 700 (nút) là hệ thống phân cấp.
- **Letter-spacing gần như không có.** Hầu hết các giá trị là 0.1–0.45px, dương hoặc âm nhẹ. `-0.1px` trên hero 54px làm chặt kiểu hiển thị vừa đủ để đọc là "có chủ ý thiết kế" mà không trở thành tuyên bố typography.
- **Hai hệ SST.** "SST" và "Playstation SST" về mặt chức năng là cùng một họ font với bộ metric hơi khác nhau (Playstation SST chặt hơn ở kích thước nhỏ). Coi chúng là có thể thay thế cho nhau ngoài mục đích cấp phép nội bộ của Sony.
- **Không dùng chữ hoa toàn bộ.** Không như The Verge hay Wired, PlayStation hiếm khi dùng nhãn VIẾT HOA. Kicker và tag ở dạng title case hoặc sentence case — một nét "thẩm quyền trầm lắng" khác.
- **Không có serif ở đâu cả.** Toàn bộ hệ thống là sans. Không có đối trọng giọng in ấn.

## 4. Kiểu Dáng Component

### Nút

**Chính — PlayStation Blue Pill**
- Nền: `#0070cc` (PlayStation Blue)
- Chữ: `#ffffff`, SST 18px / 500 / 0.4px tracking
- Đường viền: không có ở trạng thái nghỉ
- Border radius: `999px` — pill đầy đủ
- Padding: ~`12px 24px` (thay đổi theo lớp kích thước)
- Outline: `rgb(255, 255, 255) none 0px` ở trạng thái nghỉ
- **Hover (nét đặc trưng)**:
  - Nền fill chuyển sang `#1eaedb` (PlayStation Cyan)
  - Chữ giữ `#ffffff`
  - Đường viền `#ffffff` 2px xuất hiện
  - Vòng ngoài bóng `#0070cc` 2px nở ra (`0 0 0 2px #0070cc`)
  - `transform: scale(1.2)` — nút thực sự lớn hơn 20%
- Active: `opacity: 0.6` — mờ nhanh để báo hiệu nhấn
- Focus: Giống hover, nhưng vòng ngoài chuyển thành focus shadow `rgb(0, 114, 206) 0px 0px 0px 2px`
- Transition: ~180ms ease cho nền, transform, và bóng

**Phụ — White Outline trên Nền Tối**
- Nền: `#ffffff`
- Chữ: `#0172ce` (biến thể PlayStation Blue)
- Đường viền: `2px outset #000000` — đường viền `outset` thực sự, cực kỳ hiếm trong CSS hiện đại
- Radius: thay đổi (thường `999px` hoặc `36px`)
- Padding: `16px 20px`
- Hover: cùng fill lam ngọc đặc trưng + scale(1.2) + xử lý vòng ngoài
- Focus: cùng xử lý vòng ngoài

**Commerce Orange**
- Nền: `#d53b00` (Commerce Orange)
- Chữ: `#ffffff`, SST 18px / 700 / 0.45px tracking
- Border radius: `999px` — pill
- Chỉ dùng cho CTA PS Store / Mua / Đăng ký Plus
- Active: nền tối hơn thành `#aa2f00`
- Hover: tuân theo quy tắc cyan-invert như tất cả các nút khác (KHÔNG phải hover riêng màu cam)

**Transparent Ghost**
- Nền: transparent
- Chữ: `#1f1f1f` (Deep Charcoal)
- Đường viền: `1px solid #dedede`
- Padding: `0 10px` (chặt, tối ưu cho nav)
- Hover: fill lam ngọc, chữ trắng, đường viền trắng 2px, scale(1.2)
- Active: chữ chuyển sang `#0072ce`, opacity 0.6

**Icon Circle**
- Nền: `rgba(0, 0, 0, 0.2)` trên ảnh; `#ffffff` trên bề mặt sáng
- Border radius: `100%` — tròn hoàn hảo
- Dùng cho mũi tên prev/next carousel và nút chia sẻ
- Hover: sáng hơn thành `var(--color-role-backgrounds-primary-link-hover)` (khoảng `#e5e5e5` trên nền sáng)

**Mini CTA (Trong thẻ)**
- SST 14px / 700 / 0.324px tracking
- Padding ~8px 16px
- Radius: `999px`
- Dùng bên trong thẻ game cho CTA mini "Mua Ngay" / "Thêm vào Giỏ"

### Thẻ & Containers

**Hero Card (Tính năng Game)**
- Nền: ảnh/render — thường neo trên nền đen
- Border radius: `24px` hoặc `19px` cho thẻ tính năng
- Padding: 32–48px bên trong
- Bóng: `rgba(0, 0, 0, 0.8) 0px 5px 9px 0px` — bóng đổ ấn tượng chỉ dùng khi thẻ chồng lên ảnh hero
- Hover: hiệu ứng scale nhẹ, đường viền lam ngọc xuất hiện trên CTA chính

**Game Cover Tile**
- Nền: bìa game, không có padding
- Border radius: `12px` hoặc `13px` (hình ảnh) / `19px` (khung thẻ)
- Bóng: `rgba(0, 0, 0, 0.08) 0px 5px 9px 0px` — elevation trọng lượng nhẹ
- Hover: CTA chính của thẻ sáng lên lam ngọc, thẻ có thể scale 1.02×
- Transition: 200ms ease trên transform

**Content Panel (Trắng)**
- Nền: `#ffffff` hoặc gradient phần sáng `#ffffff → #f5f7fa`
- Đường viền: thường không có; phân cách với hàng xóm bằng khoảng cách và bóng nhẹ
- Radius: `12px`–`24px` tùy theo phân cấp bảng
- Bóng: `rgba(0, 0, 0, 0.06) 0px 5px 9px 0px` — nhẹ nhất trong hệ thống

**Dark Card trên Nền Tối**
- Nền: `rgba(0, 0, 0, 0.2)` trên ảnh
- Border radius: `6px` (compact) hoặc `24px` (tính năng)
- Dùng cho inlay "press kit" hoặc "stat block" trên video hero

### Inputs & Forms
- **Mặc định**: nền `#ffffff`, đường viền `1px solid #cccccc`, border radius `3px` (chặt hơn phần còn lại của hệ thống — input là nơi duy nhất PlayStation thực sự compact), chữ SST 16px màu `#1f1f1f`, placeholder `rgba(0, 0, 0, 0.6)`.
- **Focus**: vòng focus `#0070cc` 2px qua `box-shadow: 0 0 0 2px #0070cc`. Không thay đổi màu đường viền — vòng ngoài làm việc đó.
- **Lỗi**: đường viền và chữ chuyển sang `#c81b3a` (Warning Red), chữ lỗi nội tuyến bên dưới cùng màu đỏ.
- **Transition**: ~180ms ease trên đường viền và bóng.

### Navigation

- **Top nav**: dải đen (`#000000`) full-bleed với logo PlayStation (trắng) căn trái, các liên kết danh mục căn giữa bằng SST 14–16px / 500, và CTA nhỏ "Đăng Nhập" căn phải.
- **Hover trên liên kết nav**: màu chuyển từ `#ffffff` sang `#1883fd` (Link Hover Blue), không có gạch chân.
- **Phần đang hoạt động**: được đánh dấu bằng gạch chân tinh tế 2px màu `#0070cc`.
- **Mobile**: nav thu gọn thành ngăn kéo hamburger. Bên trong ngăn kéo, liên kết xếp chồng dọc với khoảng cách 16px và padding ngang 20px.
- **Hành vi cố định**: nav luôn ghim ở trên cùng khi cuộn; khi vào vùng bề mặt sáng, nó **không đảo màu** — vẫn giữ nền đen xuyên suốt.

### Xử Lý Hình Ảnh

- **Tỷ lệ khung hình**: 16:9 video/ảnh hero, 1:1 render console, 3:4 bìa game, 4:3 ảnh lifestyle.
- **Góc**: bo tròn đến `12px`, `13px`, hoặc `24px` tùy theo ngữ cảnh thẻ. Bìa game được `6–12px`, hình ảnh hero được `24px`.
- **Full-bleed**: chỉ trong hero masthead và banner quảng cáo footer. Mọi thứ khác nằm trong cột nội dung có padding.
- **Bóng**: bóng đổ ấn tượng `rgba(0, 0, 0, 0.8) 0 5px 9px 0` trên hero, bóng nhẹ `rgba(0, 0, 0, 0.06) 0 5px 9px 0` trên tile lưới.
- **Hover**: hình ảnh giữ nguyên tĩnh, khung thẻ và CTA chính phản hồi.
- **Lazy loading**: `loading="lazy"` trên mọi thứ dưới fold, `eager` trên hero masthead.

### Game Store Pill (Đặc Biệt)
- Nền: `#ffffff`
- Chữ: `#000000`, SST 14px / 500
- Padding: `14px 18px`
- Radius: `9999px` — pill đầy đủ
- Tag pill trung tính nằm cạnh bìa game để gán nhãn nền tảng ("PS5", "PS4", "PSVR2"). Tương phản trắng trên tối.

## 5. Nguyên Tắc Layout

### Hệ Thống Khoảng Cách
- **Đơn vị cơ bản**: 8px.
- **Thang đo**: 1, 2, 3, 4.5, 5, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21px.
- **Section padding**: 48–96px dọc giữa các bảng chính. Các chuyển đổi hero-sang-nội-dung dùng giá trị lớn hơn.
- **Card padding**: 20–32px bên trong. Thẻ hero tính năng có thể mở rộng đến 48px.
- **Inline spacing**: 8–12px giữa tiêu đề và deck, 12–16px giữa deck và CTA.
- **Micro-scale**: Các giá trị 1/2/3/4.5/5/9/10/12 dùng cho padding pill, khoảng cách chú thích, và offset đường viền — không dùng cho nhịp điệu biên tập.

### Lưới & Container
- **Chiều rộng tối đa**: ~1920px (dembrandt phát hiện breakpoint đến 2120px). Container cap thường khoảng `1280–1920px` tùy theo bảng.
- **Mẫu cột**: Lưới responsive 12 cột phân giải thành hàng tile game 3/4/6 cột tùy theo phân cấp. Vùng hero thường span 12 cột; tile nổi bật nằm trong cấu hình 6+3+3 hoặc 4+4+4.
- **Padding ngoài**: 16px mobile → 48px tablet → 64–96px desktop.
- **Gutter**: 16–24px giữa các cột, chặt hơn (8–12px) bên trong các cụm tile.

### Triết Lý Khoảng Trắng
PlayStation xử lý khoảng trắng như thương hiệu xa xỉ xử lý ánh sáng trong cửa hàng — như một tín hiệu cao cấp. Có nhiều không gian thở dọc hơn đáng kể giữa các module so với bất kỳ trang bán lẻ lớn nào khác, và các bảng biên tập trắng thường chỉ chứa một tiêu đề + một hình ảnh + một CTA ở padding quy mô hero. Hiệu ứng là "nhịp độ gallery" nơi mỗi sản phẩm có phòng riêng thay vì cạnh tranh trong lưới thumbnail.

### Thang Đo Border Radius
- **2px** — nút banner cookie và UI quản trị nhỏ
- **3px** — input form, panel tab (chặt hơn mọi thứ khác — tín hiệu "UI chức năng" có chủ ý)
- **6px** — nút compact và hình ảnh nội tuyến
- **12px** — hình ảnh bìa game tiêu chuẩn và hình ảnh nội dung
- **13px** — một số wrapper hình (lệch 1px so với 12px để lồng vào nhau)
- **19px** — thẻ tính năng
- **20px** — span tag nội tuyến
- **24px** — thẻ hero, khung tính năng chính
- **36px** — nav pill đầy đủ và các biến thể nút phụ
- **48px** — nút tính năng lớn
- **999px / 100%** — nút chính dạng pill đầy đủ và nút icon dạng tròn

Mười một giá trị radius riêng biệt — một trong những hệ thống radius phong phú nhất trong danh mục này. Dải giá trị tồn tại vì PlayStation cố ý dùng các radius khác nhau cho các *phân cấp* khác nhau: 3px cho tiện ích, 12px cho media, 24px cho tính năng, 999px cho CTA.

## 6. Chiều Sâu & Elevation

| Cấp | Xử lý | Dùng cho |
|---|---|---|
| 0 | Không có bóng | Nội dung mặc định trên `#ffffff` |
| 1 | `rgba(0, 0, 0, 0.06) 0 5px 9px 0` | Nâng nhẹ bảng biên tập |
| 2 | `rgba(0, 0, 0, 0.08) 0 5px 9px 0` | Elevation tile lưới tiêu chuẩn |
| 3 | `rgba(0, 0, 0, 0.16) 0 5px 9px 0` | Thẻ nhấn mạnh (hover hoặc active) |
| 4 | `rgba(0, 0, 0, 0.8) 0 5px 9px 0` | Bóng overlay hero — bóng đổ ấn tượng dùng trên ảnh |
| 5 | `0 0 0 2px #0070cc` (vòng focus) | Trạng thái focus nút chính |
| 6 | `0 0 0 2px #000000` (vòng hover) | Vòng hover nút phụ |
| 7 | Gradient phần `#121314 → #000000` | Chiều sâu không khí trên bảng hero tối |

Triết lý chiều sâu của PlayStation là **có lớp nhưng tiết chế**. Thang bóng chạy từ 0.06 đến 0.16 cho trạng thái bình thường, sau đó nhảy vọt lên 0.8 cho bóng hero — không có vùng trung gian 0.2, 0.3, 0.4. Hiệu ứng là hầu hết trang gần như phẳng, nhưng khi thẻ hero cần nổi trên ảnh, nó thực sự *nổi*. Elevation hoặc là thì thầm hoặc là la hét, không bao giờ lẩm bẩm.

### Chiều Sâu Trang Trí
- **Gradient phần** (tối và sáng, cả hai mô tả ở trên) — chỉ dùng làm nền phần
- **Vòng focus/hover** 2px, luôn là màu xanh hoặc lam ngọc tùy theo trạng thái
- **Không có glow, blur, hay hiệu ứng không khí** ngoài hai gradient phần
- **Không có nút gradient hay chữ gradient** — hệ thống trực quan là các khối màu đặc ở mọi nơi ngoại trừ các chuyển đổi phần

## 7. Nên và Không Nên

### Nên
- **Nên** dùng PlayStation Blue (`#0070cc`) làm fill CTA chính và neo footer. Đây là màu neo của thương hiệu.
- **Nên** dùng SST weight 300 cho mọi tiêu đề hiển thị từ 22px trở lên. Tiêu đề weight nhẹ là giọng nói.
- **Nên** áp dụng chữ ký hover đầy đủ cho mọi nút chính: fill lam ngọc + đường viền trắng 2px + vòng ngoài xanh 2px + `scale(1.2)`.
- **Nên** dùng radius pill đầy đủ (`999px`) trên nút chính và nút thương mại.
- **Nên** dành riêng PlayStation Cyan (`#1eaedb`) cho trạng thái hover, focus, và active — không bao giờ làm nền nghỉ.
- **Nên** dùng Commerce Orange (`#d53b00`) chỉ trên CTA PlayStation Store / mua hàng và callout giá.
- **Nên** xen kẽ bảng hero tối với bảng nội dung trắng và neo bằng footer xanh sâu — bố cục kênh ba bề mặt là nhịp điệu của trang.
- **Nên** dùng bóng đổ hero ấn tượng `rgba(0, 0, 0, 0.8)` khi thẻ chồng lên ảnh sản phẩm.
- **Nên** giữ nav trên cùng màu đen ở mọi vị trí cuộn — nó không đảo màu sang trắng trên bảng sáng.

### Không Nên
- **Không** in đậm tiêu đề hiển thị. Weight 300 ở 22–54px là giọng PlayStation. Kiểu hiển thị weight 700 trông như "một nhà bán lẻ game khác".
- **Không** dùng nhãn hay kicker VIẾT HOA TOÀN BỘ. PlayStation hiếm khi dùng chữ hoa — đây là thương hiệu thẩm quyền trầm lắng, không phải băng cảnh báo nguy hiểm.
- **Không** dùng nút gradient, chữ gradient, hoặc nền gradient ngoài hai gradient phần đã khai báo.
- **Không** đưa màu ấm vào ngoài Commerce Orange. Không CTA đỏ, không highlight vàng, không pill thành công màu xanh lá.
- **Không** dùng góc vuông trên nút hay media. Hệ thống có mười một radius — chọn một, nhưng không bao giờ `0`.
- **Không** bỏ qua hiệu ứng hover `scale(1.2)` trên nút chính. Lift-scale là chữ ký tương tác của thương hiệu.
- **Không** dùng chữ serif. Hệ thống là 100% SST sans.
- **Không** để lam ngọc `#1eaedb` xuất hiện làm màu chữ hay màu nền ở trạng thái nghỉ. Nó chỉ tồn tại khi chuyển động.
- **Không** thiết kế các bảng cạnh tranh sự chú ý. Nhịp điệu khoảng trắng của PlayStation cho mỗi module "phòng gallery" riêng của nó.

## 8. Hành Vi Responsive

### Breakpoints

| Tên | Chiều rộng | Thay đổi chính |
|---|---|---|
| Small Mobile | <400px | Một cột, nav thu gọn thành hamburger, hero SST scale xuống ~28px |
| Mobile | 400–599px | Một cột, tile xếp full-width, padding mở ra 16px |
| Large Mobile | 600–767px | Vẫn một cột nhưng có tùy chọn 2 cột tile ở một số module |
| Tablet Portrait | 768–1023px | Lưới game 2 cột, nav vẫn thu gọn |
| Tablet Landscape | 1024–1279px | Lưới 3–4 cột, nav đầy đủ được khôi phục |
| Desktop | 1280–1599px | Lưới biên tập đầy đủ, scale hiển thị hero tối đa (44–54px) |
| Large Desktop | 1600–1919px | Container cap ở 1600px, margin mở rộng |
| 4K / Big-Screen | ≥1920px | Container mở rộng đến 1920px tối đa, nội dung hero scale lên để phù hợp khoảng cách xem TV |
| Ultra-Wide | ≥2120px | Breakpoint cực — trang giữ nguyên vị trí, margin ngoài hấp thụ chiều rộng thêm |

Quét dembrandt phát hiện 30 breakpoint từ 320px đến 2120px — phạm vi responsive bất thường rộng. PlayStation tinh chỉnh đặc biệt cho **ngữ cảnh màn hình lớn** (1920–2120px) vì chủ sở hữu PS5 thường duyệt web trên TV qua trình duyệt của console hoặc qua cast-to-TV từ điện thoại. Hầu hết các trang bán lẻ ngừng tinh chỉnh ở 1440px; PlayStation tiếp tục tinh chỉnh qua 4K.

### Touch Targets
- Nút pill chính cao ~48–56px (chữ SST 18px + ~12–16px padding dọc) — thoải mái đạt WCAG AAA.
- Liên kết nav nhỏ hơn (~32–40px cao) ở desktop; trên mobile chúng được pad ra đến 48px+ bên trong ngăn kéo.
- Nút icon tròn 40–48px — thân thiện với cảm ứng.

### Chiến Lược Thu Gọn
- **Nav**: nav đầy đủ → thu gọn → ngăn kéo hamburger khi viewport thu hẹp. Logo ghim bên trái; CTA ghim bên phải.
- **Lưới**: 6 cột → 4 cột → 3 cột → 2 cột → 1 cột. Thẻ tile game reflow mà không cắt xén bìa.
- **Khoảng cách**: section padding chặt từ 96px → 64px → 48px → 32px → 24px khi viewport thu hẹp.
- **Chữ**: hero SST scale từ 54px → 44px → 35px → 28px → 22px. Weight nhẹ 300 được giữ ở mọi kích thước.
- **Ảnh hero**: hoán đổi art-direction — desktop dùng crop 16:9 rộng, mobile dùng crop 4:3 hoặc 1:1 với sản phẩm căn giữa.

### Hành Vi Hình Ảnh
- Raster responsive (`srcset` + `<picture>` với art-direction), tỷ lệ khung hình được giữ nguyên theo breakpoint.
- Sẵn sàng 4K: trang phục vụ hình ảnh mật độ cao ở 1920px+ để tránh upscaling khi duyệt trên TV.
- `loading="lazy"` trên mọi thứ dưới fold; hero là `eager` với gợi ý preload.

## 9. Hướng Dẫn Prompt cho Agent

### Tham Chiếu Màu Nhanh
- **CTA Chính**: "PlayStation Blue (`#0070cc`)"
- **Nhấn Hover / Focus**: "PlayStation Cyan (`#1eaedb`)"
- **Nền (Bề mặt Trắng)**: "Paper White (`#ffffff`)"
- **Nền (Bề mặt Tối)**: "Console Black (`#000000`)"
- **Chữ Tiêu Đề trên Trắng**: "Display Ink (`#000000`)"
- **Chữ Nội Dung trên Trắng**: "Deep Charcoal (`#1f1f1f`)"
- **Chữ Nội Dung trên Đen**: "Inverse White (`#ffffff`)"
- **Nhấn Thương Mại / Mua**: "Commerce Orange (`#d53b00`)"
- **Neo Footer**: "PlayStation Blue (`#0070cc`)"

### Ví Dụ Prompt Component
1. *"Tạo nút CTA chính với fill PlayStation Blue `#0070cc`, chữ trắng SST 18px / 500 / 0.4px tracking, border radius 999px, padding 12px × 24px. Khi hover, nền chuyển sang `#1eaedb` PlayStation Cyan, đường viền `#ffffff` 2px xuất hiện, vòng ngoài `#0070cc` 2px nở ra qua box-shadow, và toàn bộ nút scale 1.2× — tất cả trong 180ms ease transition."*
2. *"Thiết kế bảng hero trên canvas Console Black `#000000` với tiêu đề SST weight 300 54px màu `#ffffff` với letter-spacing -0.1px và line-height 1.25. Đặt một CTA chính bên dưới với hiệu ứng hover PlayStation tiêu chuẩn. Không có nhãn VIẾT HOA ở bất kỳ đâu."*
3. *"Xây dựng tile bìa game: hình ảnh tỷ lệ 3:4 với border radius 12px, bóng nhẹ `rgba(0, 0, 0, 0.08) 0 5px 9px 0`, tiêu đề SST 700 14px bên dưới, tag nền tảng SST 500 12px, và CTA chính mini 14px / 700 / 0.324px tracking bằng PlayStation Blue."*
4. *"Tạo nút pill thương mại cho giao dịch mua trên PlayStation Store: fill Commerce Orange `#d53b00`, chữ `#ffffff` SST 18px / 700 / 0.45px tracking, radius 999px, padding 12px × 28px. Trạng thái active tối hơn thành `#aa2f00`. Hover tuân theo cyan-invert tiêu chuẩn với scale 1.2×."*
5. *"Thiết kế bảng nội dung trắng giữa các phần hero tối: nền `#ffffff` với gradient phần sáng tinh tế `#ffffff → #f5f7fa`, border radius 24px, padding bên trong 48px, elevation nhẹ `rgba(0, 0, 0, 0.06) 0 5px 9px 0`, tiêu đề SST 300 35px, đoạn nội dung 18px, và một CTA chính duy nhất."*

### Hướng Dẫn Lặp
Khi tinh chỉnh màn hình hiện có được tạo với hệ thống thiết kế này:
1. **Kiểm tra weight hiển thị.** Mọi tiêu đề từ 22px trở lên phải là SST weight 300. Nếu bạn thấy weight 500 hay 700 ở quy mô hero, bạn đã mất đi giọng PlayStation.
2. **Kiểm tra hiệu ứng hover.** Mọi nút chính phải scale 1.2× khi hover với sự kết hợp fill lam ngọc + đường viền trắng + vòng ngoài xanh. Bỏ sót bất kỳ điều nào trong số bốn điều đó và chữ ký tương tác bị phá vỡ.
3. **Kiểm tra góc.** Mọi container và nút phải đáp xuống các giá trị 2, 3, 6, 12, 13, 19, 20, 24, 36, 48, hoặc 999px / 100%. Góc vuông phá vỡ giọng nói.
4. **Kiểm tra sự lan rộng màu sắc.** Chỉ PlayStation Blue (`#0070cc`), Cyan (`#1eaedb`), Commerce Orange (`#d53b00`), và các màu xám/đen/trắng đã khai báo mới nên xuất hiện trong giao diện. Nếu bạn thấy bất kỳ màu khác, hãy sửa.
5. **Kiểm tra sự xen kẽ bề mặt.** Trang phải xen kẽ hero tối → nội dung trắng → hero tối → nội dung trắng → footer xanh. Nếu hai bảng cùng bề mặt liền kề, hãy chèn một chuyển đổi.
6. **Kiểm tra casing.** Chỉ sentence case và title case. Không nhãn, nút, hay kicker VIẾT HOA. Nếu bạn thấy chữ hoa, hãy chuyển đổi.
7. **Kiểm tra trọng lượng bóng.** Độ mờ bóng phải đáp xuống 0.06 / 0.08 / 0.16 / 0.8 — không có giữa. Nếu bạn thấy bóng 0.1, 0.2, 0.3, 0.5, hãy sửa về bậc đã khai báo gần nhất.
8. **Kiểm tra khoảng trắng.** Nếu hai module có vẻ "cạnh tranh nhau" (tranh giành sự chú ý), hãy thêm 48–96px không gian thở dọc. Nhịp điệu gallery-pace của PlayStation là không thể thương lượng.
