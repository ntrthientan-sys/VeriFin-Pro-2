import { createMockOperationsState } from '../src/data/inventoryOrderMockData';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('HTTP: authentication, beneficiary permissions, private exports, zero values and missing sessions', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'verifin-api-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, NODE_ENV: 'production', PORT: '3198', DATA_DIR: dataDir, ADMIN_EMAILS: 'admin@example.test', ADMIN_PASSWORD: 'Test123', FIREBASE_PROJECT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', d => logs += d);
  child.stderr.on('data', d => logs += d);
  try {
    for (let i = 0; i < 100 && !logs.includes('listening on port'); i++) await new Promise(r => setTimeout(r, 100));
    assert.match(logs, /listening on port/, logs);
    let cookie = '';
    async function request(path: string, body?: any, token?: string) {
      const response = await fetch('http://127.0.0.1:3198' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
      cookie = response.headers.get('set-cookie')?.split(';')[0] || cookie;
      return response;
    }
    const opOrder=createMockOperationsState().orders.find(o=>o.fulfillmentStatus==='DELIVERED'&&o.paidAmount<o.grandTotalAmount)!;
    assert.equal((await request('/api/operations/qr',opOrder)).status,400);
    assert.equal((await request('/api/operations/advisory',{})).status,401);
    let response = await request('/api/auth/register', { name: 'Test', email: 'user@example.test', password: 'Secret123' });
    assert.equal(response.status, 201);
    const regular=await response.json();assert.equal(regular.user.role,'user');assert.equal(regular.firebaseSync,'PENDING');const token=regular.user.token;
    response = await request('/api/settings/bank-account', { bankBin: '970448', accountNo: '48888', accountName: 'TEST' }, token);
    assert.equal(response.status, 403);
    response = await request('/api/auth/register', { name: 'Spoof', email: 'admin@example.test', password: 'Secret123' });
    assert.equal(response.status, 403);
    response = await request('/api/auth/login', { email: ' ADMIN@Example.Test ', password: 'Test123' });
    const adminBody=await response.json();
    assert.equal(adminBody.user.role,'admin');
    assert.equal(adminBody.user.isAdmin,true);
    assert.equal(adminBody.firebaseSync,'PENDING');
    const admin=adminBody.user.token;
    const me=await request('/api/auth/me',undefined,admin);
    assert.equal((await me.json()).user.role,'admin');
    assert.equal((await request('/api/auth/register',{name:'Spoof',email:' NTRTHIENTAN@GMAIL.COM ',password:'abcdefg',role:'admin'})).status,403);
    assert.equal((await request('/api/auth/login',{email:'admin@example.test',password:'wrong'})).status,401);
    response = await request('/api/settings/bank-account', { bankBin: '970448', accountNo: '48888', accountName: 'TEST' }, admin);
    assert.equal(response.status, 200);
    const orderQr=await request('/api/operations/qr',opOrder);
    assert.equal(orderQr.status,200);
    const qrData=await orderQr.json();
    assert.equal(qrData.bankConfig.accountNo,'48888');
    assert.equal(qrData.amountToCollect,opOrder.grandTotalAmount-opOrder.paidAmount);
    assert.match(qrData.qrImageUrl,/^data:image\/png;base64,/);
    assert.equal((await request('/api/operations/qr',{...opOrder,accountNo:'ATTACKER'})).status,400);
    assert.equal((await request('/api/operations/qr',{...opOrder,paidAmount:opOrder.grandTotalAmount,paymentStatus:'PAID'})).status,400);
    response = await request('/api/debt/pdf?kh_id=KH1&name=Test&total=100&remain=100');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /pdf/);
    response = await request('/api/debt/process', { use_sample: 'true', use_sample_bank: 'true' });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal((await request(result.download_url)).status, 200);
    assert.equal((await fetch('http://127.0.0.1:3198' + result.download_url)).status, 404);
    response = await request('/api/reconcile/run', { session_id: 'missing' });
    assert.equal(response.status, 404);
    response = await request('/api/office/cashflow-forecast', { initial_cash: 0, safety_threshold: 0, weekly_data: [{ week: '1', in_sales: 100, out_cogs: 40 }] });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ending_cash, 60);
    response = await request('/api/ai/extract-batch', { raw_text: 'test' });
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /MISSING_USER_API_KEY/);
    assert.equal((await request('/api/bank/credit-proposal', {})).status, 401);
    const validTerms = {loan_amount:750000000,tenure_months:75,new_rate_year:0,old_rate_year:0,prepay_penalty_pct:0,declared_monthly_debt_service:10000000};
    const directProposal = (body: object) => fetch('http://127.0.0.1:3198/api/bank/credit-proposal', {method:'POST',headers:{'Content-Type':'application/json','X-Gemini-Api-Key':'AIza'+'z'.repeat(35)},body:JSON.stringify(body)});
    response = await directProposal(validTerms);
    assert.equal(response.status,422);
    assert.equal((await response.json()).code,'EVIDENCE_GATE_BLOCKED');
    response = await directProposal({...validTerms,evidence:{schemaVersion:'2.0.0',observations:{cic:[],bctc:[],saoKe:[],collateral:[]},derivations:{},inferences:[],unknowns:[]},monthly_net_income:999999999,collateral_value:999999999999});
    assert.equal(response.status,422); // Spoofed legacy income/collateral cannot bypass recomputation.
    response = await directProposal({...validTerms,loan_amount:undefined});assert.equal(response.status,400);
    await request('/api/auth/logout', {}, token);
    assert.equal((await (await request('/api/auth/me', undefined, token)).json()).authenticated, false);
    assert.equal((await request('/api/missing')).status, 404);
  } finally {
    child.kill();
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
