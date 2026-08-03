import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MOTION_COUNT_FLIP_MAX,
  MOTION_DURATION,
  MOTION_EASE,
} from "@/utils/motion";

const readSource = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tokensCss = readSource("../../styles/tokens.css");
const motionCss = readSource("../../styles/motion.css");
const surfaceCss = readSource("../../styles/surface.css");
const homeCss = readSource("../../styles/home.css");
const compactCardCss = readSource("../../styles/compact-node-card.css");
const nodeCardSource = readSource("../../components/node/NodeCard.tsx");
const appShellSource = readSource("../../components/shell/AppShell.tsx");
const animatedValueSource = readSource("../../components/ui/AnimatedValue.tsx");
const layoutTransitionSource = readSource("../../hooks/useLayoutTransition.ts");
const statusFlashHookSource = readSource("../../hooks/useNodeStatusFlash.ts");

function collectProductionSources(directory: string): string[] {
  const sources: string[] = [];
  for (const name of readdirSync(directory)) {
    if (name === "__tests__") continue;
    const path = `${directory}/${name}`;
    const stats = statSync(path);
    if (stats.isDirectory()) sources.push(...collectProductionSources(path));
    else if (/\.(?:css|ts|tsx)$/.test(name)) sources.push(readFileSync(path, "utf8"));
  }
  return sources;
}

const productionSource = collectProductionSources(
  fileURLToPath(new URL("../..", import.meta.url)),
).join("\n");

