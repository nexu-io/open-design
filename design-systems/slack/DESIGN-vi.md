# Hệ Thống Thiết Kế Lấy Cảm Hứng Từ Slack

> Category: Năng Suất & SaaS
> Nền tảng giao tiếp nơi làm việc. Màu chủ đạo aubergine, bảng màu logo đa nhấn, bề mặt sáng với thanh bên tối, ấm áp và thân thiện.

## 1. Chủ Đề Trực Quan & Bầu Không Khí

Nhận diện của Slack được xây dựng xung quanh ý tưởng rằng công việc nên cảm thấy mang tính con người và thậm chí đôi chút thú vị. Bề mặt chuẩn là **sáng** — vùng nội dung trắng với thanh bên aubergine đậm (`#4A154B`) — đối lập với các công cụ ưu tiên tối. Sự tương phản này là cố ý: thanh bên là neo điều hướng bình tĩnh, luôn hiện diện, trong khi vùng nội dung sáng và rộng mở.

Bảng màu logo — xanh dương, xanh lá, vàng, đỏ — chủ yếu xuất hiện trong biểu tượng hashtag và các bối cảnh marketing, không rải rác khắp giao diện. Trong sản phẩm thực tế, Slack sử dụng hệ thống màu sắc tiết chế, chuyên nghiệp với aubergine là neo thương hiệu duy nhất.

**Đặc Điểm Chính:**
- Bề mặt nội dung ưu tiên sáng: trắng `#FFFFFF` và gần trắng `#F8F8F8`
- Thanh bên aubergine đậm `#4A154B` — yếu tố giao diện dễ nhận ra nhất của thương hiệu
- Bốn màu nhấn logo (xanh dương, xanh lá, vàng, đỏ) được dùng tiết kiệm chỉ làm điểm nhấn
- Larsseit cho tiêu đề (marketing), sans-serif hệ thống cho giao diện
- Bo góc nhưng không hoạt hình: bán kính 4–8px trên hầu hết các thành phần
- Dày đặc nhưng có không gian thở: hàng tin nhắn gọn với phân cấp luồng rõ ràng
- Giọng điệu ấm áp và hội thoại — emoji, phản ứng và hình minh họa là nội dung hạng nhất

---

## 2. Bảng Màu & Vai Trò

### Màu Thương Hiệu Chính
| Token | Hex | Vai Trò |
|---|---|---|
| `--color-aubergine` | `#4A154B` | Nền thanh bên, màu thương hiệu chính |
| `--color-aubergine-dark` | `#350d36` | Trạng thái hover trên bề mặt aubergine |
| `--color-aubergine-light` | `#611f69` | Đánh dấu mục đang hoạt động trong thanh bên |

### Màu Nhấn Logo (dùng tiết kiệm — chỉ cho điểm nhấn, biểu tượng, marketing)
| Token | Hex | Tên | Vai Trò |
|---|---|---|---|
| `--color-blue` | `#36C5F0` | Xanh Trời | Biểu tượng kênh, liên kết, trạng thái thông tin |
| `--color-green` | `#2EB67D` | Xanh Lục | Trạng thái trực tuyến, trạng thái thành công |
| `--color-yellow` | `#ECB22E` | Vàng | Trạng thái vắng mặt, cảnh báo, điểm nhấn |
| `--color-red` | `#E01E5A` | Đỏ Ruby | Thông báo, lỗi, huy hiệu đề cập |

### Bề Mặt & Nền
| Token | Hex | Vai Trò |
|---|---|---|
| `--bg-primary` | `#FFFFFF` | Vùng tin nhắn chính, hộp thoại |
| `--bg-secondary` | `#F8F8F8` | Bảng luồng, bề mặt phụ |
| `--bg-tertiary` | `#F1F1F1` | Nền đầu vào, trạng thái hover |
| `--bg-sidebar` | `#4A154B` | Thanh bên trái (aubergine) |
| `--bg-sidebar-hover` | `rgba(255,255,255,0.1)` | Hover mục thanh bên |
| `--bg-sidebar-active` | `rgba(255,255,255,0.2)` | Mục thanh bên đang hoạt động |
| `--bg-message-hover` | `#F8F8F8` | Hover hàng tin nhắn |

