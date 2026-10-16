import { test } from "node:test";
import assert from "node:assert/strict";
import {
  syncFirebaseAccount,
  waitForFirebaseSync,
} from "../server/firebaseAccountService";
import {
  ADMIN_CONFIG,
  configuredAdminEmails,
} from "../server/config/adminConfig";
import { normalizeEmail, firebaseAuthMessage } from "../src/utils/authIdentity";
const account = {
  id: "local-1",
  email: " Owner@Example.test ",
  name: "Owner",
  branch: "all",
  roleTitle: "Director",
  role: "admin" as const,
};
function mock(existing?: any, writeFail = false) {
  const calls: {
    created: any[];
    claims: any[];
    profiles: any[];
    tokens: any[];
  } = { created: [], claims: [], profiles: [], tokens: [] };
  const service: any = {
    auth: {
      getUserByEmail: async () => {
        if (existing) return existing;
        throw { code: "auth/user-not-found" };
      },
      createUser: async (data: any) => {
        calls.created.push(data);
        return { uid: "cloud-new", customClaims: {} };
      },
      setCustomUserClaims: async (uid: string, data: any) => {
        calls.claims.push({ uid, ...data });
      },
      createCustomToken: async (uid: string) => {
        calls.tokens.push(uid);
        return "custom-session";
      },
    },
    db: {
      collection: () => ({
        doc: (uid: string) => ({
          set: async (data: any, options: any) => {
            if (writeFail) throw new Error("unavailable");
            calls.profiles.push({ uid, data, options });
          },
        }),
      }),
    },
  };
  return { calls, factory: () => service };
}
test("Admin identity canonicalization and targeted Firebase messages", () => {
  assert.equal(ADMIN_CONFIG.email, "ntrthientan@gmail.com");
  assert.equal(normalizeEmail(" ntrthientan@Gmail.com "), ADMIN_CONFIG.email);
  assert.ok(configuredAdminEmails().includes(ADMIN_CONFIG.email));
  assert.match(firebaseAuthMessage({ code: "auth/popup-blocked" }), /popup/);
  assert.match(
    firebaseAuthMessage({ code: "auth/operation-not-allowed" }),
    /Sign-in method/,
  );
  assert.match(
    firebaseAuthMessage({ code: "auth/unauthorized-domain" }),
    /Authorized domains/,
  );
  assert.match(
    firebaseAuthMessage({ code: "auth/not-configured" }),
    /Email nội bộ/,
  );
});
test("Cloud seed creates normalized account, server claims, merged complete profile and optional custom session", async () => {
  const m = mock();
  const r = await syncFirebaseAccount(
    account,
    "synthetic-password",
    true,
    m.factory,
  );
  assert.equal(r.status, "SYNCED");
  assert.equal(r.customToken, "custom-session");
  assert.equal(m.calls.created[0].email, "owner@example.test");
  assert.equal(m.calls.profiles[0].data.role, "admin");
  assert.equal(m.calls.profiles[0].data.isAdmin, true);
  assert.equal(m.calls.profiles[0].options.merge, true);
  assert.equal(m.calls.profiles[0].data.department, "Director");
  assert.ok(m.calls.profiles[0].data.updatedAt);
  assert.ok(!JSON.stringify(m.calls.profiles).includes("synthetic-password"));
});
test("Email match alone and invalid credential never grant claims or replace password", async () => {
  const m = mock({ uid: "existing" });
  const prior = process.env.FIREBASE_WEB_API_KEY;
  process.env.FIREBASE_WEB_API_KEY = "test-firebase-client-config";
  try {
    const denied = await syncFirebaseAccount(
      account,
      "wrong",
      true,
      m.factory,
      (async () => new Response("{}", { status: 400 })) as typeof fetch,
    );
    assert.equal(denied.status, "CONFLICT");
    assert.equal(m.calls.created.length, 0);
    assert.equal(m.calls.claims.length, 0);
    assert.equal(m.calls.tokens.length, 0);
  } finally {
    if (prior === undefined) delete process.env.FIREBASE_WEB_API_KEY;
    else process.env.FIREBASE_WEB_API_KEY = prior;
  }
});
test("Bound UID sync retries profile without storing passwords, preserves other claims; disabled cloud refuses", async () => {
  const m = mock({ uid: "bound", customClaims: { existingFlag: true } });
  const r = await syncFirebaseAccount(
    { ...account, firebaseUid: "bound" },
    undefined,
    false,
    m.factory,
  );
  assert.equal(r.status, "SYNCED");
  assert.equal(m.calls.claims[0].existingFlag, true);
  assert.equal(m.calls.created.length, 0);
  const disabled = mock({ uid: "bound", disabled: true });
  assert.equal(
    (
      await syncFirebaseAccount(
        { ...account, firebaseUid: "bound" },
        undefined,
        true,
        disabled.factory,
      )
    ).status,
    "CONFLICT",
  );
  assert.equal(disabled.calls.tokens.length, 0);
});
test("Cloud outage reports pending; partial creation retains UID for safe retry; local wait is bounded", async () => {
  assert.equal(
    (await syncFirebaseAccount(account, "pw", false, () => null)).status,
    "PENDING",
  );
  const m = mock(undefined, true);
  const r = await syncFirebaseAccount(
    account,
    "synthetic-password",
    false,
    m.factory,
  );
  assert.equal(r.status, "PENDING");
  assert.equal(r.firebaseUid, "cloud-new");
  assert.equal(r.customToken, undefined);
  assert.equal(
    (await waitForFirebaseSync(new Promise(() => {}), 5)).status,
    "PENDING",
  );
});
