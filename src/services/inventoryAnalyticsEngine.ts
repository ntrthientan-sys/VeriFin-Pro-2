import { z } from "zod";
import {
  OperationsEvidenceSchema,
  type OperationsREAEvidencePayload,
} from "../schemas/inventoryOrderSchema";
import {
  ProvenanceSchema,
  type EvidenceUnknown,
} from "../schemas/evidenceSchema";
import {
  InventoryItemSchema,
  SalesOrderSchema,
  OrderLineInputSchema,
  OrderLineItemSchema,
  StockMovementSchema,
  InvoiceMetaSchema,
  TopSellerMetricSchema,
  RestockRecommendationSchema,
  OperationsKPISummarySchema,
  OperationsStateSchema,
  OperationContextSchema,
  OperationsTimestampSchema,
  OperationsIdSchema,
  QuantitySchema,
  MoneyVNDSchema,
  FulfillmentStatusSchema,
  type InventoryItem,
  type SalesOrder,
  type StockMovement,
  type OperationContext,
  type FulfillmentStatus,
  type InvoiceMeta,
  type TopSellerMetric,
  type RestockRecommendation,
  type OperationsState,
  type OrderLineItem,
} from "../schemas/inventoryOrderSchema";
import {
  costOfQuantity,
  lineAmounts,
  sumMoney,
  weightedCost,
  safeInteger,
} from "../utils/inventoryMath";

const DAY = 86_400_000;
const clone = <T>(value: T): T => structuredClone(value);
function fail(code: string): never {
  throw new Error(code);
}
const reserved = (status: FulfillmentStatus) =>
  status === "CONFIRMED" || status === "SHIPPING";
const committed = (status: FulfillmentStatus) =>
  reserved(status) || status === "DELIVERED";
function timestamp(value: string): number {
  return Date.parse(OperationsTimestampSchema.parse(value));
}
function context(value: OperationContext, after: string): OperationContext {
  const parsed = OperationContextSchema.parse(value);
  if (timestamp(parsed.timestamp) < timestamp(after))
    fail("EVENT_BEFORE_CURRENT_STATE");
  return parsed;
}
function latestInventoryDate(item: InventoryItem): string {
  return [item.createdAt, item.lastSoldAt, item.lastRestockedAt]
    .filter((date): date is string => date !== null)
    .sort((a, b) => timestamp(b) - timestamp(a))[0];
}
function inventoryInput(input: InventoryItem[]): InventoryItem[] {
  const items = z.array(InventoryItemSchema).parse(input);
  if (
    new Set(items.map((i) => i.id)).size !== items.length ||
    new Set(items.map((i) => i.sku)).size !== items.length
  )
    fail("DUPLICATE_SKU");
  return items;
}
function orderInput(input: SalesOrder[]): SalesOrder[] {
  const orders = z.array(SalesOrderSchema).parse(input);
  if (
    new Set(orders.map((o) => o.id)).size !== orders.length ||
    new Set(orders.map((o) => o.orderCode)).size !== orders.length
  )
    fail("DUPLICATE_ORDER");
  return orders;
}
function checkReferences(inventory: InventoryItem[], orders: SalesOrder[]) {
  const ids = new Map(inventory.map((item) => [item.id, item.sku]));
  for (const order of orders)
    for (const line of order.items)
      if (ids.get(line.skuId) !== line.skuCode) fail("UNKNOWN_SKU");
}
export function calculateOrderLine(
  input: Omit<
    OrderLineItem,
    "lineNetTotal" | "lineTaxAmount" | "lineGrandTotal"
  >,
): OrderLineItem {
  const line = OrderLineInputSchema.parse(input);
  const { lineCogs: _, ...amounts } = lineAmounts(
    line.qty,
    line.unitPrice,
    line.discountAmount,
    line.taxRate,
    line.costPriceAtSale,
  );
  return OrderLineItemSchema.parse({ ...line, ...amounts });
}
/** Derived totals never trust external cached totals. Input lines are validated first. */
export function calculateOrderTotals(lines: OrderLineItem[]) {
  const items = z.array(OrderLineItemSchema).min(1).parse(lines);
  const subTotalAmount = sumMoney(items.map((i) => i.lineNetTotal)),
    totalTaxAmount = sumMoney(items.map((i) => i.lineTaxAmount));
  const cogs = sumMoney(
    items.map((i) => costOfQuantity(i.qty, i.costPriceAtSale)),
  );
  return {
    subTotalAmount,
    totalTaxAmount,
    grandTotalAmount: sumMoney([subTotalAmount, totalTaxAmount]),
    estimatedGrossProfit: subTotalAmount - cogs,
  };
}
function movement(
  item: InventoryItem,
  previous: InventoryItem,
  type: StockMovement["movementType"],
  unitCost: number,
  referenceCode: string,
  ctx: OperationContext,
  index = 0,
): StockMovement {
  return StockMovementSchema.parse({
    id: `${ctx.operationId}:${index}`,
    operationId: ctx.operationId,
    actorId: ctx.actorId,
    timestamp: ctx.timestamp,
    skuId: item.id,
    skuCode: item.sku,
    movementType: type,
    qtyDelta: item.onHandQty - previous.onHandQty,
    reservedDelta: item.reservedQty - previous.reservedQty,
    previousOnHand: previous.onHandQty,
    newOnHand: item.onHandQty,
    previousReserved: previous.reservedQty,
    newReserved: item.reservedQty,
    unitCostAtMovement: unitCost,
    previousUnitCost: previous.costPrice,
    newUnitCost: item.costPrice,
    referenceCode,
    note: ctx.note,
  });
}
export const ALLOWED_FULFILLMENT_TRANSITIONS: Readonly<
  Record<FulfillmentStatus, readonly FulfillmentStatus[]>