### Màu Văn Bản
| Token | Hex | Vai Trò |
|---|---|---|
| `--text-primary` | `#1D1C1D` | Văn bản nội dung chính (gần đen) |
| `--text-secondary` | `#616061` | Dấu thời gian, nhãn mờ |
| `--text-sidebar` | `rgba(255,255,255,0.9)` | Tên kênh trong thanh bên |
| `--text-sidebar-muted` | `rgba(255,255,255,0.6)` | Mục không hoạt động trong thanh bên |
| `--text-link` | `#1264A3` | Liên kết nội tuyến trong tin nhắn |
| `--text-mention` | `#1264A3` | Màu văn bản @đề cập |

### Màu Ngữ Nghĩa
| Token | Hex | Vai Trò |
|---|---|---|
| `--color-success` | `#2EB67D` | Thông báo thành công, trạng thái tích cực |
| `--color-warning` | `#ECB22E` | Trạng thái cảnh báo |
| `--color-danger` | `#E01E5A` | Trạng thái lỗi, hành động phá hủy |
| `--color-info` | `#36C5F0` | Điểm nhấn thông tin |

### Đường Viền & Phân Cách
| Token | Hex | Vai Trò |
|---|---|---|
| `--border-default` | `#DDDDDD` | Phân cách chuẩn, viền thẻ |
| `--border-subtle` | `#F1F1F1` | Phân cách nhẹ giữa các hàng |
| `--border-focus` | `#1264A3` | Màu vòng focus |

---

## 3. Quy Tắc Chữ

### Phông Chữ
| Vai Trò | Chính Thức | Dự Phòng Web |
|---|---|---|
| Tiêu Đề Hiển Thị / Marketing | Larsseit | `'Larsseit', 'Helvetica Neue', Arial, sans-serif` |
| Giao Diện / Nội Dung / Chrome | Slack Lato (tùy chỉnh) | `system-ui, -apple-system, BlinkMacSystemFont, sans-serif` |
| Code / Monospace | — | `'Monaco', 'Menlo', 'Courier New', monospace` |

> Slack sử dụng **Larsseit** cho tiêu đề marketing và biến thể Lato tùy chỉnh cho giao diện trong sản phẩm. Khi dùng trên web, `system-ui` là dự phòng an toàn nhất.

### Thang Chữ

| Cấp Độ | Kích Thước | Độ Đậm | Chiều Cao Dòng | Khoảng Cách Chữ | Sử Dụng |
|---|---|---|---|---|---|
| Hiển Thị XL | 48px | 800 | 1.1 | -1px | Tiêu đề hero marketing |
| Hiển Thị L | 36px | 700 | 1.15 | -0.5px | Hero phần |
| Tiêu Đề 1 | 28px | 700 | 1.25 | normal | Tiêu đề hộp thoại, header trang |
| Tiêu Đề 2 | 22px | 700 | 1.3 | normal | Tiêu đề thẻ, phần cài đặt |
| Tiêu Đề 3 | 18px | 700 | 1.35 | normal | Header tiểu mục |
| Nội Dung L | 16px | 400 | 1.5 | normal | Văn bản tin nhắn, mô tả |
| Nội Dung | 15px | 400 | 1.46667 | normal | Văn bản giao diện mặc định (kích thước cơ sở của Slack) |
| Nội Dung SM | 13px | 400 | 1.38462 | normal | Siêu dữ liệu phụ |
| Chú Thích | 12px | 400 | 1.33 | normal | Dấu thời gian, gợi ý |
| Code | 12px | 400 | 1.5 | normal | Code nội tuyến, khối code |

### Quy Tắc Chữ
- Kích thước nội dung cơ sở của Slack là **15px** — nhỏ hơn một chút so với 16px để tăng mật độ
- Kênh chưa đọc: độ đậm 700 — in đậm là chỉ báo chưa đọc chính
- Dấu thời gian: 12px `--text-secondary`, chỉ hiển thị khi hover
- Khối code: nền `#F8F8F8`, viền `1px solid #DDDDDD`, border-radius 4px
- Không bao giờ sử dụng cỡ chữ dưới 12px
- Tiêu đề marketing: letter-spacing `-1px` cho kích thước hiển thị lớn

---

## 4. Kiểu Dáng Thành Phần

### Nút

```css
/* Primary */
.btn-primary {
  background: #4A154B;
  color: #FFFFFF;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
  border: none;
}
.btn-primary:hover { background: #611f69; }

/* Secondary */
.btn-secondary {
  background: #FFFFFF;
  color: #1D1C1D;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  padding: 0 16px;
  height: 36px;
  font-size: 15px;
  font-weight: 700;
}
.btn-secondary:hover { background: #F8F8F8; }

/* Danger */
.btn-danger {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 4px;
}
.btn-danger:hover { background: #B3114A; }
```

