import type { Request } from "express";
import { GoogleGenAI } from "@google/genai";
import { redactSensitiveLog } from "../src/utils/redaction";
import {
  validateGeminiApiKeyFormat,
  sanitizeGeminiApiKey,
} from "../src/utils/geminiApiKey";
export class GeminiRequestError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "GEMINI_REQUEST_FAILED",
  ) {
    super(redactSensitiveLog(message));
  }
}
export function getRequestGeminiKey(req: Request): string {
  const key = sanitizeGeminiApiKey(req.get("X-Gemini-Api-Key"));
  if (!key || !validateGeminiApiKeyFormat(key).isValid)
    throw new GeminiRequestError(
      "MISSING_USER_API_KEY",
      401,
      "MISSING_USER_API_KEY",
    );
  return key;
}
export function createUserGeminiClient(key?: string): GoogleGenAI {
  key = sanitizeGeminiApiKey(key);
  if (!key || !validateGeminiApiKeyFormat(key).isValid)
    throw new GeminiRequestError(
      "MISSING_USER_API_KEY",
      401,
      "MISSING_USER_API_KEY",
    );
  return new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 60000 } });
}
export function normalizeGeminiError(error: unknown): GeminiRequestError {
  if (error instanceof GeminiRequestError) return error;
  const item = error as { status?: number; code?: number; message?: string };
  const status = Number(item?.status || item?.code);
  const message = String(item?.message || "Gemini không xử lý được yêu cầu.");
  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|API key not valid|API_KEY_REVOKED|API_KEY_EXPIRED/i.test(
      message,
    )
  )
    return new GeminiRequestError(
      "Gemini từ chối API key hoặc quyền truy cập model.",
      401,
      "GEMINI_AUTH_INVALID",
    );
  if (status === 429)
    return new GeminiRequestError(
      "Gemini đã hết quota hoặc bị giới hạn tốc độ.",
      429,
      "GEMINI_QUOTA_EXCEEDED",
    );
  return new GeminiRequestError(
    redactSensitiveLog(message),
    502,
    "GEMINI_REQUEST_FAILED",
  );
}
export async function verifyRequestKeyLive(key: string, model: string) {
  try {
    await createUserGeminiClient(key).models.generateContent({
      model,
      contents: "ping",
      config: { maxOutputTokens: 1 },
    });
  } catch (err) {
    throw normalizeGeminiError(err);
  }
}
