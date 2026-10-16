import { normalizeEmail, firebaseAuthMessage } from "./utils/authIdentity";
import { redactSensitiveLog } from "./utils/redaction";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  doc,
  getDocFromServer,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { validateFirebaseEnv, FIREBASE_ADMIN_EMAIL } from "./utils/firebaseEnv";
export { validateFirebaseEnv } from "./utils/firebaseEnv";
const env = import.meta.env ?? {};
const value = (key: string) => String(env[key] ?? "").trim();
const firebaseConfig = {
  apiKey: value("VITE_FIREBASE_API_KEY"),
  authDomain: value("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: value("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: value("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: value("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: value("VITE_FIREBASE_APP_ID"),
};
let initializationError: unknown;
export let auth: ReturnType<typeof getAuth> | null = null;
export let db: ReturnType<typeof getFirestore> | null = null;
let persistenceError = false;
let persistenceReady: Promise<void> = Promise.resolve();
try {
  if (validateFirebaseEnv().isValid) {
    const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    persistenceReady = setPersistence(auth, browserLocalPersistence).catch(
      () => {
        persistenceError = true;
      },
    );
    const databaseId = value("VITE_FIREBASE_DATABASE_ID") || "(default)";
    try {
      db = initializeFirestore(
        app,
        { experimentalAutoDetectLongPolling: true },
        databaseId,
      );
    } catch {
      db = getFirestore(app, databaseId);
    }
  }
} catch (error) {
  initializationError = error;
}
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
export type FirebaseHealth = {
  stage: "ENV" | "AUTH" | "FIRESTORE";
  ok: boolean;
  message: string;
}[];
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TIMEOUT")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function checkFirebaseConnection(): Promise<FirebaseHealth> {
  const result: FirebaseHealth = [];
  const config = validateFirebaseEnv();
  result.push({
    stage: "ENV",
    ok: config.isValid,
    message: config.isValid
      ? "Cấu hình đủ trường."
      : `Thiếu hoặc sai: ${config.missingKeys.join(", ")}. Cấu hình trên Vercel và redeploy.`,
  });
  if (!config.isValid) return result;
  await persistenceReady;
  if (!auth)
    return [
      ...result,
      {
        stage: "AUTH",
        ok: false,
        message: "Không khởi tạo được Firebase Auth.",
      },
    ];
  await bounded(auth.authStateReady());
  const user = auth.currentUser;
  if (!user)
    return [
      ...result,
      { stage: "AUTH", ok: false, message: "Chưa đăng nhập Firebase." },
    ];
  try {
    await bounded(user.getIdToken(true));
    result.push({
      stage: "AUTH",
      ok: true,
      message: persistenceError
        ? "Đã xác thực; trình duyệt không cho lưu phiên lâu dài."
        : "Phiên Firebase hợp lệ.",
    });
    if (!db) throw new Error("FIRESTORE_NOT_INITIALIZED");
    await bounded(getDocFromServer(doc(db, "users", user.uid)));
    result.push({
      stage: "FIRESTORE",
      ok: true,
      message: "Đã đọc từ Firestore server (không dùng cache).",
    });
  } catch (error) {
    result.push({
      stage: result.some((r) => r.stage === "AUTH") ? "FIRESTORE" : "AUTH",
      ok: false,
      message:
        "Không xác minh được kết nối/quyền truy cập. Kiểm tra mạng, Firebase rules và cấu hình dự án.",
    });
  }
  return result;
}
export const testFirestoreConnection = checkFirebaseConnection;
/** Profile metadata only; authoritative admin grants stay on the verified server. */
export async function syncAdminAccount(user: FirebaseUser) {
  if (
    !db ||
    normalizeEmail(user.email || "") !== FIREBASE_ADMIN_EMAIL ||
    !user.emailVerified
  )
    throw new Error("FIREBASE_ADMIN_REQUIRED");
  const token = await user.getIdToken();
  const response = await window.fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (
    !response.ok ||
    data.user?.isAdmin !== true ||
    data.user?.authProvider !== "firebase"
  )
    throw new Error("FIREBASE_ADMIN_REQUIRED");
  await setDoc(
    doc(db, "users", user.uid),
    {
      email: normalizeEmail(user.email || ""),
      fullName: "Quản trị viên hệ thống (Admin)",
      department: "Ban Giám Đốc / Quản trị hệ thống",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

// Error handler conforming to FirestoreErrorInfo
export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  console.error("Firestore Error: ", redactSensitiveLog(error));
  throw new Error(redactSensitiveLog(error));
}

// Google Sign-In with Popup
export async function signInWithGoogle() {
  if (!auth)
    throw Object.assign(
      new Error(
        firebaseAuthMessage(
          initializationError || { code: "auth/not-configured" },
        ),
      ),
      { code: (initializationError as any)?.code || "auth/not-configured" },
    );
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    // Server validates the ID token and owns role/profile provisioning.
    if (
      normalizeEmail(user.email || "") === FIREBASE_ADMIN_EMAIL &&
      user.emailVerified
    )
      await syncAdminAccount(user);
    return user;
  } catch (error) {
    console.error("Google Sign-In Error:", redactSensitiveLog(error));
    throw error;
  }
}

// Sign Out
export async function logOutFirebase() {
  if (auth) await firebaseSignOut(auth);
}

// Sync user profile to Firestore
export async function syncUserProfile(
  user: FirebaseUser,
  extra?: { branch?: string; roleTitle?: string },
) {
  if (!db || !user || !user.uid) return;
  const userRef = doc(db, "users", user.uid);
  try {
    const existing = await getDoc(userRef);
    const data = {
      userId: user.uid,
      email: normalizeEmail(user.email || ""),
      displayName:
        user.displayName || user.email?.split("@")[0] || "Chuyên viên VeriFin",
      photoURL: user.photoURL || "",
      branch: extra?.branch || existing.data()?.branch || "all",
      roleTitle:
        extra?.roleTitle ||
        existing.data()?.roleTitle ||
        "Chuyên viên Tài Chính & Kế Toán",
      updatedAt: serverTimestamp(),
      createdAt: existing.data()?.createdAt || serverTimestamp(),
    };
    await setDoc(userRef, data, { merge: true });
    return data;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }
}

// Bank Account Config persistence in Firestore
export async function saveUserBankConfig(userId: string, config: any) {
  if (!db) return null;
  const docRef = doc(db, "users", userId, "settings", "bankAccount");
  try {
    await setDoc(
      docRef,
      { ...config, updatedAt: new Date().toISOString() },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `users/${userId}/settings/bankAccount`,
    );
  }
}

export async function getUserBankConfig(userId: string) {
  if (!db) return null;
  const docRef = doc(db, "users", userId, "settings", "bankAccount");
  try {
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.GET,
      `users/${userId}/settings/bankAccount`,
    );
  }
}

// Chat Session persistence in Firestore
export interface FirestoreChatSession {
  sessionId: string;
  title: string;
  role: "credit_expert" | "accounting_advisor" | "quick_assistant";
  modelUsed:
    | "gemini-2.5-flash"
    | "gemini-4-argon"
    | "gemini-3.8-flash"
    | "gemini-3.1-flash-lite";
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreChatMessage {
  id?: string;
  role: "user" | "model";
  content: string;
  timestamp: string;
  modelUsed?: string;
}

export async function saveChatSession(
  userId: string,
  session: FirestoreChatSession,
) {
  if (!db) return;
  const sessionRef = doc(
    db,
    "users",
    userId,
    "chatSessions",
    session.sessionId,
  );
  try {
    await setDoc(sessionRef, session, { merge: true });
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `users/${userId}/chatSessions/${session.sessionId}`,
    );
  }
}

export async function addChatMessage(
  userId: string,
  sessionId: string,
  message: FirestoreChatMessage,
) {
  if (!db) return;
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const msgRef = doc(
    db,
    "users",
    userId,
    "chatSessions",
    sessionId,
    "messages",
    msgId,
  );
  try {
    await setDoc(msgRef, message);
    // update parent session timestamp
    const sessionRef = doc(db, "users", userId, "chatSessions", sessionId);
    await setDoc(
      sessionRef,
      { updatedAt: new Date().toISOString() },
      { merge: true },
    );
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `users/${userId}/chatSessions/${sessionId}/messages/${msgId}`,
    );
  }
}

