# Design System Inspired by Starbucks

> Category: Thương mại điện tử & Bán lẻ
> Thương hiệu cà phê bán lẻ toàn cầu. Hệ thống xanh lá bốn tầng, nền kem ấm áp, nút dạng viên đầy đặn.

## 1. Chủ đề Hình ảnh & Bầu không khí

Hệ thống thiết kế của Starbucks là một **flagship bán lẻ ấm áp, tự tin** mang màu xanh của chiếc tạp dề cửa hàng lên mọi bề mặt. Nền trang xen kẽ giữa tông kem trung tính ấm (`#f2f0eb`) và trắng sứ (`#edebe9`) — những màu sắc gợi lên vật liệu thực tế của cửa hàng: tờ khăn giấy, tường quán cà phê, lớp hoàn thiện gỗ — trong khi **Starbucks Green** (`#006241`) đặc trưng neo đậu khoảnh khắc thương hiệu trên các dải hero, CTA và trải nghiệm Rewards. Các tông xanh có bốn sắc độ được hiệu chỉnh (Starbucks, Accent, House, Uplift) mỗi loại được ánh xạ đến một vai trò bề mặt cụ thể, và màu vàng gold (`#cba258`) chỉ xuất hiện xung quanh các nghi lễ trạng thái Rewards — không dùng như màu nhấn chung.

Typography mang phần lớn giọng điệu thương hiệu. Typeface độc quyền **SoDoSans** (tùy chỉnh riêng cho Starbucks) xuất hiện trên hầu hết mọi bề mặt với letter-spacing chặt `-0.16px` — đọc lên cảm giác tự tin và thân thiện thay vì nghiêm khắc như tạp chí thời trang. Điều thú vị: trang Rewards chuyển sang dùng serif ấm (`"Lander Tall", "Iowan Old Style", Georgia`) cho một số khoảnh khắc tiêu đề đặc biệt, tinh tế gợi cảm giác hoài cổ của bảng phấn quán cà phê. Và các trang Careers dùng chữ viết tay (`"Kalam", "Comic Sans MS", cursive`) cho những nét chạm tên trên ly cà phê. Ba typeface, ba ngữ cảnh — hệ thống rất kỷ luật về thời điểm mỗi loại xuất hiện.

Các bề mặt thở qua hình học bo tròn. Mọi nút đều là viên đầy đặn 50px. Card có bo góc 12px. CTA nổi "Frap" — nút đặt hàng hình tròn 56px màu Green Accent (`#00754A`) — là nét chuyển động độ sâu đặc trưng của sản phẩm: nó nổi phía dưới bên phải với bộ bóng đổ nhiều lớp (`0 0 6px rgba(0,0,0,0.24)` nền + `0 8px 12px rgba(0,0,0,0.14)` ambient) và co lại qua `scale(0.95)` khi nhấn. Các hiệu ứng nâng còn lại đều kiềm chế — bóng đổ card duy trì alpha thì thầm `0.14/0.24`, thanh điều hướng toàn cục có bộ ba lớp bóng đổ nhẹ nhàng. Toàn bộ hệ thống cảm giác như biển hiệu quán cà phê sạch sẽ: dễ đọc, ấm áp và không bao giờ ồn ào.

**Đặc điểm chính:**
- Hệ thống thương hiệu xanh bốn tầng (Starbucks / Accent / House / Uplift) mỗi loại ánh xạ đến một vai trò bề mặt riêng biệt — không phải một "brand green" duy nhất
- Vàng gold chỉ dành riêng cho các khoảnh khắc nghi lễ trạng thái Rewards; không bao giờ dùng như màu nhấn đa dụng
- Nền trung tính ấm (`#f2f0eb` / `#edebe9`) thay vì trắng lạnh — gợi lên vật liệu quán cà phê
- Typeface độc quyền (SoDoSans) với letter-spacing chặt `-0.16px` là giọng điệu phổ quát
- Chuyển đổi typeface theo ngữ cảnh: serif (Lander Tall) cho Rewards, script (Kalam) cho tên ly cà phê trang Careers
- Nút viên đầy đặn (`50px` radius) toàn cầu, `scale(0.95)` khi nhấn là micro-interaction đặc trưng
- CTA tròn nổi "Frap" (`56px`, Green Accent fill, bộ bóng đổ nhiều lớp) — phần tử nâng đặc trưng của sản phẩm
- Bề mặt thẻ quà được thiết kế như **sản phẩm vật lý chụp ảnh** — mỗi thẻ là một bức ảnh minh họa riêng biệt thay vì đồ họa được tạo ra
- Card radius 12px + bóng đổ mềm thì thầm giữ content card phẳng-cộng-gợi-ý-nâng
- Thang khoảng cách dựa trên rem neo tại 1.6rem (~16px) = `--space-3`, bước đến 6.4rem (~64px)

**Nhịp trang theo khối màu:** Hero kem → Các phần nội dung trắng → Dải tính năng xanh đậm (`#1E3932`) với chữ trắng → Vùng tiện ích kem → Footer xanh đậm (`#1E3932`) với chữ vàng / trắng — một dấu chấm hết espresso-tối bao quanh phần nội dung sáng.

## 2. Bảng màu & Vai trò

**Các trang nguồn được phân tích:** trang chủ, rewards, thẻ quà, chi tiết sản phẩm (Pink Energy Drink), dinh dưỡng sản phẩm (Cold Brew).

### Màu chính

- **Starbucks Green** (`#006241`): Màu xanh thương hiệu lịch sử. Dùng cho tiêu đề h1, tiêu đề phần chính trên trang Rewards, và là tín hiệu thương hiệu chính bất cứ khi nào cần một màu chủ đạo duy nhất.
- **Green Accent** (`#00754A`): Màu xanh sáng hơn, rực rỡ hơn một chút. Màu CTA filled chính ("Explore our afternoon menu", "See the spring menu") và fill của nút tròn nổi Frap.
- **House Green** (`#1E3932`): Màu xanh thương hiệu gần đen đậm. Bề mặt footer, nền dải tính năng, bề mặt tối trạng thái reward, và dải hero tiêu đề "Free coffee is just the beginning" trên Rewards.
- **Green Uplift** (`#2b5148`): Màu xanh trung-tối phụ dùng tiết kiệm cho các điểm nhấn trang trí và khoảnh khắc gradient tối.
- **Green Light** (`#d4e9e2`): Lớp rửa bạc hà nhạt dùng cho tint trạng thái form hợp lệ và các bề mặt tiện ích xanh nhạt.

