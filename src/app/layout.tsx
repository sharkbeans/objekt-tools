import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DiscordBanner } from "@/components/discord-banner";
import { Navbar } from "@/components/navbar";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Objekt Trade",
  description: "Trade Cosmo Objekts with other collectors",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "https://objekt.my"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script defer src="https://cloud.umami.is/script.js" data-website-id="2efbd898-a793-436a-9078-e7e4b6abd77d"></script>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Navbar />
          <DiscordBanner />
          <main className="container mx-auto px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
