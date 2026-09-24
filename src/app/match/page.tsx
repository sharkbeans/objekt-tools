import type { Metadata } from "next";
import { MatchClientShell } from "./match-client-shell";

export const metadata: Metadata = {
  title: "Match on Discord | objekt.my",
  description:
    "Paste or capture your Discord trade channels — see who has what you're missing.",
};

export default function MatchPage() {
  return <MatchClientShell />;
}
