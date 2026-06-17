# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ Airbnb

> Category: Thương mại điện tử & Bán lẻ
> Nền tảng du lịch. Màu nhấn san hô ấm, hình ảnh nhiếp ảnh làm chủ đạo, giao diện bo tròn.

## 1. Chủ Đề Hình Ảnh & Bầu Không Khí

Thiết kế Airbnb năm 2026 cảm giác như một tạp chí du lịch tình cờ trở thành ứng dụng — những khung nền trắng tinh khôi nhường chỗ cho nhiếp ảnh toàn màn hình, và bản thân giao diện biến mất để các danh mục có thể thở. Màu san hô-hồng đặc trưng Rausch (`#ff385c`) được dùng tiết kiệm nhưng không thể nhầm lẫn: CTA tìm kiếm, chỉ báo tab đang hoạt động, nút hành động chính, đôi khi là giá hoặc trái tim danh sách yêu thích. Tất cả những thứ còn lại là thang màu xám có kỷ luật, với `#222222` gánh hầu hết mọi dòng văn bản.

Điều làm hệ thống này không thể nhầm là Airbnb chính là lượng *niềm tin* mà nó đặt vào nội dung. Ảnh bất động sản được hiển thị ở quy mô anh hùng, tỷ lệ 4:3 với xử lý bo tròn cạnh toàn màn. Việc chuyển đổi danh mục diễn ra qua bộ chọn ba tab (Homes / Experiences / Services) sử dụng các biểu tượng minh họa dựng 3D (một ngôi nhà có mái nghiêng, một khinh khí cầu, một chuông dịch vụ) — vật lý, xúc giác, gần như đồ chơi — kết hợp với nhãn `Airbnb Cereal VF` sắc nét. Đây là sản phẩm tiêu dùng hiếm hoi nơi hình ảnh 3D và giao diện người dùng thuần chữ cùng tồn tại mà không có sự căng thẳng.

Bề mặt mới nhất là dòng sản phẩm **Experiences** — cùng khung chrome, nhưng mật độ thẻ phong phú hơn, nhiếp ảnh nhiều hơn, và một bảng đặt chỗ căn giữa với thanh bên phải cố định về giá. Các trang chi tiết danh mục (cả phòng và trải nghiệm) theo một mẫu chặt chẽ: lưới ảnh anh hùng toàn màn → thẻ đặt chỗ bo tròn chồng lên (cố định khi cuộn) → tiện nghi → đánh giá (giải thưởng Guest Favorite sử dụng điểm `4.81` lớn căn giữa với thiết kế vòng nguyệt quế) → bản đồ → hồ sơ chủ nhà → thông tin công khai. Nhịp điệu nhất quán dù bạn đang đặt phòng hay tour du thuyền.

**Đặc Điểm Chính:**
- Màu san hô-hồng Rausch (`#ff385c`) như màu nhấn thương hiệu duy nhất, chỉ dùng cho CTA chính và nút tìm kiếm
- Nhiếp ảnh toàn màn ở tỷ lệ 4:3 / 16:9 với bo góc nhẹ nhàng (14–20px) là từ vựng hình ảnh chính
- Biểu tượng danh mục dựng 3D kết hợp với tab chữ — nơi duy nhất hệ thống cho phép minh họa
- Các nút biểu tượng tròn `50%` (mũi tên quay lại, chia sẻ, yêu thích, mũi tên carousel) rải rác khắp nơi
- `Airbnb Cereal VF` mang tất cả nhãn, từ chú thích pháp lý 8px đến tiêu đề phần 28px — hệ thống một họ font duy nhất
- Mã màu theo tầng sản phẩm: Airbnb Plus (hồng đậm `#92174d`), Airbnb Luxe (tím đậm `#460479`), Airbnb (san hô Rausch)
- Thiết kế giải thưởng Guest Favorite — số điểm khổng lồ căn giữa giữa hai vòng nguyệt quế, một trong những khoảnh khắc dễ nhận biết nhất trong hệ thống
- Bảng đặt chỗ cố định với cấu trúc giá → ngày → khách, ghim vào thanh bên phải trên desktop, chuyển thành thanh "Reserve" neo đáy trên di động
- Thanh điều hướng di động cố định ở đáy (Explore / Wishlists / Log in) với tông màu Rausch khi hoạt động

## 2. Bảng Màu & Vai Trò

### Chính
- **Rausch** (`#ff385c`): Màu san hô-hồng đặc trưng của thương hiệu. Biến CSS `--palette-bg-primary-core`. Dùng cho: nút "Reserve" chính, nút gửi tìm kiếm, gạch chân tab hoạt động, tim danh sách yêu thích, nhấn mạnh giá. Màu hiển thị cao nhất trên mọi trang.

### Phụ & Nhấn
- **Deep Rausch** (`#e00b41`): Biến thể bão hòa hơn. Biến CSS `--palette-bg-tertiary-core`. Dùng cho trạng thái nhấn/hoạt động của nút và điểm dừng cuối của gradient.
- **Plus Magenta** (`#92174d`): Biến CSS `--palette-bg-primary-plus`. Màu thương hiệu cho tầng sản phẩm Airbnb Plus — dịch vụ danh mục được tuyển chọn cao cấp hơn.
- **Luxe Purple** (`#460479`): Biến CSS `--palette-bg-primary-luxe`. Màu thương hiệu cho tầng sản phẩm Airbnb Luxe — thuê villa/bất động sản cấp cao.
- **Info Blue** (`#428bff`): Biến CSS `--palette-text-legal`. Dùng cho liên kết pháp lý/thông tin (điều khoản, quyền riêng tư, công khai) — màu liên kết không đơn sắc duy nhất trong hệ thống.

