import { describe, expect, it } from "vitest";
import {
  createContentSwitchKeyframes,
  createFlipKeyframes,
  sameOrder,
  shouldRunContentSwitchTransition,
  shouldRunLayoutTransition,
  type ContentSwitchTransitionGate,
  type LayoutTransitionGate,
} from "@/hooks/useLayoutTransition";
import { MOTION_COUNT_FLIP_MAX } from "@/utils/motion";

describe("sameOrder", () => {
  it("treats identical sequences as unchanged", () => {
    expect(sameOrder(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameOrder([], [])).toBe(true);
  });

  it("detects reorders, insertions and removals", () => {
    expect(sameOrder(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameOrder(["a"], ["a", "b"])).toBe(false);
    expect(sameOrder(["a", "b"], ["a"])).toBe(false);
  });
});

describe("content switch transition", () => {
  const enabled: ContentSwitchTransitionGate = {
    hasHost: true,
    hasPreviousRevision: true,
    revisionChanged: true,
    iconAnimations: true,
    reducedMotion: false,
    documentHidden: false,
  };

  it("runs on every enabled revision change, including disjoint group switches", () => {
    expect(shouldRunContentSwitchTransition(enabled)).toBe(true);
    expect(createContentSwitchKeyframes()).toEqual([{ opacity: 0.35 }, { opacity: 1 }]);
  });

  it.each([
    ["首次渲染", { hasPreviousRevision: false }],
    ["分组未变化", { revisionChanged: false }],
    ["host 未挂载", { hasHost: false }],
    ["界面动效关闭", { iconAnimations: false }],
    ["系统 reduced-motion", { reducedMotion: true }],
    ["后台标签页", { documentHidden: true }],
  ] satisfies Array<[string, Partial<ContentSwitchTransitionGate>]>)(
    "skips %s",
    (_label, override) => {
      expect(shouldRunContentSwitchTransition({ ...enabled, ...override })).toBe(false);
    },
  );
});

describe("layout transition gates", () => {
  const enabled: LayoutTransitionGate = {
    hasHost: true,
    hasPreviousTrigger: true,
    triggerChanged: true,
    previousCount: 2,
    nextCount: 2,
    iconAnimations: true,
    reducedMotion: false,
    documentHidden: false,
  };

  it("runs only for a visible, enabled update with a previous non-empty snapshot", () => {
    expect(shouldRunLayoutTransition(enabled)).toBe(true);
  });

  it.each([
    ["首次渲染", { hasPreviousTrigger: false }],
    ["同序且 revision 未变", { triggerChanged: false }],
    ["host 未挂载(列表/网格分支切换)", { hasHost: false }],
    ["上一侧为空", { previousCount: 0 }],
    ["下一侧为空", { nextCount: 0 }],
    ["界面动效关闭", { iconAnimations: false }],
    ["系统 reduced-motion", { reducedMotion: true }],
    ["后台标签页", { documentHidden: true }],
    ["上一侧超过 24", { previousCount: MOTION_COUNT_FLIP_MAX + 1 }],
    ["下一侧超过 24", { nextCount: MOTION_COUNT_FLIP_MAX + 1 }],
  ] satisfies Array<[string, Partial<LayoutTransitionGate>]>)
    ("skips %s", (_label, override) => {
      expect(shouldRunLayoutTransition({ ...enabled, ...override })).toBe(false);
    });

  it("honors an explicit cap override at the boundary", () => {
    expect(shouldRunLayoutTransition(enabled, 1)).toBe(false);
    expect(shouldRunLayoutTransition(enabled, 2)).toBe(true);
  });

  it("creates translate-only keyframes without scale or persistent style hints", () => {
    const frames = createFlipKeyframes(-12, 8);
    expect(frames).toEqual([
      { transform: "translate(-12px, 8px)" },
      { transform: "translate(0, 0)" },
    ]);
    expect(JSON.stringify(frames)).not.toMatch(/scale|will-change/i);
    for (const frame of frames) expect(Object.keys(frame)).toEqual(["transform"]);
  });
});
