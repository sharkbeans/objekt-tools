import type { Metadata } from "next";
import { MatchClientShell } from "./match-client-shell";

export const metadata: Metadata = {
  title: "Objekt Match: Discord trade matcher | objekt.my",
  description:
    "Find who has your missing objekts in Discord trade channels. The free Objekt Match extension for Chrome and Firefox collects the posts as you scroll and lines them up against your collection.",
};

export default function MatchPage() {
  return <MatchClientShell />;
}
