// 生成 preview.png：用 mock 数据截 6 张关键界面，拼成 3×2 数据网格。
// 依赖本地 dev server（提供 ?mock=1 数据）。先跑：
//   npx vite --port 5199
// 再跑：
//   node scripts/make-preview.mjs
// 浏览器复用本机已装的 Playwright Chromium（playwright-core 驱动，不下载浏览器）。
import { chromium } from "playwright-core";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// release/package 在 CI 里也会调用本脚本，但 CI 没有 dev server。检测不到可用 dev server
// 或浏览器时就回退为「原样保留 preview.png」，不阻塞打包。本地想重新生成时，先起 dev server
// (npx vite --port 5199) 再跑本脚本即可产出新预览。

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const shotsDir = resolve(root, ".pi", "preview-frames");
mkdirSync(shotsDir, { recursive: true });

// 优先用系统 Playwright 缓存里的 Chromium；找不到再尝试可执行文件。
const CANDIDATES = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Users/JohnsonRan/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe",
  "C:/Users/JohnsonRan/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe",
];
const executablePath = CANDIDATES.find((p) => existsSync(p));

const DEV = process.env.PREVIEW_URL ?? "http://localhost:5199";

async function devServerUp() {
  try {
    const res = await fetch(DEV + "/?mock=1", { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

// 要展示的界面：桌面亮/暗首页、详情、今日流量、今日连接、移动端首页。
const FRAMES = [
  { key: "home-light", label: "首页 · 亮色", url: `${DEV}/?mock=1`, w: 1440, h: 900, dark: false },
  { key: "home-dark", label: "首页 · 暗色", url: `${DEV}/?mock=1`, w: 1440, h: 900, dark: true },
  { key: "instance", label: "节点详情", url: `${DEV}/instance/frankfurt-db-01?mock=1`, w: 1440, h: 900, dark: true },
  { key: "traffic", label: "今日流量", url: `${DEV}/traffic?mock=1`, w: 1440, h: 900, dark: false },
  { key: "connections", label: "今日连接", url: `${DEV}/connections?mock=1`, w: 1440, h: 900, dark: false },
  { key: "mobile-home", label: "移动端首页", url: `${DEV}/?mock=1`, w: 390, h: 780, dark: false },
];

async function screenshotFrames(browser) {
  const out = [];
  for (const f of FRAMES) {
    const ctx = await browser.newContext({
      viewport: { width: f.w, height: f.h },
      colorScheme: f.dark ? "dark" : "light",
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    try {
      await page.goto(f.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2600);
      const file = resolve(shotsDir, `${f.key}.png`);
      await page.screenshot({ path: file });
      out.push({ ...f, file });
      console.log("frame:", f.key);
    } catch (err) {
      console.error("FAILED frame", f.key, String(err));
    }
    await ctx.close();
  }
  return out;
}

// 用 HTML 模板把 6 张截图排成网格，再整页截一次 —— 不引入图片合成依赖。
function buildGridHtml(frames) {
  const cells = frames
    .map((f) => {
      const img = readFileSync(f.file).toString("base64");
      return `
      <figure class="cell ${f.w < 600 ? "phone" : ""}">
        <div class="shot"><img src="data:image/png;base64,${img}" alt=""/></div>
        <figcaption>${f.label}</figcaption>
      </figure>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    * { box-sizing: border-box; margin: 0; }
    body {
      font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      background: linear-gradient(160deg, #0b0d10 0%, #141a21 55%, #0b0d10 100%);
      padding: 54px 54px 46px;
      width: 1560px;
    }
    header { margin-bottom: 34px; color: #eef2f6; }
    header h1 { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; }
    header p { margin-top: 8px; font-size: 17px; color: #8b95a1; }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 26px;
      align-items: start;
    }
    .cell { display: flex; flex-direction: column; gap: 10px; }
    .shot {
      border-radius: 14px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow: 0 22px 50px -22px rgba(0,0,0,0.75);
      background: #000;
    }
    .shot img { display: block; width: 100%; height: auto; }
    .cell.phone .shot img { height: 452px; object-fit: cover; object-position: top center; }
    figcaption { font-size: 14px; font-weight: 600; color: #aab4c0; padding-left: 2px; }
  </style></head><body>
    <header>
      <h1>Komari-Theme-LuminaLite</h1>
      <p>亮 / 暗双主题 · 四种节点视图 · 详情分栏图表 · 流量 / 连接统计 · 移动端适配</p>
    </header>
    <div class="grid">${cells}</div>
  </body></html>`;
}

async function main() {
  const outPath = resolve(root, "preview.png");

  if (!executablePath || !(await devServerUp())) {
    // CI / 无 dev server：保留现有 preview.png，什么也不做。
    if (!existsSync(outPath)) {
      throw new Error("preview.png 不存在且无法自动生成（缺少 dev server 或浏览器）。");
    }
    console.log(
      !executablePath
        ? "未找到 Playwright Chromium，保留现有 preview.png。"
        : `未检测到 dev server (${DEV})，保留现有 preview.png。`,
    );
    return;
  }

  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });
  try {
    const frames = await screenshotFrames(browser);
    if (frames.length === 0) {
      throw new Error("No frames captured — is the dev server running at " + DEV + "?");
    }
    const html = buildGridHtml(frames);
    const htmlPath = resolve(shotsDir, "_grid.html");
    writeFileSync(htmlPath, html);

    const ctx = await browser.newContext({
      viewport: { width: 1560, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto("file:///" + htmlPath.replace(/\\/g, "/"), { waitUntil: "load" });
    await page.waitForTimeout(600);
    // 按内容实际高度截图，避免固定 viewport 留下底部大段空白。
    const contentHeight = await page.evaluate(() => document.body.scrollHeight);
    await page.setViewportSize({ width: 1560, height: Math.ceil(contentHeight) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: outPath });
    await ctx.close();
    console.log("Wrote", outPath);
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
