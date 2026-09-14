import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const register = readFileSync(new URL('../dist/registerSW.js', import.meta.url), 'utf8');
const retire = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8');
let upgraded = false;
const oldRegister = "navigator.serviceWorker.register('/sw.js', {scope:'/'});";
// Minimal reproduction of Komari's legacy Workbox HTML navigation fallback.
// Fixture server follows Komari's theme-first static assets / default admin HTML.
const oldWorker = `
self.addEventListener('install', e => e.waitUntil((async () => {
 const cache = await caches.open('workbox-precache-v2-' + self.registration.scope);
 await cache.put(new URL('/index.html', self.location).href, new Response('<h1>STALE HOME</h1>', {headers:{'Content-Type':'text/html'}}));
 await self.skipWaiting();
})()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
 const p = new URL(e.request.url).pathname;
 if(e.request.mode === 'navigate' && (p === '/' || p.startsWith('/admin')))
  e.respondWith(caches.match(new URL('/index.html', self.location).href));
});`;
const server = createServer((req, res) => {
 const path = new URL(req.url, 'http://localhost').pathname;
 res.setHeader('Cache-Control', 'no-store');
 if(path === '/sw.js' || path === '/registerSW.js') {
  res.setHeader('Content-Type', 'text/javascript');
  return res.end(path === '/sw.js' ? upgraded ? retire : oldWorker : upgraded ? register : oldRegister);
 }
 res.setHeader('Content-Type', 'text/html');
 const admin = path.startsWith('/admin');
 res.end(`<h1>${admin ? 'ADMIN' : 'THEME'}</h1><script src="/registerSW.js${admin ? '' : '?luminalite-pwa=off'}"></script>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
 browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chromium'),
  headless: true,
 });
 const context = await browser.newContext();
 const errors = [];
 context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
 const page = await context.newPage();
 await page.goto(base + '/admin');
 await page.waitForFunction(() => !!navigator.serviceWorker.controller);
 await page.evaluate(async () => {
  await caches.open('unrelated');
  await caches.open('workbox-precache-v2-' + location.origin + '/other/');
  localStorage.setItem('appearance', 'dark');
 });
 await page.goto(base + '/admin/dashboard');
 assert.equal(await page.locator('h1').textContent(), 'STALE HOME');
 console.log('Reproduced: root worker returns cached home on /admin/dashboard.');
 const heldTab = page;
 upgraded = true;
 // Default Workbox allowlist does not intercept /stats; theme bootstrap can run.
 const recovery = await context.newPage();
 await recovery.goto(base + '/stats');
 await recovery.waitForFunction(() => navigator.serviceWorker.controller?.scriptURL.endsWith('?luminalite-pwa=off') && navigator.serviceWorker.controller.state === 'activated');
 assert.equal(await recovery.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
 assert.match(await heldTab.evaluate(() => navigator.serviceWorker.controller.scriptURL), /luminalite-pwa=off/);
 assert.equal(await heldTab.locator('h1').textContent(), 'STALE HOME');
 assert.deepEqual((await recovery.evaluate(() => caches.keys())).sort(), ['unrelated', `workbox-precache-v2-${base}/other/`].sort());
 assert.equal(await recovery.evaluate(() => localStorage.getItem('appearance')), 'dark');
 console.log('Upgrade: old tabs released without reload; own cache removed; settings/other caches retained.');
 for(let i = 0; i < 3; i++) {
  for(const [path, text] of [['/admin/dashboard','ADMIN'], ['/','THEME']]) {
   await heldTab.goto(base + path);
   assert.equal(await heldTab.locator('h1').textContent(), text);
   assert.equal(await heldTab.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  }
 }
 console.log('Repeated 3 admin/home round trips: correct HTML, no PWA re-registration.');
 const clean = await browser.newContext();
 clean.on('page', p => p.on('pageerror', e => errors.push(e.message)));
 const cleanPage = await clean.newPage();
 await cleanPage.goto(base + '/admin');
 assert.equal(await cleanPage.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
 await clean.close();
 // Browser's own update path works even when cached HTML lacks new bootstrap.
 upgraded = false;
 const oldContext = await browser.newContext();
 oldContext.on('page', p => p.on('pageerror', e => errors.push(e.message)));
 const oldPage = await oldContext.newPage();
 await oldPage.goto(base + '/admin');
 await oldPage.waitForFunction(() => !!navigator.serviceWorker.controller);
 upgraded = true;
 await oldPage.evaluate(async () => {
  const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
  const r = await navigator.serviceWorker.getRegistration('/');
  await r.update();
  await changed;
 });
 await oldPage.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated');
 assert.equal(await oldPage.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
 await oldPage.goto(base + '/admin');
 assert.equal(await oldPage.locator('h1').textContent(), 'ADMIN');
 console.log('Bare /sw.js update also retires fully cached clients. Fresh admin visitor stays unregistered.');
 assert.deepEqual(errors, []);
 console.log('Browser page errors: 0. PASS');
} finally {
 await browser?.close();
 await new Promise(resolve => server.close(resolve));
}
