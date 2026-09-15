import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { useSiteMetadata as runSiteMetadata } from "@/hooks/useSiteMetadata";

vi.mock("react", () => ({ useEffect: vi.fn() }));
vi.mock("@/hooks/usePublicConfig", () => ({ usePublicConfig: vi.fn() }));
vi.mock("@/utils/pwa", () => ({ createPwaManifest: vi.fn().mockResolvedValue({}) }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

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

  it("preserves server-rendered title and description while synchronizing derived metadata", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/hooks/useSiteMetadata.ts"),
      "utf8",
    );
    expect(source).not.toContain("document.title =");
    expect(source).not.toContain('updateMeta("name", "description"');
    expect(source).toContain("document.title.trim()");
    expect(source).toContain("readMeta('meta[name=\"description\"]')");
    expect(source).toContain("og:title");
    expect(source).toContain("twitter:description");
    expect(source).toContain("apple-mobile-web-app-title");
  });

  it("lets no-JavaScript previews use the server title and description", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8")
      .replace(TITLE_PLACEHOLDER, "<title>我的监控站</title>")
      .replace(DESCRIPTION_PLACEHOLDER, '<meta name="description" content="我的站点描述" />');
    expect(html).toContain("<title>我的监控站</title>");
    expect(html).toContain('<meta name="description" content="我的站点描述" />');
    expect(html).not.toMatch(/<meta\b[^>]*(?:og|twitter):(?:title|description)/i);
  });

  it("creates derived tags from server metadata and updates them without duplicates", () => {
    const descriptionSelector = 'meta[name="description"]';
    const metas = new Map([[descriptionSelector, { content: "服务端描述" }]]);
    const createElement = () => ({ content: "", setAttribute: vi.fn(), remove: vi.fn() });
    const append = vi.fn((element: ReturnType<typeof createElement>) => {
      const [attr, key] = element.setAttribute.mock.calls[0];
      metas.set(`meta[${attr}="${key}"]`, element);
    });
    const document = {
      title: "服务端标题",
      querySelector: (selector: string) => metas.get(selector),
      createElement,
      head: { append },
    };
    vi.stubGlobal("document", document);

    for (const config of [undefined, { sitename: '站点 "A" & B', description: "更新后的描述" }]) {
      vi.mocked(usePublicConfig).mockReturnValue({ data: config } as ReturnType<typeof usePublicConfig>);
      runSiteMetadata();
      const cleanup = vi.mocked(useEffect).mock.calls.at(-1)![0]();
      const title = config?.sitename ?? "服务端标题";
      const description = config?.description ?? "服务端描述";
      expect(metas.get('meta[property="og:title"]')?.content).toBe(title);
      expect(metas.get('meta[name="twitter:title"]')?.content).toBe(title);
      expect(metas.get('meta[name="apple-mobile-web-app-title"]')?.content).toBe(title);
      expect(metas.get('meta[property="og:description"]')?.content).toBe(description);
      expect(metas.get('meta[name="twitter:description"]')?.content).toBe(description);
      expect(document.title).toBe("服务端标题");
      expect(metas.get(descriptionSelector)?.content).toBe("服务端描述");
      cleanup?.();
    }
    expect(append).toHaveBeenCalledTimes(5);
  });

  it("uses the backend favicon for the Apple home-screen icon, not the default manifest", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(html).toContain('<link rel="apple-touch-icon" href="/favicon.ico" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).not.toContain('href="/manifest.webmanifest"');
  });
});
