import { describe, expect, it } from "vitest";
import { densePingValue } from "../PingTaskTabs";

describe("densePingValue", () => {
  it("uses an integer loss percent when the latency sample is missing", () => {
    expect(densePingValue(null, 100)).toEqual({ text: "100%", asLoss: true });
    expect(densePingValue(undefined, 2.4)).toEqual({ text: "2%", asLoss: true });
  });

  it("keeps the latency number when a sample exists", () => {
    expect(densePingValue(7.2, 100)).toEqual({ text: "7", asLoss: false });
    expect(densePingValue(0, 0)).toEqual({ text: "0", asLoss: false });
  });

  it("keeps the empty marker when there is no sample and no loss", () => {
    expect(densePingValue(null, 0)).toEqual({ text: "--", asLoss: false });
    expect(densePingValue(null, null)).toEqual({ text: "--", asLoss: false });
  });
});
