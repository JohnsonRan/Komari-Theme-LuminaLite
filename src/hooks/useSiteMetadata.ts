import { useEffect } from "react";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { createPwaManifest } from "@/utils/pwa";

function readMeta(selector: string) {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() || "";
}

function updateMeta(attr: "name" | "property", key: string, value: string) {
  let element = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attr, key);
    document.head.append(element);
  }
  element.content = value;
}

export function useSiteMetadata() {
  const { data: config } = usePublicConfig();

  useEffect(() => {
    const siteName = config?.sitename?.trim() || document.title.trim();
    const description =
      config?.description?.trim() || readMeta('meta[name="description"]');

    if (siteName) {
      updateMeta("property", "og:title", siteName);
      updateMeta("name", "twitter:title", siteName);
      updateMeta("name", "apple-mobile-web-app-title", siteName);
    }
    if (description) {
      updateMeta("property", "og:description", description);
      updateMeta("name", "twitter:description", description);
    }

    let disposed = false;
    const link = document.createElement("link");
    link.rel = "manifest";
    void createPwaManifest(siteName, description).then((manifest) => {
      if (disposed) return;
      link.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`;
      document.head.append(link);
    }).catch((error) => {
      if (!disposed) console.warn("LuminaLite: could not prepare PWA metadata", error);
    });
    return () => {
      disposed = true;
      link.remove();
    };
  }, [config?.sitename, config?.description]);
}
