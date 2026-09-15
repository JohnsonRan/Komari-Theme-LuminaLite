import { afterEach, expect, it, vi } from "vitest";

const { recordVisitorEvent, effects } = vi.hoisted(() => ({
  recordVisitorEvent: vi.fn(),
  effects: [] as Array<() => (() => void) | undefined>,
}));
vi.mock("react", () => ({
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => (() => void) | undefined) => effects.push(effect),
}));
vi.mock("react-router-dom", () => ({ useLocation: () => ({ pathname: "/" }) }));
vi.mock("@/services/api", () => ({ recordVisitorEvent }));

import { useVisitorTracking } from "@/hooks/useVisitorTracking";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("reports without legacy config and survives StrictMode effect replay", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", { referrer: "" });
  useVisitorTracking();
  const effect = effects[0];
  effect()?.(); // StrictMode cleans up the first pending debounce.
  const cleanup = effect();
  await vi.advanceTimersByTimeAsync(300);
  await vi.dynamicImportSettled();
  expect(recordVisitorEvent).toHaveBeenCalledExactlyOnceWith({
    event: "pageview", path: "/", detail: undefined,
  });
  cleanup?.();
});
