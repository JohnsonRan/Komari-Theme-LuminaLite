// Install metadata only. No service worker, page cache, or notification permission.
export async function createPwaManifest(name: string, description: string) {
  const image = new Image();
  // Komari serves the configured site icon here, regardless of its file format.
  image.src = "/favicon.ico";
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error("Site icon has no intrinsic dimensions");
  }

  const icons = [192, 512].map((size) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is unavailable for PWA icons");
    const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
    return {
      src: canvas.toDataURL("image/png"),
      sizes: `${size}x${size}`,
      type: "image/png",
      purpose: "any",
    };
  });
  // Absolute URLs are required because this manifest is embedded as a data URL.
  // Keep identity stable across routes, query strings and site name changes.
  const root = new URL("/", window.location.href).href;
  return {
    id: root,
    name,
    short_name: name,
    description,
    start_url: root,
    scope: root,
    display: "standalone",
    icons,
  };
}
