"use client";

import { usePathname } from "next/navigation";

function getDisclaimerText(pathname: string | null): string {
  if (!pathname) {
    return "Fan-made community tool · not affiliated with or endorsed by modhaus or COSMO";
  }

  if (
    pathname.startsWith("/trades") ||
    pathname.startsWith("/active-trades") ||
    pathname.startsWith("/notifications")
  ) {
    return "Fan-made trade posting and checking tool · not affiliated with or endorsed by modhaus or COSMO · no real objekts are distributed";
  }

  if (
    pathname.startsWith("/objekt-maker") ||
    pathname.startsWith("/proofshot")
  ) {
    return "Fan-made custom objekt and proofshot maker · not affiliated with or endorsed by modhaus or COSMO · no real objekts are distributed";
  }

  if (pathname.startsWith("/post")) {
    return "Fan-made HAVE/WANT poster tool · not affiliated with or endorsed by modhaus or COSMO · no real objekts are distributed";
  }

  return "Fan-made community tool · not affiliated with or endorsed by modhaus or COSMO";
}

export function SiteDisclaimerFooter() {
  const pathname = usePathname();

  if (pathname?.startsWith("/spin")) return null;

  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-2 z-30 flex justify-center px-4">
      <p className="max-w-3xl select-none text-center text-[10px] leading-4 text-muted-foreground/75">
        {getDisclaimerText(pathname)}
      </p>
    </footer>
  );
}
