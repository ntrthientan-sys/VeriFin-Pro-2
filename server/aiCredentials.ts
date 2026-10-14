import { AsyncLocalStorage } from 'node:async_hooks';

const credentials = new AsyncLocalStorage<string | undefined>();
export function withApiKey<T>(key: string | undefined, callback: () => T): T {
  return credentials.run(key, callback);
}
export function resolveApiKey(): string | undefined {
  return credentials.getStore() || process.env.GEMINI_API_KEY || undefined;
}
export function parsePersonalApiKey(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(value)) {
    throw new Error('API key không đúng định dạng. Vui lòng nhập lại trong Cấu hình API key.');
  }
  return value;
}
