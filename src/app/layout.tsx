import type { Metadata } from "next";
import { headers } from "next/headers";
import { DiscordBanner } from "@/components/discord-banner";
import { SiteDisclaimerFooter } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers";
import {
  type SectionId,
  sectionForHostname,
  subdomainsEnabled,
} from "@/lib/sections";
import "./globals.css";

export const metadata: Metadata = {
  title: "objekt.my",
  description: "Cosmo objekt tools for collectors",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://objekt.my"),
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Which section subdomain (if any) this request is being served from.
  // Only read the host when subdomains are enabled, so the disabled mode
  // keeps static rendering exactly as before.
  let currentSection: SectionId | null = null;
  if (subdomainsEnabled()) {
    const host = (await headers()).get("host") ?? "";
    const who = sectionForHostname(host);
    if (who !== null && who !== "root") currentSection = who;
  }

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="2efbd898-a793-436a-9078-e7e4b6abd77d"
        ></script>
      </head>
      <body className="antialiased flex flex-col h-dvh overflow-hidden">
        <Providers>
          <Navbar currentSection={currentSection} />
          <DiscordBanner currentSection={currentSection} />
          <main className="container mx-auto px-4 py-6 flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {children}
          </main>
          <SiteDisclaimerFooter currentSection={currentSection} />
        </Providers>
      </body>
    </html>
  );
}
