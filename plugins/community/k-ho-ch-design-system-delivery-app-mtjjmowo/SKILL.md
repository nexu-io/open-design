# Kế hoạch Design System — Delivery App

## Ý định

Xây một design system mobile-first từ UI giao hàng trong `image.png`, đủ rõ để đội thiết kế và kỹ thuật tái tạo nhất quán các luồng đặt giao, theo dõi tài xế và lịch sử đơn. Tài liệu này là đặc tả trước khi dựng prototype/component library.

## 1. Phạm vi

- Nền tảng: iOS và Android, dùng chung hệ thống nền tảng nhưng áp dụng navigation, safe area, typography và feedback theo convention riêng của từng hệ điều hành.
- Luồng được bao phủ: Login, Home, Instant Delivery, Schedule Delivery, Package Details, Confirm Details, Courier Tracking, Delivery History và Personal/Profile.
- Đầu ra kế tiếp: hai prototype high-fidelity riêng (`mobile-ios.html`, `mobile-android.html`) để kiểm tra đúng native pattern; không dùng một giao diện trung tính cho cả hai nền tảng.
- Ngôn ngữ: đa ngôn ngữ ngay từ kiến trúc nội dung; không hard-code copy trong component.
- Ngoài phạm vi hiện tại: đăng ký tài khoản, onboarding công khai, thanh toán chi tiết, chat và quản trị vận hành.

## 2. Nguyên tắc sản phẩm

1. **Một bước, một quyết định:** mỗi màn hình chỉ có một CTA chính.
2. **Địa điểm luôn có ngữ cảnh:** pickup và delivery phải khác nhau bằng label, icon và thứ tự, không chỉ bằng màu.
3. **Trạng thái dễ quét:** đơn hàng và tiến trình dùng badge + copy cụ thể.
4. **Chạm an toàn:** mọi control tối thiểu 44 × 44 px; CTA chính cao 52–56 px.
5. **Thông tin quan trọng gần hành động:** phí, người nhận và phương tiện phải được xác nhận trước khi tìm tài xế.
6. **Địa phương hóa từ gốc:** layout chịu được chuỗi dài hơn 30–40%, định dạng số/ngày/tiền tệ theo locale và không nhúng chữ trong ảnh/icon.

## 3. Foundations

### 3.1 Màu sắc

Sử dụng sáu token nguồn trong `brand-spec.md`; mọi biến thể được dẫn xuất bằng `oklch()`.

| Vai trò | Token | Cách dùng |
|---|---|---|
| Canvas | `--bg` | Nền app và vùng map fallback |
| Elevated surface | `--surface` | Sheet, card, dialog, bottom navigation |
| Primary text | `--fg` | Heading, giá trị, icon chính |
| Secondary text | `--muted` | Label, metadata, helper text |
| Divider | `--border` | Separator, input border, disabled surface |
| Brand/action | `--accent` | CTA chính, selected state, progress highlight |

Biến thể đề xuất:

- `--accent-hover`: giảm L của accent khoảng 0.07.
- `--accent-soft`: giữ hue, tăng L và giảm chroma để dùng cho selected card.
- `--danger`: TODO — lấy từ source design hoặc duyệt bổ sung trước khi dùng cho lỗi/cancel.
- `--success`: TODO — duyệt màu semantic; trong lúc chưa chốt, dùng icon + copy + badge outline thay vì tự chế màu.

### 3.2 Typography

| Style | Kích thước / line-height | Weight | Dùng cho |
|---|---:|---:|---|
| Display | 28 / 34 | 700 | Tiêu đề màn hình đặc biệt |
| H1 | 22 / 28 | 700 | Tên bước chính |
| H2 | 18 / 24 | 650 | Tên section/card |
| Body | 15 / 22 | 400 | Nội dung và giá trị form |
| Label | 13 / 18 | 500 | Nhãn trường và metadata |
| Caption | 11 / 16 | 500 | Thời gian, trợ giúp, trạng thái phụ |
| Numeric | 15 / 20 | 600 | Phí, ETA, số lượng |

- iOS: ưu tiên system text style và Dynamic Type.
- Android: ánh xạ cùng semantic scale sang `sp` và hỗ trợ font scaling.
- Với locale có hệ chữ khác Latin, dùng font fallback theo ngôn ngữ nhưng giữ nguyên semantic style.
- Quality gate: nội dung quan trọng vẫn sử dụng được ở text scale 200%.

### 3.3 Spacing, radius, elevation

- Base spacing: 4 px; scale `4, 8, 12, 16, 20, 24, 32, 40`.
- Screen gutter: 20 px; khoảng cách section: 24–32 px; gap trong form: 12–16 px.
- Radius: 8 px cho input/button, 12 px cho card, 24 px cho sheet/modal.
- Divider ưu tiên hơn shadow. Chỉ sheet nổi trên map dùng shadow mềm, một cấp duy nhất.
- Icon sizes: 16, 20, 24 px; stroke nhất quán 1.5–2 px.