### Bề Mặt & Nền
- **Canvas White** (`#ffffff`): Nền trang mặc định. Mọi thẻ, mọi vùng chứa, mọi trang chi tiết đều bắt đầu từ đây.
- **Soft Cloud** (`#f7f7f7`): Tông bề mặt phụ nhẹ nhàng dùng cho nền footer, trình bao bọc chế độ xem bản đồ, và các phần "tất cả những thứ khác" muốn lùi so với nền trắng chính.
- **Hairline Gray** (`#dddddd`): Màu viền 1px phổ biến — phân tách thẻ, hàng tiện nghi, bảng đánh giá, cột footer. Màu làm việc của hệ thống bố cục.

### Trung Tính & Văn Bản
- **Ink Black** (`#222222`): Biến CSS `--palette-text-primary`. Gần đen của hệ thống. Mọi tiêu đề, mọi đoạn nội dung, mọi nhãn điều hướng, mọi giá. Dùng cho ~90% toàn bộ văn bản trên trang.
- **Charcoal** (`#3f3f3f`): Biến CSS `--palette-text-focused`. Dùng trong văn bản input trạng thái tập trung và văn bản nhấn mạnh bậc thấp hơn.
- **Ash Gray** (`#6a6a6a`): Biến CSS `--palette-bg-tertiary-hover`. Nhãn phụ, văn bản phụ đề kiểu "Cottage rentals" dưới tên thành phố, liên kết footer mờ.
- **Mute Gray** (`#929292`): Biến CSS `--palette-text-link-disabled`. Nút bị vô hiệu và siêu dữ liệu ưu tiên thấp.
- **Stone Gray** (`#c1c1c1`): Đường phân cách bậc ba, nét biểu tượng, avatar giữ chỗ.

### Ngữ Nghĩa & Nhấn
- **Error Red** (`#c13515`): Biến CSS `--palette-text-primary-error`. Lỗi kiểm tra form, cảnh báo hành động phá hủy.
- **Deep Error** (`#b32505`): Biến CSS `--palette-text-secondary-error-hover`. Biến thể nhấn/hoạt động của trạng thái lỗi.
- **Translucent Black** (`rgba(0, 0, 0, 0.24)`): Biến CSS `--palette-text-material-disabled`. Nhãn kiểu material bị vô hiệu.

### Hệ Thống Gradient
Gradient thương hiệu Airbnb xuất hiện ít ỏi, thường chỉ trên wordmark và khoảnh khắc thương hiệu nút tìm kiếm:

```
linear-gradient(90deg, #ff385c 0%, #e00b41 50%, #92174d 100%)
```

Dải san hô → hồng đậm này là "khoảnh khắc thương hiệu" — không bao giờ dùng làm bề mặt đầy đủ, chỉ dùng làm lớp fill pill hẹp hoặc xử lý logo.

## 3. Quy Tắc Typography

### Họ Font
- **Airbnb Cereal VF** (chính và duy nhất): Font sans-serif trọng lượng biến đổi độc quyền mang toàn bộ hệ thống. Dự phòng (theo thứ tự): `Circular, -apple-system, system-ui, Roboto, Helvetica Neue, sans-serif`.

Trọng lượng quan sát trong token đã trích xuất: 500, 600, 700. Không có 400-regular — trọng lượng "body" của hệ thống là 500, cho mỗi khối văn bản mật độ thêm tinh tế mà đọc có vẻ tự tin và có chủ ý.

Tính năng OpenType: `salt` (thay thế phong cách) được dùng trên nhãn 11px và 14px trọng lượng 600 gọn — có thể cho các chữ số chặt hơn và định hình ký tự đặc biệt. Không có tính năng ligature hoặc phân số quan sát được.

### Phân Cấp

