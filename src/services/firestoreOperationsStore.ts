import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import {
  OperationsStateSchema,
  type OperationsState,
} from "../schemas/inventoryOrderSchema";
import {
  emptyOperationsState,
  type WorkspaceRecord,
} from "./operationsWorkspaceStore";
import { FIREBASE_ADMIN_EMAIL } from "../utils/firebaseEnv";
async function connection() {
  const { auth, db } = await import("../firebase");
  if (!auth || !db)
    throw new Error(
      "Firebase chưa cấu hình. Không ghi dữ liệu thật vào kho offline.",
    );
  await auth.authStateReady();
  const user = auth.currentUser;
  if (
    !user ||
    !user.emailVerified ||
    user.email?.trim().toLowerCase() !== FIREBASE_ADMIN_EMAIL
  )
    throw new Error("Chỉ Firebase Admin được truy cập kho.");
  return db;
}
export function parseCloudWorkspace(value?: any): WorkspaceRecord {
  if (!value) return { revision: 0, state: emptyOperationsState() };
  if (!Number.isSafeInteger(value.revision) || value.revision < 0)
    throw new Error("Phiên bản kho không hợp lệ.");
  const state = OperationsStateSchema.parse(value.state);
  if (state.datasetKind !== "LIVE")
    throw new Error("Không chấp nhận dữ liệu mẫu trong kho thật.");
  return { revision: value.revision, state };
}
const workspaceId = "primary";
export async function loadCloudOperationsWorkspace(): Promise<WorkspaceRecord> {
  const db = await connection();
  const snap = await getDocFromServer(doc(db, "workspaces", workspaceId));
  return parseCloudWorkspace(snap.exists() ? snap.data() : undefined);
}
export function prepareCloudMutation(
  prior: WorkspaceRecord,
  expectedRevision: number,
  change: (state: OperationsState) => OperationsState,
): WorkspaceRecord {
  if (prior.revision !== expectedRevision)
    throw new Error(
      "Kho đã thay đổi ở thiết bị khác. Tải lại trước khi xác nhận.",
    );
  const next = parseCloudWorkspace({
    revision: expectedRevision + 1,
    state: change(structuredClone(prior.state)),
  });
  if (new TextEncoder().encode(JSON.stringify(next)).length > 700000)
    throw new Error(
      "Kho vượt giới hạn snapshot; cần chia phân vùng trước khi tiếp tục.",
    );
  return next;
}
/** Read/check/write and the operation receipt commit together. Retry never falls back to IndexedDB. */
export async function mutateCloudOperationsWorkspace(
  expectedRevision: number,
  change: (state: OperationsState) => OperationsState,
  operationId: string,
): Promise<WorkspaceRecord> {
  const db = await connection();
  return transactCloudWorkspace(db, expectedRevision, change, operationId);
}
export async function transactCloudWorkspace(
  db: Firestore,
  expectedRevision: number,
  change: (state: OperationsState) => OperationsState,
  operationId: string,
  runner: typeof runTransaction = runTransaction,
): Promise<WorkspaceRecord> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(operationId))
    throw new Error("Mã giao dịch không hợp lệ.");
  const ref = doc(db, "workspaces", workspaceId),
    receipt = doc(db, "workspaces", workspaceId, "operations", operationId);
  return runner(db, async (transaction) => {
    const priorReceipt = await transaction.get(receipt);
    const snapshot = await transaction.get(ref);
    const prior = parseCloudWorkspace(
      snapshot.exists() ? snapshot.data() : undefined,
    );
    if (priorReceipt.exists()) {
      if (priorReceipt.data().expectedRevision !== expectedRevision)
        throw new Error("Mã giao dịch đã dùng cho phiên bản khác.");
      return prior;
    }
    // Existing engine checks nonnegative stock, order transitions, duplicate invoices and command IDs here.
    const next = prepareCloudMutation(prior, expectedRevision, change);
    const data = JSON.parse(JSON.stringify(next));
    if (snapshot.exists())
      transaction.update(ref, { ...data, updatedAt: serverTimestamp() });
    else transaction.set(ref, { ...data, updatedAt: serverTimestamp() });
    transaction.set(receipt, {
      operationId,
      expectedRevision,
      revision: next.revision,
      committedAt: serverTimestamp(),
    });
    return next;
  });
}
