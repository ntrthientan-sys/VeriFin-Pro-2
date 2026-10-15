/** Pure utility shared by browser and server. Never log the original provider error. */
export function redactSensitiveLog(text: unknown): string {
  const message =
    text instanceof Error
      ? text.message
      : typeof text === "string"
        ? text
        : String(text ?? "");
  return message
    .replace(/AIza[0-9A-Za-z_-]+/g, "[REDACTED_GOOGLE_KEY]")
    .replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [REDACTED_TOKEN]")
    .replace(/\b\d{12}\b/g, "[REDACTED_CCCD]");
}
