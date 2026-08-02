import { memo, useEffect, useRef, useState } from "react";
import { useMotionSettings } from "@/components/ui/MotionSettings";

type TextDiff = {
  prefix: string;
  previous: string;
  next: string;
  suffix: string;
};

type Transition = TextDiff & {
  revision: number;
  direction: 1 | -1;
};

export function diffText(previous: string, next: string): TextDiff {
  let prefixLength = 0;
  const maxPrefix = Math.min(previous.length, next.length);
  while (prefixLength < maxPrefix && previous[prefixLength] === next[prefixLength]) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  const maxSuffix = Math.min(previous.length - prefixLength, next.length - prefixLength);
  while (
    suffixLength < maxSuffix &&
    previous[previous.length - 1 - suffixLength] === next[next.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return {
    prefix: next.slice(0, prefixLength),
    previous: previous.slice(prefixLength, suffixLength ? previous.length - suffixLength : undefined),
    next: next.slice(prefixLength, suffixLength ? next.length - suffixLength : undefined),
    suffix: suffixLength ? next.slice(-suffixLength) : "",
  };
}

function numericDirection(previous: string, next: string): 1 | -1 {
  const parse = (value: string) => {
    const normalized = value.replace(/,/g, "");
    const match = normalized.match(/[-+]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NaN;
  };
  const before = parse(previous);
  const after = parse(next);
  if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
    return after > before ? 1 : -1;
  }
  return 1;
}

const visibility = new WeakMap<Element, boolean>();
let observer: IntersectionObserver | null = null;
let reducedMotionQuery: MediaQueryList | null = null;

function observe(node: Element) {
  if (typeof IntersectionObserver === "undefined") {
    visibility.set(node, true);
    return;
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) visibility.set(entry.target, entry.isIntersecting);
    },
    { rootMargin: "80px" },
  );
  visibility.set(node, true);
  observer.observe(node);
}

function canAnimate(node: Element | null) {
  if (!node || document.hidden || visibility.get(node) === false) return false;
  reducedMotionQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)");
  return !reducedMotionQuery.matches;
}

/** A direction-aware, interruption-friendly rolling transition for changed text only. */
export const AnimatedValue = memo(function AnimatedValue({
  text,
  className,
  ariaLabel,
}: {
  text: string;
  className?: string;
  ariaLabel?: string;
}) {
  const { dataAnimations } = useMotionSettings();
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const renderedTextRef = useRef(text);
  const timerRef = useRef<number | null>(null);
  const [transition, setTransition] = useState<Transition | null>(null);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;
    observe(node);
    return () => {
      observer?.unobserve(node);
      visibility.delete(node);
    };
  }, []);

  useEffect(() => {
    const previous = renderedTextRef.current;
    renderedTextRef.current = text;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);

    if (previous === text || !dataAnimations || !canAnimate(hostRef.current)) {
      timerRef.current = null;
      setTransition(null);
      return;
    }

    const diff = diffText(previous, text);
    setTransition((current) => ({
      ...diff,
      direction: numericDirection(previous, text),
      revision: (current?.revision ?? 0) + 1,
    }));
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setTransition(null);
    }, 380);
  }, [dataAnimations, text]);

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  if (!dataAnimations || !transition) {
    return <span ref={hostRef} className={className}>{text}</span>;
  }

  return (
    <span
      ref={hostRef}
      className={`native-roll-value${className ? ` ${className}` : ""}`}
      aria-label={ariaLabel ?? text}
      data-direction={transition.direction > 0 ? "up" : "down"}
    >
      <span aria-hidden>{transition.prefix}</span>
      <span className="native-roll-value-change" aria-hidden>
        <span className="native-roll-value-measure">{transition.next || "\u00A0"}</span>
        <span key={`old-${transition.revision}`} className="native-roll-value-old">
          {transition.previous || "\u00A0"}
        </span>
        <span key={`new-${transition.revision}`} className="native-roll-value-new">
          {transition.next || "\u00A0"}
        </span>
      </span>
      <span aria-hidden>{transition.suffix}</span>
    </span>
  );
});
