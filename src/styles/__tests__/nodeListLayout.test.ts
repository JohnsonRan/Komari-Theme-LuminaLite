import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getNodeFieldDefinition } from "@/utils/nodeFields";

const listCss = readFileSync(new URL("../node-list.css", import.meta.url), "utf8");
const listView = readFileSync(
  new URL("../../components/node/NodeListView.tsx", import.meta.url),
  "utf8",
);
const pingTabs = readFileSync(
  new URL("../../components/node/PingTaskTabs.tsx", import.meta.url),
  "utf8",
);

describe("list network column stays one row tall", () => {
  it("lays ping tasks in a single non-wrapping row with a gauge-height chart", () => {
    const tabs = listCss.match(/\.node-list-latency \.ping-task-tabs \{[^}]*\}/)?.[0] ?? "";
    const tab = listCss.match(/\.node-list-latency \.ping-task-tab \{[^}]*\}/)?.[0] ?? "";
    const chart = listCss.match(/\.node-list-latency \.health-bar-row \{[^}]*\}/)?.[0] ?? "";

    expect(tabs).toMatch(/flex-wrap:\s*nowrap/);
    expect(tab).not.toMatch(/width:\s*100%/);
    expect(tab).toMatch(/min-height:\s*0/);
    expect(chart).toMatch(/height:\s*8px/);
    expect(listCss).not.toMatch(/\.node-list-latency\s*\{[^}]*max-width:\s*132px/);
    expect(listView).toContain("dense");
    expect(listView).toContain("height={LIST_PING_BAR_HEIGHT}");
    expect(listView).toMatch(/LIST_PING_BAR_HEIGHT = 8/);
  });

  it("gives the network column enough width for three horizontal labels", () => {
    const network = getNodeFieldDefinition("network");
    expect(network.minWidth).toBeGreaterThanOrEqual(220);
    expect(listCss).toContain(`minmax(${network.minWidth}px, ${network.fr}fr)`);
  });

  it("keeps loss percent out of the dense tab width budget", () => {
    expect(pingTabs).toContain("dense?: boolean");
    expect(pingTabs).toMatch(/!dense && hasLoss/);
    expect(pingTabs).toContain('data-loss={lossState}');
    expect(listCss).toContain('.node-list-latency .ping-task-tab[data-loss="high"]');
  });
});
