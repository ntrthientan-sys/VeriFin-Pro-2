import { z } from "zod";
import { ObservedFieldSchema, UnknownSchema } from "./evidenceSchema";
import { lineAmounts, sumMoney } from "../utils/inventoryMath";

export const TaxRateSchema = z.union([
  z.literal(0),
  z.literal(5),
  z.literal(8),
  z.literal(10),
]);
export const FulfillmentStatusSchema = z.enum([
  "DRAFT",
  "CONFIRMED",
  "SHIPPING",
  "DELIVERED",
  "RETURNED",
  "CANCELLED",
]);
export const PaymentStatusSchema = z.enum(["UNPAID", "PARTIAL", "PAID"]);
export const InvoiceStatusSchema = z.enum([
  "NOT_REQUIRED",
  "PENDING_INVOICE",
  "INVOICED",
]);
export const ABCClassSchema = z.enum(["A", "B", "C"]);
export const RestockUrgencySchema = z.enum([
  "CRITICAL",
  "WARNING",
  "HEALTHY",
  "OVERSTOCK",
]);
export const StockMovementTypeSchema = z.enum([
  "INBOUND_PURCHASE",
  "OUTBOUND_DELIVERY",
  "RESERVE_STOCK",
  "RELEASE_RESERVE",
  "RETURN_INBOUND",
  "MANUAL_ADJUSTMENT",
]);
export const OperationsTimestampSchema = z.iso.datetime({ offset: true });
export const OperationsIdSchema = z.string().trim().min(1).max(100);
export const QuantitySchema = z.number().int().min(0).max(1_000_000_000);
export const MoneyVNDSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
const signedMoney = z
  .number()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);
const unitCost = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000)
  .refine(
    (value) =>
      Math.abs(value * 1_000_000 - Math.round(value * 1_000_000)) < 0.001,
    "Giá vốn tối đa 6 chữ số thập phân.",
  );
const text = z.string().trim().min(1).max(300);
const dateOrNull = OperationsTimestampSchema.nullable();
function issue(context: z.RefinementCtx, message: string) {
  context.addIssue({ code: "custom", message });
}

export const InventoryItemSchema = z
  .object({
    id: OperationsIdSchema,
    sku: OperationsIdSchema,
    name: text,
    category: text,
    unit: text,
    costPrice: unitCost,
    sellingPrice: MoneyVNDSchema,
    taxRate: TaxRateSchema,
    onHandQty: QuantitySchema,
    reservedQty: QuantitySchema,
    availableQty: QuantitySchema,
    leadTimeDays: z.number().int().min(0).max(365),
    safetyStockQty: QuantitySchema,
    supplierName: text.optional(),
    createdAt: OperationsTimestampSchema,
    lastSoldAt: dateOrNull,
    lastRestockedAt: dateOrNull,
  })
  .strict()
  .superRefine((item, ctx) => {
    if (
      item.reservedQty > item.onHandQty ||
      item.availableQty !== item.onHandQty - item.reservedQty
    )
      issue(
        ctx,
        "Tồn khả dụng phải bằng tồn thực tế trừ giữ chỗ, không được âm.",
      );
    if (
      [item.lastSoldAt, item.lastRestockedAt].some(
        (date) => date && Date.parse(date) < Date.parse(item.createdAt),
      )
    )
      issue(ctx, "Ngày biến động không được trước ngày tạo SKU.");
  });
export const OrderLineInputSchema = z
  .object({
    skuId: OperationsIdSchema,
    skuCode: OperationsIdSchema,
    name: text,
    unit: text,
    qty: QuantitySchema.positive(),
    unitPrice: MoneyVNDSchema,
    costPriceAtSale: unitCost,
    discountAmount: MoneyVNDSchema.default(0),
    taxRate: TaxRateSchema,
  })
  .strict();
export const OrderLineItemSchema = OrderLineInputSchema.extend({
  lineNetTotal: MoneyVNDSchema,
  lineTaxAmount: MoneyVNDSchema,
  lineGrandTotal: MoneyVNDSchema,
})
  .strict()
  .superRefine((line, ctx) => {
    try {
      const calculated = lineAmounts(
        line.qty,
        line.unitPrice,
        line.discountAmount,
        line.taxRate,
        line.costPriceAtSale,
      );
      if (
        ["lineNetTotal", "lineTaxAmount", "lineGrandTotal"].some(
          (key) =>
            line[key as keyof typeof line] !==
            calculated[key as keyof typeof calculated],
        )
      )
        issue(ctx, "Tổng dòng/thuế sai phép tính.");
    } catch {
      issue(ctx, "Số tiền vượt giới hạn hoặc chiết khấu vượt giá trị dòng.");
    }
  });
