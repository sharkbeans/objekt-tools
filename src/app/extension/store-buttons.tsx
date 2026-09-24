"use client";

import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { EXTENSION_STORE_URLS } from "@/lib/extension-links";

const STORES = [
  { id: "chrome", label: "Chrome Web Store" },
  { id: "firefox", label: "Firefox Add-ons" },
] as const;

export function StoreButtons() {
  return (
    <div className="flex flex-wrap gap-3">
      {STORES.map(({ id, label }) => {
        const url = EXTENSION_STORE_URLS[id];
        if (!url) {
          return (
            <Button key={id} size="lg" variant="outline" disabled>
              {label} · Coming soon
            </Button>
          );
        }
        return (
          <Button key={id} size="lg" asChild>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("extension_store_click", { store: id })}
            >
              {label}
              <ExternalLinkIcon className="size-4" />
            </a>
          </Button>
        );
      })}
    </div>
  );
}
