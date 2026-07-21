import { useEffect } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import {
  applyBackgroundCache,
  buildBackgroundCache,
  persistBackgroundCache,
} from "@/utils/background";

/** 同步背景 CSS 变量和首帧缓存；实际背景由 body 伪元素绘制。 */
export function BackgroundLayer() {
  const { resolvedAppearance } = usePreferences();
  const {
    enableBackgroundImage,
    backgroundImage,
    backgroundImageMobile,
    backgroundAlignment,
    surfaceOpacity,
    isReady,
  } = useThemeSettings();

  useEffect(() => {
    if (!isReady) return;
    const cache = buildBackgroundCache({
      enableBackgroundImage,
      backgroundImage,
      backgroundImageMobile,
      backgroundAlignment,
      surfaceOpacity,
    });
    persistBackgroundCache(cache);
    applyBackgroundCache(cache, resolvedAppearance);
  }, [
    isReady,
    enableBackgroundImage,
    backgroundImage,
    backgroundImageMobile,
    backgroundAlignment,
    surfaceOpacity,
    resolvedAppearance,
  ]);

  return null;
}
