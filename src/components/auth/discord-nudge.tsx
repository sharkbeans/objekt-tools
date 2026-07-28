"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "discord-banner-dismissed";
const DISCORD_INVITE = "https://discord.gg/SWEm6RbJD3";

export function DiscordNudge() {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (dismissed) return null;

  function handleJoin() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <p className="text-xs text-muted-foreground">
      <span className="text-[#7289da] font-medium">
        Get notified on Discord
      </span>
      {" — "}
      <a
        href={DISCORD_INVITE}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-[#7289da] hover:text-[#5865F2] transition-colors"
        onClick={handleJoin}
      >
        join our server
      </a>
      {" so our bot can DM you when trades update."}
    </p>
  );
}
