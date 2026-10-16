> Cập nhật: kho thật chuyển sang Firestore transaction; IndexedDB chỉ còn dùng cho dữ liệu mẫu. Xem [giới hạn và cấu trúc lưu mới](security-upgrade.md).

# Phase 3–4: giao diện vận hành và tư vấn

Mở **Văn phòng → Kho • Đơn hàng • Hóa đơn REA**. Module tải bằng React.lazy, nằm sau ApiKeyGate chung. Không có ô lưu raw key thứ hai hay key mặc định.

## Luồng sử dụng

1. Dữ liệu thực bắt đầu trống. Thêm SKU → nhập hàng thực nhận với giá/chứng từ → tạo đơn để giữ hàng.
2. Chuyển giao vận theo các bước engine cho phép. Thiếu hàng từ chối toàn giao dịch. Các trục giao vận, thanh toán và hóa đơn độc lập.
3. Ghi nhận tổng tiền đã thu sau đối chiếu (có thể thu một phần); giảm tổng đã thu để ghi nhận hoàn tiền. Hiển thị VietQR không đồng nghĩa đã nhận tiền.
4. Ghi nhận số/ký hiệu/ngày/URL của hóa đơn **đã phát hành ở nhà cung cấp**. Không tự cấp số, không ký số, không giả mã cơ quan thuế; không có nút phát hành hàng loạt giả lập.
5. Tab ABC dùng ngưỡng 80%/95% của engine. Tốc độ đề xuất nhập dùng đơn đã giao. Ngân sách 0 hợp lệ. Duyệt kế hoạch không tự cộng kho: phải nhập số lượng, đơn giá thực tế và chứng từ nhận hàng. Ngân sách ở đây là tham số mô phỏng, không phải sổ quỹ.

## Lưu trữ và giới hạn

IndexedDB `VeriFin_Operations_v1` lưu nguyên snapshot + nhật ký + receipt cùng một giao dịch. Revision từ chối ghi đè khi tab khác đã lưu; bấm **Tải lại dữ liệu** rồi thực hiện lại. Không tự thay dữ liệu hỏng bằng mẫu. Không gian mẫu chỉ nạp khi bấm chọn; tách khỏi dữ liệu thực và không có QR thu tiền.

Phạm vi lưu được băm từ tài khoản giao diện và key cá nhân; đổi key/tài khoản mở phạm vi khác, không xóa dữ liệu cũ. Đây là cách tách dữ liệu trên thiết bị, **không phải cơ chế phân quyền server hoặc mã hóa dữ liệu**. Dữ liệu không đồng bộ giữa máy; xóa dữ liệu trình duyệt có thể làm mất snapshot. Nhật ký chưa ký số, chưa phải sổ kiểm toán bất biến. Chưa tích hợp database đa người dùng, đơn mua hàng hay đối soát ngân hàng tự động.

Mốc phân tích cập nhật khi ghi giao dịch hoặc bấm cập nhật mốc. Dữ liệu mẫu dùng mốc cố định và tiến thời gian khi thao tác; dữ liệu thực dùng thời gian hiện tại.

## Gemini và Evidence

- Nút Gemini dùng key đã live-verify ở cổng chung, gửi qua header đến `/api/operations/advisory`; model lấy từ cấu hình server `GEMINI_MODEL`.
- Server validate Zod, tính lại KPI/phân bổ từ observations rồi chỉ gửi SKU, tên hàng, số liệu dẫn xuất và số đơn cần rà soát. Không gửi tên khách, SĐT, MST, tài khoản nhận tiền hay nguyên snapshot tới Gemini.
- Structured JSON được kiểm tra, SKU không thuộc nguồn bị từ chối. Giá trị vốn, danh tính SKU và cảnh báo nghiệp vụ được lấy từ engine, không lấy từ AI. Văn bản suy luận vẫn cần con người rà soát, không được xem là dữ kiện đã chứng minh.
- Lỗi quota/mạng/schema trả lỗi rõ; lỗi xác thực provider khóa lại BYOK. Không tự fallback thành công. Nút **Tư vấn quy tắc** là lựa chọn riêng, hiển thị nhãn khác AI; `confidenceScore: null` vì chưa có phép đo độ tin cậy.
- Suy luận nằm ở tầng `inferences`, `reviewStatus: UNREVIEWED`; không thay observations/derivations và không mở khóa Tờ trình tín dụng. Thay snapshot/ngân sách/kỳ phân tích xóa tư vấn cũ và hủy request đang chờ.
- Không khẳng định tuân thủ thuế chỉ vì không còn cảnh báo. Không đưa kết luận pháp lý tự động theo nghị định trong prompt.

## VietQR

`/api/operations/qr` nhận đơn đã validate, tính khoản còn nợ và lấy thụ hưởng từ cấu hình server có quyền admin sửa. Không nhận account override. Tạo PNG từ payload VietQR cục bộ bằng bộ sinh đã có; không truyền khoản nợ/mã đơn sang `img.vietqr.io`. Đơn đã thu đủ/hủy/hoàn bị từ chối. Hiển thị rõ tên, BIN và số tài khoản để người dùng đối chiếu. Chưa xác nhận quét bằng ứng dụng ngân hàng thật trong lần kiểm thử này.

## Kiểm thử

Chạy `npx tsc --noEmit`, `npm test`, `npm run build`. Test dùng Gemini giả lập; chưa có key cá nhân thật để xác nhận model/quota. UI được kiểm tra bằng React/jsdom; chưa có kiểm tra hình ảnh trong trình duyệt thật.
