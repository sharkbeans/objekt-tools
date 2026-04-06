import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@better-auth/drizzle-adapter"],
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
