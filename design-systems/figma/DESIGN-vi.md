# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ Figma

> Category: Thiết kế & Sáng tạo
> Công cụ thiết kế cộng tác. Đa sắc màu rực rỡ, vui tươi nhưng vẫn chuyên nghiệp.

## 1. Chủ Đề Hình Ảnh & Bầu Không Khí

Giao diện của Figma là công cụ thiết kế tự thiết kế chính mình — một kiệt tác về sự tinh tế typography, nơi một variable font tùy chỉnh (figmaSans) biến đổi linh hoạt từ cực mỏng (weight 320) đến đậm (weight 700) với các điểm dừng trung gian bất thường (330, 340, 450, 480, 540) mà hầu hết các hệ thống font chưa bao giờ khai thác. Khả năng kiểm soát weight chi tiết này mang lại cho mỗi phần tử văn bản một trọng lượng thị giác được hiệu chỉnh chính xác, tạo ra phân cấp thông qua những khác biệt vi mô thay vì công cụ thô sơ "thường vs đậm".

Trang này mang một sự đối lập thú vị: phần chrome giao diện hoàn toàn đen-trắng (chỉ nhận thấy đúng `#000000` và `#ffffff` là màu sắc), trong khi phần hero và các khu vực giới thiệu sản phẩm bùng nổ với các dải gradient đa sắc rực rỡ — xanh lá điện, vàng tươi, tím sâu, hồng nóng. Sự tách biệt này có nghĩa là bản thân hệ thống thiết kế không có màu, coi đầu ra đầy màu sắc của sản phẩm là nội dung trọng tâm. Trang marketing của Figma về bản chất là một bức tường phòng triển lãm màu trắng trưng bày những tác phẩm nghệ thuật đầy màu sắc.

Điều làm Figma trở nên đặc biệt ngoài variable font còn là hình học hình tròn và pill. Các nút sử dụng bán kính 50px (pill) hoặc 50% (hình tròn hoàn hảo cho icon button), tạo ra cảm giác hữu cơ giống như bảng công cụ. Chỉ báo focus dạng đường nét đứt (`dashed 2px`) là một lựa chọn thiết kế có chủ đích, gợi lại các handle lựa chọn trong trình soạn thảo Figma — ngôn ngữ UI của website tham chiếu đến ngôn ngữ UI của sản phẩm.

**Đặc Điểm Nổi Bật:**
- Variable font tùy chỉnh (figmaSans) với các điểm dừng weight bất thường: 320, 330, 340, 450, 480, 540, 700
- Chrome giao diện hoàn toàn đen-trắng — màu sắc chỉ tồn tại trong nội dung sản phẩm
- figmaMono cho các nhãn kỹ thuật chữ in hoa với khoảng cách chữ rộng
- Hình học nút pill (50px) và tròn (50%)
- Đường viền focus nét đứt gợi lên các handle lựa chọn của trình soạn thảo Figma
- Gradient hero đa sắc rực rỡ (xanh lá, vàng, tím, hồng)
- Tính năng OpenType `"kern"` được bật toàn cục
- Letter-spacing âm xuyên suốt — ngay cả body text cũng ở mức -0.14px đến -0.26px

## 2. Bảng Màu & Vai Trò

### Màu Chính
- **Đen Thuần** (`#000000`): Tất cả văn bản, tất cả nút đặc, tất cả viền. "Màu sắc" duy nhất của giao diện.
- **Trắng Thuần** (`#ffffff`): Tất cả nền, nút trắng, văn bản trên bề mặt tối. Nửa còn lại của cặp nhị phân.

*Lưu ý: Trang marketing của Figma CHỈ sử dụng hai màu này cho lớp giao diện. Tất cả màu rực rỡ chỉ xuất hiện trong ảnh chụp màn hình sản phẩm, gradient hero và nội dung nhúng.*

### Bề Mặt & Nền
- **Trắng Thuần** (`#ffffff`): Nền trang chính và bề mặt thẻ.
- **Đen Kính** (`rgba(0, 0, 0, 0.08)`): Lớp phủ tối tinh tế cho các nút tròn phụ và hiệu ứng kính.
- **Trắng Kính** (`rgba(255, 255, 255, 0.16)`): Lớp phủ kính mờ cho các nút trên bề mặt tối/màu sắc.

