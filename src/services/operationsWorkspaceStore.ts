import {
  OperationsStateSchema,
  type OperationsState,
} from "../schemas/inventoryOrderSchema";
export const emptyOperationsState = (): OperationsState => ({
  schemaVersion: "1.0.0",
  datasetKind: "LIVE",
  inventory: [],
  orders: [],
  movements: [],
  processedOperations: [],
});
export interface WorkspaceRecord {
  revision: number;
  state: OperationsState;
}
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("VeriFin_Operations_v1", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("workspaces");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(new Error("Không mở được kho dữ liệu thiết bị."));
  });
}
function parseRecord(value: any): WorkspaceRecord {
  if (!value) return { revision: 0, state: emptyOperationsState() };
  if (!Number.isSafeInteger(value.revision) || value.revision < 0)
    throw new Error("Snapshot bị hỏng.");
  return {
    revision: value.revision,
    state: OperationsStateSchema.parse(value.state),
  };
}
export async function loadOperationsWorkspace(
  scope: string,
): Promise<WorkspaceRecord> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("workspaces", "readonly");
      const req = tx.objectStore("workspaces").get(scope);
      req.onsuccess = () => {
        try {
          resolve(parseRecord(req.result));
        } catch {
          reject(
            new Error("Dữ liệu lưu không hợp lệ; không tự thay bằng mẫu."),
          );
        }
      };
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
/** Revision check and snapshot write share a single IndexedDB transaction across tabs. */
export async function saveOperationsWorkspace(
  scope: string,
  expectedRevision: number,
  state: OperationsState,
): Promise<WorkspaceRecord> {
  const valid = OperationsStateSchema.parse(state);
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("workspaces", "readwrite"),
        store = tx.objectStore("workspaces");
      let error: unknown;
      const req = store.get(scope);
      const next = { revision: expectedRevision + 1, state: valid };
      req.onsuccess = () => {
        try {
          const prior = parseRecord(req.result);
          if (prior.revision !== expectedRevision)
            throw new Error(
              "Dữ liệu đã đổi ở tab khác. Bấm tải lại trước khi sửa.",
            );
          store.put(next, scope);
        } catch (e) {
          error = e;
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(next);
      tx.onabort = () =>
        reject(error || tx.error || new Error("Không lưu được giao dịch."));
      tx.onerror = () => {
        error = tx.error;
      };
    });
  } finally {
    db.close();
  }
}
