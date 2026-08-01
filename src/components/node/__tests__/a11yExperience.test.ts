import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const compactCardSource = readFileSync(
  new URL("../CompactNodeCard.tsx", import.meta.url),
  "utf8",
);
const compactCss = readFileSync(
  new URL("../../../styles/compact-node-card.css", import.meta.url),
  "utf8",
);
const surfaceCss = readFileSync(
  new URL("../../../styles/surface.css", import.meta.url),
  "utf8",
);
const trafficCss = readFileSync(
  new URL("../../../styles/traffic-stats.css", import.meta.url),
  "utf8",
);
const sortControlSource = readFileSync(
  new URL("../HomeSortControl.tsx", import.meta.url),
  "utf8",
);

describe("a11y and mobile experience contracts", () => {
  it("CompactNodeCard health bars use semantic buttons with roving tabindex instead of aria-hidden spans", () => {
    expect(compactCardSource).not.toContain('className="compact-node-health-bar"\n            style={style}\n            data-selected={selectedIndex === index ? "true" : "false"}\n            aria-hidden="true"');
    expect(compactCardSource).toContain('type="button"');
    expect(compactCardSource).toContain('className="compact-node-health-bar"');
    expect(compactCardSource).toContain("tabIndex={index === focusedIndex ? 0 : -1}");
    expect(compactCardSource).toContain('aria-label={tooltip}');
    expect(compactCss).toContain("appearance: none;");
    expect(compactCss).toContain(".compact-node-health-bar:focus-visible");
  });

  it("FloatingControls uses a proportionate 40px touch target on mobile viewports", () => {
    expect(surfaceCss).toMatch(/@media \(pointer: coarse\), \(max-width: 768px\)/);
    expect(surfaceCss).toContain("width: 40px;");
    expect(surfaceCss).toContain("height: 40px;");
    expect(surfaceCss).toContain("min-width: 40px;");
    expect(surfaceCss).toContain("flex-basis: 40px;");
    expect(surfaceCss).not.toContain(".floating-controls-actions .control-button::before");
  });

  it("traffic-stats increases 26px/10.5px buttons to 28px/11.5px and improves 9px font sizes", () => {
    expect(trafficCss).toContain("height: 28px;");
    expect(trafficCss).not.toContain("height: 26px;");
    expect(trafficCss).toContain("font-size: 11.5px;");
    expect(trafficCss).toContain("font-size: 10.5px;");
    expect(trafficCss).not.toMatch(/\.traffic-node-card-peaks \.traffic-peak-value small \{\s*font-size:\s*9px;/);
  });

  it("HomeSortControl implements a complete ARIA menu and keyboard navigation model", () => {
    expect(sortControlSource).toContain('aria-haspopup="menu"');
    expect(sortControlSource).toContain('role="menu"');
    expect(sortControlSource).toContain('role="menuitemradio"');
    expect(sortControlSource).toContain("aria-checked={active}");
    expect(sortControlSource).toContain('"ArrowDown"');
    expect(sortControlSource).toContain('"ArrowUp"');
    expect(sortControlSource).toContain('"Home"');
    expect(sortControlSource).toContain('"End"');
    expect(sortControlSource).toContain('"Escape"');
    expect(surfaceCss).toContain(".home-sort-item:focus-visible");
  });
});