> = {
  DRAFT: ["CONFIRMED", "DELIVERED", "CANCELLED"],
  CONFIRMED: ["SHIPPING", "DELIVERED", "DRAFT", "CANCELLED", "RETURNED"],
  SHIPPING: ["DELIVERED", "CANCELLED", "RETURNED"],
  DELIVERED: ["RETURNED"],
  RETURNED: [],
  CANCELLED: [],
};
export interface OrderSyncResult {
  updatedInventory: InventoryItem[];
  updatedOrder: SalesOrder;
  movements: StockMovement[];
  shortageWarnings: string[];
}
/** Atomic pure transition: throws on any shortage/missing SKU. Caller persists only a complete result. */
export function syncInventoryOnOrderStatusChange(
  input: InventoryItem[],
  source: SalesOrder,
  next: FulfillmentStatus,
  event: OperationContext,
): OrderSyncResult {
  const inventory = inventoryInput(input),
    order = SalesOrderSchema.parse(source),
    nextStatus = FulfillmentStatusSchema.parse(next);
  const ctx = context(event, order.updatedAt);
  checkReferences(inventory, [order]);
  if (order.fulfillmentStatus === nextStatus)
    return {
      updatedInventory: inventory,
      updatedOrder: order,
      movements: [],
      shortageWarnings: [],
    };
  if (
    !ALLOWED_FULFILLMENT_TRANSITIONS[order.fulfillmentStatus].includes(
      nextStatus,
    )
  )
    fail("INVALID_FULFILLMENT_TRANSITION");
  const map = new Map(inventory.map((item) => [item.id, item])),
    movements: StockMovement[] = [];
  const previousStatus = order.fulfillmentStatus;
  for (const line of order.items) {
    const item = map.get(line.skuId)!,
      previous = clone(item);
    context(ctx, latestInventoryDate(item));
    let type: StockMovement["movementType"] | undefined;
    let usedCost = item.costPrice;
    if (!reserved(previousStatus) && reserved(nextStatus)) {
      if (line.qty > item.availableQty)
        fail(`INSUFFICIENT_AVAILABLE_STOCK:${item.sku}`);
      item.reservedQty += line.qty;
      type = "RESERVE_STOCK";
    } else if (nextStatus === "DELIVERED") {
      if (reserved(previousStatus)) {
        if (item.reservedQty < line.qty || item.onHandQty < line.qty)
          fail("RESERVATION_MISMATCH");
        item.reservedQty -= line.qty;
      } else if (item.availableQty < line.qty)
        fail(`INSUFFICIENT_AVAILABLE_STOCK:${item.sku}`);
      item.onHandQty -= line.qty;
      item.lastSoldAt = ctx.timestamp;
      type = "OUTBOUND_DELIVERY";
      // Reserve-time profit is estimated; delivery freezes the actual moving-average cost.
      line.costPriceAtSale = item.costPrice;
    } else if (reserved(previousStatus) && !reserved(nextStatus)) {
      if (item.reservedQty < line.qty) fail("RESERVATION_MISMATCH");
      item.reservedQty -= line.qty;
      type = "RELEASE_RESERVE";
    } else if (previousStatus === "DELIVERED" && nextStatus === "RETURNED") {
      usedCost = line.costPriceAtSale;
      item.costPrice = weightedCost(
        item.onHandQty,
        item.costPrice,
        line.qty,
        usedCost,
      );
      item.onHandQty += line.qty;
      item.lastRestockedAt = ctx.timestamp;
      type = "RETURN_INBOUND";
    }
    item.availableQty = item.onHandQty - item.reservedQty;
    InventoryItemSchema.parse(item);
    if (type)
      movements.push(
        movement(
          item,
          previous,
          type,
          usedCost,
          order.orderCode,
          ctx,
          movements.length,
        ),
      );
  }
  const invoiceStatus =
    order.invoiceStatus === "INVOICED"
      ? "INVOICED"
      : nextStatus === "DELIVERED" || order.paidAmount > 0
        ? "PENDING_INVOICE"
        : ["CANCELLED", "RETURNED", "DRAFT"].includes(nextStatus)
          ? "NOT_REQUIRED"
          : "PENDING_INVOICE";
  const updatedOrder = SalesOrderSchema.parse({
    ...order,
    ...calculateOrderTotals(order.items),
    fulfillmentStatus: nextStatus,
    invoiceStatus,
    updatedAt: ctx.timestamp,
    deliveredAt: nextStatus === "DELIVERED" ? ctx.timestamp : order.deliveredAt,
  });
  return {
    updatedInventory: inventory,
    updatedOrder,
    movements,
    shortageWarnings: [],
  };
}
export function receiveInventoryStock(
  input: InventoryItem[],
  skuId: string,
  addedQty: number,
  unitImportCost: number,
  referenceDoc: string,
  event: OperationContext,
) {
  QuantitySchema.positive().parse(addedQty);
  MoneyVNDSchema.max(1_000_000_000).parse(unitImportCost);
  OperationsIdSchema.parse(referenceDoc);
  const inventory = inventoryInput(input),
    item = inventory.find((i) => i.id === skuId);
  if (!item) fail("UNKNOWN_SKU");
  const ctx = context(event, latestInventoryDate(item)),
    previous = clone(item);
  item.costPrice = weightedCost(
    item.onHandQty,
    item.costPrice,
    addedQty,
    unitImportCost,
  );
  item.onHandQty += addedQty;
  item.availableQty = item.onHandQty - item.reservedQty;
  item.lastRestockedAt = ctx.timestamp;
  InventoryItemSchema.parse(item);
  return {
    updatedInventory: inventory,
    movement: movement(
      item,
      previous,
      "INBOUND_PURCHASE",
      unitImportCost,
      referenceDoc,
      ctx,
    ),
  };
}
export function adjustInventoryStock(
  input: InventoryItem[],
  skuId: string,
  qtyDelta: number,
  referenceDoc: string,
  event: OperationContext,
) {
  z.number()
    .int()
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((q) => q !== 0)
    .parse(qtyDelta);
  OperationsIdSchema.parse(referenceDoc);
  const inventory = inventoryInput(input),
    item = inventory.find((i) => i.id === skuId);
  if (!item) fail("UNKNOWN_SKU");
  const ctx = context(event, latestInventoryDate(item)),
    previous = clone(item);
  item.onHandQty += qtyDelta;
  item.availableQty = item.onHandQty - item.reservedQty;
  if (item.availableQty < 0) fail("ADJUSTMENT_WOULD_CONSUME_RESERVED_STOCK");
  InventoryItemSchema.parse(item);
  return {
    updatedInventory: inventory,
    movement: movement(
      item,
      previous,
      "MANUAL_ADJUSTMENT",
      item.costPrice,
      referenceDoc,
      ctx,
    ),
  };
}
export function recordOrderPayment(
  source: SalesOrder,
  paidAmount: number,
  event: OperationContext,
): SalesOrder {
  const order = SalesOrderSchema.parse(source),
    ctx = context(event, order.updatedAt);
  MoneyVNDSchema.parse(paidAmount);
  if (paidAmount > order.grandTotalAmount) fail("OVERPAYMENT");
  if (
    ["RETURNED", "CANCELLED"].includes(order.fulfillmentStatus) &&
    paidAmount > order.paidAmount
  )
    fail("PAYMENT_ON_CLOSED_ORDER");
  return SalesOrderSchema.parse({
    ...order,
    paidAmount,
    paymentStatus:
      paidAmount === order.grandTotalAmount
        ? "PAID"
        : paidAmount === 0
          ? "UNPAID"
          : "PARTIAL",
    invoiceStatus:
      order.invoiceStatus === "INVOICED"
        ? "INVOICED"
        : paidAmount > 0 || order.fulfillmentStatus === "DELIVERED"
          ? "PENDING_INVOICE"
          : order.invoiceStatus,
    updatedAt: ctx.timestamp,
  });
}
/** Records an invoice already issued by an external provider. Does NOT issue/sign an invoice. */
export function issueOrderEInvoice(
  source: SalesOrder,
  metadata: InvoiceMeta,
  event: OperationContext,
): SalesOrder {
  const order = SalesOrderSchema.parse(source),
    meta = InvoiceMetaSchema.parse(metadata),
    ctx = context(event, order.updatedAt);
  if (["RETURNED", "CANCELLED"].includes(order.fulfillmentStatus))
    fail("CLOSED_ORDER_REQUIRES_INVOICE_REVIEW");
  if (
    timestamp(meta.issuedAt) > timestamp(ctx.timestamp) ||
    timestamp(meta.issuedAt) < timestamp(order.createdAt)
  )
    fail("INVALID_INVOICE_DATE");
  if (
    order.invoiceMeta &&
    JSON.stringify(order.invoiceMeta) !== JSON.stringify(meta)
  )
    fail("INVOICE_ALREADY_RECORDED");
  return SalesOrderSchema.parse({
    ...order,
    invoiceStatus: "INVOICED",
    invoiceMeta: meta,
    updatedAt: ctx.timestamp,
  });
}
export type OperationsCommand =
  | {
      type: "TRANSITION_ORDER";
      orderId: string;
      nextStatus: FulfillmentStatus;
      context: OperationContext;
    }
  | {
      type: "RECEIVE_STOCK";
      skuId: string;
      qty: number;
      unitCost: number;
      referenceCode: string;
      context: OperationContext;
    }
  | {
      type: "ADJUST_STOCK";
      skuId: string;
      qtyDelta: number;
      referenceCode: string;
      context: OperationContext;
    }
  | {
      type: "RECORD_PAYMENT";
      orderId: string;
      paidAmount: number;
      context: OperationContext;
    }
  | {
      type: "RECORD_INVOICE";
      orderId: string;
      invoice: InvoiceMeta;
      context: OperationContext;
    };
