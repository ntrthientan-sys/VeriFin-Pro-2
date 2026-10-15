import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InventoryItemSchema,
  SalesOrderSchema,
  OperationsStateSchema,
  OperationsEvidenceSchema,
  type InventoryItem,
  type SalesOrder,
  type OperationContext,
  type OperationsState,
  type FulfillmentStatus,
} from "../src/schemas/inventoryOrderSchema";
import {
  calculateOrderLine,
  calculateOrderTotals,
  syncInventoryOnOrderStatusChange,
  receiveInventoryStock,
  adjustInventoryStock,
  recordOrderPayment,
  issueOrderEInvoice,
  applyOperationsCommand,
  computeTopSellersAndABC,
  computeRestockRecommendations,
  allocateRestockWithinBudget,
  filterOrdersByControlPreset,
  isOrderRequiringUrgentInvoice,
  computeOperationsKPIs,
  buildOperationsREAEvidencePayload,
} from "../src/services/inventoryAnalyticsEngine";
import {
  createMockOperationsState,
  MOCK_REFERENCE_DATE,
} from "../src/data/inventoryOrderMockData";
import { evaluateFailClosedGate } from "../src/schemas/evidenceSchema";
const now = "2026-10-15T12:00:00.000Z";
const opts = { referenceDate: now, lookbackDays: 30 };
const event = (id = "test", timestamp = now): OperationContext => ({
  operationId: id,
  actorId: "tester",
  timestamp,
  note: "Test transaction",
});
function sku(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return InventoryItemSchema.parse({
    id: "sku",
    sku: "TEST-SKU",
    name: "Test item",
    category: "Test",
    unit: "Cái",
    costPrice: 100,
    sellingPrice: 200,
    taxRate: 8,
    onHandQty: 10,
    reservedQty: 0,
    availableQty: 10,
    leadTimeDays: 3,
    safetyStockQty: 2,
    createdAt: "2026-07-01T00:00:00Z",
    lastSoldAt: null,
    lastRestockedAt: null,
    ...overrides,
  });
}
function order(
  item: InventoryItem,
  qty = 2,
  overrides: Partial<SalesOrder> = {},
): SalesOrder {
  const items = [
    calculateOrderLine({
      skuId: item.id,
      skuCode: item.sku,
      name: item.name,
      unit: item.unit,
      qty,
      unitPrice: item.sellingPrice,
      costPriceAtSale: item.costPrice,
      discountAmount: 0,
      taxRate: item.taxRate,
    }),
  ];
  return SalesOrderSchema.parse({
    id: "order",
    orderCode: "TEST-ORDER",
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    deliveredAt: null,
    customerName: "Synthetic",
    customerPhone: "",
    customerTaxCode: null,
    buyerRequiresInvoice: true,
    items,
    ...calculateOrderTotals(items),
    paidAmount: 0,
    fulfillmentStatus: "DRAFT",
    paymentStatus: "UNPAID",
    invoiceStatus: "NOT_REQUIRED",
    invoiceMeta: null,
    ...overrides,
  });
}
function emptyState(item = sku(), sales = order(item)): OperationsState {
  return {
    schemaVersion: "1.0.0",
    datasetKind: "LIVE",
    inventory: [item],
    orders: [sales],
    movements: [],
    processedOperations: [],
  };
}
function delivered(
  item: InventoryItem,
  qty: number,
  id: string,
  date = now,
): SalesOrder {
  return order(item, qty, {
    id,
    orderCode: id,
    fulfillmentStatus: "DELIVERED",
    createdAt: date,
    deliveredAt: date,
    updatedAt: date,
  });
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

test("Phase 1 seed: 10 SKUs, 12 orders, all tracks, complete matching reservation and movement ledger", () => {
  const state = createMockOperationsState();
  assert.ok(OperationsStateSchema.safeParse(state).success);
  assert.equal(state.inventory.length, 10);
  assert.equal(state.orders.length, 12);
  assert.equal(state.movements.length, 50);
  assert.deepEqual(
    new Set(state.orders.map((o) => o.fulfillmentStatus)),
    new Set([
      "DRAFT",
      "CONFIRMED",
      "SHIPPING",
      "DELIVERED",
      "RETURNED",
      "CANCELLED",
    ]),
  );
  assert.deepEqual(
    new Set(state.orders.map((o) => o.paymentStatus)),
    new Set(["UNPAID", "PARTIAL", "PAID"]),
  );
  assert.deepEqual(
    new Set(state.orders.map((o) => o.invoiceStatus)),
    new Set(["NOT_REQUIRED", "PENDING_INVOICE", "INVOICED"]),
  );
  assert.deepEqual(createMockOperationsState(), state);
  const changed = structuredClone(state);
  changed.inventory[0].onHandQty++;
  changed.inventory[0].availableQty++;
  assert.equal(OperationsStateSchema.safeParse(changed).success, false);
  assert.ok(state.orders.every((o) => !o.invoiceMeta?.taxAuthorityCode));
});
test("Schemas reject forged quantities, monetary totals, discount excess, dates, duplicates and invoice metadata mismatch", () => {
  const item = sku(),
    sales = order(item);
  assert.equal(
    InventoryItemSchema.safeParse({ ...item, availableQty: 999 }).success,
    false,
  );
  assert.equal(
    SalesOrderSchema.safeParse({
      ...sales,
      grandTotalAmount: sales.grandTotalAmount + 1,
    }).success,
    false,
  );
  assert.equal(
    SalesOrderSchema.safeParse({
      ...sales,
      paidAmount: 10,
      paymentStatus: "PAID",
    }).success,
    false,
  );
  assert.equal(
    SalesOrderSchema.safeParse({ ...sales, invoiceStatus: "INVOICED" }).success,
    false,
  );
  assert.equal(
    SalesOrderSchema.safeParse({ ...sales, createdAt: "not-a-date" }).success,
    false,
  );
  const { lineNetTotal, lineTaxAmount, lineGrandTotal, ...input } =
    sales.items[0];
  assert.throws(() => calculateOrderLine({ ...input, discountAmount: 10000 }));
  assert.equal(
    OperationsStateSchema.safeParse({ ...emptyState(), orders: [sales, sales] })
      .success,
    false,
  );
  assert.equal(
    InventoryItemSchema.safeParse({ ...item, onHandQty: Infinity }).success,
    false,
  );
});
test("Line math uses whole VND half-up rounding and includes discount in profit", () => {
  const line = calculateOrderLine({
    skuId: "sku",
    skuCode: "SKU",
    name: "Line",
    unit: "Cái",
    qty: 3,
    unitPrice: 103,
    costPriceAtSale: 50,
    discountAmount: 9,
    taxRate: 5,
  });
  assert.equal(line.lineNetTotal, 300);
  assert.equal(line.lineTaxAmount, 15);
  assert.equal(line.lineGrandTotal, 315);
  assert.equal(calculateOrderTotals([line]).estimatedGrossProfit, 150);
  const { lineNetTotal, lineTaxAmount, lineGrandTotal, ...lineInput } = line;
  const half = calculateOrderLine({
    ...lineInput,
    qty: 1,
    unitPrice: 10,
    discountAmount: 0,
  });
  assert.equal(half.lineTaxAmount, 1);
  assert.throws(() =>
    calculateOrderLine({
      ...lineInput,
      qty: 1_000_000_000,
      unitPrice: Number.MAX_SAFE_INTEGER,
    }),
  );
});
test("Reserve -> ship -> deliver is atomic, preserves inputs and releases reservation exactly once", () => {
  const item = sku(),
    sales = order(item);
  deepFreeze(item);
  deepFreeze(sales);
  const confirmed = syncInventoryOnOrderStatusChange(
    [item],
    sales,
    "CONFIRMED",
    event(),
  );
  assert.equal(confirmed.updatedInventory[0].onHandQty, 10);
  assert.equal(confirmed.updatedInventory[0].reservedQty, 2);
  assert.equal(confirmed.updatedInventory[0].availableQty, 8);
  const shipping = syncInventoryOnOrderStatusChange(
    confirmed.updatedInventory,
    confirmed.updatedOrder,
    "SHIPPING",
    event("ship"),
  );
  assert.equal(shipping.movements.length, 0);
  const done = syncInventoryOnOrderStatusChange(
    shipping.updatedInventory,
    shipping.updatedOrder,
    "DELIVERED",
    event("deliver"),
  );
  assert.equal(done.updatedInventory[0].onHandQty, 8);
  assert.equal(done.updatedInventory[0].reservedQty, 0);
  assert.equal(done.updatedOrder.invoiceStatus, "PENDING_INVOICE");
  const replay = syncInventoryOnOrderStatusChange(
    done.updatedInventory,
    done.updatedOrder,
    "DELIVERED",
    event("again"),
  );
  assert.equal(replay.movements.length, 0);
  assert.equal(replay.updatedInventory[0].onHandQty, 8);
  assert.equal(item.onHandQty, 10);
  assert.equal(sales.fulfillmentStatus, "DRAFT");
});
test("Unknown SKU and any multi-line shortage fail closed without partial stock changes", () => {
  const item = sku(),
    other = sku({ id: "other", sku: "OTHER", onHandQty: 1, availableQty: 1 });
  const sale = order(item);
  sale.items.push({ ...order(other, 2).items[0] });
  Object.assign(sale, calculateOrderTotals(sale.items));
  const before = structuredClone([item, other]);
  assert.throws(
    () =>
      syncInventoryOnOrderStatusChange(
        [item, other],
        sale,
        "CONFIRMED",
        event(),
      ),
    /INSUFFICIENT/,
  );
  assert.deepEqual([item, other], before);
  assert.throws(
    () => syncInventoryOnOrderStatusChange([item], sale, "DELIVERED", event()),
    /UNKNOWN_SKU/,
  );
  const reserved = sku({ reservedQty: 9, availableQty: 1 });
  assert.throws(
    () =>
      syncInventoryOnOrderStatusChange(
        [reserved],
        order(reserved, 2),
        "DELIVERED",
        event(),
      ),
    /INSUFFICIENT/,
  );
});
test("Cancel/return before delivery release only reservation; delivered cancellation and terminal reopening are rejected", () => {
  const initial = syncInventoryOnOrderStatusChange(
    [sku()],
    order(sku()),
    "CONFIRMED",
    event(),
  );
  for (const target of ["CANCELLED", "RETURNED"] as const) {
    const result = syncInventoryOnOrderStatusChange(
      initial.updatedInventory,
      initial.updatedOrder,
      target,
      event(target),
    );
    assert.equal(result.updatedInventory[0].onHandQty, 10);
    assert.equal(result.updatedInventory[0].reservedQty, 0);
    assert.throws(
      () =>
        syncInventoryOnOrderStatusChange(
          result.updatedInventory,
          result.updatedOrder,
          "CONFIRMED",
          event("reopen"),
        ),
      /INVALID_FULFILLMENT/,
    );
  }
  const done = syncInventoryOnOrderStatusChange(
    [sku()],
    order(sku()),
    "DELIVERED",
    event(),
  );
  assert.throws(
    () =>
      syncInventoryOnOrderStatusChange(
        done.updatedInventory,
        done.updatedOrder,
        "CANCELLED",
        event(),
      ),
    /INVALID_FULFILLMENT/,
  );
});
test("WAC on receipt; cost locked at delivery; return restores historical cost into current average", () => {
  const item = sku(),
    sales = order(item, 2);
  const received = receiveInventoryStock(
    [item],
    "sku",
    10,
    300,
    "PO-1",
    event(),
  );
  assert.equal(received.updatedInventory[0].costPrice, 200);
  const done = syncInventoryOnOrderStatusChange(
    received.updatedInventory,
    sales,
    "DELIVERED",
    event("deliver"),
  );
  assert.equal(done.updatedOrder.items[0].costPriceAtSale, 200);
  const second = receiveInventoryStock(
    done.updatedInventory,
    "sku",
    2,
    400,
    "PO-2",
    event("in2"),
  );
  assert.equal(second.updatedInventory[0].costPrice, 220);
  const returned = syncInventoryOnOrderStatusChange(
    second.updatedInventory,
    done.updatedOrder,
    "RETURNED",
    event("return"),
  );
  assert.equal(returned.updatedInventory[0].onHandQty, 22);
  assert.equal(returned.updatedInventory[0].costPrice, 218.181818);
  assert.equal(returned.movements[0].unitCostAtMovement, 200);
  assert.throws(
    () => receiveInventoryStock([item], "missing", 1, 100, "PO", event()),
    /UNKNOWN/,
  );
  assert.throws(() =>
    receiveInventoryStock([item], "sku", 0, 100, "PO", event()),
  );
  assert.throws(() =>
    receiveInventoryStock([item], "sku", 1, -1, "PO", event()),
  );
});
test("Transaction retries are idempotent; conflicting operation IDs and backdated events are rejected", () => {
  const command = {
    type: "TRANSITION_ORDER" as const,
    orderId: "order",
    nextStatus: "CONFIRMED" as const,
    context: event("reserve"),
  };
  const result = applyOperationsCommand(emptyState(), command);
  assert.equal(result.applied, true);
  const retry = applyOperationsCommand(result.state, command);
  assert.equal(retry.applied, false);
  assert.deepEqual(retry.state, result.state);
  assert.throws(
    () =>
      applyOperationsCommand(result.state, {
        ...command,
        nextStatus: "DELIVERED",
      }),
    /OPERATION_ID_REUSED/,
  );
  assert.throws(
    () =>
      applyOperationsCommand(result.state, {
        ...command,
        nextStatus: "DELIVERED",
        context: event("old", "2026-10-10T00:00:00Z"),
      }),
    /EVENT_BEFORE/,
  );
  assert.throws(
    () =>
      adjustInventoryStock(result.state.inventory, "sku", -9, "COUNT", event()),
    /RESERVED/,
  );
  const adjusted = applyOperationsCommand(result.state, {
    type: "ADJUST_STOCK",
    skuId: "sku",
    qtyDelta: -1,
    referenceCode: "COUNT",
    context: event("adjust"),
  });
  assert.equal(adjusted.state.inventory[0].onHandQty, 9);
  assert.equal(adjusted.state.movements.at(-1)?.qtyDelta, -1);
});
test("Analytics uses the requested window and excludes future, cancelled and returned orders", () => {
  const item = sku();
  const sales = [
    delivered(item, 1, "inside"),
    delivered(item, 99, "boundary", "2026-09-15T12:00:00Z"),
    delivered(item, 99, "future", "2026-10-16T00:00:00Z"),
    order(item, 99, {
      id: "cancel",
      orderCode: "cancel",
      fulfillmentStatus: "CANCELLED",
    }),
    order(item, 99, {
      id: "return",
      orderCode: "return",
      fulfillmentStatus: "RETURNED",
    }),
    order(item, 2, {
      id: "confirmed",
      orderCode: "confirmed",
      fulfillmentStatus: "CONFIRMED",
    }),
  ];
  assert.equal(computeTopSellersAndABC([item], sales, opts)[0].totalSoldQty, 3);
  assert.equal(
    computeTopSellersAndABC([item], sales, { ...opts, scope: "DELIVERED" })[0]
      .totalSoldQty,
    1,
  );
  assert.equal(
    computeRestockRecommendations([item], sales, opts)[0].dailySalesVelocity,
    0.033333,
  );
  assert.throws(() =>
    computeTopSellersAndABC([item], sales, { ...opts, lookbackDays: 0 }),
  );
  assert.throws(() =>
    computeTopSellersAndABC([item], sales, { ...opts, referenceDate: "wrong" }),
  );
});
test("ABC includes threshold-crossing SKU and is invariant under display sorting; zero-revenue SKUs are C", () => {
  const items = [
    sku({ id: "a", sku: "A", sellingPrice: 80 }),
    sku({ id: "b", sku: "B", sellingPrice: 15 }),
    sku({ id: "c", sku: "C", sellingPrice: 5 }),
    sku({ id: "d", sku: "D" }),
  ];
  const sales = items
    .slice(0, 3)
    .map((item, index) => delivered(item, 1, `o${index}`));
  const byRevenue = computeTopSellersAndABC(items, sales, opts);
  assert.deepEqual(
    byRevenue.map((m) => m.abcClass),
    ["A", "B", "C", "C"],
  );
  const byProfit = computeTopSellersAndABC(items, sales, {
    ...opts,
    sortBy: "PROFIT",
  });
  for (const item of byRevenue)
    assert.equal(
      byProfit.find((m) => m.skuId === item.skuId)?.abcClass,
      item.abcClass,
    );
  assert.equal(
    computeTopSellersAndABC([items[0]], [sales[0]], opts)[0].abcClass,
    "A",
  );
  assert.ok(
    computeTopSellersAndABC(items, [], opts).every(
      (m) => m.abcClass === "C" && m.revenueSharePct === 0,
    ),
  );
});
test("Restock uses unrounded velocity, includes lead time/safety stock and avoids false zero-sales stockout", () => {
  const item = sku({
    onHandQty: 1,
    availableQty: 1,
    lastSoldAt: now,
    leadTimeDays: 7,
    safetyStockQty: 2,
  });
  const rec = computeRestockRecommendations(
    [item],
    [delivered(item, 1, "sale")],
    opts,
  )[0];
  assert.equal(rec.reorderPoint, 3);
  assert.equal(rec.recommendedOrderQty, 3);
  assert.equal(rec.urgencyLevel, "WARNING");
  const fresh = sku({
    createdAt: "2026-10-14T00:00:00Z",
    onHandQty: 0,
    availableQty: 0,
    safetyStockQty: 0,
  });
  const noSales = computeRestockRecommendations([fresh], [], opts)[0];
  assert.equal(noSales.daysUntilStockout, null);
  assert.equal(noSales.recommendedOrderQty, 0);
  assert.equal(noSales.urgencyLevel, "HEALTHY");
  assert.equal(
    computeTopSellersAndABC([fresh], [], opts)[0].isDeadStock,
    false,
  );
  const dead = computeRestockRecommendations([sku()], [], opts)[0];
  assert.equal(dead.urgencyLevel, "OVERSTOCK");
  assert.equal(dead.recommendedOrderQty, 0);
});
test("Budget allocation re-sorts priority, honors zero budget, fractional costs and reports unpriced stock", () => {
  const rec = computeRestockRecommendations(
    [sku({ onHandQty: 0, availableQty: 0, lastSoldAt: now })],
    [delivered(sku(), 30, "sale")],
    opts,
  )[0];
  const input = [
    { ...rec, skuId: "low", sku: "LOW", priorityScore: 10 },
    {
      ...rec,
      skuId: "high",
      sku: "HIGH",
      priorityScore: 85,
      unitCostPrice: 33.333333,
    },
  ];
  const result = allocateRestockWithinBudget(input, 100);
  assert.equal(result.allocatedItems[0].skuId, "high");
  assert.equal(result.allocatedItems[0].allocatedQty, 3);
  assert.equal(result.totalAllocatedCost, 100);
  assert.equal(result.remainingBudget, 0);
  assert.equal(allocateRestockWithinBudget(input, 0).totalAllocatedCost, 0);
  assert.deepEqual(
    allocateRestockWithinBudget([{ ...rec, unitCostPrice: 0 }], 100)
      .unpricedSkuIds,
    ["sku"],
  );
  assert.throws(() => allocateRestockWithinBudget(input, NaN));
  assert.throws(() => allocateRestockWithinBudget(input, -1));
  assert.equal(input[0].skuId, "low");
});
test("Payments and invoice tracking remain independent; no fabricated tax authority identifier", () => {
  const item = sku(),
    sales = order(item);
  sales.buyerRequiresInvoice = false;
  const paid = recordOrderPayment(sales, sales.grandTotalAmount, event());
  assert.equal(paid.fulfillmentStatus, "DRAFT");
  assert.equal(paid.paymentStatus, "PAID");
  assert.ok(isOrderRequiringUrgentInvoice(paid));
  assert.throws(
    () => recordOrderPayment(sales, sales.grandTotalAmount + 1, event()),
    /OVERPAYMENT/,
  );
  const invoice = issueOrderEInvoice(
    paid,
    {
      invoiceNumber: "REAL-RECORD",
      invoiceSymbol: "USER-SUPPLIED",
      issuedAt: now,
    },
    event(),
  );
  assert.equal(invoice.invoiceMeta?.taxAuthorityCode, undefined);
  assert.equal(invoice.fulfillmentStatus, "DRAFT");
  assert.equal(isOrderRequiringUrgentInvoice(invoice), false);
  assert.throws(
    () =>
      issueOrderEInvoice(
        invoice,
        {
          invoiceNumber: "REPLACE",
          invoiceSymbol: "USER-SUPPLIED",
          issuedAt: now,
        },
        event(),
      ),
    /ALREADY/,
  );
});
test("Control filters and KPIs reconcile to deterministic sample totals", () => {
  const state = createMockOperationsState(),
    options = { referenceDate: MOCK_REFERENCE_DATE };
  assert.equal(
    filterOrdersByControlPreset(state.orders, "DELIVERED").length,
    6,
  );
  assert.equal(
    filterOrdersByControlPreset(state.orders, "IN_TRANSIT").length,
    3,
  );
  assert.equal(
    filterOrdersByControlPreset(state.orders, "UNINVOICED_ALERT").length,
    5,
  );
  assert.equal(
    filterOrdersByControlPreset(state.orders, "UNPAID_DELIVERED").length,
    3,
  );
  assert.equal(
    filterOrdersByControlPreset(state.orders, "ALL", "DEMO-ORD-012").length,
    1,
  );
  const kpis = computeOperationsKPIs(state.inventory, state.orders, options);
  assert.equal(
    kpis.deliveredRevenue,
    state.orders
      .filter((o) => o.fulfillmentStatus === "DELIVERED")
      .reduce((s, o) => s + o.subTotalAmount, 0),
  );
  assert.equal(kpis.uninvoicedDeliveredCount, 5);
  assert.equal(
    kpis.unpaidDeliveredReceivableAmount,
    state.orders
      .filter((o) => o.fulfillmentStatus === "DELIVERED")
      .reduce((s, o) => s + o.grandTotalAmount - o.paidAmount, 0),
  );
});
test("Operational evidence is four-layered, explicitly synthetic and cannot unlock the credit proposal gate", () => {
  const state = createMockOperationsState();
  const evidence = buildOperationsREAEvidencePayload(state, {
    referenceDate: MOCK_REFERENCE_DATE,
    sourceFileHash: "a".repeat(64),
    sourceFileName: "mock.json",
  });
  assert.ok(OperationsEvidenceSchema.safeParse(evidence).success);
  assert.equal(evidence.domain, "OPERATIONS");
  assert.equal(evidence.inferences.length, 0);
  assert.ok(evidence.unknowns.some((issue) => issue.code === "SAMPLE_DATA"));
  assert.equal(evaluateFailClosedGate(evidence).canExportProposal, false);
  assert.deepEqual(
    buildOperationsREAEvidencePayload(state, {
      referenceDate: MOCK_REFERENCE_DATE,
      sourceFileHash: "a".repeat(64),
      sourceFileName: "mock.json",
    }),
    evidence,
  );
  assert.throws(() =>
    buildOperationsREAEvidencePayload(state, {
      referenceDate: MOCK_REFERENCE_DATE,
      sourceFileHash: "invalid",
    }),
  );
});
