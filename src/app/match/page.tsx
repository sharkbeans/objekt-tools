import type { Metadata } from "next";
import { MatchClientShell } from "./match-client-shell";

const description =
  "Find who has your missing objekts in Discord trade channels. The free Objekt Match extension for Chrome and Firefox searches them for you and lines the posts up against your collection.";

// The link preview's image is opengraph-image.tsx beside this file.
export const metadata: Metadata = {
  title: "Objekt Match: Discord trade matcher | objekt.my",
  description,
  alternates: { canonical: "/match" },
  openGraph: {
    title: "Objekt Match: find who has your missing objekts on Discord",
    description,
    url: "/match",
    siteName: "objekt.my",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Objekt Match: find who has your missing objekts on Discord",
    description,
  },
};

export default function MatchPage() {
  return <MatchClientShell />;
}
