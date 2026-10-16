import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { normalizeEmail } from "../src/utils/authIdentity";
export interface SyncAccount {
  id: string;
  email: string;
  name: string;
  phone?: string;
  branch: string;
  roleTitle: string;
  role?: "admin" | "user";
  firebaseUid?: string;
}
export type SyncResult = {
  status: "SYNCED" | "PENDING" | "CONFLICT";
  firebaseUid?: string;
  customToken?: string;
};
export function firebaseAdminServices() {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (!projectId) return null;
  const app =
    getApps().find((a) => a.name === "verifin-accounts") ||
    initializeApp(
      { credential: applicationDefault(), projectId },
      "verifin-accounts",
    );
  return {
    auth: getAuth(app),
    db: getFirestore(
      app,
      process.env.FIREBASE_DATABASE_ID ||
        "(default)",
    ),
  };
}
/** An existing cloud identity is never claimed by matching email alone. */
export async function syncFirebaseAccount(
  account: SyncAccount,
  password?: string,
  issueToken = false,
  servicesFactory = firebaseAdminServices,
  fetcher: typeof fetch = fetch,
): Promise<SyncResult> {
  let boundUid = account.firebaseUid;
  try {
    const services = servicesFactory();
    if (!services) return { status: "PENDING" };
    let cloud;
    try {
      cloud = await services.auth.getUserByEmail(normalizeEmail(account.email));
    } catch (error) {
      if ((error as any).code !== "auth/user-not-found") throw error;
    }
    if (!cloud) {
      if (!password) return { status: "PENDING" };
      cloud = await services.auth.createUser({
        email: normalizeEmail(account.email),
        password,
        displayName: account.name,
        emailVerified: false,
      });
    } else if (account.firebaseUid !== cloud.uid) {
      const apiKey =
        process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
      if (!password || !apiKey || cloud.disabled) return { status: "CONFLICT" };
      const response = await fetcher(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: normalizeEmail(account.email),
            password,
            returnSecureToken: true,
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) return { status: "CONFLICT" };
      const proof = await response.json();
      if (proof.localId !== cloud.uid) return { status: "CONFLICT" };
    }
    if (cloud.disabled) return { status: "CONFLICT" };
    boundUid = cloud.uid;
    const isAdmin = account.role === "admin";
    await services.auth.setCustomUserClaims(cloud.uid, {
      ...cloud.customClaims,
      role: isAdmin ? "admin" : "user",
      admin: isAdmin,
    });
    await services.db
      .collection("users")
      .doc(cloud.uid)
      .set(
        {
          userId: cloud.uid,
          localUserId: account.id,
          email: normalizeEmail(account.email),
          role: isAdmin ? "admin" : "user",
          isAdmin,
          fullName: account.name,
          displayName: account.name,
          phone: account.phone || "",
          branch: account.branch,
          roleTitle: account.roleTitle,
          department: account.roleTitle,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    return {
      status: "SYNCED",
      firebaseUid: cloud.uid,
      ...(issueToken
        ? { customToken: await services.auth.createCustomToken(cloud.uid) }
        : {}),
    };
  } catch {
    return {
      status: "PENDING",
      ...(boundUid ? { firebaseUid: boundUid } : {}),
    };
  }
}
/** Do not block local login on cloud outages. The caller retains/settles the job for safe retries. */
export async function waitForFirebaseSync(
  job: Promise<SyncResult>,
  timeoutMs = 2500,
): Promise<SyncResult> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      job,
      new Promise<SyncResult>((resolve) => {
        timer = setTimeout(() => resolve({ status: "PENDING" }), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