### Màu phụ & Nhấn

- **Gold** (`#cba258`): Dành riêng gần như chỉ cho nghi lễ trạng thái Rewards — callout hạng Gold, huy hiệu đối tác (SkyMiles, Bonvoy), và các điểm nhấn cảm giác cao cấp. Không bao giờ là màu thương hiệu đa dụng.
- **Gold Light** (`#dfc49d`): Vàng gold mềm hơn cho các lớp rửa nền trên các phần hạng vàng.
- **Gold Lightest** (`#faf6ee`): Lớp rửa bề mặt trang màu kem-vàng dùng bên dưới các phần đối tác trên trang Rewards — kết nối màu nhấn vàng trở lại hệ thống trung tính ấm.

### Bề mặt & Nền

- **White** (`#ffffff`): Bề mặt card và modal chính. Cũng là fill card trên các tile thẻ quà.
- **Neutral Cool** (`#f9f9f9`): Bề mặt xám lạnh tinh tế dùng trên menu dropdown ("Account" dropdown), bọc form-card, và các container tiện ích nhẹ nhàng.
- **Neutral Warm** (`#f2f0eb`): Kem ấm là **nền trang chính** cho các vùng tiện ích Rewards và dải hero.
- **Ceramic** (`#edebe9`): Một loại kem ấm/tối hơn một chút cho dải phân cách vùng, lớp rửa phần trang mềm, và dải đối tác Rewards.
- **Black** (`#000000`): Mực đậm dành riêng cho dải CTA đầu trang tối ("Join now") và các nút sign-in tương phản cao trên top-nav.

### Trung tính & Văn bản

- **Text Black** (`rgba(0, 0, 0, 0.87)`): Màu văn bản tiêu đề và nội dung chính trên bề mặt sáng. Không phải đen thuần — đen 87% opacity đọc ấm hơn.
- **Text Black Soft** (`rgba(0, 0, 0, 0.58)`): Văn bản phụ/metadata trên bề mặt sáng.
- **Text White** (`rgba(255, 255, 255, 1)`): Văn bản tiêu đề/nội dung chính trên bề mặt xanh đậm.
- **Text White Soft** (`rgba(255, 255, 255, 0.70)`): Văn bản phụ trên bề mặt xanh đậm — mô tả liên kết footer, văn bản caption.
- **Rewards Green** (`#33433d`): Màu slate-xanh mờ chuyên dùng chỉ trên các khối văn bản trang Rewards — màu đọc hơi "bụi" hơn Text Black báo hiệu "bề mặt reward" mà không dùng Starbucks Green đầy đủ.

### Ngữ nghĩa & Nhấn

- **Red** (`#c82014`): Trạng thái lỗi và phá hủy (form không hợp lệ, các hành động phá hủy).
- **Yellow** (`#fbbc05`): Trạng thái cảnh báo, nét chạm thương hiệu cũ.
- **Green Light** (`#d4e9e2` at 33% opacity = `hsl(160 32% 87% / 33%)`): Tint nền trường form hợp lệ.
- **Red Tint** (`hsl(4 82% 43% / 5%)`): Tint trường không hợp lệ trên form.

### Thang Alpha Đen / Trắng

Hai thang bán trong suốt song song để sử dụng overlay và văn bản phụ:
- `rgba(0,0,0,0.06)` đến `rgba(0,0,0,0.90)` theo bước 10% — cho overlay tối trên bề mặt sáng
- `rgba(255,255,255,0.10)` đến `rgba(255,255,255,0.90)` theo bước 10% — cho overlay sáng trên bề mặt tối

### Hệ thống Gradient

Không quan sát thấy token gradient cấu trúc nào. Phân cấp bề mặt là khối màu đặc xuyên suốt — hệ thống dựa vào bảng bề mặt kem/xanh năm tầng thay vì gradient.

## 3. Quy tắc Typography

### Font Family

- **Chính:** `SoDoSans, "Helvetica Neue", Helvetica, Arial, sans-serif` — Typeface doanh nghiệp độc quyền của Starbucks, dùng trên hầu hết mọi bề mặt
- **Fallback khi tải:** `"Helvetica Neue", Helvetica, Arial, sans-serif` — những gì người dùng thấy trước khi SoDoSans tải xong
- **Serif Rewards:** `"Lander Tall", "Iowan Old Style", Georgia, serif` — dùng trên các khoảnh khắc tiêu đề đặc biệt của trang Rewards để tạo cảm giác editorial ấm
- **Script Careers:** `"Kalam", "Comic Sans MS", cursive` — dùng chỉ cho các nét trang trí "tên trên ly" trang Careers, gợi lên tên viết tay trên các ly Starbucks

Không có OpenType stylistic set nào được kích hoạt tường minh tại `:root`.

### Phân cấp

| Vai trò | Kích thước | Độ đậm | Line Height | Letter Spacing | Ghi chú |
|------|------|--------|-------------|----------------|-------|
| Display (text-10) | 5.0rem / 80px | 400–600 | 1.2 | -0.16px | Display lớn nhất Rewards/hero |
| Jumbo (text-9) | 3.6rem / 58px | 400–600 | 1.2 | -0.16px | Tiêu đề hero phụ |
| Hero Large (text-8) | 2.8rem / 45px | 400–600 | 1.2–1.5 | -0.16px | Tiêu đề phần landing |
| H1 | 24px | 600 | 36px | -0.16px | Tiêu đề chính Starbucks-Green |
| H2 | 24px | 400 | 36px | -0.16px | Tiêu đề phần độ đậm thường trong Text Black |
| Body Large | 19px | 400–600 | 33.25px (~1.75) | -0.16px | Nội dung giới thiệu hero, body dải tính năng |
| Body (text-3) | 1.6rem / 16px | 400 | 1.5 (24px) | -0.01em | Nội dung body mặc định |
| Small (text-2) | 1.4rem / ~14px | 400–600 | 1.5 | -0.01em | Nhãn nút, metadata, nhãn form |
| Micro (text-1) | 1.3rem / ~13px | 400 | 1.5 | -0.01em | Trạng thái float-label active, micro-copy caption |
| Nhãn nút | 14–16px | 400–600 | 1.2 | -0.01em | Tất cả nhãn nút viên |