| Vai trò | Kích thước | Trọng lượng | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|------|------|--------|-------------|----------------|-------|
| Section Heading | 28px / 1.75rem | 700 | 1.43 | 0 | "Inspiration for future getaways" — tiêu đề cấp trang |
| Subsection Heading | 22px / 1.38rem | 500 | 1.18 | -0.44px | "What this place offers", "Meet the hosts" — phân cách nội dung |
| Card Title | 21px / 1.31rem | 700 | 1.43 | 0 | Tiêu đề bảng đánh giá, tiêu đề thẻ chính |
| Listing Title | 20px / 1.25rem | 600 | 1.20 | -0.18px | "Small Group Yacht Tour, Unlimited Wine & Fruits" — tiêu đề danh mục trên trang chi tiết |
| Subtitle Bold | 16px / 1.00rem | 600 | 1.25 | 0 | Tên chủ nhà, tên thành phố |
| Body Medium | 16px / 1.00rem | 500 | 1.25 | 0 | Nội dung body chính trên trang chi tiết |
| Button Large | 16px / 1.00rem | 500 | 1.25 | 0 | "Reserve", "Become a host" |
| Button Default | 14px / 0.88rem | 500 | 1.29 | 0 | Nhãn nút tiêu chuẩn |
| Link | 14px / 0.88rem | 500 | 1.43 | 0 | Liên kết điều hướng, liên kết footer |
| Caption Medium | 14px / 0.88rem | 500 | 1.29 | 0 | Siêu dữ liệu, dòng phụ đề ("Cottage rentals", "Villa rentals") |
| Caption Bold | 14px / 0.88rem | 600 | 1.43 | 0 | Tính năng `salt` được bật — thống kê số, nhấn mạnh văn bản nhỏ |
| Caption Small | 13px / 0.81rem | 400 | 1.23 | 0 | Ngày đánh giá, siêu dữ liệu micro |
| Micro Default | 12px / 0.75rem | 400 | 1.33 | 0 | Tuyên bố từ chối footer, văn bản pháp lý micro |
| Micro Bold | 12px / 0.75rem | 700 | 1.33 | 0 | Nhãn pill "NEW" |
| Badge Uppercase | 11px / 0.69rem | 600 | 1.18 | 0 | Tính năng `salt` — badge danh mục/trạng thái gọn |
| Superscript | 8px / 0.50rem | 700 | 1.25 | 0.32px | Chữ hoa — chú thích giá, đuôi thập phân |

### Nguyên Tắc
- **Một họ, nhiều trọng lượng.** Airbnb Cereal VF xử lý mọi thứ từ pháp lý 8px đến tiêu đề trang 28px — nhận dạng hình ảnh đến từ họ font, không phải từ việc trộn mặt chữ.
- **500 là 400 mới.** Trọng lượng "regular" của hệ thống là 500, cho mỗi đoạn văn kết cấu tự tin hơn một chút so với mặc định web.
- **Tracking âm chỉ cho kiểu hiển thị.** Tiêu đề 20px+ nén tracking -0.18 đến -0.44px để cảm giác chạm khắc; kích thước body giữ nguyên tracking 0 để dễ đọc.
- **Chiều cao dòng chặt cho tiêu đề, thoáng cho body.** Kiểu hiển thị chạy ở 1.18–1.25 (chặt); body và caption mở ra đến 1.43 cho sự thoải mái dài hơi.
- **Không chữ hoa ngoại trừ 8px.** Biến đổi chữ hoa duy nhất trong hệ thống là superscript 8px — ở mọi nơi khác, chữ hoa câu với sự thay đổi trọng lượng tinh tế là đủ.

### Ghi Chú về Font Thay Thế
Airbnb Cereal VF là độc quyền. Font nguồn mở gần nhất là **Circular Std** (vẫn thương mại) hoặc **Inter** (miễn phí, Google Fonts) với letter-spacing giảm -0.01em ở kích thước hiển thị. Để đảm bảo độ trung thực thương hiệu nghiêm ngặt, chuỗi dự phòng đã ghi chép (`Circular, -apple-system, system-ui`) hiển thị chấp nhận được trên macOS/iOS nơi `system-ui` phân giải thành San Francisco, có tỷ lệ tương tự.

## 4. Kiểu Dáng Component

### Nút

**CTA Chính** ("Reserve", "Search", "Add dates")
- Nền: Rausch `#ff385c`
- Văn bản: Canvas White `#ffffff`, Airbnb Cereal 500, 16px
- Padding: ~14px dọc, 24px ngang
- Radius: 8px (hình chữ nhật) hoặc 50% (biến thể biểu tượng tròn)
- Viền: không có
- Hoạt động/nhấn: `transform: scale(0.92)` cộng với vòng tập trung 2px `#222222` tại `0 0 0 2px`

**Nút Phụ** ("Become a host", hành động bậc ba có viền)
- Nền: `#ffffff`
- Văn bản: Ink Black `#222222`, Airbnb Cereal 500, 14–16px
- Padding: 10px 16px
- Radius: 20px (pill) hoặc 8px (hình chữ nhật)
- Viền: 1px solid Hairline Gray `#dddddd`

**Nút Tròn Chỉ Biểu Tượng** (mũi tên quay lại, chia sẻ, yêu thích, điều khiển carousel)
- Nền: `#f2f2f2` (trắng nhạt hơi ngả) hoặc trắng với viền đen trong suốt 1px
- Biểu tượng: nét phác thảo `#222222`, 16–20px
- Kích thước: đường kính 32–44px
- Radius: 50%
- Hoạt động/nhấn: `transform: scale(0.92)`; vòng trắng 4px nhẹ nhàng `0 0 0 4px rgb(255,255,255)` để tách biệt khỏi nền nhiếp ảnh đầy màu sắc

**Nút Bị Vô Hiệu**
- Nền: `#f2f2f2`
- Văn bản: Stone Gray `#c1c1c1`
- Độ mờ: 0.5

**Nút Tab Pill** (bộ chọn danh mục "Homes / Experiences / Services")
- Nền: trong suốt
- Văn bản: Ink Black `#222222`, Airbnb Cereal 500, 16px
- Padding: 8px 14px
- Trạng thái hoạt động: gạch chân Ink Black 2px bên dưới nhãn
- Kết hợp với biểu tượng minh họa dựng 3D 36–48px phía trên nhãn

### Thẻ & Vùng Chứa

