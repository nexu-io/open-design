# Hệ Thống Thiết Kế Lấy Cảm Hứng từ Spotify

> Category: Truyền thông & Tiêu dùng
> Phát nhạc trực tuyến. Xanh lá nổi bật trên nền tối, chữ đậm, lấy ảnh bìa album làm trung tâm.

## 1. Chủ Đề Thị Giác & Bầu Không Khí

Giao diện web của Spotify là một trình phát nhạc tối, đắm chìm, bao bọc người nghe trong lớp màu gần đen (`#121212`, `#181818`, `#1f1f1f`) — nơi ảnh bìa album và nội dung trở thành nguồn màu sắc chủ đạo. Triết lý thiết kế là "bóng tối ưu tiên nội dung" — giao diện lùi vào bóng tối để âm nhạc, podcast và danh sách phát có thể tỏa sáng. Mọi bề mặt đều là một sắc thái than chì, tạo nên môi trường giống như rạp hát, nơi màu sắc thật duy nhất đến từ Spotify Green huyền thoại (`#1ed760`) và chính ảnh bìa album.

Phông chữ sử dụng SpotifyMixUI và SpotifyMixUITitle — các phông chữ độc quyền thuộc họ CircularSp (Circular của Lineto, được tùy chỉnh cho Spotify) với bộ dự phòng mở rộng bao gồm các phông chữ Ả Rập, Hebrew, Cyrillic, Hy Lạp, Devanagari và CJK, phản ánh tầm vươn toàn cầu của Spotify. Hệ thống chữ gọn gàng và thực dụng: 700 (đậm) cho điểm nhấn và điều hướng, 600 (semi-đậm) cho điểm nhấn phụ, và 400 (thường) cho nội dung thân. Các nút dùng chữ hoa với khoảng cách ký tự dương (1.4px–2px) tạo nên phong cách nhãn mác có hệ thống.

