import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_DEPTH,
  normalizeDarkDepth,
  readDarkDepthFromSettings,
  readMetricColorsFromSettings,
} from "@/hooks/useMetricColors";

describe("dark depth settings", () => {
  it("uses the near-black (AMOLED) palette as the default", () => {
    expect(readDarkDepthFromSettings(undefined)).toBe(DEFAULT_DARK_DEPTH);
    expect(readDarkDepthFromSettings({})).toBe(DEFAULT_DARK_DEPTH);
    expect(DEFAULT_DARK_DEPTH).toBe(100);
  });

  it("rounds and clamps the persisted depth to the safe 0-100 range", () => {
    expect(normalizeDarkDepth(42.6)).toBe(43);
    expect(normalizeDarkDepth(-20)).toBe(0);
    expect(normalizeDarkDepth(180)).toBe(100);
  });

  it("falls back for invalid values and accepts a numeric stored string", () => {
    expect(readDarkDepthFromSettings({ darkDepth: "75" })).toBe(75);
    expect(readDarkDepthFromSettings({ darkDepth: "black" })).toBe(DEFAULT_DARK_DEPTH);
  });
});

describe("metric color settings", () => {
  it("keeps legacy metricColors when manifest defaults are merged before the first official save", () => {
    expect(
      readMetricColorsFromSettings({
        metricColorCpu: "",
        metricColorMemory: "",
        metricColorTrafficUp: "",
        metricColors: { cpu: "#ABCDEF", disk: "nope", load: "#123456" },
      }),
    ).toEqual({
      cpu: "#abcdef",
      load: "#123456",
    });
  });

  it("reads flat metricColor* keys after the official full save removes metricColors", () => {
    expect(
      readMetricColorsFromSettings({
        metricColorCpu: "#3B82F6",
        metricColorMemory: "not-a-color",
        metricColorTrafficUp: "#22c55e",
      }),
    ).toEqual({
      cpu: "#3b82f6",
      trafficUp: "#22c55e",
    });
  });

  it("treats empty flat values as no override without throwing", () => {
    expect(
      readMetricColorsFromSettings({
        metricColorCpu: "",
        metricColorDisk: "  ",
      }),
    ).toEqual({});
  });
});
