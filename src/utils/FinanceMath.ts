/** Display arithmetic only: missing underwriting evidence must still produce BLOCKERs. */
export function safeDivide(
  numerator: number,
  denominator: number,
  decimals = 2,
): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  )
    return 0;
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 15)
    throw new RangeError("decimals must be an integer between 0 and 15");
  const result = numerator / denominator;
  return Number.isFinite(result) ? Number(result.toFixed(decimals)) : 0;
}
export function roundVND(amount: number): number {
  if (!Number.isFinite(amount))
    throw new RangeError("VND amount must be finite");
  return Math.round(amount);
}
export const FinanceMath = { safeDivide, roundVND };
