/**
 * Stands in for the Objekt Match extension's objekt.my bridge in jsdom tests:
 * answers `ping` with `present` and stores `hunt`s, replying the way the real
 * bridge does (`extensions/discord-capture/src/bridge.ts`). Replies are
 * dispatched as coming from this window on its own origin, which is what the
 * page-side listeners check.
 */
export function installFakeExtension(
  options: { version?: string; saves?: boolean } = {},
) {
  const { version = "1.2.0", saves = true } = options;
  const hunts: Record<string, unknown>[] = [];
  const reply = (data: unknown) =>
    window.dispatchEvent(
      new MessageEvent("message", {
        data,
        origin: window.location.origin,
        source: window,
      }),
    );
  const onMessage = (event: MessageEvent) => {
    const message = event.data as Record<string, unknown> | null;
    if (message?.source !== "objekt-match") return;
    if (message.type === "ping")
      setTimeout(() =>
        reply({ source: "objekt-capture", type: "present", version }),
      );
    if (message.type === "hunt") {
      hunts.push(message);
      if (saves)
        setTimeout(() =>
          reply({
            source: "objekt-capture",
            type: "hunt-saved",
            id: message.id,
            count: String(message.wants).split("\n").length,
          }),
        );
    }
  };
  window.addEventListener("message", onMessage);
  return {
    hunts,
    remove: () => window.removeEventListener("message", onMessage),
  };
}
