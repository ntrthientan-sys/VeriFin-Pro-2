# Kho và đơn hàng — Phase 1–2

Phạm vi: schema, dữ liệu mẫu và engine thuần TypeScript theo đặc tả Gemini được chia sẻ. Chưa thêm màn hình Phase 3, cơ sở dữ liệu, phát hành hóa đơn điện tử, VietQR hoặc AI Phase 4. Không thay đổi BYOK.

## Cấu trúc

- `src/schemas/inventoryOrderSchema.ts`: hợp đồng Zod cho SKU, dòng đơn, ba trục trạng thái độc lập, nhật ký kho, snapshot và Evidence vận hành.
- `src/data/inventoryOrderMockData.ts`: 10 SKU, 12 đơn, 50 biến động kho; tạo lại được cùng kết quả. Nhãn `SAMPLE`/`DỮ LIỆU MẪU`, mốc phân tích cố định `MOCK_REFERENCE_DATE`. Không tự đưa mẫu vào ứng dụng đang chạy.
- `src/services/inventoryAnalyticsEngine.ts`: cập nhật kho, giá vốn, thanh toán, metadata hóa đơn, phân tích và đề xuất nhập hàng.
- `src/utils/inventoryMath.ts`: phép tính BigInt, kiểm tra giới hạn số an toàn.
- `tests/inventory.test.ts`: các ca nghiệp vụ và lỗi đầu vào.

## Hợp đồng nghiệp vụ

Số lượng là số nguyên. Giá bán, chiết khấu toàn dòng và thanh toán tính bằng đồng nguyên. Thuế tính trên tiền dòng sau chiết khấu, làm tròn half-up từng dòng. Giá vốn bình quân lưu tối đa 6 chữ số thập phân; giá vốn dòng làm tròn đến đồng. Thuế suất mẫu chỉ phục vụ kiểm thử, không phải hướng dẫn áp thuế hàng hóa.

`availableQty = onHandQty - reservedQty`. CONFIRMED/SHIPPING giữ hàng; DELIVERED trừ kho và giải phóng giữ chỗ. DRAFT có thể giao trực tiếp. Thiếu bất kỳ SKU nào thì từ chối toàn bộ thao tác, không tự cắt số lượng hay ép tồn về 0. Hủy/hoàn trước giao chỉ giải phóng giữ chỗ. Hoàn sau giao nhập lại theo giá vốn đã khóa khi giao và tính lại bình quân. Phase này hỗ trợ hoàn toàn bộ đơn, chưa hỗ trợ giao/hoàn từng phần. Đơn đã giao không được hủy để tránh bỏ qua hoàn kho.

Giá vốn trên đơn nháp là ước tính; khóa lại bằng giá vốn hiện hành tại thời điểm giao. Lợi nhuận không bao gồm VAT. Thanh toán là tổng đã thu tuyệt đối, không phải số tiền cộng thêm. Đơn đã hủy/hoàn chỉ được giảm khoản đã thu để phản ánh hoàn tiền.

Dùng `applyOperationsCommand` để kiểm tra toàn snapshot, giữ nhật ký và chống thực hiện lại bằng `operationId`. Cùng ID và nội dung trả lại snapshot; cùng ID khác nội dung bị từ chối. Các hàm cấp thấp không thay thế kiểm tra toàn snapshot. Hàm thuần, không tự ghi storage: nơi gọi phải lưu snapshot, nhật ký và receipt trong cùng giao dịch có khóa/kiểm soát phiên bản trước khi triển khai đa người dùng. Snapshot mở đầu nhập từ ngoài là dữ liệu cần được xác minh; engine không chứng minh lịch sử trước snapshot đó.

## Phân tích

Mọi phép tính nhận `referenceDate` tường minh; không đọc đồng hồ hệ thống. Cửa sổ là `(referenceDate - lookbackDays, referenceDate]`, mặc định 30 ngày; bỏ đơn tương lai, hủy và hoàn. Đây là phân tích snapshot hiện tại, không phải tái dựng báo cáo lịch sử tại một ngày quá khứ.

Top sellers mặc định COMMITTED (đã xác nhận/đang giao/đã giao), hỗ trợ sắp theo số lượng, doanh thu hoặc lợi nhuận. Phân hạng ABC theo doanh thu thuần, ngưỡng 80%/95%; SKU vượt qua ngưỡng vẫn thuộc nhóm trước ngưỡng; SKU không doanh thu thuộc C. Thay đổi thứ tự hiển thị không đổi phân hạng.

Tốc độ bán và đề xuất nhập chỉ dùng đơn DELIVERED: số lượng giao trong kỳ / số ngày kỳ. Không làm tròn tốc độ trước khi tính điểm đặt hàng:

- ROP = ceil(tốc độ × lead time) + safety stock.
- Mục tiêu = ceil(tốc độ × (target cover + lead time)) + safety stock.
- Số lượng nhập = max(0, mục tiêu − tồn khả dụng), chỉ khi CRITICAL/WARNING.

Hàng mới chưa bán không tự bị coi là tồn chết. Không có tốc độ bán thì thời gian hết hàng là `null`. Phân bổ ngân sách tự sắp ưu tiên, không vượt ngân sách và báo riêng SKU chưa có giá vốn; ngân sách 0 là hợp lệ. Không có dự báo mùa vụ hoặc quản lý hàng đang mua trong Phase này.

`issueOrderEInvoice` **chỉ ghi nhận metadata hóa đơn đã được phát hành bên ngoài**; không gọi nhà cung cấp, không sinh số/mã cơ quan thuế. Cờ cần rà soát hóa đơn áp dụng với đơn đã giao hoặc đã thanh toán đủ, chưa ghi nhận hóa đơn; không coi lựa chọn “khách không yêu cầu” là miễn nghĩa vụ. Đây là quy tắc kiểm soát nội bộ, không phải kết luận tuân thủ pháp luật. Tên KPI `uninvoicedDeliveredCount/Amount` giữ theo đặc tả nhưng bao gồm cả đơn trả đủ trước giao cần rà soát. Hủy/hoàn đơn đã thu tiền hoặc có hóa đơn cần xử lý tiếp bên ngoài.

Evidence vận hành có 4 tầng, `domain: OPERATIONS`, provenance dùng hash SHA-256 do caller cung cấp từ snapshot nguồn. Caller phải thực sự băm nguồn; schema chỉ kiểm tra định dạng hash. Mẫu và vấn đề hóa đơn/hoàn tiền có BLOCKER. Không chuyển KPI kho thành LTV/DSCR hoặc dùng Evidence vận hành để mở khóa Tờ trình tín dụng.

## Ví dụ chạy engine

```ts
import {
  createMockOperationsState,
  MOCK_REFERENCE_DATE,
} from "../src/data/inventoryOrderMockData";
import {
  computeOperationsKPIs,
  computeRestockRecommendations,
} from "../src/services/inventoryAnalyticsEngine";

const state = createMockOperationsState();
const options = { referenceDate: MOCK_REFERENCE_DATE, lookbackDays: 30 };
const kpis = computeOperationsKPIs(state.inventory, state.orders, options);
const restock = computeRestockRecommendations(
  state.inventory,
  state.orders,
  options,
);
```

Kiểm tra: `npx tsc --noEmit`, `npm test`, `npm run build`.
