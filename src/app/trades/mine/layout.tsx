import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { sectionHref } from "@/lib/sections";

// The dedicated My Trades page is retired in favor of the unified trades flow.
export default function RetiredMyTradesLayout({
  children,
}: {
  children: ReactNode;
}) {
  void children;
  redirect(sectionHref("/list/mine", { currentSection: "trade" }));
}
