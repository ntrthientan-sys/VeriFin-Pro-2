import {
  VeriFinEvidenceEnvelopeSchema,
  type DocumentType,
  type EvidenceEnvelope,
} from "../schemas/evidenceSchema";
import {
  computeFileSha256,
  getOrExtractWithEvidenceCache,
} from "../utils/deterministicCache";
import { apiFetch } from "./apiClient";
export async function extractEvidenceDocument(
  file: File,
  documentType: DocumentType,
): Promise<EvidenceEnvelope> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Mỗi tài liệu Evidence tối đa 10 MB.");
  const configResponse = await apiFetch("/api/evidence/config");
  if (!configResponse.ok)
    throw new Error("Không đọc được cấu hình model Evidence.");
  const { modelName } = await configResponse.json();
  if (typeof modelName !== "string" || !/^[a-zA-Z0-9._-]+$/.test(modelName))
    throw new Error("Cấu hình model không hợp lệ.");
  const hash = await computeFileSha256(file);
  const schema = VeriFinEvidenceEnvelopeSchema.refine(
    (envelope) =>
      Object.values(envelope.observations).every((group) =>
        group.every((item) =>
          Object.values(item).every(
            (field) =>
              !field ||
              typeof field !== "object" ||
              !("provenance" in field) ||
              (field.provenance.sourceFileHash === hash &&
                field.provenance.documentType === documentType),
          ),
        ),
      ),
    { message: "Evidence source does not match current file." },
  );
  return getOrExtractWithEvidenceCache({
    file,
    modelName,
    moduleName: `underwriting:${documentType}`,
    zodSchema: schema,
    extractorFn: async () => {
      const form = new FormData();
      form.set("file", file);
      form.set("document_type", documentType);
      const response = await apiFetch("/api/evidence/extract", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Không trích xuất được bằng chứng.");
      return data.evidence;
    },
  });
}
