import { describe, expect, it } from "vitest";
import { diffText } from "@/components/ui/AnimatedValue";

describe("diffText", () => {
  it("keeps common numeric prefix and unit suffix stable", () => {
    expect(diffText("12.34 MB/s", "12.84 MB/s")).toEqual({
      prefix: "12.",
      previous: "3",
      next: "8",
      suffix: "4 MB/s",
    });
  });

  it("handles growing and shrinking values", () => {
    expect(diffText("99%", "100%")).toEqual({
      prefix: "",
      previous: "99",
      next: "100",
      suffix: "%",
    });
    expect(diffText("100 ms", "98 ms")).toEqual({
      prefix: "",
      previous: "100",
      next: "98",
      suffix: " ms",
    });
  });

  it("does not overlap prefix and suffix on short strings", () => {
    expect(diffText("1.00", "1.01")).toEqual({
      prefix: "1.0",
      previous: "0",
      next: "1",
      suffix: "",
    });
  });
});