const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("TRANSITION_ORDER"),
      orderId: OperationsIdSchema,
      nextStatus: FulfillmentStatusSchema,
      context: OperationContextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("RECEIVE_STOCK"),
      skuId: OperationsIdSchema,
      qty: QuantitySchema.positive(),
      unitCost: MoneyVNDSchema,
      referenceCode: OperationsIdSchema,
      context: OperationContextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("ADJUST_STOCK"),
      skuId: OperationsIdSchema,
      qtyDelta: z.number().int(),
      referenceCode: OperationsIdSchema,
      context: OperationContextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("RECORD_PAYMENT"),
      orderId: OperationsIdSchema,
      paidAmount: MoneyVNDSchema,
      context: OperationContextSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("RECORD_INVOICE"),
      orderId: OperationsIdSchema,
      invoice: InvoiceMetaSchema,
      context: OperationContextSchema,
    })
    .strict(),
]);
/** In-memory transaction with idempotency. Storage/locking is deliberately deferred to Phase 3. */
export function applyOperationsCommand(
  source: OperationsState,
  input: OperationsCommand,
): { state: OperationsState; applied: boolean } {
  const state = OperationsStateSchema.parse(source),
    command = commandSchema.parse(input),
    fingerprint = JSON.stringify(command);
  const prior = state.processedOperations.find(
    (op) => op.operationId === command.context.operationId,
  );
  if (prior) {
    if (prior.fingerprint !== fingerprint) fail("OPERATION_ID_REUSED");
    return { state, applied: false };
  }
  const last = state.movements.at(-1);
  if (last) context(command.context, last.timestamp);
  if (command.type === "RECEIVE_STOCK" || command.type === "ADJUST_STOCK") {
    const result =
      command.type === "RECEIVE_STOCK"
        ? receiveInventoryStock(
            state.inventory,
            command.skuId,
            command.qty,
            command.unitCost,
            command.referenceCode,
            command.context,
          )
        : adjustInventoryStock(
            state.inventory,
            command.skuId,
            command.qtyDelta,
            command.referenceCode,
            command.context,
          );
    state.inventory = result.updatedInventory;
    state.movements.push(result.movement);
  } else {
    const index = state.orders.findIndex(
      (order) => order.id === command.orderId,
    );
    if (index < 0) fail("UNKNOWN_ORDER");
    const order = state.orders[index];
    if (command.type === "TRANSITION_ORDER") {
      const result = syncInventoryOnOrderStatusChange(
        state.inventory,
        order,
        command.nextStatus,
        command.context,
      );
      state.inventory = result.updatedInventory;
      state.orders[index] = result.updatedOrder;
      state.movements.push(...result.movements);
    } else if (command.type === "RECORD_PAYMENT")
      state.orders[index] = recordOrderPayment(
        order,
        command.paidAmount,
        command.context,
      );
    else
      state.orders[index] = issueOrderEInvoice(
        order,
        command.invoice,
        command.context,
      );
  }
  state.processedOperations.push({
    operationId: command.context.operationId,
    fingerprint,
  });
  return { state: OperationsStateSchema.parse(state), applied: true };
}

