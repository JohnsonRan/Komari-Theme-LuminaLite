import { useEffect, useRef, useState, type PointerEvent } from "react";

interface CanvasStripProps {
  className?: string;
  height: number;
  redrawKey?: string | number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  getHoverIndex?: (offsetX: number, width: number) => number | null;
  onHoverIndex?: (index: number | null) => void;
}

type WidthListener = (width: number) => void;
type VisibilityListener = (visible: boolean) => void;

const observedWidths = new Map<Element, WidthListener>();
const fallbackResizeListeners = new Set<() => void>();
let sharedResizeObserver: ResizeObserver | null = null;
let fallbackResizeListening = false;
const observedVisibility = new Map<Element, VisibilityListener>();
let sharedIntersectionObserver: IntersectionObserver | null = null;

function normalizeWidth(width: number) {
  return Number.isFinite(width) && width > 0 ? Math.round(width * 100) / 100 : 0;
}

function subscribeToWidth(element: HTMLElement, listener: WidthListener) {
  if (typeof ResizeObserver !== "undefined") {
    sharedResizeObserver ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        observedWidths.get(entry.target)?.(normalizeWidth(entry.contentRect.width));
      }
    });
    observedWidths.set(element, listener);
    sharedResizeObserver.observe(element);

    return () => {
      observedWidths.delete(element);
      sharedResizeObserver?.unobserve(element);
      if (observedWidths.size === 0) {
        sharedResizeObserver?.disconnect();
        sharedResizeObserver = null;
      }
    };
  }

  const update = () => listener(normalizeWidth(element.getBoundingClientRect().width));
  fallbackResizeListeners.add(update);
  if (!fallbackResizeListening) {
    fallbackResizeListening = true;
    window.addEventListener("resize", notifyFallbackResizeListeners);
  }

  return () => {
    fallbackResizeListeners.delete(update);
    if (fallbackResizeListeners.size === 0 && fallbackResizeListening) {
      fallbackResizeListening = false;
      window.removeEventListener("resize", notifyFallbackResizeListeners);
    }
  };
}

function notifyFallbackResizeListeners() {
  for (const listener of fallbackResizeListeners) listener();
}

function subscribeToVisibility(element: HTMLElement, listener: VisibilityListener) {
  if (typeof IntersectionObserver === "undefined") {
    listener(true);
    return () => undefined;
  }

  sharedIntersectionObserver ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        observedVisibility.get(entry.target)?.(entry.isIntersecting);
      }
    },
    { rootMargin: "160px 0px" },
  );
  observedVisibility.set(element, listener);
  sharedIntersectionObserver.observe(element);

  return () => {
    observedVisibility.delete(element);
    sharedIntersectionObserver?.unobserve(element);
    if (observedVisibility.size === 0) {
      sharedIntersectionObserver?.disconnect();
      sharedIntersectionObserver = null;
    }
  };
}

// 缓存 CSS 变量，避免每张卡片每次重绘都触发样式计算。
const cssColorCache = new Map<string, string>();
let cssColorCacheKey: string | null = null;
let colorValidationContext: CanvasRenderingContext2D | null | undefined;

const CANVAS_COLOR_FALLBACKS = {
  light: {
    "--progress-bg": "#e4e4e7",
    "--progress-cpu": "#3b82f6",
    "--progress-memory": "#8b5cf6",
    "--progress-disk": "#e97b35",
    "--progress-network": "#10b981",
    "--progress-load": "#ec4899",
    "--progress-swap": "#6366f1",
    "--traffic-up": "#3b82f6",
    "--traffic-down": "#2f9e65",
    "--speed-idle": "#3aa76a",
    "--speed-low": "#d9992b",
    "--speed-high": "#e07a35",
    "--speed-max": "#d6463d",
    "--status-success": "#2f9e65",
    "--status-warning": "#e9a23b",
    "--status-error": "#dc2626",
    "--status-info": "#3b82f6",
    "--status-online": "#2f9e65",
    "--status-offline": "#dc2626",
    "--text-tertiary": "#71717a",
  },
  dark: {
    "--progress-bg": "#26262a",
    "--progress-cpu": "#5d88ff",
    "--progress-memory": "#a35cf5",
    "--progress-disk": "#f1873d",
    "--progress-network": "#5bbb8a",
    "--progress-load": "#f472b6",
    "--progress-swap": "#986ee2",
    "--traffic-up": "#539bf5",
    "--traffic-down": "#57ab5a",
    "--speed-idle": "#61c08f",
    "--speed-low": "#e0b34f",
    "--speed-high": "#ef8f55",
    "--speed-max": "#ec6a5e",
    "--status-success": "#61c08f",
    "--status-warning": "#d4a54a",
    "--status-error": "#d84e45",
    "--status-info": "#5d88ff",
    "--status-online": "#61c08f",
    "--status-offline": "#d84e45",
    "--text-tertiary": "#76767c",
  },
} as const;

function extractCssVarName(color: string): string | null {
  return color.match(/^var\((--[^),\s]+)/)?.[1] ?? null;
}