### Trường Đầu Vào
```css
.input {
  background: #FFFFFF;
  border: 1px solid #DDDDDD;
  border-radius: 4px;
  color: #1D1C1D;
  font-size: 15px;
  padding: 8px 12px;
  height: 36px;
}
.input:focus {
  border-color: #1264A3;
  box-shadow: 0 0 0 2px rgba(18,100,163,0.25);
  outline: none;
}
```

### Mục Kênh Trong Thanh Bên
```css
.channel-item {
  height: 28px;
  padding: 0 16px;
  border-radius: 6px;
  color: rgba(255,255,255,0.7);
  font-size: 15px;
  font-weight: 400;
}
.channel-item:hover {
  background: rgba(255,255,255,0.1);
  color: #FFFFFF;
}
.channel-item.active {
  background: rgba(255,255,255,0.2);
  color: #FFFFFF;
}
.channel-item.unread {
  color: #FFFFFF;
  font-weight: 700;
}
```

### Huy Hiệu Chưa Đọc
```css
.badge {
  background: #E01E5A;
  color: #FFFFFF;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  padding: 1px 6px;
  min-width: 18px;
}
```

### Tệp Đính Kèm Tin Nhắn / Thẻ
```css
.attachment {
  border-left: 4px solid #DDDDDD;
  background: #F8F8F8;
  border-radius: 0 4px 4px 0;
  padding: 8px 12px;
  margin: 4px 0;
}
```

### Phản Ứng
```css
.reaction {
  border: 1px solid #DDDDDD;
  border-radius: 24px;
  background: #F8F8F8;
  padding: 2px 8px;
  font-size: 13px;
  cursor: pointer;
}
.reaction:hover { background: #F1F1F1; }
.reaction.active {
  background: rgba(18,100,163,0.1);
  border-color: #1264A3;
}
```

---

## 5. Nguyên Tắc Bố Cục

### Bố Cục Ba Cột
```
┌──────────────┬──────────────────────────────┬─────────────┐
│   Thanh Bên  │        Vùng Tin Nhắn          │   Luồng     │
│   (240px)    │          (flex: 1)            │  (400px)    │
│  #4A154B     │          #FFFFFF              │  tùy chọn  │
└──────────────┴──────────────────────────────┴─────────────┘
```

### Hệ Thống Khoảng Cách (cơ sở 4px)
| Token | Giá Trị | Sử Dụng |
|---|---|---|
| `--space-1` | 4px | Khoảng cách chật |
| `--space-2` | 8px | Padding thành phần |
| `--space-3` | 12px | Padding đầu vào |
| `--space-4` | 16px | Padding chuẩn |
| `--space-6` | 24px | Padding thẻ |
| `--space-8` | 32px | Khoảng cách phần |

### Cấu Trúc Thanh Bên
```
[Tên Không Gian Làm Việc ▼]
────────────────────
Luồng
Tất cả DM
Bản Nháp & Đã Gửi
────────────────────
▼ Kênh
  # chung
  # ngẫu nhiên
  # thiết-kế  ● (chưa đọc)
────────────────────
▼ Tin Nhắn Trực Tiếp
  John Doe
  Jane Smith
```

### Trình Soạn Tin Nhắn
- Ghim ở cuối vùng tin nhắn
- `border: 1px solid #DDDDDD`, `border-radius: 8px`, `margin: 0 16px 16px`
- Thanh công cụ: emoji, đính kèm, định dạng, nút gửi

---

## 6. Độ Sâu & Độ Cao

Slack sử dụng bóng nhẹ trên bề mặt sáng:

| Cấp Độ | Sử Dụng | Bóng |
|---|---|---|
| Phẳng | Hàng tin nhắn, mục thanh bên | none |
| Thấp | Thẻ, đầu vào | `0 1px 3px rgba(0,0,0,0.08)` |
| Trung Bình | Dropdown, popover | `0 4px 12px rgba(0,0,0,0.12)` |
| Cao | Hộp thoại modal | `0 8px 24px rgba(0,0,0,0.15)` |
| Phủ Lớp | Phông nền modal | `rgba(0,0,0,0.5)` |

---

## 7. Nên Làm & Không Nên Làm

