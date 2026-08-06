import { describe, expect, it } from "vitest";
import { MAX_HOMEPAGE_PING_TASKS, resolvePublicPingTaskIds } from "@/utils/pingTasks";
import type { PingTask } from "@/types/komari";

function task(id: number, weight: number, clients: string[]): PingTask {
  return {
    id,
    weight,
    clients,
    name: `task-${id}`,
    interval: 60,
    loss: 0,
    type: "icmp",
    target: "",
  };
}

describe("public homepage ping tasks", () => {
  it("uses backend task clients directly and ignores empty client values", () => {
    expect(
      resolvePublicPingTaskIds([
        task(1, 0, ["node-a", " node-b ", ""]),
        task(2, 1, ["node-a"]),
      ]),
    ).toEqual(
      new Map([
        ["node-a", [1, 2]],
        ["node-b", [1]],
      ]),
    );
  });

  it("orders tasks by weight then id rather than response order", () => {
    expect(
      resolvePublicPingTaskIds([
        task(20, 10, ["node-a"]),
        task(3, 1, ["node-a"]),
        task(2, 1, ["node-a"]),
      ]).get("node-a"),
    ).toEqual([2, 3, 20]);
  });

  it("caps each node at the homepage task limit", () => {
    const tasks = Array.from({ length: MAX_HOMEPAGE_PING_TASKS + 2 }, (_, index) =>
      task(index + 1, index, ["node-a"]),
    );
    expect(resolvePublicPingTaskIds(tasks).get("node-a")).toEqual(
      Array.from({ length: MAX_HOMEPAGE_PING_TASKS }, (_, index) => index + 1),
    );
  });

  it("does not create an assignment for nodes absent from every task", () => {
    const resolved = resolvePublicPingTaskIds([task(1, 0, ["node-a"])]);
    expect(resolved.has("node-without-ping")).toBe(false);
  });
});
