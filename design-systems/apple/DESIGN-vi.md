# Hệ thống thiết kế lấy cảm hứng từ Apple

> Category: Truyền thông & Người tiêu dùng
> Thiết bị điện tử tiêu dùng. Khoảng trắng cao cấp, SF Pro, hình ảnh đậm chất điện ảnh.

## 1. Chủ đề thị giác & Không khí

Ngôn ngữ web của Apple là một hệ thống biên tập chính xác, luân phiên giữa sự tĩnh lặng kiểu phòng trưng bày và các khối thông tin dày đặc kiểu bán lẻ. Tông thị giác luôn được giữ tiết chế: nền trung tính rộng rãi, phần chrome trầm lặng, và hình ảnh sản phẩm gánh gần như toàn bộ sức nặng biểu đạt. Giao diện được thiết kế để biến mất, để phần cứng, chất liệu và các tùy chọn hoàn thiện trở thành tiền cảnh tường thuật.

Xuyên suốt năm trang được phân tích, nhịp điệu nhất quán nhưng không đồng nhất một cách cứng nhắc. Các bề mặt tiếp thị (trang chủ và Environment) sử dụng cách phân chương đậm chất điện ảnh kiểu đen-và-sáng, trong khi các bề mặt thương mại (luồng Store và Shop) đưa vào khoảng cách chặt hơn, nhiều bộ điều khiển tiện ích hơn, và các chồng thẻ dày đặc hơn mà không phá vỡ ngữ pháp thương hiệu cốt lõi. Kết quả là một hệ thống với hai số: chế độ trưng bày và chế độ giao dịch.

Kiểu chữ là yếu tố giữ ổn định. SF Pro Display gánh phân cấp hero và trưng bày hàng hóa với chiều cao dòng nén và tracking được kiểm soát, trong khi SF Pro Text xử lý metadata sản phẩm, điều hướng, bộ lọc, và giao diện lựa chọn dày đặc. Kiểu chữ luôn được giữ kín đáo, nhưng dải kích cỡ đủ rộng để hỗ trợ cả thông điệp hero kiểu biển quảng cáo lẫn các nhãn tiện ích siêu nhỏ.

**Đặc điểm chính:**
- Nhịp điệu mục theo kiểu nhị phân: các cảnh đen sâu (`#000000`) luân phiên với các vùng trung tính nhạt (`#f5f5f7`)
- Một họ nhấn màu xanh dương duy nhất cho ngữ nghĩa hành động và liên kết (`#0071e3`, `#0066cc`, `#2997ff`)
- Hai chế độ vận hành trong cùng một hệ thống: các mô-đun trưng bày đậm chất điện ảnh và các bộ cấu hình thương mại dày đặc
- Phụ thuộc nhiều vào hình ảnh và các bề mặt hoàn thiện chất liệu; phần chrome giao diện luôn mảnh về mặt thị giác
- Các chỉ số tiêu đề chặt chẽ (SF Pro Display, semibold) đi kèm với kiểu chữ thân/liên kết gọn (SF Pro Text)
- Hình học viên thuốc và hình con nhộng làm ngôn ngữ hành động đặc trưng (`18px` đến `980px` và các điều khiển tròn)
- Độ sâu được dùng dè dặt; tương phản và phân tách bề mặt đảm nhận hầu hết công việc phân lớp
- Nhịp điệu khối màu đa trang: các chương hero đen -> các vùng trưng bày hàng hóa trung tính nhạt -> các bề mặt bán lẻ trắng tiện ích -> các bề mặt vi mô tối cho điều khiển

## 2. Bảng màu & Vai trò

> **Source Pages:** `https://www.apple.com/`, `https://www.apple.com/environment/`, `https://www.apple.com/store`, `https://www.apple.com/shop/buy-iphone/iphone-17-pro`, `https://www.apple.com/shop/accessories/all`

