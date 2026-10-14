import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withApiKey, resolveApiKey, parsePersonalApiKey } from '../server/aiCredentials';
import { aiFetch, savePersonalApiKey, getPersonalApiKey, clearPersonalApiKey } from '../src/aiApi';

test('concurrent requests keep personal keys isolated and restore server fallback', async () => {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'server-test-key';
  try {
    const values = await Promise.all(['user-one', 'user-two'].map((key, index) => withApiKey(key, async () => {
      await new Promise(r => setTimeout(r, index ? 5 : 15));
      return resolveApiKey();
    })));
    assert.deepEqual(values, ['user-one', 'user-two']);
    assert.equal(resolveApiKey(), 'server-test-key');
    assert.throws(() => parsePersonalApiKey('bad key\n'));
    assert.equal(parsePersonalApiKey(undefined), undefined);
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});
test('browser keys are account-scoped, removable, and sent only to allowed AI routes', async () => {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const memoryStorage = (values: Map<string, string>) => ({ getItem: (k: string) => values.get(k) || null, setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) });
  const oldFetch = globalThis.fetch;
  const oldLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(local), configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage(session), configurable: true });
  const key = 'test-key-only-1234567890';
  try {
    local.set('applet_auth_user', JSON.stringify({ id: 'one' }));
    savePersonalApiKey(key);
    local.set('applet_auth_user', JSON.stringify({ id: 'two' }));
    assert.equal(getPersonalApiKey(), '');
    local.set('applet_auth_user', JSON.stringify({ id: 'one' }));
    assert.equal(getPersonalApiKey(), key);
    globalThis.fetch = async (path, init) => {
      assert.equal(path, '/api/chat/message');
      assert.equal(new Headers(init?.headers).get('X-Gemini-API-Key'), key);
      return new Response('{}');
    };
    await aiFetch('/api/chat/message', { method: 'POST' });
    assert.throws(() => aiFetch('https://example.com/collect'));
    clearPersonalApiKey();
    assert.equal(getPersonalApiKey(), '');
    assert.equal(local.size, 1); // No key in persistent browser storage.
  } finally {
    globalThis.fetch = oldFetch;
    if (oldLocal) Object.defineProperty(globalThis, 'localStorage', oldLocal); else delete (globalThis as any).localStorage;
    if (oldSession) Object.defineProperty(globalThis, 'sessionStorage', oldSession); else delete (globalThis as any).sessionStorage;
  }
});