**Thẻ Danh Mục** (lưới trang chủ, kết quả tìm kiếm)
- Nền: `#ffffff`
- Radius: 14px trên ảnh, văn bản nằm trực tiếp bên dưới trên nền trong suốt
- Ảnh: tỷ lệ 4:3, toàn màn, bo tròn với radius 14px tương tự
- Padding: không có trên vùng chứa ngoài; 12px khoảng cách giữa ảnh và hàng siêu dữ liệu
- Bóng: không có — sự phân tách đến từ khoảng trắng và radius tự nhiên của ảnh chụp
- Mẫu siêu dữ liệu: Thành phố/vùng ở dòng 1 (16px 600), khoảng cách/thời lượng ở dòng 2 (14px 500 Ash Gray), phạm vi ngày ở dòng 3, hàng giá với "mỗi đêm" ở dưới cùng

**Bảng Đặt Chỗ Trang Chi Tiết** (thanh bên phải cố định trên trang phòng/trải nghiệm)
- Nền: `#ffffff`
- Radius: 14–20px
- Viền: 1px solid Hairline Gray `#dddddd`
- Bóng: `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` — nâng lên ba lớp tinh tế xếp chồng
- Padding: 24px
- Chiều rộng: ~370px, ghim 120–140px bên dưới đầu viewport
- Nội dung: tiêu đề giá → bộ chọn ngày → menu thả khách → CTA chính → chú thích "You won't be charged yet"

**Thẻ Lưới Tiện Nghi** (trên các trang chi tiết danh mục)
- Nền: `#ffffff`
- Viền: 1px solid Hairline Gray `#dddddd` ở cấp hàng (không phải theo mục)
- Padding: 16px dọc mỗi hàng tiện nghi
- Mẫu biểu tượng + nhãn: biểu tượng phác thảo 24px bên trái, nhãn trọng lượng 500 16px bên phải

**Thẻ Đánh Giá** (đánh giá riêng lẻ trên trang chi tiết)
- Nền: `#ffffff`, không viền
- Padding: 0 (dựa vào khoảng cách lưới)
- Nội dung: avatar tròn 40px + tên trọng lượng 600 16px + ngày 400 Ash Gray 14px trên một hàng, sau đó đoạn body trọng lượng 500 14px bên dưới

### Input & Form

**Thanh Tìm Kiếm** (trang chủ chính)
- Nền: `#ffffff`
- Viền: 1px solid Hairline Gray `#dddddd` bao quanh cả ba phân đoạn (Where / When / Who)
- Radius: 32px (pill đầy đủ)
- Bóng: `rgba(0, 0, 0, 0.04) 0 2px 6px 0` — cảm giác nổi nhẹ nhàng
- Cấu trúc: ba phân đoạn được chia bởi đường phân cách dọc mỏng, mỗi phân đoạn có nhãn trọng lượng 500 12px phía trên và placeholder trọng lượng 500 14px
- Gửi: nút biểu tượng tròn Rausch ở cạnh phải, đường kính 48px

**Input Văn Bản** (form chung)
- Nền: `#ffffff`
- Viền: 1px solid Hairline Gray `#dddddd`
- Radius: 8px
- Padding: 14px 16px
- Tập trung: viền chuyển sang Ink Black, thêm vòng ngoài đen `0 0 0 2px`
- Lỗi: viền chuyển sang `#c13515` (Error Red), văn bản trợ giúp dùng cùng màu

**Bộ Chọn Ngày**
- Lưới lịch: bố cục 7 cột, ô ngày tròn `50%` rộng 40–44px
- Phạm vi được chọn: nền Ink Black `#222222` với chữ số trắng
- Điểm neo bắt đầu/kết thúc: hình tròn lớn hơn; các ngày ở giữa dùng tông Soft Cloud `#f7f7f7`

### Điều Hướng

**Nav Trên Cùng (Desktop)**
- Chiều cao: ~80px
- Nền: `#ffffff`
- Trái: wordmark+logo Airbnb màu Rausch (102×32px)
- Giữa: bộ chọn danh mục ba tab (Homes / Experiences / Services) với biểu tượng 3D 36–48px xếp chồng phía trên nhãn trọng lượng 500 16px; tab hoạt động có gạch chân Ink Black 2px
- Phải: liên kết văn bản "Become a host", sau đó hình tròn 32px (ngôn ngữ), sau đó menu avatar hamburger 36px
- Viền dưới: 1px solid Hairline Gray `#dddddd`

**Nav Trên Cùng (Di Động)**
- Hàng đơn pill tìm kiếm chiếm toàn bộ chiều rộng: placeholder "Start your search" với biểu tượng kính lúp nhỏ
- Bên dưới: bộ chọn danh mục ba tab vẫn còn (Homes / Experiences / Services) — biểu tượng minh họa co lại ~28px
- Thanh tab cố định đáy: Explore (trạng thái hoạt động Rausch) / Wishlists / Log in — biểu tượng 24px phía trên nhãn 12px

**Nav Thứ Cấp Trang Chi Tiết Danh Mục**
- Cuộn ngang cố định các liên kết neo (Photos · Amenities · Reviews · Location · Host) xuất hiện khi cuộn qua ảnh anh hùng
- Chiều cao: 56px
- Viền dưới: 1px solid Hairline Gray

### Xử Lý Hình Ảnh

