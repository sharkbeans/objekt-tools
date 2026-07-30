import type { NextConfig } from "next";

// Report-only for now: Next.js's own hydration payload and Tailwind/Radix
// both rely on inline script/style, and gif.js (proofshot GIF export) loads
// a worker from a blob URL, so a hard-enforced policy needs nonce plumbing
// this app doesn't have yet. This establishes a baseline and surfaces real
// violations (via browser devtools) before anything switches to enforcing.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cloud.umami.is https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.cosmo.fans https://imagedelivery.net",
  "font-src 'self' data:",
  "connect-src 'self' https://cloud.umami.is https://*.pusher.com wss://*.pusher.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@better-auth/drizzle-adapter"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        // objekt-maker embeds this legacy static tool in a same-origin
        // iframe (src/app/objekt-maker/page.tsx); DENY from the catch-all
        // above blocks that too, so relax to SAMEORIGIN just for this path.
        source: "/tools-static/objekt-maker/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/post",
        destination: "/list",
        permanent: false,
      },
      {
        source: "/post/:id/edit",
        destination: "/list/:id/edit",
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.cosmo.fans",
      },
      {
        protocol: "https",
        hostname: "imagedelivery.net",
      },
    ],
  },
};

export default nextConfig;
