// Temporary design-review screenshot tool. Uses playwright-core + existing ms-playwright browsers.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = 'C:/Users/JohnsonRan/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
const outDir = path.resolve(process.cwd(), 'dist', 'review-shots');
fs.mkdirSync(outDir, { recursive: true });

const MOCK = 'http://localhost:5199';
const targets = [
  { name: 'inst-ping', url: MOCK + '/instance/tokyo-edge-01?mock=1', width: 1600, height: 1000, dark: false, clickPing: true },
  { name: 'inst-scrolled', url: MOCK + '/instance/frankfurt-db-01?mock=1', width: 1600, height: 1000, dark: true, scroll: 900 },
  { name: 'inst-offline', url: MOCK + '/instance/sydney-backup-01?mock=1', width: 1600, height: 1000, dark: false },
  { name: 'inst-mobile-chart', url: MOCK + '/instance/tokyo-edge-01?mock=1', width: 390, height: 844, dark: false, scroll: 1400 },
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
    const file = path.join(outDir, `${t.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log('saved', file);
  } catch (err) {
    console.error('FAILED', t.name, String(err));
  }
  await ctx.close();
}
await browser.close();
