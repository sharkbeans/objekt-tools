import type { Metadata } from "next";
import { MatchClient } from "./match-client";

export const metadata: Metadata = {
  title: "Match from a Discord paste | objekt.my",
  description:
    "Paste trade posts from a Discord channel and see who wants what you own.",
};

export default function MatchPage() {
  return <MatchClient />;
}
