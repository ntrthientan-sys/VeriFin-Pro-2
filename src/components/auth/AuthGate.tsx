import { isFirebaseAdminProfile } from '../../utils/firebaseEnv';
import { FirebaseConnectionStatus } from './FirebaseConnectionStatus';
import React from "react";
import { AuthModal } from "../../AuthModal";
import { useAuth } from "./AuthProvider";
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, checking, error, signIn, signOut, retry } = useAuth();
  if (checking)
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white" role="status">
        Đang xác thực phiên tài khoản…
      </main>
    );
  if (!user)
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-white">
        <h1>Đăng nhập tài khoản VeriFin Pro</h1>
        {error && <p role="alert">{error}</p>}
        <AuthModal
          currentUser={{ name: "", email: "", branch: "office", roleTitle: "" }}
          onAuthSuccess={signIn}
          onClose={() => {}}
          requiredAuth
        />
        <button onClick={retry}>Kiểm tra lại phiên</button>
      </main>
    );
  if (!isFirebaseAdminProfile(user)) return <main className="min-h-screen bg-slate-950 p-6 text-white">
    <h1>Chỉ tài khoản Firebase Admin được sử dụng hệ thống</h1>
    <p>Đăng nhập Firebase bằng ntrthientan@gmail.com và xác minh email trước khi cấu hình Gemini.</p>
    <FirebaseConnectionStatus />
    <button onClick={() => void signOut()}>Đăng xuất / Đổi tài khoản</button>
  </main>;
  return (
    <>
      <div className="flex flex-wrap justify-between gap-2 bg-slate-900 px-4 py-2 text-sm text-white">
        <span>
          Tài khoản: {user.email}{" "}
          {user.firebaseSyncStatus === "PENDING"
            ? "• Firebase: chờ đồng bộ"
            : user.firebaseSyncStatus === "CONFLICT"
              ? "• Firebase: cần xử lý xung đột tài khoản"
              : ""}{" "}
          {user.isAdmin ? "• Admin" : ""}
        </span>
        <button onClick={() => void signOut()} className="underline">
          Đăng xuất tài khoản
        </button>
      </div>
      <FirebaseConnectionStatus />
      <React.Fragment key={user.id}>{children}</React.Fragment>
    </>
  );
}