export type TopSellerSortMode = "VOLUME" | "REVENUE" | "PROFIT";
export interface AnalyticsOptions {
  referenceDate: string;
  lookbackDays?: number;
  deadStockThresholdDays?: number;
  scope?: "COMMITTED" | "DELIVERED";
  sortBy?: TopSellerSortMode;
}
const optionsSchema = z
  .object({
    referenceDate: OperationsTimestampSchema,
    lookbackDays: z.number().int().min(1).max(3650).default(30),
    deadStockThresholdDays: z.number().int().min(1).max(3650).default(30),
    scope: z.enum(["COMMITTED", "DELIVERED"]).default("COMMITTED"),
    sortBy: z.enum(["VOLUME", "REVENUE", "PROFIT"]).default("REVENUE"),
  })
  .strict();
const round = (value: number) => Number(value.toFixed(6));
export function computeTopSellersAndABC(
  input: InventoryItem[],
  source: SalesOrder[],
  options: AnalyticsOptions,
): TopSellerMetric[] {
  const inventory = inventoryInput(input),
    orders = orderInput(source),
    opts = optionsSchema.parse(options);
  checkReferences(inventory, orders);
  const now = timestamp(opts.referenceDate),
    start = now - opts.lookbackDays * DAY;
  const selected = orders.filter((order) => {
    if (
      !committed(order.fulfillmentStatus) ||
      (opts.scope === "DELIVERED" && order.fulfillmentStatus !== "DELIVERED")
    )
      return false;
    const date = timestamp(
      order.fulfillmentStatus === "DELIVERED"
        ? order.deliveredAt!
        : order.createdAt,
    );
    return date > start && date <= now && timestamp(order.updatedAt) <= now;
  });
  const metrics = inventory
    .map((item) => {
      const lines = selected.flatMap((order) =>
        order.items.filter((line) => line.skuId === item.id),
      );
      const netRevenue = sumMoney(lines.map((line) => line.lineNetTotal)),
        totalCogs = sumMoney(
          lines.map((line) => costOfQuantity(line.qty, line.costPriceAtSale)),
        );
      const soldDates = orders
        .filter(
          (order) =>
            order.fulfillmentStatus === "DELIVERED" &&
            timestamp(order.updatedAt) <= now &&
            order.items.some((line) => line.skuId === item.id),
        )
        .map((order) => timestamp(order.deliveredAt!));
      if (item.lastSoldAt && timestamp(item.lastSoldAt) <= now)
        soldDates.push(timestamp(item.lastSoldAt));
      const last = soldDates.length ? Math.max(...soldDates) : null;
      const age = (now - (last ?? timestamp(item.createdAt))) / DAY;
      return {
        skuId: item.id,
        sku: item.sku,
        name: item.name,
        category: item.category,
        unit: item.unit,
        orderCount: lines.length,
        totalSoldQty: lines.reduce((n, line) => n + line.qty, 0),
        netRevenue,
        totalCogs,
        grossProfit: netRevenue - totalCogs,
        grossMarginPct: netRevenue
          ? round(((netRevenue - totalCogs) / netRevenue) * 100)
          : 0,
        revenueSharePct: 0,
        cumulativeSharePct: 0,
        abcClass: "C" as "A" | "B" | "C",
        daysSinceLastSale: last === null ? null : Math.floor(age),
        isDeadStock: item.onHandQty > 0 && age > opts.deadStockThresholdDays,
        tiedUpCapital: costOfQuantity(item.onHandQty, item.costPrice),
      };
    })
    .sort(
      (a, b) => b.netRevenue - a.netRevenue || a.sku.localeCompare(b.sku, "en"),
    );
  const total = sumMoney(metrics.map((m) => m.netRevenue));
  let cumulative = 0;
  for (const metric of metrics) {
    // Include the item crossing a boundary in the preceding class, including a dominant first SKU.
    metric.abcClass =
      metric.netRevenue === 0
        ? "C"
        : BigInt(cumulative) * 100n < BigInt(total) * 80n
          ? "A"
          : BigInt(cumulative) * 100n < BigInt(total) * 95n
            ? "B"
            : "C";
    cumulative += metric.netRevenue;
    metric.revenueSharePct = total
      ? round((metric.netRevenue / total) * 100)
      : 0;
    metric.cumulativeSharePct = total ? round((cumulative / total) * 100) : 0;
  }
  const value = (m: TopSellerMetric) =>
    opts.sortBy === "VOLUME"
      ? m.totalSoldQty
      : opts.sortBy === "PROFIT"
        ? m.grossProfit
        : m.netRevenue;
  return z
    .array(TopSellerMetricSchema)
    .parse(
      metrics.sort(
        (a, b) => value(b) - value(a) || a.sku.localeCompare(b.sku, "en"),
      ),
    );
}
export interface RestockEngineOptions {
  referenceDate: string;
  lookbackDays?: number;
  targetCoverDays?: number;
}
const restockOptions = z
  .object({
    referenceDate: OperationsTimestampSchema,
    lookbackDays: z.number().int().min(1).max(3650).default(30),
    targetCoverDays: z.number().int().min(1).max(3650).default(30),
  })
  .strict();
