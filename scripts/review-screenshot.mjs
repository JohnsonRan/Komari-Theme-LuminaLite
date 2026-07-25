// Temporary design-review screenshot tool. Uses playwright-core + existing ms-playwright browsers.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = 'C:/Users/JohnsonRan/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const outDir = path.resolve(process.cwd(), 'dist', 'review-shots');
fs.mkdirSync(outDir, { recursive: true });

const MOCK = 'http://localhost:5199';
const targets = [
  { name: 'today-bandwidth', url: MOCK + '/bandwidth?mock=1', width: 1600, height: 1000, dark: true, expand: true },
  { name: 'today-connections', url: MOCK + '/connections?mock=1', width: 1600, height: 1000, dark: false, expand: true },
  { name: 'today-traffic-check', url: MOCK + '/traffic?mock=1', width: 1600, height: 1000, dark: false, expand: true },
  { name: 'home-overview-links', url: MOCK + '/?mock=1', width: 1600, height: 600, dark: false },
  { name: 'today-conn-mobile', url: MOCK + '/connections?mock=1', width: 390, height: 844, dark: false },
];

const browser = await chromium.launch({ executablePath: base, headless: true });

for (const t of targets) {
  const ctx = await browser.newContext({
    viewport: { width: t.width, height: t.height },
    colorScheme: t.dark ? 'dark' : 'light',
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  try {
    await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    if (t.clickPing) {
      const pingBtn = page.locator('.instance-segmented button', { hasText: 'Ping' }).first();
      if (await pingBtn.count()) { await pingBtn.click(); await page.waitForTimeout(1500); }
    }
    if (t.scroll) { await page.mouse.wheel(0, t.scroll); await page.waitForTimeout(800); }
    if (t.expand) {
      const toggle = page.locator('.traffic-detail-toggle').first();
      if (await toggle.count()) { await toggle.click(); await page.waitForTimeout(1500); }
    }
    const file = path.join(outDir, `${t.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('saved', file);
  } catch (err) {
    console.error('FAILED', t.name, String(err));
  }
  await ctx.close();
}
await browser.close();
