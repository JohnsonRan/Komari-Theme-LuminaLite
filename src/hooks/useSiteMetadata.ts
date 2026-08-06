import { useEffect } from "react";
import { usePublicConfig } from "@/hooks/usePublicConfig";

function readMeta(selector: string) {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() || "";
}

function updateMeta(selector: string, attr: "content", value: string) {
  const element = document.querySelector<HTMLMetaElement>(selector);
  if (element) {
    element[attr] = value;
  }
}

export function useSiteMetadata() {
  const { data: config } = usePublicConfig();

  useEffect(() => {
    const siteName = config?.sitename?.trim() || document.title.trim();
    const description =
      config?.description?.trim() || readMeta('meta[name="description"]');

    if (siteName) {
      updateMeta('meta[property="og:title"]', "content", siteName);
      updateMeta('meta[name="twitter:title"]', "content", siteName);
    }
    if (description) {
      updateMeta('meta[property="og:description"]', "content", description);
      updateMeta('meta[name="twitter:description"]', "content", description);
    }
  }, [config?.sitename, config?.description]);
}
