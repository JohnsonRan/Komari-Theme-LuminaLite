import { afterEach, describe, expect, it, vi } from "vitest";
import { createPwaManifest } from "@/utils/pwa";

function mockBrowser() {
  const decode = vi.fn().mockResolvedValue(undefined);
  const drawImage = vi.fn();
  const image = { src: "", naturalWidth: 1080, naturalHeight: 540, decode };
  const canvases: { width: number; height: number }[] = [];
  const getContext = vi.fn<() => { drawImage: typeof drawImage } | null>(() => ({ drawImage }));
  vi.stubGlobal("Image", class { constructor() { return image; } });
  vi.stubGlobal("window", { location: { href: "https://monitor.example/instance/node?temp_key=secret#chart" } });
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      expect(tag).toBe("canvas");
      const canvas = {
        width: 0,
        height: 0,
        getContext,
        toDataURL: (type: string) => {
          expect(type).toBe("image/png");
          return `data:image/png;base64,${canvas.width}`;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  return { image, canvases, drawImage, decode, getContext };
}

afterEach(() => vi.unstubAllGlobals());

describe("backend-configured online PWA", () => {
  it("uses site metadata, stable root identity and genuinely resized icons", async () => {
    const { image, canvases, drawImage } = mockBrowser();
    const name = '站点 "A" & B';
    const manifest = await createPwaManifest(name, "Backend description");
    expect(manifest).toMatchObject({
      id: "https://monitor.example/",
      name,
      short_name: name,
      description: "Backend description",
      start_url: "https://monitor.example/",
      scope: "https://monitor.example/",
      display: "standalone",
    });
    expect(JSON.stringify(manifest)).not.toContain("secret");
    expect(image.src).toBe("/favicon.ico");
    expect(canvases.map(({ width, height }) => [width, height])).toEqual([[192, 192], [512, 512]]);
    expect(drawImage).toHaveBeenNthCalledWith(1, image, 0, 48, 192, 96);
    expect(drawImage).toHaveBeenNthCalledWith(2, image, 0, 128, 512, 256);
    expect(manifest.icons).toEqual([
      { src: "data:image/png;base64,192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "data:image/png;base64,512", sizes: "512x512", type: "image/png", purpose: "any" },
    ]);
    expect((await createPwaManifest("New site name", "")).id).toBe(manifest.id);
  });

  it("rejects undecodable or dimensionless icons rather than advertising broken images", async () => {
    const { image, decode } = mockBrowser();
    decode.mockRejectedValueOnce(new Error("Invalid image"));
    await expect(createPwaManifest("Site", "")).rejects.toThrow("Invalid image");
    image.naturalWidth = 0;
    await expect(createPwaManifest("Site", "")).rejects.toThrow("intrinsic dimensions");
  });

  it("reports missing canvas support", async () => {
    const { getContext } = mockBrowser();
    getContext.mockReturnValueOnce(null);
    await expect(createPwaManifest("Site", "")).rejects.toThrow("Canvas is unavailable");
  });
});