- **Tỷ lệ khung hình chính**: 4:3 cho lưới danh mục trang chủ, 16:9 cho nhiếp ảnh anh hùng trải nghiệm, 1:1 cho avatar
- **Radius**: 14px trên ảnh lưới danh mục, 20px trên khung ảnh anh hùng trang chi tiết, `50%` trên avatar
- **Lưới ảnh trên trang chi tiết**: lưới năm ảnh với một ảnh lớn bên trái (chiều rộng 50%) và bốn ảnh nhỏ hơn trong lưới 2×2 bên phải, tất cả chia sẻ vùng chứa bo ngoài 20px
- **Tải lười**: sử dụng nhiều `loading="lazy"` với preview placeholder mờ
- **Carousel**: nút mũi tên tròn 32px phủ lên ảnh, căn giữa theo chiều dọc; chỉ báo chấm nằm 12px phía trên cạnh dưới

### Component Đặc Trưng

**Thiết Kế Giải Thưởng Guest Favorite** (nổi bật trên trang chi tiết danh mục được đánh giá cao)
- Số điểm căn giữa hiển thị ở 44–56px trọng lượng 700
- Hai minh họa SVG vòng nguyệt quế vẽ tay hai bên trái và phải ở ~48px cao
- Bên dưới: nhãn "Guest Favorite" ở 12px 700 chữ hoa với tracking `0.32px`, và nhãn phụ ngắn ở 14px 500 Ash Gray
- Khối toàn chiều rộng, không viền vùng chứa — nằm trực tiếp trên canvas trắng

**Bộ Chọn Danh Mục Ba Tab** (xuất hiện ở đầu mọi bề mặt duyệt)
- Ba tab: Homes / Experiences / Services
- Mỗi tab: biểu tượng minh họa dựng 3D (~48px cao) phía trên nhãn trọng lượng 500 16px
- Experiences và Services hiện mang pill "NEW" nhỏ màu xanh navy (văn bản trắng 700 12px trên nền xanh đậm) nổi phía trên bên phải của biểu tượng
- Tab hoạt động: gạch chân Ink Black 2px bên dưới nhãn

**Lưới Thành Phố Cảm Hứng** (trang chủ "Inspiration for future getaways")
- Lưới 6 cột liên kết điểm đến trên desktop, 2 cột trên di động
- Mỗi ô: tên thành phố trọng lượng 600 16px ở dòng 1, phụ đề kiểu thuê Ash Gray 500 14px ở dòng 2 ("Cottage rentals", "Villa rentals")
- Không có ảnh — lưới chỉ văn bản
- Được chia tab ở trên bởi danh mục (Popular / Arts & culture / Beach / Mountains / Outdoors / Things to do / Travel tips & inspiration / Airbnb-friendly apartments) — tab hoạt động có gạch chân 2px và thay đổi trọng lượng

**Thẻ Cố Định Reserve** (trang chi tiết danh mục)
- Duy trì cố định 120px bên dưới đầu viewport trên desktop khi người dùng cuộn qua anh hùng
- Thu gọn thành thanh toàn chiều rộng ở đáy trên di động với nhãn "From $X / night" và pill Rausch "Reserve"
- Luôn hiển thị: tiêu đề giá → hiển thị ngày → bộ chọn khách → CTA Rausch → tuyên bố từ chối "You won't be charged yet"

**Thẻ Chủ Nhà Trải Nghiệm** (trang chi tiết trải nghiệm)
- Vùng chứa bo tròn toàn chiều rộng với ảnh bìa 3:2 ở trên
- Avatar chủ nhà (tròn, 56px) chồng lên cạnh dưới của bìa 50%
- Bên dưới chồng lên: tên chủ nhà ở 16px 700, thâm niên chủ nhà ở 14px 500 Ash Gray, nút pill "Message host" Rausch nhỏ
- Dùng làm chuyển tiếp giữa đánh giá và khối tiện nghi/vị trí

**Dải "Things to know"** (trang chi tiết danh mục)
- Lưới 3 cột của các khối quy tắc/chính sách (House rules, Safety & property, Cancellation policy)
- Mỗi cột: biểu tượng ở trên cùng, tiêu đề trọng lượng 600 16px, body Ash Gray 500 14px, liên kết "Show more" gạch chân Ink Black
- Đường phân cách: viền Hairline Gray 1px trên và dưới toàn dải

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách
- **Đơn vị cơ sở**: 8px
- **Thang đã trích xuất**: 2, 3, 4, 5.5, 6, 8, 10, 11, 12, 15, 16, 18.5, 22, 24, 32px — chi tiết với một số giá trị ngoài lưới dùng để căn chỉnh biểu tượng hoàn hảo pixel
- **Padding phần**: ~48–64px trên/dưới trên desktop, 24–32px trên di động
- **Padding nội bộ thẻ**: 24px trên bảng đặt chỗ và thẻ lớn, 16px trên hàng tiện nghi, 12px trên siêu dữ liệu thẻ danh mục
- **Khoảng cách giữa thẻ danh mục**: 24px desktop, 16px di động
- **Giữa các hàng văn bản xếp chồng**: 4–8px (rất chặt — củng cố cảm giác "thông tin dày đặc" của danh mục du lịch)

