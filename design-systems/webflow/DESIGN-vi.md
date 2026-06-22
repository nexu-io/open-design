# Hệ thống thiết kế lấy cảm hứng từ Webflow

> Category: Thiết kế & Sáng tạo
> Trình tạo web trực quan. Thẩm mỹ trang marketing bóng bẩy với điểm nhấn màu xanh.

## 1. Chủ đề hình ảnh & Bầu không khí

Trang web của Webflow là một nền tảng giàu hình ảnh và hướng đến công cụ, truyền đạt "thiết kế không cần code" qua các bề mặt trắng sạch, màu xanh đặc trưng Webflow（`#146ef5`）và bảng màu phụ phong phú（tím, hồng, xanh lá, cam, vàng, đỏ）. Font chữ tùy chỉnh WF Visual Sans Variable tạo nên hệ thống chữ viết tự tin, chính xác với độ đậm 600 cho tiêu đề hiển thị và 500 cho nội dung.

**Đặc điểm chính：**
- Canvas trắng với văn bản gần đen（`#080808`）
- Xanh Webflow（`#146ef5`）là màu thương hiệu chính và màu tương tác
- WF Visual Sans Variable — font biến thiên tùy chỉnh với độ đậm 500–600
- Bảng màu phụ phong phú：tím `#7a3dff`, hồng `#ed52cb`, xanh lá `#00d722`, cam `#ff6b00`, vàng `#ffae13`, đỏ `#ee1d36`
- Bán kính viền bảo thủ 4px–8px — sắc nét, không bo tròn
- Ngăn xếp bóng đổ nhiều lớp（5 lớp bóng đổ xếp tầng）
- Nhãn chữ hoa：10px–15px, độ đậm 500–600, khoảng cách chữ rộng（0,6px–1,5px）
- Hoạt ảnh translate(6px) khi di chuột qua nút

## 2. Bảng màu & Vai trò

### Màu chính
- **Gần đen**（`#080808`）：Văn bản chính
- **Xanh Webflow**（`#146ef5`）：`--_color---primary--webflow-blue`, CTA chính và liên kết
- **Xanh 400**（`#3b89ff`）：`--_color---primary--blue-400`, xanh tương tác sáng hơn
- **Xanh 300**（`#006acc`）：`--_color---blue-300`, biến thể xanh tối hơn
- **Xanh hover nút**（`#0055d4`）：`--mkto-embed-color-button-hover`

### Màu nhấn phụ
- **Tím**（`#7a3dff`）：`--_color---secondary--purple`
- **Hồng**（`#ed52cb`）：`--_color---secondary--pink`
- **Xanh lá**（`#00d722`）：`--_color---secondary--green`
- **Cam**（`#ff6b00`）：`--_color---secondary--orange`
- **Vàng**（`#ffae13`）：`--_color---secondary--yellow`
- **Đỏ**（`#ee1d36`）：`--_color---secondary--red`

### Trung tính
- **Xám 800**（`#222222`）：Văn bản phụ tối
- **Xám 700**（`#363636`）：Văn bản trung
- **Xám 300**（`#ababab`）：Văn bản mờ, trình giữ chỗ
- **Xám trung**（`#5a5a5a`）：Văn bản liên kết
- **Xám viền**（`#d8d8d8`）：Viền, đường phân cách
- **Viền hover**（`#898989`）：Viền khi di chuột

### Bóng đổ
- **Xếp tầng 5 lớp**：`rgba(0,0,0,0) 0px 84px 24px, rgba(0,0,0,0.01) 0px 54px 22px, rgba(0,0,0,0.04) 0px 30px 18px, rgba(0,0,0,0.08) 0px 13px 13px, rgba(0,0,0,0.09) 0px 3px 7px`

## 3. Quy tắc typography

### Font：`WF Visual Sans Variable`, dự phòng：`Arial`

| Vai trò | Kích thước | Độ đậm | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|------|------|--------|-------------|----------------|-------|
| Hero hiển thị | 80px | 600 | 1,04 | -0,8px | |
| Tiêu đề phần | 56px | 600 | 1,04 | normal | |
| Tiêu đề phụ | 32px | 500 | 1,30 | normal | |
| Tiêu đề tính năng | 24px | 500–600 | 1,30 | normal | |
| Nội dung | 20px | 400–500 | 1,40–1,50 | normal | |
| Nội dung chuẩn | 16px | 400–500 | 1,60 | -0,16px | |
| Nút | 16px | 500 | 1,60 | -0,16px | |
| Nhãn chữ hoa | 15px | 500 | 1,30 | 1,5px | uppercase |
| Chú thích | 14px | 400–500 | 1,40–1,60 | normal | |
| Huy hiệu chữ hoa | 12,8px | 550 | 1,20 | normal | uppercase |
| Chữ hoa nhỏ | 10px | 500–600 | 1,30 | 1px | uppercase |
| Code：Inconsolata（font monospace đi kèm）

## 4. Kiểu dáng thành phần

### Nút
- Trong suốt：văn bản `#080808`, translate(6px) khi di chuột
- Vòng tròn trắng：bán kính 50%, nền trắng
- Huy hiệu xanh：nền `#146ef5`, bán kính 4px, độ đậm 550

### Thẻ：`1px solid #d8d8d8`, bán kính 4px–8px
### Huy hiệu：nền màu xanh nhạt 10% độ mờ, bán kính 4px

## 5. Bố cục
- Khoảng cách：thang phân số（1px, 2,4px, 3,2px, 4px, 5,6px, 6px, 7,2px, 8px, 9,6px, 12px, 16px, 24px）
- Bán kính：2px, 4px, 8px, 50% — bảo thủ, sắc nét
- Điểm ngắt：479px, 768px, 992px

## 6. Độ sâu：hệ thống bóng đổ xếp tầng 5 lớp

## 7. Nên làm và không nên làm
- Nên：Dùng WF Visual Sans Variable với độ đậm 500–600. Xanh（`#146ef5`）cho CTA. Bán kính 4px. translate(6px) khi di chuột.
- Không nên：Bo tròn các phần tử chức năng quá 8px. Dùng màu phụ trên CTA chính.

## 8. Responsive：479px, 768px, 992px

## 9. Hướng dẫn prompt cho Agent
- Văn bản：Gần đen（`#080808`）
- CTA：Xanh Webflow（`#146ef5`）
- Nền：Trắng（`#ffffff`）
- Viền：`#d8d8d8`
- Phụ：Tím `#7a3dff`, Hồng `#ed52cb`, Xanh lá `#00d722`
