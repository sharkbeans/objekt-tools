import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trade List | objekt.my",
  description:
    "Turn your Cosmo trade list into a shareable list and poster image.",
};

export default function ListLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