### Hệ Thống Gradient
- **Gradient Hero**: Gradient đa điểm dừng rực rỡ sử dụng xanh lá điện, vàng tươi, tím sâu và hồng nóng. Gradient này là chữ ký thị giác của phần hero — nó đại diện cho những khả năng sáng tạo của công cụ.
- **Gradient Khu Vực Sản Phẩm**: Các khu vực sản phẩm riêng lẻ (Design, Dev Mode, Prototyping) có thể sử dụng chủ đề màu riêng biệt trong phần giới thiệu của chúng.

## 3. Quy Tắc Typography

### Họ Font
- **Chính**: `figmaSans`, với fallback: `figmaSans Fallback, SF Pro Display, system-ui, helvetica`
- **Monospace / Nhãn**: `figmaMono`, với fallback: `figmaMono Fallback, SF Mono, menlo`

### Phân Cấp

| Vai Trò | Font | Kích Thước | Weight | Line Height | Letter Spacing | Ghi Chú |
|---------|------|------------|--------|-------------|----------------|---------|
| Display / Hero | figmaSans | 86px (5.38rem) | 400 | 1.00 (chặt) | -1.72px | Tác động tối đa, tracking cực mạnh |
| Tiêu đề Section | figmaSans | 64px (4rem) | 400 | 1.10 (chặt) | -0.96px | Tiêu đề section tính năng |
| Tiêu đề phụ | figmaSans | 26px (1.63rem) | 540 | 1.35 | -0.26px | Văn bản section nhấn mạnh |
| Tiêu đề phụ nhẹ | figmaSans | 26px (1.63rem) | 340 | 1.35 | -0.26px | Văn bản section weight nhẹ |
| Tiêu đề Tính Năng | figmaSans | 24px (1.5rem) | 700 | 1.45 | normal | Tiêu đề thẻ đậm |
| Body Lớn | figmaSans | 20px (1.25rem) | 330–450 | 1.30–1.40 | -0.1px to -0.14px | Mô tả, giới thiệu |
| Body / Nút | figmaSans | 16px (1rem) | 330–400 | 1.40–1.45 | -0.14px to normal | Body chuẩn, nav, nút |
| Body Nhẹ | figmaSans | 18px (1.13rem) | 320 | 1.45 | -0.26px to normal | Văn bản body weight nhẹ |
| Nhãn Mono | figmaMono | 18px (1.13rem) | 400 | 1.30 (chặt) | 0.54px | Nhãn section chữ in hoa |
| Mono Nhỏ | figmaMono | 12px (0.75rem) | 400 | 1.00 (chặt) | 0.6px | Thẻ nhỏ chữ in hoa |

### Nguyên Tắc
- **Độ chính xác variable font**: figmaSans sử dụng các weight mà hầu hết hệ thống chưa bao giờ chạm đến — 320, 330, 340, 450, 480, 540. Điều này tạo ra phân cấp thông qua sự khác biệt weight tinh tế thay vì những bước nhảy kịch tính. Sự khác biệt giữa 330 và 340 gần như không thể nhận ra nhưng lại có ý nghĩa cấu trúc.
- **Nhẹ là nền tảng**: Hầu hết body text sử dụng 320–340 (nhẹ hơn mức "thường" 400 thông thường), tạo ra trải nghiệm đọc thanh thoát, nhẹ nhàng phù hợp với thẩm mỹ công cụ thiết kế.
- **Kern ở mọi nơi**: Mọi phần tử văn bản đều bật tính năng OpenType `"kern"` — kerning không phải tùy chọn, đó là yếu tố cấu trúc.
- **Tracking âm mặc định**: Ngay cả body text cũng sử dụng letter-spacing -0.1px đến -0.26px, tạo ra văn bản chặt chẽ phổ quát. Văn bản display nén thêm xuống -0.96px và -1.72px.
- **Mono cho cấu trúc**: figmaMono chữ in hoa với letter-spacing dương (0.54px–0.6px) tạo ra các nhãn biển báo kỹ thuật.

## 4. Kiểu Dáng Thành Phần

### Nút

**Đặc Đen (Pill)**
- Nền: Đen Thuần (`#000000`)
- Chữ: Trắng Thuần (`#ffffff`)
- Bán kính: tròn (50%) cho icon button
- Focus: đường viền nét đứt 2px
- Nhấn mạnh tối đa

