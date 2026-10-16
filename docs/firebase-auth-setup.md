> Cập nhật: chính sách hiện hành là Firebase admin-only. Xem [bản nâng cấp 6 hạng mục](security-upgrade.md); đăng nhập nội bộ bên dưới chỉ dùng để khởi tạo/đồng bộ, không mở Workspace.

# Firebase và tài khoản quản trị

PR #4 (Phase 3–4, Auth-first và BYOK mobile) đã merge vào main. Bản sửa tiếp theo bổ sung seed server, đồng bộ Firebase và quyền hồ sơ.

## Tài khoản admin

Danh tính mặc định trong `server/config/adminConfig.ts`:

- Email: `ntrthientan@gmail.com`, luôn trim và chuyển chữ thường.
- Tên: Quản trị viên hệ thống (Admin).
- Role: admin; phòng ban: Ban Giám Đốc / Quản trị hệ thống.

Mật khẩu khởi tạo lấy từ **ADMIN_PASSWORD trên server** (6–256 ký tự), không nằm trong bundle, git hoặc Firestore. Cấu hình cục bộ đã nhận mật khẩu do chủ repo yêu cầu trong `.env` được Git bỏ qua. Môi trường triển khai phải được đặt secret riêng; đẩy code không tự đưa `.env` lên Vercel. Lưu tài khoản nội bộ bằng scrypt + salt, không plaintext. `ADMIN_EMAILS` có thể chỉ định email bootstrap khác; email mặc định vẫn được bảo lưu khỏi đăng ký công khai.

Seed chỉ tạo khi tài khoản chưa có; không âm thầm reset mật khẩu tài khoản đang tồn tại. Tài khoản cũ chưa có role chỉ được nâng thành admin khi mật khẩu bootstrap khớp hash hiện có. Thay secret không tự đổi mật khẩu của tài khoản đã seed.

## Đăng nhập / đồng bộ

- Email/Password thử Firebase khi client đã cấu hình. Lỗi cấu hình/kết nối hoặc chưa có credential chuyển sang kiểm tra mật khẩu nội bộ **ở server**. Không có tài khoản hoặc sai mật khẩu vẫn bị từ chối; không có bypass localStorage hay chế độ admin offline trên trình duyệt.
- Server xác thực nội bộ xong mới tạo tài khoản Firebase bằng Admin SDK, gán custom claims và merge hồ sơ `users/{uid}`. Tài khoản cloud trùng email chỉ được liên kết khi UID đã được lưu, hoặc API Firebase xác nhận đúng mật khẩu. `auth/invalid-credential` không được hiểu là chắc chắn chưa có user để tự cấp admin.
- Hồ sơ có email chuẩn hóa, role/isAdmin, fullName, department, điện thoại, branch, roleTitle và serverTimestamp. Chỉ server được ghi các trường quyền/link danh tính.
- Google ID token được server kiểm tra chữ ký, revocation, email verified và danh sách email admin. Client không tự quyết định role từ chuỗi email. Custom claims cấp bởi server cho phép admin truy cập các tài nguyên Firestore được rules mô tả; không cấp quyền quản trị Firebase Console/IAM.
- Đồng bộ trả `SYNCED`, `PENDING` hoặc `CONFLICT`. Chờ cloud tối đa 2,5 giây trong luồng nội bộ rồi có thể tiếp tục bằng phiên nội bộ hợp lệ; tác vụ đồng bộ tiếp tục chạy. Background retry mỗi 60 giây cho admin có secret hoặc UID đã liên kết. User mới chưa tạo được cloud phải đăng nhập lại để cung cấp mật khẩu cho lần đồng bộ sau; không lưu mật khẩu plaintext để retry.
- Popup bị chặn, provider chưa bật, domain không hợp lệ có hướng dẫn riêng. Lỗi đỏ được xóa khi nhập Email/Mật khẩu hoặc đổi tab. Cả đăng nhập và đăng ký có nút hiện/ẩn mật khẩu.
- Phiên vẫn đi theo Auth → BYOK → Workspace. Fallback không đảm bảo hoạt động khi chính server/mạng/dữ liệu nguồn bị mất; không có cam kết đăng nhập 100% trong mọi hoàn cảnh.

## Cấu hình cần đặt trên môi trường triển khai

1. Firebase Console: bật **Email/Password** và **Google** trong Authentication → Sign-in method; thêm tên miền triển khai trong Authorized domains.
2. Client build: `VITE_FIREBASE_API_KEY` của chính Firebase project (không phải Gemini key). Có thể override project/domain/database bằng `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_ID`.
3. Server: `FIREBASE_PROJECT_ID` phải khớp client; `FIREBASE_DATABASE_ID` phải khớp named database. Bỏ trống dùng `(default)`; project có named database phải đặt cả hai biến database ID.
4. Cấp Firebase Admin SDK Application Default Credentials hoặc `GOOGLE_APPLICATION_CREDENTIALS` trỏ tới service-account file chỉ có trên server. Cần quyền Firebase Authentication và Firestore phù hợp. Không commit file credential.
5. `FIREBASE_WEB_API_KEY` hoặc `VITE_FIREBASE_API_KEY` trên server để xác minh password khi liên kết một cloud user đã có. Không reset password cloud hoặc gán quyền chỉ dựa trên email trùng.
6. Triển khai `firestore.rules` bằng tài khoản có quyền. Rules mới chặn owner tự ghi role/isAdmin/admin/localUserId và sửa email/userId. Chính sách hiện tại từ chối xóa hồ sơ từ client.
7. Đặt `ADMIN_PASSWORD` và storage bền vững cho `DATA_DIR`. Session nội bộ vẫn in-memory, restart server yêu cầu đăng nhập lại. File store/single process hiện tại chưa phù hợp chạy nhiều instance serverless không có đĩa bền vững.

## Tình trạng xác minh

Unit tests dùng Firebase adapter giả lập cho create, claims, merge, xung đột, disabled user và timeout. HTTP tests xác nhận đăng nhập email hoa/thường, mật khẩu 7 ký tự được cấu hình qua env, role server và fallback khi Firebase chưa cấu hình. Chưa có Firebase web key/Admin credentials trong môi trường làm việc; chưa tạo tài khoản trên Firebase thật và chưa deploy Firestore rules. Không coi test giả lập là bằng chứng cloud đã đồng bộ.
