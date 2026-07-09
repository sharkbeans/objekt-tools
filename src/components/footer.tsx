"use client";

import { usePathname } from "next/navigation";
import type { SectionId } from "@/lib/sections";

function getDisclaimerText(
  pathname: string | null,
  currentSection: SectionId | null,
): string {
  if (!pathname) {
    return "Fan-made community tool · not affiliated with or endorsed by MODHAUS or COSMO";
  }

  if (pathname === "/" && !currentSection) {
    return "Fan-made community tools for Cosmo collectors · not affiliated with or endorsed by MODHAUS or COSMO · all content is user-generated";
  }

  if (
    currentSection === "trade" ||
    pathname.startsWith("/trades") ||
    pathname.startsWith("/active-trades") ||
    pathname.startsWith("/notifications")
  ) {
    return "Fan-made trade posting and checking tool · not affiliated with or endorsed by MODHAUS or COSMO · no real objekts are distributed";
  }

  if (
    currentSection === "create" ||
    pathname.startsWith("/objekt-maker") ||
    pathname.startsWith("/proofshot")
  ) {
    return "Fan-made custom objekt and proofshot maker · not affiliated with or endorsed by MODHAUS or COSMO · no real objekts are distributed";
  }

  if (
    currentSection === "list" ||
    pathname.startsWith("/post") ||
    pathname.startsWith("/list")
  ) {
    return "Fan-made HAVE/WANT poster tool · not affiliated with or endorsed by MODHAUS or COSMO · no real objekts are distributed";
  }

  if (currentSection === "collect" || pathname.startsWith("/collection")) {
    return "Fan-made collection tracking tool · not affiliated with or endorsed by MODHAUS or COSMO";
  }

  return "Fan-made community tool · not affiliated with or endorsed by MODHAUS or COSMO";
}

export function SiteDisclaimerFooter({
  currentSection,
}: {
  currentSection: SectionId | null;
}) {
  const pathname = usePathname();

  if (!pathname || pathname?.startsWith("/spin")) return null;

  return (
    <footer className="pointer-events-none fixed inset-x-0 bottom-2 z-30 flex justify-center px-4">
      <p className="max-w-3xl select-none text-center text-[10px] leading-4 text-muted-foreground/75">
        {getDisclaimerText(pathname, currentSection)}
      </p>
    </footer>
  );
}
