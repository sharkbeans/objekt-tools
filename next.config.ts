import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["@better-auth/drizzle-adapter"],
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
