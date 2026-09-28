import { afterEach, describe, expect, it, vi } from "vitest";
import { withTimeoutSignal } from "@/utils/abort";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("withTimeoutSignal", () => {
  it("cleans its timer as soon as the operation settles", async () => {
    vi.useFakeTimers();

    await expect(
      withTimeoutSignal(async (signal) => {
        expect(signal.aborted).toBe(false);
        return "ok";
      }, 5_000),
    ).resolves.toBe("ok");

    expect(vi.getTimerCount()).toBe(0);
  });

  it("removes the upstream listener after an early rejection", async () => {
    vi.useFakeTimers();
    const upstream = new AbortController();
    const removeEventListener = vi.spyOn(upstream.signal, "removeEventListener");

    await expect(
      withTimeoutSignal(
        async () => {
          throw new Error("failed early");
        },
        5_000,
        upstream.signal,
      ),
    ).rejects.toThrow("failed early");

    expect(removeEventListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