**Token letter-spacing:**
- `letterSpacingNormal`: `-0.01em` (mặc định — chặt, đặc trưng)
- `letterSpacingLoose`: `0.1em` (nhấn mạnh chữ hoa)
- `letterSpacingLooser`: `0.15em` (nhãn kiểu uppercase, nhấn mạnh cực đoan)

**Token line-height:**
- `lineHeightNormal`: `1.5` (body)
- `lineHeightCompact`: `1.2` (display/nút)

### Nguyên tắc

- **Tracking âm chặt (`-0.01em`)** được áp dụng hầu như toàn bộ — toàn bộ sản phẩm đọc hơi nén lại, điều này mang lại cho SoDoSans sự hiện diện tự tin mà không cảm thấy bị bóp chặt.
- **Thay đổi độ đậm mang phân cấp, không phải thay đổi kích thước.** H1 và H2 có cùng kích thước 24px/36px; chỉ có độ đậm (600 vs 400) và màu sắc (Starbucks-Green vs Text Black) phân biệt chúng.
- **Token kích thước dùng rem, neo tại `1rem = 10px`** trên trang này (qua thủ thuật `font-size: 62.5%` tại root). Vậy `1.6rem` = 16px, `2.4rem` = 24px, v.v. Thang là ngữ nghĩa (textSize-1 đến textSize-10), không phải giá trị pixel tùy ý.
- **Hoán đổi typeface theo ngữ cảnh** — serif trên Rewards, script trên Careers — là có chủ đích và được giới hạn. Không bao giờ trộn chúng với sans chính trong cùng một bề mặt.
- **Văn bản body không bao giờ thuần đen** — nó ở `rgba(0,0,0,0.87)` để phù hợp với nhiệt độ nền trung tính ấm.

### Ghi chú về Font Thay thế

SoDoSans là độc quyền của Starbucks (được cấp phép từ House Industries, không có sẵn công khai). Các thay thế mã nguồn mở hợp lý:
- **Inter** (Google Fonts) — tỷ lệ hình học humanist tương tự, dải độ đậm rộng
- **Manrope** — tròn hơn một chút, cảm giác tự tin tương tự
- **Nunito Sans** — ấm hơn, thay thế tốt cho thương hiệu "quán cà phê"

Nếu thay thế, hãy kiểm tra xem tracking `-0.01em` / `-0.16px` chặt vẫn đọc tốt không; một số font mã nguồn mở cần `-0.005em` thay thế.

Lander Tall (serif Rewards) là tùy chỉnh — thay thế mã nguồn mở: **Iowan Old Style** (đã có trong fallback), **Lora**, hoặc **Source Serif Pro**. Kalam (script Careers) có sẵn trực tiếp trên Google Fonts.

## 4. Kiểu dáng Component

### Nút

**1. Primary Filled — "Explore our afternoon menu / Sign up for free"**
- Background: `#00754A` (Green Accent)
- Văn bản: `#ffffff`
- Border: `1px solid #00754A`
- Radius: `50px` (viên đầy đặn)
- Padding: `7px 16px`
- Font: SoDoSans, 16px, weight 600, letter-spacing `-0.01em`
- Trạng thái active: `transform: scale(0.95)` qua `--buttonActiveScale`
- Transition: `all 0.2s ease`

**2. Primary Outlined — "Give them a try / Start an order"**
- Background: transparent
- Văn bản: `#00754A` (Green Accent)
- Border: `1px solid #00754A`
- Radius/padding/active/transition giống Primary Filled

**3. Black Filled — "Join now"**
- Background: `#000000`
- Văn bản: `#ffffff`
- Border: `1px solid #000000`
- Radius: `50px`, Padding: `7px 16px`
- Font: 14px, weight 600
- Dùng trên dải join đầu trang và các khoảnh khắc chuyển đổi tương tự

**4. Dark Outlined — "Sign in"**
- Background: transparent
- Văn bản: `rgba(0, 0, 0, 0.87)` (Text Black)
- Border: `1px solid rgba(0, 0, 0, 0.87)`
- Radius: `50px`, Padding: `7px 16px`
- Font: 14px, weight 600

**5. Green-on-Green Inverted — "See the spring menu"**
- Background: `#ffffff`
- Văn bản: `#00754A`
- Border: `1px solid #ffffff`
- Dùng khi bề mặt phía sau nút là dải House Green tối — nút trắng với chữ xanh thay vì viên xanh filled trên nền xanh

**6. Outlined on Dark — "Learn more / Order now"**
- Background: transparent
- Văn bản: `#ffffff`
- Border: `1px solid #ffffff`
- Dùng trên các dải tính năng xanh đậm cho hành động phụ đi kèm với CTA filled trắng

**7. Consent Agree (biến thể xanh đậm)**
- Background: `rgb(0, 130, 72)` (một biến thể xanh cụ thể dùng trong module đồng ý cookie)
- Văn bản: `#ffffff`
- Không có border, radius `50px`, padding `7px 16px`, 14px / weight 400
- Sáng hơn Green Accent một chút — dành riêng cho hành động Agree trên banner đồng ý

**8. Frap — Nút đặt hàng tròn nổi**
- Background: `#00754A` (Green Accent)
- Icon: `#ffffff`
- Kích thước: `5.6rem / 56px` (chuẩn), `4rem / 40px` (biến thể mini)
- Radius: `50%` (hình tròn đầy đặn)
- Fixed phía dưới bên phải, `-0.8rem` touch offset để tăng sự thoải mái chạm
- Bộ bóng đổ: nền `0 0 6px rgba(0,0,0,0.24)` + ambient `0 8px 12px rgba(0,0,0,0.14)`
- Trạng thái active: bóng đổ ambient mờ dần về `0 8px 12px rgba(0,0,0,0)`
- Đây là phần tử nâng đặc trưng của sản phẩm — nó nổi trên mọi bề mặt cuộn

**9. Tab phản hồi full-width — "Provide feedback"**
- Background: `#00754A`
- Văn bản: `#ffffff`
- Radius: `12px 12px 0px 0px` (chỉ bo góc trên)
- Padding: `8px 16px`
- Font: 14px, weight 400
- Vị trí fixed phía dưới-phải bên trong, gắn vào cạnh viewport

### Card & Container

