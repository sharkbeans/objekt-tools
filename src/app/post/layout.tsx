import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade Poster | Objekt Trade",
  description: "Turn your Cosmo trade list into a shareable poster image.",
};

export default function PostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
