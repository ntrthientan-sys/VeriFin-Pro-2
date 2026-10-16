import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
export const requiredKeys = [
  "API_KEY",
  "AUTH_DOMAIN",
  "PROJECT_ID",
  "STORAGE_BUCKET",
  "MESSAGING_SENDER_ID",
  "APP_ID",
].map((k) => `VITE_FIREBASE_${k}`);
export function verifyEnvironment(
  root = process.cwd(),
  environment = process.env,
) {
  const values = {};
  for (const name of [".env", ".env.local", ".env.production.local"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(
        line.trimStart(),
      );
      if (!match) continue;
      let value = match[2];
      if (/^["']/.test(value)) {
        const quote = value[0],
          end = value.lastIndexOf(quote);
        if (end > 0) value = value.slice(1, end);
      } else value = value.replace(/\s+#.*$/, "");
      values[match[1]] = value;
    }
  }
  Object.assign(values, environment);
  const rows = requiredKeys.map((key) => {
    const raw = String(values[key] ?? ""),
      value = raw.trim();
    const missing = !value || /^(undefined|null)$/i.test(value);
    const malformed =
      key.endsWith("API_KEY") && !/^AIza[0-9A-Za-z_-]{35}$/.test(value);
    return {
      key,
      status: missing ? "MISSING" : malformed ? "INVALID" : "OK",
      whitespace: raw !== value,
      masked:
        key.endsWith("API_KEY") && !missing
          ? `${value.slice(0, 6)}••••${value.slice(-4)}`
          : "",
    };
  });
  const forbiddenFile = existsSync(
    resolve(root, "firebase-applet-config.json"),
  );
  return {
    rows,
    forbiddenFile,
    valid: !forbiddenFile && rows.every((row) => row.status === "OK"),
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = verifyEnvironment();
  if (result.forbiddenFile)
    console.error(
      "SECURITY: Remove firebase-applet-config.json; configure Firebase using environment variables.",
    );
  console.table(result.rows);
  if (result.rows.some((row) => row.whitespace))
    console.warn(
      "WARNING: Remove leading/trailing whitespace from the listed variables.",
    );
  if (!result.valid)
    console.error(
      "Build blocked. Vercel Dashboard → Project → Settings → Environment Variables: configure all six VITE_FIREBASE_* values for the intended Production/Preview target, then redeploy. Never use a Gemini key as Firebase configuration.",
    );
  process.exitCode = result.valid ? 0 : 1;
}