describe("motion tokens stay aligned with the JS constants", () => {
  it("declares the same durations in tokens.css", () => {
    for (const [name, value] of Object.entries(MOTION_DURATION)) {
      expect(tokensCss).toContain(`--motion-duration-${name}: ${value}ms;`);
    }
  });

  it("declares the same easing curves in tokens.css", () => {
    for (const [name, value] of Object.entries(MOTION_EASE)) {
      expect(tokensCss).toContain(`--motion-ease-${name}: ${value};`);
    }
  });

  it("declares the FLIP item cap in tokens.css", () => {
    expect(tokensCss).toContain(`--motion-count-flip-max: ${MOTION_COUNT_FLIP_MAX};`);
  });

  it("keeps the status flash keyframes on the shared flash duration", () => {
    expect(tokensCss).toContain("--motion-flash-duration: 600ms;");
    for (const flash of ["online", "offline", "attention"]) {
      expect(motionCss).toContain(
        `motion-flash-${flash} var(--motion-flash-duration)`,
      );
    }
  });

  it("gates every primitive on the icon-animations setting and reduced-motion", () => {
    expect(motionCss).toContain(':root:not([data-icon-animations="false"])');
    expect(motionCss).toContain(':root[data-icon-animations="false"]');
    expect(motionCss).toContain("@media (prefers-reduced-motion: reduce)");
    for (const primitive of [
      ".motion-pressable",
      ".motion-overlay-enter",
      ".content-enter",
      ".route-content-enter",
      ".status-flash-online",
      ".status-flash-offline",
      ".status-flash-attention",
    ]) {
      expect(motionCss).toContain(primitive);
    }
  });

  it("also gates custom tooltips and the floating control expansion", () => {
    for (const selector of [
      ".overview-card-tooltip",
      ".overview-card-tooltip-track::before",
      ".compact-node-health-tooltip",
      ".floating-controls-actions",
      ".instance-chart-tooltip",
    ]) {
      expect(motionCss).toContain(selector);
    }
    expect(motionCss).toMatch(
      /:root\[data-icon-animations="false"\][\s\S]*?\.floating-controls-actions,\s*\.instance-chart-tooltip\s*\{\s*transition: none !important;/,
    );
  });

  it("wires custom tooltip and control transitions to shared tokens", () => {
    expect(homeCss).toContain(
      "overview-tooltip-in var(--motion-duration-fast) var(--motion-ease-enter)",
    );
    expect(homeCss).toContain(
      "overview-tooltip-share-in var(--motion-duration-normal) var(--motion-ease-enter)",
    );
    expect(compactCardCss).toContain(
      "compact-health-tooltip-in var(--motion-duration-fast) var(--motion-ease-enter)",
    );
    expect(nodeCardSource).toContain(
      'className="server-health-tooltip motion-overlay-enter"',
    );
    expect(motionCss).toContain(
      "motion-overlay-in var(--motion-duration-fast) var(--motion-ease-enter)",
    );
    expect(surfaceCss).toContain(
      "opacity var(--motion-duration-instant) var(--motion-ease-standard)",
    );
    expect(surfaceCss).toContain("will-change: transform;");
    expect(surfaceCss).toContain(
      "max-width var(--motion-duration-normal) var(--motion-ease-enter)",
    );
  });

  it("uses the shared pressable gate instead of private control/overview active transforms", () => {
    expect(motionCss).toContain(".control-button:not(:disabled)");
    expect(motionCss).toContain(".overview-card-action");
    expect(motionCss).toContain(".home-sort-trigger");
    expect(surfaceCss).not.toMatch(/\.control-button:active\s*\{/);
    expect(homeCss).not.toMatch(/\.overview-card-action:active\s*\{/);
  });
});

describe("motion ownership and forbidden regressions", () => {
  it("keeps data motion consumption confined to AnimatedValue", () => {
    expect(animatedValueSource).toMatch(
      /const\s*\{\s*dataAnimations\s*\}\s*=\s*useMotionSettings\(\)/,
    );
    expect(statusFlashHookSource).toMatch(
      /const\s*\{\s*iconAnimations\s*\}\s*=\s*useMotionSettings\(\)/,
    );
    expect(statusFlashHookSource).not.toMatch(/\{\s*dataAnimations\s*\}/);
    expect(layoutTransitionSource).toMatch(
      /const\s*\{\s*iconAnimations\s*\}\s*=\s*useMotionSettings\(\)/,
    );

    const directDataConsumers = productionSource.match(
      /\{\s*dataAnimations\s*\}\s*=\s*useMotionSettings\(\)/g,
    );
    expect(directDataConsumers).toHaveLength(1);
  });

  it("keeps the route wrapper keyed only by pathname/search around all non-checking outcomes", () => {
    expect(appShellSource).toContain('key={`${pathname}${search}`}');
    expect(appShellSource).not.toMatch(/key=\{[^}]*isChecking|key=\{[^}]*accessError/);
    const wrapperStart = appShellSource.indexOf('key={`${pathname}${search}`}');
    const wrapperEnd = appShellSource.indexOf("</div>", wrapperStart);
    const wrapper = appShellSource.slice(wrapperStart, wrapperEnd);
    expect(wrapper).toContain("accessError ?");
    expect(wrapper).toContain("isPrivateVisitor ?");
    expect(wrapper).toContain("<Outlet />");
  });

  it("does not introduce chart pulse, theme gradient or View Transition APIs", () => {
    expect(productionSource).not.toMatch(
      /startViewTransition|ViewTransition|view-transition-name|::view-transition|chart[-_ ]pulse|theme[-_ ]gradient/i,
    );
    expect([motionCss, layoutTransitionSource, statusFlashHookSource].join("\n")).not.toMatch(
      /(?:linear|radial)-gradient/i,
    );
  });

  it("never leaves a persistent will-change on FLIP elements", () => {
    expect(layoutTransitionSource).not.toMatch(/willChange|style\.willChange/);
    const cssRules = productionSource.match(/[^{}]+\{[^{}]*\}/g) ?? [];
    const flipWillChangeRules = cssRules.filter(
      (rule) => rule.includes("data-flip-id") && rule.includes("will-change"),
    );
    expect(flipWillChangeRules).toEqual([]);
  });
});

// B2-B4 接线契约:用源码文本断言把「谁该接哪条动效」钉在测试里,防止后续改动悄悄断线。
// 与 styles/__tests__/homeLayout.test.ts 同一风格。
describe("node motion wiring contracts", () => {
  const nodeGridSource = readFileSync(
    new URL("../../components/node/NodeGrid.tsx", import.meta.url),
    "utf8",
  );
  const nodeListSource = readFileSync(
    new URL("../../components/node/NodeListView.tsx", import.meta.url),
    "utf8",
  );
  const cardSources = [
    "../../components/node/NodeCard.tsx",
    "../../components/node/CompactNodeCard.tsx",
    "../../components/node/MiniNodeCard.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

  it("grid and list both wire the FLIP hook with stable data-flip-id", () => {
    expect(nodeGridSource).toContain("useLayoutTransition(gridRef, orderedUuids, mode)");
    expect(nodeGridSource).toContain("data-flip-id={uuid}");
    expect(nodeListSource).toContain("useLayoutTransition(listRef, uuids)");
    expect(nodeListSource).toContain("data-flip-id={uuid}");
  });

  it("every card fades real content in exactly once (content-enter on the article)", () => {
    for (const source of cardSources) {
      expect(source).toContain("content-enter");
    }
    // 列表行是骨架整行替换,也只在真实内容首挂载时淡入。
    expect(nodeListSource).toContain("content-enter");
  });

  it("every view hooks the one-shot status flash", () => {
    for (const source of [...cardSources, nodeListSource]) {
      expect(source).toContain("useNodeStatusFlash(");
    }
  });
});