### ✅ Nên Làm
- Sử dụng aubergine `#4A154B` cho thanh bên — đây là yếu tố giao diện mang tính biểu tượng nhất của Slack
- Giữ vùng nội dung chính trắng và sáng
- Sử dụng `#1D1C1D` (gần đen) cho tất cả văn bản nội dung, không dùng đen thuần
- In đậm tên kênh để hiển thị trạng thái chưa đọc — độ đậm là chỉ báo
- Chỉ sử dụng bốn màu nhấn cho vai trò ngữ nghĩa (thành công, cảnh báo, nguy hiểm, thông tin)
- Áp dụng `border-left: 4px` trên tệp đính kèm và nhúng tin nhắn
- Chỉ hiển thị dấu thời gian khi hover
- Sử dụng `#1264A3` cho liên kết và trạng thái focus
- Giữ mục thanh bên gọn: chiều cao 28px, border-radius 6px

### ❌ Không Nên Làm
- Không sử dụng vùng nội dung chính tối — Slack ưu tiên sáng
- Không rải xanh dương/xanh lá/vàng/đỏ như nhấn trang trí
- Không sử dụng đen thuần `#000000` cho văn bản
- Không sử dụng bong bóng hội thoại — tin nhắn là hàng phẳng
- Không làm nút có bán kính lớn — 4px là chuẩn
- Không hiển thị dấu thời gian thường xuyên
- Không dùng CHỮ HOA cho tên kênh
- Không sử dụng cỡ chữ dưới 12px

---

## 8. Hành Vi Responsive

### Điểm Ngắt
| Điểm Ngắt | Chiều Rộng | Bố Cục |
|---|---|---|
| Di Động | < 768px | Bảng đơn, thanh bên là ngăn kéo trái |
| Máy Tính Bảng | 768–1024px | Chỉ thanh bên + vùng tin nhắn |
| Máy Tính | > 1024px | Bố cục ba cột đầy đủ |

### Thích Ứng Di Động
- Thanh bên: ngăn kéo trái, vuốt phải để mở
- Thanh tab dưới cùng: Trang chủ, DM, Hoạt động, Bạn
- Bảng luồng: phủ lớp toàn màn hình
- Trình soạn: ghim phía trên bàn phím
- Mục danh sách kênh: chiều cao vùng chạm 44px
- Thanh header aubergine trên cùng được giữ lại trên di động

---

## 9. Hướng Dẫn Prompt Agent

Khi tạo thiết kế theo phong cách Slack, hãy theo cách tiếp cận sau:

**Áp dụng màu sắc:**
> Đặt `background: #FFFFFF` làm canvas chính. Sử dụng `#4A154B` (aubergine) cho thanh bên. Tất cả văn bản chính là `#1D1C1D`. Liên kết và vòng focus dùng `#1264A3`. Bốn màu logo — `#36C5F0`, `#2EB67D`, `#ECB22E`, `#E01E5A` — chỉ mang tính ngữ nghĩa: thông tin, thành công, cảnh báo, nguy hiểm.

**Chữ:**
> Sử dụng `system-ui, -apple-system, sans-serif` cho tất cả giao diện. Kích thước cơ sở là 15px. Kênh chưa đọc: độ đậm 700. Văn bản nội dung: độ đậm 400. Dấu thời gian: 12px `#616061`, chỉ khi hover. Code: `Monaco, Menlo, monospace`, 12px, nền `#F8F8F8`.

**Bố cục:**
> Ba cột: thanh bên aubergine 240px + vùng tin nhắn trắng flex + bảng luồng 400px tùy chọn. Mục thanh bên: chiều cao 28px, bán kính 6px, in đậm khi chưa đọc. Trình soạn: ghim dưới cùng, `border: 1px solid #DDDDDD`, `border-radius: 8px`.

**Thành phần:**
> Nút: bán kính 4px, chiều cao 36px, aubergine chính. Đầu vào: viền `1px solid #DDDDDD`, vòng focus `#1264A3`. Hàng tin nhắn: phẳng, không có bong bóng, avatar hình tròn 36px. Phản ứng: pill `border: 1px solid #DDDDDD`, `border-radius: 24px`.

**Giọng điệu:**
> Slack ấm áp, chuyên nghiệp và mang tính con người. Trạng thái trống sử dụng hình minh họa thân thiện. CTA trực tiếp: "Gửi tin nhắn", "Bắt đầu". Thông báo lỗi rõ ràng và hữu ích. Không bao giờ gây hoảng sợ.

**Các anti-pattern cần tránh:**
> Không có vùng nội dung tối. Không có bong bóng hội thoại. Không có văn bản đen thuần. Không rải nhấn đa màu. Không có tên kênh CHỮ HOA. Không có phông chữ dưới 12px. Không có bán kính nút lớn.
