import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  InventoryItemSchema,
  SalesOrderSchema,
  OperationsStateSchema,
  type OperationsState,
  type SalesOrder,
  type FulfillmentStatus,
} from "../../schemas/inventoryOrderSchema";
import {
  applyOperationsCommand,
  calculateOrderLine,
  calculateOrderTotals,
  computeOperationsKPIs,
  computeTopSellersAndABC,
  computeRestockRecommendations,
  allocateRestockWithinBudget,
  filterOrdersByControlPreset,
  buildOperationsREAEvidencePayload,
  type OperationsCommand,
  type OrderControlPreset,
  type TopSellerSortMode,
} from "../../services/inventoryAnalyticsEngine";
import {
  createMockOperationsState,
  MOCK_REFERENCE_DATE,
} from "../../data/inventoryOrderMockData";
import {
  loadOperationsWorkspace,
  saveOperationsWorkspace,
  type WorkspaceRecord,
} from "../../services/operationsWorkspaceStore";
import {
  generateOperationsAIAdvisory,
  buildOperationsAdvisory,
  type AIInventoryAdvisory,
} from "../../services/operationsAiAdvisorService";
import { getActiveUserApiKey } from "../../services/apiKeyManager";
import { computeFileSha256 } from "../../utils/deterministicCache";
import { redactSensitiveLog } from "../../utils/redaction";
import { apiFetch } from "../../services/apiClient";
const money = (v: number) =>
  `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} ₫`;
const button =
  "rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-40";