function prioritySort(a: RestockRecommendation, b: RestockRecommendation) {
  return b.priorityScore - a.priorityScore || a.sku.localeCompare(b.sku, "en");
}
export function computeRestockRecommendations(
  input: InventoryItem[],
  orders: SalesOrder[],
  options: RestockEngineOptions,
): RestockRecommendation[] {
  const inventory = inventoryInput(input),
    opts = restockOptions.parse(options);
  const metrics = new Map(
    computeTopSellersAndABC(inventory, orders, {
      referenceDate: opts.referenceDate,
      lookbackDays: opts.lookbackDays,
      scope: "DELIVERED",
    }).map((m) => [m.skuId, m]),
  );
  const recommendations = inventory.map((item) => {
    const metric = metrics.get(item.id)!;
    const dailySalesVelocity = metric.totalSoldQty / opts.lookbackDays;
    const daysUntilStockout =
      dailySalesVelocity > 0 ? item.availableQty / dailySalesVelocity : null;
    const reorderPoint =
      Math.ceil((metric.totalSoldQty * item.leadTimeDays) / opts.lookbackDays) +
      item.safetyStockQty;
    const daysIdle =
      (timestamp(opts.referenceDate) -
        timestamp(item.lastSoldAt || item.createdAt)) /
      DAY;
    const overstock =
      item.onHandQty > 0 &&
      ((metric.isDeadStock && daysIdle > 45) ||
        (daysUntilStockout !== null && daysUntilStockout > 60));
    const urgencyLevel = overstock
      ? "OVERSTOCK"
      : (item.availableQty === 0 &&
            (dailySalesVelocity > 0 || item.safetyStockQty > 0)) ||
          (daysUntilStockout !== null && daysUntilStockout < 3)
        ? "CRITICAL"
        : item.availableQty <= reorderPoint && reorderPoint > 0
          ? "WARNING"
          : "HEALTHY";
    const target =
      Math.ceil(
        (metric.totalSoldQty * (opts.targetCoverDays + item.leadTimeDays)) /
          opts.lookbackDays,
      ) + item.safetyStockQty;
    const recommendedOrderQty = ["CRITICAL", "WARNING"].includes(urgencyLevel)
      ? Math.max(0, target - item.availableQty)
      : 0;
    const priorityScore =
      urgencyLevel === "CRITICAL" || urgencyLevel === "WARNING"
        ? (metric.abcClass === "A" ? 60 : metric.abcClass === "B" ? 30 : 0) +
          (urgencyLevel === "CRITICAL" ? 25 : 15)
        : 0;
    return {
      skuId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      supplierName: item.supplierName,
      abcClass: metric.abcClass,
      onHandQty: item.onHandQty,
      reservedQty: item.reservedQty,
      currentAvailableQty: item.availableQty,
      dailySalesVelocity: round(dailySalesVelocity),
      daysUntilStockout:
        daysUntilStockout === null ? null : round(daysUntilStockout),
      leadTimeDays: item.leadTimeDays,
      safetyStockQty: item.safetyStockQty,
      reorderPoint,
      targetCoverDays: opts.targetCoverDays,
      recommendedOrderQty,
      unitCostPrice: item.costPrice,
      estimatedRestockCost: costOfQuantity(recommendedOrderQty, item.costPrice),
      urgencyLevel,
      priorityScore,
      actionReason:
        dailySalesVelocity === 0
          ? `Không có đơn giao ròng trong ${opts.lookbackDays} ngày; đề xuất ${recommendedOrderQty} theo tồn an toàn, không suy đoán tốc độ bán.`
          : `Đã giao ròng ${metric.totalSoldQty}/${opts.lookbackDays} ngày; ROP ${reorderPoint}; mục tiêu gồm ${opts.targetCoverDays} ngày phủ + ${item.leadTimeDays} ngày chờ + ${item.safetyStockQty} tồn an toàn.`,
    };
  });
  return z
    .array(RestockRecommendationSchema)
    .parse(recommendations)
    .sort(prioritySort);
}
export interface BudgetAllocatedRestockItem extends RestockRecommendation {
  allocatedQty: number;
  allocatedCost: number;
  fulfillmentRatioPct: number;
}
/** Greedy policy allocation, not a claim of globally optimal profit. Zero/unknown cost is not free stock. */
export function allocateRestockWithinBudget(
  input: RestockRecommendation[],
  maxBudgetVnd: number,
) {
  MoneyVNDSchema.parse(maxBudgetVnd);
  const recommendations = z
    .array(RestockRecommendationSchema)
    .parse(input)
    .sort(prioritySort);
  if (
    new Set(recommendations.map((r) => r.skuId)).size !== recommendations.length
  )
    fail("DUPLICATE_RECOMMENDATION");
  let remainingBudget = maxBudgetVnd;
  const unpricedSkuIds: string[] = [];
  const allocatedItems: BudgetAllocatedRestockItem[] = recommendations
    .filter((rec) => rec.recommendedOrderQty > 0)
    .map((rec) => {
      let low = 0,
        high = rec.recommendedOrderQty;
      if (rec.unitCostPrice <= 0) {
        unpricedSkuIds.push(rec.skuId);
        high = 0;
      }
      // Binary search honors rounded whole-dong totals without overspending on fractional WAC.
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (costOfQuantity(middle, rec.unitCostPrice) <= remainingBudget)
          low = middle;
        else high = middle - 1;
      }
      const allocatedCost = costOfQuantity(low, rec.unitCostPrice);
      remainingBudget -= allocatedCost;
      return {
        ...rec,
        allocatedQty: low,
        allocatedCost,
        fulfillmentRatioPct: round((low / rec.recommendedOrderQty) * 100),
      };
    });
  return {
    allocatedItems,
    totalAllocatedCost: maxBudgetVnd - remainingBudget,
    remainingBudget,
    unpricedSkuIds,
  };
}
export type OrderControlPreset =
  | "ALL"
  | "IN_TRANSIT"
  | "DELIVERED"
  | "UNINVOICED_ALERT"
  | "INVOICED"
  | "UNPAID_DELIVERED";
