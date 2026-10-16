import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { verifyEnvironment, requiredKeys } from "../scripts/verify-env.mjs";
import { safeDivide, roundVND } from "../src/utils/FinanceMath";
import {
  validateFirebaseEnv,
  isFirebaseAdminProfile,
} from "../src/utils/firebaseEnv";
import {
  prepareCloudMutation,
  parseCloudWorkspace,
} from "../src/services/firestoreOperationsStore";
import {
  createMockOperationsState,
  MOCK_REFERENCE_DATE,
} from "../src/data/inventoryOrderMockData";
import { applyOperationsCommand } from "../src/services/inventoryAnalyticsEngine";
test("Build env validation: file prohibition, blank/sentinels, precedence, whitespace and no raw key logs", () => {
  const dir = mkdtempSync(join(tmpdir(), "verifin-env-"));
  // Synthetic config is used solely to test the checker, never to build or contact Firebase.
  const config = Object.fromEntries(
    requiredKeys.map((key) => [
      key,
      key.endsWith("API_KEY") ? "AIza" + "t".repeat(35) : "test-value",
    ]),
  );
  try {
    assert.equal(verifyEnvironment(dir, {}).valid, false);
    assert.equal(verifyEnvironment(dir, config).valid, true);
    for (const bad of ["", "undefined", "null", "AIzaBAD"])
      assert.equal(
        verifyEnvironment(dir, { ...config, VITE_FIREBASE_API_KEY: bad }).valid,
        false,
      );
    writeFileSync(
      join(dir, ".env"),
      Object.entries(config)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    );
    writeFileSync(
      join(dir, ".env.local"),
      "VITE_FIREBASE_PROJECT_ID=from-local\n",
    );
    writeFileSync(
      join(dir, ".env.production.local"),
      'VITE_FIREBASE_API_KEY=" ' + config.VITE_FIREBASE_API_KEY + ' "\n',
    );
    const result = verifyEnvironment(dir, {});
    assert.equal(result.valid, true);
    assert.equal(result.rows[0].whitespace, true);
    assert.ok(!JSON.stringify(result).includes(config.VITE_FIREBASE_API_KEY));
    assert.equal(
      verifyEnvironment(dir, { VITE_FIREBASE_PROJECT_ID: "" }).valid,
      false,
    );
    writeFileSync(join(dir, "firebase-applet-config.json"), "{}");
    assert.equal(verifyEnvironment(dir, config).forbiddenFile, true);
    assert.equal(verifyEnvironment(dir, config).valid, false);
    assert.equal(validateFirebaseEnv(config).isValid, true);
    assert.equal(validateFirebaseEnv({}).missingKeys.length, 6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("FinanceMath guards non-finite arithmetic without converting invalid VND into evidence", () => {
  for (const [n, d] of [
    [1, 0],
    [NaN, 2],
    [1, Infinity],
    [Number.MAX_VALUE, Number.MIN_VALUE],
  ])
    assert.equal(safeDivide(n, d), 0);
  assert.equal(safeDivide(1, 3), 0.33);
  assert.equal(safeDivide(-5, 2, 0), -3);
  assert.equal(roundVND(12.6), 13);
  assert.throws(() => roundVND(Infinity));
  assert.throws(() => safeDivide(1, 2, 100));
});
test("Cloud mutation validates version, stock and idempotent commands before any write", () => {
  const state = createMockOperationsState();
  state.datasetKind = "LIVE";
  const base = { revision: 3, state };
  assert.throws(() => prepareCloudMutation(base, 2, (s) => s), /thiết bị khác/);
  assert.throws(() =>
    prepareCloudMutation(base, 3, (s) => {
      s.inventory[0].onHandQty = -1;
      return s;
    }),
  );
  assert.throws(
    () =>
      parseCloudWorkspace({ revision: 0, state: createMockOperationsState() }),
    /dữ liệu mẫu/,
  );
  const cmd = {
    type: "RECEIVE_STOCK" as const,
    skuId: state.inventory[0].id,
    qty: 2,
    unitCost: 100,
    referenceCode: "PO-TEST",
    context: {
      operationId: "op-once",
      actorId: "test",
      timestamp: new Date(
        Date.parse(MOCK_REFERENCE_DATE) + 86400000,
      ).toISOString(),
      note: "receipt",
    },
  };
  const once = prepareCloudMutation(
    base,
    3,
    (s) => applyOperationsCommand(s, cmd).state,
  );
  const twice = prepareCloudMutation(
    once,
    4,
    (s) => applyOperationsCommand(s, cmd).state,
  );
  assert.equal(
    twice.state.inventory[0].onHandQty,
    state.inventory[0].onHandQty + 2,
  );
  assert.equal(
    twice.state.processedOperations.filter((o) => o.operationId === "op-once")
      .length,
    1,
  );
  assert.equal(
    isFirebaseAdminProfile({
      email: " NTRTHIENTAN@GMAIL.COM ",
      isAdmin: true,
      authProvider: "firebase",
    }),
    true,
  );
  assert.equal(
    isFirebaseAdminProfile({
      email: "ntrthientan@gmail.com",
      isAdmin: true,
      authProvider: "internal",
    }),
    false,
  );
});

test("Transaction adapter commits snapshot + receipt atomically, rejects stale device and replays once", async () => {
  const { initializeApp, deleteApp } = await import("firebase/app");
  const { getFirestore } = await import("firebase/firestore");
  const { transactCloudWorkspace } =
    await import("../src/services/firestoreOperationsStore");
  const app = initializeApp(
    { projectId: "demo-verifin-transaction-test" },
    "transaction-test",
  );
  const db = getFirestore(app),
    documents = new Map<string, any>();
  const writes: string[] = [];
  // In-memory Firestore transaction adapter: no live Firebase claims are made by this test.
  const runner: any = async (_db: any, callback: any) => {
    const pending = new Map<string, any>();
    const tx = {
      get: async (ref: any) => ({
        exists: () => documents.has(ref.path),
        data: () => documents.get(ref.path),
      }),
      set: (ref: any, data: any) => {
        pending.set(ref.path, data);
        writes.push("set:" + ref.path);
      },
      update: (ref: any, data: any) => {
        assert.ok(documents.has(ref.path));
        pending.set(ref.path, data);
        writes.push("update:" + ref.path);
      },
    };
    const result = await callback(tx);
    for (const [path, value] of pending) documents.set(path, value);
    return result;
  };
  try {
    await transactCloudWorkspace(db, 0, (s) => s, "first", runner);
    assert.equal(documents.size, 2);
    const before = writes.length;
    await transactCloudWorkspace(
      db,
      0,
      () => {
        throw new Error("Replay must not apply");
      },
      "first",
      runner,
    );
    assert.equal(writes.length, before);
    await assert.rejects(
      transactCloudWorkspace(db, 0, (s) => s, "stale-device", runner),
      /thiết bị khác/,
    );
    assert.equal(documents.size, 2);
    await transactCloudWorkspace(db, 1, (s) => s, "next", runner);
    assert.ok(writes.includes("update:workspaces/primary"));
    assert.ok(writes.includes("set:workspaces/primary/operations/next"));
    const current = documents.get("workspaces/primary");
    await assert.rejects(
      transactCloudWorkspace(
        db,
        2,
        (s) => {
          s.datasetKind = "SAMPLE";
          return s;
        },
        "bad",
        runner,
      ),
    );
    assert.equal(documents.get("workspaces/primary"), current);
    assert.ok(!documents.has("workspaces/primary/operations/bad"));
  } finally {
    await deleteApp(app);
  }
});
