import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useExtensionPresence } from "@/hooks/use-extension-presence";
import { huntMessage, sendHuntToExtension } from "@/lib/match/send-hunt";
import { installFakeExtension } from "@/test/fake-extension";

const hunt = {
  mode: "wtb" as const,
  wants: ["SeoYeon CC103", "SeoYeon CC104"],
  offers: [],
  nickname: "sjarkbean",
};

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("huntMessage", () => {
  it("sends wants one per line, never offers", () => {
    expect(
      huntMessage({ ...hunt, mode: "wtt", offers: ["SeoYeon CC101"] }, "h1"),
    ).toEqual({
      source: "objekt-match",
      type: "hunt",
      id: "h1",
      wants: "SeoYeon CC103\nSeoYeon CC104",
      nickname: "sjarkbean",
    });
  });

  it("drops a nickname the extension would refuse rather than the hunt", () => {
    expect(
      huntMessage({ ...hunt, nickname: "has space" }, "h1")?.nickname,
    ).toBe("");
  });

  it("has nothing to send without wants", () => {
    expect(huntMessage({ ...hunt, wants: [" "] }, "h1")).toBeNull();
  });
});

describe("sendHuntToExtension", () => {
  it("resolves true once the extension confirms", async () => {
    const extension = installFakeExtension();
    cleanup = extension.remove;
    await expect(sendHuntToExtension(hunt)).resolves.toBe(true);
    expect(extension.hunts).toHaveLength(1);
    expect(extension.hunts[0].wants).toBe("SeoYeon CC103\nSeoYeon CC104");
  });

  it("resolves false when nothing answers", async () => {
    await expect(sendHuntToExtension(hunt, { timeoutMs: 30 })).resolves.toBe(
      false,
    );
  });

  it("resolves false when the extension does not store it", async () => {
    const extension = installFakeExtension({ saves: false });
    cleanup = extension.remove;
    await expect(sendHuntToExtension(hunt, { timeoutMs: 30 })).resolves.toBe(
      false,
    );
  });
});

describe("useExtensionPresence", () => {
  it("reports installed with its version", async () => {
    const extension = installFakeExtension({ version: "1.2.0" });
    cleanup = extension.remove;
    const { result } = renderHook(() => useExtensionPresence(500));
    expect(result.current.installed).toBeNull();
    await waitFor(() =>
      expect(result.current).toEqual({ installed: true, version: "1.2.0" }),
    );
  });

  it("reports not installed after the timeout, then installed if it arrives late", async () => {
    const { result } = renderHook(() => useExtensionPresence(20));
    await waitFor(() => expect(result.current.installed).toBe(false));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { source: "objekt-capture", type: "present", version: "1.2.0" },
          origin: window.location.origin,
          source: window,
        }),
      );
    });
    expect(result.current.installed).toBe(true);
  });
});
