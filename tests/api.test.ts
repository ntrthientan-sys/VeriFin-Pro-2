import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('HTTP: authentication, beneficiary permissions, private exports, zero values and missing sessions', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'verifin-api-'));
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env: { ...process.env, NODE_ENV: 'production', PORT: '3198', DATA_DIR: dataDir, ADMIN_EMAILS: 'admin@example.test', ADMIN_PASSWORD: 'TestPassword123!', GEMINI_API_KEY: '', FIREBASE_PROJECT_ID: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    let response = await request('/api/auth/register', { name: 'Test', email: 'user@example.test', password: 'Secret123' });
    assert.equal(response.status, 201);
    const token = (await response.json()).user.token;
    response = await request('/api/settings/bank-account', { bankBin: '970448', accountNo: '48888', accountName: 'TEST' }, token);
    assert.equal(response.status, 403);
    response = await request('/api/auth/register', { name: 'Spoof', email: 'admin@example.test', password: 'Secret123' });
    assert.equal(response.status, 403);
    response = await request('/api/auth/login', { email: 'admin@example.test', password: 'TestPassword123!' });
    const admin = (await response.json()).user.token;
    response = await request('/api/settings/bank-account', { bankBin: '970448', accountNo: '48888', accountName: 'TEST' }, admin);
    assert.equal(response.status, 200);
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
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /GEMINI_API_KEY/);
    await request('/api/auth/logout', {}, token);
    assert.equal((await (await request('/api/auth/me', undefined, token)).json()).authenticated, false);
    assert.equal((await request('/api/missing')).status, 404);
  } finally {
    child.kill();
    await new Promise<void>(resolve => child.once('exit', () => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
});
