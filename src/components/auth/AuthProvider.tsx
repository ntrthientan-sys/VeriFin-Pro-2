import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import type { UserSession } from "../../App";
import { clearUserApiKey } from "../../services/apiKeyManager";
import { redactSensitiveLog } from "../../utils/redaction";
const TOKEN = "applet_auth_token",
  OWNER = "verifin:apikey-owner:v1";
const userSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  branch: z.enum(["office", "banking", "all"]),
  roleTitle: z.string(),
});
interface AuthContextValue {
  user: UserSession | null;
  checking: boolean;
  error: string;
  signIn: (candidate: UserSession) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  updateProfile: (profile: UserSession) => void;
}
const AuthContext = createContext<AuthContextValue | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
/** Stored identity is never authorization: always ask the server to validate the token. */
export async function verifyAccountSession(
  token: string,
): Promise<UserSession> {
  if (!token) throw new Error("Vui lòng đăng nhập tài khoản.");
  const response = await window.fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok || data.authenticated !== true)
    throw new Error("Phiên đăng nhập không hợp lệ hoặc đã hết hạn.");
  return { ...userSchema.parse(data.user), token };
}
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null),
    [checking, setChecking] = useState(true),
    [error, setError] = useState("");
  const epoch = useRef(0),
    session = useRef<UserSession | null>(null),
    checkingSession = useRef(false);
  const clear = () => {
    epoch.current++;
    session.current = null;
    setUser(null);
    clearUserApiKey();
    for (const key of [
      TOKEN,
      "applet_auth_user",
      "excel_ai_agent_user",
      OWNER,
    ]) {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }
  };
  const accept = (verified: UserSession) => {
    if (window.localStorage.getItem(OWNER) !== verified.id) clearUserApiKey();
    window.localStorage.setItem(OWNER, verified.id!);
    window.localStorage.setItem(TOKEN, verified.token!);
    window.localStorage.setItem("applet_auth_user", JSON.stringify(verified));
    session.current = verified;
    setUser(verified);
    setError("");
    setChecking(false);
  };
  async function signIn(candidate: UserSession) {
    const revision = ++epoch.current;
    setUser(null);
    session.current = null;
    clearUserApiKey();
    try {
      const verified = await verifyAccountSession(candidate.token || "");
      if (revision !== epoch.current) throw new Error("Đăng nhập đã bị hủy.");
      accept(verified);
    } catch (e) {
      if (revision === epoch.current) {
        clear();
        setChecking(false);
        setError(redactSensitiveLog(e));
      }
      throw e;
    }
  }
  async function retry() {
    const revision = ++epoch.current;
    setChecking(true);
    setUser(null);
    try {
      const token = window.localStorage.getItem(TOKEN);
      if (!token) {
        clear();
        setChecking(false);
        return;
      }
      const verified = await verifyAccountSession(token);
      if (revision === epoch.current) accept(verified);
    } catch (e) {
      if (revision === epoch.current) {
        clear();
        setChecking(false);
        setError(redactSensitiveLog(e));
      }
    }
  }
  async function signOut() {
    const token = session.current?.token;
    clear();
    setChecking(false);
    setError("");
    try {
      await window.fetch("/api/auth/logout", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      /* Local gate locks even while offline. */
    }
    try {
      const firebase = await import("../../firebase");
      await firebase.logOutFirebase();
    } catch {
      /* Firebase may not be configured. */
    }
  }
  useEffect(() => {
    void retry();
    async function refresh() {
      if (checkingSession.current || !session.current) return;
      checkingSession.current = true;
      const revision = epoch.current;
      try {
        const current = session.current;
        const verified = await verifyAccountSession(current.token!);
        if (verified.id !== current.id)
          throw new Error("Danh tính phiên tài khoản đã thay đổi.");
      } catch (e) {
        if (revision === epoch.current) {
          clear();
          setChecking(false);
          setError(redactSensitiveLog(e));
        }
      } finally {
        checkingSession.current = false;
      }
    }
    const storage = (event: StorageEvent) => {
      if (event.key === TOKEN || event.key === null) {
        epoch.current++;
        session.current = null;
        setUser(null);
        clearUserApiKey();
        setChecking(false);
        setError(
          "Phiên tài khoản đã thay đổi ở tab khác. Vui lòng đăng nhập lại.",
        );
      }
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    return () => {
      epoch.current++;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const updateProfile = (profile: UserSession) => {
    if (!session.current) return;
    const next = {
      ...session.current,
      branch: profile.branch,
      roleTitle: profile.roleTitle,
      phone: profile.phone,
    };
    session.current = next;
    setUser(next);
  };
  return (
    <AuthContext.Provider
      value={{ user, checking, error, signIn, signOut, retry, updateProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
