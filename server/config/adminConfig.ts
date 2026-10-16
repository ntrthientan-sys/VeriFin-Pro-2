import { normalizeEmail } from "../../src/utils/authIdentity";
/** Public identity only. The bootstrap password belongs in server secrets, never client/source code. */
export const ADMIN_CONFIG = Object.freeze({
  email: normalizeEmail("ntrthientan@gmail.com"),
  fullName: "Quản trị viên hệ thống (Admin)",
  department: "Ban Giám Đốc / Quản trị hệ thống",
  role: "admin" as const,
});
export function configuredAdminEmails() {
  return [
    ...new Set([
      ADMIN_CONFIG.email,
      ...(process.env.ADMIN_EMAILS || "")
        .split(",")
        .map(normalizeEmail)
        .filter(Boolean),
    ]),
  ];
}