### Lưới & Vùng Chứa
- **Chiều rộng nội dung tối đa**: 1760–1920px trên siêu rộng (Airbnb cho lưới thở rộng hơn hầu hết các trang); 1280px trên hầu hết trang chi tiết
- **Lưới danh mục trang chủ**: 6 cột tại ≥1760px, 5 tại ≥1440px, 4 tại ≥1128px, 3 tại ≥800px, 2 tại ≥550px, 1 bên dưới
- **Trang chi tiết**: 2 cột bất đối xứng — nội dung chính ~58%, bảng đặt chỗ cố định ~36% bên phải, ~6% gutter
- **Footer**: 3 cột Support / Hosting / Airbnb

### Triết Lý Khoảng Trắng
Airbnb chứa nhiều thông tin nhưng không bao giờ chật chội. Khoảng trắng được dùng để *nhóm* — thẻ danh mục có 24px gutter để mỗi ảnh chụp đọc như một vật thể riêng biệt, nhưng siêu dữ liệu dưới mỗi thẻ dùng khoảng cách 4–8px để giá/thành phố/ngày cảm giác như một đơn vị duy nhất. Bảng đặt chỗ trang chi tiết có 24px padding nội bộ, nhưng các hàng trong (bộ chọn ngày, bộ chọn khách, CTA) xếp chồng ở 12px — ranh giới giữa thẻ và trang làm nhiều công việc phân tách hơn nội dung bên trong.

### Thang Bo Góc
| Radius | Sử dụng |
|--------|-----|
| 4px | Thẻ neo inline, chip thẻ |
| 8px | Nút văn bản, dropdown, nút tiện ích nhỏ |
| 14px | Nhiếp ảnh thẻ danh mục, vùng chứa nội dung chung, badge |
| 20px | Nút bo tròn chính (hình pill), ảnh lớn, bảng đặt chỗ |
| 32px | Pill thanh tìm kiếm, vùng chứa cực lớn |
| 50% | Tất cả nút biểu tượng tròn, tất cả avatar, tim danh sách yêu thích — hình học tròn đặc trưng của hệ thống |

## 6. Độ Sâu & Nâng Cao

| Cấp | Xử lý | Sử dụng |
|-------|-----------|-----|
| 0 | Không có bóng | Thẻ danh mục, nội dung body, phần chỉ văn bản |
| 1 | `rgba(0, 0, 0, 0.08) 0 4px 12px` | Nút biểu tượng hoạt động/nhấn (ví dụ: quay lại, chia sẻ, yêu thích) — nâng nhẹ để chỉ ra tương tác |
| 2 | `rgba(0, 0, 0, 0.02) 0 0 0 1px, rgba(0, 0, 0, 0.04) 0 2px 6px 0, rgba(0, 0, 0, 0.1) 0 4px 8px 0` | Thẻ cố định bảng đặt chỗ, modal, menu dropdown — nâng cao ba lớp đặc trưng của hệ thống |
| Focus Ring | `0 0 0 2px #222222` | Nút trạng thái hoạt động, input tìm kiếm tập trung |
| White Separator Ring | `rgb(255, 255, 255) 0 0 0 4px` | Nút tròn phủ lên ảnh chụp — vòng trắng 4px phân tách rõ ràng nút khỏi nền ảnh đầy màu sắc |

Triết lý bóng: Airbnb sử dụng **bóng nhiều lớp xếp chồng** thay vì một bóng thả duy nhất. Bóng ba lớp bảng đặt chỗ đọc như một nâng lên gắn kết nhưng thực ra là ba bóng riêng biệt ở các giá trị độ mờ/blur khác nhau — tạo ra anti-aliasing tinh tế ở chu vi bóng mà cảm giác cao cấp mà không nặng nề.

### Độ Sâu Trang Trí
- **Nhiếp ảnh như độ sâu**: hệ thống dựa nhiều vào nhiếp ảnh toàn màn để tạo độ sâu hình ảnh; bóng và gradient được dùng tiết kiệm để ảnh chụp làm việc nặng
- **Thiết kế vòng nguyệt quế**: giải thưởng Guest Favorite sử dụng hai minh họa SVG nguyệt quế tạo cho số điểm phẳng nếu không có sự hiện diện nghi lễ, tựa cúp
- **Biểu tượng danh mục dựng 3D**: biểu tượng Homes/Experiences/Services có ánh sáng nội tâm mềm và bóng đổ nhẹ baked vào tác phẩm — nơi duy nhất thương hiệu cho phép minh họa "chiều sâu"

## 7. Nên Làm & Không Nên Làm

### Nên Làm
- Dành Rausch `#ff385c` cho hành động chính và chỉ báo tab hoạt động — không bao giờ pha loãng với các cách dùng trang trí.
- Để nhiếp ảnh thở — cắt 4:3 với góc bo tròn 14–20px, không văn bản phủ lên, không scrims gradient.
- Dùng Ink Black `#222222` cho mọi lớp văn bản bên dưới Rausch — đây là gần đen của hệ thống, không bao giờ là `#000000` thật.
- Kết hợp biểu tượng 3D của bộ chọn danh mục ba tab với typography phẳng — không trộn phong cách minh họa trong một bề mặt duy nhất.
- Xếp chồng ba bóng độ mờ thấp (~2%, 4%, 10%) để tạo nâng cao bảng đặt chỗ đặc trưng.
- Dùng viền Hairline Gray `#dddddd` 1px cho mọi đường phân cách thẻ-thẻ và hàng-hàng.
- Coi bảng đặt chỗ là cố định trên desktop, thu gọn thành thanh reserve neo đáy trên di động.
- Dùng khoảng cách 4–8px trong các nhóm siêu dữ liệu và 24px giữa các thẻ — mật độ thông tin là có chủ ý.

