"use client";

import { XIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import type { SectionId } from "@/lib/sections";

const DISMISS_KEY = "discord-banner-dismissed";
const DISCORD_INVITE = "https://discord.gg/SWEm6RbJD3";

export function DiscordBanner({
  currentSection,
}: {
  currentSection: SectionId | null;
}) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (!session || dismissed || (pathname === "/" && !currentSection))
    return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="border-b border-[#5865F2]/40 bg-[#5865F2]/10 px-4 py-2.5">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <p className="text-sm text-center flex-1">
          <span className="font-medium text-[#7289da]">
            Get trade notifications on Discord
          </span>
          <span className="text-muted-foreground">
            {" "}
            — join our server so we can DM you when someone sends a trade offer
            or accepts yours.
          </span>{" "}
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#7289da] underline hover:text-[#5865F2] transition-colors"
            onClick={handleDismiss}
          >
            Join Server →
          </a>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
