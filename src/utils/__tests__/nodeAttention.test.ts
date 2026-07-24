import { describe, expect, it } from "vitest";
import {
  DEFAULT_ATTENTION_THRESHOLDS,
  evaluateNodeAttention,
  NO_ATTENTION,
  normalizeAttentionThresholds,
  type AttentionInput,
} from "@/utils/nodeAttention";

const HEALTHY: AttentionInput = {
  online: true,
  cpuPct: 12,
  ramPct: 34,
  diskPct: 40,
  loss: 0,
  trafficFraction: 0.2,
  expireDays: 90,
};

const evaluate = (patch: Partial<AttentionInput>, previous?: ReturnType<typeof evaluateNodeAttention>) =>
  evaluateNodeAttention({ ...HEALTHY, ...patch }, DEFAULT_ATTENTION_THRESHOLDS, previous);

describe("evaluateNodeAttention", () => {
  it("leaves a healthy node alone", () => {
    expect(evaluate({})).toEqual(NO_ATTENTION);
  });

  it("ranks offline as critical and says nothing else", () => {
    // 离线节点的 CPU/内存是最后一帧的残影，再列「CPU 95%」只会误导。
    expect(evaluate({ online: false, cpuPct: 95 })).toEqual({
      level: "critical",
      hits: ["offline"],
      reasons: ["离线"],
    });
  });

  it("collects every breached threshold as a warning", () => {
    const result = evaluate({ cpuPct: 95, diskPct: 99, loss: 12 });
    expect(result.level).toBe("warning");
    expect(result.reasons).toEqual(["CPU 95%", "磁盘 99%", "丢包 12.0%"]);
  });

  it("flags a nearly exhausted traffic quota", () => {
    expect(evaluate({ trafficFraction: 0.95 }).reasons).toEqual(["剩余流量 5%"]);
  });

  it("ignores traffic and expiry when the node has neither", () => {
    expect(evaluate({ trafficFraction: null, expireDays: null })).toEqual(NO_ATTENTION);
  });

  it("flags imminent and passed expiry differently", () => {
    expect(evaluate({ expireDays: 3 }).reasons).toEqual(["3 天后到期"]);
    expect(evaluate({ expireDays: 0 }).reasons).toEqual(["已到期"]);
  });

  describe("滞回", () => {
    it("only clears once the metric falls below threshold minus the buffer", () => {
      const hit = evaluate({ cpuPct: 91 });
      expect(hit.level).toBe("warning");

      // 88 仍在缓冲区内(90 - 3)，保持警告，避免每秒进出置顶区。
      expect(evaluate({ cpuPct: 88 }, hit).level).toBe("warning");
      expect(evaluate({ cpuPct: 86 }, hit).level).toBe("none");
    });

    it("still needs the bare threshold to enter", () => {
      // 没有前值时 88 不该触发 —— 滞回只放宽退出，不放宽进入。
      expect(evaluate({ cpuPct: 88 }).level).toBe("none");
    });
  });
});

describe("normalizeAttentionThresholds", () => {
  it("falls back to defaults for missing or nonsense values", () => {
    expect(normalizeAttentionThresholds({ cpuPct: -5, memoryPct: "abc" })).toMatchObject({
      cpuPct: DEFAULT_ATTENTION_THRESHOLDS.cpuPct,
      memoryPct: DEFAULT_ATTENTION_THRESHOLDS.memoryPct,
    });
    expect(normalizeAttentionThresholds(null)).toEqual(DEFAULT_ATTENTION_THRESHOLDS);
  });

  it("clamps percentages to 100 and rounds", () => {
    expect(normalizeAttentionThresholds({ cpuPct: 150, lossPct: 7.6 })).toMatchObject({
      cpuPct: 100,
      lossPct: 8,
    });
  });
});