**Content Card (mặc định)**
- Background: `#ffffff` (`--cardBackgroundColor`)
- Radius: `12px` (`--cardBorderRadius`)
- Shadow: `0px 0px .5px 0px rgba(0,0,0,0.14), 0px 1px 1px 0px rgba(0,0,0,0.24)` (`--cardBoxShadow`)
- Dùng cho: feature card, tile menu-item, panel trạng thái reward

**Tile Thẻ quà**
- Background: ảnh minh họa lấp đầy card (không có nền đặc)
- Radius: tương tự card (`~12px`, góc có thể chặt hơn một chút)
- Shadow: nhẹ hơn card mặc định — chúng được đối xử như thẻ vật lý đặt trên nền kem
- Được gán nhãn theo danh mục phía trên lưới card (Spring, Thank You, Birthday, Celebration, Mother's Day, Appreciation, Encouragement, Milestones, Anytime)

**Card trạng thái Rewards (đặc trưng trang Rewards)**
- Lưới ba cột: Bronze / Gold / Silver-ish — mỗi panel xanh đậm (`#1E3932`) với:
  - Vòng tiêu đề gradient/màu
  - Huy hiệu số "Level"
  - Tiêu đề trạng thái trong SoDoSans weight 600 lớn
  - Danh sách sao / lợi ích trong văn bản trắng/trắng-bán-trong-suốt
  - Caption tiến trình "As you earn more stars…" phía dưới

**Card Đối tác (Rewards)**
- Background: `#faf6ee` (Gold Lightest) bề mặt kem ấm
- Nội dung: logo đối tác ("SkyMiles", "Bonvoy") căn giữa, văn bản mô tả bên dưới
- Radius và shadow theo spec card mặc định

**Menu Dropdown (Account dropdown, top-nav)**
- Background: `#f9f9f9` (Neutral Cool)
- Mục menu ở `24px / weight 400` trong Text Black
- Không có border — chỉ là thay đổi bề mặt nền so với nav trắng

**Modal**
- Padding: `2.4rem` (`--modalPadding`)
- Padding trên: `8.8rem` (`--modalTopPadding`) — để chỗ cho nút đóng / header
- Tổng padding dọc: `11.2rem`
- Radius kế thừa từ spec card (`12px`)

### Input & Form

**Floating Label Input**
- Nhãn nổi trên border input khi focus/có nội dung
- Kích thước font nhãn desktop: `1.9rem` mặc định, animate về `1.4rem` khi active
- Kích thước font nhãn mobile: `1.6rem` mặc định, animate về `1.3rem` active
- Offset ngang nhãn: `12px` từ trái
- Translate nhãn active: lên đến `-12px` với dịch chuyển `-50%` theo Y
- Padding trường: `12px`
- Padding ngang form: `1.6rem`
- Validation: trường hợp lệ nhận tint `rgba(green-light, 0.33)`; trường không hợp lệ nhận tint `rgba(red, 0.05)`
- Transition: `0.3s option-label-marker-expansion cubic-bezier(0.32, 2.32, 0.61, 0.27)` trên checked-input

**Option Icon (checkbox/radio)**
- Padding: `3px` bên trong
- Dùng animation cubic-bezier checked-input ở trên (đường cong overshoot 2.32 hơi "springy")

### Điều hướng

**Global Nav (thanh trên cùng)**
- Vị trí fixed với chiều cao tiến triển: `64px` xs → `72px` mobile → `83px` tablet → `99px` desktop
- Bộ bóng đổ: `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` — nâng mềm ba lớp
- Trái: logo wordmark Starbucks, bù đắp `99px` (md) / `131px` (lg) từ cạnh trái
- Liên kết chính inline trong SoDoSans weight 400–600: Menu · Rewards · Gift Cards
- Phải: liên kết Find a store + Sign in (outlined) + Join now (black filled)

**Sub-nav (thanh thứ hai, ví dụ Rewards nội bộ)**
- Chiều cao: `53px` (global subnav) / `48px` (internal subnav)
- Thường là nhóm tab ngang bên dưới global nav

**Mobile Nav**
- Thu gọn thành ngăn kéo hamburger dưới breakpoint tablet
- Nút nổi Frap vẫn hiển thị phía dưới bên phải bất kể trạng thái nav

### Xử lý hình ảnh

- **Ảnh hero**: Ảnh sản phẩm (đồ uống trong ly thủy tinh trong với nền màu — coral, xanh lá nhạt, hổ phách ấm) chiếm ~40vw của bố cục hero tách đôi; văn bản chiếm 60vw còn lại (`--headerCrateProportion: 40vw` / `--contentCrateProportion: 60vw`)
- **Minh họa thẻ quà**: Mỗi thẻ là một bức ảnh minh họa riêng biệt (cảm giác vẽ tay, màu ấm). Không bao giờ là đồ họa tạo ra chung.
- **Ảnh nghi lễ Rewards**: Ảnh màn hình Starbucks Rewards App cầm trên tay, góc chụp nghiêng — ảnh sản phẩm trong ngữ cảnh.
- **Thumbnail menu**: Ảnh sản phẩm vuông hoặc 4:3 với nền trắng/kem sạch, bóng đổ mềm nhẹ quanh ly.
- **Fade-in hình ảnh**: Transition `opacity 0.3s ease-in` khi tải ảnh (`--imageFadeTransition`).

### Dải tính năng (dải hero xanh đậm)

Dải `#1E3932` (House Green) full-width với:
- Trái: tiêu đề trắng + subhead + hàng CTA
- Phải: ảnh sản phẩm hoặc minh họa
- Tỷ lệ tách ~40/60 hoặc 50/50 tùy theo phần
- Văn bản trắng xuyên suốt với `rgba(255,255,255,0.70)` cho văn bản phụ
- CTA theo cặp Green-on-Green Inverted (filled trắng) + Outlined on Dark (viền trắng)

### Expander / Accordion

- Thời lượng: `300ms` (`--expanderDuration`)
- Đường cong timing: `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — ease-out từng đo
- Dùng cho các phần FAQ trên Rewards và trang quà

### Module Cookie Consent

Card modal xanh đậm ở đầu trang với các nút "Agree" (green-filled) và "Manage preferences" (outlined). Xuất hiện lần đầu truy cập; có thể bỏ qua.

### Component chi tiết sản phẩm (cụm đặc trưng PDP)

Một cụm component lặp lại được dùng trên các trang sản phẩm menu (ví dụ: `/menu/product/40498/iced` cho chi tiết đồ uống, `/menu/product/.../nutrition` cho thông tin dinh dưỡng). Chúng mở rộng bộ kiểm kê component mà không thay đổi token.

**Bộ chọn kích thước**
- Hàng ngang gồm 4 nút icon ly (Tall / Grande / Venti / Trenta)
- Mỗi mục: icon silhouette ly ở trên, tên kích thước bên dưới (16/700 trong Starbucks-Green), caption ounce chất lỏng (13/400 trong Text Black Soft)
- Trạng thái active: viền tròn xanh (`2px solid #00754A`) quanh icon ly được chọn
- Không active: không có viền, typography như cũ
- Hàng full-width, khoảng cách đều
- Radius của container: `12px` hoặc phẳng; các icon riêng lẻ là `50%` tròn
- Padding: `16px 24px` bên trong

**Add-in / Milk Select (hình chữ nhật outlined)**
- Background: `#ffffff`
- Border: `1px solid #d6dbde` (Input Border)
- Radius: `4px`
- Full-width trong cột của nó
- Floating label trên border trên: "Add-ins" / "Milk" / "Add-ins" — 13/700 trong Text Black, uppercase, letter-spacing `0.325px`
- Giá trị hiển thị căn giữa (ví dụ: "Ice", "Coconut", "Strawberry Fruit Inclusions scoop"): 16/400 Text Black
- Icon chevron-down bên phải trong Text Black Soft
- Focus: border chuyển sang Green Accent (`#00754A`)

**Numeric Stepper**
- Nhúng trong một hàng Add-in khi cần số lượng (ví dụ: Strawberry Fruit Inclusions scoop)
- Nút `−` trừ + số đếm + nút `+` cộng, tất cả inline bên phải nhãn
- Các nút: tròn `32×32px` với border `1px solid #d6dbde`, icon xám trung tính
- Số đếm: 16/700 Text Black căn giữa

**Nút Customize**
- Background: `#ffffff`
- Văn bản: `#00754A` (Green Accent)
- Border: `1.5px solid #00754A`
- Radius: `50px` (viên đầy đặn)
- Padding: `14px 40px` (rộng hơn đáng kể so với viên mặc định — đây là hành động chính phụ)
- Nhãn: "Customize" với icon lấp lánh vàng ✨ inset trái
- Dùng cho: vào luồng tùy chỉnh đồ uống sau khi chọn kích thước/sữa

**Nút Add to Order (PDP)**
- Background: `#00754A` (Green Accent)
- Văn bản: `#ffffff`
- Radius: `50px`
- Padding: `14px 32px`
- Ghim phía trên bên phải của card sản phẩm và/hoặc căn phải trong dải tình trạng có hàng
- Hành vi active scale(0.95) tương tự như các CTA chính khác

**Rewards Cost Pill — "200★ item"**
- Background: transparent
- Border: `1px solid #cba258` (Gold)
- Văn bản: `#cba258` (Gold)
- Radius: `50px` (viên đầy đặn)
- Padding: `4px 12px`
- Nội dung: "200★ item" trong đó `★` là glyph sao filled nhỏ — chỉ số Rewards Stars cần để đổi mục này
- Font: Proxima Nova 13/700 với letter-spacing `0.5px`
- Chỉ dùng trên các sản phẩm có thể đổi bằng Rewards

**Dải mô tả sản phẩm**
- Dải xanh đậm full-width (`#1E3932` House Green)
- Chứa từ trên xuống dưới:
  1. Rewards Cost Pill (vàng) nếu có
  2. Văn bản mô tả sản phẩm màu trắng (16/400/1.5)
  3. Tóm tắt dinh dưỡng inline ("140 calories, 25g sugar, 2.5g fat") với tooltip icon thông tin — 14/700 trắng
  4. Nút viên outlined-trắng-trên-xanh "Full nutrition & ingredients list"
- Padding: `32px` dọc
- Xuất hiện bên dưới dải header sản phẩm chính

**Bảng thành phần / Dinh dưỡng**
- Bố cục hai cột trên trang Dinh dưỡng
- Cột trái: tiêu đề "Ingredients" + danh sách hoặc khối văn bản giữ chỗ "Not available for this item" với đoạn văn giải thích trong Text Black Soft 14/400
- Cột phải: tiêu đề "Nutrition" + các hàng nhãn/giá trị
- Mỗi hàng: nhãn chất dinh dưỡng (Proxima Nova 14/400) bên trái, giá trị (ví dụ: "140 calories", "25g", "205 mg**") bên phải, phân cách bởi đường kẻ `1px solid #e7e7e7` bên dưới
- Chú thích cho dấu caffeine/asterisk ở 13/400 Text Black Soft phía dưới cùng
- Mẫu tái sử dụng cho bảng thông tin dinh dưỡng tuân thủ quy định

**Bộ chọn tình trạng cửa hàng**
- Xuất hiện trên dải tính năng xanh đậm phía trên hàng tùy chọn kích thước
- Hình chữ nhật bo tròn full-width với nội thất trắng-trong-suốt
- Văn bản: "For item availability, choose a store" màu trắng, 14/400
- Bên phải: affordance chevron-down + icon SVG túi mua hàng viền trắng
- Radius: `4px`
- Chiều cao: ~48px

**Breadcrumb PDP**
- Đường dẫn "Menu / Refreshers / Pink Energy Drink" phía trên tiêu đề sản phẩm
- Phân cách: ký tự `/` slash trong Text Black Soft
- Trang hiện tại không có liên kết, các trang trước được gạch chân liên kết xanh-accent
- Font: 14/400 Proxima Nova
- Xuất hiện trên tất cả trang PDP

**Liên kết Back Chevron (trang phụ PDP nutrition / detail)**
- Liên kết văn bản "← Back" phía trên các tiêu đề phần trên trang dinh dưỡng
- Văn bản trong Green Accent (`#00754A`) 14/700 Proxima Nova
- Chevron trái `<` cùng màu xanh
- Thay thế cho breadcrumb đầy đủ trên các trang phụ sâu

## 5. Nguyên tắc Bố cục

### Hệ thống Khoảng cách

Thang ngữ nghĩa dựa trên rem (neo `1rem = 10px`):

| Token | Rem | Pixel | Cách dùng điển hình |
|-------|-----|--------|-------------|
| `--space-1` | `0.4rem` | 4px | Padding inline chặt nhất |
| `--space-2` | `0.8rem` | 8px | Khoảng cách nhỏ, padding dọc nút |
| `--space-3` | `1.6rem` | 16px | Mặc định — padding card, outer gutter xs |
| `--space-4` | `2.4rem` | 24px | Khoảng cách nội phần, outer gutter md |
| `--space-5` | `3.2rem` | 32px | Khoảng cách chính giữa các phần |
| `--space-6` | `4rem` | 40px | Khoảng cách lớn, outer gutter lg, header crate |
| `--space-7` | `4.8rem` | 48px | Khoảng cách phần-đến-phần |
| `--space-8` | `5.6rem` | 56px | Thở rộng rãi — chiều cao Frap |
| `--space-9` | `6.4rem` | 64px | Padding phần rộng nhất |

**Token gutter:**
- `--outerGutter: 1.6rem` (16px, mặc định / mobile)
- `--outerGutterMedium: 2.4rem` (24px, tablet)
- `--outerGutterLarge: 4.0rem` (40px, desktop)

**Hằng số nhịp toàn cầu:** `1.6rem` (16px) xuất hiện trên mọi trang như outer gutter mặc định, đường cơ sở padding card, và text size 3 body — đơn vị khoảng cách thường xuyên nhất của hệ thống.

### Grid & Container

- Thang chiều rộng cột: `--columnWidthSmall: 343px` / `Medium: 500px` / `Large: 720px` / `XLarge: 1440px`
- Lưới thẻ quà dùng lưới responsive 3-5-up của tile `~343px`
- Phần trạng thái Rewards: 3 panel xanh đậm tại breakpoint `lg+`
- Hero: tách bất đối xứng 40% (ảnh) / 60% (nội dung) qua `--headerCrateProportion` / `--contentCrateProportion`

### Triết lý Khoảng trắng

Khoảng trắng mang cảm giác "rộng rãi trong quán cà phê." Padding phần nghiêng về hào phóng (40–64px). Các khối nội dung được phân cách bằng khoảng trắng thay vì đường chia. Nền kem (`#f2f0eb`) tự nó là một hơi thở hình ảnh giữa các card trắng và dải tính năng xanh.

### Thang Border Radius

| Giá trị | Cách dùng |
|-------|-----|
| `12px` | Card, modal, tile menu-item (`--cardBorderRadius`) |
| `12px 12px 0 0` | Tab phản hồi full-width (chỉ bo góc trên) |
| `50px` | Tất cả nút — radius viên đầy đặn (`--buttonBorderRadius`) |
| `50%` | Icon tròn, nút nổi Frap, thumbnail avatar |
| Đặc biệt | `3.3333%/5.298%` elliptical cho mockup Starbucks-Visa-Card (`--svcRoundedCorners`) |

## 6. Độ sâu & Nâng

| Mức | Xử lý | Cách dùng |
|-------|-----------|-----|
| Card | `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)` | Card nội dung mặc định — bóng đổ kép thì thầm mềm |
| Global Nav | `0 1px 3px rgba(0,0,0,0.1), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)` | Nâng mềm ba lớp trên thanh trên cùng fixed |
| Frap Base | `0 0 6px rgba(0,0,0,0.24)` | Hào quang nền quanh CTA tròn nổi |
| Frap Ambient | `0 8px 12px rgba(0,0,0,0.14)` | Ambient có hướng xếp chồng — nâng Frap về phía trước |
| Gift Card | Bóng đổ nhẹ quanh ảnh minh họa | Cảm giác thẻ vật lý cho tile quà |
| Starbucks Card (SVC) | `drop-shadow(0 4px 1px rgba(0,0,0,0.11)) drop-shadow(0 0 2px rgba(0,0,0,0.24))` | Bóng đổ SVG xếp chồng cho hình ảnh Starbucks Card |

**Triết lý bóng đổ:** Thì thầm-mềm, nhiều lớp trên đặc — hệ thống không bao giờ dùng một bóng đổ nặng duy nhất. Thay vào đó, nó xếp chồng 2–3 bóng đổ alpha thấp với các offset khác nhau để mô phỏng ánh sáng ambient + trực tiếp thực tế. Nút Frap là phần tử nâng cao nhất trên bất kỳ trang nào.

### Độ sâu trang trí

- **Không có hệ thống gradient** — các bề mặt là khối màu đặc
- **Dải khối màu** mang độ sâu cảm nhận (các dải xanh đậm đọc như "vùng tính năng lõm" giữa các phần body kem/trắng)
- **Bóng đổ SVG filter** trên hình ảnh Starbucks-Card thêm tính vật lý 3D nhẹ mà không cần box-shadow

## 7. Nên và Không nên

### Nên
- Dùng Neutral Warm (`#f2f0eb`) hoặc Ceramic (`#edebe9`) làm nền trang thay vì trắng thuần — kem ấm là đặc trưng
- Ánh xạ các tầng xanh đến đúng vai trò bề mặt — Starbucks Green cho tiêu đề, Green Accent cho CTA, House Green cho dải sâu, Uplift cho trang trí
- Giữ tracking chặt tại `-0.01em` / `-0.16px` trên SoDoSans xuyên suốt toàn hệ thống
- Dùng radius viên đầy đặn 50px trên mọi nút không ngoại lệ
- Áp dụng `transform: scale(0.95)` làm trạng thái active nút toàn cầu
- Dành Gold riêng cho các khoảnh khắc nghi lễ trạng thái Rewards
- Dùng SoDoSans cho hầu hết mọi thứ; chuyển sang serif Lander Tall chỉ cho tiêu đề editorial Rewards; dành script Kalam cho các khoảnh khắc "tên ly" trang Careers
- Xếp chồng 2–3 bóng đổ alpha thấp thay vì một bóng đổ nặng hơn để tạo độ nâng
- Dùng CTA tròn nổi Frap làm điểm vào đặt hàng nổi liên tục trên mọi bề mặt mua sắm
- Để nền kem thở giữa các content card — dùng khoảng trắng, không dùng đường chia

### Không nên
- Không dùng trắng thuần làm nền trang — nhiệt độ kem ấm mang tính load-bearing
- Không chọn "một màu xanh thương hiệu" — hệ thống bốn xanh là có chủ đích; chỉ dùng `#006241` ở khắp nơi làm phẳng thương hiệu
- Không dùng Gold như màu nhấn đa dụng — đó chỉ là tín hiệu Rewards
- Không vuông hóa góc nút — viên 50px là toàn cầu
- Không giới thiệu fill gradient — hệ thống là khối màu xuyên suốt
- Không phân biệt h1 và h2 bằng kích thước theo độ đậm — phân cấp đến từ độ đậm + màu sắc (600 Starbucks-Green vs 400 Text Black)
- Không dùng thuần đen cho văn bản body — `rgba(0,0,0,0.87)` phù hợp với nền kem ấm
- Không bỏ qua phản hồi active `scale(0.95)` trên nút — đó là micro-interaction đặc trưng
- Không xếp chồng bóng đổ nặng duy nhất; luôn xếp nhiều lớp 2–3 cái alpha thấp
- Không giới thiệu serif hoặc script vào luồng mua sắm chính — chúng thuộc về ngữ cảnh Rewards và Careers

## 8. Hành vi Responsive

### Breakpoint

Suy ra từ token chiều rộng component và chiều cao nav tiến triển:

| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| xs | < 480px | Global nav 64px; menu hamburger; bố cục một cột; nút viên full-width |
| Mobile | 480–767px | Global nav 72px; lưới thẻ quà 2-up; padding card thắt lại |
| Tablet | 768–1023px | Global nav 83px; lưới thẻ quà 3-up; hero split bắt đầu xuất hiện |
| Desktop | 1024–1439px | Global nav 99px; lưới thẻ quà 4-up; hero bất đối xứng đầy đủ 40/60 |
| XLarge | 1440px+ | Nội dung giới hạn tại `--columnWidthXLarge`; lưới thẻ quà 5-up; margin kem thêm |

### Mục tiêu chạm

- Nút viên với padding `7px 16px` đo được ~32px cao — dưới mức tối thiểu 44px WCAG AAA cho bề mặt chỉ chạm. Trên mobile, padding nút có thể được mở rộng về mặt hình ảnh để đáp ứng mức tối thiểu.
- Nút tròn nổi Frap ở `56px` vượt mức tối thiểu.
- Frap dùng `--frapTouchOffset: calc(-1 * .8rem)` để mở rộng vùng chạm 8px ngoài cạnh hình ảnh.
- Input float-label form tăng kích thước font nhãn trên mobile (1.6rem cơ sở vs 1.9rem desktop) — dễ chạm và đọc hơn từ xa.

### Chiến lược Thu gọn

- **Chiều cao global nav tiến triển dần**: 64 → 72 → 83 → 99px qua các breakpoint, không phải một giá trị duy nhất
- **Hero split thu gọn**: Tách bất đối xứng 40/60 → xếp chồng (ảnh trên, nội dung bên dưới) trên mobile
- **Lưới thẻ quà**: 5-up → 4-up → 3-up → 2-up → 1-up qua các breakpoint với chiều rộng card điều chỉnh
- **Dải tính năng**: Duy trì full-width nhưng văn bản + hình ảnh xếp chồng dọc trên mobile
- **Outer gutter tiến triển**: 16px → 24px → 40px khi viewport mở rộng
- **Panel trạng thái 3 cột Rewards**: Xếp thành một cột trên mobile

### Hành vi hình ảnh

- Ảnh sản phẩm hero crop chặt hơn theo chiều dọc trên mobile; nội dung trở thành neo hình ảnh
- Minh họa thẻ quà giữ nguyên tỷ lệ khung hình; lưới card reflow
- Transition fade-in `opacity 0.3s ease-in` khi tải ảnh (ngăn pop-in đột ngột)
- Ảnh app-trên-tay Rewards co giãn tỷ lệ; không bao giờ kéo dãn

## 9. Hướng dẫn Prompt cho Agent

### Tham chiếu màu nhanh

- CTA chính: "Green Accent (`#00754A`)"
- Văn bản CTA chính: "White (`#ffffff`)"
- Tiêu đề thương hiệu: "Starbucks Green (`#006241`)"
- Dải tính năng / footer: "House Green (`#1E3932`)"
- Nền trang: "Neutral Warm (`#f2f0eb`)"
- Nền card: "White (`#ffffff`)"
- Văn bản tiêu đề trên nền sáng: "Text Black (`rgba(0,0,0,0.87)`)"
- Văn bản body trên nền sáng: "Text Black Soft (`rgba(0,0,0,0.58)`)"
- Văn bản body trên nền xanh đậm: "Text White Soft (`rgba(255,255,255,0.70)`)"
- Nhấn Rewards: "Gold (`#cba258`)"
- Văn bản Rewards: "Rewards Green (`#33433d`)"
- Phá hủy: "Red (`#c82014`)"

### Ví dụ Prompt Component

1. "Tạo nút viên CTA chính Starbucks với nền Green Accent (`#00754A`), chữ trắng 'Explore our afternoon menu', font SoDoSans ở 16px weight 600 với letter-spacing `-0.01em`, `50px` border-radius (viên đầy đặn), padding `7px 16px`. Áp dụng `transform: scale(0.95)` làm trạng thái active với transition `0.2s ease`."

2. "Thiết kế content card với nền White (`#ffffff`) ở `12px` border-radius, bóng đổ nhiều lớp `0 0 0.5px rgba(0,0,0,0.14), 0 1px 1px rgba(0,0,0,0.24)`. Pad nội dung `16–24px` (`--space-3` đến `--space-4`). Đặt trên nền trang Neutral Warm (`#f2f0eb`) với khoảng cách `16px` đến các thành phần anh em."

3. "Xây nút đặt hàng tròn nổi Frap — đường kính `56px`, fill Green Accent (`#00754A`), icon túi mua sắng trắng căn giữa. Bóng đổ nhiều lớp: `0 0 6px rgba(0,0,0,0.24)` + `0 8px 12px rgba(0,0,0,0.14)`. Vị trí fixed phía dưới bên phải với touch offset `-0.8rem`. Trạng thái active thu gọn bóng đổ ambient về `0 8px 12px rgba(0,0,0,0)` với `scale(0.95)`."

4. "Xây dải tính năng xanh đậm — phần full-width với nền House Green (`#1E3932`). Cột trái: h2 SoDoSans trắng ở 24px weight 600, theo sau là đoạn body Text White Soft (`rgba(255,255,255,0.70)`) và hàng CTA với hai nút (Filled-trắng với chữ Green Accent cho chính, Outlined-on-Dark viền trắng cho phụ). Cột phải: ảnh sản phẩm. Tỷ lệ tách 40/60, xếp chồng dọc dưới `768px`."

5. "Tạo card trạng thái Rewards — panel House Green (`#1E3932`) với `12px` border-radius, dải trên gradient màu (tầng Bronze/Silver/Gold). Tiêu đề trong SoDoSans 24px weight 600 màu trắng. Danh sách lợi ích dạng bullets trắng với caption phụ `rgba(255,255,255,0.70)`. Văn bản tiến trình dưới cùng trong Text White Soft. Xếp 3 panel trong lưới tại `lg+`, một cột trên mobile."

6. "Thiết kế tile thẻ quà — radius card khớp `12px`, lấp đầy bằng ảnh minh họa (cảm giác màu nước vẽ tay) như toàn bộ bề mặt. Bóng đổ tinh tế làm nó cảm giác như thẻ vật lý trên nền kem. Nhóm dưới nhãn danh mục ('Spring', 'Thank You', 'Birthday') trong SoDoSans 24px weight 400 phía trên lưới."

7. "Tạo header chi tiết sản phẩm Starbucks — dải House Green (`#1E3932`) với breadcrumb 'Menu / Refreshers / Pink Energy Drink' ở 14/400 trắng phía trên tiêu đề sản phẩm trong SoDoSans 32/700 uppercase trắng. Ảnh sản phẩm căn giữa bên dưới tiêu đề. Bên dưới ảnh: hàng bộ chọn kích thước 4-up — mỗi nút icon ly hiển thị silhouette ly dọc, tên kích thước ('Tall' / 'Grande' / 'Venti' / 'Trenta') ở 16/700 trắng, và ounce chất lỏng ở 13/400 Text White Soft. Kích thước được chọn bọc icon ly trong vòng tròn `2px solid #00754A`."

8. "Xây luồng tùy chỉnh Starbucks — dưới bộ chọn kích thước, 3 hàng input hình chữ nhật outlined xếp chồng (nền trắng, border `1px solid #d6dbde`, radius `4px`). Mỗi hàng có floating label ('Add-ins', 'Milk', 'Add-ins') trên border trên ở 13/700 Text Black uppercase. Giá trị căn giữa (ví dụ: 'Ice', 'Coconut'). Bên phải: chevron-down trong Text Black Soft. Cho hàng scoop, nhúng numeric stepper (`−` `1` `+` với nút outlined tròn `32px`). Bên dưới tất cả ba trường: viên 'Customize' outlined xanh với icon lấp lánh vàng, radius `50px`, padding `14px 40px`. Ghép với viên 'Add to Order' filled Green Accent trong cùng hàng."

9. "Thiết kế dải mô tả sản phẩm Starbucks — House Green (`#1E3932`) full-width bên dưới header sản phẩm. Trên cùng: Rewards Cost Pill viền vàng '200★ item' (radius `50px`, padding `4px 12px`, border và chữ vàng `#cba258`). Bên dưới: mô tả sản phẩm màu trắng 16/400/1.5. Tóm tắt dinh dưỡng inline màu trắng 14/700 ('140 calories, 25g sugar, 2.5g fat') với tooltip icon thông tin. Nút viên outlined-trắng-trên-xanh 'Full nutrition &amp; ingredients list'. Padding dọc 32px."

10. "Tạo bảng thông tin dinh dưỡng Starbucks — bố cục hai cột trong card White. Cột trái: tiêu đề 'Ingredients' (24/400 Text Black), theo sau là danh sách thành phần hoặc đoạn giữ chỗ 'Not available for this item' ở 14/400 Text Black Soft. Cột phải: tiêu đề 'Nutrition', sau đó các hàng nhãn/giá trị (tên chất dinh dưỡng trái, giá trị phải) phân cách bởi đường kẻ `1px solid #e7e7e7`. Typography: nhãn ở 14/400 Text Black, giá trị ở 14/700 Text Black căn phải. Chú thích asterisk ở 13/400 Text Black Soft phía dưới cùng."

### Hướng dẫn Lặp lại

Khi tinh chỉnh các màn hình hiện có được tạo với hệ thống thiết kế này:
1. Tập trung vào MỘT component mỗi lần
2. Tham chiếu tên màu cụ thể và mã hex từ tài liệu này
3. Dùng mô tả ngôn ngữ tự nhiên ("nền kem ấm", "hệ thống bốn xanh") cùng với giá trị chính xác
4. Giữ nguyên viên 50px + trạng thái active `scale(0.95)` toàn cầu
5. Kiểm tra các tông xanh được ánh xạ đúng vai trò (Green Accent cho CTA, Starbucks Green cho tiêu đề, House Green cho dải)
6. Không giới thiệu gradient — hệ thống là khối màu
7. Giữ tracking SoDoSans ở `-0.01em` / `-0.16px` xuyên suốt

### Những khoảng trống đã biết

- SoDoSans là typeface độc quyền không có trên Google Fonts — khi triển khai công khai, dùng Inter hoặc Manrope làm thay thế và ghi lại việc hoán đổi
- Lander Tall (serif Rewards) cũng là tùy chỉnh — thay thế bằng Iowan Old Style, Lora, hoặc Source Serif Pro
- Timing animation cụ thể theo component ngoài những cái đã ghi lại (`--duration: 0.4s`, `--iconTransition: all ease-out 0.2s`, `--expanderDuration: 300ms`) không được thu thập cho mọi bề mặt tương tác
- Kiểu dáng đầy đủ trạng thái lỗi form (độ dày border đỏ, vị trí icon) thấy rõ trên token tint nhưng không được trích xuất đầy đủ
- Các component đặc thù trang Careers (card tên-ly, lưới radio tìm kiếm) được tham chiếu trong tên token nhưng không được bao quát bởi phần trích xuất này
- Spec mockup chi tiết Starbucks Visa Card / Starbucks-Card (SVC) được gợi ý bởi token `--svcRoundedCorners` và `--svcShadowFilter` nhưng chưa được ghi chép đầy đủ
