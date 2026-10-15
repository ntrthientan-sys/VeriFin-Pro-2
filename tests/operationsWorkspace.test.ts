import { test } from "node:test";
import assert from "node:assert/strict";
import { indexedDB } from "fake-indexeddb";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  loadOperationsWorkspace,
  saveOperationsWorkspace,
  emptyOperationsState,
} from "../src/services/operationsWorkspaceStore";
import {
  createMockOperationsState,
  MOCK_REFERENCE_DATE,
} from "../src/data/inventoryOrderMockData";
import {
  buildOperationsAdvisory,
  prepareOperationsAdvice,
} from "../src/services/operationsAdvisoryContract";
import { generateOperationsAIAdvisory } from "../src/services/operationsAiAdvisorService";
import {
  verifyGeminiApiKeyLive,
  saveVerifiedApiKey,
  getActiveUserApiKey,
  clearUserApiKey,
} from "../src/services/apiKeyManager";
import Workspace from "../src/components/operations/REAOperationsWorkspace";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
Object.assign(globalThis, {
  indexedDB,
  window: dom.window,
  document: dom.window.document,
  Event: dom.window.Event,
  FormData: dom.window.FormData,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
dom.window.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
const input = () => ({
  state: createMockOperationsState(),
  referenceDate: MOCK_REFERENCE_DATE,
  lookbackDays: 30,
  targetCoverDays: 30,
  budgetVnd: 45000000,
});
const key = "AIza" + "x".repeat(35);
async function unlock() {
  const mock = async () =>
    new Response(JSON.stringify({ models: [{ name: "models/test" }] }));
  globalThis.fetch = mock as typeof fetch;
  window.fetch = mock as typeof fetch;
  assert.equal((await verifyGeminiApiKeyLive(key)).valid, true);
  saveVerifiedApiKey(key);
}
test("Workspace persists complete state; concurrent revision cannot overwrite; separate scopes and invalid snapshots", async () => {
  const start = await loadOperationsWorkspace("test-live");
  assert.deepEqual(start.state, emptyOperationsState());
  const state = createMockOperationsState();
  const results = await Promise.allSettled([
    saveOperationsWorkspace("test-live", 0, state),
    saveOperationsWorkspace("test-live", 0, state),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await loadOperationsWorkspace("test-live")).revision, 1);
  assert.deepEqual((await loadOperationsWorkspace("test-live")).state, state);
  assert.equal((await loadOperationsWorkspace("other")).state.orders.length, 0);
  const bad = structuredClone(state);
  bad.inventory[0].availableQty = -1;
  await assert.rejects(() => saveOperationsWorkspace("test-live", 1, bad));
  assert.equal((await loadOperationsWorkspace("test-live")).revision, 1);
});
test("Rule advisory uses actual dead-stock derivations, preserves zero budget and avoids false compliance/confidence", () => {
  const request = input();
  request.budgetVnd = 0;
  const p = prepareOperationsAdvice(request);
  const result = buildOperationsAdvisory(request);
  assert.equal(result.sourceMode, "DETERMINISTIC_FALLBACK");
  assert.equal(result.confidenceScore, null);
  assert.ok(
    result.taxAndInvoiceComplianceWarnings.some((w) => w.includes("MẪU")),
  );
  assert.deepEqual(
    result.deadStockLiquidationStrategies.map((i) => i.sku),
    p.dead.map((i) => i.sku),
  );
  assert.equal(p.allocation.totalAllocatedCost, 0);
  assert.ok(!JSON.stringify(result).includes("100%"));
  assert.throws(() => buildOperationsAdvisory({ ...request, budgetVnd: -1 }));
});
test("AI structured response rejects invented SKU and cannot supply authoritative money/confidence", () => {
  const request = input();
  assert.throws(() =>
    buildOperationsAdvisory(request, {
      executiveSummary: "Advice",
      allocation: [{ sku: "FAKE", advice: "invented" }],
      liquidation: [],
    }),
  );
  assert.throws(() =>
    buildOperationsAdvisory(request, {
      executiveSummary: "Advice",
      allocation: [],
      liquidation: [],
      confidenceScore: 99,
    } as any),
  );
  const result = buildOperationsAdvisory(request, {
    executiveSummary: "Cần rà soát",
    allocation: [],
    liquidation: [],
  });
  assert.equal(result.sourceMode, "GEMINI_BYOK_LIVE");
  assert.equal(result.confidenceScore, null);
  assert.deepEqual(
    result.taxAndInvoiceComplianceWarnings,
    buildOperationsAdvisory(request).taxAndInvoiceComplianceWarnings,
  );
});
test("Advisor requires verified key, never silently falls back, and provider rejection invalidates key", async () => {
  clearUserApiKey();
  await assert.rejects(
    () => generateOperationsAIAdvisory(input()),
    /MISSING_USER_API_KEY/,
  );
  await unlock();
  window.fetch = (async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("X-Gemini-Api-Key"), key);
    return new Response(
      JSON.stringify({ error: "quota", code: "GEMINI_QUOTA_EXCEEDED" }),
      { status: 429 },
    );
  }) as typeof fetch;
  await assert.rejects(() => generateOperationsAIAdvisory(input()), /quota/);
  assert.equal(getActiveUserApiKey(), key);
  window.fetch = (async () =>
    new Response(
      JSON.stringify({ error: "denied", code: "GEMINI_AUTH_INVALID" }),
      { status: 401 },
    )) as typeof fetch;
  await assert.rejects(() => generateOperationsAIAdvisory(input()), /denied/);
  assert.throws(() => getActiveUserApiKey());
});
test("Workspace mounts empty, sample is explicit and separate; all four tabs render calculations", async () => {
  await unlock();
  const root = createRoot(document.getElementById("root")!);
  const pause = () => new Promise((r) => setTimeout(r, 40));
  await act(async () => {
    root.render(React.createElement(Workspace, { userId: "ui-test" }));
    await pause();
  });
  await act(pause);
  assert.match(document.body.textContent!, /Chưa có đơn/);
  const click = async (text: string) => {
    const b = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
    assert.ok(b, text);
    await act(async () => {
      b.click();
      await pause();
    });
    await act(pause);
  };
  await click("Mở không gian dữ liệu mẫu");
  await click("Nạp bộ mẫu 10 SKU / 12 đơn");
  assert.match(document.body.textContent!, /DỮ LIỆU MẪU/);
  await click("Tồn kho & nhật ký");
  assert.match(document.body.textContent!, /Nhật ký biến động/);
  await click("Bán chạy & ABC");
  assert.match(document.body.textContent!, /80% \/ 95%/);
  await click("Nhập hàng & tư vấn");
  await click("Xem tư vấn quy tắc");
  assert.match(document.body.textContent!, /không phải kết quả AI/);
  await click("Về dữ liệu thực");
  await click("Đơn hàng & hóa đơn");
  assert.match(document.body.textContent!, /Chưa có đơn/);
  await click("+ Thêm SKU");
  const submit = async (values: Record<string, string>) => {
    const form = document.querySelector("dialog form")!;
    for (const [name, value] of Object.entries(values))
      (form.querySelector(`[name="${name}"]`) as HTMLInputElement).value =
        value;
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event("submit", { bubbles: true, cancelable: true }),
      );
      await pause();
    });
    await act(pause);
  };
  await submit({
    sku: "LIVE-SKU",
    name: "Live test item",
    category: "Test",
    unit: "Cái",
    price: "100",
    lead: "2",
    safety: "0",
  });
  await click("Tồn kho & nhật ký");
  assert.match(document.body.textContent!, /LIVE-SKU/);
  await click("Nhận hàng vào kho");
  await submit({ qty: "5", cost: "60", reference: "PO-TEST" });
  await click("+ Tạo đơn");
  await submit({ customer: "Test buyer", qty: "2" });
  await click("Đơn hàng & hóa đơn");
  assert.match(document.body.textContent!, /Test buyer/);
  const status = document.querySelector(
    'select[aria-label^="Giao vận"]',
  ) as HTMLSelectElement;
  await act(async () => {
    status.value = "DELIVERED";
    status.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    await pause();
  });
  await act(pause);
  await click("Ghi nhận thu / hoàn");
  await submit({ paid: "100", note: "BANK-TEST" });
  assert.match(document.body.textContent!, /Còn 100/);
  await click("Tải lại dữ liệu");
  assert.match(document.body.textContent!, /Còn 100/);
  await click("Tồn kho & nhật ký");
  assert.match(document.body.textContent!, /3 \/ 0 \/ 3/);
  await act(async () => root.unmount());
  clearUserApiKey();
});
