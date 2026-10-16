import { z } from "zod";
import { OperationsStateSchema } from "../schemas/inventoryOrderSchema";
import {
  computeOperationsKPIs,
  computeRestockRecommendations,
  computeTopSellersAndABC,
  allocateRestockWithinBudget,
  isOrderRequiringUrgentInvoice,
} from "./inventoryAnalyticsEngine";
const text = z.string().trim().min(1).max(2500);
export const OperationsAdvisorRequestSchema = z
  .object({
    state: OperationsStateSchema,
    referenceDate: z.iso.datetime({ offset: true }),
    lookbackDays: z.number().int().min(1).max(3650),
    targetCoverDays: z.number().int().min(1).max(365),
    budgetVnd: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type OperationsAdvisorRequest = z.infer<
  typeof OperationsAdvisorRequestSchema
>;
export const AIInventoryAdvisorySchema = z
  .object({
    executiveSummary: text,
    cashFlowAllocationAdvice: z
      .array(
        z
          .object({
            sku: text,
            name: text,
            recommendedAction: text,
            priorityReason: text,
          })
          .strict(),
      )
      .max(100),
    deadStockLiquidationStrategies: z
      .array(
        z
          .object({
            sku: text,
            name: text,
            tiedUpCapital: z.number().int().nonnegative(),
            suggestedBundleOrDiscount: text,
          })
          .strict(),
      )
      .max(100),
    taxAndInvoiceComplianceWarnings: z.array(text).max(500),
    confidenceScore: z.number().min(0).max(100).nullable(),
    sourceMode: z.enum(["GEMINI_BYOK_LIVE", "DETERMINISTIC_FALLBACK"]),
  })
  .strict();
export type AIInventoryAdvisory = z.infer<typeof AIInventoryAdvisorySchema>;
// AI supplies interpretations only; monetary values, identities and warnings come from our engine.
export const AdvisorInferenceSchema = z
  .object({
    executiveSummary: text,
    allocation: z
      .array(z.object({ sku: text, advice: text }).strict())
      .max(100),
    liquidation: z
      .array(z.object({ sku: text, advice: text }).strict())
      .max(100),
  })
  .strict();
export function prepareOperationsAdvice(raw: OperationsAdvisorRequest) {
  const input = OperationsAdvisorRequestSchema.parse(raw);
  const options = {
    referenceDate: input.referenceDate,
    lookbackDays: input.lookbackDays,
    targetCoverDays: input.targetCoverDays,
  };
  const { state } = input;
  const restock = computeRestockRecommendations(
    state.inventory,
    state.orders,
    options,
  );
  const allocation = allocateRestockWithinBudget(restock, input.budgetVnd);
  const dead = computeTopSellersAndABC(state.inventory, state.orders, {
    referenceDate: input.referenceDate,
    lookbackDays: input.lookbackDays,
    scope: "DELIVERED",
  }).filter((i) => i.isDeadStock);
  const warnings = state.orders
    .filter(isOrderRequiringUrgentInvoice)
    .map((o) => `Đơn ${o.orderCode}: cần rà soát hóa đơn đã phát hành.`);
  for (const o of state.orders)
    if (
      ["CANCELLED", "RETURNED"].includes(o.fulfillmentStatus) &&
      (o.invoiceMeta || o.paidAmount > 0)
    )
      warnings.push(
        `Đơn ${o.orderCode}: rà soát hoàn tiền/điều chỉnh hóa đơn.`,
      );
  if (state.datasetKind === "SAMPLE")
    warnings.unshift("DỮ LIỆU MẪU — không dùng như hồ sơ thực tế.");
  if (!warnings.length)
    warnings.push(
      "Chưa phát hiện cảnh báo theo quy tắc hiện tại; không phải xác nhận tuân thủ thuế.",
    );
  return {
    input,
    kpis: computeOperationsKPIs(state.inventory, state.orders, options),
    allocation,
    dead,
    warnings,
  };
}
export function buildOperationsAdvisory(
  raw: OperationsAdvisorRequest,
  inference?: z.infer<typeof AdvisorInferenceSchema>,
): AIInventoryAdvisory {
  const p = prepareOperationsAdvice(raw);
  if (inference) {
    inference = AdvisorInferenceSchema.parse(inference);
    for (const [items, allowed] of [
      [inference.allocation, p.allocation.allocatedItems],
      [inference.liquidation, p.dead],
    ] as const) {
      if (
        new Set(items.map((i) => i.sku)).size !== items.length ||
        items.some((i) => !allowed.some((a) => a.sku === i.sku))
      )
        throw new Error("AI tham chiếu SKU ngoài bằng chứng.");
    }
  }
  return AIInventoryAdvisorySchema.parse({
    executiveSummary:
      inference?.executiveSummary ||
      `Phân bổ ${p.allocation.totalAllocatedCost.toLocaleString("vi-VN")} ₫ trong ngân sách ${p.input.budgetVnd.toLocaleString("vi-VN")} ₫; công nợ đã giao còn ${p.kpis.unpaidDeliveredReceivableAmount.toLocaleString("vi-VN")} ₫.`,
    cashFlowAllocationAdvice: p.allocation.allocatedItems
      .filter((i) => i.recommendedOrderQty > 0)
      .map((i) => ({
        sku: i.sku,
        name: i.name,
        recommendedAction:
          inference?.allocation.find((a) => a.sku === i.sku)?.advice ||
          `Đề xuất ${i.allocatedQty}/${i.recommendedOrderQty} ${i.unit}; dự toán ${i.allocatedCost.toLocaleString("vi-VN")} ₫. Chỉ ghi nhập kho khi hàng đã nhận.`,
        priorityReason: i.actionReason,
      })),
    deadStockLiquidationStrategies: p.dead.map((i) => ({
      sku: i.sku,
      name: i.name,
      tiedUpCapital: i.tiedUpCapital,
      suggestedBundleOrDiscount:
        inference?.liquidation.find((a) => a.sku === i.sku)?.advice ||
        "Rà soát nhu cầu, hạn dùng và biên lợi nhuận trước khi quyết định bundle/giảm giá.",
    })),
    taxAndInvoiceComplianceWarnings: p.warnings,
    confidenceScore: null,
    sourceMode: inference ? "GEMINI_BYOK_LIVE" : "DETERMINISTIC_FALLBACK",
  });
}