**Pill Trắng**
- Nền: Trắng Thuần (`#ffffff`)
- Chữ: Đen Thuần (`#000000`)
- Padding: 8px 18px 10px (bất đối xứng theo chiều dọc)
- Bán kính: pill (50px)
- Focus: đường viền nét đứt 2px
- CTA chuẩn trên bề mặt tối/màu sắc

**Kính Tối**
- Nền: `rgba(0, 0, 0, 0.08)` (lớp phủ tối tinh tế)
- Chữ: Đen Thuần
- Bán kính: tròn (50%)
- Focus: đường viền nét đứt 2px
- Hành động phụ trên bề mặt sáng

**Kính Sáng**
- Nền: `rgba(255, 255, 255, 0.16)` (kính mờ)
- Chữ: Trắng Thuần
- Bán kính: tròn (50%)
- Focus: đường viền nét đứt 2px
- Hành động phụ trên bề mặt tối/màu sắc

### Thẻ & Container
- Nền: Trắng Thuần
- Viền: không có hoặc tối thiểu
- Bán kính: 6px (container nhỏ), 8px (hình ảnh, thẻ, dialog)
- Bóng: hiệu ứng elevation tinh tế đến vừa phải
- Ảnh chụp màn hình sản phẩm làm nội dung thẻ

### Điều Hướng
- Nav ngang gọn gàng trên nền trắng
- Logo: wordmark Figma màu đen
- Tab sản phẩm: điều hướng tab hình pill (50px)
- Liên kết: chữ đen, trang trí gạch chân 1px
- CTA: nút pill đen
- Hover: màu chữ qua biến CSS

### Thành Phần Đặc Trưng

**Thanh Tab Sản Phẩm**
- Các tab hình pill ngang (bán kính 50px)
- Mỗi tab đại diện cho một khu vực sản phẩm Figma (Design, Dev Mode, Prototyping, v.v.)
- Tab đang hoạt động được làm nổi bật

**Phần Gradient Hero**
- Nền gradient đa sắc toàn chiều rộng
- Chữ trắng chồng lên với tiêu đề display 86px
- Ảnh chụp màn hình sản phẩm nổi trong gradient

**Chỉ Báo Focus Nét Đứt**
- Tất cả phần tử tương tác sử dụng đường viền `dashed 2px` khi focus
- Tham chiếu đến các handle lựa chọn trong trình soạn thảo Figma
- Một lựa chọn meta-design kết nối website và sản phẩm

## 5. Nguyên Tắc Bố Cục

### Hệ Thống Khoảng Cách
- Đơn vị cơ bản: 8px
- Thang: 1px, 2px, 4px, 4.5px, 8px, 10px, 12px, 16px, 18px, 24px, 32px, 40px, 46px, 48px, 50px

### Grid & Container
- Chiều rộng container tối đa: lên đến 1920px
- Hero: gradient toàn chiều rộng với nội dung căn giữa
- Khu vực sản phẩm: trình bày xen kẽ
- Footer: phần toàn chiều rộng tối màu
- Responsive từ 559px đến 1920px

### Triết Lý Khoảng Trắng
- **Nhịp độ kiểu phòng trưng bày**: Khoảng cách rộng rãi giúp mỗi khu vực sản phẩm thở như một triển lãm riêng biệt.
- **Khu vực màu sắc như hơi thở thị giác**: Gradient hero và các phần giới thiệu sản phẩm cung cấp sự giải phóng màu sắc giữa các khu vực giao diện đơn sắc.

### Thang Bán Kính Viền
- Tối thiểu (2px): Phần tử liên kết nhỏ
- Tinh tế (6px): Container nhỏ, divider
- Thoải mái (8px): Thẻ, hình ảnh, dialog
- Pill (50px): Nút tab, CTA
- Tròn (50%): Icon button, phần tử hình tròn

## 6. Chiều Sâu & Elevation

| Cấp | Xử Lý | Sử Dụng |
|-----|--------|---------|
| Phẳng (Level 0) | Không bóng | Nền trang, hầu hết văn bản |
| Bề mặt (Level 1) | Thẻ trắng trên section gradient/tối | Thẻ, giới thiệu sản phẩm |
| Nổi cao (Level 2) | Bóng tinh tế | Thẻ nổi, trạng thái hover |

