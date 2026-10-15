import type { z } from "zod";
import {
  getActiveUserApiKey,
  DEFAULT_GEMINI_MODEL,
} from "../services/apiKeyManager";
export { redactSensitiveLog } from "./redaction";
import { redactSensitiveLog } from "./redaction";

export const EVIDENCE_DB_NAME = "VeriFinPro_EvidenceCache_DB";
export const EVIDENCE_STORE_NAME = "evidence_v2_store";
const TTL_MS = 24 * 60 * 60 * 1000;
const pending = new Map<string, Promise<unknown>>();
let cacheEpoch = 0;
export async function computeFileSha256(
  fileOrBuffer: Blob | ArrayBuffer | ArrayBufferView,
): Promise<string> {
  const bytes =
    fileOrBuffer instanceof Blob
      ? await fileOrBuffer.arrayBuffer()
      : ArrayBuffer.isView(fileOrBuffer)
        ? new Uint8Array(
            fileOrBuffer.buffer,
            fileOrBuffer.byteOffset,
            fileOrBuffer.byteLength,
          ).slice().buffer
        : fileOrBuffer;
  const digest = await crypto.subtle.digest("SHA-256", bytes as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined")
      return reject(new Error("INDEXED_DB_UNAVAILABLE"));
    const request = indexedDB.open(EVIDENCE_DB_NAME, 1);
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error("INDEXED_DB_TIMEOUT"));
    }, 1500);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(EVIDENCE_STORE_NAME))
        request.result.createObjectStore(EVIDENCE_STORE_NAME, {
          keyPath: "key",
        });
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => {
      clearTimeout(timer);
      reject(new Error("INDEXED_DB_UNAVAILABLE"));
    };
    request.onblocked = () => {
      settled = true;
      clearTimeout(timer);
      reject(new Error("INDEXED_DB_BLOCKED"));
    };
  });
}
async function cacheOperation<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(EVIDENCE_STORE_NAME, mode);
      const request = operation(transaction.objectStore(EVIDENCE_STORE_NAME));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(new Error("CACHE_TRANSACTION_FAILED"));
      transaction.onabort = () =>
        reject(new Error("CACHE_TRANSACTION_ABORTED"));
    });
  } finally {
    db.close();
  }
}
export async function clearEvidenceCache(): Promise<void> {
  cacheEpoch++;
  pending.clear();
  await cacheOperation("readwrite", (store) => store.clear());
}
export interface EvidenceCacheOptions<T> {
  file: File;
  moduleName: string;
  zodSchema: z.ZodType<T>;
  modelName?: string;
  schemaVersion?: string;
  extractorFn: (context: {
    file: File;
    apiKey: string;
    sourceFileHash: string;
  }) => Promise<unknown>;
}
export async function getOrExtractWithEvidenceCache<T>({
  file,
  moduleName,
  zodSchema,
  extractorFn,
  modelName = DEFAULT_GEMINI_MODEL,
  schemaVersion = "2.0.0",
}: EvidenceCacheOptions<T>): Promise<T> {
  const apiKey = getActiveUserApiKey(); // Cache does not bypass BYOK.
  const sourceFileHash = await computeFileSha256(file);
  const userScope = await computeFileSha256(new TextEncoder().encode(apiKey));
  const key = JSON.stringify([
    schemaVersion,
    modelName,
    moduleName,
    userScope,
    sourceFileHash,
  ]);
  const epoch = cacheEpoch;
  const assertCurrent = () => {
    if (getActiveUserApiKey() !== apiKey) throw new Error("API_KEY_CHANGED");
  };
  assertCurrent();
  if (pending.has(key)) return zodSchema.parse(await pending.get(key));
  const work = (async () => {
    try {
      const cached = await cacheOperation<any>("readonly", (store) =>
        store.get(key),
      );
      if (cached && cached.expiresAt > Date.now()) {
        const parsed = zodSchema.safeParse(cached.value);
        if (parsed.success) {
          assertCurrent();
          return parsed.data;
        }
      }
    } catch {
      /* Storage denied/corrupt: extract and validate without relying on cache. */
    }
    assertCurrent();
    const extracted = await extractorFn({ file, apiKey, sourceFileHash });
    assertCurrent();
    const parsed = zodSchema.safeParse(extracted);
    if (!parsed.success)
      throw new Error(
        "EVIDENCE_SCHEMA_INVALID: Không lưu kết quả bóc tách sai schema.",
      );
    if (cacheEpoch === epoch) {
      try {
        const entries = await cacheOperation<any[]>("readonly", (store) =>
          store.getAll(),
        );
        for (const entry of entries
          .filter((item) => item.expiresAt <= Date.now())
          .concat(
            entries
              .sort((a, b) => a.createdAt - b.createdAt)
              .slice(0, Math.max(0, entries.length - 49)),
          ))
          await cacheOperation("readwrite", (store) => store.delete(entry.key));
        if (cacheEpoch === epoch)
          await cacheOperation("readwrite", (store) =>
            store.put({
              key,
              createdAt: Date.now(),
              expiresAt: Date.now() + TTL_MS,
              value: parsed.data,
            }),
          );
      } catch {
        /* A valid extraction is usable even when persistence is unavailable. */
      }
    }
    assertCurrent();
    return parsed.data;
  })();
  pending.set(key, work);
  try {
    return await work;
  } catch (err) {
    throw new Error(redactSensitiveLog(err));
  } finally {
    if (pending.get(key) === work) pending.delete(key);
  }
}