### 3.4 Grid và safe area

- Mobile column: 100% chiều rộng trừ gutter 20 px mỗi bên.
- Nội dung không chạm home indicator/notch; bottom nav và CTA tuân thủ safe-area inset.
- Bottom sheet trên map có snap points dự kiến 38%, 64%, 92% chiều cao viewport.
- iOS dùng safe-area inset, navigation bar và 44 pt touch target; Android dùng system inset, Material navigation pattern và 48 dp touch target.
- Không cố ép hai nền tảng dùng cùng kích thước vật lý; component dùng semantic token rồi ánh xạ sang pt/dp.

## 4. Component inventory

### Navigation

- Top app bar: back, title/context, notification, avatar.
- Bottom navigation: Home, History, Personal; active item dùng accent + label, inactive vẫn đủ tương phản.
- Map back control: circular icon button đặt hoàn toàn trong map bounds.

### Authentication

- Username/account field và password field có show/hide password.
- Primary action duy nhất: “Đăng nhập”. Không hiển thị đăng ký hoặc tạo tài khoản.
- “Liên hệ hỗ trợ” là text action thứ cấp, luôn thấy được nhưng không cạnh tranh với CTA.
- Trạng thái: empty, invalid credentials, locked/disabled account, loading, offline và service error.

### Inputs

- Text field, select field, date/time field, quantity field, phone field.
- Location field với leading marker và giá trị hai dòng khi cần.
- Radio group “người thanh toán”; segmented vehicle selector cho bike/car/van.
- Upload/take-photo drop zone với border rõ và trạng thái success/error.

### Actions

- Primary button: full-width; default, hover/pressed, focus-visible, loading, disabled.
- Secondary text action: “Edit details”, “View all”, “Cancel”.
- Icon button: back, call, filter, notification.

### Cards and feedback

- Delivery option card: icon, title, description, selected state.
- Order history row: order ID, recipient, route summary, timestamp, status badge.
- Courier card: avatar, name, delivery count, rating, call action, ETA.
- Status banner: courier found/on the way/delivered.
- Inline validation: icon + concise corrective copy; không chỉ dựa vào màu.

### Map patterns

- Pickup/delivery markers có hình dạng/icon khác nhau.
- Route line phải đủ tương phản với map.
- Bottom sheet không che điểm đến quan trọng; map camera fit lại theo chiều cao sheet.

## 5. Component states

Mỗi component tương tác phải có: default, hover (web prototype), pressed, focus-visible, selected, loading, disabled và error nếu liên quan form.

- Focus ring: accent, offset 2 px, không bị clip.
- Hover/pressed: đổi nền hoặc border; không làm chữ nhạt đi.
- Selected vehicle/card: accent-soft background + accent border + icon/label đậm.
- Disabled: giảm prominence nhưng vẫn đọc được; luôn kèm `aria-disabled` hoặc native `disabled`.
- Loading CTA: giữ nguyên kích thước và copy trạng thái, tránh layout shift.

## 6. Screen blueprint

### Login

- Brand mark/app name → lời chào ngắn → tài khoản → mật khẩu → “Đăng nhập” → “Liên hệ hỗ trợ”.
- Không có “Đăng ký”. Show/hide password phải có accessible label; lỗi xác thực hiển thị tại form và đưa focus về summary phù hợp.
- TODO: Chốt kênh hỗ trợ sẽ mở — hotline, email, help center hay ticket nội bộ.

### Home

- Greeting/app bar → nhóm chức năng giao hàng → chức năng nhanh → đơn gần đây → bottom navigation.
- Nhóm chính gồm Instant Delivery và Schedule Delivery; chỉ một card/action được dùng accent nổi bật trong viewport.
- Menu con Home dùng card/list có icon, tên và mô tả ngắn; hỗ trợ cấu hình quyền để ẩn chức năng không áp dụng cho từng tài khoản.

### Create delivery

- Map header → bottom sheet → pickup/delivery → date/time khi scheduled → vehicle selector → CTA.
- Instant và Scheduled dùng chung cấu trúc; trường thời gian chỉ xuất hiện theo mode.

### Package details

- Item type → helper/prohibited warning → quantity → payer → payment → recipient → phone → photo proof → CTA.
- Validation chạy tại trường và tổng hợp ở CTA khi submit.

### Confirmation

- Route summary → item/recipient → payment/estimated fee → edit action → “Look for courier”.

### Courier tracking

- Map + route → status banner → courier sheet → call → cancel dạng text/destructive confirmation.

### History

- Title + filter → order rows → empty/loading/error states → bottom nav.

### Personal

- Hồ sơ tài khoản → ngôn ngữ → thông báo → bảo mật/đổi mật khẩu → trợ giúp → đăng xuất.
- Đăng xuất là destructive text action và phải có xác nhận; đổi ngôn ngữ áp dụng ngay, lưu theo tài khoản khi có kết nối.

## 7. Interaction flow

