import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_DEPTH,
  normalizeDarkDepth,
  readDarkDepthFromSettings,
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
