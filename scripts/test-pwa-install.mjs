import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

// Real theme + dev API fixtures. A temporary non-incognito profile is necessary:
// Chromium reports "in-incognito" instead of checking normal installability.
const profile = await mkdtemp(join(tmpdir(), "luminalite-pwa-install-"));
let server;
let context;
let sourceIcon;
let validIcon = true;
const diagnostics = [];
try {
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    plugins: [{
      name: "pwa-test-icon",
      configureServer(vite) {
        // Use real HTTP, not browser request interception, for image decoding.
        vite.middlewares.use((request, response, next) => {
          if (request.url?.split("?")[0] !== "/favicon.ico") return next();
          response.statusCode = validIcon ? 200 : 404;
          response.setHeader("Content-Type", validIcon ? "image/png" : "text/plain");
          response.setHeader("Cache-Control", "no-store");
          response.end(validIcon ? sourceIcon : "Icon missing");
        });
      },
    }],
    server: { host: "127.0.0.1", port: 0 },
    logLevel: "error",
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  context = await chromium.launchPersistentContext(profile, {
    channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === "win32" ? "msedge" : "chromium"),
    headless: false,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => { errors.push(error.message); diagnostics.push(error.message); });
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) diagnostics.push(message.text());
  });
  sourceIcon = Buffer.from((await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 540;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#2288cc";
    ctx.fillRect(0, 0, 1080, 540);
    return canvas.toDataURL("image/png");
  })).split(",")[1], "base64");
  await page.goto(`${origin}/?mock=1&temp_key=not-an-app-identity`);
  await page.waitForFunction(() => {
    const link = document.querySelector('link[rel="manifest"]');
    return link && JSON.parse(decodeURIComponent(link.href.split(",")[1])).name === "Lumina Ops";
  });
  const cdp = await context.newCDPSession(page);
  const result = await cdp.send("Page.getAppManifest");
  assert.deepEqual(result.errors, []);
  const manifest = JSON.parse(result.data);
  assert.equal(manifest.name, "Lumina Ops");
  assert.equal(manifest.description, "全球节点运行状态");
  for (const key of ["id", "start_url", "scope"]) assert.equal(manifest[key], `${origin}/`);
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ["192x192", "512x512"]);
  for (const icon of manifest.icons) {
    const png = Buffer.from(icon.src.split(",")[1], "base64");
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    const center = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = image.naturalWidth;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return Array.from(ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data);
    }, icon.src);
    assert.deepEqual(center, [34, 136, 204, 255]);
  }
  assert.deepEqual((await cdp.send("Page.getInstallabilityErrors")).installabilityErrors, []);
  assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content"), "Lumina Ops");
  assert.equal(await page.locator('link[rel="apple-touch-icon"]').getAttribute("href"), "/favicon.ico");
  console.log("PASS: actual theme is installable without SW; name/description and resized PNG pixels match backend fixtures.");

  await page.evaluate(async () => {
    const { queryClient } = await import("/src/services/queryClient.ts");
    queryClient.setQueryData(["public"], (config) => ({ ...config, sitename: '新名称 "A" & B' }));
  });
  await page.waitForFunction(() => {
    const link = document.querySelector('link[rel="manifest"]');
    return link && JSON.parse(decodeURIComponent(link.href.split(",")[1])).name === '新名称 "A" & B';
  });
  assert.equal(await page.locator('link[rel="manifest"]').count(), 1);
  const renamed = JSON.parse((await cdp.send("Page.getAppManifest")).data);
  assert.equal(renamed.id, manifest.id);
  assert.equal(renamed.name, '新名称 "A" & B');
  console.log("PASS: configuration refresh replaces metadata without duplicating manifests or changing app identity.");

  validIcon = false;
  const warning = page.waitForEvent("console", (message) => message.type() === "warning" && message.text().includes("could not prepare PWA metadata"));
  await page.reload();
  await warning;
  assert.equal(await page.locator('link[rel="manifest"]').count(), 0);
  assert.equal(await page.locator("main").isVisible(), true);
  assert.deepEqual(errors, []);
  console.log("PASS: invalid backend icon disables install metadata without crashing the page. Page errors: 0.");
} catch (error) {
  console.error("Browser diagnostics:", diagnostics.slice(-15));
  throw error;
} finally {
  await context?.close();
  await server?.close();
  await rm(profile, { recursive: true, force: true });
}