### Không Nên Làm
- Đừng giới thiệu màu nhấn thứ cấp ngoài bảng màu tầng sản phẩm Rausch / Plus Magenta / Luxe Purple.
- Đừng đặt văn bản bên trong ảnh chụp — chú thích luôn ngồi bên dưới ảnh, không bao giờ phủ lên.
- Đừng dùng nhãn chữ hoa ngoại trừ vai trò superscript 8px duy nhất.
- Đừng bo nút biểu tượng thành bất cứ thứ gì khác 50% — tròn là hình học đặc trưng của hệ thống.
- Đừng thêm bóng đổ vào thẻ danh mục — chúng nằm trên canvas trắng không có nâng cao.
- Đừng dùng nền gradient — gradient duy nhất trong hệ thống là dải Rausch → hồng đậm hẹp trên wordmark.
- Đừng dùng trọng lượng font 400-regular — trọng lượng body của Airbnb Cereal là 500.
- Đừng ghi đè Airbnb Cereal VF bằng mặt chữ hiển thị khác — hệ thống có chủ ý là một họ duy nhất.

## 8. Hành Vi Responsive

### Breakpoint

Airbnb khai báo ~60 breakpoint (hiện vật thiết kế-thời gian từ thư viện component của họ), nhưng các thay đổi bố cục có ý nghĩa xảy ra ở tập nhỏ hơn nhiều:

| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Ultra-wide | ≥1760px | Lưới danh mục 6 cột, chiều rộng nội dung tối đa 1760–1920px |
| Desktop XL | 1440–1759px | Lưới 5 cột, nav đầy đủ hiển thị, bảng đặt chỗ thanh bên phải cố định |
| Desktop | 1128–1439px | Lưới 4 cột, bảng đặt chỗ cố định vẫn còn |
| Laptop | 1024–1127px | Lưới 3–4 cột, nav danh mục vẫn nằm ngang |
| Tablet | 800–1023px | Lưới 3 cột, tìm kiếm toàn cầu có thể thu gọn thành pill hàng đơn |
| Small tablet | 550–799px | Lưới 2 cột, bảng đặt chỗ rớt thành khối nội dung toàn chiều rộng |
| Mobile | 375–549px | Bố cục xếp chồng 1 cột, thanh tab cố định đáy xuất hiện (Explore / Wishlists / Log in) |
| Small mobile | <375px | Padding cạnh thắt chặt đến 16px; biểu tượng bộ chọn danh mục co lại ~28px |

### Mục Tiêu Chạm
Tất cả các phần tử tương tác đáp ứng hoặc vượt 44×44px. Họ nút biểu tượng tròn được cỡ cụ thể 32–44px với padding vùng nhấn mở rộng 8–12px. Nút Reserve chính Rausch cao ~48px. Vùng nhấn bộ chọn danh mục ba tab là hình chữ nhật nhãn-cộng-biểu tượng đầy đủ (thường ~64×80px mỗi tab).

### Chiến Lược Thu Gọn
- **Nav**: Nav trên cùng giữ wordmark Airbnb + bộ chọn ba tab trên tablet và trở lên; trên di động bộ chọn trượt ngay bên dưới pill tìm kiếm, và điều khiển globe/avatar chuyển đến thanh tab neo đáy.
- **Thanh tìm kiếm**: Pill ba phân đoạn (Where / When / Who) với nút gửi tròn Rausch trên desktop; thu gọn thành pill hàng đơn "Start your search" trên di động, nhấn vào đó mở sheet tìm kiếm toàn màn.
- **Bảng đặt chỗ**: Thanh bên phải cố định tại ≥1128px; nội tuyến trong cột nội dung chính giữa 800–1127px; pill "Reserve" cố định đáy tại <800px.
- **Lưới danh mục**: Cập lại 6 → 5 → 4 → 3 → 2 → 1 cột qua các breakpoint.
- **Lưới ảnh trang chi tiết**: Bố cục năm ảnh (1 lớn + 4 nhỏ) trên desktop; trở thành carousel toàn màn vuốt được trên di động với chỉ báo chấm trang.
- **Footer**: Bố cục 3 cột thu gọn thành một cột xếp chồng tại <800px.

### Hành Vi Hình Ảnh
- `loading="lazy"` phổ quát, với preview thumbnail `im_w=` được tham số hóa URL mờ được phục vụ trước
- Ảnh responsive sử dụng CDN `muscache.com` của Airbnb với tham số truy vấn `im_w` để phân phối theo chiều rộng (`im_w=240`, `im_w=720`, `im_w=1200`, `im_w=2400`)
- Không cắt nghệ thuật — cùng ảnh được co lại/phóng to qua các breakpoint
- Carousel tự động điều chỉnh chiều cao ảnh để duy trì tỷ lệ 4:3 nhất quán bất kể tỷ lệ nguồn

## 9. Hướng Dẫn Prompt Agent

