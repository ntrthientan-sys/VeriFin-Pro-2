import {
  createEmptyEvidenceEnvelope,
  UnderwritingInputsSchema,
  VeriFinEvidenceEnvelopeSchema,
  type EvidenceEnvelope,
  type EvidenceUnknown,
  type UnderwritingInputs,
} from "../schemas/evidenceSchema";

const round = (value: number, decimals = 6) => Number(value.toFixed(decimals));
/** Pure, deterministic and shared with the server. Ignores supplied derivations. */
export function runDeterministicUnderwritingEngine(
  source: EvidenceEnvelope,
  suppliedInputs: UnderwritingInputs,
): EvidenceEnvelope {
  const parsed = VeriFinEvidenceEnvelopeSchema.safeParse(source);
  const inputResult = UnderwritingInputsSchema.safeParse(suppliedInputs);
  if (!parsed.success || !inputResult.success) {
    const empty = createEmptyEvidenceEnvelope();
    empty.unknowns.push({
      id: "engine_invalid_input",
      code: "INVALID_INPUT",
      severity: "BLOCKER",
      message: "Evidence hoặc điều kiện vay không hợp lệ.",
      evidenceRefs: [],
      resolvedByHuman: false,
    });
    return empty;
  }
  const envelope = parsed.data;
  const inputs = inputResult.data;
  const result: EvidenceEnvelope = {
    ...envelope,
    derivations: {
      engineVersion: "1.0.0",
      underwritingInputs: inputs,
      reviewBasis: JSON.stringify(envelope.observations),
    },
    unknowns: envelope.unknowns.filter(
      (issue) => !issue.id.startsWith("engine_"),
    ),
  };
  // Preserve only an explicit review of the same engine issue AND the same underlying evidence/terms.
  const sameTerms =
    envelope.derivations.reviewBasis ===
      JSON.stringify(envelope.observations) &&
    JSON.stringify(envelope.derivations.underwritingInputs) ===
      JSON.stringify(inputs);
  function issue(
    code: string,
    message: string,
    evidenceRefs: string[] = [],
    rawSnippet?: string,
  ) {
    const id = `engine_${code.toLowerCase()}`;
    const old = envelope.unknowns.find((item) => item.id === id);
    const reusable =
      sameTerms &&
      old?.message === message &&
      JSON.stringify(old.evidenceRefs) === JSON.stringify(evidenceRefs) &&
      old.rawSnippet === rawSnippet;
    const entry: EvidenceUnknown = {
      id,
      code,
      severity: "BLOCKER",
      message,
      evidenceRefs,
      resolvedByHuman: reusable ? old.resolvedByHuman : false,
      ...(rawSnippet ? { rawSnippet } : {}),
      ...(reusable && old.humanNote ? { humanNote: old.humanNote } : {}),
    };
    result.unknowns.push(entry);
  }
  const derivation = (
    value: number,
    formula: string,
    numericInputs: Record<string, number>,
    evidenceRefs: string[],
  ) => ({ value: round(value), formula, inputs: numericInputs, evidenceRefs });
  const { collateral, cic, saoKe, bctc } = envelope.observations;
  const valued = collateral.filter((item) => item.valuationVND !== undefined);
  if (!collateral.length || valued.length !== collateral.length)
    issue(
      "MISSING_COLLATERAL",
      "Thiếu TSBĐ hoặc giá trị định giá có bằng chứng.",
    );
  else {
    const total = valued.reduce(
      (sum, item) => sum + item.valuationVND!.value,
      0,
    );
    const refs = valued.map((item) => `${item.id}.valuationVND`);
    result.derivations.totalCollateralValueVND = derivation(
      total,
      "sum(valuationVND)",
      { total },
      refs,
    );
    if (total <= 0)
      issue(
        "ZERO_COLLATERAL",
        "Tổng giá trị TSBĐ bằng 0; không tính được LTV.",
        refs,
      );
    else {
      const ltv = (inputs.loanAmountVND / total) * 100;
      result.derivations.ltvPercent = derivation(
        ltv,
        "loanAmountVND / totalCollateralValueVND * 100",
        { loanAmountVND: inputs.loanAmountVND, totalCollateralValueVND: total },
        refs,
      );
      if (ltv > inputs.ltvCapPercent)
        issue(
          "LTV_LIMIT",
          `LTV ${round(ltv)}% vượt trần chính sách ${inputs.ltvCapPercent}%.`,
          refs,
        );
    }
  }
  if (!cic.length)
    issue("MISSING_CIC", "Chưa có bằng chứng CIC để kiểm tra nhóm nợ.");
  for (const item of cic)
    if (item.debtGroup.value > 1)
      issue(
        `CIC_GROUP_${item.id}`,
        `CIC ${item.id}: nhóm nợ ${item.debtGroup.value} lớn hơn nhóm 1.`,
        [`${item.id}.debtGroup`],
        item.debtGroup.provenance.rawSnippet,
      );
  if (cic.some((item) => !item.monthlyDebtServiceVND))
    issue(
      "MISSING_CIC_PAYMENT",
      "CIC thiếu nghĩa vụ trả nợ định kỳ; không suy đoán từ dư nợ.",
    );
  if (!saoKe.length)
    issue(
      "MISSING_STATEMENT",
      "Thiếu sao kê và kỳ quan sát để đối chiếu nghĩa vụ nợ.",
    );
  else {
    // Require one consolidated statement period; summing overlapping statements can double count.
    if (saoKe.length > 1)
      issue(
        "AMBIGUOUS_STATEMENT_PERIOD",
        "Có nhiều sao kê. Cần hợp nhất/đối chiếu kỳ và loại trừ trùng trước khi tính.",
      );
    else {
      const statement = saoKe[0];
      const observed =
        statement.periodicDebtServiceVND.value / statement.periodMonths.value;
      const debtRefs = [
        `${statement.id}.periodicDebtServiceVND`,
        `${statement.id}.periodMonths`,
      ];
      result.derivations.monthlyObservedDebtServiceVND = derivation(
        observed,
        "periodicDebtServiceVND / periodMonths",
        {
          periodicDebtServiceVND: statement.periodicDebtServiceVND.value,
          periodMonths: statement.periodMonths.value,
        },
        debtRefs,
      );
      if (
        cic.length &&
        cic.every((item) => item.monthlyDebtServiceVND !== undefined)
      ) {
        const cicMonthly = cic.reduce(
          (sum, item) => sum + item.monthlyDebtServiceVND!.value,
          0,
        );
        const gap = Math.max(
          Math.abs(observed - inputs.declaredMonthlyDebtServiceVND),
          Math.abs(observed - cicMonthly),
        );
        const refs = [
          ...debtRefs,
          ...cic.map((item) => `${item.id}.monthlyDebtServiceVND`),
        ];
        result.derivations.undeclaredDebtGapVND = derivation(
          gap,
          "max(abs(observed - declared), abs(observed - CIC))",
          {
            observed,
            declared: inputs.declaredMonthlyDebtServiceVND,
            cic: cicMonthly,
          },
          refs,
        );
        if (gap > 5_000_000)
          issue(
            "UNDECLARED_DEBT",
            `Nghĩa vụ trả nợ bình quân lệch ${round(gap, 2)} VNĐ so với khai báo/CIC, vượt 5.000.000 VNĐ.`,
            refs,
          );
      }
      let available: number | undefined;
      let refs: string[] = [];
      if (bctc.length > 1)
        issue(
          "AMBIGUOUS_FINANCIAL_PERIOD",
          "Có nhiều BCTC; cần chọn kỳ tài chính dùng cho DSCR.",
        );
      else if (bctc.length === 1) {
        const report = bctc[0];
        if (report.ebitdaVND === undefined || report.periodMonths.value !== 12)
          issue(
            "MISSING_ANNUAL_EBITDA",
            "BCTC chưa có EBITDA cả năm (12 tháng); không tự nội suy.",
          );
        else {
          available = report.ebitdaVND.value / 12;
          refs = [`${report.id}.ebitdaVND`, `${report.id}.periodMonths`];
        }
      } else {
        available =
          statement.netOperatingCashFlowVND.value /
          statement.periodMonths.value;
        refs = [
          `${statement.id}.netOperatingCashFlowVND`,
          `${statement.id}.periodMonths`,
        ];
      }
      if (available !== undefined) {
        result.derivations.monthlyAvailableCashFlowVND = derivation(
          available,
          bctc.length
            ? "annual EBITDA / 12"
            : "netOperatingCashFlowVND / periodMonths",
          { monthlyAvailableCashFlowVND: available },
          refs,
        );
        // Operating cash flow must be BEFORE debt service; denominator includes current + proposed debt.
        const denominator = observed + inputs.proposedMonthlyDebtServiceVND;
        const dscr = available / denominator;
        const dscrRefs = [...refs, ...debtRefs];
        result.derivations.dscr = derivation(
          dscr,
          "monthlyAvailableCashFlowVND / (observedMonthlyDebtService + proposedMonthlyDebtService)",
          {
            monthlyAvailableCashFlowVND: available,
            observedMonthlyDebtService: observed,
            proposedMonthlyDebtService: inputs.proposedMonthlyDebtServiceVND,
          },
          dscrRefs,
        );
        if (dscr < inputs.minimumDscr)
          issue(
            "LOW_DSCR",
            `DSCR ${round(dscr)} thấp hơn ngưỡng ${inputs.minimumDscr}.`,
            dscrRefs,
          );
      }
    }
  }
  const checked = VeriFinEvidenceEnvelopeSchema.safeParse(result);
  if (!checked.success) {
    const empty = createEmptyEvidenceEnvelope();
    empty.unknowns.push({
      id: "engine_overflow",
      code: "CALCULATION_INVALID",
      severity: "BLOCKER",
      message: "Kết quả tính toán không hữu hạn hoặc không hợp lệ.",
      evidenceRefs: [],
      resolvedByHuman: false,
    });
    return empty;
  }
  return checked.data;
}
