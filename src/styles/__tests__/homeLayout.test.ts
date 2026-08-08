import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const homeCss = readFileSync(new URL("../home.css", import.meta.url), "utf8");
const surfaceCss = readFileSync(new URL("../surface.css", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../../pages/Home.tsx", import.meta.url), "utf8");
const controlsSource = readFileSync(
  new URL("../../components/shell/FloatingControls.tsx", import.meta.url),
  "utf8",
);
const miniSource = readFileSync(
  new URL("../../components/node/MiniNodeCard.tsx", import.meta.url),
  "utf8",
);
const nodeGridSource = readFileSync(
  new URL("../../components/node/NodeGrid.tsx", import.meta.url),
  "utf8",
);
const appShellSource = readFileSync(
  new URL("../../components/shell/AppShell.tsx", import.meta.url),
  "utf8",
);
const routerSource = readFileSync(new URL("../../router.tsx", import.meta.url), "utf8");

describe("home responsive layout contracts", () => {
  it("uses an explicit expanded state through tablet widths without :has()", () => {
    expect(homeCss).not.toContain(":has(");
    expect(homeCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*\.home-dashboard\.is-controls-expanded \.home-brand/);
    expect(homeSource).toContain("onExpandedChange={setControlsExpanded}");
  });

  it("keeps both horizontal edges inside viewport safe areas", () => {
    expect(surfaceCss).toContain("env(safe-area-inset-left, 0px)");
    expect(surfaceCss).toContain("env(safe-area-inset-right, 0px)");
    expect(surfaceCss).toMatch(/padding-left:\s*max\(var\(--app-gutter\)/);
    expect(surfaceCss).toMatch(/padding-right:\s*max\(var\(--app-gutter\)/);
  });

  it("enforces the mini card width floor before adding another fixed column", () => {
    expect(homeCss).toContain("minmax(var(--mini-card-min-width, 260px), 1fr)");
    for (const breakpoint of [1440, 1150, 860, 580]) {
      expect(homeCss).toContain(`@media (max-width: ${breakpoint}px)`);
    }
  });

  it("keeps theme settings out of floating controls and home-only routing out of controls", () => {
    // 主题设置已迁至官方 /admin/theme_managed，悬浮球不再内嵌取色器、theme-manage 入口或路由钩子。
    expect(controlsSource).not.toContain("MetricColorPicker");
    expect(controlsSource).not.toContain("theme-manage");
    expect(controlsSource).not.toContain("Palette");
    expect(controlsSource).not.toContain("useLocation");
    expect(controlsSource).not.toContain("useSearchParams");
    expect(controlsSource).not.toContain("usePublicConfig");
    expect(homeSource).not.toContain("theme-manage");
    expect(homeSource).not.toContain("ThemeManage");
  });

  it("keeps mini cards observer-free and URL-encodes their detail route", () => {
    expect(miniSource).not.toMatch(
      /from\s+["']\.\/(?:MetricBar|LatencyBars|QualityBars|CanvasStrip)["']/,
    );
    expect(miniSource).not.toContain("<canvas");
    expect(miniSource).toContain("encodeURIComponent(node.uuid)");
  });

  it("keeps resource values in a stable template and horizontally scrollable on phones", () => {
    expect(nodeGridSource).toContain("<HomeResourceStrip resources={resources} />");
    expect(nodeGridSource).toContain('label="1 分钟负载"');
    expect(nodeGridSource).toContain('className="home-resource-current"');
    expect(nodeGridSource).toContain('className="home-resource-total"');
    expect(nodeGridSource).toContain('className="home-resource-unit"');
    expect(nodeGridSource).not.toContain("home-resource-strip-count");
    expect(nodeGridSource).not.toContain("home-resource-strip-title");
    expect(homeCss).toMatch(/\.home-resource-percent\s*\{[\s\S]*width:\s*5ch/);
    expect(homeCss).toMatch(
      /\.home-resource-value\s*\{[\s\S]*grid-template-columns:\s*5ch repeat\(3, max-content\)/,
    );
    expect(homeCss).toMatch(/\.home-resource-value\s*\{[\s\S]*column-gap:\s*0\.28em/);
    expect(homeCss).toMatch(
      /\.home-resource-item\s*\{[\s\S]*grid-template-areas:[\s\S]*"label value percent"/,
    );
    expect(homeCss).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*\.home-resource-item\s*\{[\s\S]*display:\s*block/,
    );
    expect(homeCss).toMatch(
      /@media \(max-width: 560px\)[\s\S]*\.home-resource-grid[\s\S]*overflow-x:\s*auto/,
    );
  });

  it("does not render zero-value overview cards before the node store is hydrated", () => {
    expect(nodeGridSource).toContain("hydrated: storeHydrated");
    expect(nodeGridSource).toContain("!themeSettings.isReady || !storeHydrated");
    expect(nodeGridSource.indexOf("!themeSettings.isReady || !storeHydrated")).toBeLessThan(
      nodeGridSource.indexOf("const homeHeader"),
    );
    const loadingBranch = nodeGridSource.slice(
      nodeGridSource.indexOf("!themeSettings.isReady || !storeHydrated"),
      nodeGridSource.indexOf("const homeHeader"),
    );
    expect(loadingBranch).not.toContain("<HomeBrand");
    expect(loadingBranch).not.toContain("<Spinner");
    expect(homeSource).toContain("const homeReady = themeSettings.isReady && storeHydrated");
    expect(homeSource).toContain("{homeReady && <FloatingControls");
  });

  it("keeps access and initial home hydration behind one shell-owned spinner", () => {
    expect(appShellSource).toContain("useNodeStoreStatus(canHydrateHome)");
    expect(appShellSource).toContain("isCheckingAccess || isCheckingHomeData");
    expect(appShellSource).toContain("isCheckingShell ?");
    expect(routerSource).toContain('import { Home } from "@/pages/Home"');
    expect(routerSource).not.toMatch(/const Home\s*=\s*lazy/);
    expect(routerSource).toContain("element: <Home />");
  });
});
