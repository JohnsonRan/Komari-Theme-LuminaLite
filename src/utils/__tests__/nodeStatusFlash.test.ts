import { describe, expect, it } from "vitest";
import {
  isNodeStatusFlashAnimationName,
  resolveStatusFlash,
} from "@/utils/nodeStatusFlash";

describe("resolveStatusFlash 转移表", () => {
  it("首渲染/读数未就绪一律不播", () => {
    expect(resolveStatusFlash(null, "online", "none", "none")).toBeNull();
    expect(resolveStatusFlash("online", null, "none", "warning")).toBeNull();
    expect(resolveStatusFlash(null, null, "none", "none")).toBeNull();
  });

  it("online → offline 播故障，offline → online 播恢复", () => {
    expect(resolveStatusFlash("online", "offline", "none", "none")).toBe("offline");
    expect(resolveStatusFlash("offline", "online", "none", "none")).toBe("online");
    expect(resolveStatusFlash("offline", "online", "warning", "warning")).toBe("online");
  });

  it("attention 仅在进入非 none 等级时播放", () => {
    expect(resolveStatusFlash("online", "online", "none", "warning")).toBe("attention");
    expect(resolveStatusFlash("offline", "offline", "none", "warning")).toBe("attention");
    expect(resolveStatusFlash("online", "online", "warning", "none")).toBeNull();
    expect(resolveStatusFlash("online", "online", "warning", "warning")).toBeNull();
  });

  it("online → offline 同时命中关注时仍以故障优先", () => {
    expect(resolveStatusFlash("online", "offline", "none", "warning")).toBe("offline");
  });
});

describe("isNodeStatusFlashAnimationName", () => {
  it("只接受三种卡片状态动画", () => {
    expect(isNodeStatusFlashAnimationName("motion-flash-online")).toBe(true);
    expect(isNodeStatusFlashAnimationName("motion-flash-offline")).toBe(true);
    expect(isNodeStatusFlashAnimationName("motion-flash-attention")).toBe(true);
    expect(isNodeStatusFlashAnimationName("motion-content-enter")).toBe(false);
    expect(isNodeStatusFlashAnimationName("compact-health-tooltip-in")).toBe(false);
    expect(isNodeStatusFlashAnimationName("")).toBe(false);
  });
});
