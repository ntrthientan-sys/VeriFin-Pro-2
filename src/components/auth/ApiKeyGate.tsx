import React, { useEffect, useRef, useState } from "react";
import {
  API_KEY_INVALIDATED_EVENT,
  API_KEY_STORAGE_NAME,
  clearUserApiKey,
  getStoredUserApiKey,
  saveVerifiedApiKey,
  verifyGeminiApiKeyLive,
  type KeyVerificationResult,
} from "../../services/apiKeyManager";
import { redactSensitiveLog } from "../../utils/redaction";

type State = "CHECKING" | "LOCKED" | "VERIFIED";
export function ApiKeyGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>("CHECKING");
  const [candidate, setCandidate] = useState("");
  const [remember, setRemember] = useState(true);
  const [result, setResult] = useState<KeyVerificationResult | null>(null);
  const [error, setError] = useState("");
  const revision = useRef(0);

  useEffect(() => {
    let disposed = false;
    const lock = () => {
      revision.current++;
      setState("LOCKED");
      setCandidate("");
      setResult(null);
      setError("API key đã bị xóa hoặc mất hiệu lực. Vui lòng kiểm tra lại.");
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === API_KEY_STORAGE_NAME || event.key === null)
        clearUserApiKey();
    };
    window.addEventListener(API_KEY_INVALIDATED_EVENT, lock);
    window.addEventListener("storage", storageChanged);
    const epoch = ++revision.current;
    const stored = getStoredUserApiKey();
    if (!stored) setState("LOCKED");
    else
      void verifyGeminiApiKeyLive(stored).then((check) => {
        if (disposed || revision.current !== epoch) return;
        setResult(check);
        if (!check.valid) {
          setState("LOCKED");
          setError(check.errorMessage || "Không xác minh được key.");
          return;
        }
        try {
          const persistent =
            window.localStorage.getItem(API_KEY_STORAGE_NAME) !== null;
          saveVerifiedApiKey(stored, persistent);
          setState("VERIFIED");
        } catch (err) {
          setState("LOCKED");
          setError(redactSensitiveLog(err));
        }
      });
    return () => {
      disposed = true;
      revision.current++;
      window.removeEventListener(API_KEY_INVALIDATED_EVENT, lock);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    const epoch = ++revision.current;
    setState("CHECKING");
    setError("");
    const check = await verifyGeminiApiKeyLive(candidate);
    if (revision.current !== epoch) return;
    setResult(check);
    if (!check.valid) {
      setState("LOCKED");
      setError(check.errorMessage || "Không xác minh được key.");
      return;
    }
    try {
      saveVerifiedApiKey(candidate, remember);
      setCandidate("");
      setState("VERIFIED");
    } catch (err) {
      setState("LOCKED");
      setError(redactSensitiveLog(err));
    }
  }

  if (state === "VERIFIED")
    return (
      <>
        <div
          className="sticky top-0 z-[100] flex flex-wrap items-center justify-between gap-2 bg-emerald-950 px-4 py-2 text-sm text-emerald-100"
          role="status"
        >
          <span>
            Gemini cá nhân: {result?.maskedKey} · {result?.latencyMs} ms
          </span>
          <button type="button" className="underline" onClick={clearUserApiKey}>
            Đổi / Xóa API Key
          </button>
        </div>
        {children}
      </>
    );
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-12 text-slate-100 flex items-center justify-center">
      <form
        onSubmit={verify}
        className="w-full max-w-xl space-y-5 rounded-2xl border border-slate-700 bg-slate-900 p-7"
        aria-label="Cổng API key cá nhân"
      >
        <h1 className="text-2xl font-bold">
          Mở khóa VeriFin Pro bằng Gemini API key cá nhân
        </h1>
        <p className="text-sm text-slate-300">
          Ứng dụng không dùng key của chủ dự án. Chỉ mở khóa sau một yêu cầu
          kiểm tra thật tới Gemini.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>
            Mở{" "}
            <a
              className="text-cyan-300 underline"
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Google AI Studio
            </a>{" "}
            và đăng nhập tài khoản Google.
          </li>
          <li>Chọn tạo API key trong dự án của bạn rồi sao chép key.</li>
          <li>
            Dán vào ô dưới và bấm kiểm tra. Hạn mức miễn phí phụ thuộc tài
            khoản, model và chính sách Google.
          </li>
        </ol>
        <label className="block">
          Gemini API key
          <input
            autoComplete="off"
            spellCheck={false}
            type="password"
            value={candidate}
            onChange={(event) => setCandidate(event.target.value)}
            disabled={state === "CHECKING"}
            className="mt-2 w-full rounded-lg bg-slate-800 p-3"
            placeholder="AIza…"
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            disabled={state === "CHECKING"}
          />
          Lưu trên thiết bị này
        </label>
        <p className="text-xs text-slate-400">
          Key lưu dạng base64 có thể giải mã, không phải mã hóa bảo mật. Bỏ chọn
          lưu nếu dùng máy chung. Lần mở app tiếp theo luôn kiểm tra lại trực
          tiếp.
        </p>
        {error && (
          <p role="alert" className="text-rose-300">
            {error}
          </p>
        )}
        <button
          disabled={state === "CHECKING"}
          className="w-full rounded-lg bg-cyan-400 p-3 font-bold text-slate-950 disabled:opacity-50"
        >
          {state === "CHECKING"
            ? "Đang kiểm tra trực tiếp…"
            : "Kiểm tra kết nối trực tiếp"}
        </button>
        <button
          type="button"
          onClick={clearUserApiKey}
          className="text-sm text-slate-400 underline"
        >
          Xóa key đã lưu
        </button>
      </form>
    </main>
  );
}
