import { createMockOperationsState } from '../src/data/inventoryOrderMockData';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('HTTP: authentication, beneficiary permissions, Firebase-only business API boundary', async () => {
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
    assert.equal((await request('/api/operations/qr',opOrder)).status,401);
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
    // Internal authentication remains available for provisioning, never business access.
    assert.equal((await (await request('/api/auth/me',undefined,admin)).json()).user.authProvider,'internal');
    for (const path of ['/api/settings/bank-account','/api/operations/qr','/api/operations/advisory','/api/bank/credit-proposal','/api/office/cashflow-forecast','/api/reconcile/run']) {
      assert.equal((await request(path,{},admin)).status,403,path);
      assert.equal((await request(path,{},'forged')).status,401,path);
    }
    assert.equal((await request('/api/debt/pdf?kh_id=KH1',undefined,admin)).status,403);
    await request('/api/auth/logout', {}, token);
    assert.equal((await (await request('/api/auth/me', undefined, token)).json()).authenticated, false);
    assert.equal((await request('/api/missing')).status, 401);
  } finally {
    child.kill();
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