### Màu chính
- **Đen tuyệt đối** (`#000000`): Nền hero đắm chìm, các chương sản phẩm kịch tính cao, các điểm neo giao diện sâu.
- **Xám Apple nhạt** (`#f5f5f7`): Bề mặt sáng chính cho các dải tính năng, khối so sánh, và các chuyển tiếp biên tập.
- **Mực gần đen** (`#1d1d1f`): Màu văn bản chính và màu điều khiển nền tối trên nền sáng.

### Màu phụ & Nhấn
- **Xanh hành động Apple** (`#0071e3`): Màu nền hành động chính và điểm nhấn thương hiệu báo hiệu trọng tâm.
- **Xanh liên kết thân bài** (`#0066cc`): Màu liên kết nội dòng tối ưu cho khả năng đọc văn bản dài.
- **Xanh liên kết độ sáng cao** (`#2997ff`): Cách xử lý liên kết sáng trên các cảnh tối hơn nơi cần tương phản mạnh hơn.

### Bề mặt & Nền
- **Nền trắng thuần** (`#ffffff`): Nền danh sách bán lẻ/sản phẩm và các phần giao dịch dày đặc.
- **Bề mặt graphite A** (`#272729`): Lớp ngữ cảnh thẻ tối và điều khiển media.
- **Bề mặt graphite B** (`#262629`): Lớp tiện ích tối sâu hơn một chút cho các nhóm điều khiển.
- **Bề mặt graphite C** (`#28282b`): Các bề mặt hỗ trợ tối được nâng cao.
- **Bề mặt graphite D** (`#2a2a2c`): Bậc nâng cao tối nhất dùng để phân tách trong các cảnh tối phong phú hơn.

### Trung tính & Văn bản
- **Xám trung tính phụ** (`#6e6e73`): Văn bản phụ của thân bài, mô tả trợ giúp, metadata cấp ba.
- **Xám viền mềm** (`#d2d2d7`): Đường phân cách, đường viền tinh tế, và khung chứa tiện ích nhẹ nhàng.
- **Xám viền trung bình** (`#86868b`): Đường viền trường mạnh hơn trong ngữ cảnh cấu hình sản phẩm và bộ lọc.
- **Xám tối tiện ích** (`#424245`): Điểm giao thoa văn bản/bề mặt trung tính-tối trong ngữ cảnh cửa hàng.

### Ngữ nghĩa & Nhấn
- **Tín hiệu lựa chọn/trọng tâm** (`#0071e3`): Tín hiệu trọng tâm và trạng thái được chọn dùng chung xuyên suốt ngữ cảnh tiếp thị và thương mại.
- **Lỗi/Cảnh báo/Thành công**: Không có bảng màu ngữ nghĩa riêng biệt nào hiển thị nhất quán trong tập bề mặt được trích xuất.

### Hệ thống dải màu (gradient)
- Các trang được trích xuất chủ yếu được dẫn dắt bởi bề mặt đặc. Sự phong phú thị giác đến từ nhiếp ảnh và việc render hoàn thiện chứ không phải từ các gradient giao diện thường trực.

## 3. Quy tắc kiểu chữ

