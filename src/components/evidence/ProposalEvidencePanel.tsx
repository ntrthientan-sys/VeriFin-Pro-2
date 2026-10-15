import React, { useRef, useState } from "react";
import {
  createEmptyEvidenceEnvelope,
  evaluateFailClosedGate,
  type DocumentType,
  type EvidenceEnvelope,
} from "../../schemas/evidenceSchema";
import { extractEvidenceDocument } from "../../services/evidenceService";
import { clearEvidenceCache } from "../../utils/deterministicCache";
import { redactSensitiveLog } from "../../utils/redaction";

export default function ProposalEvidencePanel({
  envelope,
  onChange,
  onBusyChange,
}: {
  envelope: EvidenceEnvelope;
  onChange: (next: EvidenceEnvelope) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [documentType, setDocumentType] = useState<DocumentType>("CIC");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const current = useRef(envelope);
  current.current = envelope;
  const gate = evaluateFailClosedGate(envelope);
  async function extract(file?: File) {
    if (!file) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      const extracted = await extractEvidenceDocument(file, documentType);
      const next = structuredClone(current.current);
      const ids = new Set(
        Object.values(extracted.observations)
          .flat()
          .map((item) => item.id),
      );
      for (const group of ["cic", "bctc", "saoKe", "collateral"] as const) {
        // Re-uploading identical evidence is idempotent; replacing inputs invalidates all reviews.
        (next.observations[group] as unknown[]) = [
          ...next.observations[group].filter((item) => !ids.has(item.id)),
          ...extracted.observations[group],
        ];
      }
      next.derivations = {};
      next.unknowns = [
        ...next.unknowns.filter(
          (issue) =>
            !issue.id.startsWith("engine_") &&
            !extracted.unknowns.some((other) => other.id === issue.id),
        ),
        ...extracted.unknowns,
      ].map((issue) => ({
        ...issue,
        resolvedByHuman: false,
        humanNote: undefined,
      }));
      onChange(next);
    } catch (err) {
      setError(redactSensitiveLog(err));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  function review(id: string, note: string, approved: boolean) {
    onChange({
      ...envelope,
      unknowns: envelope.unknowns.map((issue) =>
        issue.id === id
          ? {
              ...issue,
              humanNote: note,
              resolvedByHuman: approved && !!note.trim(),
            }
          : issue,
      ),
    });
  }
  const observed = Object.values(envelope.observations)
    .flat()
    .flatMap((item) =>
      Object.entries(item)
        .filter(
          ([, value]) =>
            value && typeof value === "object" && "provenance" in value,
        )
        .map(([field, value]) => ({
          id: `${item.id}.${field}`,
          field,
          value: value as {
            value: unknown;
            provenance: {
              sourceFileName?: string;
              sourceFileHash: string;
              pageNumber?: number;
              rawSnippet: string;
            };
          },
        })),
    );
  return (
    <section
      className="space-y-4 rounded-2xl border border-cyan-600/50 bg-slate-900 p-5"
      aria-label="Evidence v2 và cổng xuất tờ trình"
    >
      <h3 className="text-lg font-bold text-cyan-200">
        Evidence v2 · Kiểm tra trước khi xuất
      </h3>
      <p className="text-sm text-slate-300">
        Tải từng CIC, sao kê, định giá TSBĐ; BCTC là nguồn EBITDA tùy chọn. Số
        liệu thiếu giữ nguyên là chưa biết. Tài liệu được gửi tới Gemini bằng
        key cá nhân; cache lưu tối đa 24 giờ trên thiết bị.
      </p>
      <div className="flex flex-wrap gap-3 items-center">
        <label>
          Loại tài liệu{" "}
          <select
            value={documentType}
            onChange={(event) =>
              setDocumentType(event.target.value as DocumentType)
            }
            disabled={busy}
            className="rounded bg-slate-800 p-2"
          >
            <option value="CIC">CIC</option>
            <option value="SAO_KE">Sao kê</option>
            <option value="TSBD">Định giá TSBĐ</option>
            <option value="BCTC">BCTC</option>
          </select>
        </label>
        <label className="rounded bg-cyan-800 p-2 cursor-pointer">
          {busy ? "Đang trích xuất…" : "Chọn PDF / ảnh"}
          <input
            aria-label="Tài liệu Evidence"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            disabled={busy}
            className="block text-xs"
            onChange={(event) => {
              void extract(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          className="text-sm underline"
          onClick={() => onChange(createEmptyEvidenceEnvelope())}
        >
          Xóa hồ sơ đang xét
        </button>
        <button
          type="button"
          disabled={busy}
          className="text-sm underline"
          onClick={() =>
            void clearEvidenceCache()
              .then(() => setError("Đã xóa cache trên thiết bị."))
              .catch((err) => setError(redactSensitiveLog(err)))
          }
        >
          Xóa cache thiết bị
        </button>
      </div>
      {error && (
        <p role="alert" className="text-amber-300">
          {error}
        </p>
      )}
      <p
        role="status"
        className={
          gate.canExportProposal ? "text-emerald-300" : "text-rose-300"
        }
      >
        {gate.reasonSummary}
      </p>
      {!!gate.missingCoreDerivations.length && (
        <p className="text-xs text-slate-400">
          Còn thiếu: {gate.missingCoreDerivations.join(", ")}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3 text-sm">
        <div>
          LTV: {envelope.derivations.ltvPercent?.value ?? "Chưa đủ bằng chứng"}%
        </div>
        <div>
          DSCR: {envelope.derivations.dscr?.value ?? "Chưa đủ bằng chứng"}
        </div>
        <div>
          Lệch trả nợ:{" "}
          {envelope.derivations.undeclaredDebtGapVND?.value.toLocaleString(
            "vi-VN",
          ) ?? "Chưa đủ bằng chứng"}{" "}
          VNĐ/tháng
        </div>
      </div>
      {envelope.unknowns.map((issue) => (
        <div
          key={issue.id}
          className="rounded border border-slate-700 p-3 space-y-2 text-sm"
        >
          <strong>
            {issue.severity}: {issue.message}
          </strong>
          {issue.rawSnippet && (
            <blockquote className="border-l-2 border-amber-700 pl-3 text-slate-300">
              {issue.rawSnippet}
            </blockquote>
          )}
          {issue.severity === "BLOCKER" && (
            <>
              <label className="block">
                Ghi chú xử lý của chuyên viên
                <textarea
                  value={issue.humanNote || ""}
                  maxLength={2000}
                  disabled={busy}
                  onChange={(event) =>
                    review(issue.id, event.target.value, false)
                  }
                  className="mt-1 block w-full rounded bg-slate-800 p-2"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={issue.resolvedByHuman && !!issue.humanNote?.trim()}
                  disabled={busy || !issue.humanNote?.trim()}
                  onChange={(event) =>
                    review(
                      issue.id,
                      issue.humanNote || "",
                      event.target.checked,
                    )
                  }
                />
                Tôi đã kiểm tra nguồn và xác nhận xử lý điểm này
              </label>
            </>
          )}
        </div>
      ))}
      <details>
        <summary className="cursor-pointer text-cyan-200">
          Quan sát có nguồn ({observed.length} trường) · 20 trường/trang
        </summary>
        <div className="space-y-2 pt-3">
          {observed.slice(page * 20, page * 20 + 20).map((row) => (
            <div
              key={row.id}
              className="border-b border-slate-700 pb-2 text-xs"
            >
              <strong>
                {row.id}: {String(row.value.value)}
              </strong>
              <p>
                {row.value.provenance.sourceFileName ||
                  row.value.provenance.sourceFileHash.slice(0, 16)}{" "}
                · trang {row.value.provenance.pageNumber ?? "chưa xác định"}
              </p>
              <blockquote className="text-slate-400">
                {row.value.provenance.rawSnippet}
              </blockquote>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          className="mr-4"
        >
          Trang trước
        </button>
        <button
          type="button"
          disabled={(page + 1) * 20 >= observed.length}
          onClick={() => setPage(page + 1)}
        >
          Trang sau
        </button>
      </details>
    </section>
  );
}
