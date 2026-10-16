/** Format is only a preflight check. Google remains the authority on validity. */
export const GEMINI_KEY_REGEX = /^AIza[0-9A-Za-z_-]{31,41}$/;
function clean(value: string): string {
  let result = value.trim().replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, "");
  for (let i = 0; i < 2; i++)
    result = result
      .trim()
      .replace(/^['"`]+|['"`]+$/g, "")
      .replace(
        /^(VITE_GEMINI_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|Bearer)\s*[=:]?\s*/i,
        "",
      );
  return result.replace(/\s+/g, "");
}
export function sanitizeGeminiApiKey(
  rawInput: string | null | undefined,
): string {
  if (!rawInput) return "";
  const original = clean(String(rawInput));
  let cleaned = original;
  // Recover raw, once-encoded and legacy double-encoded values; never recurse without bounds.
  for (
    let depth = 0;
    depth < 2 && cleaned && !cleaned.startsWith("AIza");
    depth++
  ) {
    try {
      const decoded = clean(globalThis.atob(cleaned));
      if (!decoded) break;
      cleaned = decoded;
    } catch {
      break;
    }
  }
  return cleaned.startsWith("AIza") ? cleaned : original;
}
export function validateGeminiApiKeyFormat(
  rawInput: string | null | undefined,
) {
  const sanitizedKey = sanitizeGeminiApiKey(rawInput);
  const errorMessage = !sanitizedKey
    ? "Vui lòng nhập hoặc dán Gemini API key từ Google AI Studio."
    : !sanitizedKey.startsWith("AIza")
      ? 'API key phải bắt đầu bằng "AIza..." (Hãy kiểm tra xem bạn có copy nhầm Project ID hoặc chuỗi khác không).'
      : !GEMINI_KEY_REGEX.test(sanitizedKey)
        ? `Độ dài hoặc ký tự trong API key không hợp lệ (Hiện tại: ${sanitizedKey.length} ký tự, chuẩn Google AI Studio là 39 ký tự).`
        : null;
  return { isValid: errorMessage === null, sanitizedKey, errorMessage };
}
export function encodeKeyForStorage(rawInput: string): string {
  const key = sanitizeGeminiApiKey(rawInput);
  return key ? globalThis.btoa(key) : "";
}
export function decodeKeyFromStorage(value: string | null | undefined): string {
  return sanitizeGeminiApiKey(value);
}