### Họ phông chữ
- **Họ Display:** `SF Pro Display`, dự phòng `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Họ Text:** `SF Pro Text`, dự phòng `SF Pro Icons, Helvetica Neue, Helvetica, Arial, sans-serif`
- **Phân chia sử dụng:** Họ Display xử lý tiêu đề hero/sản phẩm và các tiêu đề trưng bày hàng hóa; họ Text xử lý điều hướng, điều khiển, nhãn, và nội dung thương mại dày đặc.

### Phân cấp
| Vai trò | Cỡ | Trọng lượng | Chiều cao dòng | Khoảng cách chữ | Ghi chú |
|------|------|--------|-------------|----------------|-------|
| Hero Display XL | 80px | 600 | 1.00-1.05 | -1.2px | Tỷ lệ hero Environment/store |
| Hero Display L | 56px | 600 | 1.07 | -0.28px | Khoảnh khắc hero trang chủ |
| Section Display | 48px | 500-600 | 1.08 | -0.144px | Tiêu đề chương lớn |
| Product Heading | 40px | 600 | 1.10 | normal | Tiêu đề phần sản phẩm và chiến dịch |
| Feature Display | 38px | 600 | 1.21 | 0.152px | Phần nhấn mạnh thiết bị và trưng bày hàng hóa |
| Promo Display | 32px | 300-600 | 1.09-1.13 | 0.128px to 0.352px | Các sub-hero cấp mô-đun |
| Card/Product Title | 28px | 600 | 1.14 | 0.196px | Đặt tên cấp ô và nội dung then chốt |
| Utility Heading | 24px | 600 | 1.17 | 0.216px / -0.2px | Tiêu đề bộ cấu hình và nội dung được nhóm |
| Link/Action Heading | 21px | 600 | 1.14-1.38 | 0.231px | Các liên kết khuyến mãi lớn hơn |
| Subhead | 19px | 600 | 1.21 | 0.228px | Phần mở đầu mục gọn |
| Body Primary | 17px | 400 | 1.47 | -0.374px | Thân bài tiêu chuẩn và mô tả bán lẻ |
| Body Emphasis | 17px | 600 | 1.24 | -0.374px | Nhãn nhấn mạnh và giá trị then chốt |
| Control Label | 14px | 400-600 | 1.29-1.47 | -0.224px | Nút, nhãn trợ giúp, văn bản điều hướng gọn |
| Micro UI | 12px | 400-600 | 1.00-1.33 | -0.12px | Chữ in nhỏ, nhãn siêu nhỏ |
| Legal/Meta | 10px | 400 | 1.30-1.47 | -0.08px | Metadata dày đặc và văn bản hỗ trợ pháp lý |

### Nguyên tắc
- **Tính liên tục xuyên suốt các loại trang:** Cùng một ADN kiểu chữ trải dài từ các đợt ra mắt đậm chất điện ảnh đến các luồng mua sản phẩm, ngăn chặn sự phân tách thương hiệu giữa tiếp thị và thương mại.
- **Nén ở quy mô lớn:** Các bậc Display dùng leading chặt và tracking được kiểm soát để cảm thấy được tinh chế và lấy sản phẩm làm trung tâm.
- **Mật độ dễ đọc ở chiều sâu bán lẻ:** SF Pro Text cân bằng giữa sự gọn gàng và đủ nhịp điệu dọc cho các danh sách sản phẩm dài và ma trận tùy chọn.
- **Thang trọng lượng có chừng mực:** 600 là trọng lượng nhấn mạnh chủ đạo; 700 xuất hiện một cách chọn lọc; 300 được dùng dè dặt để tạo tương phản trong các dòng lớn hơn.

### Lưu ý về phông chữ thay thế
- Các phông thay thế miễn phí gần nhất: `Inter` cho triển khai nhiều văn bản và các chỉ số kiểu `SF Pro Display-like` được xấp xỉ bằng `Inter Tight` cho tiêu đề.
- Khi thay thế, tăng nhẹ chiều cao dòng (+0.02 đến +0.06) ở các cỡ thân bài và giảm cường độ tracking âm để bảo toàn khả năng đọc.

## 4. Định kiểu thành phần

### Nút
- **Hành động nền chính:** nền `#0071e3`, chữ `#ffffff`, bo góc 8px, padding ngang gọn (thường là 8px 15px). Dùng cho các hành động mua/tiến tới dứt khoát.
- **Hành động nền tối:** nền `#1d1d1f`, chữ `#ffffff`, bo góc 8px. Dùng khi các bề mặt sáng cần một hành động chính tương phản cao mà tiết chế.
- **Họ hành động viên thuốc/con nhộng:** các hành động con nhộng lớn ở bán kính `18px`-`56px` và các liên kết viên thuốc cực đoan ở `980px`. Thiết lập hình bóng kêu gọi hành động mềm mại nhưng chính xác của Apple.
- **Vỏ nút/bộ lọc tiện ích:** các vỏ sáng (`#fafafc` hoặc trắng trong mờ) với viền xám tinh tế (`#d2d2d7` / `#86868b`) cho các ngữ cảnh cấu hình dày đặc.
- **Hành vi khi nhấn:** các điều khiển active thường giảm tỷ lệ hoặc dịch chuyển nền một chút để báo hiệu xác nhận nhấn vật lý.