### Tham Khảo Màu Nhanh
- CTA chính: "Rausch (#ff385c)"
- Nền trang: "Canvas White (#ffffff)"
- Bề mặt phụ: "Soft Cloud (#f7f7f7)"
- Văn bản tiêu đề / body: "Ink Black (#222222)"
- Văn bản thứ cấp: "Ash Gray (#6a6a6a)"
- Viền / đường phân cách: "Hairline Gray (#dddddd)"
- Lỗi: "Error Red (#c13515)"
- Liên kết thông tin: "Info Blue (#428bff)"
- Nhấn tầng Luxe: "Luxe Purple (#460479)"
- Nhấn tầng Plus: "Plus Magenta (#92174d)"

### Prompt Component Mẫu
- "Tạo nút Reserve chính: nền Rausch (#ff385c), nhãn Airbnb Cereal trọng lượng 500 trắng ở 16px, padding 14px × 24px, border-radius 8px, không bóng. Khi hoạt động/nhấn thêm `transform: scale(0.92)` với vòng tập trung Ink Black 2px (`0 0 0 2px #222222`)."
- "Xây thẻ danh mục với ảnh chụp toàn màn tỷ lệ 4:3 ở border-radius 14px, không bóng vùng chứa; bên dưới ảnh xếp chồng ba hàng văn bản với khoảng cách 4px: tên thành phố ở 16px 600 Ink Black, loại thuê ở 14px 500 Ash Gray (#6a6a6a), và phạm vi giá ở 16px 500 Ink Black với hậu tố `per night` 14px."
- "Thiết kế bảng đặt chỗ cố định: nền trắng, border-radius 14px, viền Hairline Gray (#dddddd) 1px, bóng nâng cao 3 lớp (`rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px 0, rgba(0,0,0,0.1) 0 4px 8px 0`), padding 24px, chiều rộng 370px, ghim 120px bên dưới đầu viewport trên desktop. Nội dung: tiêu đề giá, bộ chọn ngày, dropdown khách, CTA chính Rausch, và tuyên bố từ chối Ash Gray 12px `You won't be charged yet`."
- "Tạo bộ chọn danh mục ba tab: ba tab chiều rộng bằng nhau được gán nhãn Homes, Experiences, Services; mỗi tab có biểu tượng minh họa dựng 3D (~48px cao) (nhà, khinh khí cầu, chuông) phía trên nhãn Ink Black trọng lượng 500 16px; tab hoạt động có gạch chân Ink Black 2px; thêm pill `NEW` nhỏ trọng lượng 700 trắng 12px trên nền xanh đậm navy vào phía trên bên phải của biểu tượng Experiences và Services."
- "Hiển thị thiết kế giải thưởng Guest Favorite: số điểm căn giữa ở 52px trọng lượng 700 Ink Black, được neo bởi hai vòng nguyệt quế SVG vẽ tay ở ~48px cao; bên dưới, nhãn `GUEST FAVORITE` chữ hoa trọng lượng 700 12px với tracking 0.32px; nhãn phụ ở 14px 500 Ash Gray; khối toàn chiều rộng nằm trực tiếp trên canvas trắng không có viền vùng chứa."

### Hướng Dẫn Lặp
Khi tinh chỉnh các màn hình hiện có được tạo với hệ thống thiết kế này:
1. Tập trung vào MỘT component tại một thời điểm.
2. Tham chiếu tên màu cụ thể và mã hex từ tài liệu này (ví dụ: "Ink Black #222222", không phải "dark gray").
3. Dùng mô tả ngôn ngữ tự nhiên cùng với số đo ("nâng lên ba lớp tinh tế" thay vì một chuỗi bóng dài).
4. Mô tả "cảm giác" mong muốn ("như tạp chí, ưu tiên nhiếp ảnh" so với "tiện ích dày đặc").
5. Luôn mặc định Airbnb Cereal VF trọng lượng 500 cho body và 600–700 cho nhấn mạnh — không bao giờ 400.
6. Giữ hồng Rausch ít ỏi — nếu nhiều hơn một phần tử màu Rausch xuất hiện mỗi viewport, hãy xem xét liệu một nên được trung hòa.

### Khoảng Trống Đã Biết
- **Thẻ lưới danh mục trang chủ**: lưới thẻ bất động sản chính (bề mặt hình ảnh chính của airbnb.com) không được chụp đầy đủ trong các ảnh chụp màn hình trang chủ đã trích xuất — nội dung chỉ tải một phần. Thông số Thẻ Danh Mục ở trên được suy ra từ cấu trúc lưới Inspiration và các quy ước rộng hơn của Airbnb; xác nhận tỷ lệ khung hình chính xác và phân cấp siêu dữ liệu với trang live trước khi dùng sản xuất.
- **Biểu tượng danh mục Experiences**: các biểu tượng minh họa 3D cho Homes / Experiences / Services được phục vụ như tài sản raster; thông số tệp nguồn chính xác của chúng (SVG so với PNG, kích thước pixel đã dựng) không được ghi lại ở đây.
- **Thời gian hoạt ảnh và chuyển đổi**: không được chụp — phạm vi trích xuất tĩnh.
- **Dark mode**: Airbnb không cung cấp dark mode gốc trong các bề mặt sản phẩm đã trích xuất; tài liệu này mô tả chủ đề sáng duy nhất.