/** Internal review flag only; buyer preference is not a tax exemption or legal conclusion. */
export function isOrderRequiringUrgentInvoice(input: SalesOrder): boolean {
  const order = SalesOrderSchema.parse(input);
  return (
    !["CANCELLED", "RETURNED"].includes(order.fulfillmentStatus) &&
    order.invoiceStatus !== "INVOICED" &&
    (order.fulfillmentStatus === "DELIVERED" || order.paymentStatus === "PAID")
  );
}
export function filterOrdersByControlPreset(
  source: SalesOrder[],
  preset: OrderControlPreset,
  searchQuery = "",
): SalesOrder[] {
  z.enum([
    "ALL",
    "IN_TRANSIT",
    "DELIVERED",
    "UNINVOICED_ALERT",
    "INVOICED",
    "UNPAID_DELIVERED",
  ]).parse(preset);
  const query = searchQuery.trim().toLocaleLowerCase("vi-VN");
  return orderInput(source).filter((order) => {
    if (
      query &&
      ![
        order.orderCode,
        order.customerName,
        order.customerTaxCode || "",
        order.customerPhone,
      ].some((value) => value.toLocaleLowerCase("vi-VN").includes(query))
    )
      return false;
    switch (preset) {
      case "IN_TRANSIT":
        return reserved(order.fulfillmentStatus);
      case "DELIVERED":
        return order.fulfillmentStatus === "DELIVERED";
      case "UNINVOICED_ALERT":
        return isOrderRequiringUrgentInvoice(order);
      case "INVOICED":
        return order.invoiceStatus === "INVOICED";
      case "UNPAID_DELIVERED":
        return (
          order.fulfillmentStatus === "DELIVERED" &&
          order.paidAmount < order.grandTotalAmount
        );
      default:
        return true;
    }
  });
}
export function computeOperationsKPIs(
  input: InventoryItem[],
  source: SalesOrder[],
  options: RestockEngineOptions,
) {
  const inventory = inventoryInput(input),
    orders = orderInput(source),
    opts = restockOptions.parse(options);
  const sellers = computeTopSellersAndABC(inventory, orders, {
      referenceDate: opts.referenceDate,
      lookbackDays: opts.lookbackDays,
      scope: "DELIVERED",
    }),
    restock = computeRestockRecommendations(inventory, orders, opts);
  const currentOrders = orders.filter(
    (order) => timestamp(order.updatedAt) <= timestamp(opts.referenceDate),
  );
  const uninvoiced = filterOrdersByControlPreset(
      currentOrders,
      "UNINVOICED_ALERT",
    ),
    unpaid = filterOrdersByControlPreset(currentOrders, "UNPAID_DELIVERED");
  return OperationsKPISummarySchema.parse({
    totalInventoryValueAtCost: sumMoney(
      inventory.map((item) => costOfQuantity(item.onHandQty, item.costPrice)),
    ),
    totalExpectedRetailValue: sumMoney(
      inventory.map((item) =>
        safeInteger(BigInt(item.onHandQty) * BigInt(item.sellingPrice)),
      ),
    ),
    deadStockCapitalValue: sumMoney(
      sellers
        .filter((item) => item.isDeadStock)
        .map((item) => item.tiedUpCapital),
    ),
    deadStockSkuCount: sellers.filter((item) => item.isDeadStock).length,
    criticalRestockSkuCount: restock.filter(
      (item) => item.urgencyLevel === "CRITICAL",
    ).length,
    warningRestockSkuCount: restock.filter(
      (item) => item.urgencyLevel === "WARNING",
    ).length,
    totalRestockCapitalNeeded: sumMoney(
      restock.map((item) => item.estimatedRestockCost),
    ),
    deliveredRevenue: sumMoney(sellers.map((item) => item.netRevenue)),
    deliveredGrossProfit: sumMoney(sellers.map((item) => item.grossProfit)),
    inTransitOrdersCount: filterOrdersByControlPreset(
      currentOrders,
      "IN_TRANSIT",
    ).length,
    uninvoicedDeliveredCount: uninvoiced.length,
    uninvoicedDeliveredAmount: sumMoney(
      uninvoiced.map((order) => order.grandTotalAmount),
    ),
    unpaidDeliveredCount: unpaid.length,
    unpaidDeliveredReceivableAmount: sumMoney(
      unpaid.map((order) => order.grandTotalAmount - order.paidAmount),
    ),
  });
}