### Thẻ & Hộp chứa
- **Thẻ biên tập/sản phẩm:** các thẻ sáng trên vùng `#f5f5f7` hoặc trắng với khung tối thiểu và bố cục lấy hình ảnh làm đầu.
- **Thẻ tiện ích tối:** các bậc graphite (`#272729` đến `#2a2a2c`) dùng cho lớp phủ, điều khiển media, và các mô-đun ngữ cảnh tối.
- **Bảng bộ cấu hình:** các hộp chứa bo tròn (thường 12px-18px) với định nghĩa viền rõ nhưng tiết chế.
- **Mô-đun carousel/spotlight:** các vỏ bo tròn lớn hơn (`28px`-`36px`) cho các làn nội dung nổi bật.

### Ô nhập liệu & Biểu mẫu
- **Trường nhập bán lẻ:** nền trong mờ hoặc trắng, chữ tối (`#1d1d1f`), khung chứa dẫn dắt bằng viền (`#86868b`).
- **Điều khiển lựa chọn:** hình học điều khiển kiểu tròn/công tắc xuất hiện thường xuyên trong các giao diện lựa chọn sản phẩm.
- **Chiến lược mật độ:** các trường biểu mẫu được giữ trầm lặng về mặt thị giác để hình ảnh thiết bị và phân cấp giá luôn chiếm ưu thế.

### Điều hướng
- **Thanh điều hướng tiếp thị toàn cục:** thanh tối trong mờ gọn với các liên kết cỡ nhỏ và iconography tiết chế.
- **Các lớp điều hướng Store/cửa hàng con:** thêm các thanh tiện ích, chip, và điều khiển phân đoạn để thu hẹp danh mục và sản phẩm.
- **Phân cấp liên kết:** các sắc xanh liên kết vẫn là tín hiệu tương tác chính trong khi văn bản trung tính hỗ trợ các tập điều hướng dày đặc.

### Xử lý hình ảnh
- **Nhiếp ảnh lấy vật thể làm đầu:** phần cứng và phụ kiện được đưa lên tiền cảnh trên các bề mặt đặc được kiểm soát.
- **Render hoàn thiện độ trung thực cao:** các chi tiết phản chiếu/chất liệu là trung tâm của sự thuyết phục thị giác.
- **Khung hình hỗn hợp:** các cảnh hero tràn viền cùng tồn tại với các thẻ bán lẻ bo tròn và các thumbnail trưng bày hàng hóa được cắt chặt.

### Các thành phần đặc trưng khác
- **Ma trận bộ cấu hình sản phẩm:** các chồng tùy chọn và bộ chọn kết hợp chip, điều khiển kiểu radio, và các khối giá/tóm tắt theo ngữ cảnh.
- **Chấm/Mũi tên điều khiển carousel:** từ vựng điều khiển tròn trong các lớp phủ trầm cho việc tiến qua phòng trưng bày.
- **Bảng kể chuyện Environment:** các chương tường thuật pha trộn kiểu chữ biên tập với hình ảnh sản phẩm/môi trường đậm chất điện ảnh.

## 5. Nguyên tắc bố cục

