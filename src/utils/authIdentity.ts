export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function firebaseAuthMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/not-configured":
      "Firebase chưa được cấu hình. Dùng đăng nhập Email nội bộ; người vận hành cần thiết lập VITE_FIREBASE_API_KEY và FIREBASE_PROJECT_ID.",
    "auth/popup-blocked":
      "Trình duyệt chặn cửa sổ Google. Cho phép popup cho website này hoặc dùng Email/Mật khẩu.",
    "auth/popup-closed-by-user":
      "Bạn đã đóng cửa sổ Google. Có thể thử lại hoặc dùng Email/Mật khẩu.",
    "auth/cancelled-popup-request":
      "Yêu cầu Google trước đã bị hủy. Chỉ mở một cửa sổ đăng nhập.",
    "auth/operation-not-allowed":
      "Nhà cung cấp đăng nhập chưa bật. Bật Google hoặc Email/Password trong Firebase Console → Authentication → Sign-in method.",
    "auth/unauthorized-domain":
      "Tên miền chưa được cho phép. Thêm domain hiện tại vào Firebase Console → Authentication → Settings → Authorized domains.",
    "auth/invalid-api-key":
      "Firebase client API key không hợp lệ. Kiểm tra VITE_FIREBASE_API_KEY; không dùng Gemini key ở đây.",
    "auth/invalid-credential":
      "Email hoặc mật khẩu không đúng. Kiểm tra lại thông tin đăng nhập.",
    "auth/user-not-found":
      "Chưa có tài khoản với email này. Đăng ký tài khoản trước.",
    "auth/wrong-password": "Mật khẩu không chính xác.",
    "auth/user-disabled": "Tài khoản đã bị vô hiệu hóa. Liên hệ quản trị.",
    "auth/network-request-failed":
      "Không kết nối được Firebase. Kiểm tra mạng hoặc dùng đăng nhập nội bộ.",
    "auth/too-many-requests":
      "Có quá nhiều lần đăng nhập. Vui lòng chờ rồi thử lại.",
    "auth/email-already-in-use":
      "Email đã tồn tại trên Firebase. Hãy đăng nhập; không tạo lại tài khoản.",
  };
  return (
    messages[code || ""] ||
    "Không hoàn tất xác thực Firebase. Có thể dùng Email/Mật khẩu nội bộ hoặc liên hệ người vận hành."
  );
}
