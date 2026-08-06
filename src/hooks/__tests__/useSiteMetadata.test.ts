import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const TITLE_PLACEHOLDER = "<title>Komari Monitor</title>";
const DESCRIPTION_PLACEHOLDER =
  '<meta name="description" content="A simple server monitor tool." />';

function count(source: string, value: string) {
  return source.split(value).length - 1;
}

describe("Komari site metadata integration", () => {
  it("keeps each server replacement placeholder exactly once in index.html", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(count(html, TITLE_PLACEHOLDER)).toBe(1);
    expect(count(html, DESCRIPTION_PLACEHOLDER)).toBe(1);
  });

  it("only synchronizes social metadata at runtime", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/hooks/useSiteMetadata.ts"),
      "utf8",
    );
    expect(source).not.toContain("document.title =");
    expect(source).not.toContain("updateMeta('meta[name=\"description\"]'");
    expect(source).toContain("document.title.trim()");
    expect(source).toContain("readMeta('meta[name=\"description\"]')");
    expect(source).toContain("og:title");
    expect(source).toContain("twitter:description");
  });
});
