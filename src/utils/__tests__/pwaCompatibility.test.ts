import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const bootstrap = readFileSync("public/registerSW.js", "utf8");
const worker = readFileSync("public/sw.js", "utf8");
const origin = "https://monitor.example";

async function runBootstrap(registration?: object, failure = false) {
  const getRegistration = failure
    ? vi.fn().mockRejectedValue(new Error("storage denied"))
    : vi.fn().mockResolvedValue(registration);
  const register = vi.fn().mockResolvedValue({});
  const warn = vi.fn();
  runInNewContext(bootstrap, {
    navigator: { serviceWorker: { getRegistration, register } },
    location: { href: `${origin}/instance/node` },
    URL,
    console: { warn },
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { getRegistration, register, warn };
}

describe("legacy Komari PWA compatibility", () => {
  it("runs outside app chunks with a URL not in the old precache", () => {
    const html = readFileSync("index.html", "utf8");
    expect(html).toContain('<script src="/registerSW.js?luminalite-pwa=off"></script>');
    expect(html.indexOf("/registerSW.js?")).toBeLessThan(html.indexOf("/src/main.tsx"));
  });

  it("does not create a PWA for clean visitors or unsupported browsers", async () => {
    expect((await runBootstrap()).register).not.toHaveBeenCalled();
    expect(() => runInNewContext(bootstrap, { navigator: {} })).not.toThrow();
  });

  it.each(["active", "waiting", "installing"])("replaces the %s root worker without using cached script URLs", async (state) => {
    const { getRegistration, register } = await runBootstrap({
      scope: `${origin}/`,
      [state]: { scriptURL: `${origin}/sw.js` },
    });
    expect(getRegistration).toHaveBeenCalledWith("/");
    expect(register).toHaveBeenCalledWith("/sw.js?luminalite-pwa=off", {
      scope: "/",
      updateViaCache: "none",
    });
  });

  it("leaves other workers alone and handles storage errors", async () => {
    for (const registration of [
      { scope: `${origin}/other/`, active: { scriptURL: `${origin}/sw.js` } },
      { scope: `${origin}/`, active: { scriptURL: `${origin}/other-worker.js` } },
    ]) {
      expect((await runBootstrap(registration)).register).not.toHaveBeenCalled();
    }
    expect((await runBootstrap(undefined, true)).warn).toHaveBeenCalledOnce();
  });

  it.each([false, true])("retires the worker without fetching/reloading, even if cache deletion fails (%s)", async (failure) => {
    const events: Record<string, (event: { waitUntil: (task: Promise<unknown>) => void }) => void> = {};
    const skipWaiting = vi.fn().mockResolvedValue(undefined);
    const claim = vi.fn().mockResolvedValue(undefined);
    const unregister = vi.fn().mockResolvedValue(true);
    const remove = failure
      ? vi.fn().mockRejectedValue(new Error("cache denied"))
      : vi.fn().mockResolvedValue(true);
    const warn = vi.fn();
    const ownCache = `workbox-precache-v2-${origin}/`;
    runInNewContext(worker, {
      self: {
        addEventListener: (name: string, callback: typeof events[string]) => { events[name] = callback; },
        skipWaiting,
        clients: { claim },
        registration: { scope: `${origin}/`, unregister },
      },
      caches: {
        keys: async () => [ownCache, `workbox-precache-v2-${origin}/other/`, "api-cache", "unrelated"],
        delete: remove,
      },
      console: { warn },
    });
    expect(Object.keys(events).sort()).toEqual(["activate", "install"]);
    for (const name of ["install", "activate"]) {
      let task: Promise<unknown> | undefined;
      events[name]({ waitUntil: (promise) => { task = promise; } });
      await task;
    }
    expect(skipWaiting).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledExactlyOnceWith(ownCache);
    expect(claim).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(unregister.mock.invocationCallOrder[0]);
    expect(warn).toHaveBeenCalledTimes(failure ? 1 : 0);
  });
});
