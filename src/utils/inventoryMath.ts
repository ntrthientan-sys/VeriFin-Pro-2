/** VND totals are whole dong; moving-average unit cost retains six decimal places. */
export const COST_SCALE = 1_000_000n;
export function safeInteger(value: bigint): number {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("NUMERIC_OVERFLOW");
  return Number(value);
}
export function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("INVALID_DENOMINATOR");
  return numerator < 0n
    ? -roundRatio(-numerator, denominator)
    : (numerator + denominator / 2n) / denominator;
}
export function costMicros(value: number): bigint {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000)
    throw new Error("INVALID_UNIT_COST");
  return BigInt(Math.round(value * Number(COST_SCALE)));
}
export function costOfQuantity(qty: number, cost: number): number {
  return safeInteger(roundRatio(BigInt(qty) * costMicros(cost), COST_SCALE));
}
export function lineAmounts(
  qty: number,
  unitPrice: number,
  discount: number,
  taxRate: number,
  unitCost: number,
) {
  const net = BigInt(qty) * BigInt(unitPrice) - BigInt(discount);
  if (net < 0n) throw new Error("DISCOUNT_EXCEEDS_LINE_VALUE");
  const tax = roundRatio(net * BigInt(taxRate), 100n);
  return {
    lineNetTotal: safeInteger(net),
    lineTaxAmount: safeInteger(tax),
    lineGrandTotal: safeInteger(net + tax),
    lineCogs: costOfQuantity(qty, unitCost),
  };
}
export function sumMoney(values: number[]): number {
  return safeInteger(values.reduce((sum, value) => sum + BigInt(value), 0n));
}
export function weightedCost(
  oldQty: number,
  oldCost: number,
  addedQty: number,
  addedCost: number,
): number {
  return (
    Number(
      roundRatio(
        BigInt(oldQty) * costMicros(oldCost) +
          BigInt(addedQty) * costMicros(addedCost),
        BigInt(oldQty + addedQty),
      ),
    ) / Number(COST_SCALE)
  );
}