### Hệ thống khoảng cách
- Đơn vị cơ sở thực chất là `8px`, nhưng hệ thống hỗ trợ các bước vi mô dày đặc để căn chỉnh chính xác.
- Các giá trị khoảng cách được tái sử dụng thường xuyên trên các trang: `2`, `4`, `6`, `7`, `8`, `9`, `10`, `12`, `14`, `17`, `20` px.
- Các hằng số nhịp điệu phổ quát thấy được trên cả luồng tiếp thị và bán lẻ: giàn giáo đơn vị `8px` với các khoảng tiện ích `14-20px` cho padding thành phần và khoảng cách danh sách.

### Lưới & Hộp chứa
- **Trang trưng bày:** các cột trung tâm lớn với khoảng thở ngang rộng và các chương màu tràn toàn bộ chiều rộng.
- **Trang thương mại:** các lưới sản phẩm và điều khiển đa cột chặt hơn với việc chồng mô-đun thường xuyên.
- **Hành vi hộp chứa:** phần lõi dễ đọc bị giới hạn với lề ngoài rộng rãi ở các chiều rộng desktop.

### Triết lý khoảng trắng
- **Nhịp độ cảnh:** các chương thị giác lớn dùng khoảng thở trên/dưới rộng.
- **Nén thông tin khi cần:** các trang bán lẻ cố ý nén khoảng cách để phơi bày nhiều thông tin có thể hành động hơn trên mỗi viewport.
- **Phân tách dẫn dắt bằng tương phản:** các chuyển tiếp mục dựa vào thay đổi bề mặt nhiều hơn là các đường phân cách trang trí.

### Thang bán kính bo góc
- **5px:** các liên kết/thẻ tiện ích nhỏ xíu và các vỏ nhỏ thứ yếu.
- **8px-12px:** các điều khiển tiêu chuẩn và trường gọn.
- **16px-18px:** thẻ, khung mô-đun, và bảng thương mại.
- **28px-36px:** các hộp chứa mô-đun và spotlight lớn hơn.
- **56px / 100px / 980px:** con nhộng, viên thuốc lớn, và các dạng CTA kéo dài đặc trưng.
- **50%:** các điều khiển media và lựa chọn tròn.

## 6. Độ sâu & Độ nâng

| Cấp | Cách xử lý | Sử dụng |
|------|-----------|-----|
| Cấp 0 | Bề mặt trung tính phẳng (`#ffffff`, `#f5f5f7`, `#000000`) | Sân khấu tường thuật và sản phẩm chính |
| Cấp 1 | Khung chứa viền tinh tế (`#d2d2d7`, `#86868b`) | Bộ lọc, trường nhập liệu, thẻ tiện ích |
| Cấp 2 | Bóng mềm (`rgba(0,0,0,0.08)` đến `rgba(0,0,0,0.22)` nơi có) | Các thẻ được làm nổi bật và mô-đun hàng hóa được nâng cao |
| Cấp 3 | Bước bậc bề mặt tối (`#272729` -> `#2a2a2c`) | Lớp phủ, điều khiển media, các cụm tiện ích tối |
| Khả năng tiếp cận | Tín hiệu trọng tâm xanh (`#0071e3`) | Nhấn mạnh bằng bàn phím và lựa chọn |

Độ sâu được tiết chế một cách có chủ đích. Apple ưu ái tương phản tông màu, bước bậc bề mặt, và phân cấp bố cục hơn là các chồng bóng nặng nề.

### Độ sâu trang trí
- Độ sâu trang trí chủ yếu được tạo ra bởi tính chân thực nhiếp ảnh và render chất liệu, chứ không phải các hiệu ứng giao diện tổng hợp.
- Các lớp phủ trong mờ và các thanh tiện ích giống kính cung cấp sự phân lớp không khí nhẹ trong điều hướng và điều khiển.

## 7. Nên và Không nên

