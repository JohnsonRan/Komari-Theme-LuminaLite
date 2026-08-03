import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MotionSettingsProvider,
  applyMotionDataset,
  useMotionSettings,
} from "@/components/ui/MotionSettings";

function createRoot(initial: Record<string, string> = {}) {
  const attributes = new Map(Object.entries(initial));
  return {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    removeAttribute: (name: string) => attributes.delete(name),
  } as unknown as HTMLElement;
}

function values(root: HTMLElement) {
  return {
    icon: root.getAttribute("data-icon-animations"),
    data: root.getAttribute("data-data-animations"),
  };
}

function MotionProbe() {
  const settings = useMotionSettings();
  return createElement("span", {
    "data-icon": String(settings.iconAnimations),
    "data-data": String(settings.dataAnimations),
  });
}

describe("MotionSettingsProvider orthogonal settings", () => {
  it.each([
    [true, true],
    [false, true],
    [true, false],
    [false, false],
  ])("keeps icon=%s and data=%s independent in context", (iconAnimations, dataAnimations) => {
    const html = renderToStaticMarkup(
      createElement(MotionSettingsProvider, {
        iconAnimations,
        dataAnimations,
        children: createElement(MotionProbe),
      }),
    );
    expect(html).toContain(`data-icon="${iconAnimations}"`);
    expect(html).toContain(`data-data="${dataAnimations}"`);
  });
});

describe("applyMotionDataset", () => {
  it("writes both attributes independently and restores the exact previous values", () => {
    const root = createRoot({ "data-icon-animations": "legacy" });
    const cleanup = applyMotionDataset(root, {
      iconAnimations: false,
      dataAnimations: true,
    });
    expect(values(root)).toEqual({ icon: "false", data: "true" });

    cleanup();
    expect(values(root)).toEqual({ icon: "legacy", data: null });
  });
});
