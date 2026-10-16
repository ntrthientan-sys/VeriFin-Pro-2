import { apiFetch } from "./apiClient";
import {
  AIInventoryAdvisorySchema,
  OperationsAdvisorRequestSchema,
  type OperationsAdvisorRequest,
} from "./operationsAdvisoryContract";
export {
  buildOperationsAdvisory,
  AIInventoryAdvisorySchema,
} from "./operationsAdvisoryContract";
export type { AIInventoryAdvisory } from "./operationsAdvisoryContract";
export async function generateOperationsAIAdvisory(
  input: OperationsAdvisorRequest,
  signal?: AbortSignal,
) {
  const response = await apiFetch("/api/operations/advisory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(OperationsAdvisorRequestSchema.parse(input)),
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không nhận được tư vấn AI.");
  return AIInventoryAdvisorySchema.parse(data);
}
