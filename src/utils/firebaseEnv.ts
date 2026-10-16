export const FIREBASE_ENV_KEYS = [
  "API_KEY",
  "AUTH_DOMAIN",
  "PROJECT_ID",
  "STORAGE_BUCKET",
  "MESSAGING_SENDER_ID",
  "APP_ID",
].map((k) => `VITE_FIREBASE_${k}`);
export function validateFirebaseEnv(
  env: Record<string, unknown> = import.meta.env ?? {},
) {
  const missingKeys = FIREBASE_ENV_KEYS.filter((key) => {
    const value = String(env[key] ?? "").trim();
    return (
      !value ||
      /^(undefined|null)$/i.test(value) ||
      (key.endsWith("API_KEY") && !/^AIza[0-9A-Za-z_-]{35}$/.test(value))
    );
  });
  return { isValid: missingKeys.length === 0, missingKeys };
}
export const FIREBASE_ADMIN_EMAIL = "ntrthientan@gmail.com";
export function isFirebaseAdminProfile(
  profile: { email?: string; isAdmin?: boolean; authProvider?: string } | null,
) {
  return (
    !!profile &&
    profile.email?.trim().toLowerCase() === FIREBASE_ADMIN_EMAIL &&
    profile.isAdmin === true &&
    profile.authProvider === "firebase"
  );
}
