import { describe, expect, it } from "vitest";
import {
  invertHomepagePingTaskBindings,
  normalizeHomepagePingTaskBindings,
  resolveHomepagePingTaskIds,
  MAX_HOMEPAGE_PING_TASKS,
} from "@/utils/pingTasks";

describe("homepage ping task bindings", () => {
  it("accepts only positive decimal safe integers", () => {
    expect(
      normalizeHomepagePingTaskBindings({
        "1e3": ["exponent"],
        "1.5": ["fraction"],
        "0x10": ["hex"],
        "9007199254740992": ["unsafe"],
        "42": ["valid"],
      }),
    ).toEqual({ "42": ["valid"] });
  });

  it("merges IDs that normalize to the same decimal integer", () => {
    expect(
      normalizeHomepagePingTaskBindings({
        "01": ["node-a", "node-b"],
        "1": ["node-b", "node-c"],
      }),
    ).toEqual({ "1": ["node-b", "node-c", "node-a"] });
  });

  it("resolves every bound task per client, ordered by task ID", () => {
    expect(
      resolveHomepagePingTaskIds({
        "3": ["node-a"],
        "1": ["node-a", "node-b"],
        "02": ["node-a"],
      }),
    ).toEqual(
      new Map([
        ["node-a", [1, 2, 3]],
        ["node-b", [1]],
      ]),
    );
  });

  it("caps each client at MAX_HOMEPAGE_PING_TASKS, keeping the lowest task IDs", () => {
    const bindings = Object.fromEntries(
      Array.from({ length: MAX_HOMEPAGE_PING_TASKS + 2 }, (_, index) => [
        String(index + 1),
        ["node-a"],
      ]),
    );
    expect(resolveHomepagePingTaskIds(bindings).get("node-a")).toEqual(
      Array.from({ length: MAX_HOMEPAGE_PING_TASKS }, (_, index) => index + 1),
    );
  });

  it("inverts normalized bindings and gives the lowest task ID precedence", () => {
    expect(
      invertHomepagePingTaskBindings({
        "02": ["node-a"],
        "1": ["node-a", "node-b"],
      }),
    ).toEqual(
      new Map([
        ["node-a", 1],
        ["node-b", 1],
      ]),
    );
  });
});