const panel = "rounded-xl border border-slate-700 bg-slate-900 p-4";
const statuses: Record<FulfillmentStatus, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Giữ hàng",
  SHIPPING: "Đang giao",
  DELIVERED: "Đã giao",
  RETURNED: "Hoàn hàng",
  CANCELLED: "Hủy",
};
const transitions: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  DRAFT: ["CONFIRMED", "DELIVERED", "CANCELLED"],
  CONFIRMED: ["SHIPPING", "DELIVERED", "DRAFT", "CANCELLED", "RETURNED"],
  SHIPPING: ["DELIVERED", "CANCELLED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};
type Modal = {
  kind:
    "SKU" | "ORDER" | "RECEIVE" | "PAYMENT" | "INVOICE" | "BATCH" | "EVIDENCE";
  id?: string;
};
function Field({
  label,
  name,
  type = "text",
  value = "",
  min,
  step = "1",
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  min?: number;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        className="mt-1 mb-3 block w-full rounded border border-slate-600 bg-slate-950 p-2"
        name={name}
        type={type}
        defaultValue={value}
        min={min}
        step={step}
        required={required}
      />
    </label>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-800">
          <tr>
            {headers.map((h) => (
              <th className="p-3 whitespace-nowrap" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700 [&_td]:p-3">
          {children}
        </tbody>
      </table>
    </div>
  );
}
export default function REAOperationsWorkspace({ userId }: { userId: string }) {
  const [scope, setScope] = useState(""),
    [record, setRecord] = useState<WorkspaceRecord | null>(null),
    [demo, setDemo] = useState(false),
    [tab, setTab] = useState("ORDERS"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState<Modal | null>(null);
  const [preset, setPreset] = useState<OrderControlPreset>("ALL"),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState<TopSellerSortMode>("REVENUE"),
    [budget, setBudget] = useState("45000000"),
    [cover, setCover] = useState("30"),
    [lookback, setLookback] = useState("30"),
    [reference, setReference] = useState(new Date().toISOString());
  const [evidence, setEvidence] = useState<ReturnType<
      typeof buildOperationsREAEvidencePayload
    > | null>(null),
    [advice, setAdvice] = useState<AIInventoryAdvisory | null>(null),
    [loadingAi, setLoadingAi] = useState(false),
    [qr, setQr] = useState<any>(null);
  const saving = useRef(false),
    request = useRef<AbortController | null>(null),
    alive = useRef(true);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    let current = true;
    setRecord(null);
    setScope("");
    setError("");
    computeFileSha256(
      new TextEncoder().encode(`${userId}:${getActiveUserApiKey()}`).buffer,
    )
      .then((hash) => {
        const key = `${hash}:${demo ? "sample" : "live"}`;
        return loadOperationsWorkspace(key).then((r) => {
          if (current) {
            setScope(key);
            setRecord(r);
            setReference(demo ? MOCK_REFERENCE_DATE : new Date().toISOString());
          }
        });
      })
      .catch((e) => current && setError(redactSensitiveLog(e)));
    return () => {
      current = false;
    };
  }, [userId, demo]);
  useEffect(() => {
    if (modal || qr) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal, qr]);
  const state = record?.state;
  const derived = useMemo(() => {
    if (!state) return null;
    try {
      const days = Number(lookback),
        target = Number(cover),
        cash = Number(budget);
      if (
        !lookback.trim() ||
        !cover.trim() ||
        !budget.trim() ||
        !Number.isSafeInteger(cash) ||
        cash < 0 ||
        !Number.isInteger(target) ||
        target < 1 ||
        target > 365
      )
        throw new Error("Nhập ngân sách nguyên không âm và số ngày hợp lệ.");
      const options = {
        referenceDate: reference,
        lookbackDays: days,
        targetCoverDays: target,
      };
      const restock = computeRestockRecommendations(
        state.inventory,
        state.orders,
        options,
      );
      return {
        options,
        kpis: computeOperationsKPIs(state.inventory, state.orders, options),
        sellers: computeTopSellersAndABC(state.inventory, state.orders, {
          referenceDate: reference,
          lookbackDays: days,
          sortBy: sort,
        }),
        restock,
        allocation: allocateRestockWithinBudget(restock, cash),
        input: { state, ...options, budgetVnd: cash },
      };
    } catch {
      return null;
    }
  }, [state, reference, lookback, cover, budget, sort]);
  useEffect(() => {
    let current = true;
    setEvidence(null);
    setAdvice(null);
    setLoadingAi(false);
    request.current?.abort();
    if (state && derived)
      computeFileSha256(new TextEncoder().encode(JSON.stringify(state)).buffer)
        .then((hash) => {
          if (current)
            setEvidence(
              buildOperationsREAEvidencePayload(state, {
                ...derived.options,
                sourceFileHash: hash,
                sourceFileName: "operations-snapshot.json",
              }),
            );
        })
        .catch((e) => current && setError(redactSensitiveLog(e)));
    return () => {
      current = false;
    };
  }, [state, reference, lookback, cover, budget]);
  const stamp = () =>
    demo
      ? new Date(
          Math.max(
            Date.parse(reference),
            ...state!.orders.map((o) => Date.parse(o.updatedAt)),
            ...state!.movements.map((m) => Date.parse(m.timestamp)),
          ) + 1000,
        ).toISOString()
      : new Date().toISOString();
  const context = (note: string, time = stamp()) => ({
    operationId: crypto.randomUUID(),
    actorId: userId.slice(0, 100) || "local-user",
    timestamp: time,
    note,
  });
  async function commit(change: (s: OperationsState) => OperationsState) {
    if (!record || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const next = OperationsStateSchema.parse(
        change(structuredClone(record.state)),
      );
      const saved = await saveOperationsWorkspace(scope, record.revision, next);
      if (alive.current) {
        setRecord(saved);
        setReference(demo ? stamp() : new Date().toISOString());
        setModal(null);
        setQr(null);
      }
    } catch (e) {
      if (alive.current) setError(redactSensitiveLog(e));
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const command = (cmd: OperationsCommand) =>
    commit((s) => applyOperationsCommand(s, cmd).state);
  async function reload() {
    try {
      setRecord(await loadOperationsWorkspace(scope));
      setError("");
    } catch (e) {
      setError(redactSensitiveLog(e));
    }
  }
  async function showQr(order: SalesOrder) {
    setError("");
    try {
      const response = await apiFetch("/api/operations/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (alive.current) setQr({ ...data, orderId: order.id });
    } catch (e) {
      setError(redactSensitiveLog(e));
    }
  }
  async function runAi() {
    if (!derived || loadingAi) return;
    setError("");
    setAdvice(null);
    setLoadingAi(true);
    const ctrl = new AbortController();
    request.current = ctrl;
    try {
      const result = await generateOperationsAIAdvisory(
        derived.input,
        ctrl.signal,
      );
      if (!ctrl.signal.aborted && alive.current) setAdvice(result);
    } catch (e) {
      if (!ctrl.signal.aborted && alive.current)
        setError(redactSensitiveLog(e));
    } finally {
      if (request.current === ctrl && alive.current) setLoadingAi(false);
    }
  }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    const fd = new FormData(event.currentTarget),
      str = (k: string) => String(fd.get(k) || "").trim(),
      num = (k: string) => {
        if (!str(k)) throw new Error(`Thiếu ${k}`);
        return Number(str(k));
      };
    try {
      const ctx = context(str("note") || "Thao tác workspace");
      if (modal.kind === "SKU")
        void commit((s) => {
          const item = InventoryItemSchema.parse({
            id: crypto.randomUUID(),
            sku: str("sku"),
            name: str("name"),
            category: str("category"),
            unit: str("unit"),
            costPrice: 0,
            sellingPrice: num("price"),
            taxRate: num("tax"),
            onHandQty: 0,
            reservedQty: 0,
            availableQty: 0,
            leadTimeDays: num("lead"),
            safetyStockQty: num("safety"),
            createdAt: ctx.timestamp,
            lastSoldAt: null,
            lastRestockedAt: null,
          });
          s.inventory.push(item);
          return s;
        });
      if (modal.kind === "ORDER")
        void commit((s) => {
          const item = s.inventory.find((i) => i.id === str("skuId"));
          if (!item) throw new Error("Chọn SKU hợp lệ.");
          const line = calculateOrderLine({
            skuId: item.id,
            skuCode: item.sku,
            name: item.name,
            unit: item.unit,
            qty: num("qty"),
            unitPrice: item.sellingPrice,
            costPriceAtSale: item.costPrice,
            discountAmount: 0,
            taxRate: item.taxRate,
          });
          const id = crypto.randomUUID();
          const totals = calculateOrderTotals([line]);
          const order = SalesOrderSchema.parse({
            id,
            orderCode: `ORD-${id.slice(0, 8)}`,
            createdAt: ctx.timestamp,
            updatedAt: ctx.timestamp,
            deliveredAt: null,
            customerName: str("customer"),
            customerPhone: str("phone"),
            customerTaxCode: str("taxCode") || null,
            buyerRequiresInvoice: true,
            items: [line],
            ...totals,
            paidAmount: 0,
            paymentStatus: totals.grandTotalAmount === 0 ? "PAID" : "UNPAID",
            fulfillmentStatus: "DRAFT",
            invoiceStatus: "NOT_REQUIRED",
            invoiceMeta: null,
          });
          s.orders.push(order);
          return applyOperationsCommand(s, {
            type: "TRANSITION_ORDER",
            orderId: id,
            nextStatus: "CONFIRMED",
            context: ctx,
          }).state;
        });
      if (modal.kind === "RECEIVE")
        void command({
          type: "RECEIVE_STOCK",
          skuId: modal.id!,
          qty: num("qty"),
          unitCost: num("cost"),
          referenceCode: str("reference"),
          context: ctx,
        });
      if (modal.kind === "PAYMENT")
        void command({
          type: "RECORD_PAYMENT",
          orderId: modal.id!,
          paidAmount: num("paid"),
          context: ctx,
        });
      if (modal.kind === "INVOICE")
        void command({
          type: "RECORD_INVOICE",
          orderId: modal.id!,
          invoice: {
            invoiceNumber: str("number"),
            invoiceSymbol: str("symbol"),
            issuedAt: new Date(str("issued")).toISOString(),
            ...(str("url") ? { lookupUrl: str("url") } : {}),
          },
          context: ctx,
        });
      if (modal.kind === "BATCH" && derived)
        void commit((s) => {
          for (const item of derived.allocation.allocatedItems.filter(
            (i) => i.allocatedQty > 0,
          )) {
            s = applyOperationsCommand(s, {
              type: "RECEIVE_STOCK",
              skuId: item.skuId,
              qty: num(`qty-${item.skuId}`),
              unitCost: num(`cost-${item.skuId}`),
              referenceCode: str("reference"),
              context: { ...ctx, operationId: crypto.randomUUID() },
            }).state;
          }
          return s;
        });
    } catch (e) {
      setError(redactSensitiveLog(e));
    }
  }
  const currentOrder = state?.orders.find((o) => o.id === modal?.id);
  return (
    <section className="bg-slate-950 text-slate-100 p-3 md:p-6 rounded-2xl space-y-4">
      <header className={panel}>
        {evidence && (
          <button
            className={button}
            onClick={() => setModal({ kind: "EVIDENCE" })}
          >
            {evidence.unknowns.length} mục cần rà soát trong Evidence
          </button>
        )}
        <h1 className="text-2xl font-bold">
          Điều hành Kho • Đơn hàng • Hóa đơn
        </h1>
        <p className="text-sm text-slate-400 my-2">
          Evidence v2 · Dữ liệu lưu trên trình duyệt này, chưa đồng bộ máy khác.
          Nhật ký chưa có chữ ký kiểm toán.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={busy}
            onClick={() => {
              setModal(null);
              setQr(null);
              setDemo(!demo);
            }}
          >
            {demo ? "Về dữ liệu thực" : "Mở không gian dữ liệu mẫu"}
          </button>
          <button className={button} disabled={!scope || busy} onClick={reload}>
            Tải lại dữ liệu
          </button>
          <button
            className={button}
            disabled={!state || busy}
            onClick={() => setModal({ kind: "SKU" })}
          >
            + Thêm SKU
          </button>
          <button
            className={button}
            disabled={!state?.inventory.length || busy}
            onClick={() => setModal({ kind: "ORDER" })}
          >
            + Tạo đơn
          </button>
          <button
            className={button}
            disabled={!evidence}
            onClick={() => setModal({ kind: "EVIDENCE" })}
          >
            Evidence JSON
          </button>
        </div>
      </header>
      {demo && (
        <div className="p-3 bg-amber-950 text-amber-200">
          DỮ LIỆU MẪU — tách biệt dữ liệu thực.{" "}
          <button
            className={button}
            disabled={!record || busy || !!state?.inventory.length}
            onClick={() => commit(() => createMockOperationsState())}
          >
            Nạp bộ mẫu 10 SKU / 12 đơn
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="p-3 rounded bg-rose-950 text-rose-200">
          {error}
        </p>
      )}
      {!record ? (
        <p role="status">
          {error ? "Không thể mở dữ liệu." : "Đang mở dữ liệu…"}
        </p>
      ) : (
        <>
          <div className={`${panel} flex flex-wrap gap-3 items-end`}>
            <label>
              Ngân sách (₫)
              <input
                aria-label="Ngân sách"
                className="block bg-slate-800 p-2 w-44"
                type="number"
                min="0"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
            <label>
              Kỳ bán (ngày)
              <input
                aria-label="Kỳ bán"
                className="block bg-slate-800 p-2 w-24"
                type="number"
                min="1"
                max="3650"
                value={lookback}
                onChange={(e) => setLookback(e.target.value)}
              />
            </label>
            <label>
              Dự trữ (ngày)
              <input
                aria-label="Ngày dự trữ"
                className="block bg-slate-800 p-2 w-24"
                type="number"
                min="1"
                max="365"
                value={cover}
                onChange={(e) => setCover(e.target.value)}
              />
            </label>
            <span className="text-xs">
              Mốc: {new Date(reference).toLocaleString("vi-VN")}
            </span>
            <button
              className={button}
              onClick={() =>
                setReference(demo ? stamp() : new Date().toISOString())
              }
            >
              Cập nhật mốc
            </button>
          </div>
          {!derived && (
            <p role="alert">
              Ngân sách hoặc số ngày không hợp lệ. Hãy sửa trước khi phân tích.
            </p>
          )}
          {derived && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {[
                [
                  "Giá trị kho theo vốn",
                  money(derived.kpis.totalInventoryValueAtCost),
                ],
                ["Vốn cần nhập", money(derived.kpis.totalRestockCapitalNeeded)],
                ["Doanh thu đơn đã giao", money(derived.kpis.deliveredRevenue)],
                [
                  "Hóa đơn cần rà soát",
                  String(derived.kpis.uninvoicedDeliveredCount),
                ],
              ].map(([label, value]) => (
                <div key={label} className={panel}>
                  <p className="text-slate-400 text-sm">{label}</p>
                  <strong className="text-xl">{value}</strong>
                </div>
              ))}
            </div>
          )}
          <nav className="flex gap-2 flex-wrap" aria-label="Phân hệ vận hành">
            {[
              ["ORDERS", "Đơn hàng & hóa đơn"],
              ["INVENTORY", "Tồn kho & nhật ký"],
              ["ANALYTICS", "Bán chạy & ABC"],
              ["RESTOCK", "Nhập hàng & tư vấn"],
            ].map(([id, label]) => (
              <button
                className={`${button} ${tab === id ? "!bg-indigo-700" : ""}`}
                aria-pressed={tab === id}
                key={id}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {tab === "ORDERS" && (
            <>
              <div className="flex gap-2 flex-wrap">
                <input
                  aria-label="Tìm đơn hàng"
                  className="bg-slate-800 p-2 rounded"
                  placeholder="Mã đơn, khách, MST, SĐT"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  aria-label="Lọc đơn hàng"
                  className="bg-slate-800 p-2"
                  value={preset}
                  onChange={(e) =>
                    setPreset(e.target.value as OrderControlPreset)
                  }
                >
                  {[
                    ["ALL", "Tất cả"],
                    ["UNINVOICED_ALERT", "Cần rà soát hóa đơn"],
                    ["IN_TRANSIT", "Giữ hàng / đang giao"],
                    ["DELIVERED", "Đã giao"],
                    ["UNPAID_DELIVERED", "Đã giao còn nợ"],
                    ["INVOICED", "Đã ghi nhận hóa đơn"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <Table
                headers={[
                  "Đơn / khách hàng",
                  "Mặt hàng",
                  "Tổng / lãi gộp",
                  "Giao vận",
                  "Thanh toán",
                  "Hóa đơn",
                ]}
              >
                {filterOrdersByControlPreset(state!.orders, preset, search).map(
                  (o) => (
                    <tr key={o.id}>
                      <td>
                        {o.orderCode}
                        <br />
                        {o.customerName}
                        <br />
                        {o.customerPhone || "Chưa có SĐT"}
                      </td>
                      <td>
                        {o.items.map((i) => (
                          <div key={i.skuId}>
                            {i.name} × {i.qty}
                          </div>
                        ))}
                      </td>
                      <td>
                        {money(o.grandTotalAmount)}
                        <br />
                        <span className="text-slate-400">
                          Lãi: {money(o.estimatedGrossProfit)}
                        </span>
                      </td>
                      <td>
                        <select
                          aria-label={`Giao vận ${o.orderCode}`}
                          disabled={
                            busy || !transitions[o.fulfillmentStatus].length
                          }
                          className="bg-slate-800 p-2"
                          value={o.fulfillmentStatus}
                          onChange={(e) =>
                            command({
                              type: "TRANSITION_ORDER",
                              orderId: o.id,
                              nextStatus: e.target.value as FulfillmentStatus,
                              context: context("Đổi trạng thái giao vận"),
                            })
                          }
                        >
                          {[
                            o.fulfillmentStatus,
                            ...transitions[o.fulfillmentStatus],
                          ].map((v) => (
                            <option key={v} value={v}>
                              {statuses[v]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        Còn {money(o.grandTotalAmount - o.paidAmount)}
                        <div className="flex gap-1 mt-2">
                          {!demo &&
                            !["CANCELLED", "RETURNED"].includes(
                              o.fulfillmentStatus,
                            ) &&
                            o.paidAmount < o.grandTotalAmount && (
                              <button
                                className={button}
                                onClick={() => showQr(o)}
                              >
                                VietQR
                              </button>
                            )}
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() =>
                              setModal({ kind: "PAYMENT", id: o.id })
                            }
                          >
                            Ghi nhận thu / hoàn
                          </button>
                        </div>
                      </td>
                      <td>
                        {o.invoiceMeta ? (
                          `${o.invoiceMeta.invoiceSymbol} / ${o.invoiceMeta.invoiceNumber}`
                        ) : !["CANCELLED", "RETURNED"].includes(
                            o.fulfillmentStatus,
                          ) ? (
                          <button
                            className={button}
                            disabled={busy}
                            onClick={() =>
                              setModal({ kind: "INVOICE", id: o.id })
                            }
                          >
                            Ghi nhận HĐ đã phát hành
                          </button>
                        ) : (
                          "Cần rà soát hoàn/hủy"
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </Table>
              {!state!.orders.length && (
                <p>Chưa có đơn. Thêm SKU, nhập hàng rồi tạo đơn.</p>
              )}
            </>
          )}
          {tab === "INVENTORY" && (
            <>
              <Table
                headers={[
                  "SKU / mặt hàng",
                  "Giá vốn WAC / giá bán",
                  "Thực tế / giữ / khả dụng",
                  "Thao tác",
                ]}
              >
                {state!.inventory.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.sku}
                      <br />
                      {i.name}
                    </td>
                    <td>
                      {money(i.costPrice)} / {money(i.sellingPrice)}
                    </td>
                    <td>
                      {i.onHandQty} / {i.reservedQty} / {i.availableQty}{" "}
                      {i.unit}
                    </td>
                    <td>
                      <button
                        className={button}
                        disabled={busy}
                        onClick={() => setModal({ kind: "RECEIVE", id: i.id })}
                      >
                        Nhận hàng vào kho
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
              <div className={panel}>
                <h2 className="font-bold">Nhật ký biến động kho</h2>
                <div className="max-h-96 overflow-auto">
                  {[...state!.movements].reverse().map((m) => (
                    <p
                      className="border-b border-slate-700 py-2 text-sm"
                      key={m.id}
                    >
                      {m.skuCode} · {m.note} · {m.referenceCode}
                      <br />
                      {new Date(m.timestamp).toLocaleString("vi-VN")} ·{" "}
                      {m.actorId}
                      <br />
                      Tồn {m.previousOnHand} → {m.newOnHand}; giữ{" "}
                      {m.previousReserved} → {m.newReserved}
                    </p>
                  ))}
                </div>
              </div>
            </>
          )}
          {tab === "ANALYTICS" && derived && (
            <>
              <p>
                ABC theo doanh thu: 80% / 95%. Bao gồm đơn giữ hàng, đang giao
                và đã giao; lãi gộp không phải tiền thực thu.
              </p>
              <select
                aria-label="Sắp xếp bán chạy"
                className="bg-slate-800 p-2"
                value={sort}
                onChange={(e) => setSort(e.target.value as TopSellerSortMode)}
              >
                <option value="REVENUE">Doanh thu</option>
                <option value="PROFIT">Lãi gộp</option>
                <option value="VOLUME">Sản lượng</option>
              </select>
              <Table
                headers={[
                  "SKU / ABC",
                  "Số lượng",
                  "Doanh thu / lãi",
                  "Tỷ trọng / lũy kế",
                  "Vốn tồn",
                ]}
              >
                {derived.sellers.map((i) => (
                  <tr key={i.skuId}>
                    <td>
                      {i.sku} · {i.name} · Nhóm {i.abcClass}
                    </td>
                    <td>{i.totalSoldQty}</td>
                    <td>
                      {money(i.netRevenue)} / {money(i.grossProfit)}
                    </td>
                    <td>
                      {i.revenueSharePct}% / {i.cumulativeSharePct}%
                      <progress
                        className="w-28 block"
                        value={i.revenueSharePct}
                        max={100}
                      />
                    </td>
                    <td>
                      {money(i.tiedUpCapital)}
                      {i.isDeadStock && (
                        <p className="text-amber-300">
                          Chậm bán {i.daysSinceLastSale} ngày
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </>
          )}
          {tab === "RESTOCK" && derived && (
            <>
              <div className={panel}>
                <p>
                  Phân bổ: {money(derived.allocation.totalAllocatedCost)} · còn{" "}
                  {money(derived.allocation.remainingBudget)}. Đây là kế hoạch;
                  chưa cộng hàng vào kho.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    className={button}
                    onClick={() => {
                      request.current?.abort();
                      setLoadingAi(false);
                      setAdvice(buildOperationsAdvisory(derived.input));
                    }}
                  >
                    Xem tư vấn quy tắc
                  </button>
                  <button
                    className={button}
                    disabled={loadingAi}
                    onClick={runAi}
                  >
                    {loadingAi
                      ? "Gemini đang phân tích…"
                      : "Phân tích Gemini bằng key đã xác thực"}
                  </button>
                  <button
                    className={button}
                    disabled={
                      busy ||
                      !derived.allocation.allocatedItems.some(
                        (i) => i.allocatedQty > 0,
                      )
                    }
                    onClick={() => setModal({ kind: "BATCH" })}
                  >
                    Ghi nhận hàng đã nhận theo kế hoạch
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Gemini nhận số liệu kho/KPI đã rút gọn, không gửi tên khách,
                  SĐT, MST, tài khoản ngân hàng hoặc toàn bộ Evidence. Tư vấn AI
                  cần người dùng rà soát.
                </p>
              </div>
              {advice && (
                <div className={panel}>
                  <h2 className="text-indigo-300 font-bold">
                    {advice.sourceMode === "GEMINI_BYOK_LIVE"
                      ? "Suy luận Gemini — chưa được xác minh"
                      : "Tư vấn theo quy tắc — không phải kết quả AI"}
                  </h2>
                  <p>{advice.executiveSummary}</p>
                  <div className="grid lg:grid-cols-3 gap-4 mt-3">
                    <div>
                      <h3>Phân bổ vốn</h3>
                      {advice.cashFlowAllocationAdvice.map((i) => (
                        <p className="py-2 text-sm" key={i.sku}>
                          <strong>
                            {i.sku} — {i.name}
                          </strong>
                          <br />
                          {i.recommendedAction}
                          <br />
                          {i.priorityReason}
                        </p>
                      ))}
                    </div>
                    <div>
                      <h3>Hàng chậm bán</h3>
                      {advice.deadStockLiquidationStrategies.map((i) => (
                        <p className="py-2 text-sm" key={i.sku}>
                          {i.name} · {money(i.tiedUpCapital)}
                          <br />
                          {i.suggestedBundleOrDiscount}
                        </p>
                      ))}
                    </div>
                    <div>
                      <h3>Cần rà soát</h3>
                      {advice.taxAndInvoiceComplianceWarnings.map((w, i) => (
                        <p className="py-2 text-sm" key={i}>
                          {w}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <Table
                headers={[
                  "SKU / mức / ABC",
                  "Khả dụng / tốc độ",
                  "ROP / đề xuất",
                  "Phân bổ / chi phí",
                  "Lý do",
                ]}
              >
                {derived.restock.map((i) => {
                  const a = derived.allocation.allocatedItems.find(
                    (a) => a.skuId === i.skuId,
                  );
                  return (
                    <tr key={i.skuId}>
                      <td>
                        {i.sku} · {i.urgencyLevel} · {i.abcClass}
                      </td>
                      <td>
                        {i.currentAvailableQty} / {i.dailySalesVelocity} mỗi
                        ngày
                      </td>
                      <td>
                        {i.reorderPoint} / {i.recommendedOrderQty}
                      </td>
                      <td>
                        {a?.allocatedQty ?? 0} / {money(a?.allocatedCost ?? 0)}
                      </td>
                      <td>{i.actionReason}</td>
                    </tr>
                  );
                })}
              </Table>
            </>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        onCancel={() => {
          setModal(null);
          setQr(null);
        }}
        className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-600 p-5 w-[min(95vw,760px)] max-h-[90vh] overflow-auto backdrop:bg-black/75"
      >
        <button
          className={`${button} float-right`}
          onClick={() => {
            setModal(null);
            setQr(null);
          }}
        >
          Đóng
        </button>
        {qr && (
          <div>
            <h2 className="text-xl font-bold">Thu tiền VietQR</h2>
            <img
              className="mx-auto my-4"
              width={260}
              height={260}
              src={qr.qrImageUrl}
              alt="QR chuyển khoản"
            />
            <p>
              {qr.bankConfig.accountName} · {qr.bankConfig.bankBin} ·{" "}
              {qr.bankConfig.accountNo}
            </p>
            <p>
              {money(qr.amountToCollect)} · {qr.transferMemo}
            </p>
            <p>
              QR không xác nhận tiền đã về. Đối chiếu sao kê trước khi ghi nhận
              thu.
            </p>
            <button
              className={button}
              onClick={() => {
                setModal({ kind: "PAYMENT", id: qr.orderId });
                setQr(null);
              }}
            >
              Ghi nhận sau đối chiếu
            </button>
          </div>
        )}
        {modal?.kind === "EVIDENCE" ? (
          <>
            <h2>Evidence vận hành — 4 tầng</h2>
            <pre className="text-xs whitespace-pre-wrap mt-4">
              {JSON.stringify(
                evidence
                  ? {
                      ...evidence,
                      inferences: advice
                        ? [
                            {
                              id: "operations-advisory",
                              sourceMode: advice.sourceMode,
                              reviewStatus: "UNREVIEWED",
                              statement: JSON.stringify(advice),
                              evidenceRefs: [
                                "derivations.kpis",
                                "derivations.restock",
                                "derivations.topSellers",
                              ],
                            },
                          ]
                        : [],
                    }
                  : null,
                null,
                2,
              )}
            </pre>
          </>
        ) : (
          modal && (
            <form onSubmit={submit} key={`${modal.kind}:${modal.id}`}>
              <h2 className="text-xl font-bold mb-4">
                {
                  {
                    SKU: "Thêm SKU (tồn ban đầu bằng 0)",
                    ORDER: "Tạo đơn và giữ hàng",
                    RECEIVE: "Nhận hàng thực tế",
                    PAYMENT: "Ghi nhận tổng đã thu sau đối chiếu",
                    INVOICE: "Ghi nhận hóa đơn đã phát hành",
                    BATCH: "Xác nhận hàng đã nhận thực tế",
                  }[modal.kind]
                }
              </h2>
              {error && (
                <p role="alert" className="text-rose-300 mb-3">
                  {error}
                </p>
              )}
              {modal.kind === "SKU" && (
                <>
                  <Field label="Mã SKU" name="sku" />
                  <Field label="Tên mặt hàng" name="name" />
                  <Field label="Nhóm hàng" name="category" />
                  <Field label="Đơn vị tính" name="unit" />
                  <Field
                    label="Giá bán (₫)"
                    name="price"
                    type="number"
                    min={0}
                  />
                  <label>
                    Thuế suất
                    <select name="tax" className="bg-slate-800 p-2 mx-3">
                      {[0, 5, 8, 10].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Lead time (ngày)"
                    name="lead"
                    type="number"
                    min={0}
                    value={0}
                  />
                  <Field
                    label="Tồn an toàn"
                    name="safety"
                    type="number"
                    min={0}
                    value={0}
                  />
                </>
              )}
              {modal.kind === "ORDER" && (
                <>
                  <Field label="Khách hàng" name="customer" />
                  <Field label="SĐT (tùy chọn)" name="phone" required={false} />
                  <Field
                    label="MST (tùy chọn)"
                    name="taxCode"
                    required={false}
                  />
                  <label>
                    Mặt hàng
                    <select
                      name="skuId"
                      className="block bg-slate-800 p-2 w-full mb-3"
                    >
                      {state?.inventory.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.sku} · {i.name} · khả dụng {i.availableQty}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field
                    label="Số lượng"
                    name="qty"
                    type="number"
                    min={1}
                    value={1}
                  />
                </>
              )}
              {modal.kind === "RECEIVE" && (
                <>
                  <Field
                    label="Số lượng đã nhận"
                    name="qty"
                    type="number"
                    min={1}
                  />
                  <Field
                    label="Đơn giá nhập thực tế (₫)"
                    name="cost"
                    type="number"
                    min={0}
                  />
                  <Field label="Chứng từ nhập" name="reference" />
                </>
              )}
              {modal.kind === "PAYMENT" && (
                <>
                  <p>
                    Tổng đơn {money(currentOrder!.grandTotalAmount)}; hiện đã
                    thu {money(currentOrder!.paidAmount)}. Nhập tổng lũy kế sau
                    thu/hoàn, không phải khoản cộng thêm.
                  </p>
                  <Field
                    label="Tổng đã thu (₫)"
                    name="paid"
                    type="number"
                    min={0}
                    value={currentOrder!.paidAmount}
                  />
                  <Field label="Chứng từ / lý do đối chiếu" name="note" />
                </>
              )}
              {modal.kind === "INVOICE" && (
                <>
                  <p className="text-amber-300 mb-3">
                    Chỉ lưu thông tin hóa đơn đã phát hành tại nhà cung cấp.
                    Không ký số hoặc cấp mã thuế tại đây.
                  </p>
                  <Field label="Ký hiệu hóa đơn" name="symbol" />
                  <Field label="Số hóa đơn thực tế" name="number" />
                  <Field
                    label="Thời điểm phát hành"
                    name="issued"
                    type="datetime-local"
                    step="1"
                  />
                  <Field
                    label="URL tra cứu HTTPS (tùy chọn)"
                    name="url"
                    type="url"
                    required={false}
                  />
                </>
              )}
              {modal.kind === "BATCH" && (
                <>
                  <p>
                    Kiểm tra số lượng, giá nhập theo chứng từ. Các thay đổi được
                    lưu cùng một giao dịch; không tự trừ ngân sách kế hoạch.
                  </p>
                  <Field label="Chứng từ nhập" name="reference" />
                  {derived?.allocation.allocatedItems
                    .filter((i) => i.allocatedQty > 0)
                    .map((i) => (
                      <fieldset
                        className="border border-slate-700 p-3 mb-3"
                        key={i.skuId}
                      >
                        <legend>
                          {i.sku} · {i.name}
                        </legend>
                        <Field
                          label="Số lượng thực nhận"
                          name={`qty-${i.skuId}`}
                          value={i.allocatedQty}
                          type="number"
                          min={1}
                        />
                        <Field
                          label="Đơn giá thực nhập (₫ nguyên)"
                          name={`cost-${i.skuId}`}
                          type="number"
                          min={0}
                        />
                      </fieldset>
                    ))}
                  <label className="block mb-3">
                    <input type="checkbox" required /> Tôi đã kiểm đếm hàng và
                    kiểm tra chứng từ.
                  </label>
                </>
              )}
              <button
                disabled={busy}
                className={`${button} !bg-indigo-700 w-full`}
                type="submit"
              >
                {busy ? "Đang lưu…" : "Xác nhận ghi nhận"}
              </button>
            </form>
          )
        )}
      </dialog>
    </section>
  );
}
