import { redactSensitiveLog } from "../utils/redaction";

import {
  GEMINI_KEY_REGEX,
  sanitizeGeminiApiKey,
  validateGeminiApiKeyFormat,
  encodeKeyForStorage,
  decodeKeyFromStorage,
} from "../utils/geminiApiKey";
export {
  GEMINI_KEY_REGEX,
  sanitizeGeminiApiKey,
  validateGeminiApiKeyFormat,
  encodeKeyForStorage,
  decodeKeyFromStorage,
} from "../utils/geminiApiKey";
export const API_KEY_STORAGE_NAME = "verifin:gemini-user-key:v1";
export const API_KEY_INVALIDATED_EVENT = "verifin:apikey-invalidated";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const verified = new Set<string>();
let activeKey: string | undefined;
let generation = 0;
export interface KeyVerificationResult {
  valid: boolean;
  ok: boolean;
  sanitizedKey: string;
  maskedKey: string;
  latencyMs: number;
  errorMessage: string | null;
}

export function maskApiKey(key: string): string {
  key = sanitizeGeminiApiKey(key);
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
      const key = decodeKeyFromStorage(encoded);
      if (GEMINI_KEY_REGEX.test(key)) return key;
      window[storageName].removeItem(API_KEY_STORAGE_NAME);
    } catch {
      /* corrupt/disabled storage is not a valid credential */
    }
  }
  return null;
}

export function saveVerifiedApiKey(rawKey: string, rememberMe = true): void {
  const key = sanitizeGeminiApiKey(rawKey);
  if (!GEMINI_KEY_REGEX.test(key) || !verified.has(key))
    throw new Error("UNVERIFIED_USER_API_KEY");
  const target = rememberMe ? window.localStorage : window.sessionStorage;
  const other = rememberMe ? window.sessionStorage : window.localStorage;
  try {
    // Remove the previous persistent key even when switching to session-only mode.
    other.removeItem(API_KEY_STORAGE_NAME);
    target.setItem(API_KEY_STORAGE_NAME, encodeKeyForStorage(key));
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
  _modelName = DEFAULT_GEMINI_MODEL,
): Promise<KeyVerificationResult> {
  const formatCheck = validateGeminiApiKeyFormat(candidateKey);
  const key = formatCheck.sanitizedKey;
  const started = performance.now();
  const epoch = generation;
  const outcome = (
    valid: boolean,
    errorMessage?: string,
  ): KeyVerificationResult => ({
    valid,
    ok: valid,
    sanitizedKey: key,
    maskedKey: maskApiKey(key),
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
    errorMessage: errorMessage ? redactSensitiveLog(errorMessage) : null,
  });
  if (!formatCheck.isValid) return outcome(false, formatCheck.errorMessage!);
  verified.delete(key);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=5",
      {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json", "x-goog-api-key": key },
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error || !Array.isArray(body.models)) {
      const reason =
        response.status === 429
          ? "Key đã hết quota hoặc bị giới hạn tốc độ. Chưa thể mở khóa."
          : response.status === 400 ||
              response.status === 401 ||
              response.status === 403
            ? `Google từ chối API key (${response.status}). Key có thể bị thu hồi hoặc giới hạn IP/Referrer.`
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