function fallbackCanvasColor(varName: string | null): string {
  if (!varName) return "#000000";
  const appearance = document.documentElement.dataset.appearance === "dark" ? "dark" : "light";
  return CANVAS_COLOR_FALLBACKS[appearance][
    varName as keyof (typeof CANVAS_COLOR_FALLBACKS)["light"]
  ] ?? "#000000";
}

// 自定义配色不改变 appearance，需要显式失效。
export function clearCssColorCache() {
  cssColorCache.clear();
  cssColorCacheKey = null;
}

function resolveCssColor(color: string): string {
  const varName = extractCssVarName(color);
  if (!varName) return color;

  const appearance = document.documentElement.dataset.appearance ?? "";
  if (appearance !== cssColorCacheKey) {
    cssColorCacheKey = appearance;
    cssColorCache.clear();
  }

  const cached = cssColorCache.get(varName);
  if (cached !== undefined) return cached || color;

  const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  // 首帧空值不缓存，样式就绪后可重新解析。
  if (resolved) cssColorCache.set(varName, resolved);
  return resolved || color;
}

function canUseCanvasColor(color: string): boolean {
  if (typeof document === "undefined") return true;
  try {
    if (colorValidationContext === undefined) {
      colorValidationContext = document.createElement("canvas").getContext("2d");
    }
    const ctx = colorValidationContext;
    if (!ctx) return true;

    ctx.fillStyle = "#000001";
    ctx.fillStyle = color;
    if (ctx.fillStyle !== "#000001") return true;

    ctx.fillStyle = "#000002";
    ctx.fillStyle = color;
    return ctx.fillStyle !== "#000002";
  } catch {
    return false;
  }
}

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const value = color.trim();
  const short = /^#([\da-f])([\da-f])([\da-f])$/i.exec(value);
  if (short) {
    return {
      r: parseInt(`${short[1]}${short[1]}`, 16),
      g: parseInt(`${short[2]}${short[2]}`, 16),
      b: parseInt(`${short[3]}${short[3]}`, 16),
    };
  }
  const full = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (full) {
    return {
      r: parseInt(full[1], 16),
      g: parseInt(full[2], 16),
      b: parseInt(full[3], 16),
    };
  }
  return null;
}

// Canvas 兼容旧 WebKit：用通道插值代替 color-mix()。
export function mixSrgbTowardWhite(baseColor: string, baseWeight: number): string {
  const rgb = parseHexColor(baseColor);
  if (!rgb) return baseColor;
  const w = Math.max(0, Math.min(1, baseWeight));
  const channel = (value: number) => Math.round(value * w + 255 * (1 - w));
  return `rgb(${channel(rgb.r)}, ${channel(rgb.g)}, ${channel(rgb.b)})`;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const sat = Math.max(0, Math.min(1, s / 100));
  const lig = Math.max(0, Math.min(1, l / 100));
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = ((((h % 360) + 360) % 360)) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = lig - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

// 统一解析并校验 Canvas 颜色，不支持时回退到主题色。
export function safeCanvasColor(color: string): string {
  const varName = extractCssVarName(color);
  const value = (varName ? resolveCssColor(color) : color).trim();
  if (!value || /^var\(/i.test(value) || /^color-mix\(/i.test(value)) {
    return fallbackCanvasColor(varName);
  }

  const hsl = /^hsla?\(([^)]+)\)$/i.exec(value);
  if (hsl) {
    const parts = hsl[1]
      .replace(/\//g, " ")
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((part) => parseFloat(part));
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      const { r, g, b } = hslToRgb(parts[0], parts[1], parts[2]);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  if (!canUseCanvasColor(value)) return fallbackCanvasColor(varName);
  return value;
}

export function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
  ctx.fill();
}

export function CanvasStrip({
  className,
  height,
  redrawKey,
  draw,
  getHoverIndex,
  onHoverIndex,
}: CanvasStripProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastHoverIndexRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateWidth = (nextWidth: number) => {
      setWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    updateWidth(normalizeWidth(canvas.getBoundingClientRect().width));
    return subscribeToWidth(canvas, updateWidth);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return subscribeToVisibility(canvas, setVisible);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible || width <= 0) return;

    const devicePixelRatio = window.devicePixelRatio;
    const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
      ? devicePixelRatio
      : 1;
    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    // 重设 canvas 尺寸会清空状态并重新分配位图；数据重绘时尺寸通常没有变化。
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
  }, [draw, height, redrawKey, visible, width]);

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!getHoverIndex || !onHoverIndex || width <= 0) return;
    const next = getHoverIndex(event.nativeEvent.offsetX, width);
    if (next === lastHoverIndexRef.current) return;
    lastHoverIndexRef.current = next;
    onHoverIndex(next);
  };

  const handlePointerLeave = () => {
    if (lastHoverIndexRef.current === null) return;
    lastHoverIndexRef.current = null;
    onHoverIndex?.(null);
  };

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ width: "100%", height }}
      aria-hidden
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    />
  );
}
