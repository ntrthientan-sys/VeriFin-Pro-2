import { z } from "zod";
export const DocumentTypeEnum = z.enum([
  "CIC",
  "BCTC",
  "SAO_KE",
  "TSBD",
  "VIETQR",
  "E_INVOICE",
  "KHAC",
]);
export const ProvenanceSchema = z
  .object({
    sourceFileHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceFileName: z.string().max(255).optional(),
    documentType: DocumentTypeEnum,
    pageNumber: z.number().int().positive().optional(),
    rawSnippet: z.string().trim().min(1).max(12000),
    locationPointer: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export function ObservedFieldSchema<T extends z.ZodType>(valueSchema: T) {
  return z
    .object({ value: valueSchema, provenance: ProvenanceSchema })
    .strict();
}
const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER);
const number = z.number().finite();
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = ObservedFieldSchema(z.string().trim().min(1));
const amount = ObservedFieldSchema(money);
export const CICObservationSchema = z
  .object({
    id,
    documentType: z.literal("CIC"),
    debtGroup: ObservedFieldSchema(z.number().int().min(1).max(5)),
    // An explicit zero must be present in the source; absence is unknown.
    monthlyDebtServiceVND: amount.optional(),
    outstandingVND: amount.optional(),
    lender: text.optional(),
  })
  .strict();
export const BCTCObservationSchema = z
  .object({
    id,
    documentType: z.literal("BCTC"),
    ebitdaVND: ObservedFieldSchema(number).optional(),
    periodMonths: ObservedFieldSchema(z.number().int().positive().max(12)),
  })
  .strict();
export const SaoKeObservationSchema = z
  .object({
    id,
    documentType: z.literal("SAO_KE"),
    periodMonths: ObservedFieldSchema(z.number().positive().max(120)),
    netOperatingCashFlowVND: ObservedFieldSchema(number),
    periodicDebtServiceVND: amount,
  })
  .strict();
export const CollateralObservationSchema = z
  .object({
    id,
    documentType: z.literal("TSBD"),
    description: text,
    valuationVND: amount.optional(),
  })
  .strict();
export const ObservationsSchema = z
  .object({
    cic: z.array(CICObservationSchema).max(100),
    bctc: z.array(BCTCObservationSchema).max(20),
    saoKe: z.array(SaoKeObservationSchema).max(100),
    collateral: z.array(CollateralObservationSchema).max(100),
  })
  .strict();
export const UnderwritingInputsSchema = z
  .object({
    loanAmountVND: money.positive(),
    proposedMonthlyDebtServiceVND: money.positive(),
    declaredMonthlyDebtServiceVND: money,
    ltvCapPercent: z.number().positive().max(100).default(75),
    minimumDscr: z.number().positive().default(1.25),
  })
  .strict();
export const DerivationSchema = z
  .object({
    value: number,
    formula: z.string().min(1),
    inputs: z.record(z.string(), number),
    evidenceRefs: z.array(z.string().min(1)).min(1),
  })
  .strict();
export const DerivationsSchema = z
  .object({
    engineVersion: z.literal("1.0.0").optional(),
    reviewBasis: z.string().optional(),
    underwritingInputs: UnderwritingInputsSchema.optional(),
    totalCollateralValueVND: DerivationSchema.optional(),
    ltvPercent: DerivationSchema.optional(),
    monthlyObservedDebtServiceVND: DerivationSchema.optional(),
    undeclaredDebtGapVND: DerivationSchema.optional(),
    monthlyAvailableCashFlowVND: DerivationSchema.optional(),
    dscr: DerivationSchema.optional(),
  })
  .strict();
export const InferenceSchema = z
  .object({
    id,
    statement: z.string().min(1),
    evidenceRefs: z.array(z.string()),
    confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  })
  .strict();
export const UnknownSchema = z
  .object({
    id,
    severity: z.enum(["BLOCKER", "WARNING", "INFO"]),
    code: z.string().min(1),
    message: z.string().min(1),
    evidenceRefs: z.array(z.string()),
    rawSnippet: z.string().optional(),
    resolvedByHuman: z.boolean().default(false),
    humanNote: z.string().max(2000).optional(),
  })
  .strict();
export const VeriFinEvidenceEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("2.0.0"),
    observations: ObservationsSchema,
    derivations: DerivationsSchema,
    inferences: z.array(InferenceSchema).max(200),
    unknowns: z.array(UnknownSchema).max(500),
  })
  .strict()
  .superRefine((envelope, context) => {
    const ids = new Set<string>();
    for (const group of Object.values(envelope.observations))
      for (const observation of group) {
        if (ids.has(observation.id))
          context.addIssue({
            code: "custom",
            message: "Observation IDs must be unique.",
          });
        ids.add(observation.id);
        for (const field of Object.values(observation))
          if (field && typeof field === "object" && "provenance" in field) {
            if (field.provenance.documentType !== observation.documentType)
              context.addIssue({
                code: "custom",
                message: "Provenance document type mismatch.",
              });
          }
      }
    if (
      new Set(envelope.unknowns.map((issue) => issue.id)).size !==
      envelope.unknowns.length
    )
      context.addIssue({
        code: "custom",
        message: "Unknown IDs must be unique.",
      });
  });
