import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { processDebtModule, incomeAssessmentLogic, cashFlowForecastLogic, createDebtPdf } from '../server/excelService';
import { buildVietQrPayload, crc16Ccitt } from '../server/vietQrService';
import { extractBatchAI, extractCicOrBctcAI, extractCollateralAI } from '../server/geminiService';
function workbook(rows: object[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Data');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
test('a KH10 transfer cannot settle KH1 or be counted on every invoice', async () => {
  const debts = workbook([{ ID: 'KH1', Name: 'One', Amount: 100 }, { ID: 'KH10', Name: 'Ten', Amount: 100 }, { ID: 'KH10', Name: 'Ten', Amount: 100 }]);
  const bank = workbook([{ Description: 'KH10 thanh toan', Credit: 150 }]);
  const result = await processDebtModule(debts, bank);
  assert.equal(result.total_remain_amount, 150);
  assert.equal(result.customers.find(c => c.id === 'KH1')?.paid, 0);
});
test('zero income recognition is preserved', async () => {
  const r = await incomeAssessmentLogic({ customerName: 'Test', borrowerAge: 30, dependentsCount: 0, livingCostBorrower: 0, livingCostCoBorrower: 0, livingCostPerDependent: 0, existingMonthlyDebt: 0, incomes: [{ sourceName: 'Test', incomeType: 'salary_cash', declaredAmount: 10000000, haircutPct: 0, proofDocument: '' }] });
  assert.equal(r.total_recognized, 0);
  assert.equal(r.max_loan_capacity, 0);
});
test('cash flow preserves a zero opening balance', async () => {
  const r = await cashFlowForecastLogic({ initialCash: 0, safetyThreshold: 0, weeklyData: [{ week: '1', in_sales: 100, out_cogs: 40 } as any] });
  assert.equal(r.ending_cash, 60);
});
test('QR normalizes Vietnamese and rejects invalid beneficiaries', () => {
  const qr = buildVietQrPayload({ bankBin: '970448', accountNo: '48888', message: 'Đặng thanh toán', amount: 100 });
  assert.match(qr, /Dang thanh toan/);
  assert.equal(qr.slice(-4), crc16Ccitt(qr.slice(0, -4)));
  assert.throws(() => buildVietQrPayload({ bankBin: 'oops', accountNo: '' }));
  assert.throws(() => buildVietQrPayload({ bankBin: '970448', accountNo: '48888', amount: Infinity }));
});
test('PDF cannot silently use a demo payment account', async () => {
  await assert.rejects(createDebtPdf('KH1', 'Test', 100, 0, 100), /cấu hình/);
});
test('AI failure never produces fabricated customer records', async () => {
  await assert.rejects(extractBatchAI('orders', 'Name', 'My order', []), /MISSING_USER_API_KEY/);
  await assert.rejects(extractCicOrBctcAI('cic', 100, []), /MISSING_USER_API_KEY/);
  await assert.rejects(extractCicOrBctcAI('bctc', 100, []), /MISSING_USER_API_KEY/);
  await assert.rejects(extractCollateralAI([], false), /MISSING_USER_API_KEY/);
});
