import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { indexedDB } from "fake-indexeddb";
import { z } from "zod";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ApiKeyGate } from "../src/components/auth/ApiKeyGate";
import {
  API_KEY_STORAGE_NAME,
  clearUserApiKey,
  getActiveUserApiKey,
  getStoredUserApiKey,
  maskApiKey,
  saveVerifiedApiKey,
  verifyGeminiApiKeyLive,
} from "../src/services/apiKeyManager";
import { apiFetch } from "../src/services/apiClient";
import {
  computeFileSha256,
  getOrExtractWithEvidenceCache,
  clearEvidenceCache,
  EVIDENCE_DB_NAME,
  EVIDENCE_STORE_NAME,
  redactSensitiveLog,
} from "../src/utils/deterministicCache";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  indexedDB,
  IS_REACT_ACT_ENVIRONMENT: true,
});
// Construct deliberately synthetic credentials; no production credentials in tests.
const key = "AIza" + "a".repeat(35),
  key2 = "AIza" + "b".repeat(35);
function provider(status = 200) {
  const mock = async () =>
    new Response(
      JSON.stringify(
        status === 200
          ? { candidates: [{}] }
          : { error: { message: "denied" } },
      ),
      { status },
    );
  globalThis.fetch = mock as typeof fetch;
  window.fetch = mock as typeof fetch;
}
async function unlock(candidate = key) {
  provider();
  assert.equal((await verifyGeminiApiKeyLive(candidate)).valid, true);
  saveVerifiedApiKey(candidate);
}
test("BYOK: syntax cannot unlock; storage is obfuscation; session switch clears persistent copy", async () => {
  clearUserApiKey();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw Error("network");
  }) as typeof fetch;
  assert.equal((await verifyGeminiApiKeyLive("bad")).valid, false);
  assert.equal(calls, 0);
  assert.throws(() => saveVerifiedApiKey(key), /UNVERIFIED/);
  window.localStorage.setItem(API_KEY_STORAGE_NAME, btoa(key));
  assert.equal(getStoredUserApiKey(), key);
  assert.throws(getActiveUserApiKey, /MISSING/);
  await unlock();
  assert.equal(getActiveUserApiKey(), key);
  assert.equal(window.localStorage.getItem(API_KEY_STORAGE_NAME), btoa(key));
  saveVerifiedApiKey(key, false);
  assert.equal(window.localStorage.getItem(API_KEY_STORAGE_NAME), null);
  assert.equal(maskApiKey(key), key.slice(0, 6) + "••••••••" + key.slice(-4));
  assert.equal(
    redactSensitiveLog(`${key} Bearer abc123 012345678901`).includes(key),
    false,
  );
  assert.doesNotMatch(
    redactSensitiveLog(`${key} Bearer abc123 012345678901`),
    /abc123|012345678901/,
  );
  clearUserApiKey();
  assert.throws(getActiveUserApiKey, /MISSING/);
});
test("live ping verifies headers, model, minimal payload; quota/auth/network/timeout stay locked", async () => {
  clearUserApiKey();
  globalThis.fetch = (async (input, init) => {
    assert.ok(String(input).includes("gemini-2.5-flash:generateContent"));
    assert.ok(!String(input).includes(key));
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), key);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.maxOutputTokens, 1);
    assert.equal(body.contents[0].parts[0].text, "ping");
    return new Response('{"usageMetadata":{"promptTokenCount":1}}', { status: 200 });
  }) as typeof fetch;
  assert.equal((await verifyGeminiApiKeyLive(key)).valid, true);
  for (const status of [401, 403, 429, 500]) {
    provider(status);
    assert.equal((await verifyGeminiApiKeyLive(key)).valid, false);
    assert.throws(() => saveVerifiedApiKey(key), /UNVERIFIED/);
  }
  globalThis.fetch = (async () => {
    throw new DOMException("Timed out", "AbortError");
  }) as typeof fetch;
  assert.equal((await verifyGeminiApiKeyLive(key)).valid, false);
});
test("clearing key while ping is in flight cannot revive it", async () => {
  let finish!: (value: Response) => void;
  globalThis.fetch = (() =>
    new Promise((resolve) => (finish = resolve))) as typeof fetch;
  const pending = verifyGeminiApiKeyLive(key);
  clearUserApiKey();
  finish(new Response('{"usageMetadata":{"promptTokenCount":1}}'));
  assert.equal((await pending).valid, false);
  assert.throws(() => saveVerifiedApiKey(key), /UNVERIFIED/);
});
test("API sends key only to own Gemini routes; provider auth invalidates, application 403 does not", async () => {
  await unlock();
  window.fetch = (async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("X-Gemini-Api-Key"), key);
    return new Response('{"code":"PERMISSION_DENIED"}', { status: 403 });
  }) as typeof fetch;
  await apiFetch("/api/chat/message", { method: "POST" });
  assert.equal(getActiveUserApiKey(), key);
  window.fetch = (async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("X-Gemini-Api-Key"), null);
    return new Response("{}");
  }) as typeof fetch;
  await apiFetch("https://external.test/api/chat/message");
  await apiFetch("/api/settings/bank-account");
  window.fetch = (async () =>
    new Response('{"code":"GEMINI_AUTH_INVALID"}', {
      status: 401,
    })) as typeof fetch;
  await apiFetch("/api/chat/message");
  assert.throws(getActiveUserApiKey, /MISSING/);
});
test("SHA-256 exact bytes; cache validates, deduplicates, isolates keys and never caches errors", async () => {
  assert.equal(
    await computeFileSha256(new TextEncoder().encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    await computeFileSha256(new TextEncoder().encode("xabcx").subarray(1, 4)),
    await computeFileSha256(new TextEncoder().encode("abc")),
  );
  await unlock();
  await clearEvidenceCache();
  let calls = 0;
  const options = {
    file: new File(["abc"], "a.pdf"),
    moduleName: "test",
    zodSchema: z.object({ amount: z.number() }),
    extractorFn: async () => {
      calls++;
      return { amount: 7 };
    },
  };
  assert.deepEqual(
    await Promise.all([
      getOrExtractWithEvidenceCache(options),
      getOrExtractWithEvidenceCache(options),
    ]),
    [{ amount: 7 }, { amount: 7 }],
  );
  assert.equal(calls, 1);
  await getOrExtractWithEvidenceCache(options);
  assert.equal(calls, 1);
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(EVIDENCE_DB_NAME);
    req.onsuccess = () => {
      const db = req.result,
        tx = db.transaction(EVIDENCE_STORE_NAME, "readwrite"),
        store = tx.objectStore(EVIDENCE_STORE_NAME),
        all = store.getAll();
      all.onsuccess = () => {
        for (const row of all.result)
          store.put({ ...row, value: { amount: "invalid" } });
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  await getOrExtractWithEvidenceCache(options);
  assert.equal(calls, 2);
  clearUserApiKey();
  await unlock(key2);
  await getOrExtractWithEvidenceCache(options);
  assert.equal(calls, 3);
  const bad = {
    ...options,
    moduleName: "bad",
    extractorFn: async () => ({ amount: "bad" }),
  };
  await assert.rejects(getOrExtractWithEvidenceCache(bad), /SCHEMA_INVALID/);
  await getOrExtractWithEvidenceCache({
    ...bad,
    extractorFn: options.extractorFn,
  });
  assert.equal(calls, 4);
  await clearEvidenceCache();
  await getOrExtractWithEvidenceCache(options);
  assert.equal(calls, 5);
  clearUserApiKey();
  await assert.rejects(getOrExtractWithEvidenceCache(options), /MISSING/);
});
test("cache expiry and unavailable storage trigger fresh extraction", async () => {
  await unlock();
  await clearEvidenceCache();
  let calls = 0;
  const options = {
    file: new File(["expire"], "a.pdf"),
    moduleName: "ttl",
    zodSchema: z.number(),
    extractorFn: async () => ++calls,
  };
  await getOrExtractWithEvidenceCache(options);
  const now = Date.now;
  Date.now = () => now() + 25 * 60 * 60 * 1000;
  try {
    assert.equal(await getOrExtractWithEvidenceCache(options), 2);
  } finally {
    Date.now = now;
  }
  Object.assign(globalThis, { indexedDB: undefined });
  try {
    assert.equal(await getOrExtractWithEvidenceCache(options), 3);
  } finally {
    Object.assign(globalThis, { indexedDB });
  }
});
test("React gate does not mount children until persisted key passes ping; invalidation unmounts", async () => {
  clearUserApiKey();
  window.localStorage.setItem(API_KEY_STORAGE_NAME, btoa(key));
  let finish!: (r: Response) => void;
  globalThis.fetch = (() =>
    new Promise((resolve) => (finish = resolve))) as typeof fetch;
  const root = createRoot(document.getElementById("root")!);
  let mounts = 0;
  function Child() {
    React.useEffect(() => {
      mounts++;
    }, []);
    return React.createElement(
      "div",
      { "data-testid": "protected" },
      "Modules",
    );
  }
  await act(async () => {
    root.render(
      React.createElement(ApiKeyGate, null, React.createElement(Child)),
    );
  });
  assert.equal(mounts, 0);
  assert.equal(document.querySelector("[data-testid=protected]"), null);
  await act(async () => {
    finish(new Response('{"usageMetadata":{"promptTokenCount":1}}'));
    await new Promise((r) => setTimeout(r, 0));
  });
  assert.equal(mounts, 1);
  assert.ok(document.querySelector("[data-testid=protected]"));
  await act(async () => clearUserApiKey());
  assert.equal(document.querySelector("[data-testid=protected]"), null);
  await act(async () => root.unmount());
});
