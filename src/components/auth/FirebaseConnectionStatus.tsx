import React, { useState, useRef, useEffect } from "react";
import { validateFirebaseEnv } from "../../utils/firebaseEnv";
export function FirebaseConnectionStatus() {
  const env = validateFirebaseEnv();
  const [status, setStatus] = useState<
    { stage: string; ok: boolean; message: string }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const running = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function check() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setStatus([]);
    try {
      const result = await (
        await import("../../firebase")
      ).checkFirebaseConnection();
      if (mounted.current) setStatus(result);
    } catch {
      if (mounted.current)
        setStatus([
          {
            stage: "ENV",
            ok: false,
            message: "Không khởi tạo được kiểm tra Firebase.",
          },
        ]);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="text-xs space-y-2">
      {!env.isValid && (
        <p role="alert">
          Firebase chưa đủ cấu hình: {env.missingKeys.join(", ")}. Quản trị cần
          bổ sung biến môi trường trên Vercel rồi triển khai lại.
        </p>
      )}
      <button
        type="button"
        onClick={check}
        disabled={busy}
        className="underline min-h-11"
      >
        {busy ? "Đang kiểm tra…" : "Kiểm tra kết nối Firebase"}
      </button>
      <ul aria-live="polite">
        {status.map((s) => (
          <li key={s.stage}>
            {s.stage}: {s.ok ? "OK" : "CHƯA ĐẠT"} — {s.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
