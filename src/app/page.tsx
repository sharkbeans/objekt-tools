import { BrushIcon, CameraIcon, DicesIcon, ListChecksIcon } from "lucide-react";
import type { Metadata } from "next";
import {
  type HomeCopy,
  HomeScreen,
  type HomeTool,
} from "@/components/home/home-screen";
import { rootUrl, sectionHref } from "@/lib/sections";

const description =
  "Track your tripleS, ARTMS and idntt objekt grids, see every FCO you're missing, and find who on Discord has them. Free fan-made tools for Cosmo collectors.";

// The link preview's image is src/app/opengraph-image.tsx.
export const metadata: Metadata = {
  title: "objekt.my | Cosmo objekt grid tracker & trade matcher",
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title: "objekt.my: Cosmo objekt grid tracker & trade matcher",
    description,
    url: "/",
    siteName: "objekt.my",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "objekt.my: Cosmo objekt grid tracker & trade matcher",
    description,
  },
};

// Tells Google the site's name, for the name it shows above results.
const WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "objekt.my",
  url: `${rootUrl()}/`,
};

// What the site is, then the loop it's built around as two steps for someone
// new: see what your grids are missing, then find who on Discord has it.
const copy: HomeCopy = {
  intro: {
    title: "Cosmo Tools for Collectors",
    body: "Grids, trades and more for tripleS, ARTMS and idntt.",
  },
  grids: {
    word: "Grids",
    title: "Find missing Objekts",
    body: "Check your collection and grid progress.",
    searchPlaceholder: "Cosmo nickname",
    searchButton: "See grids",
    linkPrompt: "Your own account?",
    link: { label: "Link your Cosmo", href: sectionHref("/link") },
  },
  match: {
    word: "Match",
    title: "Find trades on channels",
    body: "Smart search for Discord trade posts that have the objekts you need.",
    primary: { label: "Open matcher", href: sectionHref("/match") },
    secondary: { label: "Get the extension", href: sectionHref("/match") },
  },
};

const tools: HomeTool[] = [
  {
    id: "lists",
    label: "Lists",
    description: "Turn a tradelist into a shareable page.",
    href: sectionHref("/list"),
    icon: <ListChecksIcon />,
  },
  {
    id: "objektify",
    label: "Objektify",
    description: "Create custom objekt cards.",
    href: sectionHref("/objekt-maker"),
    icon: <BrushIcon />,
  },
  {
    id: "proofshot",
    label: "Proofshot",
    description: "Generate proofshot images.",
    href: sectionHref("/proofshot"),
    icon: <CameraIcon />,
  },
  {
    id: "spin",
    label: "Spin Simulator",
    description: "Try a Cosmo spin. Not a real draw.",
    href: sectionHref("/spin"),
    icon: <DicesIcon />,
  },
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static JSON-LD, escaped per the Next.js JSON-LD guide
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(WEBSITE_JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
      <HomeScreen copy={copy} tools={tools} />
    </>
  );
}