### Nên
- Dùng bộ ba trung tính (`#000000`, `#f5f5f7`, `#ffffff`) làm nền tảng cấu trúc.
- Dành các điểm nhấn xanh dương cho ngữ nghĩa hành động và điều hướng thực sự.
- Giữ kiểu chữ chặt chẽ và có chủ đích, đặc biệt ở các tỷ lệ display.
- Duy trì ngôn ngữ hình học con nhộng/tròn cho điều khiển và các hành động then chốt.
- Để hình ảnh sản phẩm gánh sự kịch tính thị giác; giữ phần chrome kín đáo.
- Dùng khung chứa dẫn dắt bằng viền trong các ngữ cảnh bán lẻ dày đặc thay vì trang trí thẻ nặng nề.
- Bảo toàn sự phân tách rõ ràng giữa các mô-đun trưng bày và các mô-đun giao dịch trong khi vẫn dùng chung các token cốt lõi.

### Không nên
- Đừng đưa vào các bảng nhấn màu phụ rộng cạnh tranh với màu xanh Apple.
- Đừng lạm dụng bóng, hiệu ứng phát sáng, hoặc gradient trang trí trong phần chrome giao diện cốt lõi.
- Đừng trộn các họ phông không liên quan hoặc nới lỏng tracking một cách bừa bãi.
- Đừng làm phẳng tất cả các góc về một bán kính duy nhất; Apple dùng các bậc bán kính có chủ đích.
- Đừng làm quá tải các mô-đun thương mại với viền dày hoặc hiệu ứng thị giác ồn ào.
- Đừng loại bỏ nhịp điệu tương phản trung tính giữa các chương tối và sáng.
- Đừng coi các luồng tiếp thị và mua hàng là các hệ thống thiết kế tách biệt.

## 8. Hành vi đáp ứng (Responsive)

### Điểm ngắt (Breakpoints)
| Tên | Chiều rộng | Thay đổi chính |
|------|-------|-------------|
| Small Mobile | 374px trở xuống | Điều khiển bán lẻ được thắt chặt, chồng sản phẩm một cột |
| Mobile | 375px-640px | Mô-đun một cột, hàng hành động gọn, bộ chọn cô đọng |
| Tablet | 641px-833px | Thẻ mở rộng và các chuyển tiếp hỗn hợp 1-2 cột |
| Tablet Wide | 834px-1023px | Trưng bày hàng hóa đa cột ổn định hơn, khối văn bản lớn hơn |
| Desktop | 1024px-1240px | Bố cục bán lẻ đầy đủ và cấu trúc so sánh sản phẩm |
| Desktop Wide | 1241px-1440px | Mở rộng hero tiếp thị và khoảng cách mục rộng hơn |
| Large Desktop | 1441px+ | Khoảng thở chương tối đa và bố cục biên tập rộng |

### Mục tiêu chạm
- Các hành động chính và phụ thường được trình bày theo hình học viên thuốc/nút thân thiện với thao tác chạm.
- Các điều khiển media và lựa chọn tròn căn chỉnh với ý định có thể chạm tối thiểu trong ngữ cảnh di động.
- Giao diện thương mại dày đặc dùng nhãn gọn nhưng duy trì vùng nhấn rõ ràng thông qua padding hình bao quanh.

### Chiến lược thu gọn
- Kiểu chữ hero tiếp thị thu nhỏ theo các bậc rời rạc trong khi bảo toàn tương phản phân cấp.
- Các lưới sản phẩm và thương mại thu gọn từ đa cột thành các thẻ xếp chồng với khả năng hiển thị bộ chọn thường trực.
- Điều hướng tiện ích nén thành các nhóm liên kết/điều khiển đơn giản hơn trong khi bảo toàn các hành động then chốt.
- Các cụm tùy chọn/cấu hình trở thành tuần tự theo chiều dọc để giữ luồng mua hàng tuyến tính trên màn hình nhỏ.

