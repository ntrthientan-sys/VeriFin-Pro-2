import { redactSensitiveLog } from "../utils/redaction";

export const GEMINI_KEY_REGEX = /^AIza[0-9A-Za-z-_]{35}$/;
export const API_KEY_STORAGE_NAME = "verifin:gemini-user-key:v1";
export const API_KEY_INVALIDATED_EVENT = "verifin:apikey-invalidated";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const verified = new Set<string>();
let activeKey: string | undefined;
let generation = 0;
export interface KeyVerificationResult {
  valid: boolean;
  maskedKey: string;
  latencyMs: number;
  errorMessage?: string;
}

export function maskApiKey(key: string): string {
  return GEMINI_KEY_REGEX.test(key)
    ? `${key.slice(0, 6)}••••••••${key.slice(-4)}`
    : "••••••••";
}

/** Only a candidate, never proof of a live verification. Session storage takes precedence. */
export function getStoredUserApiKey(): string | null {
  if (typeof window === "undefined") return null;
  for (const storageName of ["sessionStorage", "localStorage"] as const) {
    try {
      const encoded = window[storageName].getItem(API_KEY_STORAGE_NAME);
      if (!encoded) continue;
      const key = atob(encoded);
      if (GEMINI_KEY_REGEX.test(key)) return key;
      window[storageName].removeItem(API_KEY_STORAGE_NAME);
    } catch {
      /* corrupt/disabled storage is not a valid credential */
    }
  }
  return null;
}

export function saveVerifiedApiKey(rawKey: string, rememberMe = true): void {
  const key = rawKey.trim();
  if (!GEMINI_KEY_REGEX.test(key) || !verified.has(key))
    throw new Error("UNVERIFIED_USER_API_KEY");
  const target = rememberMe ? window.localStorage : window.sessionStorage;
  const other = rememberMe ? window.sessionStorage : window.localStorage;
  try {
    // Remove the previous persistent key even when switching to session-only mode.
    other.removeItem(API_KEY_STORAGE_NAME);
    target.setItem(API_KEY_STORAGE_NAME, btoa(key));
    activeKey = key;
  } catch {
    activeKey = undefined;
    verified.delete(key);
    throw new Error(
      "Không lưu được API key. Kiểm tra quyền lưu trữ của trình duyệt.",
    );
  }
}

export function getActiveUserApiKey(): string {
  const key = getStoredUserApiKey();
  if (!key || key !== activeKey || !verified.has(key))
    throw new Error("MISSING_USER_API_KEY");
  return key;
}

export function clearUserApiKey(): void {
  generation++;
  activeKey = undefined;
  verified.clear();
  if (typeof window === "undefined") return;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      window[name].removeItem(API_KEY_STORAGE_NAME);
    } catch {
      /* keep UI locked even if storage is denied */
    }
  }
  window.dispatchEvent(new Event(API_KEY_INVALIDATED_EVENT));
}

/** Avoid invalidating a newly selected key when an older in-flight request fails. */
export function invalidateApiKeyIfCurrent(key: string): void {
  if (activeKey === key) clearUserApiKey();
}

export async function verifyGeminiApiKeyLive(
  candidateKey: string,
  modelName = DEFAULT_GEMINI_MODEL,
): Promise<KeyVerificationResult> {
  const key = candidateKey.trim();
  const started = performance.now();
  const epoch = generation;
  const outcome = (
    valid: boolean,
    errorMessage?: string,
  ): KeyVerificationResult => ({
    valid,
    maskedKey: maskApiKey(key),
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
    ...(errorMessage ? { errorMessage: redactSensitiveLog(errorMessage) } : {}),
  });
  if (!GEMINI_KEY_REGEX.test(key))
    return outcome(false, "API key không đúng định dạng Google AI Studio.");
  if (!/^[a-zA-Z0-9._-]+$/.test(modelName))
    return outcome(false, "Tên model không hợp lệ.");
  verified.delete(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error || !(body.usageMetadata || (Array.isArray(body.candidates) && body.candidates.length))) {
      const reason =
        response.status === 429
          ? "Key đã hết quota hoặc bị giới hạn tốc độ. Chưa thể mở khóa."
          : response.status === 401 || response.status === 403
            ? "Key không hợp lệ hoặc không có quyền sử dụng model."
            : "Không xác minh được key với Gemini. Kiểm tra model, kết nối và quyền sử dụng.";
      return outcome(false, reason);
    }
    if (epoch !== generation)
      return outcome(false, "Lần kiểm tra đã bị hủy do key thay đổi.");
    verified.add(key);
    return outcome(true);
  } catch (err) {
    return outcome(
      false,
      err instanceof Error && err.name === "AbortError"
        ? "Kiểm tra kết nối quá thời gian. Chưa thể mở khóa."
        : "Không kết nối được Gemini. Chưa thể mở khóa.",
    );
  } finally {
    clearTimeout(timeout);
  }
}
