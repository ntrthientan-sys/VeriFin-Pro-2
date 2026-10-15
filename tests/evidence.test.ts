import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyEvidenceEnvelope,
  evaluateFailClosedGate,
  VeriFinEvidenceEnvelopeSchema,
  type DocumentType,
} from "../src/schemas/evidenceSchema";
import { runDeterministicUnderwritingEngine as run } from "../src/engine/underwritingDerivations";
import { creditProposalLogic } from "../server/excelService";
import ExcelJS from "exceljs";
const field = <T>(value: T, documentType: DocumentType) => ({
  value,
  provenance: {
    sourceFileHash: "a".repeat(64),
    documentType,
    rawSnippet: "Trích nguồn: nhóm nợ và số tiền",
    pageNumber: 1,
  },
});
function fixture() {
  const e = createEmptyEvidenceEnvelope();
  e.observations.cic = [
    {
      id: "cic",
      documentType: "CIC",
      debtGroup: field(1, "CIC"),
      monthlyDebtServiceVND: field(10_000_000, "CIC"),
    },
  ];
  e.observations.collateral = [
    {
      id: "asset",
      documentType: "TSBD",
      description: field("Tài sản đã định giá", "TSBD"),
      valuationVND: field(1_000_000_000, "TSBD"),
    },
  ];
  e.observations.saoKe = [
    {
      id: "bank",
      documentType: "SAO_KE",
      periodMonths: field(6, "SAO_KE"),
      periodicDebtServiceVND: field(60_000_000, "SAO_KE"),
      netOperatingCashFlowVND: field(150_000_000, "SAO_KE"),
    },
  ];
  return e;
}
const terms = {
  loanAmountVND: 750_000_000,
  proposedMonthlyDebtServiceVND: 10_000_000,
  declaredMonthlyDebtServiceVND: 10_000_000,
  ltvCapPercent: 75,
  minimumDscr: 1.25,
};
test("six-month normalization and exact LTV/DSCR policy boundaries", () => {
  const e = run(fixture(), terms);
  assert.equal(e.derivations.ltvPercent?.value, 75);
  assert.equal(e.derivations.dscr?.value, 1.25);
  assert.equal(e.derivations.monthlyObservedDebtServiceVND?.value, 10_000_000);
  assert.equal(evaluateFailClosedGate(e).canExportProposal, true);
  assert.equal(
    evaluateFailClosedGate(
      run(fixture(), { ...terms, loanAmountVND: 750_000_001 }),
    ).canExportProposal,
    false,
  );
  assert.equal(
    evaluateFailClosedGate(
      run(fixture(), { ...terms, proposedMonthlyDebtServiceVND: 10_000_001 }),
    ).canExportProposal,
    false,
  );
});
test("debt gap > 5 million, not >=; CIC group source included", () => {
  assert.equal(
    evaluateFailClosedGate(
      run(fixture(), { ...terms, declaredMonthlyDebtServiceVND: 5_000_000 }),
    ).canExportProposal,
    true,
  );
  assert.ok(
    run(fixture(), {
      ...terms,
      declaredMonthlyDebtServiceVND: 4_999_999,
    }).unknowns.some((x) => x.code === "UNDECLARED_DEBT"),
  );
  const e = fixture();
  e.observations.cic[0].debtGroup.value = 2;
  assert.equal(
    run(e, terms).unknowns.find((x) => x.code.startsWith("CIC_GROUP"))
      ?.rawSnippet,
    e.observations.cic[0].debtGroup.provenance.rawSnippet,
  );
});
test("missing core cannot be waived; zero collateral, ambiguous periods, invalid input fail closed", () => {
  for (const mutate of [
    (e: ReturnType<typeof fixture>) => {
      e.observations.cic = [];
    },
    (e: ReturnType<typeof fixture>) => {
      delete e.observations.collateral[0].valuationVND;
    },
    (e: ReturnType<typeof fixture>) => {
      e.observations.collateral[0].valuationVND!.value = 0;
    },
    (e: ReturnType<typeof fixture>) => {
      e.observations.saoKe.push({
        ...e.observations.saoKe[0],
        id: "duplicatePeriod",
      });
    },
  ]) {
    const input = fixture();
    mutate(input);
    const e = run(input, terms);
    e.unknowns.forEach((x) => {
      x.resolvedByHuman = true;
      x.humanNote = "Đã kiểm tra";
    });
    assert.equal(evaluateFailClosedGate(e).canExportProposal, false);
  }
  assert.equal(
    evaluateFailClosedGate(
      run(fixture(), { ...terms, proposedMonthlyDebtServiceVND: NaN }),
    ).canExportProposal,
    false,
  );
  assert.equal(evaluateFailClosedGate({}).canExportProposal, false);
});
test("human review requires note and is invalidated by changed source or terms", () => {
  const source = fixture();
  source.observations.cic[0].debtGroup.value = 2;
  const e = run(source, terms);
  e.unknowns.forEach((x) => {
    x.resolvedByHuman = true;
    x.humanNote = " ";
  });
  assert.equal(evaluateFailClosedGate(e).canExportProposal, false);
  e.unknowns.forEach(
    (x) => (x.humanNote = "Kiểm tra nguồn, chấp nhận xuất bản nháp"),
  );
  assert.equal(evaluateFailClosedGate(run(e, terms)).canExportProposal, true);
  assert.equal(
    evaluateFailClosedGate(run(e, { ...terms, loanAmountVND: 700_000_000 }))
      .canExportProposal,
    false,
  );
  e.observations.cic[0].debtGroup.provenance.rawSnippet = "Nguồn khác";
  assert.equal(evaluateFailClosedGate(run(e, terms)).canExportProposal, false);
});
test("annual EBITDA and no model-derived override; provenance consistency", () => {
  const e = run(fixture(), terms);
  e.derivations.dscr!.value = 999;
  e.observations.bctc = [
    {
      id: "annual",
      documentType: "BCTC",
      periodMonths: field(12, "BCTC"),
      ebitdaVND: field(600_000_000, "BCTC"),
    },
  ];
  assert.equal(run(e, terms).derivations.dscr?.value, 2.5);
  e.observations.bctc[0].periodMonths.value = 6;
  assert.equal(evaluateFailClosedGate(run(e, terms)).canExportProposal, false);
  e.observations.cic[0].debtGroup.provenance.documentType = "TSBD";
  assert.equal(VeriFinEvidenceEnvelopeSchema.safeParse(e).success, false);
});
test("exported workbook DSCR includes existing obligations and review worksheet", async () => {
  const evidence = run(fixture(), terms);
  const output = await creditProposalLogic({
    customerName: "Test",
    loanPurpose: "Test",
    loanAmount: 750_000_000,
    tenureMonths: 75,
    newRateYear: 0,
    oldRateYear: 0,
    prepayPenaltyPct: 0,
    monthlyNetIncome: 25_000_000,
    collateralValue: 1_000_000_000,
    evidence,
  });
  assert.equal(output.dscr, 1.25);
  assert.equal(output.penalty_fee, 0);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(output.excelBuffer as any);
  assert.equal(wb.worksheets[0].getCell("B18").value, 10_000_000);
  assert.match(wb.worksheets[0].getCell("B12").formula, /B11\+B18/);
  assert.ok(wb.getWorksheet("3_Evidence_Review"));
});