### Hành vi hình ảnh
- Hình ảnh sản phẩm bảo toàn tỷ lệ và tính trung tâm qua các điểm ngắt.
- Hình ảnh hero vẫn chiếm ưu thế trên di động, với văn bản được tái định vị xung quanh ưu tiên media.
- Các thumbnail bán lẻ vẫn dễ đọc thông qua logic cắt chặt hơn và chồng thẻ dày đặc hơn.
- Các mô-đun lấy hình ảnh làm đầu tiếp tục neo nhịp điệu khi mật độ bố cục tăng lên.

## 9. Hướng dẫn prompt cho agent

### Tham chiếu màu nhanh
- Xanh hành động chính: **Xanh hành động Apple** (`#0071e3`)
- Xanh liên kết nội dòng: **Xanh liên kết thân bài** (`#0066cc`)
- Nền chương tối: **Đen tuyệt đối** (`#000000`)
- Nền chương sáng: **Xám Apple nhạt** (`#f5f5f7`)
- Văn bản chính trên nền sáng: **Mực gần đen** (`#1d1d1f`)
- Văn bản phụ: **Xám trung tính phụ** (`#6e6e73`)
- Viền bán lẻ mềm: **Xám viền mềm** (`#d2d2d7`)
- Viền bán lẻ mạnh: **Xám viền trung bình** (`#86868b`)

### Ví dụ prompt thành phần
- "Thiết kế một hero sản phẩm kiểu Apple trên nền đen (`#000000`) với tiêu đề SF Pro Display semibold (48-56px), nội dung hỗ trợ súc tích, và hai CTA con nhộng dùng `#0071e3` và `#1d1d1f`."
- "Tạo một bảng cấu hình thương mại trên nền trắng (`#ffffff`) với các thẻ bo tròn 18px, các trường viền `#86868b`, nội dung thân bài SF Pro Text 17px, và các bộ chọn tùy chọn gọn."
- "Dựng một lưới thẻ trưng bày hàng hóa luân phiên giữa bề mặt `#f5f5f7` và trắng, với các thẻ lấy hình ảnh làm đầu, bóng tiết chế, và metadata SF Pro Text 14-17px."
- "Tạo một cụm điều khiển carousel dùng các nút tròn (bán kính 50%), các lớp phủ xám trầm, và phản hồi active rõ ràng cho điều hướng phòng trưng bày."
- "Soạn một nhịp điệu trang tiếp thị + bán lẻ hỗn hợp: chương trưng bày tối -> chương tính năng sáng -> mô-đun danh sách sản phẩm dày đặc trong khi chỉ giữ các điểm nhấn xanh cho hành động và liên kết."

### Hướng dẫn lặp
1. Khóa nền tảng trung tính trước (`#000000`, `#f5f5f7`, `#ffffff`) trước khi tinh chỉnh các điểm nhấn.
2. Giữ các điểm nhấn xanh khan hiếm và có chủ đích; nếu mọi thứ đều xanh, phân cấp sẽ sụp đổ.
3. Tinh chỉnh kiểu chữ theo thứ tự này: tỷ lệ display, khả năng đọc thân bài, rồi đến các nhãn siêu nhỏ.
4. Khớp bán kính theo lớp thành phần (trường, thẻ, con nhộng, tròn) thay vì bo góc một cỡ cho tất cả.
5. Tăng mật độ dần dần khi chuyển từ các phần trưng bày sang các phần thương mại.
6. Xác nhận rằng hình ảnh sản phẩm vẫn là lớp thị giác mạnh nhất sau mỗi lần chỉnh sửa.

### Các khoảng trống đã biết
- Các màu trạng thái ngữ nghĩa riêng biệt (lỗi/cảnh báo/thành công) không hiển thị nhất quán trong tập trang được trích xuất.
- Một số trạng thái vi mô tương tác thay đổi theo mô-đun và không được biểu diễn dưới dạng các token hệ thống phổ quát.
- Một vài mô-đun bán lẻ phơi bày các ghi đè kiểu chữ theo ngữ cảnh cụ thể không xuất hiện trên cả năm trang.