/** Export separate operational evidence; never invent missing CIC, EBITDA or collateral. */
export function buildOperationsREAEvidencePayload(
  input: OperationsState,
  options: RestockEngineOptions & {
    sourceFileHash: string;
    sourceFileName?: string;
  },
): OperationsREAEvidencePayload {
  const state = OperationsStateSchema.parse(input);
  const opts = restockOptions.parse({
    referenceDate: options.referenceDate,
    lookbackDays: options.lookbackDays,
    targetCoverDays: options.targetCoverDays,
  });
  const provenance = (field: string) =>
    ProvenanceSchema.parse({
      sourceFileHash: options.sourceFileHash,
      sourceFileName: options.sourceFileName,
      documentType: "KHAC",
      rawSnippet: `Operations snapshot ${field}: ${state.datasetKind}`,
      locationPointer: `/${field}`,
    });
  const unknowns: EvidenceUnknown[] = [];
  const add = (
    id: string,
    code: string,
    message: string,
    evidenceRefs: string[],
  ) =>
    unknowns.push({
      id,
      code,
      severity: "BLOCKER",
      message,
      evidenceRefs,
      resolvedByHuman: false,
    });
  if (state.datasetKind === "SAMPLE")
    add(
      "sample_data",
      "SAMPLE_DATA",
      "DỮ LIỆU MẪU: không được dùng như hồ sơ kinh doanh thực tế.",
      ["observations.inventory", "observations.orders"],
    );
  for (const [index, order] of state.orders.entries()) {
    if (isOrderRequiringUrgentInvoice(order))
      add(
        `invoice_${index}`,
        "INVOICE_REVIEW_REQUIRED",
        `Đơn ${order.orderCode} đã giao/thu đủ nhưng chưa có hóa đơn được ghi nhận; cần rà soát nghiệp vụ.`,
        [`observations.orders.value.${index}`],
      );
    if (
      ["CANCELLED", "RETURNED"].includes(order.fulfillmentStatus) &&
      (order.invoiceMeta || order.paidAmount > 0)
    )
      add(
        `closed_${index}`,
        "RETURN_SETTLEMENT_REVIEW",
        `Đơn ${order.orderCode} đã hủy/hoàn: cần rà soát hoàn tiền và điều chỉnh hóa đơn.`,
        [`observations.orders.value.${index}`],
      );
  }
  return OperationsEvidenceSchema.parse({
    schemaVersion: "2.0.0",
    domain: "OPERATIONS",
    datasetKind: state.datasetKind,
    generatedAt: opts.referenceDate,
    observations: {
      inventory: {
        value: state.inventory,
        provenance: provenance("inventory"),
      },
      orders: { value: state.orders, provenance: provenance("orders") },
      movements: {
        value: state.movements,
        provenance: provenance("movements"),
      },
    },
    derivations: {
      engineVersion: "1.0.0",
      lookbackDays: opts.lookbackDays,
      kpis: computeOperationsKPIs(state.inventory, state.orders, opts),
      topSellers: computeTopSellersAndABC(state.inventory, state.orders, {
        referenceDate: opts.referenceDate,
        lookbackDays: opts.lookbackDays,
      }),
      restock: computeRestockRecommendations(
        state.inventory,
        state.orders,
        opts,
      ),
      formulas: {
        availableQty: "onHandQty - reservedQty",
        dailySalesVelocity:
          "delivered net quantity in (referenceDate - lookbackDays, referenceDate] / lookbackDays",
        reorderPoint:
          "ceil(dailySalesVelocity * leadTimeDays) + safetyStockQty",
        recommendedOrderQty:
          "max(0, ceil(dailySalesVelocity * (targetCoverDays + leadTimeDays)) + safetyStockQty - availableQty), only for CRITICAL/WARNING",
        abc: "cumulative net revenue: 80% A / 95% B / rest C; boundary crossing item included",
      },
      evidenceRefs: [
        "observations.inventory",
        "observations.orders",
        "observations.movements",
      ],
    },
    inferences: [],
    unknowns,
  });
}