Điều tạo nên sự khác biệt của Spotify là hình học viên thuốc và vòng tròn. Các nút chính sử dụng bán kính 500px–9999px (viên thuốc đầy đủ), nút phát hình tròn dùng bán kính 50%, và ô tìm kiếm là hình viên thuốc 500px. Kết hợp với đổ bóng nặng (`rgba(0,0,0,0.5) 0px 8px 24px`) trên các phần tử nổi và tổ hợp viền đổ bóng inset độc đáo (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`), kết quả là một giao diện cảm giác như thiết bị âm thanh cao cấp — có chiều sâu xúc giác, bo tròn, và được tạo ra để chạm.

**Đặc Điểm Nổi Bật:**
- Chủ đề tối đắm chìm gần đen (`#121212`–`#1f1f1f`) — giao diện biến mất phía sau nội dung
- Spotify Green (`#1ed760`) là điểm nhấn thương hiệu duy nhất — không bao giờ trang trí, luôn có chức năng
- Họ phông chữ SpotifyMixUI/CircularSp với hỗ trợ chữ viết toàn cầu
- Nút viên thuốc (500px–9999px) và điều khiển hình tròn (50%) — bo tròn, tối ưu cho chạm
- Nhãn nút chữ hoa với khoảng cách ký tự rộng (1.4px–2px)
- Đổ bóng nặng trên các phần tử nổi (`rgba(0,0,0,0.5) 0px 8px 24px`)
- Màu ngữ nghĩa: đỏ âm (`#f3727f`), cam cảnh báo (`#ffa42b`), xanh thông báo (`#539df5`)
- Ảnh bìa album là nguồn màu sắc chính — giao diện bản thân không có màu sắc theo thiết kế

## 2. Bảng Màu & Vai Trò

### Thương Hiệu Chính
- **Spotify Green** (`#1ed760`): Điểm nhấn thương hiệu chính — nút phát, trạng thái hoạt động, CTA
- **Gần Đen** (`#121212`): Bề mặt nền sâu nhất
- **Bề Mặt Tối** (`#181818`): Thẻ, container, bề mặt nổi
- **Tối Trung** (`#1f1f1f`): Nền nút, bề mặt tương tác

### Chữ
- **Trắng** (`#ffffff`): `--text-base`, chữ chính
- **Bạc** (`#b3b3b3`): Chữ phụ, nhãn mờ, điều hướng không hoạt động
- **Gần Trắng** (`#cbcbcb`): Chữ phụ sáng hơn một chút
- **Sáng** (`#fdfdfd`): Gần trắng thuần cho nhấn mạnh tối đa

### Ngữ Nghĩa
- **Đỏ Âm** (`#f3727f`): `--text-negative`, trạng thái lỗi
- **Cam Cảnh Báo** (`#ffa42b`): `--text-warning`, trạng thái cảnh báo
- **Xanh Thông Báo** (`#539df5`): `--text-announcement`, trạng thái thông tin

### Bề Mặt & Viền
- **Thẻ Tối** (`#252525`): Bề mặt thẻ nổi
- **Thẻ Trung** (`#272727`): Bề mặt thẻ thay thế
- **Xám Viền** (`#4d4d4d`): Viền nút trên nền tối
- **Viền Sáng** (`#7c7c7c`): Viền nút có đường viền, liên kết mờ
- **Đường Phân Cách** (`#b3b3b3`): Đường chia
- **Bề Mặt Sáng** (`#eeeeee`): Nút chế độ sáng (hiếm)
- **Viền Spotify Green** (`#1db954`): Biến thể viền xanh lá nhấn

### Đổ Bóng
- **Nặng** (`rgba(0,0,0,0.5) 0px 8px 24px`): Hộp thoại, menu, panel nổi
- **Trung Bình** (`rgba(0,0,0,0.3) 0px 8px 8px`): Thẻ, dropdown
- **Viền Inset** (`rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset`): Tổ hợp viền-đổ bóng cho ô nhập

## 3. Quy Tắc Chữ

### Họ Phông Chữ
- **Tiêu Đề**: `SpotifyMixUITitle`, dự phòng: `CircularSp-Arab, CircularSp-Hebr, CircularSp-Cyrl, CircularSp-Grek, CircularSp-Deva, Helvetica Neue, helvetica, arial, Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo, MS Gothic`
- **Giao Diện / Thân**: `SpotifyMixUI`, cùng bộ dự phòng

### Phân Cấp

| Vai trò | Phông | Cỡ | Độ đậm | Chiều cao dòng | Khoảng cách ký tự | Ghi chú |
|------|------|------|--------|-------------|----------------|-------|
| Tiêu đề phần | SpotifyMixUITitle | 24px (1.50rem) | 700 | normal | normal | Độ đậm tiêu đề |
| Đầu mục tính năng | SpotifyMixUI | 18px (1.13rem) | 600 | 1.30 (chặt) | normal | Đầu mục phần semi-đậm |
| Thân Đậm | SpotifyMixUI | 16px (1.00rem) | 700 | normal | normal | Chữ nhấn mạnh |
| Thân | SpotifyMixUI | 16px (1.00rem) | 400 | normal | normal | Thân chuẩn |
| Nút Chữ Hoa | SpotifyMixUI | 14px (0.88rem) | 600–700 | 1.00 (chặt) | 1.4px–2px | `text-transform: uppercase` |
| Nút | SpotifyMixUI | 14px (0.88rem) | 700 | normal | 0.14px | Nút chuẩn |
| Liên Kết Nav Đậm | SpotifyMixUI | 14px (0.88rem) | 700 | normal | normal | Điều hướng |
| Liên Kết Nav | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Điều hướng không hoạt động |
| Chú Thích Đậm | SpotifyMixUI | 14px (0.88rem) | 700 | 1.50–1.54 | normal | Metadata đậm |
| Chú Thích | SpotifyMixUI | 14px (0.88rem) | 400 | normal | normal | Metadata |
| Nhỏ Đậm | SpotifyMixUI | 12px (0.75rem) | 700 | 1.50 | normal | Thẻ nhãn, số đếm |
| Nhỏ | SpotifyMixUI | 12px (0.75rem) | 400 | normal | normal | Chữ tinh |
| Huy hiệu | SpotifyMixUI | 10.5px (0.66rem) | 600 | 1.33 | normal | `text-transform: capitalize` |
| Siêu nhỏ | SpotifyMixUI | 10px (0.63rem) | 400 | normal | normal | Chữ nhỏ nhất |

### Nguyên Tắc
- **Nhị phân đậm/thường**: Hầu hết chữ đều là 700 (đậm) hoặc 400 (thường), 600 được dùng hạn chế. Điều này tạo ra phân cấp thị giác rõ ràng thông qua tương phản độ đậm thay vì biến thiên kích thước.
- **Nút chữ hoa như một hệ thống**: Nhãn nút dùng chữ hoa + khoảng cách ký tự rộng (1.4px–2px), tạo nên giọng điệu "nhãn" có hệ thống, khác biệt với chữ nội dung.
- **Cỡ chữ gọn gàng**: Phạm vi là 10px–24px — hẹp hơn hầu hết các hệ thống. Chữ của Spotify gọn gàng và thực dụng, thiết kế để quét qua danh sách phát, không phải để đọc bài viết.
- **Hỗ trợ chữ viết toàn cầu**: Bộ dự phòng mở rộng (Ả Rập, Hebrew, Cyrillic, Hy Lạp, Devanagari, CJK) phản ánh tầm phủ hơn 180 thị trường của Spotify.

## 4. Kiểu Dáng Thành Phần

### Nút

**Viên Thuốc Tối**
- Background: `#1f1f1f`
- Text: `#ffffff` or `#b3b3b3`
- Padding: 8px 16px
- Radius: 9999px (viên thuốc đầy đủ)
- Dùng: Viên thuốc điều hướng, hành động phụ

**Viên Thuốc Tối Lớn**
- Background: `#181818`
- Text: `#ffffff`
- Padding: 0px 43px
- Radius: 500px
- Dùng: Nút điều hướng ứng dụng chính

**Viên Thuốc Sáng**
- Background: `#eeeeee`
- Text: `#181818`
- Radius: 500px
- Dùng: CTA chế độ sáng (đồng ý cookie, marketing)

**Viên Thuốc Có Đường Viền**
- Background: transparent
- Text: `#ffffff`
- Border: `1px solid #7c7c7c`
- Padding: 4px 16px 4px 36px (bất đối xứng cho biểu tượng)
- Radius: 9999px
- Dùng: Nút theo dõi, hành động phụ

**Phát Hình Tròn**
- Background: `#1f1f1f`
- Text: `#ffffff`
- Padding: 12px
- Radius: 50% (hình tròn)
- Dùng: Điều khiển phát/dừng

### Thẻ & Container
- Background: `#181818` or `#1f1f1f`
- Radius: 6px–8px
- Không có viền nhìn thấy trên hầu hết các thẻ
- Hover: nền sáng lên nhẹ
- Shadow: `rgba(0,0,0,0.3) 0px 8px 8px` khi nổi

### Ô Nhập
- Ô tìm kiếm: nền `#1f1f1f`, chữ `#ffffff`
- Radius: 500px (viên thuốc)
- Padding: 12px 96px 12px 48px (tính toán cho biểu tượng)
- Focus: viền đổi thành `#000000`, outline `1px solid`

### Điều Hướng
- Thanh bên tối với SpotifyMixUI 14px độ đậm 700 cho đang hoạt động, 400 cho không hoạt động
- Màu mờ `#b3b3b3` cho mục không hoạt động, `#ffffff` cho đang hoạt động
- Nút biểu tượng hình tròn (bán kính 50%)
- Logo Spotify góc trên bên trái màu xanh lá

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách
- Đơn vị cơ bản: 8px
- Thang đo: 1px, 2px, 3px, 4px, 5px, 6px, 8px, 10px, 12px, 14px, 15px, 16px, 20px

### Lưới & Container
- Thanh bên (cố định) + vùng nội dung chính
- Thẻ album/danh sách phát dạng lưới
- Thanh đang phát đầy chiều rộng ở dưới cùng
- Vùng nội dung responsive lấp đầy khoảng trống còn lại

### Triết Lý Khoảng Trắng
- **Nén tối**: Spotify đóng gói nội dung dày đặc — lưới danh sách phát, danh sách bài hát và điều hướng đều được sắp xếp chặt chẽ. Nền tối tạo khoảng nghỉ thị giác giữa các phần tử mà không cần khoảng trống lớn.
- **Mật độ nội dung hơn khoảng thở**: Đây là ứng dụng, không phải trang marketing. Mỗi pixel phục vụ trải nghiệm nghe nhạc.

### Thang Độ Bo Góc
- Tối thiểu (2px): Huy hiệu, thẻ nhãn explicit
- Tinh tế (4px): Ô nhập, phần tử nhỏ
- Chuẩn (6px): Container ảnh bìa album, thẻ
- Thoải mái (8px): Phần, hộp thoại
- Trung bình (10px–20px): Panel, phần tử overlay
- Lớn (100px): Nút viên thuốc lớn
- Viên thuốc (500px): Nút chính, ô tìm kiếm
- Viên thuốc đầy đủ (9999px): Viên thuốc điều hướng, tìm kiếm
- Hình tròn (50%): Nút phát, avatar, biểu tượng

## 6. Chiều Sâu & Độ Nổi

| Cấp | Xử lý | Dùng |
|-------|-----------|-----|
| Cơ sở (Cấp 0) | nền `#121212` | Lớp sâu nhất, nền trang |
| Bề mặt (Cấp 1) | `#181818` or `#1f1f1f` | Thẻ, thanh bên, container |
| Nổi (Cấp 2) | `rgba(0,0,0,0.3) 0px 8px 8px` | Menu dropdown, thẻ hover |
| Hộp thoại (Cấp 3) | `rgba(0,0,0,0.5) 0px 8px 24px` | Modal, overlay, menu |
| Inset (Viền) | `rgb(18,18,18) 0px 1px 0px, rgb(124,124,124) 0px 0px 0px 1px inset` | Viền ô nhập |

**Triết Lý Đổ Bóng**: Spotify sử dụng đổ bóng đáng kể nặng cho ứng dụng chủ đề tối. Đổ bóng độ mờ 0.5 với blur 24px tạo hiệu ứng "nổi trong bóng tối" ấn tượng cho hộp thoại và menu, trong khi độ mờ 0.3 với blur 8px tạo nâng thẻ tinh tế hơn. Tổ hợp viền đổ bóng inset độc đáo trên các ô nhập tạo chất lượng lõm vào, có xúc giác.

## 7. Nên và Không Nên

### Nên
- Dùng nền gần đen (`#121212`–`#1f1f1f`) — chiều sâu qua biến thiên sắc thái
- Áp dụng Spotify Green (`#1ed760`) chỉ cho điều khiển phát, trạng thái hoạt động và CTA chính
- Dùng hình viên thuốc (500px–9999px) cho tất cả nút — hình tròn (50%) cho điều khiển phát
- Áp dụng chữ hoa + khoảng cách ký tự rộng (1.4px–2px) trên nhãn nút
- Giữ chữ gọn gàng (phạm vi 10px–24px) — đây là ứng dụng, không phải tạp chí
- Dùng đổ bóng nặng (`0.3–0.5 opacity`) cho các phần tử nổi trên nền tối
- Để ảnh bìa album cung cấp màu sắc — bản thân giao diện không có màu sắc

### Không Nên
- Không dùng Spotify Green trang trí hoặc trên nền — nó chỉ có chức năng
- Không dùng nền sáng cho bề mặt chính — sự đắm chìm tối là cốt lõi
- Không bỏ qua hình học viên thuốc/hình tròn trên nút — nút vuông phá vỡ nhận diện
- Không dùng đổ bóng mỏng/tinh tế — trên nền tối, đổ bóng cần nặng để có thể thấy
- Không thêm màu thương hiệu bổ sung — xanh lá + xám achromatic là bảng màu đầy đủ
- Không dùng chiều cao dòng thoải mái — chữ của Spotify gọn gàng và dày đặc
- Không để lộ viền xám thô — thay vào đó dùng viền dựa trên đổ bóng hoặc inset

## 8. Hành Vi Responsive

### Breakpoint
| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Mobile Nhỏ | <425px | Bố cục mobile gọn |
| Mobile | 425–576px | Mobile chuẩn |
| Tablet | 576–768px | Lưới 2 cột |
| Tablet Lớn | 768–896px | Bố cục mở rộng |
| Desktop Nhỏ | 896–1024px | Thanh bên hiển thị |
| Desktop | 1024–1280px | Bố cục desktop đầy đủ |
| Desktop Lớn | >1280px | Lưới mở rộng |

### Chiến Lược Thu Gọn
- Thanh bên: đầy đủ → thu gọn → ẩn
- Lưới album: 5 cột → 3 → 2 → 1
- Thanh đang phát: duy trì ở mọi kích thước
- Tìm kiếm: ô nhập viên thuốc duy trì, chiều rộng điều chỉnh
- Điều hướng: thanh bên → thanh dưới trên mobile

## 9. Hướng Dẫn Prompt cho Agent

### Tham Chiếu Màu Nhanh
- Background: Gần Đen (`#121212`)
- Surface: Thẻ Tối (`#181818`)
- Text: Trắng (`#ffffff`)
- Chữ phụ: Bạc (`#b3b3b3`)
- Nhấn: Spotify Green (`#1ed760`)
- Viền: `#4d4d4d`
- Lỗi: Đỏ Âm (`#f3727f`)

### Ví Dụ Prompt Thành Phần
- "Create a dark card: #181818 background, 8px radius. Title at 16px SpotifyMixUI weight 700, white text. Subtitle at 14px weight 400, #b3b3b3. Shadow rgba(0,0,0,0.3) 0px 8px 8px on hover."
- "Design a pill button: #1f1f1f background, white text, 9999px radius, 8px 16px padding. 14px SpotifyMixUI weight 700, uppercase, letter-spacing 1.4px."
- "Build a circular play button: Spotify Green (#1ed760) background, #000000 icon, 50% radius, 12px padding."
- "Create search input: #1f1f1f background, white text, 500px radius, 12px 48px padding. Inset border: rgb(124,124,124) 0px 0px 0px 1px inset."
- "Design navigation sidebar: #121212 background. Active items: 14px weight 700, white. Inactive: 14px weight 400, #b3b3b3."

### Hướng Dẫn Lặp
1. Bắt đầu với #121212 — mọi thứ tồn tại trong bóng tối gần đen
2. Spotify Green chỉ cho điểm nhấn chức năng (phát, hoạt động, CTA)
3. Viên thuốc hóa mọi thứ — 500px cho lớn, 9999px cho nhỏ, 50% cho hình tròn
4. Chữ hoa + tracking rộng trên nút — giọng điệu nhãn có hệ thống
5. Đổ bóng nặng (độ mờ 0.3–0.5) cho độ nổi — đổ bóng nhẹ vô hình trên nền tối
6. Ảnh bìa album cung cấp tất cả màu sắc — giao diện luôn không có màu sắc
