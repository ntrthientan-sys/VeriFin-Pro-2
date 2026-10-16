import { test } from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { AuthProvider, useAuth } from "../src/components/auth/AuthProvider";
import { AuthGate } from "../src/components/auth/AuthGate";
import { ApiKeyGate } from "../src/components/auth/ApiKeyGate";
import {
  API_KEY_STORAGE_NAME,
  clearUserApiKey,
} from "../src/services/apiKeyManager";
const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  Event: dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT: true,
});
const key = "AIza" + "n".repeat(35);
const user = {
  id: "account-1",
  name: "Test",
  email: "ntrthientan@gmail.com",
  isAdmin: true,
  authProvider: "firebase" as const,
  branch: "office" as const,
  roleTitle: "Test",
  token: "server-token",
};
let control: ReturnType<typeof useAuth>;
function Controls() {
  control = useAuth();
  return null;
}
const pause = () => new Promise((r) => setTimeout(r, 20));
async function mount() {
  const root = createRoot(document.getElementById("root")!);
  await act(async () => {
    root.render(
      React.createElement(
        AuthProvider,
        null,
        React.createElement(Controls),
        React.createElement(
          AuthGate,
          null,
          React.createElement(
            ApiKeyGate,
            null,
            React.createElement("p", null, "WORKSPACE-SECRET"),
          ),
        ),
      ),
    );
    await pause();
  });
  await act(pause);
  return root;
}
function reset() {
  clearUserApiKey();
  localStorage.clear();
  window.sessionStorage.clear();
}
function mockAccount(authenticated = true) {
  const calls: string[] = [];
  window.fetch = (async (url) => {
    calls.push(String(url));
    return new Response(
      JSON.stringify({ authenticated, user: authenticated ? user : null }),
    );
  }) as typeof fetch;
  globalThis.fetch = (async (url) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ models: [{ name: "models/test" }] }));
  }) as typeof fetch;
  return calls;
}
test("No account: login/register precedes BYOK; a cached key/profile cannot mount workspace or call Google", async () => {
  reset();
  localStorage.setItem(API_KEY_STORAGE_NAME, btoa(key));
  localStorage.setItem("applet_auth_user", JSON.stringify(user));
  const calls = mockAccount();
  const root = await mount();
  assert.match(document.body.textContent!, /Đăng nhập tài khoản VeriFin/);
  assert.ok(!document.body.textContent!.includes("Gemini API key cá nhân"));
  assert.ok(!document.body.textContent!.includes("WORKSPACE-SECRET"));
  assert.equal(calls.length, 0);
  await act(async () => root.unmount());
});
test("Persisted session requires server validation before any saved-key verification; logout unmounts both gates", async () => {
  reset();
  localStorage.setItem("applet_auth_token", user.token);
  localStorage.setItem("verifin:apikey-owner:v1", user.id);
  localStorage.setItem(API_KEY_STORAGE_NAME, btoa(key));
  const calls = mockAccount();
  const root = await mount();
  assert.equal(calls[0], "/api/auth/me");
  assert.ok(calls[1].includes("/models?pageSize=5"));
  assert.match(document.body.textContent!, /WORKSPACE-SECRET/);
  await act(async () => {
    await control.signOut();
  });
  assert.ok(!document.body.textContent!.includes("WORKSPACE-SECRET"));
  assert.ok(!document.body.textContent!.includes("Gemini API key cá nhân"));
  assert.equal(localStorage.getItem("applet_auth_token"), null);
  assert.equal(localStorage.getItem(API_KEY_STORAGE_NAME), null);
  await act(async () => root.unmount());
});
test("Rejected/expired account remains locked even with saved key; successful sign-in reaches only BYOK next", async () => {
  reset();
  localStorage.setItem("applet_auth_token", "forged");
  localStorage.setItem(API_KEY_STORAGE_NAME, btoa(key));
  const calls = mockAccount(false);
  const root = await mount();
  assert.equal(calls.length, 1);
  assert.ok(!document.body.textContent!.includes("WORKSPACE-SECRET"));
  mockAccount(true);
  await act(async () => {
    await control.signIn(user);
  });
  assert.match(document.body.textContent!, /Gemini API key cá nhân/);
  assert.ok(!document.body.textContent!.includes("WORKSPACE-SECRET"));
  await act(async () => root.unmount());
});
test("Focus revalidation locks expired account and ignores stale sign-in after logout", async () => {
  reset();
  localStorage.setItem("applet_auth_token", user.token);
  localStorage.setItem("verifin:apikey-owner:v1", user.id);
  localStorage.setItem(API_KEY_STORAGE_NAME, btoa(key));
  mockAccount();
  const root = await mount();
  mockAccount(false);
  await act(async () => {
    window.dispatchEvent(new dom.window.Event("focus"));
    await pause();
  });
  assert.ok(!document.body.textContent!.includes("WORKSPACE-SECRET"));
  let finish!: (r: Response) => void;
  window.fetch = ((url) =>
    String(url) === "/api/auth/me"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(new Response("{}"))) as typeof fetch;
  let pending: Promise<void>;
  await act(async () => {
    pending = control.signIn(user);
  });
  const rejected = assert.rejects(pending!, /hủy/);
  await act(async () => {
    await control.signOut();
    finish(new Response(JSON.stringify({ authenticated: true, user })));
    await rejected;
  });
  assert.ok(!document.body.textContent!.includes("WORKSPACE-SECRET"));
  assert.equal(localStorage.getItem("applet_auth_token"), null);
  await act(async () => root.unmount());
});

test("Internal admin or another Firebase user never reaches BYOK", async () => {
  for (const profile of [{...user,authProvider:'internal'},{...user,email:'other@example.test'}]) {
    reset(); localStorage.setItem('applet_auth_token',user.token);
    const calls=mockAccount();
    window.fetch = (async () => new Response(JSON.stringify({authenticated:true,user:profile}))) as typeof fetch;
    const root=await mount();
    assert.match(document.body.textContent!,/Chỉ tài khoản Firebase Admin/);
    assert.ok(!document.body.textContent!.includes('Gemini API key cá nhân'));
    assert.equal(calls.length,0);
    await act(async()=>root.unmount());
  }
});
