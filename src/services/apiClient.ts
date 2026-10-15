import {
  getActiveUserApiKey,
  invalidateApiKeyIfCurrent,
} from "./apiKeyManager";
import { redactSensitiveLog } from "../utils/redaction";
const protectedPaths = new Set([
  "/api/ai/extract-batch",
  "/api/bank/cic-bctc-extract",
  "/api/bank/collateral-ltv",
  "/api/chat/message",
  "/api/evidence/extract",
  "/api/bank/credit-proposal",
]);

/** Only send a personal Gemini key to same-origin, explicitly allowlisted API routes. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    window.location.origin,
  );
  const needsKey =
    url.origin === window.location.origin && protectedPaths.has(url.pathname);
  const key = needsKey ? getActiveUserApiKey() : undefined;
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined,
  );
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  if (key) headers.set("X-Gemini-Api-Key", key);
  try {
    const response = await window.fetch(input, {
      ...init,
      headers,
      ...(needsKey ? { redirect: "error" as const } : {}),
    });
    if (key && !response.ok) {
      const body = await response
        .clone()
        .json()
        .catch(() => ({}));
      // Application authorization errors are not evidence that the provider key is invalid.
      if (
        body.code === "GEMINI_AUTH_INVALID" ||
        /API_KEY_INVALID/.test(String(body.error || ""))
      )
        invalidateApiKeyIfCurrent(key);
    }
    return response;
  } catch (err) {
    throw new Error(redactSensitiveLog(err));
  }
}