export async function getChatSessions(
  userId: string,
): Promise<FirestoreChatSession[]> {
  if (!db) return [];
  const colRef = collection(db, "users", userId, "chatSessions");
  try {
    const snap = await getDocs(colRef);
    const sessions: FirestoreChatSession[] = [];
    snap.forEach((d) => sessions.push(d.data() as FirestoreChatSession));
    sessions.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return sessions;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.LIST,
      `users/${userId}/chatSessions`,
    );
    return [];
  }
}

export async function getSessionMessages(
  userId: string,
  sessionId: string,
): Promise<FirestoreChatMessage[]> {
  if (!db) return [];
  const colRef = collection(
    db,
    "users",
    userId,
    "chatSessions",
    sessionId,
    "messages",
  );
  try {
    const snap = await getDocs(colRef);
    const messages: FirestoreChatMessage[] = [];
    snap.forEach((d) =>
      messages.push({ id: d.id, ...d.data() } as FirestoreChatMessage),
    );
    messages.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    return messages;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.LIST,
      `users/${userId}/chatSessions/${sessionId}/messages`,
    );
    return [];
  }
}

/** Email sign-in first when configured; only local server credentials may authorize fallback. */
export async function signInFirebaseEmail(email: string, password: string) {
  if (!auth)
    throw Object.assign(
      new Error(firebaseAuthMessage({ code: "auth/not-configured" })),
      { code: "auth/not-configured" },
    );
  await persistenceReady;
  const user = (
    await signInWithEmailAndPassword(auth, normalizeEmail(email), password)
  ).user;
  if (
    normalizeEmail(user.email || "") === FIREBASE_ADMIN_EMAIL &&
    user.emailVerified
  )
    await syncAdminAccount(user);
  return user;
}
export async function acceptFirebaseCustomSession(customToken?: string) {
  if (!customToken || !auth) return false;
  await persistenceReady;
  await signInWithCustomToken(auth, customToken);
  return true;
}