**Triết Lý Bóng**: Figma sử dụng bóng một cách tiết kiệm. Cơ chế chiều sâu chính là **độ tương phản nền** (nội dung trắng trên các section màu sắc/tối) và tính chiều sâu vốn có của các ảnh chụp màn hình sản phẩm.

## 7. Nên và Không Nên

### Nên
- Sử dụng figmaSans với các weight variable chính xác (320–540) — khả năng kiểm soát weight chi tiết CHÍNH LÀ thiết kế
- Giữ giao diện hoàn toàn đen-trắng — màu sắc chỉ đến từ nội dung sản phẩm
- Sử dụng hình học pill (50px) và tròn (50%) cho tất cả phần tử tương tác
- Áp dụng đường viền focus nét đứt 2px — mẫu accessibility đặc trưng
- Bật tính năng `"kern"` trên tất cả văn bản
- Sử dụng figmaMono chữ in hoa với letter-spacing dương cho nhãn
- Áp dụng letter-spacing âm xuyên suốt (-0.1px đến -1.72px)

### Không Nên
- Không thêm màu sắc vào giao diện — bảng màu đơn sắc là tuyệt đối
- Không sử dụng các weight font chuẩn (400, 500, 600, 700) — sử dụng các điểm dừng độc đáo của variable font (320, 330, 340, 450, 480, 540)
- Không dùng góc vuông sắc cho nút — chỉ hình học pill và tròn
- Không dùng đường viền focus đặc — nét đứt là đặc trưng
- Không tăng weight font body trên 450 — thẩm mỹ weight nhẹ là cốt lõi
- Không dùng letter-spacing dương cho body text — luôn luôn âm

## 8. Hành Vi Responsive

### Breakpoint
| Tên | Chiều Rộng | Thay Đổi Chính |
|-----|-----------|----------------|
| Mobile Nhỏ | <560px | Bố cục compact, xếp chồng |
| Tablet | 560–768px | Điều chỉnh nhỏ |
| Desktop Nhỏ | 768–960px | Bố cục 2 cột |
| Desktop | 960–1280px | Bố cục chuẩn |
| Desktop Lớn | 1280–1440px | Mở rộng |
| Siêu rộng | 1440–1920px | Chiều rộng tối đa |

### Chiến Lược Thu Gọn
- Văn bản hero: 86px → 64px → 48px
- Tab sản phẩm: cuộn ngang trên mobile
- Khu vực tính năng: một cột xếp chồng
- Footer: nhiều cột → xếp chồng

## 9. Hướng Dẫn Prompt cho Agent

### Tham Chiếu Màu Nhanh
- Tất cả mọi thứ: "Đen Thuần (#000000)" và "Trắng Thuần (#ffffff)"
- Kính Tối: "rgba(0, 0, 0, 0.08)"
- Kính Sáng: "rgba(255, 255, 255, 0.16)"

### Ví Dụ Prompt Thành Phần
- "Tạo một hero trên gradient đa sắc rực rỡ (xanh lá, vàng, tím, hồng). Tiêu đề ở 86px figmaSans weight 400, line-height 1.0, letter-spacing -1.72px. Chữ trắng. Nút CTA pill trắng (bán kính 50px, padding 8px 18px)."
- "Thiết kế thanh tab sản phẩm với nút hình pill (bán kính 50px). Đang hoạt động: nền đen, chữ trắng. Không hoạt động: trong suốt, chữ đen. figmaSans ở 20px weight 480."
- "Xây dựng nhãn section: figmaMono 18px, chữ in hoa, letter-spacing 0.54px, chữ đen. Kern bật."
- "Tạo body text ở 20px figmaSans weight 330, line-height 1.40, letter-spacing -0.14px. Đen Thuần trên nền trắng."

### Hướng Dẫn Lặp
1. Sử dụng các điểm dừng weight variable font chính xác: 320, 330, 340, 450, 480, 540, 700
2. Giao diện luôn là đen + trắng — không bao giờ thêm màu vào chrome
3. Đường viền focus nét đứt, không phải đặc
4. Letter-spacing luôn âm trên body, luôn dương trên nhãn mono
5. Pill (50px) cho nút/tab, tròn (50%) cho icon button