`Login → Home → Chọn loại giao → Nhập tuyến đường → Chọn phương tiện → Chi tiết gói hàng → Xác nhận → Tìm tài xế → Theo dõi → Hoàn tất/Lịch sử`

- Back giữ dữ liệu đã nhập.
- CTA “Next” chỉ enable khi trường bắt buộc hợp lệ.
- Cancel khi đang tìm/đang giao phải mở dialog xác nhận và nêu hậu quả/phí nếu có.
- Filter lịch sử dùng bottom sheet; áp dụng/clear là hai hành động phân cấp rõ.
- Phiên đăng nhập hợp lệ đi thẳng vào Home; hết phiên đưa về Login và giữ ngôn ngữ đã chọn.

## 8. Content model

- `DeliveryOrder`: id, mode, pickup, destination, schedule, vehicle, package, payer, recipient, payment, fee, status, timestamps.
- `Location`: label, address, lat, lng, contactNote.
- `Courier`: id, name, avatar, completedCount, rating, phone, liveLocation, eta.
- `OrderStatus`: draft, searching, assigned, picking_up, in_transit, delivered, cancelled.
- `UserProfile`: id, accountName, displayName, locale, platform, permissions, notificationPreferences.
- `LocaleConfig`: languageTag, currencyCode, timeZone, dateFormat, timeFormat, numberFormat, addressFormat, textDirection.

Tất cả currency, ngày giờ, số và địa chỉ được render qua `LocaleConfig`; không chọn một format toàn cục cố định. Locale mặc định theo cấu hình tài khoản, fallback theo hệ điều hành, sau cùng mới dùng locale mặc định của sản phẩm.

### Quy tắc đa ngôn ngữ

- Copy dùng message key và ICU-style interpolation/pluralization.
- Hỗ trợ chuỗi dài hơn bản tiếng Việt tối thiểu 40%; button ưu tiên tăng chiều cao thay vì cắt chữ.
- Chuẩn bị RTL ở cấp layout/token dù danh sách ngôn ngữ đầu tiên chưa có RTL.
- Tên người, địa chỉ, mã đơn và số điện thoại không tự dịch.
- TODO: Chốt danh sách ngôn ngữ phát hành đầu tiên và locale fallback mặc định.

## 9. Accessibility and quality gates

- Tương phản: 4.5:1 cho body, 3:1 cho chữ lớn/icon; đo cả trạng thái hover/selected.
- Không dùng màu đơn lẻ để phân biệt pickup/delivery hoặc order status.
- Label luôn liên kết với input; error được announce bằng live region.
- Keyboard flow đầy đủ trong web prototype; focus không bị bottom sheet che.
- Nội dung không tràn ở 320 px; không horizontal scroll; hỗ trợ text zoom 200%.
- Map có textual route summary tương đương.
- Chạy pseudo-localization để phát hiện text clipping; kiểm tra ít nhất một locale chuỗi dài và một locale RTL trước handoff.
- Kiểm tra native parity riêng trên iOS và Android; hành vi giống nhau nhưng chrome/feedback tuân thủ từng nền tảng.

## 10. Deliverables kế tiếp

- [ ] Token sheet: color, type, spacing, radius, elevation, motion.
- [ ] Component matrix: variants, states, anatomy, accessibility notes.
- [ ] High-fidelity prototype riêng cho iOS và Android, bao phủ Login, Home, delivery flow, History và Personal.
- [ ] Localization matrix: message keys, format rules, expansion/RTL tests.
- [ ] Handoff notes: naming, CSS variables, interaction contract.
- [ ] QA checklist theo luồng đặt giao hoàn chỉnh.

## Quyết định đã khóa

- Không có Figma/source màu và font chính xác; `brand-spec.md` là baseline quan sát từ ảnh và phải được xem là token đề xuất.
- Sản phẩm hỗ trợ cả iOS và Android với native parity.
- Sản phẩm đa ngôn ngữ; currency, địa chỉ, ngày giờ và số được cấu hình theo locale.
- Màn Login chỉ có tài khoản, mật khẩu, liên hệ hỗ trợ và CTA đăng nhập; không có đăng ký.

## Open questions

- TODO: Có brand logo/icon set gốc và motion guideline không?
- TODO: Phạm vi handoff mong muốn là Figma library, HTML prototype, hay cả hai?
- TODO: Chốt danh sách ngôn ngữ phát hành đầu tiên và locale fallback mặc định.
- TODO: Chốt kênh “Liên hệ hỗ trợ”.

## Next step

Hãy review trực tiếp tài liệu này, đặc biệt các mục **Login**, **Home**, **Personal**, **Quyết định đã khóa** và **Open questions**. Sau khi chốt hai kênh handoff và hỗ trợ, chuyển sang Design mode để dựng hai prototype `mobile-ios.html` và `mobile-android.html` từ `design-system-plan.md` và `brand-spec.md`.

## Provenance

Formalized by OpenDesign from candidate e978d9c7-5867-4a24-8738-dcdc6dbb4e98.
