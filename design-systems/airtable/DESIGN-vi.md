# Hệ thống thiết kế lấy cảm hứng từ Airtable

> Category: Thiết kế & Sáng tạo
> Kết hợp giữa bảng tính và cơ sở dữ liệu. Thẩm mỹ dữ liệu có cấu trúc: đầy màu sắc, thân thiện.

## 1. Chủ đề hình ảnh & Bầu không khí

Trang web của Airtable là một nền tảng sạch sẽ, thân thiện với doanh nghiệp, truyền tải cảm giác "đơn giản tinh tế" qua nền trắng với văn bản xanh navy đậm (`#181d26`) và Airtable Blue (`#1b61c9`) làm màu nhấn tương tác chính. Họ font Haas (biến thể display + text) tạo nên hệ thống typography chính xác theo phong cách Thụy Sĩ với khoảng cách chữ dương xuyên suốt.

**Đặc điểm chính:**
- Nền trắng với văn bản xanh navy đậm (`#181d26`)
- Airtable Blue (`#1b61c9`) là màu CTA và liên kết chính
- Hệ thống font kép Haas + Haas Groot Disp
- Khoảng cách chữ dương trong văn bản thân (0.08px–0.28px)
- Nút bo tròn 12px, thẻ 16px–32px
- Bóng đổ nhiều lớp màu xanh: `rgba(45,127,249,0.28) 0px 1px 3px`
- Token theme ngữ nghĩa: cách đặt tên biến CSS `--theme_*`

## 2. Bảng màu & Vai trò

### Chính
- **Xanh navy đậm** (`#181d26`): Văn bản chính
- **Airtable Blue** (`#1b61c9`): Nút CTA, liên kết
- **Trắng** (`#ffffff`): Bề mặt chính
- **Spotlight** (`rgba(249,252,255,0.97)`): `--theme_button-text-spotlight`

### Ngữ nghĩa
- **Xanh lá thành công** (`#006400`): `--theme_success-text`
- **Văn bản yếu** (`rgba(4,14,32,0.69)`): `--theme_text-weak`
- **Phụ đang hoạt động** (`rgba(7,12,20,0.82)`): `--theme_button-text-secondary-active`

### Trung tính
- **Xám đậm** (`#333333`): Văn bản phụ
- **Xanh trung** (`#254fad`): Biến thể xanh cho liên kết/nhấn
- **Viền** (`#e0e2e6`): Viền thẻ
- **Bề mặt sáng** (`#f8fafc`): Bề mặt tinh tế

### Bóng đổ
- **Tông xanh** (`rgba(0,0,0,0.32) 0px 0px 1px, rgba(0,0,0,0.08) 0px 0px 2px, rgba(45,127,249,0.28) 0px 1px 3px, rgba(0,0,0,0.06) 0px 0px 0px 0.5px inset`)
- **Mềm** (`rgba(15,48,106,0.05) 0px 0px 20px`)

## 3. Quy tắc typography

### Họ font
- **Chính**: `Haas`, dự phòng: `-apple-system, system-ui, Segoe UI, Roboto`
- **Display**: `Haas Groot Disp`, dự phòng: `Haas`

### Phân cấp

| Vai trò | Font | Kích thước | Độ đậm | Chiều cao dòng | Khoảng cách chữ |
|------|------|------|--------|-------------|----------------|
| Display Hero | Haas | 48px | 400 | 1.15 | normal |
| Display Đậm | Haas Groot Disp | 48px | 900 | 1.50 | normal |
| Tiêu đề phần | Haas | 40px | 400 | 1.25 | normal |
| Tiêu đề phụ | Haas | 32px | 400–500 | 1.15–1.25 | normal |
| Tiêu đề thẻ | Haas | 24px | 400 | 1.20–1.30 | 0.12px |
| Tính năng | Haas | 20px | 400 | 1.25–1.50 | 0.1px |
| Thân | Haas | 18px | 400 | 1.35 | 0.18px |
| Thân vừa | Haas | 16px | 500 | 1.30 | 0.08–0.16px |
| Nút | Haas | 16px | 500 | 1.25–1.30 | 0.08px |
| Chú thích | Haas | 14px | 400–500 | 1.25–1.35 | 0.07–0.28px |

## 4. Kiểu dáng thành phần

### Nút
- **Xanh chính**: `#1b61c9`, chữ trắng, padding 16px 24px, bo tròn 12px
- **Trắng**: nền trắng, chữ `#181d26`, bo tròn 12px, viền trắng 1px
- **Đồng ý cookie**: nền `#1b61c9`, bo tròn 2px (sắc nét)

### Thẻ: `1px solid #e0e2e6`, bo tròn 16px–24px
### Ô nhập liệu: Kiểu Haas tiêu chuẩn

## 5. Bố cục
- Khoảng cách: 1–48px (cơ sở 8px)
- Bo tròn: 2px (nhỏ), 12px (nút), 16px (thẻ), 24px (phần), 32px (lớn), 50% (tròn)

## 6. Chiều sâu
- Hệ thống bóng đổ nhiều lớp tông xanh
- Ánh sáng môi trường mềm: `rgba(15,48,106,0.05) 0px 0px 20px`

## 7. Nên làm và không nên làm
### Nên: Dùng Airtable Blue cho CTA, Haas với tracking dương, nút bo tròn 12px
### Không nên: Bỏ qua khoảng cách chữ dương, dùng bóng đổ nặng

## 8. Hành vi responsive
Breakpoint: 425–1664px (23 breakpoint)

## 9. Hướng dẫn prompt cho Agent
- Văn bản: Xanh navy đậm (`#181d26`)
- CTA: Airtable Blue (`#1b61c9`)
- Nền: Trắng (`#ffffff`)
- Viền: `#e0e2e6`
