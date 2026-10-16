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
  return (
    <>
      <div className="flex flex-wrap justify-between gap-2 bg-slate-900 px-4 py-2 text-sm text-white">
        <span>Tài khoản: {user.email}</span>
        <button onClick={() => void signOut()} className="underline">
          Đăng xuất tài khoản
        </button>
      </div>
      <React.Fragment key={user.id}>{children}</React.Fragment>
    </>
  );
}
