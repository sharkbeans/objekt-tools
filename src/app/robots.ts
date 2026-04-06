import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://objekt.my";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/trades", "/trades/*"],
        disallow: [
          "/api/",
          "/notifications",
          "/active-trades",
          "/trades/mine",
          "/trades/new",
          "/trades/history",
          "/trades?*page=*",
          "/trades?*search=*",
          "/trades?*artist=*",
          "/trades?*member=*",
          "/trades?*season=*",
          "/trades?*class=*",
          "/trades?*on_offline=*",
          "/trades?*filter_mode=*",
          "/trades?*sort=*",
        ],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
    host: appUrl,
  };
}