export type EvidenceEnvelope = z.infer<typeof VeriFinEvidenceEnvelopeSchema>;
export type UnderwritingInputs = z.infer<typeof UnderwritingInputsSchema>;
export type EvidenceUnknown = z.infer<typeof UnknownSchema>;
export type DocumentType = z.infer<typeof DocumentTypeEnum>;
export const CORE_DERIVATIONS = [
  "totalCollateralValueVND",
  "ltvPercent",
  "monthlyObservedDebtServiceVND",
  "undeclaredDebtGapVND",
  "monthlyAvailableCashFlowVND",
  "dscr",
] as const;
export function createEmptyEvidenceEnvelope(): EvidenceEnvelope {
  return {
    schemaVersion: "2.0.0",
    observations: { cic: [], bctc: [], saoKe: [], collateral: [] },
    derivations: {},
    inferences: [],
    unknowns: [],
  };
}
export function getObservationReferences(
  envelope: EvidenceEnvelope,
): Set<string> {
  const refs = new Set<string>();
  for (const group of Object.values(envelope.observations))
    for (const item of group) {
      for (const [key, field] of Object.entries(item))
        if (field && typeof field === "object" && "provenance" in field)
          refs.add(`${item.id}.${key}`);
    }
  return refs;
}
export function evaluateFailClosedGate(input: unknown) {
  const checked = VeriFinEvidenceEnvelopeSchema.safeParse(input);
  if (!checked.success)
    return {
      canExportProposal: false,
      unresolvedBlockers: [] as EvidenceUnknown[],
      missingCoreDerivations: [...CORE_DERIVATIONS] as string[],
      reasonSummary:
        "Evidence v2 thiếu hoặc sai schema. Không được xuất tờ trình.",
    };
  const envelope = checked.data;
  const refs = getObservationReferences(envelope);
  const missingCoreDerivations: string[] = CORE_DERIVATIONS.filter((key) => {
    const derivation = envelope.derivations[key];
    return !derivation || derivation.evidenceRefs.some((ref) => !refs.has(ref));
  });
  if (
    envelope.derivations.engineVersion !== "1.0.0" ||
    !envelope.derivations.underwritingInputs
  )
    missingCoreDerivations.push("deterministicEngineInputs");
  if (!envelope.observations.cic.length) missingCoreDerivations.push("CIC");
  if (!envelope.observations.collateral.length)
    missingCoreDerivations.push("TSBD");
  const unresolvedBlockers = envelope.unknowns.filter(
    (issue) =>
      issue.severity === "BLOCKER" &&
      !(issue.resolvedByHuman === true && !!issue.humanNote?.trim()),
  );
  const canExportProposal =
    missingCoreDerivations.length === 0 && unresolvedBlockers.length === 0;
  return {
    canExportProposal,
    unresolvedBlockers,
    missingCoreDerivations,
    reasonSummary: canExportProposal
      ? "Đủ bằng chứng và tính toán để xuất bản nháp; không phải quyết định phê duyệt tín dụng."
      : `Chặn xuất: ${missingCoreDerivations.length} phép tính/bằng chứng cốt lõi còn thiếu, ${unresolvedBlockers.length} BLOCKER chưa xử lý.`,
  };
}
