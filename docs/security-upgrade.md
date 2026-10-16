# Kiểm toán Firebase / REA: bản nâng cấp 6 hạng mục

## 1. Build fail-fast

`npm run verify:env` và hook `prebuild` kiểm tra sáu trường Firebase; từ chối cấu hình thiếu, sentinel null/undefined, key sai định dạng và file cấu hình JSON cũ. Thứ tự ưu tiên: process.env > .env.production.local > .env.local > .env. Không log nguyên key. Chỉ dùng giá trị Firebase project thật khi triển khai.

## 2. Firebase

Client đọc sáu biến VITE_FIREBASE_* đã trim, không import JSON. Auth dùng browserLocalPersistence; Firestore tự nhận diện long polling, HMR dùng instance có sẵn. `VITE_FIREBASE_DATABASE_ID` và `FIREBASE_DATABASE_ID` phải khớp; bỏ trống dùng `(default)`. Nếu project cũ dùng named database, phải đặt tên đó trước redeploy.

Health check trong màn hình đăng nhập/thanh tài khoản kiểm tra ENV, phiên AUTH và đọc hồ sơ từ FIRESTORE server, có timeout, không coi cache/offline là thành công. ENV hợp lệ chỉ là kiểm tra cấu trúc, không chứng minh provider hay quota hoạt động. Admin profile dùng merge/serverTimestamp; quyền nghiệp vụ vẫn do server xác minh token, không tin role do trình duyệt ghi.

## 3. Admin → BYOK → Workspace

Theo yêu cầu mới, chỉ email `ntrthientan@gmail.com` đã xác minh bằng Firebase được dùng Workspace. Tài khoản nội bộ chỉ còn phục vụ khởi tạo/đồng bộ; không mở được BYOK hoặc API nghiệp vụ. Firebase users khác cũng bị khóa. Các phiên cũ phải đăng nhập lại bằng Firebase.

Gemini key được làm sạch clipboard, phục hồi Base64 có giới hạn, regex đúng 39 ký tự. Live GET models tiếp tục truyền key trong `x-goog-api-key` để tránh đưa key vào URL/log; cùng endpoint Google, không fallback key hệ thống. Ping danh sách models không đảm bảo quota generateContent. Đăng xuất xóa BYOK và cookie API Firebase httpOnly/SameSite Strict. Cookie cho phép link tải file giữ được xác thực; server vẫn xác minh token và revocation cho mỗi request.

## 4. Kho / đơn / hóa đơn

Kho thật dùng `workspaces/primary` (snapshot có inventory, orders, invoice metadata, movements, processedOperations) và `workspaces/primary/operations/{operationId}`. runTransaction đọc cả snapshot và receipt, kiểm tra revision, chạy engine hiện có rồi ghi snapshot và receipt cùng commit. Snapshot có sẵn dùng transaction.update; lần đầu dùng set. Thiếu kho/sai transition/trùng hóa đơn bị từ chối trước ghi. Receipt replay không chạy mutation lần nữa. UI dùng khóa ref tức thời và disabled để chặn double-tap.

Chưa tự di chuyển dữ liệu LIVE IndexedDB cũ lên cloud; giữ nguyên trên thiết bị, không tự ghi đè kho thật. Dữ liệu mẫu vẫn dùng IndexedDB ở namespace riêng. Không fallback kho thật sang offline. Snapshot giới hạn 700 KB để tránh vượt giới hạn document; phù hợp quy mô nhỏ, cần phân vùng khi lớn hơn. Không có chữ ký kiểm toán chống admin sửa trực tiếp. Hóa đơn chỉ ghi nhận metadata đã phát hành bên ngoài, không ký số/cấp mã thuế.

## 5. Tính toán / Evidence

FinanceMath.safeDivide bảo vệ NaN/Infinity/chia 0, roundVND làm tròn VND; không biến bằng chứng thiếu thành giá trị 0 hợp lệ. Underwriting engine vẫn tạo BLOCKER khi thiếu dữ liệu. Panel liệt kê từng phép tính/bằng chứng và BLOCKER chặn xuất cùng hướng dẫn bổ sung/xác minh.

## 6. Rules

Rules deny mặc định. users/workspaces/inventory/orders/invoices/creditApplications/evidence chỉ cho admin email đã verified. Xóa public test read và quyền owner cũ. Firebase Admin SDK bỏ qua Firestore rules theo thiết kế; API server có guard admin riêng. Cần deploy rules vào đúng database, không chỉ push GitHub.

## Giới hạn xác minh

Test engine, guard UI/API, env và transaction adapter không thay cho Firebase Emulator hoặc thử nghiệm thật. Chưa có Firebase web config/Admin credentials trong môi trường làm việc; chưa deploy rules hoặc xác minh OAuth thật. Vercel connection trước đó bị 403 ở team newsky3. Không được báo Google login đã hoạt động cho đến khi cấu hình, deploy và test end-to-end.