export const InvoiceMetaSchema = z
  .object({
    invoiceNumber: OperationsIdSchema,
    invoiceSymbol: OperationsIdSchema,
    issuedAt: OperationsTimestampSchema,
    taxAuthorityCode: text.optional(),
    lookupUrl: z
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Chỉ chấp nhận URL HTTPS.",
      )
      .optional(),
  })
  .strict();
export const SalesOrderSchema = z
  .object({
    id: OperationsIdSchema,
    orderCode: OperationsIdSchema,
    createdAt: OperationsTimestampSchema,
    updatedAt: OperationsTimestampSchema,
    deliveredAt: dateOrNull,
    customerName: text,
    customerPhone: z.string().max(30),
    customerTaxCode: z.string().max(30).nullable(),
    customerAddress: z.string().max(500).optional(),
    buyerRequiresInvoice: z.boolean().default(true),
    items: z.array(OrderLineItemSchema).min(1).max(500),
    subTotalAmount: MoneyVNDSchema,
    totalTaxAmount: MoneyVNDSchema,
    grandTotalAmount: MoneyVNDSchema,
    paidAmount: MoneyVNDSchema,
    estimatedGrossProfit: signedMoney,
    fulfillmentStatus: FulfillmentStatusSchema,
    paymentStatus: PaymentStatusSchema,
    invoiceStatus: InvoiceStatusSchema,
    invoiceMeta: InvoiceMetaSchema.nullable(),
    vietQrMemo: z.string().max(50).optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((order, ctx) => {
    if (
      new Set(order.items.map((item) => item.skuId)).size !== order.items.length
    )
      issue(ctx, "Mỗi SKU chỉ có một dòng trong đơn.");
    try {
      const net = sumMoney(order.items.map((line) => line.lineNetTotal)),
        tax = sumMoney(order.items.map((line) => line.lineTaxAmount));
      const cogs = sumMoney(
        order.items.map(
          (line) =>
            lineAmounts(
              line.qty,
              line.unitPrice,
              line.discountAmount,
              line.taxRate,
              line.costPriceAtSale,
            ).lineCogs,
        ),
      );
      if (
        order.subTotalAmount !== net ||
        order.totalTaxAmount !== tax ||
        order.grandTotalAmount !== sumMoney([net, tax]) ||
        order.estimatedGrossProfit !== net - cogs
      )
        issue(ctx, "Tổng đơn hoặc lợi nhuận không khớp các dòng.");
    } catch {
      issue(ctx, "Tổng đơn vượt giới hạn số an toàn.");
    }
    const expected =
      order.paidAmount === order.grandTotalAmount
        ? "PAID"
        : order.paidAmount === 0
          ? "UNPAID"
          : "PARTIAL";
    if (
      order.paidAmount > order.grandTotalAmount ||
      order.paymentStatus !== expected
    )
      issue(ctx, "Số tiền và trạng thái thanh toán không khớp.");
    if ((order.invoiceStatus === "INVOICED") !== (order.invoiceMeta !== null))
      issue(
        ctx,
        "Đã xuất hóa đơn phải có metadata; chưa xuất không được có metadata.",
      );
    if (
      (order.fulfillmentStatus === "DELIVERED" && !order.deliveredAt) ||
      (!["DELIVERED", "RETURNED"].includes(order.fulfillmentStatus) &&
        order.deliveredAt !== null)
    )
      issue(ctx, "Ngày giao phải được giữ trên đơn đã giao/hoàn sau giao.");
    if (
      Date.parse(order.updatedAt) < Date.parse(order.createdAt) ||
      (order.deliveredAt &&
        (Date.parse(order.deliveredAt) < Date.parse(order.createdAt) ||
          Date.parse(order.deliveredAt) > Date.parse(order.updatedAt)))
    )
      issue(ctx, "Thời gian đơn không hợp lệ.");
    if (
      order.invoiceMeta &&
      Date.parse(order.invoiceMeta.issuedAt) > Date.parse(order.updatedAt)
    )
      issue(ctx, "Hóa đơn không được ở tương lai so với đơn.");
  });
export const StockMovementSchema = z
  .object({
    id: OperationsIdSchema,
    operationId: OperationsIdSchema,
    actorId: OperationsIdSchema,
    timestamp: OperationsTimestampSchema,
    skuId: OperationsIdSchema,
    skuCode: OperationsIdSchema,
    movementType: StockMovementTypeSchema,
    qtyDelta: z.number().int(),
    reservedDelta: z.number().int(),
    previousOnHand: QuantitySchema,
    newOnHand: QuantitySchema,
    previousReserved: QuantitySchema,
    newReserved: QuantitySchema,
    unitCostAtMovement: unitCost,
    previousUnitCost: unitCost,
    newUnitCost: unitCost,
    referenceCode: OperationsIdSchema,
    note: z.string().trim().min(1).max(2000),
  })
  .strict()
  .superRefine((movement, ctx) => {
    if (
      movement.qtyDelta !== movement.newOnHand - movement.previousOnHand ||
      movement.reservedDelta !==
        movement.newReserved - movement.previousReserved ||
      movement.newReserved > movement.newOnHand ||
      movement.previousReserved > movement.previousOnHand
    )
      issue(ctx, "Delta nhật ký kho không khớp số trước/sau.");
  });
export const TopSellerMetricSchema = z
  .object({
    skuId: OperationsIdSchema,
    sku: OperationsIdSchema,
    name: text,
    category: text,
    unit: text,
    orderCount: QuantitySchema,
    totalSoldQty: QuantitySchema,
    netRevenue: MoneyVNDSchema,
    totalCogs: MoneyVNDSchema,
    grossProfit: signedMoney,
    grossMarginPct: z.number().finite(),
    revenueSharePct: z.number().min(0).max(100),
    cumulativeSharePct: z.number().min(0).max(100),
    abcClass: ABCClassSchema,
    daysSinceLastSale: QuantitySchema.nullable(),
    isDeadStock: z.boolean(),
    tiedUpCapital: MoneyVNDSchema,
  })
  .strict();
export const RestockRecommendationSchema = z
  .object({
    skuId: OperationsIdSchema,
    sku: OperationsIdSchema,
    name: text,
    category: text,
    unit: text,
    supplierName: text.optional(),
    abcClass: ABCClassSchema,
    onHandQty: QuantitySchema,
    reservedQty: QuantitySchema,
    currentAvailableQty: QuantitySchema,
    dailySalesVelocity: z.number().finite().nonnegative(),
    daysUntilStockout: z.number().finite().nonnegative().nullable(),
    leadTimeDays: z.number().int().nonnegative(),
    safetyStockQty: QuantitySchema,
    reorderPoint: QuantitySchema,
    targetCoverDays: z.number().int().positive(),
    recommendedOrderQty: QuantitySchema,
    unitCostPrice: unitCost,
    estimatedRestockCost: MoneyVNDSchema,
    urgencyLevel: RestockUrgencySchema,
    priorityScore: z.number().int().min(0).max(100),
    actionReason: text,
  })
  .strict();
export const OperationsKPISummarySchema = z
  .object({
    totalInventoryValueAtCost: MoneyVNDSchema,
    totalExpectedRetailValue: MoneyVNDSchema,
    deadStockCapitalValue: MoneyVNDSchema,
    deadStockSkuCount: QuantitySchema,
    criticalRestockSkuCount: QuantitySchema,
    warningRestockSkuCount: QuantitySchema,
    totalRestockCapitalNeeded: MoneyVNDSchema,
    deliveredRevenue: MoneyVNDSchema,
    deliveredGrossProfit: signedMoney,
    inTransitOrdersCount: QuantitySchema,
    uninvoicedDeliveredCount: QuantitySchema,
    uninvoicedDeliveredAmount: MoneyVNDSchema,
    unpaidDeliveredCount: QuantitySchema,
    unpaidDeliveredReceivableAmount: MoneyVNDSchema,
  })
  .strict();
export const OperationContextSchema = z
  .object({
    operationId: OperationsIdSchema.max(80),
    actorId: OperationsIdSchema,
    timestamp: OperationsTimestampSchema,
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
export const OperationsStateSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    datasetKind: z.enum(["SAMPLE", "LIVE"]),
    inventory: z.array(InventoryItemSchema),
    orders: z.array(SalesOrderSchema),
    movements: z.array(StockMovementSchema),
    processedOperations: z.array(
      z
        .object({
          operationId: OperationsIdSchema,
          fingerprint: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((state, ctx) => {
    for (const ids of [
      state.inventory.map((i) => i.id),
      state.inventory.map((i) => i.sku),
      state.orders.map((o) => o.id),
      state.orders.map((o) => o.orderCode),
      state.movements.map((m) => m.id),
      state.processedOperations.map((o) => o.operationId),
    ])
      if (new Set(ids).size !== ids.length)
        issue(ctx, "ID/mã nghiệp vụ bị trùng.");
    const skus = new Map(state.inventory.map((item) => [item.id, item])),
      reserved = new Map<string, number>();
    for (const order of state.orders)
      for (const line of order.items) {
        const sku = skus.get(line.skuId);
        if (!sku || sku.sku !== line.skuCode)
          issue(ctx, "Đơn tham chiếu SKU không tồn tại/không khớp mã.");
        if (["CONFIRMED", "SHIPPING"].includes(order.fulfillmentStatus))
          reserved.set(line.skuId, (reserved.get(line.skuId) || 0) + line.qty);
      }
    for (const item of state.inventory)
      if (item.reservedQty !== (reserved.get(item.id) || 0))
        issue(ctx, "Tổng giữ chỗ không khớp đơn đang xử lý.");
    const latest = new Map<string, z.infer<typeof StockMovementSchema>>();
    for (const move of state.movements) {
      const item = skus.get(move.skuId),
        prev = latest.get(move.skuId);
      if (!item || item.sku !== move.skuCode)
        issue(ctx, "Nhật ký tham chiếu SKU không tồn tại.");
      if (
        prev &&
        (prev.newOnHand !== move.previousOnHand ||
          prev.newReserved !== move.previousReserved ||
          prev.newUnitCost !== move.previousUnitCost ||
          Date.parse(prev.timestamp) > Date.parse(move.timestamp))
      )
        issue(ctx, "Chuỗi nhật ký kho bị đứt.");
      latest.set(move.skuId, move);
    }
    for (const [id, move] of latest) {
      const item = skus.get(id);
      if (
        item &&
        (item.onHandQty !== move.newOnHand ||
          item.reservedQty !== move.newReserved ||
          item.costPrice !== move.newUnitCost)
      )
        issue(ctx, "Snapshot kho không khớp nhật ký cuối.");
    }
  });
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export type SalesOrder = z.infer<typeof SalesOrderSchema>;
export type OrderLineItem = z.infer<typeof OrderLineItemSchema>;
export type StockMovement = z.infer<typeof StockMovementSchema>;
export type TopSellerMetric = z.infer<typeof TopSellerMetricSchema>;
export type RestockRecommendation = z.infer<typeof RestockRecommendationSchema>;
export type OperationsKPISummary = z.infer<typeof OperationsKPISummarySchema>;
export type InvoiceMeta = z.infer<typeof InvoiceMetaSchema>;
export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;
export type ABCClass = z.infer<typeof ABCClassSchema>;
export type RestockUrgency = z.infer<typeof RestockUrgencySchema>;
export type TaxRate = z.infer<typeof TaxRateSchema>;
export type OperationsState = z.infer<typeof OperationsStateSchema>;
export type OperationContext = z.infer<typeof OperationContextSchema>;

// Operations has its own domain schema. It must not masquerade as CIC/TSBD underwriting evidence.
export const OperationsEvidenceSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    domain: z.literal("OPERATIONS"),
    datasetKind: z.enum(["SAMPLE", "LIVE"]),
    generatedAt: OperationsTimestampSchema,
    observations: z
      .object({
        inventory: ObservedFieldSchema(z.array(InventoryItemSchema)),
        orders: ObservedFieldSchema(z.array(SalesOrderSchema)),
        movements: ObservedFieldSchema(z.array(StockMovementSchema)),
      })
      .strict(),
    derivations: z
      .object({
        engineVersion: z.literal("1.0.0"),
        lookbackDays: z.number().int().positive(),
        kpis: OperationsKPISummarySchema,
        topSellers: z.array(TopSellerMetricSchema),
        restock: z.array(RestockRecommendationSchema),
        formulas: z.record(z.string(), z.string()),
        evidenceRefs: z.array(z.string()).min(1),
      })
      .strict(),
    inferences: z
      .array(
        z
          .object({
            id: OperationsIdSchema,
            statement: z.string().min(1),
            evidenceRefs: z.array(z.string()).min(1),
            sourceMode: z.enum(["GEMINI_BYOK_LIVE", "DETERMINISTIC_FALLBACK"]),
            reviewStatus: z.literal("UNREVIEWED"),
          })
          .strict(),
      )
      .max(100),
    unknowns: z.array(UnknownSchema),
  })
  .strict();
export type OperationsREAEvidencePayload = z.infer<
  typeof OperationsEvidenceSchema
>;
